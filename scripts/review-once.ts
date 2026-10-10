/**
 * One real review, end to end, outside Electron.
 *
 * The unit tests drive the parser with replies I imagined a model might send.
 * This runs a live one and prints both the raw text and the parsed result, so
 * the gap between the two is visible rather than assumed — that gap is the
 * whole reason review.ts exists.
 *
 *   npx tsx scripts/review-once.ts [problemId] [--naive]
 */

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getProblem } from "../content/index.js";
import { AiService } from "../src/main/ai/service.js";
import { ProviderRegistry } from "../src/main/ai/registry.js";
import { migrate } from "../src/main/db/migrations.js";
import { recordAttempt } from "../src/main/db/queries.js";

/**
 * A correct but deliberately unidiomatic solution, so the review has something
 * real to say. Reviewing the reference solution would only prove the model can
 * agree with it.
 */
const NAIVE_TWO_SUM = `import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i + 1; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) {
                    int[] answer = new int[2];
                    answer[0] = i;
                    answer[1] = j;
                    return answer;
                }
            }
        }
        return new int[]{-1, -1};
    }
}`;

const problemId = process.argv[2]?.startsWith("--") ? "dsa-hashing-two-sum" : (process.argv[2] ?? "dsa-hashing-two-sum");
const problem = getProblem(problemId);
if (!problem) {
  console.error(`unknown problem: ${problemId}`);
  process.exit(1);
}
const userCode =
  process.argv.includes("--naive") && problemId === "dsa-hashing-two-sum"
    ? NAIVE_TWO_SUM
    : problem.solution;

const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), "jt-review-")), "review.db"));
migrate(db);

// A review is refused unless the problem is solved, and solved means a passing
// SUBMIT. Recording one here is not a shortcut around the gate — it is the
// only way through it, which is the point.
recordAttempt(db, {
  problemId: problem.id,
  code: userCode,
  status: "passed",
  submitted: true,
  testsPassed: 1,
  testsTotal: 1,
  compileMs: 400,
  runtimeMs: 9,
  hintLevel: 0,
});

const registry = new ProviderRegistry({ packaged: false });
const id = await registry.defaultProvider();
const ai = new AiService(registry, () => db, () => id);

console.log(`provider: ${id}\nproblem:  ${problem.id}\ncode:     ${userCode === problem.solution ? "the reference solution" : "a deliberately naive version"}\n`);

const res = await ai.review({ problemId: problem.id, userCode });
if (res.review === null) {
  console.log(`no review — ${res.rejected}`);
  process.exit(1);
}

const r = res.review;
console.log(`${r.verdict}\n`);
console.log(`complexity: ${r.complexity.time} time, ${r.complexity.space} space`);
if (r.complexity.note) console.log(`            ${r.complexity.note}`);
console.log(`reference:  ${problem.complexity?.time ?? "?"} time, ${problem.complexity?.space ?? "?"} space\n`);
for (const [label, items] of [
  ["strengths", r.strengths],
  ["improvements", r.improvements.map((i) => `${i.what} — ${i.why}`)],
  ["idiom", r.idiom],
] as [string, string[]][]) {
  if (items.length === 0) continue;
  console.log(`${label}:`);
  for (const s of items) console.log(`  · ${s}`);
}
console.log(`\n${res.ms}ms${res.cached ? " (cached)" : ""}`);
db.close();
