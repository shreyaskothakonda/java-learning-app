/**
 * Onboarding — four questions, then you are in.
 *
 * The layout is the canvas's: a left column that asks, a right column on the
 * grid field that accumulates the answers. Step four asks how you want to
 * navigate, so the choice is made once by the person who has to live with it
 * rather than defaulted silently — and Settings can change it later.
 */

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  GOAL_LABEL,
  LEVEL_LABEL,
  NAV_LABEL,
  type Goal,
  type Level,
  type NavLayout,
  type Settings,
} from "@shared/types/settings.js";
import { rise } from "../design/motion.js";

type Draft = Pick<Settings, "goal" | "level" | "dailyMinutes" | "nav">;

type Step = {
  key: keyof Draft;
  title: string;
  body: string;
  options: { value: string | number; label: string; hint: string }[];
};

const STEPS: Step[] = [
  {
    key: "goal",
    title: "What are you aiming at?",
    body: "This sets which track leads, not what you are allowed to open. Everything stays available.",
    options: [
      { value: "backend", label: GOAL_LABEL.backend, hint: "collections, generics, concurrency" },
      { value: "interviews", label: GOAL_LABEL.interviews, hint: "data structures and algorithms" },
      { value: "contests", label: GOAL_LABEL.contests, hint: "fast I/O, tight time limits" },
    ],
  },
  {
    key: "level",
    title: "How much Java do you already have?",
    body: "Be honest rather than optimistic — the ladder is easier to climb from the right rung.",
    options: [
      { value: "new", label: LEVEL_LABEL.new, hint: "start at syntax" },
      { value: "some", label: LEVEL_LABEL.some, hint: "start at collections" },
      { value: "confident", label: LEVEL_LABEL.confident, hint: "start at algorithms" },
    ],
  },
  {
    key: "dailyMinutes",
    title: "How long per day?",
    body: "Used to size a session. Consistency beats volume, and a short session you actually finish beats a long one you abandon.",
    options: [
      { value: 20, label: "20 minutes", hint: "one problem" },
      { value: 40, label: "40 minutes", hint: "two, with the coach" },
      { value: 60, label: "60 minutes", hint: "a full sitting" },
    ],
  },
  {
    key: "nav",
    title: "How do you want to move around?",
    body: "Both reach everything, and ⌘K works either way. You can switch whenever you like in Settings.",
    options: [
      { value: "tabs", label: NAV_LABEL.tabs, hint: "four across the title bar" },
      { value: "sidebar", label: NAV_LABEL.sidebar, hint: "a rail listing every problem" },
    ],
  },
];

type Props = { onDone: (draft: Draft) => void };

export function Onboarding({ onDone }: Props): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    goal: DEFAULT_SETTINGS.goal,
    level: DEFAULT_SETTINGS.level,
    dailyMinutes: DEFAULT_SETTINGS.dailyMinutes,
    nav: DEFAULT_SETTINGS.nav,
  });
  const body = useRef<HTMLDivElement>(null);
  const current = STEPS[step]!;

  useEffect(() => {
    if (body.current) rise(body.current, { y: 10 });
  }, [step]);

  function pick(value: string | number): void {
    setDraft((d) => ({ ...d, [current.key]: value }) as Draft);
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  const summary: { k: string; v: string }[] = [
    { k: "Goal", v: GOAL_LABEL[draft.goal as Goal] },
    { k: "Level", v: LEVEL_LABEL[draft.level as Level] },
    { k: "Daily", v: `${draft.dailyMinutes} minutes` },
    { k: "Navigation", v: NAV_LABEL[draft.nav as NavLayout] },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--window)" }}>
      <header
        style={{
          height: 44,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px 0 90px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: "0.06em",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <span style={{ width: 14, height: 14, background: "var(--accent)", display: "block" }} />
        JAVELIN
      </header>
      <section style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
      <div className="panel" style={{ padding: "56px 64px", display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div className="eyebrow">
          Setup · step {step + 1} of {STEPS.length}
        </div>
        <div style={{ display: "flex", gap: 4, margin: "14px 0 48px" }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                height: 3,
                flex: 1,
                background: i <= step ? "var(--accent)" : "rgba(243,242,242,.18)",
                transition: "background .3s",
              }}
            />
          ))}
        </div>

        <div ref={body}>
          <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "0 0 20px" }}>{current.title}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-muted)", margin: "0 0 32px", maxWidth: 460 }}>
            {current.body}
          </p>
          <div style={{ display: "flex", flexDirection: "column", borderTop: "var(--rule-w) solid var(--rule)" }}>
            {current.options.map((o) => {
              const selected = draft[current.key] === o.value;
              return (
                <button
                  key={String(o.value)}
                  onClick={() => pick(o.value)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    textAlign: "left",
                    font: "600 15px var(--font)",
                    color: "var(--ink)",
                    background: selected ? "rgba(236,48,19,.14)" : "transparent",
                    border: 0,
                    borderBottom: "1px solid var(--rule)",
                    padding: "14px 12px 14px 4px",
                    cursor: "pointer",
                    transition: "background .15s linear",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = "var(--hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{o.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 400 }}>{o.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 8, paddingTop: 40 }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" style={{ minWidth: 180 }} onClick={() => setStep(step + 1)}>
              Next <span>→</span>
            </button>
          ) : (
            <button className="btn btn-primary" style={{ minWidth: 180 }} onClick={() => onDone(draft)}>
              Start learning <span>→</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="grid-field"
        style={{ padding: "56px 64px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      >
        <div className="eyebrow eyebrow-muted" style={{ marginBottom: 12 }}>
          Your plan so far
        </div>
        {summary.map((s, i) => (
          <div
            key={s.k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "var(--rule-w) solid var(--rule)",
              fontSize: 14,
              opacity: i <= step ? 1 : 0.35,
              transition: "opacity .3s",
            }}
          >
            <span style={{ color: "var(--ink-muted)" }}>{s.k}</span>
            <span style={{ fontWeight: 600 }}>{s.v}</span>
          </div>
        ))}
        </div>
      </section>
    </div>
  );
}
