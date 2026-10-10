/**
 * Query-layer tests against a real temp-file database.
 *
 * Not mocked: `node:sqlite` is doing the work here — the upserts, the CHECK
 * constraints, the transaction boundaries — and a mock would only ever test
 * the shape of my own assumptions about it.
 */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { migrate, LATEST_VERSION } from "./migrations.js";
import {
  appendChat,
  clearChat,
  clearDraft,
  computeStreak,
  dayKey,
  getAllProgress,
  getChat,
  getDraft,
  getLastProblemId,
  getProgressFor,
  getStats,
  recordAttempt,
  recordHintLevel,
  saveDraft,
} from "./queries.js";
import type { RecordAttemptInput } from "@shared/types/progress.js";

async function freshDb(t: { after: (fn: () => unknown) => void }): Promise<DatabaseSync> {
  const dir = await mkdtemp(join(tmpdir(), "jt-db-"));
  const db = new DatabaseSync(join(dir, "test.db"));
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  return db;
}

function attempt(over: Partial<RecordAttemptInput> = {}): RecordAttemptInput {
  return {
    problemId: "p1",
    code: "class Solution {}",
    status: "failed",
    submitted: false,
    testsPassed: 1,
    testsTotal: 3,
    compileMs: 400,
    runtimeMs: 50,
    hintLevel: 0,
    ...over,
  };
}

test("migrations bring a blank database to the latest version, and are idempotent", async (t) => {
  const db = await freshDb(t);
  const v = db.prepare("SELECT version FROM schema_version").get() as { version: number };
  assert.equal(v.version, LATEST_VERSION);

  // Running again must be a no-op, not a "table already exists" crash.
  assert.equal(migrate(db), LATEST_VERSION);

  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  ).map((r) => r.name);
  for (const t of ["attempt", "progress", "draft", "setting", "schema_version"]) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test("a phase-3 database is migrated without losing its settings", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jt-db-old-"));
  const db = new DatabaseSync(join(dir, "old.db"));
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  // Exactly what phase 3 left on disk: ad-hoc tables, no schema_version.
  db.exec("CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec("CREATE TABLE ping (id INTEGER PRIMARY KEY, value TEXT, at INTEGER)");
  db.prepare("INSERT INTO setting VALUES (?, ?)").run("nav", '"sidebar"');

  assert.equal(migrate(db), LATEST_VERSION);

  const kept = db.prepare("SELECT value FROM setting WHERE key = 'nav'").get() as {
    value: string;
  };
  assert.equal(kept.value, '"sidebar"', "settings must survive the migration");

  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  ).map((r) => r.name);
  assert.ok(!tables.includes("ping"), "the phase-0 diagnostics table should be dropped");
});

test("a failed Run records an attempt but does not solve the problem", async (t) => {
  const db = await freshDb(t);
  const p = recordAttempt(db, attempt());
  assert.equal(p.status, "attempted");
  assert.equal(p.attempts, 1);
  assert.equal(p.failedAttempts, 1);
  assert.equal(p.firstSolvedAt, null);
});

test("passing the visible cases on a Run is not solving", async (t) => {
  const db = await freshDb(t);
  // The hidden cases are the whole point, and Run never sees them.
  const p = recordAttempt(db, attempt({ status: "passed", submitted: false }));
  assert.equal(p.status, "attempted");
  assert.equal(p.failedAttempts, 0, "a passing run is not a failure either");
});

test("a passing Submit solves it and stamps the time", async (t) => {
  const db = await freshDb(t);
  const p = recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 90 }));
  assert.equal(p.status, "solved");
  assert.ok(p.firstSolvedAt !== null);
  assert.equal(p.bestRuntimeMs, 90);
});

test("solved is a ratchet — a later failure does not un-solve it", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 90 }));
  const solvedAt = getProgressFor(db, "p1")!.firstSolvedAt;

  const after = recordAttempt(db, attempt({ status: "compile_error" }));
  assert.equal(after.status, "solved", "breaking it later must not erase having solved it");
  assert.equal(after.firstSolvedAt, solvedAt, "first solve time must not move");
  assert.equal(after.attempts, 2);
  assert.equal(after.failedAttempts, 1);
});

