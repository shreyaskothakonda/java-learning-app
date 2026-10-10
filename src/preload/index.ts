import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "@shared/types/bridge.js";
import type { ChatChunk } from "@shared/types/ai.js";

// Must match src/main/ipc/index.ts. Kept as literals because the preload
// bundle is separate from main and cannot import its runtime values.
const CH = {
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

const api: DesktopApi = {
  java: {
    run: (req) => ipcRenderer.invoke(CH.javaRun, req),
    runSnippet: (req) => ipcRenderer.invoke(CH.javaSnippet, req),
  },
  system: {
    info: () => ipcRenderer.invoke(CH.systemInfo),
  },
  progress: {
    all: () => ipcRenderer.invoke(CH.progressAll),
    record: (input) => ipcRenderer.invoke(CH.progressRecord, input),
    hintLevel: (problemId, level) => ipcRenderer.invoke(CH.progressHintLevel, problemId, level),
    stats: () => ipcRenderer.invoke(CH.progressStats),
    lastProblemId: () => ipcRenderer.invoke(CH.progressLast),
  },
  drafts: {
    get: (problemId) => ipcRenderer.invoke(CH.draftGet, problemId),
    save: (problemId, code) => ipcRenderer.invoke(CH.draftSave, problemId, code),
    clear: (problemId) => ipcRenderer.invoke(CH.draftClear, problemId),
  },
  ai: {
    providers: () => ipcRenderer.invoke(CH.aiProviders),
    hint: (req) => ipcRenderer.invoke(CH.aiHint, req),
    explain: (req) => ipcRenderer.invoke(CH.aiExplain, req),
    // The one streaming path. A listener is attached for the turn's own
    // channel and removed when the turn settles — a shared channel would need
    // every chunk tagged with an id and filtered, and one missed removal would
    // leak another conversation's text into this one.
    chat: (req, onChunk) => {
      const channel = `${CH.aiChat}:chunk:${req.turnId}`;
      const listener = (_e: unknown, chunk: ChatChunk): void => onChunk(chunk);
      ipcRenderer.on(channel, listener);
      return ipcRenderer
        .invoke(CH.aiChat, req)
        .finally(() => ipcRenderer.removeListener(channel, listener));
    },
    cancelChat: (turnId) => ipcRenderer.invoke(CH.aiChatCancel, turnId),
    chatHistory: (problemId) => ipcRenderer.invoke(CH.aiChatHistory, problemId),
    clearChat: (problemId) => ipcRenderer.invoke(CH.aiChatClear, problemId),
    review: (req) => ipcRenderer.invoke(CH.aiReview, req),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
  },
};

contextBridge.exposeInMainWorld("api", api);
