/**
 * The one function standing between the hint feature and the answer.
 *
 * Two things must never reach a hint prompt:
 *
 *  1. `solution`. A model asked to withhold something it can see will
 *     eventually paraphrase it. It cannot leak what it never received, and
 *     that is 80% of the enforcement — for free, and unlike prompt wording it
 *     cannot be argued around.
 *  2. Hidden test cases. If hint context carries them, hints quote them, and
 *     the visible/hidden split becomes decorative. The entire reason hidden
 *     cases exist is that they cannot be hardcoded against.
 *
 * Every feature that talks to a model builds its context through here. Code
 * review is the single exception, and takes an explicit opt-in, because by
 * then the learner has already passed.
 */

import type { Problem } from "@content/types.js";

/** A problem with everything a hint must not see removed. */
export type RedactedProblem = {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  kind: string;
  prompt: string;
  /** Visible cases only. */
  examples: { input: string; output: string }[];
  signature?: string;
  pitfalls?: string[];
  complexity?: { time: string; space: string };
};

function signatureOf(p: Problem): string | undefined {
  if (p.kind === "method") {
    const params = p.signature.params.map((x) => `${x.type} ${x.name}`).join(", ");
    return `${p.signature.returns} ${p.signature.method}(${params})`;
  }
  if (p.kind === "class") {
    return `class ${p.classSpec.className}`;
  }
  return undefined;
}

export function redactProblem(p: Problem): RedactedProblem {
  const examples = (p.examples ?? []).map((e) => ({ input: e.input, output: e.output }));

  return {
    id: p.id,
    title: p.title,
    topic: p.topic,
    difficulty: p.difficulty,
    kind: p.kind,
    prompt: p.prompt,
    examples,
    ...(signatureOf(p) !== undefined ? { signature: signatureOf(p)! } : {}),
    ...(p.pitfalls ? { pitfalls: p.pitfalls } : {}),
    ...(p.complexity ? { complexity: p.complexity } : {}),
  };
}

/**
 * Renders one visible failing case for a hint.
 *
 * Returns null for a hidden case rather than redacting its contents, because
 * a hint that says "your code fails a case I cannot describe" is worse than
 * one that does not mention the failure at all.
 */
export function visibleFailingCase(
  p: Problem,
  caseResults: { index: number; passed: boolean; hidden: boolean; input?: string; expected?: string; actual?: string; error?: string }[],
): string | null {
  const first = caseResults.find((c) => !c.passed && !c.hidden);
  if (!first) return null;
  const parts: string[] = [];
  if (first.input) parts.push(`input: ${first.input}`);
  if (first.expected) parts.push(`expected: ${first.expected}`);
  if (first.actual) parts.push(`got: ${first.actual}`);
  if (first.error) parts.push(`error: ${first.error.split("\n")[0]}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Serialises redacted context for a prompt. */
export function renderContext(r: RedactedProblem): string {
  const lines = [
    `Problem: ${r.title} (${r.topic}, ${r.difficulty})`,
    r.signature ? `Signature: ${r.signature}` : "",
    "",
    r.prompt,
  ];
  if (r.examples.length > 0) {
    lines.push("", "Examples:");
    for (const e of r.examples) lines.push(`  ${e.input} -> ${e.output}`);
  }
  return lines.filter((l) => l !== undefined).join("\n").trim();
}
