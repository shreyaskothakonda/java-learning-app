/**
 * The window chrome: title bar, tab navigation, command palette.
 *
 * One deliberate departure from the prototype: it drew three coloured circles
 * as traffic lights. Those are the real ones, from Electron's `hiddenInset`
 * title bar — so this reserves their space and makes the bar draggable
 * instead. A fake close button that does not close is worse than no chrome.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { DUR, EASE, dur } from "../design/motion.js";
import type { NavLayout } from "@shared/types/settings.js";
import { CommandPalette } from "./CommandPalette.js";
import { JdkBanner } from "./JdkBanner.js";
import { SegmentedControl } from "./SegmentedControl.js";
import { Sidebar } from "./Sidebar.js";

export type Screen =
  | "home"
  | "concepts"
  | "problems"
  | "practice"
  | "progress"
  | "settings";

const TABS: { id: Screen; label: string }[] = [
  { id: "home", label: "Home" },
  // Learn, then choose, then do — the order the tabs sit in is the order the
  // work happens in.
  { id: "concepts", label: "Concepts" },
  { id: "problems", label: "Problems" },
  { id: "practice", label: "Practice" },
  { id: "progress", label: "Progress" },
  { id: "settings", label: "Settings" },
];

type Props = {
  screen: Screen;
  onNavigate: (screen: Screen, problemId?: string) => void;
  streak: number;
  nav: NavLayout;
  activeProblemId: string | null;
  children: ReactNode;
};

export function Shell({
  screen,
  onNavigate,
  streak,
  nav,
  activeProblemId,
  children,
}: Props): React.JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Each screen arrives with the signature decelerate. Short and shallow —
  // a page transition that announces itself gets tiring by the tenth time.
  useEffect(() => {
    if (!stage.current) return;
    gsap.fromTo(
      stage.current,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: dur(DUR.base), ease: EASE.out, clearProps: "transform" },
    );
  }, [screen]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--window)" }}>
      <header
        style={{
          height: 44,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 16,
          // 78px clears the real traffic lights.
          padding: "0 16px 0 90px",
          borderBottom: "var(--rule-w) solid var(--rule)",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ width: 14, height: 14, background: "var(--accent)", display: "block" }} />
          JAVELIN
        </div>

        {nav === "tabs" && (
          <nav
            aria-label="Screens"
            style={{ marginLeft: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <SegmentedControl
              semantics="nav"
              label="Screens"
              value={screen}
              options={TABS.map((t) => ({ value: t.id, label: t.label, minWidth: 84 }))}
              onChange={(id) => onNavigate(id)}
            />
          </nav>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 12,
            color: "var(--ink-muted)",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          <span>
            <strong style={{ color: "var(--ink)" }}>{streak}</strong> day streak
          </span>
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setPaletteOpen(true)}>
            Jump to…&nbsp;<span className="mono" style={{ opacity: 0.6 }}>⌘K</span>
          </button>
        </div>
      </header>

      {/* Above the nav, not inside a screen: with no JDK every screen is
          equally broken, and the fix is the same wherever you are. */}
      <JdkBanner />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {nav === "sidebar" && (
          <Sidebar screen={screen} activeProblemId={activeProblemId} onNavigate={onNavigate} />
        )}
        <div
          ref={stage}
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          {children}
        </div>
      </div>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(s, id) => {
            setPaletteOpen(false);
            onNavigate(s, id);
          }}
        />
      )}
    </div>
  );
}
