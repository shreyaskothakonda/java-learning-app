/**
 * Practice — Coach, Editor and Tutor as one 300%-wide track that slides.
 *
 * The track is the design's idea and it is a good one: the panes are the same
 * task seen three ways, so they should feel adjacent rather than replaced.
 * GSAP drives the transform on the symmetric curve, because this transition
 * runs in both directions and an asymmetric ease would make going back feel
 * different from going forward.
 *
 * The Editor sits in the MIDDLE deliberately. Both places you go for help are
 * then one step from the work, in opposite directions, and ⌘1/⌘2/⌘3 read left
 * to right — which is also the order the panes are in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { gsap } from "gsap";

import type { Problem } from "@content/types.js";
import type { RunResult } from "@shared/types/runner.js";
import { CoachPane } from "../components/CoachPane.js";
import { TutorPane } from "../components/TutorPane.js";
import { useProgress } from "../lib/progress.js";
import { useAiProviders } from "../lib/useAiProviders.js";
import { useDraft } from "../lib/useDraft.js";
import { SegmentedControl } from "../components/SegmentedControl.js";
import { TestResults } from "../components/TestResults.js";
import { DUR, EASE, dur } from "../design/motion.js";
import { EDITOR_OPTIONS, JAVELIN_THEME, monaco } from "../design/monaco-setup.js";

type Mode = "coach" | "editor" | "tutor";

/** Where each pane sits on the track, as a percentage of one pane's width. */
const OFFSET: Record<Mode, number> = { coach: 0, editor: -100 / 3, tutor: -200 / 3 };

type Props = { problem: Problem };

function userFileName(p: Problem): string {
  if (p.kind === "stdio") return "Main.java";
  if (p.kind === "class") return `${p.classSpec.className}.java`;
  return "Solution.java";
}

