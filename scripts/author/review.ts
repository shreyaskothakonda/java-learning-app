/**
 * Prints generated problems for the human review pass.
 *
 * No automated gate catches the failure that matters most: a prompt that can be
 * read two ways. The gates prove the solution is right for the cases; only a
 * person can tell whether the question is the one the author meant to ask.
 *
 * The plan's rule when something reads badly: fix the SPEC and regenerate, not
 * the individual problem. Fixing one problem fixes one problem.
 *
 *   npx tsx scripts/author/review.ts content/problems/generated-hashing.ts
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { Problem } from "../../content/types.js";

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const file = positionals[0];
if (!file) {
  console.error("usage: review.ts <generated-file.ts>");
  process.exit(2);
}

const B = "\x1b[1m", DIM = "\x1b[2m", ACC = "\x1b[38;5;203m", RESET = "\x1b[0m";
const mod = (await import(resolve(file))) as { GENERATED?: Problem[] };
const problems = mod.GENERATED ?? [];

console.log(`${problems.length} problems to read\n`);

problems.forEach((p, i) => {
  console.log(`${ACC}${"─".repeat(76)}${RESET}`);
  console.log(`${B}${i + 1}. ${p.title}${RESET}  ${DIM}${p.difficulty} · ${p.topic} · ${p.kind}${RESET}`);
  console.log(`${DIM}id: ${p.id}${RESET}\n`);

  console.log(`${B}PROMPT${RESET}  ${DIM}— can this be read two ways?${RESET}`);
  console.log(p.prompt.split("\n").map((l) => "  " + l).join("\n"));

  if (p.kind === "method") {
    const sig = `${p.signature.returns} ${p.signature.method}(${p.signature.params.map((x) => `${x.type} ${x.name}`).join(", ")})`;
    console.log(`\n${B}SIGNATURE${RESET}\n  ${sig}`);
  }

  if (p.examples?.length) {
    console.log(`\n${B}EXAMPLES${RESET}`);
    for (const e of p.examples) console.log(`  ${e.input}  ->  ${e.output}${e.note ? `  ${DIM}(${e.note})${RESET}` : ""}`);
  }

  console.log(`\n${B}CASES${RESET}  ${DIM}${p.testCases.length} total, ${p.testCases.filter((c) => c.hidden).length} hidden — do the hidden ones probe real edges?${RESET}`);
  p.testCases.forEach((c, j) => {
    const shape =
      p.kind === "method"
        ? `${JSON.stringify((c as { input: unknown[] }).input)} -> ${JSON.stringify((c as { expected: unknown }).expected)}`
        : JSON.stringify(c).slice(0, 90);
    console.log(`  ${c.hidden ? DIM + "hidden" + RESET : "      "} ${j}: ${shape}${c.description ? `  ${DIM}${c.description}${RESET}` : ""}`);
  });

  console.log(`\n${B}HINT LADDER${RESET}  ${DIM}— does each rung give away only its own step?${RESET}`);
  p.hints.forEach((h, l) => console.log(`  ${DIM}L${l + 1}${RESET} ${h}`));

  if (p.pitfalls?.length) {
    console.log(`\n${B}PITFALLS${RESET}`);
    for (const pf of p.pitfalls) console.log(`  · ${pf}`);
  }
  console.log();
});

console.log(`${ACC}${"─".repeat(76)}${RESET}`);
console.log("If a prompt is ambiguous, fix content/specs/*.ts and regenerate.");
