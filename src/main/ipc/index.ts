import { ipcMain, app } from "electron";
import { join } from "node:path";
import type { SystemInfo } from "@shared/types/bridge.js";
import type {
  RunRequest,
  RunResult,
  SnippetRequest,
  SnippetResult,
} from "@shared/types/runner.js";
import { getProblem } from "../../../content/index.js";
import type {
  AiResult,
  ChatMessage,
  ChatRequest,
  ChatResult,
  ExplainRequest,
  HintRequest,
  ProviderStatus,
  ReviewRequest,
  ReviewResult,
} from "@shared/types/ai.js";
import { DEFAULT_SETTINGS, type Settings } from "@shared/types/settings.js";
import { AiService } from "../ai/service.js";
import { ProviderRegistry } from "../ai/registry.js";
import type {
  ProgressRow,
  RecordAttemptInput,
  Stats,
} from "@shared/types/progress.js";
import { dbPath, openDb, readSettings, sqliteVersion, writeSettings } from "../db/index.js";
import {
  clearDraft,
  getAllProgress,
  getDraft,
  getLastProblemId,
  getStats,
  recordAttempt,
  recordHintLevel,
  saveDraft,
} from "../db/queries.js";
import { findJdk } from "../services/jdk.js";
import { dataDir, runtimeDir, sandboxProfile } from "../paths.js";
import { runJavaSource, runProblem } from "../services/java-runner.js";

/** Channel names live here so preload and main cannot drift apart. */
export const CH = {
  systemInfo: "system:info",
  progressAll: "progress:all",
  progressRecord: "progress:record",
  progressHintLevel: "progress:hintLevel",
  progressStats: "progress:stats",
  progressLast: "progress:last",
  draftGet: "draft:get",
  draftSave: "draft:save",
  draftClear: "draft:clear",
  aiProviders: "ai:providers",
  aiHint: "ai:hint",
  aiExplain: "ai:explain",
  aiChat: "ai:chat",
  aiChatCancel: "ai:chat:cancel",
  aiChatHistory: "ai:chat:history",
  aiChatClear: "ai:chat:clear",
  aiReview: "ai:review",
  javaRun: "java:run",
  javaSnippet: "java:snippet",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
} as const;

function currentSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readSettings() } as Settings;
}

export function registerIpc(): void {
  const registry = new ProviderRegistry({ packaged: app.isPackaged });
  let defaultProvider: string | null = null;
  const ai = new AiService(registry, openDb, () => {
    const chosen = currentSettings().aiProvider;
    if (chosen !== null) return chosen;
    // Resolved once and remembered: probing every provider on each call would
    // add a round trip to a feature that is already the slowest thing here.
    return (defaultProvider ?? "none") as never;
  });
  void registry.defaultProvider().then((id) => (defaultProvider = id));

  ipcMain.handle(CH.systemInfo, async (): Promise<SystemInfo> => {
    const jdk = await findJdk();
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      dbPath: dbPath(),
      javaHome: jdk?.home ?? null,
      javaVersion: jdk?.version ?? null,
    };
  });

  ipcMain.handle(CH.progressAll, (): Record<string, ProgressRow> => getAllProgress(openDb()));

  ipcMain.handle(CH.progressRecord, (_e, input: RecordAttemptInput): ProgressRow =>
    recordAttempt(openDb(), input),
  );

  ipcMain.handle(CH.progressHintLevel, (_e, problemId: string, level: number): void => {
    recordHintLevel(openDb(), problemId, level);
  });

  ipcMain.handle(CH.progressStats, (): Stats => getStats(openDb()));

  ipcMain.handle(CH.progressLast, (): string | null => getLastProblemId(openDb()));

  ipcMain.handle(CH.draftGet, (_e, problemId: string): string | null =>
    getDraft(openDb(), problemId),
  );

  ipcMain.handle(CH.draftSave, (_e, problemId: string, code: string): void => {
    saveDraft(openDb(), problemId, code);
  });

  ipcMain.handle(CH.draftClear, (_e, problemId: string): void => {
    clearDraft(openDb(), problemId);
  });

  ipcMain.handle(CH.aiProviders, (): Promise<ProviderStatus[]> => ai.statuses());

  ipcMain.handle(CH.aiHint, (_e, req: HintRequest): Promise<AiResult> => ai.hint(req));

  ipcMain.handle(CH.aiExplain, (_e, req: ExplainRequest): Promise<AiResult> => ai.explain(req));

  // One controller per in-flight turn. A tutor reply takes ~10s, so "stop"
  // has to be a real button rather than a promise nobody is waiting on.
  const turns = new Map<string, AbortController>();

  ipcMain.handle(CH.aiChat, async (e, req: ChatRequest): Promise<ChatResult> => {
    // The chunk channel is named after a value the renderer supplied. It is
    // our own renderer, but a channel name built from unvalidated input is
    // the kind of thing that stops being harmless later.
    if (!/^[a-f0-9-]{8,64}$/i.test(req.turnId)) throw new Error("bad turn id");
    const channel = `${CH.aiChat}:chunk:${req.turnId}`;

    const controller = new AbortController();
    turns.set(req.turnId, controller);
    try {
      return await ai.chat(
        req,
        (chunk) => {
          // The window can close mid-turn; sending to a destroyed sender throws.
          if (!e.sender.isDestroyed()) e.sender.send(channel, chunk);
        },
        controller.signal,
      );
    } finally {
      turns.delete(req.turnId);
    }
  });

  ipcMain.handle(CH.aiChatCancel, (_e, turnId: string): void => {
    turns.get(turnId)?.abort();
  });

  ipcMain.handle(CH.aiChatHistory, (_e, problemId: string): ChatMessage[] =>
    ai.history(problemId),
  );

  ipcMain.handle(CH.aiChatClear, (_e, problemId: string): void => {
    ai.clearHistory(problemId);
  });

  ipcMain.handle(CH.aiReview, (_e, req: ReviewRequest): Promise<ReviewResult> => ai.review(req));

  ipcMain.handle(CH.settingsGet, (): Settings => currentSettings());

  ipcMain.handle(CH.settingsSet, (_e, patch: Partial<Settings>): Settings => {
    writeSettings(patch as Record<string, unknown>);
    return currentSettings();
  });

  ipcMain.handle(CH.javaSnippet, async (_e, req: SnippetRequest): Promise<SnippetResult> => {
    // The concept examples are bundled content, but this handler takes
    // whatever the renderer sends — exactly as `java:run` already does for
    // the editor. It is the same trust boundary and the same machine.
    return runJavaSource(req.code, {
      workRoot: join(app.getPath("userData"), "runs"),
      ...(req.className !== undefined ? { className: req.className } : {}),
      ...(sandboxProfile() !== undefined ? { sandboxProfile: sandboxProfile()! } : {}),
    });
  });

  ipcMain.handle(CH.javaRun, async (_e, req: RunRequest): Promise<RunResult> => {
    const problem = getProblem(req.problemId);
    if (!problem) throw new Error(`unknown problem: ${req.problemId}`);
    return runProblem(problem, req.userCode, {
      // Run scratch lives under userData, not the system temp dir, so a
      // failed run can be inspected in a place the user can actually find.
      workRoot: join(app.getPath("userData"), "runs"),
      visibleOnly: req.visibleOnly,
      runtimeDir: runtimeDir(),
      dataDir: dataDir(),
      ...(sandboxProfile() !== undefined ? { sandboxProfile: sandboxProfile()! } : {}),
    });
  });
}
