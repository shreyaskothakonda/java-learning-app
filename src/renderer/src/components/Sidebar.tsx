/**
 * The sidebar navigation, one of the two layouts from the canvas.
 *
 * Unlike the tab bar it can carry structure, so it does: screens at the top,
 * then the tracks with their problem counts. That is the actual reason to
 * prefer it — not decoration, but that a vertical rail has room for a
 * hierarchy a horizontal one does not.
 *
 * The active item is marked with a 3px left rule in the accent rather than a
 * filled background. Modernist organises with alignment and rules, and a solid
 * fill down the side of a 248px column would be the loudest thing on screen.
 */

import { useEffect, useRef } from "react";
import { ALL } from "@content/index.js";
import { TRACKS } from "@content/manifest.js";
import { rise } from "../design/motion.js";
import { useProgress } from "../lib/progress.js";
import type { Difficulty } from "@content/types.js";
import type { Screen } from "./Shell.js";

const DIFF_SHORT: Record<Difficulty, string> = { easy: "easy", medium: "med", hard: "hard" };

type Props = {
  screen: Screen;
  activeProblemId: string | null;
  onNavigate: (screen: Screen, problemId?: string) => void;
};

const SCREENS: { id: Screen; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "concepts", label: "Concepts" },
  { id: "problems", label: "Problems" },
  { id: "practice", label: "Practice" },
  { id: "progress", label: "Progress" },
  { id: "settings", label: "Settings" },
];

function Item({
  label,
  meta,
  active,
  onClick,
}: {
  label: string;
  meta?: string;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      data-nav-item
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        font: `${active ? 800 : 400} 13px var(--font)`,
        color: active ? "var(--ink)" : "var(--ink-muted)",
        background: active ? "rgba(243,242,242,.05)" : "transparent",
        border: 0,
        borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
        // 13 not 16: the 3px active border makes up the difference, so
        // labels sit flush with the 16px-inset group headings either way.
        padding: "8px 16px 8px 13px",
        cursor: "pointer",
        transition: "background .15s linear, color .15s linear",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {meta !== undefined && (
        <span className="mono" style={{ fontSize: 11, opacity: 0.55, flex: "none", marginLeft: 10 }}>
          {meta}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ screen, activeProblemId, onNavigate }: Props): React.JSX.Element {
  const { progress } = useProgress();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (nav.current) rise(nav.current.querySelectorAll("[data-nav-item]"), { stagger: 0.02, y: 6 });
  }, []);

  return (
    <nav
      ref={nav}
      className="panel"
      style={{
        width: 248,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0",
        overflow: "auto",
      }}
    >
      <div className="eyebrow" style={{ padding: "0 16px 6px" }}>
        Navigate
      </div>
      {SCREENS.map((s) => (
        <Item key={s.id} label={s.label} active={screen === s.id} onClick={() => onNavigate(s.id)} />
      ))}

      {TRACKS.map((t) => {
        const problems = ALL.filter((p) => p.track === t.track);
        if (problems.length === 0) return null;
        return (
          <div key={t.track}>
            <div className="eyebrow" style={{ padding: "0 16px 6px", marginTop: 24 }}>
              {t.label}
            </div>
            {problems.map((p) => (
              <Item
                key={p.id}
                label={p.title}
                meta={progress[p.id]?.status === "solved" ? "✓" : DIFF_SHORT[p.difficulty]}
                active={screen === "practice" && activeProblemId === p.id}
                onClick={() => onNavigate("practice", p.id)}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
