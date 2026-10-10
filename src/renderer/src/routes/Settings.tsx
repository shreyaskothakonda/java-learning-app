/**
 * Settings.
 *
 * Every row is a live preference that writes straight through to SQLite —
 * there is no Save button, because a settings screen that can be left in an
 * unsaved state is a settings screen that lies about what is in effect.
 */

import {
  GOAL_LABEL,
  LEVEL_LABEL,
  NAV_LABEL,
  type Goal,
  type Level,
  type NavLayout,
  type Settings as SettingsType,
} from "@shared/types/settings.js";
import type { ProviderId } from "@shared/types/ai.js";
import { SegmentedControl } from "../components/SegmentedControl.js";
import { useAiProviders } from "../lib/useAiProviders.js";

type Props = {
  settings: SettingsType;
  onChange: (patch: Partial<SettingsType>) => void;
  onReplayOnboarding: () => void;
};

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 32,
        padding: "20px 0",
        borderTop: "var(--rule-w) solid var(--rule)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>{hint}</div>
      </div>
      <div style={{ flex: "none" }}>{children}</div>
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}): React.JSX.Element {
  return (
    <SegmentedControl<T>
      semantics="radio"
      label={label}
      value={value}
      options={options}
      onChange={onPick}
      style={{ whiteSpace: "nowrap" }}
    />
  );
}

export function Settings({ settings, onChange, onReplayOnboarding }: Props): React.JSX.Element {
  const { providers } = useAiProviders();
  return (
    <section style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <div style={{ padding: "32px 40px 20px", borderBottom: "var(--rule-w) solid var(--rule)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Settings
        </div>
        <h1 className="title">Preferences</h1>
      </div>

      <div style={{ padding: "8px 40px 40px", maxWidth: 860 }}>
        <div style={{ padding: "20px 0", borderTop: "var(--rule-w) solid var(--rule)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>AI tutor</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4, maxWidth: 620 }}>
            The authored hint ladder and compiler messages work with this off. A provider adds a
            second opinion that has read your actual code — it never blocks, it arrives alongside.
          </div>
          <div style={{ marginTop: 16 }}>
            {providers.map((p) => {
              const active = (settings.aiProvider ?? providers.find((x) => x.id !== "none" && x.available)?.id ?? "none") === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onChange({ aiProvider: p.id as ProviderId })}
                  disabled={!p.available}
                  aria-pressed={active}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px minmax(0,1fr) auto",
                    gap: 12,
                    alignItems: "start",
                    width: "100%",
                    textAlign: "left",
                    background: active ? "var(--accent-tint)" : "transparent",
                    border: 0,
                    borderTop: "1px solid var(--rule-soft)",
                    padding: "12px 8px",
                    cursor: p.available ? "pointer" : "not-allowed",
                    opacity: p.available ? 1 : 0.5,
                    color: "var(--ink)",
                    font: "400 13px var(--font)",
                  }}
                >
                  <span style={{ color: active ? "var(--accent)" : "var(--ink-dim)", fontWeight: 800 }}>
                    {active ? "●" : "○"}
                  </span>
                  <span>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span style={{ display: "block", color: "var(--ink-muted)", marginTop: 2 }}>
                      {p.detail}
                    </span>
                  </span>
                  {p.observedMs !== undefined && (
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                      ~{(p.observedMs / 1000).toFixed(0)}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Row
          title="Navigation"
          hint="Tabs sit in the title bar. The sidebar is a rail that also lists every problem. ⌘K works in both."
        >
          <Choice<NavLayout>
            label="Navigation layout"
            value={settings.nav}
            options={[
              { value: "tabs", label: NAV_LABEL.tabs },
              { value: "sidebar", label: NAV_LABEL.sidebar },
            ]}
            onPick={(nav) => onChange({ nav })}
          />
        </Row>

        <Row title="Goal" hint="Sets which track leads. Nothing is hidden either way.">
          <Choice<Goal>
            label="Goal"
            value={settings.goal}
            options={[
              { value: "backend", label: "Backend" },
              { value: "interviews", label: "Interviews" },
              { value: "contests", label: "Contests" },
            ]}
            onPick={(goal) => onChange({ goal })}
          />
        </Row>

        <Row title="Level" hint={`Currently: ${LEVEL_LABEL[settings.level]}.`}>
          <Choice<Level>
            label="Level"
            value={settings.level}
            options={[
              { value: "new", label: "New" },
              { value: "some", label: "Some" },
              { value: "confident", label: "Confident" },
            ]}
            onPick={(level) => onChange({ level })}
          />
        </Row>

        <Row title="Daily time" hint="Used to size a session.">
          <Choice<number>
            label="Daily time"
            value={settings.dailyMinutes}
            options={[
              { value: 20, label: "20 min" },
              { value: 40, label: "40 min" },
              { value: 60, label: "60 min" },
            ]}
            onPick={(dailyMinutes) => onChange({ dailyMinutes })}
          />
        </Row>

        <Row title="Run onboarding again" hint="Re-pick goal, level, daily time and navigation.">
          <button className="btn" style={{ minWidth: 170 }} onClick={onReplayOnboarding}>
            Open onboarding <span>→</span>
          </button>
        </Row>

        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: "var(--rule-w) solid var(--rule)",
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--ink-dim)",
          }}
        >
          Preferences are written to SQLite as you change them — there is no save step. The AI
          provider settings arrive with the tutor.
        </div>
      </div>
    </section>
  );
}
