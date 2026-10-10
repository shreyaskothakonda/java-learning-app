/**
 * The AI hint, as progressive enhancement.
 *
 * The measured provider takes ~6s per reply. A spinner for six seconds on a
 * "give me a hint" click would read as broken, so nothing waits on it: the
 * authored static hint renders immediately and this arrives afterwards as a
 * personalised second opinion that has actually read the learner's code.
 *
 * Every failure — no provider, a slow provider, a response the filter rejects
 * — lands in the same place: `text` stays null and the static hint is simply
 * what the learner has. That is the whole reason the ladder is authored.
 */

import { useEffect, useRef, useState } from "react";
import type { AiResult } from "@shared/types/ai.js";

export type AiHintState = {
  text: string | null;
  loading: boolean;
  /** Why there is no AI hint. Shown quietly, never as an error. */
  note: string | null;
  ms: number | null;
  cached: boolean;
};

const IDLE: AiHintState = { text: null, loading: false, note: null, ms: null, cached: false };

export function useAiHint(args: {
  problemId: string;
  level: number;
  userCode: string;
  failingCase: string | null;
  failedAttempts: number;
  enabled: boolean;
}): AiHintState {
  const [state, setState] = useState<AiHintState>(IDLE);
  // Guards against a reply for level 2 landing after the learner moved to 3.
  const token = useRef(0);

  const { problemId, level, userCode, failingCase, failedAttempts, enabled } = args;

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    const mine = ++token.current;
    setState({ ...IDLE, loading: true });

    void window.api.ai
      .hint({
        problemId,
        level,
        userCode,
        ...(failingCase !== null ? { failingCase } : {}),
        failedAttempts,
      })
      .then((r: AiResult) => {
        if (token.current !== mine) return;
        setState({
          text: r.text === "" ? null : r.text,
          loading: false,
          note: r.rejected ?? null,
          ms: r.ms,
          cached: r.cached,
        });
      })
      .catch((e: Error) => {
        if (token.current !== mine) return;
        setState({ ...IDLE, note: e.message });
      });
    // userCode is deliberately NOT a dependency: re-requesting on every
    // keystroke would fire a 6s call per character. The hint is for the code
    // as it stood when the rung was opened.
  }, [problemId, level, enabled, failedAttempts, failingCase]);

  return state;
}
