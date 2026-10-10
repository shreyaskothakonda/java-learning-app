import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { migrate } from "./migrations.js";

let db: DatabaseSync | null = null;

export function dbPath(): string {
  return join(app.getPath("userData"), "tutor.db");
}

/**
 * Opens the database, creating the directory if needed.
 *
 * WAL + synchronous=NORMAL is the standard local-app tradeoff: durable across
 * app crashes, tolerant of concurrent reads, and it does not fsync on every
 * commit (which we do not need for progress tracking on a single machine).
 */
export function openDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  mkdirSync(join(path, ".."), { recursive: true });
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Preferences as a key/value table rather than typed columns.
 *
 * Settings churn far more than schema migrations are worth, and every value
 * here is small and independently defaulted — a missing row just means "use
 * the default", which is the behaviour you want on first launch anyway.
 */
export function readSettings(): Record<string, unknown> {
  const db = openDb();
  const rows = db.prepare("SELECT key, value FROM setting").all() as {
    key: string;
    value: string;
  }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // A hand-edited or truncated value falls back to the default.
    }
  }
  return out;
}

export function writeSettings(patch: Record<string, unknown>): void {
  const db = openDb();
  const stmt = db.prepare(
    "INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function sqliteVersion(): string {
  const row = openDb().prepare("SELECT sqlite_version() AS v").get() as { v: string };
  return row.v;
}
