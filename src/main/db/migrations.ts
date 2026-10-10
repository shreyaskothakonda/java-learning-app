/**
 * Schema migrations.
 *
 * Phases 0-3 created tables ad hoc with `CREATE TABLE IF NOT EXISTS` inside
 * whichever function needed them, which works right up until a column has to
 * change and there is no record of what shape the database is already in.
 *
 * Migrations are append-only: never edit one that has shipped, add another.
 * Each runs inside a transaction, so a failure leaves the version untouched
 * rather than half-applied.
 */

import type { DatabaseSync } from "node:sqlite";

type Migration = { version: number; name: string; sql: string };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "attempts, progress, drafts, settings",
    // IF NOT EXISTS on `setting` because databases from phase 3 already have
    // it, created outside any migration and therefore at version 0.
    sql: `
      CREATE TABLE IF NOT EXISTS setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE attempt (
        id           INTEGER PRIMARY KEY,
        problem_id   TEXT    NOT NULL,
        code         TEXT    NOT NULL,
        -- Java has a compile step, so "did not build" and "built but wrong"
        -- are pedagogically different states. The JS platform's boolean
        -- could not express that.
        status       TEXT    NOT NULL CHECK (status IN ('compile_error','failed','passed')),
        -- Run checks visible cases only; Submit runs everything. Only a
        -- passing submit counts as solving.
        submitted    INTEGER NOT NULL DEFAULT 0,
        tests_passed INTEGER NOT NULL,
        tests_total  INTEGER NOT NULL,
        compile_ms   INTEGER,
        runtime_ms   INTEGER,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX attempt_problem_idx ON attempt (problem_id, created_at DESC);
      CREATE INDEX attempt_created_idx ON attempt (created_at DESC);

      CREATE TABLE progress (
        problem_id      TEXT PRIMARY KEY,
        status          TEXT    NOT NULL CHECK (status IN ('attempted','solved')),
        attempts        INTEGER NOT NULL DEFAULT 0,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        hints_max_level INTEGER NOT NULL DEFAULT 0,
        first_solved_at INTEGER,
        last_attempt_at INTEGER,
        best_runtime_ms INTEGER
      );

      -- Replaces localStorage. In a desktop app a second store that is
      -- invisible to backup and cleared with the browser cache is a liability.
      CREATE TABLE draft (
        problem_id TEXT PRIMARY KEY,
        code       TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Phase 0 diagnostics; the screen that used it is gone.
      DROP TABLE IF EXISTS ping;
    `,
  },
  {
    version: 2,
    name: "ai response cache",
    // Caching matters far more than expected here: the measured provider takes
    // ~6s per reply, so a cache hit is the difference between instant and a
    // wait. Compiler errors repeat constantly — the same five mistakes account
    // for most of what a beginner hits — so keying on the normalised
    // diagnostic makes the second occurrence free.
    sql: `
      CREATE TABLE ai_cache (
        key        TEXT PRIMARY KEY,
        feature    TEXT NOT NULL,
        provider   TEXT NOT NULL,
        response   TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX ai_cache_created_idx ON ai_cache (created_at DESC);
    `,
  },
  {
    version: 3,
    name: "tutor chat history",
    // Per problem, not one global thread. A conversation about two-sum is
    // noise when you open a tree problem, and the plan's exit criterion for
    // this phase is history restored on REOPEN — which only means anything
    // if reopening lands you back in the right conversation.
    //
    // Ordered by id, never created_at: two messages of the same turn can land
    // in the same millisecond, and a transcript that shuffles the reply above
    // the question is worse than no history.
    sql: `
      CREATE TABLE chat_message (
        id         INTEGER PRIMARY KEY,
        problem_id TEXT    NOT NULL,
        role       TEXT    NOT NULL CHECK (role IN ('user','assistant')),
        content    TEXT    NOT NULL,
        -- Assistant rows only. Kept so the transcript can say where an answer
        -- came from and how long it took, months later.
        provider   TEXT,
        ms         INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX chat_problem_idx ON chat_message (problem_id, id);
    `,
  },
  {
    version: 4,
    name: "code review cache",
    // Not folded into ai_cache. A review is keyed on the learner's code rather
    // than on a prompt, it is worth showing again months later next to the
    // attempt it describes, and it is the one AI output that saw the reference
    // solution — which is a thing worth being able to find in one query rather
    // than inferring from a `feature` column.
    sql: `
      CREATE TABLE review (
        id         INTEGER PRIMARY KEY,
        problem_id TEXT    NOT NULL,
        -- Hash of the reviewed code. A review describes one version of one
        -- solution; showing it against a later edit would be a lie.
        code_hash  TEXT    NOT NULL,
        json       TEXT    NOT NULL,
        provider   TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX review_key_idx ON review (problem_id, code_hash);
    `,
  },
];

/** Applies any migrations the database has not seen. Returns the new version. */
export function migrate(db: DatabaseSync): number {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");

  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  let current = row?.version ?? 0;
  if (row === undefined) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("UPDATE schema_version SET version = ?").run(m.version);
      db.exec("COMMIT");
      current = m.version;
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${m.version} (${m.name}) failed: ${String(e)}`);
    }
  }
  return current;
}

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
