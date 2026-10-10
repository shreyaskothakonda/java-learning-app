/**
 * The tutor — a conversation about the problem you are sitting in front of.
 *
 * Distinct from the Coach pane on purpose. The Coach answers "I am stuck on
 * this" and is rationed by the hint ladder. The tutor answers "why does Java
 * do that?", which is not about this problem at all and should not be rationed
 * — it is the difference between a puzzle app and learning the language.
 *
 * The design keeps the modernist grammar rather than reaching for chat bubbles:
 * turns are typographic blocks separated by 2px rules, labelled by eyebrow, so
 * a transcript reads as a document rather than a messaging app.
 */

import { useEffect, useRef, useState } from "react";
import type { Problem } from "@content/types.js";
import { DUR, EASE, dur, rise } from "../design/motion.js";
import { gsap } from "gsap";
import { useTutor } from "../lib/useTutor.js";

type Props = {
  problem: Problem;
  userCode: string;
  failingCase: string | null;
  aiEnabled: boolean;
  onOpenEditor: () => void;
};

/** Openers that teach the pane's purpose better than a paragraph explaining it. */
const OPENERS = [
  "What is the difference between an int and an Integer here?",
  "Walk me through what my loop actually does on the first example.",
  "Why does Java need me to declare the type twice?",
];

