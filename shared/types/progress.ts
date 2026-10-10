/**
 * Progress types, shared by both processes.
 *
 * Progress is keyed on `problem_id` as a plain string and lives only in
 * SQLite. Content lives in bundled TS modules, so regenerating the corpus can
 * never migrate a learner's history — a problem that disappears simply leaves
 * an orphan row, which is far better than the alternative.
 */

/** The outcome of one run. */
export type AttemptStatus = "compile_error" | "failed" | "passed";

export type ProgressStatus = "attempted" | "solved";

export type RecordAttemptInput = {
  problemId: string;
  code: string;
  status: AttemptStatus;
  /** True for Submit (all cases), false for Run (visible only). */
  submitted: boolean;
  testsPassed: number;
  testsTotal: number;
  compileMs: number;
  runtimeMs: number;
  /** Highest hint level reached before this run, 0-3. */
  hintLevel: number;
};

export type ProgressRow = {
  problemId: string;
  status: ProgressStatus;
  attempts: number;
  /** Drives the hint ladder's gating, so it has to survive a restart. */
  failedAttempts: number;
  hintsMaxLevel: number;
  firstSolvedAt: number | null;
  lastAttemptAt: number | null;
  bestRuntimeMs: number | null;
};

export type RecentAttempt = {
  problemId: string;
  status: AttemptStatus;
  submitted: boolean;
  testsPassed: number;
  testsTotal: number;
  createdAt: number;
};

export type Stats = {
  solved: number;
  attempted: number;
  totalAttempts: number;
  /** Consecutive days with at least one attempt, counting back from today. */
  streakDays: number;
  /** Distinct days with any activity. */
  activeDays: number;
  compileErrorRate: number;
  recent: RecentAttempt[];
  /** Attempt counts per day for the last 30 days, oldest first. */
  activity: { day: string; attempts: number; solved: number }[];
};
