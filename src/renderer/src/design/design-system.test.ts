/**
 * Design-system guardrails.
 *
 * These exist because the audit found both problems in code that looked fine
 * and typechecked cleanly. A scale nothing enforces drifts back to arbitrary
 * values within a week, and an ARIA attribute on the wrong role is invisible
 * to everything except a screen reader.
 *
 * Deliberately lint-shaped rather than render-shaped: they read the source,
 * so they catch the mistake at the point it is written rather than needing a
 * component to be mounted first.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../", import.meta.url));
const TOKENS = join(SRC, "design/tokens.css");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Comments are stripped before scanning. Without this the checks flag the
 * doc comments that explain the very bugs they guard against — which is
 * exactly what happened the first time this file ran.
 *
 * Only whole-line comments and block comments are removed, so a "//" inside a
 * string literal (a URL, say) survives intact.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? "" : line))
    .join("\n");
}

const FILES = sourceFiles(SRC).map((f) => ({
  path: f,
  text: stripComments(readFileSync(f, "utf8")),
}));
const rel = (p: string): string => p.slice(SRC.length);

// ------------------------------------------------------------------ spacing

/** The ramp: 2px steps below 16, then 4px, then 8px at the layout end. */
const RAMP = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64]);

/**
 * Values that are positioning, not spacing, and are documented at their use
 * site. Each needs a reason — this list is not a place to silence a failure.
 */
const EXEMPT = new Map<number, string>([
  [13, "Sidebar item: 13 + the 3px active border = the 16px heading inset"],
  [90, "Shell title bar: clears the macOS traffic lights"],
  [120, "Command palette: distance from the top of the window"],
]);

const SPACING_PROP =
  /\b(gap|rowGap|columnGap|margin|marginTop|marginBottom|marginLeft|marginRight|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingInline)\s*:\s*(?:"([^"]+)"|(\d+))/g;

test("every spacing value sits on the ramp", () => {
  const offenders: string[] = [];

  for (const { path, text } of FILES) {
    for (const m of text.matchAll(SPACING_PROP)) {
      const values = m[2]
        ? [...m[2].matchAll(/(\d+)px/g)].map((x) => Number(x[1]))
        : [Number(m[3])];
      for (const v of values) {
        if (RAMP.has(v) || EXEMPT.has(v)) continue;
        offenders.push(`${rel(path)}: ${m[0].trim()} — ${v}px is off the ramp`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `spacing off the ramp. Snap to the nearest of [${[...RAMP].join(", ")}], or add a ` +
      `documented entry to EXEMPT if it is positioning rather than spacing:\n  ` +
      offenders.join("\n  "),
  );
});

test("the CSS ramp and the test's ramp agree", () => {
  const css = readFileSync(TOKENS, "utf8");
  const declared = [...css.matchAll(/--space-(\d+):\s*(\d+)px/g)];
  assert.ok(declared.length > 0, "no --space-* tokens found");

  for (const [, name, value] of declared) {
    // Named by value on purpose: --space-12 is 12px, never "step 12".
    assert.equal(name, value, `--space-${name} should be ${name}px, is ${value}px`);
    assert.ok(RAMP.has(Number(value)), `--space-${value} is not on the ramp`);
  }
});

test("every var(--token) referenced actually exists", () => {
  // Found a real bug on its first run: renaming the spacing scale left
  // `.btn { gap: var(--space-3) }` pointing at nothing, so the gap silently
  // became 0 and the primary button's trailing arrow collapsed onto its label.
  //
  // Worth knowing what this canNOT catch: a rename that keeps the name valid
  // but changes its meaning. `--space-2` survived the same rename as a legal
  // token whose value went from 8px to 2px, and nothing here would notice.
  const css = readFileSync(TOKENS, "utf8");
  const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!));

  const dangling: string[] = [];
  for (const { path, text } of [...FILES, { path: TOKENS, text: css }]) {
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      if (!defined.has(m[1]!)) dangling.push(`${rel(path)} references undefined ${m[1]}`);
    }
  }
  assert.deepEqual(dangling, [], [...new Set(dangling)].join("\n  "));
});

// ------------------------------------------------------------------- a11y

test("aria-selected is only used with a role that supports it", () => {
  // Supported on tab, option, row, gridcell, columnheader, rowheader,
  // treeitem — never on a plain button, where screen readers ignore it.
  const offenders: string[] = [];
  for (const { path, text } of FILES) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("aria-selected")) return;
      const window = lines.slice(Math.max(0, i - 6), i + 3).join("\n");
      if (!/role\s*[:=]\s*["']?(tab|option|row|gridcell|columnheader|rowheader|treeitem)\b/.test(window)) {
        offenders.push(`${rel(path)}:${i + 1} — aria-selected with no supporting role`);
      }
    });
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});

test("the command palette is a real modal", () => {
  const palette = FILES.find((f) => f.path.endsWith("CommandPalette.tsx"));
  assert.ok(palette, "CommandPalette.tsx not found");
  for (const needed of [
    'role="dialog"',
    'aria-modal="true"',
    'role="listbox"',
    'role="option"',
    "aria-activedescendant",
  ]) {
    assert.ok(palette.text.includes(needed), `command palette is missing ${needed}`);
  }
  // Focus has to be trapped and then handed back.
  assert.match(palette.text, /e\.key === "Tab"/, "no focus trap");
  assert.match(palette.text, /opener\?\.focus/, "focus is never restored to the opener");
});

/**
 * Finds the `>` that closes a JSX opening tag.
 *
 * Not `indexOf(">")`: attributes routinely contain `>` inside arrow functions
 * (`onClick={() => ...}`) and comparisons, so the naive version slices the
 * element in the wrong place and the check silently passes. This tracks brace
 * depth and quotes and returns the first `>` at depth zero.
 */
function endOfOpenTag(text: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

/** Strips balanced {...} expressions, including the nested {{...}} of style. */
function stripExpressions(text: string): string {
  let out = "";
  let depth = 0;
  for (const c of text) {
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out;
}

test("no interactive element is left without an accessible name", () => {
  // A <button> whose only child is an element (a bar, an icon) has no text to
  // announce, so it needs an explicit label.
  const offenders: string[] = [];
  for (const { path, text } of FILES) {
    for (let i = text.indexOf("<button"); i !== -1; i = text.indexOf("<button", i + 1)) {
      const tagEnd = endOfOpenTag(text, i);
      if (tagEnd === -1) continue;
      const attrs = text.slice(i, tagEnd);
      if (/aria-label|aria-labelledby/.test(attrs)) continue;
      if (text[tagEnd - 1] === "/") continue; // self-closing, no children

      const close = text.indexOf("</button>", tagEnd);
      if (close === -1) continue;
      const children = text.slice(tagEnd + 1, close);

      // Child element tags go first, so their attributes (className="mono")
      // are not mistaken for rendered copy.
      const withoutTags = children.replace(/<[^>]*>/g, "");
      // Bare text nodes.
      const literal = stripExpressions(withoutTags);
      // ...or an expression that renders text: a ternary of string literals
      // ({running ? "Running…" : "Run"}) counts, and so does a variable whose
      // name says it holds a label.
      const rendersLabel =
        /["'`][^"'`]*[A-Za-z][^"'`]*["'`]/.test(withoutTags) ||
        /\b(label|title|children|text|name)\b/.test(withoutTags);
      if (!/[A-Za-z]/.test(literal) && !rendersLabel) {
        offenders.push(
          `${rel(path)}:${text.slice(0, i).split("\n").length} — button with no text and no aria-label`,
        );
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});
