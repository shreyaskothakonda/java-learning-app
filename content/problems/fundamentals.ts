import type { Problem } from "../types.js";

export const FUNDAMENTALS: Problem[] = [
  {
    id: "fund-arrays-average",
    track: "java-fundamentals",
    topic: "arrays-strings",
    difficulty: "easy",
    kind: "method",
    title: "Average of an Array",
    prompt:
      "Return the arithmetic mean of `scores`. An empty array averages to `0.0`.\n\n" +
      "The array may contain values near `Integer.MAX_VALUE`.",
    signature: {
      className: "Solution",
      method: "average",
      params: [{ name: "scores", type: "int[]" }],
      returns: "double",
    },
    // Floating point never compares exactly. Every double-returning problem
    // needs this or it will fail on arithmetic that is actually correct.
    comparison: { mode: "approx", epsilon: 1e-9 },
    starterCode: `class Solution {
    public double average(int[] scores) {
        // your code here
    }
}`,
    solution: `class Solution {
    public double average(int[] scores) {
        if (scores.length == 0) return 0.0;
        long sum = 0;
        for (int s : scores) {
            sum += s;
        }
        return (double) sum / scores.length;
    }
}`,
    examples: [
      { input: "scores = [1, 2, 3]", output: "2.0" },
      { input: "scores = []", output: "0.0", note: "Guard the empty case before dividing." },
    ],
    testCases: [
      { input: [[1, 2, 3]], expected: 2.0 },
      { input: [[1, 2]], expected: 1.5, description: "the mean need not be a whole number" },
      { input: [[]], expected: 0.0, hidden: true, description: "empty array" },
      { input: [[10]], expected: 10.0, hidden: true },
      {
        input: [[2147483647, 2147483647]],
        expected: 2147483647.0,
        hidden: true,
        description: "an int accumulator overflows here",
      },
      { input: [[-4, 4, -4, 4]], expected: 0.0, hidden: true },
    ],
    hints: [
      "This is two separate jobs: add everything up, then divide. The second one has an edge case the first does not.",
      "What value does your accumulator hold after adding two copies of Integer.MAX_VALUE?",
      "Accumulate into a `long`, and cast to `double` before dividing rather than after.",
      "Return 0.0 immediately when the array is empty. Otherwise loop once accumulating into a `long` variable, then return `(double) sum / scores.length`. The cast has to happen before the division, or you get integer division and lose the fractional part.",
    ],
    pitfalls: [
      "`sum / scores.length` with two ints is integer division — 5/2 is 2, not 2.5.",
      "An `int` accumulator silently overflows to a negative number. Java does not warn you.",
      "Dividing by zero for an empty array gives NaN for doubles, not an exception.",
    ],
    complexity: { time: "O(n)", space: "O(1)" },
    resources: [
      {
        label: "Java Language Spec: integer overflow",
        url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.18.2",
      },
    ],
  },

  {
    id: "fund-collections-lru-cache",
    track: "java-fundamentals",
    topic: "collections",
    difficulty: "hard",
    kind: "class",
    title: "LRU Cache",
    prompt:
      "Design a cache holding at most `capacity` entries.\n\n" +
      "- `get(key)` returns the value, or `-1` if absent.\n" +
      "- `put(key, value)` inserts or updates.\n\n" +
      "When inserting would exceed capacity, evict the least recently used key. " +
      "Both `get` and `put` count as a use. Both must run in O(1) average time.",
    classSpec: {
      className: "LRUCache",
      ctor: [{ name: "capacity", type: "int" }],
      methods: [
        { name: "get", params: [{ name: "key", type: "int" }], returns: "int" },
        {
          name: "put",
          params: [
            { name: "key", type: "int" },
            { name: "value", type: "int" },
          ],
          returns: "void",
        },
      ],
    },
    starterCode: `import java.util.*;

class LRUCache {

    public LRUCache(int capacity) {
        // your code here
    }

    public int get(int key) {
        // your code here
    }

    public void put(int key, int value) {
        // your code here
    }
}`,
    solution: `import java.util.*;

class LRUCache {
    private final int capacity;
    private final LinkedHashMap<Integer, Integer> map;

    public LRUCache(int capacity) {
        this.capacity = capacity;
        // accessOrder = true moves an entry to the end on every get.
        this.map = new LinkedHashMap<>(16, 0.75f, true);
    }

    public int get(int key) {
        return map.getOrDefault(key, -1);
    }

    public void put(int key, int value) {
        map.put(key, value);
        if (map.size() > capacity) {
            Iterator<Integer> it = map.keySet().iterator();
            it.next();
            it.remove();
        }
    }
}`,
    testCases: [
      {
        ops: [
          ["LRUCache", 2],
          ["put", 1, 1],
          ["put", 2, 2],
          ["get", 1],
          ["put", 3, 3],
          ["get", 2],
          ["put", 4, 4],
          ["get", 1],
          ["get", 3],
          ["get", 4],
        ],
        expected: [null, null, null, 1, null, -1, null, -1, 3, 4],
        description: "the canonical sequence: 2 is evicted, then 1",
      },
      {
        ops: [
          ["LRUCache", 1],
          ["put", 2, 1],
          ["get", 2],
          ["put", 3, 2],
          ["get", 2],
          ["get", 3],
        ],
        expected: [null, null, 1, null, -1, 2],
        description: "capacity 1",
      },
      {
        ops: [
          ["LRUCache", 2],
          ["put", 1, 1],
          ["put", 1, 5],
          ["get", 1],
          ["put", 2, 2],
          ["get", 1],
        ],
        expected: [null, null, null, 5, null, 5],
        hidden: true,
        description: "overwriting an existing key must not grow the cache",
      },
      {
        ops: [
          ["LRUCache", 2],
          ["get", 9],
          ["put", 1, 1],
          ["get", 9],
          ["get", 1],
        ],
        expected: [null, -1, null, -1, 1],
        hidden: true,
        description: "a miss must not count as a use",
      },
    ],
    hints: [
      "Two things have to be fast at once: finding a key, and knowing which key was used longest ago. One data structure is unlikely to give you both.",
      "When you call get on a key that is already present, what has to change about that key besides returning its value?",
      "A hash map gives O(1) lookup; a doubly linked list gives O(1) reordering. `LinkedHashMap` is the two already combined, and its three-argument constructor takes an `accessOrder` flag.",
      "Construct `new LinkedHashMap<>(16, 0.75f, true)` — the `true` makes every access move that entry to the end, so the first entry in iteration order is always the least recently used. `get` becomes `getOrDefault(key, -1)`. In `put`, insert, then if the size now exceeds capacity, remove the first key via the key-set iterator. Building it by hand from a HashMap plus your own linked list is a good exercise afterwards.",
    ],
    pitfalls: [
      "Updating an existing key must refresh its recency but must not increase the size.",
      "A failed `get` is not a use — it must not reorder anything.",
      "Eviction happens after insertion, so a full cache briefly holds capacity + 1 entries.",
    ],
    complexity: { time: "O(1) average per operation", space: "O(capacity)" },
    resources: [
      {
        label: "LinkedHashMap (accessOrder)",
        url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedHashMap.html",
      },
    ],
  },
];
