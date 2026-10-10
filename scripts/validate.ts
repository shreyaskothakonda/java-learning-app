/**
 * Static validation of the whole corpus. Run with `npm run validate`.
 *
 * This is the cheap gate. Phase 6 adds `validate:all`, which additionally
 * compiles and runs every reference solution against its own cases.
 */

import { ALL } from "../content/index.js";
import { validateAll } from "../content/validate.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const report = validateAll(ALL);

for (const id of report.duplicateIds) {
  console.error(`${RED}duplicate problem id: ${id}${RESET}`);
}

let failed = 0;
for (const r of report.byProblem) {
  if (r.errors.length === 0) {
    console.log(`${GREEN}ok${RESET}   ${r.id} ${DIM}${r.title}${RESET}`);
    continue;
  }
  failed++;
  console.log(`${RED}FAIL${RESET} ${r.id} ${DIM}${r.title}${RESET}`);
  for (const e of r.errors) console.log(`       ${RED}${e}${RESET}`);
}

const kinds = ALL.reduce<Record<string, number>>((acc, p) => {
  acc[p.kind] = (acc[p.kind] ?? 0) + 1;
  return acc;
}, {});

console.log(
  `\n${ALL.length} problems (${Object.entries(kinds)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ")}), ${failed} failing`,
);

process.exit(report.ok ? 0 : 1);
