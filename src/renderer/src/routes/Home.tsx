/**
 * Home — the three-column plan / where-you-left-off / this-week grid.
 *
 * Everything here reads from the real content registry. Where a number is not
 * yet earnable (Phase 4 owns progress persistence), it is labelled as such
 * rather than filled with a plausible-looking figure.
 */

import { useEffect, useRef } from "react";
import { ALL, getTrackOutline } from "@content/index.js";
import { TRACKS } from "@content/manifest.js";
import type { Problem } from "@content/types.js";
import { countUp, rise } from "../design/motion.js";
import { useProgress } from "../lib/progress.js";
import type { Screen } from "../components/Shell.js";

type Props = {
  onNavigate: (screen: Screen, problemId?: string) => void;
  lastProblemId: string | null;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function Home({ onNavigate, lastProblemId }: Props): React.JSX.Element {
  const { progress, stats: history } = useProgress();
  const plan = useRef<HTMLDivElement>(null);
  const stats = useRef<HTMLDivElement>(null);

  const resume: Problem = ALL.find((p) => p.id === lastProblemId) ?? ALL[0]!;

  useEffect(() => {
    if (plan.current) rise(plan.current.querySelectorAll("[data-plan-row]"), { stagger: 0.05, y: 10 });
  }, []);

  // Depends on `history`: stats arrive from SQLite a tick after mount, so an
  // empty dependency array counted up to zero and then never ran again — the
  // panel sat on 0/0/0 while the sidebar and title bar showed real numbers.
  useEffect(() => {
    if (!history || !stats.current) return;
    stats.current.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      countUp(el, Number(el.dataset["count"]));
    });
  }, [history]);

  const firstOfTrack = (track: string): Problem | undefined => ALL.find((p) => p.track === track);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "40px 40px 24px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {DAY.format(new Date())}
          </div>
          <h1 className="display">Three tracks. Start where it bites.</h1>
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => onNavigate("practice", resume.id)}
          style={{ flex: "none" }}
        >
          {lastProblemId ? "Resume" : "Start"} {resume.title.slice(0, 26)}
          <span>→</span>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <div ref={plan} className="panel" style={{ padding: "28px 40px" }}>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 16 }}>
            Tracks
          </div>
          {TRACKS.map((t, i) => {
            const count = ALL.filter((p) => p.track === t.track).length;
            const target = firstOfTrack(t.track);
            return (
              <button
                key={t.track}
                data-plan-row
                onClick={() => (target ? onNavigate("practice", target.id) : onNavigate("problems"))}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  borderTop: "var(--rule-w) solid var(--rule)",
                  padding: "16px 0",
                  cursor: "pointer",
                  color: "var(--ink)",
                  fontFamily: "var(--font)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginBottom: 6,
                  }}
                >
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    {ALL.filter((p) => p.track === t.track && progress[p.id]?.status === "solved").length}
                    /{count} solved
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2, marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>{t.blurb}</div>
              </button>
            );
          })}
        </div>

        <div className="panel" style={{ padding: "28px 40px", display: "flex", flexDirection: "column" }}>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 16 }}>
            {lastProblemId ? "Where you left off" : "Start here"}
          </div>
          <div
            className="surface"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}
          >
            <div className="eyebrow">
              {resume.track} · {resume.topic} · {resume.difficulty}
            </div>
            <div className="subtitle">{resume.title}</div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--ink-muted)",
                flex: 1,
                overflow: "hidden",
              }}
            >
              {resume.prompt.split("\n")[0]}
            </p>
            <div
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--ink-muted)",
                borderTop: "1px solid var(--rule)",
                paddingTop: 12,
              }}
            >
              {resume.testCases.length} cases · {resume.kind}
            </div>
          </div>
          <button
            className="btn"
            style={{ marginTop: 16 }}
            onClick={() => onNavigate("practice", resume.id)}
          >
            Open in Practice <span>→</span>
          </button>
        </div>

        <div ref={stats} style={{ padding: "28px 40px", display: "flex", flexDirection: "column" }}>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 16 }}>
            The corpus
          </div>
          {[
            { k: "solved", v: history?.solved ?? 0 },
            { k: "day streak", v: history?.streakDays ?? 0 },
            { k: "runs in total", v: history?.totalAttempts ?? 0 },
          ].map((s) => (
            <div key={s.k} style={{ borderTop: "var(--rule-w) solid var(--rule)", padding: "14px 0" }}>
              <div
                data-count={s.v}
                style={{ fontWeight: 800, fontSize: 36, lineHeight: 1, letterSpacing: "-0.02em" }}
              >
                0
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6 }}>{s.k}</div>
            </div>
          ))}
          <div
            style={{
              marginTop: "auto",
              paddingTop: 16,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--ink-dim)",
              borderTop: "var(--rule-w) solid var(--rule)",
            }}
          >
            {ALL.length} problems authored, {ALL.reduce((n, p) => n + p.testCases.length, 0)} test
            cases across {new Set(ALL.map((p) => p.topic)).size} topics.
          </div>
        </div>
      </div>
    </section>
  );
}

export function trackOutlineFor(track: Parameters<typeof getTrackOutline>[0]) {
  return getTrackOutline(track);
}
