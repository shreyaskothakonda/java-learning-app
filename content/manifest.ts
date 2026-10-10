/**
 * The curriculum spine: the single ordered topic list per track.
 *
 * Order matters — it is the sequence a learner walks, and the authoring
 * pipeline uses `prerequisites` to keep generated problems from reaching for
 * techniques the learner has not met yet.
 */

import type { Track } from "./types.js";

export type TopicDef = {
  topic: string;
  label: string;
  blurb: string;
  /** Topic ids from any track that should come first. */
  prerequisites?: string[];
};

export const TRACKS: { track: Track; label: string; blurb: string }[] = [
  {
    track: "java-fundamentals",
    label: "Java Fundamentals",
    blurb: "Syntax, control flow, arrays, methods, objects, collections, generics.",
  },
  {
    track: "dsa",
    label: "Data Structures & Algorithms",
    blurb: "Two pointers, hashing, stacks, lists, search, trees, graphs, recursion, DP.",
  },
  {
    track: "cp",
    label: "Competitive Programming",
    blurb: "Fast I/O, parsing, and problems under a real time limit.",
  },
];

export const TOPICS: Record<Track, TopicDef[]> = {
  "java-fundamentals": [
    { topic: "syntax", label: "Syntax & Types", blurb: "Variables, primitives, operators, casting." },
    { topic: "control-flow", label: "Control Flow", blurb: "if/else, loops, switch, break and continue.", prerequisites: ["syntax"] },
    { topic: "arrays-strings", label: "Arrays & Strings", blurb: "Indexing, iteration, StringBuilder, common string work.", prerequisites: ["control-flow"] },
    { topic: "methods", label: "Methods", blurb: "Parameters, return values, overloading, varargs.", prerequisites: ["control-flow"] },
    { topic: "oop", label: "Objects & Classes", blurb: "Fields, constructors, encapsulation, interfaces, inheritance.", prerequisites: ["methods"] },
    { topic: "collections", label: "Collections", blurb: "List, Map, Set, Deque and when to reach for each.", prerequisites: ["oop"] },
    { topic: "generics", label: "Generics", blurb: "Type parameters, bounded types, wildcards.", prerequisites: ["collections"] },
  ],
  dsa: [
    { topic: "two-pointers", label: "Two Pointers", blurb: "Converging pointers, fast/slow, partitioning.", prerequisites: ["arrays-strings"] },
    { topic: "hashing", label: "Hashing", blurb: "Maps and sets for O(1) lookup, frequency counting.", prerequisites: ["collections"] },
    { topic: "stacks-queues", label: "Stacks & Queues", blurb: "LIFO/FIFO, monotonic stacks, deques.", prerequisites: ["collections"] },
    { topic: "linked-lists", label: "Linked Lists", blurb: "Traversal, reversal, cycle detection.", prerequisites: ["oop"] },
    { topic: "binary-search", label: "Binary Search", blurb: "On sorted arrays and on the answer space.", prerequisites: ["two-pointers"] },
    { topic: "trees", label: "Trees", blurb: "Traversals, depth, BSTs.", prerequisites: ["linked-lists"] },
    { topic: "graphs", label: "Graphs", blurb: "BFS, DFS, connected components, topological order.", prerequisites: ["trees", "stacks-queues"] },
    { topic: "recursion", label: "Recursion & Backtracking", blurb: "Base cases, state restoration, pruning.", prerequisites: ["trees"] },
    { topic: "dp", label: "Dynamic Programming", blurb: "Memoisation, tabulation, state design.", prerequisites: ["recursion"] },
  ],
  cp: [
    { topic: "fast-io", label: "Fast I/O", blurb: "BufferedReader, StreamTokenizer, StringBuilder output.", prerequisites: ["arrays-strings"] },
    { topic: "parsing", label: "Input Parsing", blurb: "Multi-test-case formats, tokenising, mixed types.", prerequisites: ["fast-io"] },
    { topic: "time-limits", label: "Under a Time Limit", blurb: "Complexity that actually fits the limit.", prerequisites: ["parsing", "hashing"] },
  ],
};

const TOPIC_INDEX = new Map<string, { track: Track; def: TopicDef }>(
  (Object.entries(TOPICS) as [Track, TopicDef[]][]).flatMap(([track, defs]) =>
    defs.map((def) => [def.topic, { track, def }] as const),
  ),
);

export function topicExists(topic: string): boolean {
  return TOPIC_INDEX.has(topic);
}

export function topicFor(topic: string): { track: Track; def: TopicDef } | undefined {
  return TOPIC_INDEX.get(topic);
}

export function topicLabel(topic: string): string {
  return TOPIC_INDEX.get(topic)?.def.label ?? topic;
}
