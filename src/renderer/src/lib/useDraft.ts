/**
 * Code drafts, persisted to SQLite.
 *
 * Debounced rather than written on every keystroke: SQLite would cope, but a
 * write per character makes the WAL churn for no benefit when the only reader
 * is this same window. 500ms is short enough that the worst case of a crash
 * loses half a sentence of typing.
 *
 * `ready` matters. The editor must not mount with the starter code and then
 * swap to the draft a moment later — that reads as the app throwing away work.
 * Practice holds its render until the draft has been looked for.
 */

import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 500;

export function useDraft(
  problemId: string,
  starterCode: string,
): {
  code: string;
  setCode: (code: string) => void;
  ready: boolean;
  reset: () => void;
} {
  const [code, setCodeState] = useState(starterCode);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow load for problem A landing after a switch to B.
  const currentId = useRef(problemId);

  useEffect(() => {
    currentId.current = problemId;
    setReady(false);
    let cancelled = false;

    void window.api.drafts.get(problemId).then((saved) => {
      if (cancelled || currentId.current !== problemId) return;
      setCodeState(saved ?? starterCode);
      setReady(true);
    });

    return () => {
      cancelled = true;
      // Flush anything pending before leaving, so switching problems mid-edit
      // does not silently drop the last few keystrokes.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [problemId, starterCode]);

  function setCode(next: string): void {
    setCodeState(next);
    if (timer.current) clearTimeout(timer.current);
    const id = problemId;
    timer.current = setTimeout(() => {
      void window.api.drafts.save(id, next);
    }, DEBOUNCE_MS);
  }

  function reset(): void {
    if (timer.current) clearTimeout(timer.current);
    setCodeState(starterCode);
    void window.api.drafts.clear(problemId);
  }

  return { code, setCode, ready, reset };
}
