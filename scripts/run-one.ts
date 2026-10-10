/**
 * Drives the Java runner from the command line, with no Electron involved.
 *
 *   npx tsx scripts/run-one.ts <problem-id> [--file path] [--solution] [--submit]
 *
 * `--solution` runs the problem's own reference solution, which is the quickest
 * way to see a green run. `--file` runs whatever you point it at.
 */

import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { getProblem } from "../content/index.js";
import { runProblem } from "../src/main/services/java-runner.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    solution: { type: "boolean", default: false },
    submit: { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
  },
});

const id = positionals[0];
if (id === undefined) {
  console.error("usage: run-one.ts <problem-id> [--file path | --solution] [--submit] [--keep]");
  process.exit(2);
}

const problem = getProblem(id);
if (!problem) {
  console.error(`no problem with id ${JSON.stringify(id)}`);
  process.exit(2);
}

const code = values.solution
  ? problem.solution
  : values.file !== undefined
    ? await readFile(values.file, "utf8")
    : problem.starterCode;

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const result = await runProblem(problem, code, {
  workRoot: join(tmpdir(), "java-tutor-runs"),
  visibleOnly: !values.submit,
  keepOnFailure: values.keep,
});

console.log(`${DIM}${problem.title} — phase: ${result.phase}, compile ${result.compileMs}ms, run ${result.runtimeMs}ms${RESET}\n`);

if (result.phase === "compile") {
  for (const d of result.diagnostics) {
    const colour = d.severity === "error" ? RED : YELLOW;
    console.log(`${colour}${d.file}:${d.line}:${d.column} ${d.severity}${RESET} ${d.message}`);
    if (d.detail) console.log(`${DIM}${d.detail.replace(/^/gm, "    ")}${RESET}`);
    console.log(`${DIM}    code: ${d.code}${RESET}`);
  }
}

if (result.consoleLogs.length > 0) {
  console.log(`${DIM}--- console ---${RESET}`);
  for (const l of result.consoleLogs) console.log(`${DIM}${l}${RESET}`);
  console.log();
}

for (const c of result.caseResults) {
  const mark = c.passed ? `${GREEN}pass${RESET}` : `${RED}FAIL${RESET}`;
  const hidden = c.hidden ? `${DIM} (hidden)${RESET}` : "";
  console.log(`${mark} case ${c.index}${hidden} ${DIM}${c.durationMs.toFixed(3)}ms${RESET}`);
  if (c.description) console.log(`     ${DIM}${c.description}${RESET}`);
  if (!c.passed) {
    if (c.input !== undefined) console.log(`     input:    ${c.input}`);
    if (c.expected !== undefined) console.log(`     expected: ${c.expected}`);
    if (c.actual !== undefined) console.log(`     actual:   ${c.actual}`);
    if (c.error) console.log(`     ${RED}${c.error.replace(/\n/g, "\n     ")}${RESET}`);
  }
}

if (result.error) console.log(`\n${RED}${result.error}${RESET}`);

const passed = result.caseResults.filter((c) => c.passed).length;
const total = result.caseResults.length;
console.log(
  `\n${passed === total && result.phase === "ok" ? GREEN : RED}${passed}/${total} cases passed${RESET}`,
);

process.exit(result.phase === "ok" && passed === total ? 0 : 1);
