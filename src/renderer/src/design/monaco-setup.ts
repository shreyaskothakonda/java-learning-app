/**
 * Monaco, wired to the local package and themed from the design tokens.
 *
 * Two things that are easy to get wrong in an Electron app:
 *
 *  1. `@monaco-editor/react` loads Monaco from a CDN by default. That breaks
 *     the renderer's CSP and, more importantly, means the editor does not work
 *     offline — unacceptable for a local-first app. `loader.config({ monaco })`
 *     points it at the bundled copy.
 *  2. Monaco needs a web worker. Java has no language worker of its own (only
 *     ts/json/css/html ship one), so the generic editor worker is the whole
 *     requirement — but without it Monaco silently falls back to running on
 *     the main thread and typing gets choppy in a long file.
 */

// `monaco-editor` as a bare import pulls in every language it supports — ~8.5MB
// of Abap, Solidity and PowerQuery this app will never open. The editor API
// plus one language contribution is the same editor at a fraction of the size.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/java/register.js";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

loader.config({ monaco });

export const JAVELIN_THEME = "javelin";

/**
 * The prototype hand-tokenised its mock code, and the palette it chose is part
 * of the design rather than incidental: keywords are BOLD INK (not a colour),
 * types take the accent highlight, and literals take the lighter tint. It
 * reads as a printed listing rather than a rainbow, which is the whole point
 * of a Modernist system.
 */
monaco.editor.defineTheme(JAVELIN_THEME, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "f3f2f2" },
    { token: "keyword", foreground: "f3f2f2", fontStyle: "bold" },
    { token: "keyword.control", foreground: "f3f2f2", fontStyle: "bold" },
    { token: "type", foreground: "ff9783" },
    { token: "type.identifier", foreground: "ff9783" },
    { token: "identifier", foreground: "f3f2f2d9" },
    { token: "string", foreground: "ffc4b8" },
    { token: "string.escape", foreground: "ffc4b8" },
    { token: "number", foreground: "ffc4b8" },
    { token: "comment", foreground: "f3f2f266", fontStyle: "italic" },
    { token: "annotation", foreground: "ff9783" },
    { token: "delimiter", foreground: "f3f2f299" },
    { token: "operator", foreground: "f3f2f299" },
  ],
  colors: {
    "editor.background": "#161514",
    "editor.foreground": "#f3f2f2",
    "editorLineNumber.foreground": "#f3f2f24d",
    "editorLineNumber.activeForeground": "#ff9783",
    "editor.lineHighlightBackground": "#f3f2f20a",
    "editor.selectionBackground": "#ec301359",
    "editor.inactiveSelectionBackground": "#ec301326",
    "editorCursor.foreground": "#ec3013",
    "editorWhitespace.foreground": "#f3f2f21a",
    "editorIndentGuide.background1": "#f3f2f214",
    "editorIndentGuide.activeBackground1": "#f3f2f233",
    "editorError.foreground": "#ec3013",
    "editorWarning.foreground": "#febc2e",
    "editorGutter.background": "#161514",
    "editorWidget.background": "#201e1d",
    "editorWidget.border": "#f3f2f252",
    "editorSuggestWidget.background": "#201e1d",
    "editorHoverWidget.background": "#201e1d",
    "editorHoverWidget.border": "#f3f2f252",
    "scrollbarSlider.background": "#f3f2f229",
    "scrollbarSlider.hoverBackground": "#f3f2f240",
    "scrollbarSlider.activeBackground": "#f3f2f259",
  },
});

/** Zero radius, no minimap, no ligature noise — the system's editor defaults. */
export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderLineHighlight: "line",
  lineNumbersMinChars: 4,
  glyphMargin: false,
  folding: false,
  padding: { top: 16, bottom: 16 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  tabSize: 4,
  insertSpaces: true,
  roundedSelection: false,
  cursorBlinking: "smooth",
  smoothScrolling: true,
  contextmenu: false,
  // A learner does not benefit from Java autocomplete that has no language
  // server behind it — it would only ever suggest words already in the file.
  quickSuggestions: false,
  wordBasedSuggestions: "off",
};

export { monaco };