test("best runtime keeps the minimum across solves", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 120 }));
  recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 80 }));
  recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 200 }));
  assert.equal(getProgressFor(db, "p1")!.bestRuntimeMs, 80);
});

test("a failed run never overwrites the best runtime", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ status: "passed", submitted: true, runtimeMs: 80 }));
  recordAttempt(db, attempt({ status: "failed", runtimeMs: 5 }));
  assert.equal(getProgressFor(db, "p1")!.bestRuntimeMs, 80, "5ms of failing is not a best time");
});

test("hint level is a high-water mark and survives without a run", async (t) => {
  const db = await freshDb(t);
  recordHintLevel(db, "p1", 2);
  assert.equal(getProgressFor(db, "p1")!.hintsMaxLevel, 2);
  recordHintLevel(db, "p1", 1);
  assert.equal(getProgressFor(db, "p1")!.hintsMaxLevel, 2, "going back a level must not lower it");
  recordAttempt(db, attempt({ hintLevel: 3 }));
  assert.equal(getProgressFor(db, "p1")!.hintsMaxLevel, 3);
});

test("failedAttempts drives the hint gate and survives a restart", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ status: "failed" }));
  recordAttempt(db, attempt({ status: "compile_error" }));
  recordAttempt(db, attempt({ status: "passed", submitted: true }));
  // Two failures unlock level 3; the passing submit is not one of them.
  assert.equal(getProgressFor(db, "p1")!.failedAttempts, 2);
});

test("an invalid status is rejected by the schema, not silently stored", async (t) => {
  const db = await freshDb(t);
  assert.throws(
    () => recordAttempt(db, attempt({ status: "nonsense" as never })),
    /CHECK|constraint/i,
  );
  // The transaction must have rolled back cleanly.
  assert.equal(getProgressFor(db, "p1"), null);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM attempt").get() as { n: number }).n, 0);
});

test("drafts round-trip and clear", async (t) => {
  const db = await freshDb(t);
  assert.equal(getDraft(db, "p1"), null);
  saveDraft(db, "p1", "first");
  saveDraft(db, "p1", "second");
  assert.equal(getDraft(db, "p1"), "second", "saving twice updates rather than duplicating");
  clearDraft(db, "p1");
  assert.equal(getDraft(db, "p1"), null);
});

test("progress is keyed per problem", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ problemId: "a", status: "passed", submitted: true }));
  recordAttempt(db, attempt({ problemId: "b" }));
  const all = getAllProgress(db);
  assert.equal(all["a"]?.status, "solved");
  assert.equal(all["b"]?.status, "attempted");
  assert.equal(getLastProblemId(db), "b");
});

test("stats count solves, attempts and the compile-error rate", async (t) => {
  const db = await freshDb(t);
  recordAttempt(db, attempt({ problemId: "a", status: "compile_error" }));
  recordAttempt(db, attempt({ problemId: "a", status: "passed", submitted: true }));
  recordAttempt(db, attempt({ problemId: "b", status: "failed" }));

  const s = getStats(db);
  assert.equal(s.solved, 1);
  assert.equal(s.attempted, 2);
  assert.equal(s.totalAttempts, 3);
  assert.equal(Math.round(s.compileErrorRate * 100), 33);
  assert.equal(s.recent.length, 3);
  assert.equal(s.recent[0]?.problemId, "b", "recent is newest first");
  assert.equal(s.activity.length, 30, "the window is dense, so gaps stay visible");
});

test("stats on an empty database do not divide by zero", async (t) => {
  const db = await freshDb(t);
  const s = getStats(db);
  assert.deepEqual(
    { solved: s.solved, attempted: s.attempted, rate: s.compileErrorRate, streak: s.streakDays },
    { solved: 0, attempted: 0, rate: 0, streak: 0 },
  );
});

// ---------------------------------------------------------------- streak

