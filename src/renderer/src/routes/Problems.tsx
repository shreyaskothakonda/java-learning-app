/**
 * Problem set — the data table from the design, over the real corpus.
 *
 * The design's columns were #/Problem/Pattern/Rating/Best/Status. Rating and
 * Best need attempt history, so this substitutes what actually exists today:
 * kind, cases, difficulty. Inventing a rating would make the screen look
 * finished while telling you nothing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL } from "@content/index.js";
import { TRACKS } from "@content/manifest.js";
import type { Difficulty, Track } from "@content/types.js";
import { SegmentedControl } from "../components/SegmentedControl.js";
import { rise } from "../design/motion.js";
import { useProgress } from "../lib/progress.js";
import type { Screen } from "../components/Shell.js";

type Filter = Track | "all";

const DIFFICULTY_WIDTH: Record<Difficulty, string> = {
  easy: "33%",
  medium: "66%",
  hard: "100%",
};

type Props = { onNavigate: (screen: Screen, problemId?: string) => void };

export function Problems({ onNavigate }: Props): React.JSX.Element {
  const { progress } = useProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () =>
      ALL.filter((p) => filter === "all" || p.track === filter).filter(
        (p) =>
          query.trim() === "" ||
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.topic.toLowerCase().includes(query.toLowerCase()),
      ),
    [filter, query],
  );

  useEffect(() => {
    if (body.current) rise(body.current.querySelectorAll("[data-row]"), { stagger: 0.03, y: 8 });
  }, [filter, query]);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "32px 40px 20px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {filter === "all" ? "All tracks" : TRACKS.find((t) => t.track === filter)?.label}
          </div>
          <h1 className="title">
            Problem set · {rows.length} of {ALL.length}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter problems by title or topic"
            placeholder="Filter…"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              color: "var(--ink)",
              font: "400 13px var(--font)",
              padding: "8px 12px",
              width: 180,
              outline: "none",
            }}
          />
          <SegmentedControl<Filter>
            semantics="radio"
            label="Filter by track"
            value={filter}
            options={[
              { value: "all" as Filter, label: "All" },
              ...TRACKS.map((t) => ({
                value: t.track as Filter,
                label: t.track === "java-fundamentals" ? "Java" : t.track === "dsa" ? "DSA" : "CP",
              })),
            ]}
            onChange={setFilter}
            style={{ whiteSpace: "nowrap" }}
          />
        </div>
      </div>

      <div
        className="eyebrow eyebrow-muted"
        style={{
          display: "grid",
          gridTemplateColumns: "90px minmax(0,1fr) 180px 150px 110px 110px",
          padding: "10px 40px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          color: "var(--ink-muted)",
        }}
      >
        <span>#</span>
        <span>Problem</span>
        <span>Topic</span>
        <span>Difficulty</span>
        <span>Cases</span>
        <span>Status</span>
      </div>

      <div ref={body} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {rows.length === 0 && (
          <div style={{ padding: "24px 40px", color: "var(--ink-muted)" }}>Nothing matches that filter.</div>
        )}
        {rows.map((p, i) => (
          <button
            key={p.id}
            data-row
            onClick={() => onNavigate("practice", p.id)}
            className="row-btn"
            style={{
              display: "grid",
              gridTemplateColumns: "90px minmax(0,1fr) 180px 150px 110px 110px",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              font: "400 14px var(--font)",
              color: "var(--ink)",
              cursor: "pointer",
              background: "transparent",
              border: 0,
              borderBottom: "1px solid var(--rule-soft)",
              padding: "14px 40px",
            }}
          >
            <span className="mono" style={{ color: "var(--ink-dim)" }}>
              {String(i + 1).padStart(3, "0")}
            </span>
            <span style={{ fontWeight: 600, paddingRight: 16 }}>{p.title}</span>
            <span style={{ color: "var(--ink-muted)" }}>{p.topic}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 60, height: 6, background: "rgba(243,242,242,.15)", display: "block" }}>
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: DIFFICULTY_WIDTH[p.difficulty],
                    background: p.difficulty === "hard" ? "var(--accent)" : "var(--accent-hi)",
                  }}
                />
              </span>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                {p.difficulty}
              </span>
            </span>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-muted)" }}>
              {p.testCases.length}
            </span>
            <span>
              {(() => {
                const st = progress[p.id]?.status;
                if (st === "solved")
                  return (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 10px",
                        background: "var(--accent-tint)",
                        color: "var(--accent-hi)",
                        border: "1px solid var(--accent-hi)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      solved
                    </span>
                  );
                if (st === "attempted")
                  return (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 10px",
                        border: "1px solid var(--rule)",
                        color: "var(--ink-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      attempted
                    </span>
                  );
                return <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>—</span>;
              })()}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
