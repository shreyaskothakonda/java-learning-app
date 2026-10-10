/**
 * Every read and write against the learner's history.
 *
 * Kept separate from the IPC layer so it can be tested against a real
 * temp-file database with no Electron involved — the same reason the Java
 * runner takes its paths as arguments.
 */

import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "@shared/types/ai.js";
import type {
  ProgressRow,
  RecentAttempt,
  RecordAttemptInput,
  Stats,
} from "@shared/types/progress.js";

const DAY_MS = 86_400_000;

/** Local calendar day, not UTC — a streak is about the learner's midnight. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

type ProgressDbRow = {
  problem_id: string;
  status: "attempted" | "solved";
  attempts: number;
  failed_attempts: number;
  hints_max_level: number;
  first_solved_at: number | null;
  last_attempt_at: number | null;
  best_runtime_ms: number | null;
};

function toProgress(r: ProgressDbRow): ProgressRow {
  return {
    problemId: r.problem_id,
    status: r.status,
    attempts: r.attempts,
    failedAttempts: r.failed_attempts,
    hintsMaxLevel: r.hints_max_level,
    firstSolvedAt: r.first_solved_at,
    lastAttemptAt: r.last_attempt_at,
    bestRuntimeMs: r.best_runtime_ms,
  };
}

/**
 * Records one run and folds it into the problem's progress.
 *
 * Both writes happen in one transaction: an attempt row without its progress
 * update would leave the hint ladder's gating out of step with the history
 * the learner can see.
 *
 * Only a passing SUBMIT marks a problem solved. Passing the visible cases on
 * a Run is not solving it — the hidden cases are the whole point.
 */
export function recordAttempt(db: DatabaseSync, input: RecordAttemptInput): ProgressRow {
  const now = Date.now();
  const solved = input.submitted && input.status === "passed";
  const failed = input.status !== "passed";

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO attempt
         (problem_id, code, status, submitted, tests_passed, tests_total, compile_ms, runtime_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.problemId,
      input.code,
      input.status,
      input.submitted ? 1 : 0,
      input.testsPassed,
      input.testsTotal,
      input.compileMs,
      input.runtimeMs,
      now,
    );

    db.prepare(
      `INSERT INTO progress
         (problem_id, status, attempts, failed_attempts, hints_max_level,
          first_solved_at, last_attempt_at, best_runtime_ms)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(problem_id) DO UPDATE SET
         -- Solved is a ratchet: a later failed run does not un-solve it.
         status          = CASE WHEN progress.status = 'solved' OR excluded.status = 'solved'
                                THEN 'solved' ELSE 'attempted' END,
         attempts        = progress.attempts + 1,
         failed_attempts = progress.failed_attempts + ?,
         hints_max_level = MAX(progress.hints_max_level, excluded.hints_max_level),
         first_solved_at = COALESCE(progress.first_solved_at, excluded.first_solved_at),
         last_attempt_at = excluded.last_attempt_at,
         best_runtime_ms = CASE
           WHEN excluded.best_runtime_ms IS NULL THEN progress.best_runtime_ms
           WHEN progress.best_runtime_ms IS NULL THEN excluded.best_runtime_ms
           ELSE MIN(progress.best_runtime_ms, excluded.best_runtime_ms) END`,
    ).run(
      input.problemId,
      solved ? "solved" : "attempted",
      failed ? 1 : 0,
      input.hintLevel,
      solved ? now : null,
      now,
      solved ? input.runtimeMs : null,
      failed ? 1 : 0,
    );

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return getProgressFor(db, input.problemId)!;
}

export function getProgressFor(db: DatabaseSync, problemId: string): ProgressRow | null {
  const row = db.prepare("SELECT * FROM progress WHERE problem_id = ?").get(problemId) as
    | ProgressDbRow
    | undefined;
  return row ? toProgress(row) : null;
}

export function getAllProgress(db: DatabaseSync): Record<string, ProgressRow> {
  const rows = db.prepare("SELECT * FROM progress").all() as ProgressDbRow[];
  const out: Record<string, ProgressRow> = {};
  for (const r of rows) out[r.problem_id] = toProgress(r);
  return out;
}

