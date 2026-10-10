/**
 * The tutor conversation.
 *
 * The one place in the app where waiting is unavoidable and therefore has to
 * be designed rather than hidden. Measured on the provider available here:
 * 4.2-14.5s before the first token (p50 6.4s, n=9), p50 11.4s to the end. So
 * there are three states worth distinguishing, and the UI shows all three
 * honestly —
 *
 *   waiting    nothing has arrived yet. Say so; do not fake a typing dot.
 *   streaming  text is moving. This is the part streaming actually bought.
 *   idle       done, or nothing in flight.
 *
 * History is persisted per problem in SQLite and reloaded on mount, which is
 * what makes closing the pane (or the app) cost nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/types/ai.js";

export type TutorStatus = "idle" | "waiting" | "streaming";

export type TutorState = {
  messages: ChatMessage[];
  /** The question in flight, and the reply as far as it has arrived. */
  pending: { question: string; text: string } | null;
  status: TutorStatus;
  /** Why the last turn produced nothing. Shown quietly, never as a failure. */
  note: string | null;
  /** Milliseconds to the first token of the last turn. */
  firstMs: number | null;
  ready: boolean;
  send: (message: string) => void;
  stop: () => void;
  clear: () => void;
};

export function useTutor(args: {
  problemId: string;
  userCode: string;
  failingCase: string | null;
  enabled: boolean;
}): TutorState {
  const { problemId, userCode, failingCase, enabled } = args;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<{ question: string; text: string } | null>(null);
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [firstMs, setFirstMs] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const turn = useRef<string | null>(null);
  // The editor's contents at the moment of asking. Read from a ref so `send`
  // does not need to be rebuilt on every keystroke.
  const latest = useRef({ userCode, failingCase });
  latest.current = { userCode, failingCase };

  useEffect(() => {
    let live = true;
    // Abandon anything still in flight for the problem being left. Without
    // this the reply lands, resolves against the OLD problem id, and pastes
    // the previous conversation into this pane — and until it lands, the
    // in-flight guard silently refuses to send anything new.
    const leftover = turn.current;
    if (leftover !== null) {
      turn.current = null;
      void window.api.ai.cancelChat(leftover);
    }
    setReady(false);
    setMessages([]);
    setPending(null);
    setStatus("idle");
    setNote(null);
    void window.api.ai.chatHistory(problemId).then((rows) => {
      if (!live) return;
      setMessages(rows);
      setReady(true);
    });
    return () => {
      live = false;
      // The route remounts this component on a problem change (Practice is
      // keyed by problem id), so this cleanup — not the body above — is what
      // runs when the learner walks away mid-turn. Without it the provider
      // keeps working on an answer nobody will ever see.
      const inFlight = turn.current;
      if (inFlight !== null) {
        turn.current = null;
        void window.api.ai.cancelChat(inFlight);
      }
    };
  }, [problemId]);

  const send = useCallback(
    (message: string) => {
      const text = message.trim();
      if (text === "" || turn.current !== null || !enabled) return;

      const turnId = crypto.randomUUID();
      turn.current = turnId;
      setNote(null);
      setFirstMs(null);
      setPending({ question: text, text: "" });
      setStatus("waiting");

      void window.api.ai
        .chat(
          {
            turnId,
            problemId,
            message: text,
            userCode: latest.current.userCode,
            ...(latest.current.failingCase !== null
              ? { failingCase: latest.current.failingCase }
              : {}),
          },
          (chunk) => {
            // A late chunk from a turn that was stopped must not reappear in
            // the next one's bubble.
            if (turn.current !== turnId) return;
            if (chunk.type === "first") {
              setFirstMs(chunk.ms);
              setStatus("streaming");
            } else {
              setPending((p) => (p ? { ...p, text: p.text + chunk.text } : p));
            }
          },
        )
        .then((res) => {
          if (turn.current !== turnId) return;
          turn.current = null;
          setStatus("idle");
          setPending(null);
          if (res.rejected !== undefined) {
            setNote(res.rejected);
            // The question was persisted before the call, so the transcript
            // has to be re-read rather than patched: it now holds their
            // message and no reply.
            void window.api.ai.chatHistory(problemId).then(setMessages);
            return;
          }
          void window.api.ai.chatHistory(problemId).then(setMessages);
        })
        .catch((e: Error) => {
          if (turn.current !== turnId) return;
          turn.current = null;
          setStatus("idle");
          setPending(null);
          setNote(e.message);
        });
    },
    [problemId, enabled],
  );

  const stop = useCallback(() => {
    const id = turn.current;
    if (id === null) return;
    turn.current = null;
    void window.api.ai.cancelChat(id);
    setStatus("idle");
    setPending(null);
    setNote("stopped");
    void window.api.ai.chatHistory(problemId).then(setMessages);
  }, [problemId]);

  const clear = useCallback(() => {
    void window.api.ai.clearChat(problemId).then(() => {
      setMessages([]);
      setNote(null);
    });
  }, [problemId]);

  return { messages, pending, status, note, firstMs, ready, send, stop, clear };
}
