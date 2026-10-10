/**
 * The post-solve review.
 *
 * Appears only once the problem is actually solved, and only when asked for —
 * both because the plan calls for an explicit opt-in, and because this is the
 * single feature whose prompt contains the reference solution. The real gate
 * is in the main process (AiService.review refuses unless the database says
 * solved); this component not rendering is a courtesy, not a control.
 *
 * No streaming here, deliberately. The reply is one JSON object that only
 * makes sense complete, and half a parsed object is nothing — so it waits, and
 * says how long it is likely to wait rather than spinning silently.
 */

import { useEffect, useRef, useState } from "react";
import type { CodeReview } from "@shared/types/ai.js";
import { rise } from "../design/motion.js";

type Props = {
  problemId: string;
  userCode: string;
  solved: boolean;
  aiEnabled: boolean;
  /** The problem's authored complexity, shown beside the model's reading. */
  reference?: { time: string; space: string };
};

export function SolutionReview({
  problemId,
  userCode,
  solved,
  aiEnabled,
  reference,
}: Props): React.JSX.Element | null {
  const [review, setReview] = useState<CodeReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ ms: number; cached: boolean } | null>(null);
  const [waited, setWaited] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  // Measured on the provider here: 14.1s, 16.6s, 26.4s. The first version of
  // this component said "give it ten seconds or so", which was wrong every
  // single time — the same mistake the tutor pane made before it was measured.
  // A counter cannot be wrong, so the wait is counted rather than predicted.
  useEffect(() => {
    if (!loading) {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [loading]);

  // A review describes one version of the code. Editing invalidates it, and
  // showing the old one against new code would be quietly wrong.
  useEffect(() => {
    setReview(null);
    setNote(null);
    setMeta(null);
  }, [problemId, userCode]);

  useEffect(() => {
    if (review && body.current) rise(body.current, { y: 6 });
  }, [review]);

  if (!solved) return null;

  const ask = (): void => {
    setLoading(true);
    setNote(null);
    void window.api.ai
      .review({ problemId, userCode })
      .then((res) => {
        setLoading(false);
        setReview(res.review);
        setMeta({ ms: res.ms, cached: res.cached });
        setNote(res.rejected ?? null);
      })
      .catch((e: Error) => {
        setLoading(false);
        setNote(e.message);
      });
  };

  return (
    <div style={{ borderTop: "var(--rule-w) solid var(--rule)", padding: "16px 20px" }}>
      <div
        className="eyebrow"
        style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span>Review</span>
        {meta && (
          <span className="mono" style={{ letterSpacing: 0, color: "var(--ink-faint)" }}>
            {meta.cached ? "cached" : `${(meta.ms / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {!review && !loading && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-muted)", marginBottom: 12 }}>
            {aiEnabled
              ? "Solved. A review compares your approach with the reference and points at the Java-specific parts — the boxing, the library method, the idiom."
              : "Solved. A review needs an AI provider; Settings has the options."}
          </div>
          <button className="btn" onClick={ask} disabled={!aiEnabled} style={{ width: "100%" }}>
            Review my solution <span>→</span>
          </button>
        </>
      )}

      {loading && (
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>
          reading your solution{waited > 0 ? ` · ${waited}s` : "…"}
          <div style={{ color: "var(--ink-faint)", marginTop: 4 }}>
            this one waits for the whole reply — half a review is nothing
          </div>
        </div>
      )}

      {review && (
        <div ref={body}>
          <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 16, textWrap: "pretty" }}>
            {review.verdict}
          </div>

          {(review.complexity.time !== "" || reference) && (
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow eyebrow-muted" style={{ marginBottom: 8 }}>
                Complexity
              </div>
              <div
                className="mono"
                style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-muted)" }}
              >
                {review.complexity.time !== "" && (
                  <div>
                    yours · {review.complexity.time} time
                    {review.complexity.space !== "" && ` · ${review.complexity.space} space`}
                  </div>
                )}
                {/* The authored figure sits beside the model's reading rather
                    than being replaced by it: one is checked content, the
                    other is a model's opinion, and the difference is the
                    interesting part. */}
                {reference && (
                  <div style={{ color: "var(--ink-faint)" }}>
                    reference · {reference.time} time · {reference.space} space
                  </div>
                )}
              </div>
              {review.complexity.note !== "" && (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-muted)", marginTop: 8 }}>
                  {review.complexity.note}
                </div>
              )}
            </div>
          )}

          <Section label="Worth keeping" items={review.strengths} />
          <Section
            label="Worth changing"
            items={review.improvements.map((i) => (i.why === "" ? i.what : `${i.what} — ${i.why}`))}
            accent
          />
          <Section label="Java idiom" items={review.idiom} />

          <button
            className="btn btn-ghost"
            onClick={ask}
            style={{ marginTop: 12, paddingInline: 0 }}
          >
            Ask again
          </button>
        </div>
      )}

      {note !== null && !loading && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-dim)", marginTop: 12 }}>
          {note === "no provider"
            ? "No AI provider is configured."
            : note === "not solved yet"
              ? "Submit a passing solution first — a review is not a hint."
              : `No review this time — ${note}.`}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  items,
  accent,
}: {
  label: string;
  items: string[];
  accent?: boolean;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="eyebrow eyebrow-muted" style={{ marginBottom: 8 }}>
        {label}
      </div>
      {items.map((text, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 10,
            padding: "6px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--ink-muted)",
          }}
        >
          <span
            className="mono"
            style={{ color: accent ? "var(--accent)" : "var(--accent-hi)", flex: "none" }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}
