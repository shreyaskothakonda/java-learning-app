/**
 * The runner's wire types, imported by both the main process and the renderer.
 *
 * Shape is deliberately close to the JS platform's existing RunResult so the
 * results UI ports across, with two additions Java forces: a `phase` (there is
 * now a compile step that can fail before anything runs) and `diagnostics`
 * (which become Monaco markers).
 */

export type RunPhase = "compile" | "run" | "ok";

export type Diagnostic = {
  severity: "error" | "warning";
  /** The file as javac named it, e.g. "Solution.java". */
  file: string;
  /** 1-based, matching the learner's editor. */
  line: number;
  /**
   * 1-based CHARACTER column, not javac's tab-expanded column.
   *
   * javac expands tabs to 8-column stops when it reports a column, so on a
   * tab-indented line its number is wrong for Monaco, which counts characters.
   * The value here is derived from the caret line and is directly usable.
   */
  column: number;
  /** Normalised message shape, for caching AI explanations by error kind. */
  code: string;
  message: string;
  /** javac's extra "symbol:" / "location:" lines, when present. */
  detail?: string;
};

export type CaseResult = {
  index: number;
  passed: boolean;
  hidden: boolean;
  description?: string;
  /** Pre-rendered by Judge.java — the TypeScript side never compares values. */
  actual?: string;
  expected?: string;
  /** What the case was given, rendered for display. */
  input?: string;
  /** Trimmed exception from the learner's own frames. */
  error?: string;
  durationMs: number;
  timedOut?: boolean;
};

export type RunResult = {
  phase: RunPhase;
  diagnostics: Diagnostic[];
  caseResults: CaseResult[];
  consoleLogs: string[];
  /** A failure that is not attributable to one case. */
  error?: string;
  compileMs: number;
  runtimeMs: number;
};

export type RunRequest = {
  runId: string;
  problemId: string;
  userCode: string;
  /** Run mode skips hidden cases; submit runs everything. */
  visibleOnly: boolean;
};

/**
 * A standalone snippet run — the concept pages' editable examples.
 *
 * Separate from `RunRequest` because there is no problem, no test case and
 * nothing to judge: it compiles one file and reports what it printed. Folding
 * it into the problem runner would mean inventing a problem for every example.
 */
export type SnippetRequest = {
  code: string;
  /** Must match the public class in `code`. Defaults to Main. */
  className?: string;
};

export type SnippetResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
  compileMs: number;
  runtimeMs: number;
  timedOut: boolean;
};
