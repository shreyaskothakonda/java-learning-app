/**
 * The Coach pane — the hint ladder.
 *
 * The prototype showed a chat with a streaming tutor. The AI provider is
 * Phase 5, so this drives the ladder from the four static hints every problem
 * already carries (L1 Orient / L2 Probe / L3 Nudge / L4 Walk). That is not a
 * placeholder: those hints are the floor the AI is meant to fall back to, so
 * the app has to be fully usable with no provider configured. Phase 5 replaces
 * the text source, not this screen.
 *
 * Escalation is gated on ATTEMPTS, not clicks — L3 needs one failed run, L4
 * needs three. Otherwise the button gets mashed to the answer in nine seconds
 * and nothing is learned.
 */

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import type { Problem } from "@content/types.js";
import { getProblemsByTopic } from "@content/index.js";
import { DUR, EASE, dur, prefersReducedMotion, rise } from "../design/motion.js";
import { useAiHint } from "../lib/useAiHint.js";

const LEVELS = ["Orient", "Probe", "Nudge", "Walk"] as const;

/** Attempts required before each level unlocks. */
const GATE = [0, 0, 1, 3];

type Props = {
  problem: Problem;
  failedAttempts: number;
  /** Lifted so the deepest level reached can be persisted. */
  level: number;
  onLevelChange: (level: number) => void;
  onOpenEditor: () => void;
  /** Passed to the AI so its hint can refer to what they actually wrote. */
  userCode: string;
  /** The first VISIBLE failing case, already redacted upstream. */
  failingCase: string | null;
  aiEnabled: boolean;
};