/** Records the deepest hint reached, even if no run follows. */
export function recordHintLevel(db: DatabaseSync, problemId: string, level: number): void {
  db.prepare(
    `INSERT INTO progress (problem_id, status, attempts, failed_attempts, hints_max_level, last_attempt_at)
     VALUES (?, 'attempted', 0, 0, ?, NULL)
     ON CONFLICT(problem_id) DO UPDATE SET
       hints_max_level = MAX(progress.hints_max_level, excluded.hints_max_level)`,
  ).run(problemId, level);
}

// ---------------------------------------------------------------- drafts

export function getDraft(db: DatabaseSync, problemId: string): string | null {
  const row = db.prepare("SELECT code FROM draft WHERE problem_id = ?").get(problemId) as
    | { code: string }
    | undefined;
  return row?.code ?? null;
}

export function saveDraft(db: DatabaseSync, problemId: string, code: string): void {
  db.prepare(
    `INSERT INTO draft (problem_id, code, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(problem_id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at`,
  ).run(problemId, code, Date.now());
}

export function clearDraft(db: DatabaseSync, problemId: string): void {
  db.prepare("DELETE FROM draft WHERE problem_id = ?").run(problemId);
}

// ----------------------------------------------------------------- stats

/**
 * Counts back from today over the distinct active days.
 *
 * Today being empty does not break the streak — it is not over yet. Yesterday
 * being empty does. Anything else punishes someone for opening the app before
 * they have done anything.
 */
export function computeStreak(days: string[], today = dayKey(Date.now())): number {
  const set = new Set(days);
  const yesterday = dayKey(Date.now() - DAY_MS);
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (cursor === null) return 0;

  let streak = 0;
  let ms = new Date(`${cursor}T00:00:00`).getTime();
  while (set.has(dayKey(ms))) {
    streak++;
    ms -= DAY_MS;
  }
  return streak;
}

