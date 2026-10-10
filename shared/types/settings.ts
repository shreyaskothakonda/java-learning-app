/**
 * User preferences.
 *
 * The Javelin canvas exposed `nav` as a design tweak with three options
 * (tabs / sidebar / palette). Two of those are real layouts; the palette is
 * ⌘K, which is always available regardless of which layout is chosen — so it
 * is not a third mutually-exclusive mode and is not offered as one.
 */

import type { ProviderId } from "./ai.js";

export type NavLayout = "tabs" | "sidebar";
export type Goal = "backend" | "interviews" | "contests";
export type Level = "new" | "some" | "confident";

export type Settings = {
  /** null means "use whatever is available"; an explicit id pins it. */
  aiProvider: ProviderId | null;
  nav: NavLayout;
  onboarded: boolean;
  goal: Goal;
  level: Level;
  dailyMinutes: number;
};

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: null,
  nav: "tabs",
  onboarded: false,
  goal: "backend",
  level: "new",
  dailyMinutes: 40,
};

export const GOAL_LABEL: Record<Goal, string> = {
  backend: "Backend development",
  interviews: "Interviews",
  contests: "Competitive programming",
};

export const LEVEL_LABEL: Record<Level, string> = {
  new: "New to Java",
  some: "Some Java",
  confident: "Confident in Java",
};

export const NAV_LABEL: Record<NavLayout, string> = {
  tabs: "Tabs",
  sidebar: "Sidebar",
};
