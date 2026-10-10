/**
 * The complete privileged surface exposed to the renderer.
 *
 * The renderer imports NOTHING from electron and talks only through this
 * interface. That is what keeps a future hosted build possible: swap the
 * preload implementation for `fetch` wrappers and the UI is unchanged.
 *
 * Phase 0 implements `system` and `db.ping` only. Later phases widen this
 * interface rather than replacing it.
 */

export type SystemInfo = {
  appVersion: string;
  electron: string;
  node: string;
  chrome: string;
  /** Absolute path to the SQLite file, for support/debugging. */
  dbPath: string;
  /** Resolved JDK home, or null when no JDK is installed. */
  javaHome: string | null;
  /** e.g. "26.0.2" — null when no JDK is installed. */
  javaVersion: string | null;
};

import type { RunRequest, RunResult, SnippetRequest, SnippetResult } from "./runner.js";
import type { Settings } from "./settings.js";
import type {
  ProgressRow,
  RecordAttemptInput,
  Stats,
} from "./progress.js";
import type {
  AiResult,
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResult,
  ExplainRequest,
  HintRequest,
  ProviderStatus,
  ReviewRequest,
  ReviewResult,
} from "./ai.js";

export interface DesktopApi {
  java: {
    /** Compiles and runs the learner's code against the problem's cases. */
    run(req: RunRequest): Promise<RunResult>;
    /** Compiles and runs one standalone file. Used by the concept examples. */
    runSnippet(req: SnippetRequest): Promise<SnippetResult>;
  };
  system: {
    info(): Promise<SystemInfo>;
  };
  progress: {
    /** Every problem the learner has touched, keyed by problem id. */
    all(): Promise<Record<string, ProgressRow>>;
    record(input: RecordAttemptInput): Promise<ProgressRow>;
    /** Persists the deepest hint reached, even with no run after it. */
    hintLevel(problemId: string, level: number): Promise<void>;
    stats(): Promise<Stats>;
    /** The problem to offer on Home. Null on a first launch. */
    lastProblemId(): Promise<string | null>;
  };
  drafts: {
    get(problemId: string): Promise<string | null>;
    save(problemId: string, code: string): Promise<void>;
    clear(problemId: string): Promise<void>;
  };
  ai: {
    /** Provider availability. Cheap — never makes a paid call. */
    providers(): Promise<ProviderStatus[]>;
    /** A hint for one rung. Returns empty text with `rejected` set on failure. */
    hint(req: HintRequest): Promise<AiResult>;
    /** Plain-English explanation of a compiler error. */
    explain(req: ExplainRequest): Promise<AiResult>;
    /**
     * One tutor turn. `onChunk` fires as text arrives; the promise resolves
     * when the turn is complete and has passed the post-filter. The callback
     * crosses the context bridge, which is why the chunk type is a plain
     * tagged union of strings and numbers and nothing else.
     */
    chat(req: ChatRequest, onChunk: (c: ChatChunk) => void): Promise<ChatResult>;
    /** Stops an in-flight turn. Safe to call for a turn that already ended. */
    cancelChat(turnId: string): Promise<void>;
    /** The transcript for one problem, oldest first. */
    chatHistory(problemId: string): Promise<ChatMessage[]>;
    clearChat(problemId: string): Promise<void>;
    /**
     * A review of a solved problem. Refused by the main process unless the
     * problem is actually solved — the button being visible is not the gate.
     */
    review(req: ReviewRequest): Promise<ReviewResult>;
  };
  settings: {
    get(): Promise<Settings>;
    /** Merges a partial patch and returns the settings as they now stand. */
    set(patch: Partial<Settings>): Promise<Settings>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
