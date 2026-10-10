/**
 * The problem registry. Content is bundled TS modules, never a database —
 * regenerating content must never migrate a learner's progress, which is keyed
 * on `problem_id` in SQLite.
 */

import { TOPICS } from "./manifest.js";
import { CP } from "./problems/cp.js";
import { DSA } from "./problems/dsa.js";
import { FUNDAMENTALS } from "./problems/fundamentals.js";
import { GENERATED } from "./problems/generated-hashing.js";
import type { Problem, Track } from "./types.js";

export const ALL: Problem[] = [...FUNDAMENTALS, ...DSA, ...CP, ...GENERATED];

const BY_ID = new Map(ALL.map((p) => [p.id, p]));

export function getAllProblems(): Problem[] {
  return ALL;
}

export function getProblem(id: string): Problem | undefined {
  return BY_ID.get(id);
}

export function getProblemsByTrack(track: Track): Problem[] {
  return ALL.filter((p) => p.track === track);
}

export function getProblemsByTopic(topic: string): Problem[] {
  return ALL.filter((p) => p.topic === topic);
}

/** Problems grouped by topic, in the manifest's curriculum order. */
export function getTrackOutline(
  track: Track,
): { topic: string; label: string; problems: Problem[] }[] {
  return TOPICS[track].map((t) => ({
    topic: t.topic,
    label: t.label,
    problems: getProblemsByTopic(t.topic),
  }));
}

export * from "./types.js";
