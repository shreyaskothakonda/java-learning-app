/**
 * Concept pages — the reference half of the app.
 *
 * The JS platform this follows had 58 GSAP visualisations here. None are
 * ported: half explained JavaScript semantics that do not exist in Java, and
 * the rest were weeks of animation on the least differentiated part of the
 * product. What replaces them is the thing an animation cannot do — every
 * example is a real program you can edit and run, and the output printed
 * beside it is checked by the build.
 *
 * So the page's claim and the app's behaviour cannot drift apart, and the
 * learner can always answer "what if I change this?" by changing it.
 */

import { useEffect, useRef, useState } from "react";
import { CONCEPTS, getConcept } from "@content/concepts/index.js";
import type { Concept, ConceptExample, QuizQuestion } from "@content/concepts/types.js";
import { getProblem } from "@content/index.js";
import { TOPICS, TRACKS, topicLabel } from "@content/manifest.js";
import type { SnippetResult } from "@shared/types/runner.js";
import { rise } from "../design/motion.js";
import type { Screen } from "../components/Shell.js";

type Props = { onNavigate: (screen: Screen, problemId?: string) => void };

export function Concepts({ onNavigate }: Props): React.JSX.Element {
  const [slug, setSlug] = useState<string | null>(null);
  const concept = slug !== null ? getConcept(slug) : undefined;

  return concept ? (
    <Detail concept={concept} onBack={() => setSlug(null)} onNavigate={onNavigate} />
  ) : (
    <Index onOpen={setSlug} />
  );
}

// ------------------------------------------------------------------- index

