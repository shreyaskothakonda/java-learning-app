/**
 * The concept-page gate: compiles and RUNS every example on every page.
 *
 * A concept page makes a claim about what Java does. This is what keeps the
 * claim true. Without it the pages drift into folklore the moment a JDK
 * changes a message or an author mistypes an output — and folklore in a
 * teaching app is worse than no page at all, because the learner believes it.
 *
 *   npx tsx scripts/validate-concepts.ts [--verbose]
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONCEPTS } from "../content/concepts/index.js";
import { outputMatches, validateConcepts } from "../content/concepts/validate.js";
import { runJavaSource } from "../src/main/services/java-runner.js";

const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";
const verbose = process.argv.includes("--verbose");

let failures = 0;

const report = validateConcepts(CONCEPTS);
for (const r of report.byConcept) {
  for (const e of r.errors) {
    failures++;
    console.log(`${RED}STATIC${RESET} ${e}`);
  }
}
for (const slug of report.duplicateSlugs) {
  failures++;
  console.log(`${RED}DUPLICATE SLUG${RESET} ${slug}`);
}

const workRoot = join(tmpdir(), "jt-concepts");
const t0 = Date.now();
let examples = 0;

for (const c of CONCEPTS) {
  for (const [i, ex] of c.examples.entries()) {
    examples++;
    const res = await runJavaSource(ex.code, { workRoot });
    const label = `${c.slug} example ${i} — ${ex.caption}`;

    if (!res.ok) {
      failures++;
      const why = res.timedOut
        ? "timed out"
        : res.diagnostics.length > 0
          ? res.diagnostics.map((d) => `line ${d.line}: ${d.message}`).join("; ")
          : res.stderr.split("\n")[0] || "did not run";
      console.log(`${RED}FAIL${RESET}  ${label}\n      ${why}`);
      continue;
    }

    if (!outputMatches(res.stdout, ex.expectedOutput)) {
      failures++;
      console.log(`${RED}DRIFT${RESET} ${label}`);
      console.log(`${DIM}      the page says:${RESET}`);
      for (const l of ex.expectedOutput.split("\n")) console.log(`        ${l}`);
      console.log(`${DIM}      it actually prints:${RESET}`);
      for (const l of res.stdout.replace(/\n+$/, "").split("\n")) console.log(`        ${l}`);
      continue;
    }

    if (verbose) {
      console.log(`${GREEN}ok${RESET}    ${label} ${DIM}${res.compileMs + res.runtimeMs}ms${RESET}`);
    }
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `\n${CONCEPTS.length} concepts, ${examples} examples, ${failures} failing, ${secs}s`,
);
process.exit(failures > 0 ? 1 : 0);
