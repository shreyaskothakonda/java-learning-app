/**
 * Motion, in Apple's idiom.
 *
 * Apple's UI motion has a specific signature: high initial velocity, a long
 * gentle settle, and almost never a bounce on interface chrome. That is one
 * curve — cubic-bezier(0.32, 0.72, 0, 1) — used for the great majority of
 * transitions, with a symmetric curve reserved for things that reverse.
 *
 * These are registered as GSAP CustomEases rather than approximated with
 * `power2.out`, because the difference is exactly the part that reads as
 * "Apple" — power2 decelerates evenly, while this curve front-loads the
 * movement and then takes its time arriving.
 *
 * Durations follow Apple's ranges: micro-feedback ~0.15s, interface chrome
 * ~0.3s, panels and sheets ~0.45-0.5s. Longer than that reads as sluggish.
 */

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// The signature decelerate. Sheets, pushes, entrances, anything arriving.
CustomEase.create("appleOut", "0.32, 0.72, 0, 1");
// Symmetric, for transitions that can run backwards (tab tracks, toggles).
CustomEase.create("appleInOut", "0.65, 0, 0.35, 1");
// Departures — things leaving the screen accelerate away.
CustomEase.create("appleIn", "0.42, 0, 1, 1");
// SwiftUI `.smooth`: spring with no overshoot, for values settling into place.
CustomEase.create("appleSmooth", "0.36, 0.66, 0.04, 1");
// SwiftUI `.snappy`: a touch of overshoot. Confirmations only — never chrome.
CustomEase.create("appleSnappy", "0.34, 1.24, 0.64, 1");

export const EASE = {
  out: "appleOut",
  inOut: "appleInOut",
  in: "appleIn",
  smooth: "appleSmooth",
  snappy: "appleSnappy",
} as const;

export const DUR = {
  micro: 0.15,
  base: 0.3,
  panel: 0.45,
  sheet: 0.5,
} as const;

/**
 * Honours the OS reduced-motion setting the way Apple does: the state change
 * still happens and still reads as deliberate, it just arrives immediately
 * rather than travelling. Setting a global timeScale would only make motion
 * fast; this removes it.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Duration to actually use, collapsing to 0 under reduced motion. */
export function dur(seconds: number): number {
  return prefersReducedMotion() ? 0 : seconds;
}

/** A rise-and-fade entrance. The default arrival for any new content. */
export function rise(
  target: gsap.TweenTarget,
  opts: { y?: number; delay?: number; duration?: number; stagger?: number } = {},
): gsap.core.Tween {
  return gsap.fromTo(
    target,
    { opacity: 0, y: opts.y ?? 8 },
    {
      opacity: 1,
      y: 0,
      duration: dur(opts.duration ?? DUR.base),
      delay: dur(opts.delay ?? 0),
      stagger: dur(opts.stagger ?? 0),
      ease: EASE.out,
      clearProps: "transform",
    },
  );
}

/**
 * The staggered reveal used when test results stream in.
 *
 * Apple staggers at roughly 30-50ms — enough to read as a sequence, short
 * enough that a list of ten does not feel like waiting. The prototype used
 * 320ms per row, which is a demo pace rather than a product one.
 */
export function revealRows(targets: gsap.TweenTarget): gsap.core.Tween {
  return gsap.fromTo(
    targets,
    { opacity: 0, y: 6 },
    {
      opacity: 1,
      y: 0,
      duration: dur(0.34),
      stagger: dur(0.04),
      ease: EASE.out,
      clearProps: "transform",
    },
  );
}

/** A number counting up to its value — for stats and counters. */
export function countUp(
  el: HTMLElement,
  to: number,
  format: (n: number) => string = (n) => String(Math.round(n)),
): gsap.core.Tween {
  const state = { v: 0 };
  return gsap.to(state, {
    v: to,
    duration: dur(0.7),
    ease: EASE.smooth,
    onUpdate: () => {
      el.textContent = format(state.v);
    },
  });
}