export function Practice({ problem }: Props): React.JSX.Element {
  const { progress, record, setHintLevel } = useProgress();
  const { anyAvailable: aiEnabled } = useAiProviders();
  const [mode, setMode] = useState<Mode>("coach");
  const { code, setCode, ready, reset } = useDraft(problem.id, problem.starterCode);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [hintLevel, setLocalHintLevel] = useState(0);

  // The gate reads from persisted history, so closing the app is not a way to
  // reset it — and equally, yesterday's three failed runs still count today.
  const row = progress[problem.id];
  const failedAttempts = row?.failedAttempts ?? 0;

  // Only a VISIBLE failing case may be described to the model. A hidden one
  // would be quoted straight back and the visible/hidden split would stop
  // meaning anything.
  const firstVisibleFailure = (() => {
    const c = result?.caseResults.find((x) => !x.passed && !x.hidden);
    if (!c) return null;
    return [
      c.input ? `input: ${c.input}` : "",
      c.expected ? `expected: ${c.expected}` : "",
      c.actual ? `got: ${c.actual}` : "",
    ].filter(Boolean).join("\n") || null;
  })();

  const track = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Kept in a ref so the keyboard handler never closes over stale code.
  const latest = useRef({ code, running, mode, hintLevel });
  latest.current = { code, running, mode, hintLevel };

  useEffect(() => {
    setResult(null);
    setLocalHintLevel(0);
    setMode("coach");
  }, [problem.id]);

  useEffect(() => {
    if (!track.current) return;
    gsap.to(track.current, {
      xPercent: OFFSET[mode],
      duration: dur(DUR.panel),
      ease: EASE.inOut,
    });
  }, [mode]);

  const run = useCallback(
    async (submit: boolean) => {
      if (latest.current.running) return;
      setRunning(true);
      setResult(null);
      try {
        const res = await window.api.java.run({
          runId: crypto.randomUUID(),
          problemId: problem.id,
          userCode: latest.current.code,
          visibleOnly: !submit,
        });
        setResult(res);
        const ok = res.phase === "ok" && res.caseResults.every((c) => c.passed);

        await record({
          problemId: problem.id,
          code: latest.current.code,
          status:
            res.phase === "compile" ? "compile_error" : ok ? "passed" : "failed",
          submitted: submit,
          testsPassed: res.caseResults.filter((c) => c.passed).length,
          testsTotal: res.caseResults.length,
          compileMs: res.compileMs,
          runtimeMs: res.runtimeMs,
          hintLevel: latest.current.hintLevel,
        });

        // Compiler diagnostics become editor markers. This is the payoff for
        // writing the learner's file verbatim: the line and column line up
        // exactly with what they are looking at.
        const model = editorRef.current?.getModel();
        if (model) {
          monaco.editor.setModelMarkers(
            model,
            "javac",
            res.diagnostics.map((d) => ({
              severity:
                d.severity === "error"
                  ? monaco.MarkerSeverity.Error
                  : monaco.MarkerSeverity.Warning,
              message: d.detail ? `${d.message}\n${d.detail}` : d.message,
              startLineNumber: d.line,
              startColumn: d.column,
              endLineNumber: d.line,
              endColumn: d.column + 1,
            })),
          );
        }
      } catch (e) {
        setResult({
          phase: "run",
          diagnostics: [],
          caseResults: [],
          consoleLogs: [],
          error: (e as Error).message,
          compileMs: 0,
          runtimeMs: 0,
        });
      } finally {
        setRunning(false);
      }
    },
    [problem.id, record],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") {
        e.preventDefault();
        setMode("coach");
      } else if (e.key === "2") {
        e.preventDefault();
        setMode("editor");
      } else if (e.key === "3") {
        e.preventDefault();
        setMode("tutor");
      } else if (e.key === "Enter") {
        e.preventDefault();
        setMode("editor");
        void run(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void run(false));
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => void run(true),
    );
  };

  if (!ready) {
    return (
      <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ color: "var(--ink-dim)", fontSize: 12 }}>
          loading…
        </span>
      </section>
    );
  }

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          height: 52,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 24px",
          borderBottom: "var(--rule-w) solid var(--rule)",
        }}
      >
        <SegmentedControl<Mode>
          semantics="tabs"
          label="Practice view"
          value={mode}
          options={[
            { value: "coach", label: "Coach", controls: "pane-coach", minWidth: 110 },
            { value: "editor", label: "Editor", controls: "pane-editor", minWidth: 110 },
            { value: "tutor", label: "Tutor", controls: "pane-tutor", minWidth: 110 },
          ]}
          onChange={setMode}
        />
        <div style={{ fontSize: 13, color: "var(--ink-muted)", minWidth: 0 }}>
          {problem.topic} ·{" "}
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{problem.title}</span>
        </div>
        <div className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-dim)" }}>
          ⌘1 coach · ⌘2 editor · ⌘3 tutor · ⌘↵ run · ⌘⇧↵ submit
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div ref={track} style={{ display: "flex", width: "300%", height: "100%" }}>
          <div
            id="pane-coach"
            role="tabpanel"
            aria-label="Coach"
            /* `inert`, not `aria-hidden`. Both panes stay mounted so the track
               can slide, so the off-screen one still holds focusable controls.
               aria-hidden would hide it from a screen reader while leaving it
               tabbable — the exact mismatch WCAG 4.1.2 is about. */
            inert={mode !== "coach"}
            style={{ width: `${100 / 3}%`, height: "100%", minHeight: 0 }}
          >
            <CoachPane
              problem={problem}
              failedAttempts={failedAttempts}
              userCode={code}
              failingCase={firstVisibleFailure}
              aiEnabled={aiEnabled}
              level={hintLevel}
              onLevelChange={(l) => {
                setLocalHintLevel(l);
                setHintLevel(problem.id, l);
              }}
              onOpenEditor={() => setMode("editor")}
            />
          </div>

          <div
            id="pane-editor"
            role="tabpanel"
            aria-label="Editor"
            inert={mode !== "editor"}
            style={{
              width: `${100 / 3}%`,
              height: "100%",
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 400px",
              minHeight: 0,
            }}
          >
            <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div
                className="mono"
                style={{
                  height: 36,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  borderBottom: "1px solid var(--rule)",
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    padding: "0 16px",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    borderRight: "1px solid var(--rule)",
                    background: "var(--surface)",
                  }}
                >
                  {userFileName(problem)}
                </div>
                <div style={{ marginLeft: "auto", padding: "0 16px", color: "var(--ink-dim)" }}>
                  JDK 26 · UTF-8
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  language="java"
                  theme={JAVELIN_THEME}
                  value={code}
                  onChange={(v) => setCode(v ?? "")}
                  onMount={onMount}
                  options={EDITOR_OPTIONS}
                  loading={
                    <div className="mono" style={{ color: "var(--ink-dim)", fontSize: 12, padding: 20 }}>
                      loading editor…
                    </div>
                  }
                />
              </div>

              <div
                style={{
                  flex: "none",
                  height: 48,
                  borderTop: "var(--rule-w) solid var(--rule)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 16px",
                }}
              >
                <button
                  className="btn btn-primary"
                  onClick={() => void run(false)}
                  disabled={running}
                  style={{ minWidth: 140 }}
                >
                  {running ? "Running…" : "Run"}
                  <span className="mono" style={{ opacity: 0.8 }}>
                    ⌘↵
                  </span>
                </button>
                <button className="btn" onClick={() => void run(true)} disabled={running} style={{ minWidth: 120 }}>
                  Submit
                  <span className="mono" style={{ opacity: 0.6 }}>
                    ⌘⇧↵
                  </span>
                </button>
                <button className="btn btn-ghost" onClick={reset} disabled={running}>
                  Reset
                </button>
                <button className="btn btn-ghost" onClick={() => setMode("coach")}>
                  Hints →
                </button>
                <button className="btn btn-ghost" onClick={() => setMode("tutor")}>
                  Ask the tutor →
                </button>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-dim)" }}>
                  {row?.status === "solved"
                    ? `solved${row.bestRuntimeMs !== null ? ` · best ${row.bestRuntimeMs} ms` : ""}`
                    : failedAttempts > 0
                      ? `${failedAttempts} failed run${failedAttempts === 1 ? "" : "s"}`
                      : ""}
                </span>
              </div>
            </div>

            <TestResults
              result={result}
              running={running}
              problemTitle={problem.title}
              problemId={problem.id}
              userCode={code}
              aiEnabled={aiEnabled}
              solved={row?.status === "solved"}
              {...(problem.complexity !== undefined ? { referenceComplexity: problem.complexity } : {})}
            />
          </div>

          <div
            id="pane-tutor"
            role="tabpanel"
            aria-label="Tutor"
            inert={mode !== "tutor"}
            style={{ width: `${100 / 3}%`, height: "100%", minHeight: 0 }}
          >
            <TutorPane
              problem={problem}
              userCode={code}
              failingCase={firstVisibleFailure}
              aiEnabled={aiEnabled}
              onOpenEditor={() => setMode("editor")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
