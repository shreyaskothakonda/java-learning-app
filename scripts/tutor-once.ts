/**
 * One real tutor turn, end to end, outside Electron.
 *
 * The unit tests drive the service with a stub provider, which proves the
 * wiring but not that a live provider streams through it. This runs the real
 * registry against the real SQLite schema and prints the timing of every
 * chunk, so "it streams" is something observed rather than assumed.
 *
 *   npx tsx scripts/tutor-once.ts [problemId] ["your question"]
 */

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ALL, getProblem } from "../content/index.js";
import { AiService } from "../src/main/ai/service.js";
import { ProviderRegistry } from "../src/main/ai/registry.js";
import { migrate } from "../src/main/db/migrations.js";
import { getChat } from "../src/main/db/queries.js";

const problemId = process.argv[2] ?? ALL[0]!.id;
const question =
  process.argv[3] ??
  "What is actually different between an int and an Integer, and does it matter in what I have written?";

const problem = getProblem(problemId);
if (!problem) {
  console.error(`unknown problem: ${problemId}`);
  process.exit(1);
}

const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), "jt-tutor-")), "tutor.db"));
migrate(db);

const registry = new ProviderRegistry({ packaged: false });
const id = await registry.defaultProvider();
console.log(`provider: ${id}\nproblem:  ${problem.id}\nasking:   ${question}\n`);

const ai = new AiService(registry, () => db, () => id);

const t0 = Date.now();
let chunks = 0;
let line = "";
const res = await ai.chat(
  { turnId: crypto.randomUUID(), problemId: problem.id, message: question, userCode: problem.starterCode },
  (c) => {
    if (c.type === "first") {
      console.log(`[${c.ms}ms] first token\n`);
      return;
    }
    chunks++;
    line += c.text;
    // Print as it arrives, wrapped, so the pace is visible rather than inferred.
    if (line.length > 78) {
      console.log(`[${String(Date.now() - t0).padStart(6)}ms] ${line.trim()}`);
      line = "";
    }
  },
);
if (line.trim() !== "") console.log(`[${String(Date.now() - t0).padStart(6)}ms] ${line.trim()}`);

console.log(
  `\n${chunks} chunks · first ${res.firstMs}ms · complete ${res.ms}ms · streamed ${res.streamed}` +
    (res.rejected !== undefined ? `\nREJECTED: ${res.rejected}` : ""),
);

const history = getChat(db, problem.id);
console.log(`persisted: ${history.map((m) => `${m.role}(${m.content.length} chars)`).join(", ")}`);
db.close();
