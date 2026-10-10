/**
 * The corpus gate: compiles and RUNS every reference solution.
 *
 * `npm run validate` is static only. This is the expensive one that actually
 * proves each authored solution passes its own cases — the port of the JS
 * platform's solutions.test.ts, which the plan calls the most valuable idea in
 * that repo.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL } from "../content/index.js";
import { runProblem } from "../src/main/services/java-runner.js";
import { validateAll } from "../content/validate.js";

const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const report = validateAll(ALL);
let failures = 0;

for (const r of report.byProblem) {
  if (r.errors.length > 0) {
    failures++;
    console.log(`${RED}STATIC${RESET} ${r.id}`);
    for (const e of r.errors) console.log(`       ${e}`);
  }
}
for (const id of report.duplicateIds) {
  failures++;
  console.log(`${RED}DUPLICATE ID${RESET} ${id}`);
}

const t0 = Date.now();
for (const p of ALL) {
  const res = await runProblem(p, p.solution, {
    workRoot: join(tmpdir(), "jt-validate-all"),
    visibleOnly: false,
    runtimeDir: join(process.cwd(), "runtime", "java"),
  });
  const ok = res.phase === "ok" && res.caseResults.every((c) => c.passed);
  if (ok) {
    console.log(`${GREEN}ok${RESET}    ${p.id} ${DIM}${res.caseResults.length} cases, ${res.compileMs}ms${RESET}`);
  } else {
    failures++;
    console.log(`${RED}FAIL${RESET}  ${p.id}`);
    if (res.phase === "compile") {
      for (const d of res.diagnostics) console.log(`       ${d.file}:${d.line}:${d.column} ${d.message}`);
    }
    for (const c of res.caseResults.filter((x) => !x.passed)) {
      console.log(`       case ${c.index}: expected ${c.expected} got ${c.actual ?? c.error}`);
    }
  }
}

console.log(`\n${ALL.length} problems, ${failures} failing, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failures === 0 ? 0 : 1);