const DAY = 86_400_000;
const ago = (n: number): string => dayKey(Date.now() - n * DAY);

test("a streak counts back from today", () => {
  assert.equal(computeStreak([ago(0), ago(1), ago(2)]), 3);
});

test("an empty today does not break the streak — the day is not over", () => {
  assert.equal(computeStreak([ago(1), ago(2)]), 2);
});

test("an empty yesterday does break it", () => {
  assert.equal(computeStreak([ago(2), ago(3)]), 0);
});

test("a gap ends the streak at the gap", () => {
  assert.equal(computeStreak([ago(0), ago(1), ago(3), ago(4)]), 2);
});

test("no activity is a streak of zero", () => {
  assert.equal(computeStreak([]), 0);
});

test("dayKey uses the local calendar day, not UTC", () => {
  // 23:30 local must belong to that local day whatever the offset is.
  const late = new Date();
  late.setHours(23, 30, 0, 0);
  const expected = `${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, "0")}-${String(late.getDate()).padStart(2, "0")}`;
  assert.equal(dayKey(late.getTime()), expected);
});


// -------------------------------------------------------------- chat history

test("a conversation round-trips and comes back oldest first", async (t) => {
  const db = await freshDb(t);
  appendChat(db, { problemId: "p1", role: "user", content: "why an Integer?" });
  appendChat(db, { problemId: "p1", role: "assistant", content: "because null", provider: "claude-code", ms: 9871 });
  appendChat(db, { problemId: "p1", role: "user", content: "and autoboxing?" });

  const rows = getChat(db, "p1");
  assert.deepEqual(rows.map((r) => r.role), ["user", "assistant", "user"]);
  assert.deepEqual(rows.map((r) => r.content), ["why an Integer?", "because null", "and autoboxing?"]);
  assert.equal(rows[1]!.provider, "claude-code");
  assert.equal(rows[1]!.ms, 9871);
  // Metadata is absent, not null, on a learner's message.
  assert.equal(rows[0]!.provider, undefined);
});

test("ordering survives messages written in the same millisecond", async (t) => {
  const db = await freshDb(t);
  // The Phase 4 lesson, which applies twice as hard here: a question and its
  // reply can land in one millisecond, and a transcript that puts the answer
  // above the question is worse than no transcript.
  for (let i = 0; i < 40; i++) {
    appendChat(db, { problemId: "p1", role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` });
  }
  assert.deepEqual(
    getChat(db, "p1").map((r) => r.content),
    Array.from({ length: 40 }, (_, i) => `m${i}`),
  );
});

test("conversations are per problem", async (t) => {
  const db = await freshDb(t);
  appendChat(db, { problemId: "p1", role: "user", content: "about p1" });
  appendChat(db, { problemId: "p2", role: "user", content: "about p2" });
  assert.deepEqual(getChat(db, "p1").map((r) => r.content), ["about p1"]);
  assert.deepEqual(getChat(db, "p2").map((r) => r.content), ["about p2"]);
});

test("the limit keeps the newest turns, not the oldest", async (t) => {
  const db = await freshDb(t);
  for (let i = 0; i < 20; i++) {
    appendChat(db, { problemId: "p1", role: "user", content: `m${i}` });
  }
  // Truncating from the front would restore a transcript that stops
  // mid-thought and feed the model the wrong half as context.
  assert.deepEqual(getChat(db, "p1", 3).map((r) => r.content), ["m17", "m18", "m19"]);
});

test("starting over clears one conversation and leaves the rest", async (t) => {
  const db = await freshDb(t);
  appendChat(db, { problemId: "p1", role: "user", content: "a" });
  appendChat(db, { problemId: "p2", role: "user", content: "b" });
  clearChat(db, "p1");
  assert.equal(getChat(db, "p1").length, 0);
  assert.equal(getChat(db, "p2").length, 1);
});

test("a role the schema does not know is rejected by the database", async (t) => {
  const db = await freshDb(t);
  assert.throws(
    () => appendChat(db, { problemId: "p1", role: "system" as "user", content: "x" }),
    /CHECK|constraint/i,
  );
});