function Index({ onOpen }: { onOpen: (slug: string) => void }): React.JSX.Element {
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (head.current) rise(head.current, { y: 8 });
  }, []);

  return (
    <section style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div ref={head} style={{ padding: "40px 48px 24px", borderBottom: "var(--rule-w) solid var(--rule)" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Concepts
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1, margin: "0 0 12px", maxWidth: 680 }}>
          The parts of Java that catch people out
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-muted)", maxWidth: 640, margin: 0 }}>
          Every example on these pages is a complete program. You can edit it and run it, and
          the output printed beside it is checked whenever the app is built — so a page cannot
          quietly start lying about what Java does.
        </p>
      </div>

      {TRACKS.map(({ track, label }) => {
        const topics = TOPICS[track]
          .map((t) => ({ topic: t.topic, concepts: CONCEPTS.filter((c) => c.topic === t.topic) }))
          .filter((t) => t.concepts.length > 0);
        if (topics.length === 0) return null;

        return (
          <div key={track} style={{ padding: "24px 48px 8px" }}>
            <div className="eyebrow eyebrow-muted" style={{ marginBottom: 16 }}>
              {label}
            </div>
            {topics.map(({ topic, concepts }) => (
              <div key={topic} style={{ marginBottom: 24 }}>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 8 }}
                >
                  {topicLabel(topic)}
                </div>
                {concepts.map((c, i) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onOpen(c.slug)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: 0,
                      borderTop: i === 0 ? "var(--rule-w) solid var(--rule)" : "1px solid var(--rule-soft)",
                      padding: "16px 0",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{c.title}</div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "var(--ink-muted)",
                        maxWidth: 700,
                      }}
                    >
                      {c.summary}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}
                    >
                      {c.examples.length} runnable example{c.examples.length === 1 ? "" : "s"} ·{" "}
                      {c.quiz.length} question{c.quiz.length === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------------------------ detail

function Detail({
  concept,
  onBack,
  onNavigate,
}: {
  concept: Concept;
  onBack: () => void;
  onNavigate: (screen: Screen, problemId?: string) => void;
}): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) rise(body.current, { y: 8 });
  }, [concept.slug]);

  return (
    <section style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div ref={body} style={{ padding: "32px 48px 64px", maxWidth: 820 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 24, paddingInline: 0 }}>
          ← All concepts
        </button>

        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {topicLabel(concept.topic)}
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: "0 0 16px" }}>{concept.title}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--ink-muted)", margin: "0 0 32px" }}>
          {concept.summary}
        </p>

        {concept.sections.map((s) => (
          <div key={s.heading} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 12px",
                paddingTop: 16,
                borderTop: "var(--rule-w) solid var(--rule)",
              }}
            >
              {s.heading}
            </h2>
            <Prose text={s.body} />
          </div>
        ))}

        <h2
          style={{
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 16px",
            paddingTop: 16,
            borderTop: "var(--rule-w) solid var(--rule)",
          }}
        >
          Run it yourself
        </h2>
        {concept.examples.map((ex, i) => (
          <Example key={i} example={ex} />
        ))}

        {concept.pitfalls.length > 0 && (
          <>
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "32px 0 16px",
                paddingTop: 16,
                borderTop: "var(--rule-w) solid var(--rule)",
              }}
            >
              Where this goes wrong
            </h2>
            {concept.pitfalls.map((p, i) => (
              <div
                key={i}
                style={{
                  borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                  padding: "16px 0",
                }}
              >
                <div className="mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <div style={{ color: "var(--accent)" }}>✕ {p.wrong}</div>
                  <div style={{ color: "var(--ok)" }}>✓ {p.right}</div>
                </div>
                <div
                  style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-muted)", marginTop: 8 }}
                >
                  {p.why}
                </div>
              </div>
            ))}
          </>
        )}

        {concept.quiz.length > 0 && (
          <>
            <h2
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "32px 0 16px",
                paddingTop: 16,
                borderTop: "var(--rule-w) solid var(--rule)",
              }}
            >
              Check yourself
            </h2>
            {concept.quiz.map((q, i) => (
              <Quiz key={i} q={q} index={i} />
            ))}
          </>
        )}

        {(concept.practice?.length ?? 0) > 0 && (
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "var(--rule-w) solid var(--rule)" }}>
            <div className="eyebrow eyebrow-muted" style={{ marginBottom: 12 }}>
              Practise it
            </div>
            {concept.practice!.map((id) => {
              const p = getProblem(id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  className="btn"
                  onClick={() => onNavigate("practice", id)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                >
                  {p.title} <span>→</span>
                </button>
              );
            })}
          </div>
        )}

        {(concept.seeAlso?.length ?? 0) > 0 && (
          <div style={{ marginTop: 24, fontSize: 13, color: "var(--ink-muted)" }}>
            See also:{" "}
            {concept.seeAlso!.map((s, i) => {
              const other = getConcept(s);
              if (!other) return null;
              return (
                <span key={s}>
                  {i > 0 && " · "}
                  {other.title}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** Paragraphs, with `backticks` as inline code. No Markdown parser for two features. */
function Prose({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {text.split("\n\n").map((para, i) => (
        <p
          key={i}
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--ink-muted)",
            margin: i === 0 ? "0 0 12px" : "12px 0",
            textWrap: "pretty",
          }}
        >
          {para.split(/`([^`]+)`/).map((part, j) =>
            j % 2 === 1 ? (
              <code
                key={j}
                className="mono"
                style={{ fontSize: 13, color: "var(--ink)", background: "var(--surface)", padding: "2px 4px" }}
              >
                {part}
              </code>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

// ----------------------------------------------------------------- example

/**
 * An editable, runnable example.
 *
 * The output shown before you press Run is the one the build verified. Once
 * you run it, what you see is what the JVM on this machine actually printed —
 * and the two are labelled differently, because after an edit they are not the
 * same claim.
 */
function Example({ example }: { example: ConceptExample }): React.JSX.Element {
  const [code, setCode] = useState(example.code);
  const [result, setResult] = useState<SnippetResult | null>(null);
  const [running, setRunning] = useState(false);
  const edited = code !== example.code;

  const run = (): void => {
    setRunning(true);
    void window.api.java
      .runSnippet({ code })
      .then((r) => {
        setResult(r);
        setRunning(false);
      })
      .catch(() => setRunning(false));
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{example.caption}</div>

      <textarea
        className="mono"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        aria-label={`Example code: ${example.caption}`}
        rows={code.split("\n").length + 1}
        style={{
          width: "100%",
          background: "var(--surface)",
          color: "var(--ink)",
          border: 0,
          borderLeft: "var(--rule-w) solid var(--rule)",
          padding: 16,
          fontSize: 12,
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button className="btn" onClick={run} disabled={running}>
          {running ? "Running…" : "Run"}
        </button>
        {edited && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setCode(example.code);
              setResult(null);
            }}
          >
            Reset
          </button>
        )}
        {result && (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: "auto" }}>
            {result.compileMs} ms compile · {result.runtimeMs} ms run
          </span>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow eyebrow-muted" style={{ marginBottom: 6 }}>
          {result ? "What it just printed" : "What it prints"}
        </div>
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: 12,
            background: "var(--surface)",
            fontSize: 12,
            lineHeight: 1.6,
            color: result && !result.ok ? "var(--accent-hi)" : "var(--ink-muted)",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          {result
            ? result.ok
              ? result.stdout.replace(/\n+$/, "")
              : result.diagnostics.length > 0
                ? result.diagnostics.map((d) => `line ${d.line}: ${d.message}`).join("\n")
                : result.timedOut
                  ? "timed out"
                  : result.stderr || "did not run"
            : example.expectedOutput}
        </pre>
      </div>

      {example.note && (
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-dim)", marginTop: 10 }}>
          {example.note}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- quiz

function Quiz({ q, index }: { q: QuizQuestion; index: number }): React.JSX.Element {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--accent-hi)", paddingTop: 2 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, lineHeight: 1.5 }}>{q.question}</span>
      </div>

      <div role="group" aria-label={q.question} style={{ marginLeft: 24 }}>
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          return (
            <button
              key={i}
              type="button"
              onClick={() => !answered && setPicked(i)}
              disabled={answered}
              /* Once answered, right and wrong are shown with colour alone —
                 which is nothing at all to a screen reader. The accessible
                 name carries the same information the border does. It still
                 contains the visible text, as 2.5.3 requires. */
              aria-label={
                answered
                  ? `Option ${i + 1}: ${opt} — ${
                      isAnswer ? "the correct answer" : isPicked ? "your answer, incorrect" : "not chosen"
                    }`
                  : `Option ${i + 1}: ${opt}`
              }
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                font: "inherit",
                fontSize: 13,
                background: "transparent",
                border: 0,
                borderLeft: `3px solid ${
                  answered && isAnswer
                    ? "var(--ok)"
                    : answered && isPicked
                      ? "var(--accent)"
                      : "var(--rule-faint)"
                }`,
                padding: "10px 12px",
                marginBottom: 4,
                color: answered && !isAnswer && !isPicked ? "var(--ink-dim)" : "var(--ink-muted)",
                cursor: answered ? "default" : "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          style={{
            marginLeft: 24,
            marginTop: 10,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--ink-muted)",
            borderTop: "1px solid var(--rule-soft)",
            paddingTop: 10,
          }}
        >
          {/* The explanation shows whether they were right or wrong. Getting it
              right for the wrong reason is the failure this catches. */}
          <span style={{ color: picked === q.answer ? "var(--ok)" : "var(--accent)", fontWeight: 700 }}>
            {picked === q.answer ? "Correct. " : "Not quite. "}
          </span>
          {q.explain}
        </div>
      )}
    </div>
  );
}
