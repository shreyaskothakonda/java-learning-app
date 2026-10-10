/**
 * The segmented control, in the three semantics it actually gets used with.
 *
 * The bug this replaces: every `.seg` marked its active item with
 * `aria-selected` on a plain `<button>`. `aria-selected` is only supported on
 * the `tab`, `option`, `row`, `gridcell`, `columnheader`, `rowheader` and
 * `treeitem` roles — a button's implicit role is `button`, so screen readers
 * ignored it entirely and every one of these read as an unrelated list of
 * buttons with no indication of which was active.
 *
 * The three uses are genuinely different and need different roles:
 *
 *   - `nav`   — moving between app screens. Not a tablist: the destinations
 *               are whole screens, not panels of one widget. `aria-current`.
 *   - `tabs`  — Coach / Editor. Two views of the same task, with the panel
 *               right below, which is what a tablist actually describes.
 *   - `radio` — a setting or filter with one value chosen from a set.
 *
 * Roles come with obligations, so this implements them: `tabs` and `radio`
 * get arrow-key navigation and a roving tabindex. Declaring `role="tablist"`
 * without arrow keys promises a behaviour that is not there, which is worse
 * for a keyboard user than leaving it a plain button.
 *
 * Styling hangs off `data-active`, which is presentation-only, so the visual
 * and the semantics can never drift apart again.
 */

import { useRef } from "react";

export type SegSemantics = "nav" | "tabs" | "radio";

export type SegOption<T extends string | number> = {
  value: T;
  label: string;
  /** Only meaningful for `tabs`: the id of the panel this controls. */
  controls?: string;
  disabled?: boolean;
  minWidth?: number;
};

type Props<T extends string | number> = {
  semantics: SegSemantics;
  /** Required for `tabs` and `radio` — the group needs a name of its own. */
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange: (value: T) => void;
  style?: React.CSSProperties;
};

export function SegmentedControl<T extends string | number>({
  semantics,
  label,
  value,
  options,
  onChange,
  style,
}: Props<T>): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Arrow keys move between options and activate as they go, which is the
   * expected behaviour for both tablists and radio groups. Home/End jump to
   * the ends. Selection wraps, as the ARIA practices describe.
   */
  function onKeyDown(e: React.KeyboardEvent): void {
    if (semantics === "nav") return;
    const enabled = options.filter((o) => !o.disabled);
    if (enabled.length === 0) return;

    const at = enabled.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % enabled.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (at - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next === -1) return;

    e.preventDefault();
    const target = enabled[next]!;
    onChange(target.value);
    // Move real focus with the selection, or the roving tabindex leaves focus
    // stranded on an option that is no longer current.
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[options.indexOf(target)]?.focus();
  }

  const groupRole = semantics === "tabs" ? "tablist" : semantics === "radio" ? "radiogroup" : undefined;

  return (
    <div
      ref={ref}
      className="seg"
      role={groupRole}
      aria-label={groupRole ? label : undefined}
      onKeyDown={onKeyDown}
      style={style}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            data-active={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            style={o.minWidth !== undefined ? { minWidth: o.minWidth } : undefined}
            {...(semantics === "tabs"
              ? {
                  role: "tab",
                  "aria-selected": active,
                  "aria-controls": o.controls,
                  // Roving tabindex: one stop for the whole group, then arrows.
                  tabIndex: active ? 0 : -1,
                }
              : semantics === "radio"
                ? { role: "radio", "aria-checked": active, tabIndex: active ? 0 : -1 }
                : { "aria-current": active ? ("page" as const) : undefined })}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