export function CoachPane({
  problem,
  failedAttempts,
  level,
  onLevelChange,
  onOpenEditor,
  userCode,
  failingCase,
  aiEnabled,
}: Props): React.JSX.Element {
  const setLevel = onLevelChange;
  const [shown, setShown] = useState("");
  const ai = useAiHint({
    problemId: problem.id,
    level,
    userCode,
    failingCase,
    failedAttempts,
    enabled: aiEnabled,
  });
  const body = useRef<HTMLDivElement>(null);
  const siblings = getProblemsByTopic(problem.topic);

  useEffect(() => {
    setShown("");
  }, [problem.id]);

  // A typewriter reveal, as in the prototype. It is the one place a slower
  // pace is right: the coach is talking, and text that lands instantly reads
  // as a lookup rather than a reply.
  useEffect(() => {
    const text = problem.hints[level] ?? "";
    if (prefersReducedMotion()) {
      setShown(text);
      return;
    }
    setShown("");
    const state = { i: 0 };
    const tween = gsap.to(state, {
      i: text.length,
      duration: Math.min(1.1, 0.22 + text.length * 0.009),
      ease: "none",
      onUpdate: () => setShown(text.slice(0, Math.round(state.i))),
    });
    return () => {
      tween.kill();
    };
  }, [problem.id, problem.hints, level]);

  useEffect(() => {
    if (body.current) rise(body.current, { y: 6 });
  }, [level, problem.id]);

  const nextLocked = level + 1 < 4 && failedAttempts < (GATE[level + 1] ?? 0);
  const remaining = (GATE[level + 1] ?? 0) - failedAttempts;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", minHeight: 0, height: "100%" }}>
      <div
        className="panel"
        style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: "40px 48px", overflow: "auto" }}
      >
        <div className="eyebrow" style={{ marginBottom: 20 }}>
          Hint {level + 1} of 4 · {LEVELS[level]}
        </div>

        <div ref={body}>
          <h2 style={{ fontSize: 30, lineHeight: 1.15, margin: "0 0 28px", maxWidth: 680, minHeight: 108 }}>
            {shown}
            {shown.length < (problem.hints[level]?.length ?? 0) && (
              <span
                style={{
                  display: "inline-block",
                  width: 11,
                  height: 26,
                  background: "var(--accent)",
                  verticalAlign: "-4px",
                  marginLeft: 4,
                }}
              />
            )}
          </h2>
        </div>

        {/* The ladder as a real list of steps. Each was previously a bare
            3px <button> with no children, so it had no accessible name at all
            unless it happened to be locked (the title only appeared then), and
            a 3px hit target no pointer can reliably land on. The button is now
            padded to a ~19px target with the 3px bar drawn inside it. */}
        <div
          role="group"
          aria-label="Hint level"
          style={{ display: "flex", gap: 8, marginBottom: 20 }}
        >
          {[0, 1, 2, 3].map((i) => {
            const locked = failedAttempts < (GATE[i] ?? 0);
            const needed = (GATE[i] ?? 0) - failedAttempts;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setLevel(i)}
                disabled={locked}
                aria-current={i === level ? "step" : undefined}
                aria-label={
                  locked
                    ? `Hint ${i + 1}, ${LEVELS[i]} — locked, needs ${needed} more failed run${needed === 1 ? "" : "s"}`
                    : `Hint ${i + 1}, ${LEVELS[i]}${i === level ? " (showing)" : ""}`
                }
                title={
                  locked
                    ? `Unlocks after ${GATE[i]} failed run${GATE[i] === 1 ? "" : "s"}`
                    : undefined
                }
                style={{
                  flex: 1,
                  border: 0,
                  background: "transparent",
                  padding: "8px 0",
                  cursor: locked ? "not-allowed" : "pointer",
                  display: "block",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: 3,
                    background:
                      i === level
                        ? "var(--accent)"
                        : i < level
                          ? "var(--accent-hi)"
                          : "var(--rule-faint)",
                    opacity: locked ? 0.5 : 1,
                    transition: "background .3s",
                  }}
                />
              </button>
            );
          })}
        </div>

        {aiEnabled && (ai.loading || ai.text !== null) && (
          <div
            style={{
              borderTop: "var(--rule-w) solid var(--rule)",
              paddingTop: 16,
              marginBottom: 24,
            }}
          >
            <div
              className="eyebrow"
              style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}
            >
              <span>Coach · has read your code</span>
              {ai.ms !== null && (
                <span className="mono" style={{ color: "var(--ink-dim)", letterSpacing: 0 }}>
                  {ai.cached ? "cached" : `${(ai.ms / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
            {ai.loading ? (
              <div
                className="mono"
                style={{ fontSize: 12, color: "var(--ink-dim)", display: "flex", gap: 8 }}
              >
                <span data-ai-pulse style={{ width: 8, height: 8, background: "var(--accent)", display: "block" }} />
                thinking… the hint above is already yours to use
              </div>
            ) : (
              <div style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 680, textWrap: "pretty" }}>
                {ai.text}
              </div>
            )}
          </div>
        )}

        {problem.pitfalls && problem.pitfalls.length > 0 && (
          <div style={{ borderTop: "var(--rule-w) solid var(--rule)", paddingTop: 16, marginBottom: 24 }}>
            <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
              Where this usually goes wrong
            </div>
            {problem.pitfalls.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "8px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--ink-muted)",
                }}
              >
                <span className="mono" style={{ color: "var(--accent-hi)", flex: "none" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "auto", display: "flex", gap: 8, paddingTop: 24 }}>
          <button
            className="btn"
            disabled={level === 0}
            onClick={() => setLevel(Math.max(0, level - 1))}
            style={{ minWidth: 96 }}
          >
            Back
          </button>
          <button
            className="btn btn-primary"
            disabled={level >= 3 || nextLocked}
            onClick={() => setLevel(Math.min(3, level + 1))}
            style={{ minWidth: 190 }}
            title={nextLocked ? `Try a run first — ${remaining} more failed run(s) unlocks this` : undefined}
          >
            {level >= 3 ? "That's the whole ladder" : nextLocked ? `Run first (${remaining} to go)` : "Go further"}
            <span>→</span>
          </button>
          <button className="btn" onClick={onOpenEditor} style={{ marginLeft: "auto" }}>
            Try it in the editor <span>→</span>
          </button>
        </div>
      </div>

      <aside style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
            The problem
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-muted)", whiteSpace: "pre-wrap" }}>
            {problem.prompt}
          </div>
        </div>

        {problem.examples && problem.examples.length > 0 && (
          <div>
            <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
              Examples
            </div>
            {problem.examples.map((ex, i) => (
              <div
                key={i}
                className="mono"
                style={{
                  background: "var(--surface)",
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.6,
                  marginBottom: 8,
                  color: "var(--ink-muted)",
                }}
              >
                <div>{ex.input}</div>
                <div style={{ color: "var(--ink)" }}>→ {ex.output}</div>
                {ex.note && <div style={{ color: "var(--ink-dim)", marginTop: 6 }}>{ex.note}</div>}
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 10 }}>
            Also in {problem.topic}
          </div>
          {siblings.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                padding: "8px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                fontSize: 13,
                color: s.id === problem.id ? "var(--ink)" : "var(--ink-muted)",
                fontWeight: s.id === problem.id ? 600 : 400,
              }}
            >
              <span className="mono" style={{ fontSize: 11, width: 20, color: "var(--accent-hi)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ flex: 1 }}>{s.title}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{s.difficulty}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--ink-muted)",
            borderTop: "var(--rule-w) solid var(--rule)",
            paddingTop: 12,
          }}
        >
          Hints are progressive: orient → probe → nudge → walk. Levels 3 and 4 unlock only after
          you have actually run something, so the ladder cannot be skipped to the answer.
        </div>
      </aside>
    </div>
  );
}
