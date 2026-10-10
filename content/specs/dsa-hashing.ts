import type { TopicSpec } from "./types.js";

export const SPEC: TopicSpec = {
  topic: "hashing",
  track: "dsa",
  conceptsCovered: [
    "using a Map to trade space for time",
    "frequency counting",
    "seen-before sets for O(1) membership",
    "looking up the complement rather than re-scanning",
    "why insertion order and iteration order are not the same thing",
  ],
  prerequisites: ["collections", "arrays-strings"],
  targetCounts: { easy: 3, medium: 3, hard: 2 },
  kind: "method",
  allowedApis: ["java.util.Map", "java.util.HashMap", "java.util.Set", "java.util.HashSet", "java.util.List", "java.util.ArrayList", "java.util.Arrays"],
  bannedApis: [
    // The point of this topic is the map. A stream one-liner skips the lesson.
    "stream()",
    "Collectors.",
  ],
  exemplars: [
    { difficulty: "easy", title: "Contains Duplicate", note: "one pass, a set, membership test" },
    { difficulty: "medium", title: "Group Anagrams", note: "a derived key, values accumulated per key" },
    { difficulty: "hard", title: "Longest Consecutive Sequence", note: "a set plus the insight that only run-starts are worth walking" },
  ],
  forbidTitles: [
    "Two Sum",              // already authored
    "Sum of N Integers",
    "Average of an Array",
  ],
  notes: [
    "Prefer problems where the naive solution is quadratic and the map makes it linear — that contrast is the lesson.",
    "Avoid problems that need sorting; sorting belongs to a later topic.",
    "Integer keys must stay inside int range so the JSON encoding is exact.",
  ],
};
