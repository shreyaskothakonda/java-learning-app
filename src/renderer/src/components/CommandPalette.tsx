/**
 * ⌘K palette. Searches screens and the real problem corpus.
 *
 * The sheet enters at 0.98 scale with the signature decelerate — Apple's
 * modal entrance, scaled down for something this light. It does not bounce:
 * overshoot on a surface you are about to type into reads as unserious.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ALL } from "@content/index.js";
import { DUR, EASE, dur } from "../design/motion.js";
import type { Screen } from "./Shell.js";

type Item = {
  kind: string;
  label: string;
  hint?: string;
  screen: Screen;
  problemId?: string;
};

const SCREENS: Item[] = [
  { kind: "Screen", label: "Home", screen: "home" },
  { kind: "Screen", label: "Concepts", screen: "concepts" },
  { kind: "Screen", label: "Problems", screen: "problems" },
  { kind: "Screen", label: "Practice", screen: "practice" },
  { kind: "Screen", label: "Progress", screen: "progress" },
  { kind: "Screen", label: "Settings", screen: "settings" },
];

type Props = {
  onClose: () => void;
  onNavigate: (screen: Screen, problemId?: string) => void;
};

export function CommandPalette({ onClose, onNavigate }: Props): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const backdrop = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const problems: Item[] = ALL.map((p) => ({
      kind: p.track === "cp" ? "CP" : p.track === "dsa" ? "DSA" : "Java",
      label: p.title,
      hint: p.difficulty,
      screen: "practice" as const,
      problemId: p.id,
    }));
    const all = [...SCREENS, ...problems];
    if (q === "") return all.slice(0, 8);
    return all
      .filter((i) => i.label.toLowerCase().includes(q) || i.kind.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query]);

  // Focus restore: remember what had focus so closing puts it back. Without
  // this, dismissing the palette drops the caret to the top of the document
  // and a keyboard user has to tab in from the beginning again.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    input.current?.focus();
    gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: dur(DUR.micro), ease: "none" });
    gsap.fromTo(
      sheet.current,
      { opacity: 0, y: -6, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: dur(DUR.base), ease: EASE.out, clearProps: "transform" },
    );
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Tab") {
      // A modal has to keep focus inside it. There are only two tab stops
      // worth cycling here (the field and the active option), so Tab is
      // simply swallowed and the arrow keys do the moving.
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = items[active];
      if (item) onNavigate(item.screen, item.problemId);
    }
  }

  return (
    <div
      ref={backdrop}
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--scrim)",
        display: "flex",
        justifyContent: "center",
        paddingTop: 120,
        zIndex: 50,
      }}
    >
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a screen or problem"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          height: "fit-content",
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "var(--rule-w) solid var(--rule)",
          }}
        >
          <span className="mono" style={{ color: "var(--accent-hi)", fontWeight: 800 }}>
            ›
          </span>
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-listbox"
            aria-activedescendant={items[active] ? `palette-opt-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Jump to a screen or problem"
            placeholder="Jump to a screen or problem…"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: 0,
              color: "var(--ink)",
              font: "400 16px var(--font)",
              caretColor: "var(--accent)",
            }}
          />
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
            esc
          </span>
        </div>

        <div
          id="palette-listbox"
          role="listbox"
          aria-label="Results"
          style={{ display: "flex", flexDirection: "column", padding: "6px 0", maxHeight: 400, overflow: "auto" }}
        >
          {items.length === 0 && (
            <div role="status" style={{ padding: "14px 16px", color: "var(--ink-muted)", fontSize: 14 }}>
              Nothing matches “{query}”.
            </div>
          )}
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.label}`}
              id={`palette-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // The field keeps focus; options are pointed at with
              // aria-activedescendant, so they must not be tab stops.
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onClick={() => onNavigate(it.screen, it.problemId)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left",
                font: "400 14px var(--font)",
                color: "var(--ink)",
                background: i === active ? "var(--surface-2)" : "transparent",
                border: 0,
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              <span>
                <span
                  className="mono"
                  style={{
                    color: "var(--ink-dim)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginRight: 12,
                  }}
                >
                  {it.kind}
                </span>
                {it.label}
              </span>
              {it.hint && (
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                  {it.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
