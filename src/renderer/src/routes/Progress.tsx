/**
 * Progress — the dashboard, now over real history.
 *
 * Phase 3 showed corpus coverage here because there was nothing else honest to
 * show. There is now: solves, attempts, streak, and a 30-day activity strip.
 * Coverage stays as a secondary panel, because "6 of 19 topics have problems"
 * is still a true and useful thing to know about this build.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ALL, getProblem } from "@content/index.js";
import { TOPICS, TRACKS } from "@content/manifest.js";
import { DUR, EASE, countUp, dur } from "../design/motion.js";
import { useProgress } from "../lib/progress.js";

const RADIUS = 84;
const CIRC = 2 * Math.PI * RADIUS;

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 60) return RELATIVE.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return RELATIVE.format(-hours, "hour");
  return RELATIVE.format(-Math.round(hours / 24), "day");
}

export function Progress(): React.JSX.Element {
  const { progress, stats } = useProgress();
  const ring = useRef<SVGCircleElement>(null);
  const pct = useRef<HTMLDivElement>(null);
  const figures = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const solved = stats?.solved ?? 0;
  const share = ALL.length === 0 ? 0 : solved / ALL.length;

  useEffect(() => {
    if (ring.current) {
      gsap.fromTo(
        ring.current,
        { strokeDashoffset: CIRC },
        {
          strokeDashoffset: CIRC * (1 - share),
          duration: dur(1),
          ease: EASE.smooth,
          delay: dur(0.1),
        },
      );
    }
    if (pct.current) countUp(pct.current, solved, (n) => String(Math.round(n)));
    if (figures.current) {
      figures.current.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const to = Number(el.dataset["count"]);
        const suffix = el.dataset["suffix"] ?? "";
        countUp(el, to, (n) => `${Math.round(n)}${suffix}`);
      });
    }
    if (strip.current) {
      gsap.fromTo(
        strip.current.querySelectorAll("[data-day]"),
        { scaleY: 0 },
        {
          scaleY: 1,
          transformOrigin: "bottom center",
          duration: dur(DUR.panel),
          stagger: dur(0.012),
          ease: EASE.out,
        },
      );
    }
  }, [share, solved, stats]);

  const topicsTotal = Object.values(TOPICS).reduce((n, t) => n + t.length, 0);
  const topicsCovered = new Set(ALL.map((p) => p.topic)).size;
  const peak = Math.max(1, ...(stats?.activity.map((a) => a.attempts) ?? [1]));

  const empty = (stats?.totalAttempts ?? 0) === 0;

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
      <div style={{ padding: "32px 40px 20px", borderBottom: "var(--rule-w) solid var(--rule)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Progress
        </div>
        <h1 className="title">
          {empty ? "Nothing solved yet" : `${solved} of ${ALL.length} solved`}
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", flex: 1, minHeight: 0 }}>
        <div className="panel" style={{ padding: 40, display: "flex", flexDirection: "column", gap: 24 }}>
          <svg width={200} height={200} viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--rule-faint)" strokeWidth="14" />
            <circle
              ref={ring}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="14"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC}
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div>
            <div ref={pct} style={{ fontWeight: 800, fontSize: 56, lineHeight: 1, letterSpacing: "-0.02em" }}>
              0
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 8 }}>
              problems solved of {ALL.length}
            </div>
          </div>

          <div ref={figures} style={{ display: "flex", flexDirection: "column" }}>
            {[
              { k: "day streak", v: stats?.streakDays ?? 0, suffix: "" },
              { k: "problems attempted", v: stats?.attempted ?? 0, suffix: "" },
              { k: "runs in total", v: stats?.totalAttempts ?? 0, suffix: "" },
              {
                k: "of runs did not compile",
                v: Math.round((stats?.compileErrorRate ?? 0) * 100),
                suffix: "%",
              },
            ].map((f) => (
              <div key={f.k} style={{ borderTop: "var(--rule-w) solid var(--rule)", padding: "12px 0" }}>
                <div
                  data-count={f.v}
                  data-suffix={f.suffix}
                  style={{ fontWeight: 800, fontSize: 28, lineHeight: 1, letterSpacing: "-0.02em" }}
                >
                  0
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>{f.k}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 40, overflow: "auto" }}>
          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 16 }}>
            Last 30 days
          </div>
          <div
            ref={strip}
            style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 80, marginBottom: 8 }}
          >
            {(stats?.activity ?? []).map((d) => (
              <div
                key={d.day}
                data-day
                title={`${d.day}: ${d.attempts} run${d.attempts === 1 ? "" : "s"}, ${d.solved} solved`}
                style={{
                  flex: 1,
                  height: `${Math.max(2, (d.attempts / peak) * 100)}%`,
                  background:
                    d.solved > 0 ? "var(--accent)" : d.attempts > 0 ? "var(--accent-hi)" : "var(--rule-faint)",
                  minHeight: 2,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--ink-dim)",
              marginBottom: 32,
            }}
          >
            <span>{stats?.activity[0]?.day}</span>
            <span>today</span>
          </div>

          <div className="eyebrow eyebrow-muted" style={{ marginBottom: 12 }}>
            Recent runs
          </div>
          {empty && (
            <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 32 }}>
              Nothing yet. Run something in Practice and it will show up here.
            </div>
          )}
          {(stats?.recent ?? []).map((r, i) => {
            const problem = getProblem(r.problemId);
            return (
              <div
                key={`${r.problemId}-${r.createdAt}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px minmax(0,1fr) 120px 100px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: "1px solid var(--rule-soft)",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    color: r.status === "passed" ? "var(--ok)" : "var(--accent)",
                  }}
                >
                  {r.status === "passed" ? "✓" : r.status === "compile_error" ? "!" : "✕"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {problem?.title ?? r.problemId}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                  {r.status === "compile_error"
                    ? "did not compile"
                    : `${r.testsPassed}/${r.testsTotal}${r.submitted ? " submit" : ""}`}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", textAlign: "right" }}>
                  {ago(r.createdAt)}
                </span>
              </div>
            );
          })}

          <div className="eyebrow eyebrow-muted" style={{ margin: "32px 0 12px" }}>
            Corpus coverage · {topicsCovered} of {topicsTotal} topics have problems
          </div>
          {TRACKS.map((t) => {
            const problems = ALL.filter((p) => p.track === t.track);
            const done = problems.filter((p) => progress[p.id]?.status === "solved").length;
            return (
              <div
                key={t.track}
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px minmax(0,1fr) 60px",
                  alignItems: "center",
                  gap: 16,
                  padding: "8px 0",
                  borderTop: "1px solid var(--rule-soft)",
                  fontSize: 13,
                }}
              >
                <span>{t.label}</span>
                <span style={{ height: 8, background: "var(--rule-faint)", display: "block" }}>
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${problems.length === 0 ? 0 : (done / problems.length) * 100}%`,
                      background: "var(--accent)",
                      transition: "width .4s",
                    }}
                  />
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", textAlign: "right" }}>
                  {done}/{problems.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
