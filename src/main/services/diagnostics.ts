/**
 * Parses javac's human-readable diagnostics.
 *
 * The plan called for `-XDrawDiagnostics`, which yields a stable error code
 * like `compiler.err.cant.resolve.location`. Measuring it changed the choice:
 *
 *  1. Its column is TAB-EXPANDED. javac advances to 8-column tab stops, so a
 *     line indented with two tabs reports column 25 where the character column
 *     is 11. Monaco counts characters, so every marker on tab-indented Java —
 *     which is most Java — would land in the wrong place.
 *  2. Its message is untranslated: `compiler.err.expected: ';'` is not
 *     something to show a learner, and turning codes back into sentences means
 *     reimplementing javac's message bundle and re-checking it every JDK.
 *
 * The human format has neither problem. Its caret line preserves the original
 * indentation, so the caret's character index IS the character column, and it
 * carries the `symbol:` / `location:` detail lines that are genuinely useful to
 * a beginner. The stable code the cache wants is recovered by normalising the
 * message, which is enough to key "the same kind of error" on.
 */

import type { Diagnostic } from "@shared/types/runner.js";

const HEADER = /^(?<file>[^\s:][^:]*\.java):(?<line>\d+):\s*(?<severity>error|warning):\s*(?<message>.*)$/;
const SUMMARY = /^\d+\s+(errors?|warnings?)$/;

/**
 * Reduces a message to its error kind, so "cannot find symbol" for two
 * different identifiers produces the same key.
 */
export function normaliseCode(message: string): string {
  return message
    .toLowerCase()
    .replace(/'[^']*'/g, "?")
    .replace(/"[^"]*"/g, "?")
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z0-9_$.]+\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * javac echoes the source line verbatim, then a caret line built from the same
 * leading whitespace. The caret's index in characters is therefore the column
 * the editor wants — no tab arithmetic required.
 */
function columnFromCaret(caretLine: string | undefined): number {
  if (caretLine === undefined) return 1;
  const idx = caretLine.indexOf("^");
  return idx < 0 ? 1 : idx + 1;
}

export function parseJavacOutput(stderr: string): Diagnostic[] {
  const lines = stderr.split("\n");
  const out: Diagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = HEADER.exec(lines[i]!);
    if (!m?.groups) continue;

    // The two lines after a header are normally the echoed source and the
    // caret, but javac omits them for some diagnostics — hence the guard.
    const caretIdx = i + 2;
    const caretLine = lines[caretIdx];
    const hasCaret = caretLine !== undefined && /^\s*\^\s*$/.test(caretLine);

    // Trailing "symbol:" / "location:" lines belong to this diagnostic.
    const detail: string[] = [];
    let j = hasCaret ? caretIdx + 1 : i + 1;
    while (j < lines.length && /^\s{2,}\S/.test(lines[j]!) && !HEADER.test(lines[j]!)) {
      detail.push(lines[j]!.trim());
      j++;
    }

    const message = m.groups["message"]!.trim();
    out.push({
      severity: m.groups["severity"] as "error" | "warning",
      file: m.groups["file"]!,
      line: Number(m.groups["line"]),
      column: hasCaret ? columnFromCaret(caretLine) : 1,
      code: normaliseCode(message),
      message,
      ...(detail.length > 0 ? { detail: detail.join("\n") } : {}),
    });

    i = hasCaret ? caretIdx : i;
  }
  return out;
}

/** Anything javac printed that was not a diagnostic — kept so nothing is lost. */
export function residualOutput(stderr: string, diagnostics: Diagnostic[]): string {
  if (diagnostics.length > 0) return "";
  return stderr
    .split("\n")
    .filter((l) => l.trim() !== "" && !SUMMARY.test(l.trim()))
    .join("\n");
}