export function getStats(db: DatabaseSync): Stats {
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'solved' THEN 1 ELSE 0 END)  AS solved,
         COUNT(*)                                            AS attempted,
         COALESCE(SUM(attempts), 0)                          AS total
       FROM progress`,
    )
    .get() as { solved: number | null; attempted: number; total: number };

  const compileErrors = db
    .prepare("SELECT COUNT(*) AS n FROM attempt WHERE status = 'compile_error'")
    .get() as { n: number };
  const allAttempts = db.prepare("SELECT COUNT(*) AS n FROM attempt").get() as { n: number };

  const attemptDays = db.prepare("SELECT created_at FROM attempt").all() as {
    created_at: number;
  }[];
  const days = [...new Set(attemptDays.map((a) => dayKey(a.created_at)))];

  const recent = (
    db
      .prepare(
        `SELECT problem_id, status, submitted, tests_passed, tests_total, created_at
         -- id DESC breaks ties: two runs can land in the same millisecond,
         -- and created_at alone then leaves "most recent" undefined. The
         -- rowid is monotonic, so it is the real insertion order.
         FROM attempt ORDER BY created_at DESC, id DESC LIMIT 12`,
      )
      .all() as {
      problem_id: string;
      status: RecentAttempt["status"];
      submitted: number;
      tests_passed: number;
      tests_total: number;
      created_at: number;
    }[]
  ).map((r) => ({
    problemId: r.problem_id,
    status: r.status,
    submitted: r.submitted === 1,
    testsPassed: r.tests_passed,
    testsTotal: r.tests_total,
    createdAt: r.created_at,
  }));

  // A dense 30-day window, so empty days are visible as gaps rather than
  // silently collapsed out of the chart.
  const since = Date.now() - 29 * DAY_MS;
  const perDay = new Map<string, { attempts: number; solved: number }>();
  const rows = db
    .prepare(
      `SELECT created_at, status, submitted FROM attempt WHERE created_at >= ?`,
    )
    .all(since) as { created_at: number; status: string; submitted: number }[];
  for (const r of rows) {
    const k = dayKey(r.created_at);
    const cur = perDay.get(k) ?? { attempts: 0, solved: 0 };
    cur.attempts++;
    if (r.status === "passed" && r.submitted === 1) cur.solved++;
    perDay.set(k, cur);
  }
  const activity = Array.from({ length: 30 }, (_, i) => {
    const day = dayKey(since + i * DAY_MS);
    const v = perDay.get(day) ?? { attempts: 0, solved: 0 };
    return { day, ...v };
  });

  return {
    solved: counts.solved ?? 0,
    attempted: counts.attempted,
    totalAttempts: counts.total,
    streakDays: computeStreak(days),
    activeDays: days.length,
    compileErrorRate: allAttempts.n === 0 ? 0 : compileErrors.n / allAttempts.n,
    recent,
    activity,
  };
}

/** The problem to offer on Home — whatever was touched last. */
export function getLastProblemId(db: DatabaseSync): string | null {
  const row = db
    .prepare("SELECT problem_id FROM attempt ORDER BY created_at DESC, id DESC LIMIT 1")
    .get() as { problem_id: string } | undefined;
  return row?.problem_id ?? null;
}

// -------------------------------------------------------------- ai cache

/**
 * Cached AI responses.
 *
 * Worth far more here than in a typical app: the only available provider is
 * ~6s per call, so a hit turns a visible wait into an instant answer. Compiler
 * errors are the sweet spot — the same handful recur constantly, and the key
 * is the NORMALISED diagnostic, so "cannot find symbol" for two different
 * identifiers shares one entry.
 */
export function getCached(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT response FROM ai_cache WHERE key = ?").get(key) as
    | { response: string }
    | undefined;
  return row?.response ?? null;
}

export function putCached(
  db: DatabaseSync,
  key: string,
  feature: string,
  provider: string,
  response: string,
): void {
  db.prepare(
    `INSERT INTO ai_cache (key, feature, provider, response, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET response = excluded.response, created_at = excluded.created_at`,
  ).run(key, feature, provider, response, Date.now());
}

// ------------------------------------------------------------- tutor chat

type ChatDbRow = {
  id: number;
  problem_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  ms: number | null;
  created_at: number;
};

function toChat(r: ChatDbRow): ChatMessage {
  return {
    id: r.id,
    problemId: r.problem_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
    ...(r.provider !== null ? { provider: r.provider as ChatMessage["provider"] } : {}),
    ...(r.ms !== null ? { ms: r.ms } : {}),
  };
}

/**
 * The conversation for one problem, oldest first.
 *
 * `LIMIT` is applied to the NEWEST rows and the result reversed, so a long
 * conversation keeps its recent end rather than its opening. Taking the first
 * n instead would restore a transcript that stops mid-thought.
 */
export function getChat(db: DatabaseSync, problemId: string, limit = 200): ChatMessage[] {
  const rows = db
    .prepare(
      "SELECT * FROM chat_message WHERE problem_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(problemId, limit) as ChatDbRow[];
  return rows.reverse().map(toChat);
}

export function appendChat(
  db: DatabaseSync,
  m: {
    problemId: string;
    role: "user" | "assistant";
    content: string;
    provider?: string;
    ms?: number;
  },
): ChatMessage {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO chat_message (problem_id, role, content, provider, ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(m.problemId, m.role, m.content, m.provider ?? null, m.ms ?? null, now);
  return {
    id: Number(info.lastInsertRowid),
    problemId: m.problemId,
    role: m.role,
    content: m.content,
    createdAt: now,
    ...(m.provider !== undefined ? { provider: m.provider as ChatMessage["provider"] } : {}),
    ...(m.ms !== undefined ? { ms: m.ms } : {}),
  };
}

/** Starting over. Deletes the transcript for one problem, not the whole table. */
export function clearChat(db: DatabaseSync, problemId: string): void {
  db.prepare("DELETE FROM chat_message WHERE problem_id = ?").run(problemId);
}

// ------------------------------------------------------------- code review

/** A stored review, or null when this exact code has not been reviewed. */
export function getReview(
  db: DatabaseSync,
  problemId: string,
  codeHash: string,
): { json: string; provider: string; createdAt: number } | null {
  const row = db
    .prepare("SELECT json, provider, created_at FROM review WHERE problem_id = ? AND code_hash = ?")
    .get(problemId, codeHash) as
    | { json: string; provider: string; created_at: number }
    | undefined;
  return row ? { json: row.json, provider: row.provider, createdAt: row.created_at } : null;
}

export function putReview(
  db: DatabaseSync,
  problemId: string,
  codeHash: string,
  json: string,
  provider: string,
): void {
  db.prepare(
    `INSERT INTO review (problem_id, code_hash, json, provider, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(problem_id, code_hash) DO UPDATE SET
       json = excluded.json, provider = excluded.provider, created_at = excluded.created_at`,
  ).run(problemId, codeHash, json, provider, Date.now());
}