export function TutorPane({
  problem,
  userCode,
  failingCase,
  aiEnabled,
  onOpenEditor,
}: Props): React.JSX.Element {
  const tutor = useTutor({ problemId: problem.id, userCode, failingCase, enabled: aiEnabled });
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Follow the text as it streams. `auto`, not `smooth`: a smooth scroll
  // retriggered on every token never arrives, and the view crawls behind the
  // text by a growing margin.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "auto" });
  }, [tutor.messages, tutor.pending]);

  useEffect(() => {
    if (tail.current) rise(tail.current, { y: 6 });
  }, [tutor.messages.length]);

  // The wait, counted rather than promised.
  //
  // Measured on the provider available here, the first token lands anywhere
  // between 4.2s and 14.5s (n=9, p50 6.4s). That spread is too wide to put a
  // number in the copy — "about five seconds" would be a lie a third of the
  // time — so the interface shows the actual elapsed seconds instead. A
  // counter that is always right beats an estimate that is usually wrong.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (tutor.status !== "waiting") {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [tutor.status]);

  // The marker breathes alongside it: the counter says how long, this says
  // that something is still happening.
  const waitMark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (tutor.status !== "waiting" || !waitMark.current) return;
    const t = gsap.to(waitMark.current, {
      opacity: 0.25,
      duration: dur(DUR.panel),
      ease: EASE.inOut,
      repeat: -1,
      yoyo: true,
    });
    return () => {
      t.kill();
    };
  }, [tutor.status]);

  const busy = tutor.status !== "idle";

  const submit = (): void => {
    if (draft.trim() === "" || busy) return;
    tutor.send(draft);
    setDraft("");
  };

  const ask = (question: string): void => {
    if (busy) return;
    tutor.send(question);
    composer.current?.focus();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            padding: "24px 48px 16px",
          }}
        >
          <div className="eyebrow">Tutor</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
            reads your code · never shown the answer
          </div>
          {tutor.messages.length > 0 && (
            <button className="btn btn-ghost" onClick={tutor.clear} style={{ marginLeft: "auto" }}>
              Start over
            </button>
          )}
        </div>

        <div
          ref={scroller}
          style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 48px 24px" }}
        >
          <div style={{ maxWidth: 680 }}>
            {!tutor.ready ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                loading…
              </div>
            ) : tutor.messages.length === 0 && tutor.pending === null ? (
              <div>
                <p
                  style={{
                    fontSize: 20,
                    lineHeight: 1.35,
                    margin: "0 0 24px",
                    color: "var(--ink-muted)",
                  }}
                >
                  Ask about Java itself, not just this problem. The tutor can see the code in your
                  editor and will talk about your variables by name.
                </p>
                <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
                  For example
                </div>
                {OPENERS.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    disabled={!aiEnabled}
                    /* The visible text is the question; the accessible name
                       adds what the button DOES, which a row of three bare
                       sentences does not convey when read aloud. It still
                       contains the visible label, as 2.5.3 requires. */
                    aria-label={`Ask the tutor: ${q}`}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: 0,
                      borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                      padding: "12px 0",
                      color: "var(--ink-muted)",
                      font: "inherit",
                      fontSize: 14,
                      cursor: aiEnabled ? "pointer" : "not-allowed",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              tutor.messages.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    borderTop: i === 0 ? "none" : "var(--rule-w) solid var(--rule)",
                    padding: i === 0 ? "0 0 20px" : "20px 0",
                  }}
                >
                  <div
                    className="eyebrow"
                    style={{
                      marginBottom: 10,
                      color: m.role === "user" ? "var(--accent-hi)" : "var(--ink-dim)",
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <span>{m.role === "user" ? "You" : "Tutor"}</span>
                    {m.role === "assistant" && m.ms !== undefined && (
                      <span className="mono" style={{ letterSpacing: 0, color: "var(--ink-faint)" }}>
                        {(m.ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <Body text={m.content} muted={m.role === "user"} />
                </div>
              ))
            )}

            {tutor.pending && (
              <div ref={tail} style={{ borderTop: "var(--rule-w) solid var(--rule)", padding: "20px 0" }}>
                <div className="eyebrow" style={{ marginBottom: 10, color: "var(--accent-hi)" }}>
                  You
                </div>
                <Body text={tutor.pending.question} muted />
                <div
                  className="eyebrow"
                  style={{ margin: "20px 0 10px", color: "var(--ink-dim)", display: "flex", gap: 12 }}
                >
                  <span>Tutor</span>
                  {tutor.firstMs !== null && (
                    <span className="mono" style={{ letterSpacing: 0, color: "var(--ink-faint)" }}>
                      {(tutor.firstMs / 1000).toFixed(1)}s to first word
                    </span>
                  )}
                </div>
                {tutor.status === "waiting" ? (
                  <div
                    className="mono"
                    style={{ fontSize: 12, color: "var(--ink-dim)", display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <span
                      ref={waitMark}
                      style={{ width: 8, height: 8, background: "var(--accent)", display: "block" }}
                    />
                    reaching the tutor{waited > 0 ? ` · ${waited}s` : ""}
                  </div>
                ) : (
                  <Body text={tutor.pending.text} cursor />
                )}
              </div>
            )}

            {tutor.note !== null && tutor.pending === null && (
              <div
                style={{
                  borderTop: "var(--rule-w) solid var(--rule)",
                  padding: "16px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--ink-dim)",
                }}
              >
                {tutor.note === "stopped"
                  ? "Stopped."
                  : tutor.note === "no provider"
                    ? "No AI provider is configured, so there is nobody to ask. Settings has the options."
                    : `That reply was held back — ${tutor.note}. Try asking something narrower.`}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            flex: "none",
            borderTop: "var(--rule-w) solid var(--rule)",
            padding: "16px 48px 20px",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", maxWidth: 680 }}>
            <textarea
              ref={composer}
              className="input"
              rows={2}
              value={draft}
              disabled={!aiEnabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                aiEnabled
                  ? "Ask the tutor — Enter to send, Shift+Enter for a new line"
                  : "Set up an AI provider in Settings to use the tutor"
              }
              aria-label="Ask the tutor"
            />
            {busy ? (
              <button className="btn" onClick={tutor.stop} style={{ minWidth: 110, flex: "none" }}>
                Stop
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={!aiEnabled || draft.trim() === ""}
                style={{ minWidth: 110, flex: "none" }}
              >
                Ask <span>→</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <aside style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
            What it can see
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-muted)" }}>
            The problem statement, its visible examples, and whatever is in your editor right now.
            Not the reference solution, and not the hidden test cases — the same redaction the hint
            ladder uses, for the same reason.
          </div>
        </div>

        <div>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
            The problem
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--ink-muted)",
              whiteSpace: "pre-wrap",
            }}
          >
            {problem.prompt}
          </div>
        </div>

        <button className="btn" onClick={onOpenEditor} style={{ marginTop: "auto" }}>
          Back to the editor <span>→</span>
        </button>
      </aside>
    </div>
  );
}

/**
 * Message text.
 *
 * Fenced code is rendered as code rather than as prose with stray backticks —
 * the tutor is explicitly allowed short snippets, so they have to be legible.
 * Deliberately not a Markdown renderer: the prompt asks for plain prose, and
 * pulling in a parser to handle headings the tutor is told not to write would
 * be solving a problem we created.
 */
function Body({
  text,
  muted,
  cursor,
}: {
  text: string;
  muted?: boolean;
  cursor?: boolean;
}): React.JSX.Element {
  const parts = text.split(/```(?:java)?\n?/);
  return (
    <div
      style={{
        fontSize: 15,
        lineHeight: 1.55,
        color: muted ? "var(--ink-muted)" : "var(--ink)",
        textWrap: "pretty",
      }}
    >
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="mono"
            style={{
              background: "var(--surface)",
              padding: 12,
              margin: "12px 0",
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {part.replace(/\n$/, "")}
          </pre>
        ) : (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            {part}
          </span>
        ),
      )}
      {cursor && (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 16,
            background: "var(--accent)",
            verticalAlign: "-2px",
            marginLeft: 4,
          }}
        />
      )}
    </div>
  );
}
