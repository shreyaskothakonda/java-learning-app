/**
 * Progress, shared across screens.
 *
 * A context rather than prop-drilling because the consumers are at very
 * different depths — the Shell's streak, the Problems table's badges, and the
 * hint gate down inside CoachPane all read the same state, and threading it
 * through four layers would mean every intermediate component knowing about
 * progress it does not itself use.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProgressRow, RecordAttemptInput, Stats } from "@shared/types/progress.js";

type Ctx = {
  progress: Record<string, ProgressRow>;
  stats: Stats | null;
  lastProblemId: string | null;
  loaded: boolean;
  record: (input: RecordAttemptInput) => Promise<void>;
  setHintLevel: (problemId: string, level: number) => void;
};

const ProgressContext = createContext<Ctx | null>(null);

const EMPTY: Record<string, ProgressRow> = {};

export function ProgressProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [progress, setProgress] = useState<Record<string, ProgressRow>>(EMPTY);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastProblemId, setLastProblemId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [p, s, last] = await Promise.all([
      window.api.progress.all(),
      window.api.progress.stats(),
      window.api.progress.lastProblemId(),
    ]);
    setProgress(p);
    setStats(s);
    setLastProblemId(last);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoaded(true));
  }, [refresh]);

  const record = useCallback(
    async (input: RecordAttemptInput) => {
      // The row comes back from the write, so the hint gate updates from the
      // authoritative value rather than a local guess that could drift.
      const row = await window.api.progress.record(input);
      setProgress((prev) => ({ ...prev, [input.problemId]: row }));
      setLastProblemId(input.problemId);
      // Stats aggregate the whole table, so they need a real re-read.
      setStats(await window.api.progress.stats());
    },
    [],
  );

  const setHintLevel = useCallback((problemId: string, level: number) => {
    void window.api.progress.hintLevel(problemId, level);
    setProgress((prev) => {
      const row = prev[problemId];
      if (row && row.hintsMaxLevel >= level) return prev;
      return {
        ...prev,
        [problemId]: {
          problemId,
          status: row?.status ?? "attempted",
          attempts: row?.attempts ?? 0,
          failedAttempts: row?.failedAttempts ?? 0,
          hintsMaxLevel: Math.max(row?.hintsMaxLevel ?? 0, level),
          firstSolvedAt: row?.firstSolvedAt ?? null,
          lastAttemptAt: row?.lastAttemptAt ?? null,
          bestRuntimeMs: row?.bestRuntimeMs ?? null,
        },
      };
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ progress, stats, lastProblemId, loaded, record, setHintLevel }),
    [progress, stats, lastProblemId, loaded, record, setHintLevel],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): Ctx {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside a ProgressProvider");
  return ctx;
}

/** The status of one problem, for badges and lists. */
export function useProblemStatus(problemId: string): "solved" | "attempted" | "new" {
  const { progress } = useProgress();
  return progress[problemId]?.status ?? "new";
}
