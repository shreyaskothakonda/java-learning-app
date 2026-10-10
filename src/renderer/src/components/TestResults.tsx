/**
 * The test-case rail.
 *
 * Rows reveal on a stagger as a run completes. The prototype used 320ms per
 * row, which is a demo pace — ten rows would take three seconds. Apple's own
 * list staggers are 30-50ms: still legibly sequential, but the list is
 * complete before you have finished looking at it.
 *
 * Hidden cases are summarised rather than shown. That is deliberate and
 * carried over from the JS platform: a visible expected value for a hidden
 * case makes the case hardcodeable, and the whole point of hidden cases is
 * that they cannot be.
 */

import { useEffect, useRef } from "react";
import type { CaseResult, RunResult } from "@shared/types/runner.js";
import { revealRows } from "../design/motion.js";
import { ErrorExplainer } from "./ErrorExplainer.js";
import { SolutionReview } from "./SolutionReview.js";

function Mark({ passed }: { passed: boolean }): React.JSX.Element {
  return (
    <span style={{ fontWeight: 800, color: passed ? "var(--ok)" : "var(--accent)" }}>
      {passed ? "✓" : "✕"}
    </span>
  );
}

function Row({ c }: { c: CaseResult }): React.JSX.Element {
  return (
    <div
      data-case-row
      style={{
        display: "grid",
        gridTemplateColumns: "20px minmax(0,1fr) auto",
        gap: 12,
        padding: "12px 20px",
        borderBottom: "1px solid var(--rule-soft)",
        fontFamily: "var(--mono)",
        fontSize: 12,
        background: c.passed ? "transparent" : "rgba(236, 48, 19, 0.07)",
      }}
    >
      <Mark passed={c.passed} />
      <div style={{ minWidth: 0 }}>
        {c.hidden ? (
          <div style={{ color: "var(--ink-muted)" }}>
            hidden case{c.description ? ` · ${c.description}` : ""}
          </div>
        ) : (
          <>
            {c.input !== undefined && (
              <div style={{ color: "var(--ink-muted)", overflowWrap: "anywhere" }}>{c.input}</div>
            )}
            {!c.passed && c.expected !== undefined && (
              <div style={{ color: "var(--ink)", marginTop: 2, overflowWrap: "anywhere" }}>
                expected {c.expected}
                {c.actual !== undefined && (
                  <span style={{ color: "var(--accent-hi)" }}> · got {c.actual}</span>
                )}
              </div>
            )}
          </>
        )}
        {c.error && (
          <div
            style={{
              color: "var(--accent-hi)",
              marginTop: 6,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {c.error}
          </div>
        )}
      </div>
      <span style={{ color: "var(--ink-dim)", whiteSpace: "nowrap" }}>
        {c.timedOut ? "timeout" : `${c.durationMs.toFixed(c.durationMs < 10 ? 2 : 0)} ms`}
      </span>
    </div>
  );
}

type Props = {
  result: RunResult | null;
  running: boolean;
  problemTitle: string;
  problemId: string;
  userCode: string;
  aiEnabled: boolean;
  /** From persisted progress: only a passing SUBMIT counts. */
  solved: boolean;
  referenceComplexity?: { time: string; space: string };
};

export function TestResults({
  result,
  running,
  problemTitle,
  problemId,
  userCode,
  aiEnabled,
  solved,
  referenceComplexity,
}: Props): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result || !list.current) return;
    const rows = list.current.querySelectorAll("[data-case-row]");
    if (rows.length > 0) revealRows(rows);
  }, [result]);

  const passed = result?.caseResults.filter((c) => c.passed).length ?? 0;
  const total = result?.caseResults.length ?? 0;

  return (
    <aside style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <div className="eyebrow eyebrow-muted">Test cases</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", textAlign: "right" }}>
          {problemTitle}
        </div>
      </div>

      <div ref={list} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {!result && !running && (
          <div style={{ padding: "20px", color: "var(--ink-muted)", fontSize: 13, lineHeight: 1.5 }}>
            Run to see the visible cases. Submit also runs the hidden ones.
          </div>
        )}
        {running && (
          <div className="mono" style={{ padding: "20px", color: "var(--accent-hi)", fontSize: 12 }}>
            compiling…
          </div>
        )}

        {result?.phase === "compile" && (
          <div style={{ padding: "16px 20px" }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Did not compile
            </div>
            {result.diagnostics.map((d, i) => (
              <div key={i} style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
                <div className="mono" style={{ color: "var(--accent-hi)" }}>
                  line {d.line}, column {d.column}
                </div>
                <div style={{ color: "var(--ink)", marginTop: 2 }}>{d.message}</div>
                {d.detail && (
                  <div className="mono" style={{ color: "var(--ink-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                    {d.detail}
                  </div>
                )}
              </div>
            ))}
            {result.error && (
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", whiteSpace: "pre-wrap" }}>
                {result.error}
              </div>
            )}
            {aiEnabled && result.diagnostics[0] && (
              <ErrorExplainer
                problemId={problemId}
                diagnostic={result.diagnostics[0]}
                userCode={userCode}
              />
            )}
          </div>
        )}

        {result?.phase !== "compile" && result?.caseResults.map((c) => <Row key={c.index} c={c} />)}

        {result && result.phase !== "compile" && result.error && (
          <div
            style={{
              padding: "12px 20px",
              color: "var(--accent-hi)",
              fontSize: 12,
              fontFamily: "var(--mono)",
              whiteSpace: "pre-wrap",
            }}
          >
            {result.error}
          </div>
        )}

        {result && result.consoleLogs.length > 0 && (
          <div style={{ borderTop: "var(--rule-w) solid var(--rule)", padding: "12px 20px" }}>
            <div className="eyebrow eyebrow-muted" style={{ marginBottom: 8 }}>
              Console
            </div>
            <div
              className="mono"
              style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-muted)", whiteSpace: "pre-wrap" }}
            >
              {result.consoleLogs.join("\n")}
            </div>
          </div>
        )}
        <SolutionReview
          problemId={problemId}
          userCode={userCode}
          solved={solved}
          aiEnabled={aiEnabled}
          {...(referenceComplexity !== undefined ? { reference: referenceComplexity } : {})}
        />
      </div>

      <div
        style={{
          flex: "none",
          padding: "14px 20px",
          borderTop: "var(--rule-w) solid var(--rule)",
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--ink-muted)" }}>
          {result ? (
            result.phase === "compile" ? (
              "compile failed"
            ) : (
              <>
                <strong style={{ color: passed === total ? "var(--ok)" : "var(--accent-hi)" }}>
                  {passed}/{total}
                </strong>{" "}
                passed
              </>
            )
          ) : (
            "not run yet"
          )}
        </span>
        {result && (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
            {result.compileMs} ms compile · {result.runtimeMs} ms run
          </span>
        )}
      </div>
    </aside>
  );
}
