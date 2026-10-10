/**
 * A topic spec: the seed the authoring pipeline generates from.
 *
 * The spec is the thing you edit when a generated problem comes out wrong.
 * That is the whole discipline of this phase — fixing an individual problem
 * fixes one problem, fixing the spec fixes every problem generated from it
 * afterwards.
 */

import type { Difficulty, ProblemKind, Track } from "../types.js";

export type TopicSpec = {
  /** Matches a topic id in content/manifest.ts. */
  topic: string;
  track: Track;
  /** What this topic is actually teaching, in the author's words. */
  conceptsCovered: string[];
  /** Topic ids that must come first. Keeps generation from reaching ahead. */
  prerequisites: string[];
  targetCounts: Record<Difficulty, number>;
  /**
   * Only "method" is generatable today — see the SCOPE note in
   * scripts/author/pipeline.ts. A spec may still declare "class" or "stdio"
   * to record the intent; the runner will skip it until those prompts exist.
   */
  kind: ProblemKind | "mixed";
  /**
   * The underrated fields. `bannedApis` is both a generation constraint and a
   * check on the learner's imports — it is what stops a "learn for loops"
   * problem being solved with `IntStream.range().sum()`.
   */
  allowedApis: string[];
  bannedApis: string[];
  /**
   * Calibration anchors: well-known problems at each difficulty. Models judge
   * relative difficulty far better than absolute, so naming three landmarks
   * beats any amount of describing what "medium" means.
   */
  exemplars: { difficulty: Difficulty; title: string; note: string }[];
  /** Titles to steer away from — usually what neighbouring topics already cover. */
  forbidTitles: string[];
  /** Anything peculiar to this topic that a generator would otherwise get wrong. */
  notes?: string[];
};
