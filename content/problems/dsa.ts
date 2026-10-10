import type { Problem } from "../types.js";

export const DSA: Problem[] = [
  {
    id: "dsa-two-pointers-remove-duplicates",
    track: "dsa",
    topic: "two-pointers",
    difficulty: "medium",
    kind: "method",
    title: "Remove Duplicates In Place",
    prompt:
      "`nums` is sorted in non-decreasing order. Remove the duplicates **in place** so that each " +
      "distinct value appears once, keeping the original relative order, and return the number " +
      "of distinct values `k`.\n\n" +
      "Only the first `k` elements of `nums` are checked; whatever is left beyond them does not " +
      "matter. You must not allocate another array.",
    signature: {
      className: "Solution",
      method: "removeDuplicates",
      params: [{ name: "nums", type: "int[]" }],
      returns: "int",
    },
    // The whole point of this problem is a side effect on the argument, so the
    // return value alone cannot verify it. `args` is the argument array AFTER
    // the call, and `expectedType` restates `expected` as the prefix we want.
    comparison: {
      mode: "custom",
      expectedType: "int[]",
      javaChecker: `int k = (Integer) actual;
int[] nums = (int[]) args[0];
int[] want = (int[]) expected;
if (k != want.length) return false;
for (int i = 0; i < k; i++) {
    if (nums[i] != want[i]) return false;
}
return true;`,
    },
    bannedApis: ["new int[", "Arrays.copyOf", "stream()"],
    starterCode: `class Solution {
    public int removeDuplicates(int[] nums) {
        // your code here
    }
}`,
    solution: `class Solution {
    public int removeDuplicates(int[] nums) {
        if (nums.length == 0) return 0;
        int write = 1;
        for (int read = 1; read < nums.length; read++) {
            if (nums[read] != nums[write - 1]) {
                nums[write] = nums[read];
                write++;
            }
        }
        return write;
    }
}`,
    examples: [
      { input: "nums = [1, 1, 2]", output: "2, with nums starting [1, 2, ...]" },
      { input: "nums = [0,0,1,1,1,2,2,3,3,4]", output: "5, with nums starting [0,1,2,3,4, ...]" },
    ],
    testCases: [
      { input: [[1, 1, 2]], expected: [1, 2] },
      { input: [[0, 0, 1, 1, 1, 2, 2, 3, 3, 4]], expected: [0, 1, 2, 3, 4] },
      { input: [[]], expected: [], hidden: true, description: "empty input" },
      { input: [[7]], expected: [7], hidden: true, description: "single element" },
      {
        input: [[2, 2, 2, 2]],
        expected: [2],
        hidden: true,
        description: "every element identical",
      },
      {
        input: [[-3, -1, -1, 0, 5]],
        expected: [-3, -1, 0, 5],
        hidden: true,
        description: "negatives, already mostly distinct",
      },
    ],
    hints: [
      "You are producing a shorter array inside the same memory as the longer one. That means two positions matter at any moment, not one.",
      "If you are looking at `nums[read]` and it is a duplicate, which of your two positions should move and which should stay?",
      "Keep a write index and a read index. The read index advances every iteration; the write index only advances when you have found a value worth keeping.",
      "Start `write` at 1 and `read` at 1, since the first element is always kept. For each `read`, compare `nums[read]` against the last value you kept — that is `nums[write - 1]`, not `nums[read - 1]`. When they differ, copy `nums[read]` into `nums[write]` and increment `write`. At the end `write` is your answer. Handle the empty array before the loop.",
    ],
    pitfalls: [
      "Comparing against `nums[read - 1]` instead of `nums[write - 1]` breaks on runs of three or more duplicates.",
      "The elements past index k are ignored — do not waste effort clearing them.",
      "The empty array has to return 0 before the loop starts.",
    ],
    complexity: { time: "O(n)", space: "O(1)" },
  },

  {
    id: "dsa-hashing-two-sum",
    track: "dsa",
    topic: "hashing",
    difficulty: "easy",
    kind: "method",
    title: "Two Sum",
    prompt:
      "Return the indices of two distinct elements of `nums` that add up to `target`. " +
      "Exactly one such pair exists.\n\n" +
      "Return them in either order — any correct pair is accepted.",
    signature: {
      className: "Solution",
      method: "twoSum",
      params: [
        { name: "nums", type: "int[]" },
        { name: "target", type: "int" },
      ],
      returns: "int[]",
    },
    // There is no single right answer, so the checker validates the property
    // rather than matching a value. `expected` here is only a sample answer
    // shown in the UI; the checker deliberately ignores it.
    comparison: {
      mode: "custom",
      expectedType: "int[]",
      javaChecker: `int[] r = (int[]) actual;
int[] nums = (int[]) args[0];
int target = (Integer) args[1];
if (r == null || r.length != 2) return false;
if (r[0] == r[1]) return false;
if (r[0] < 0 || r[1] < 0 || r[0] >= nums.length || r[1] >= nums.length) return false;
return nums[r[0]] + nums[r[1]] == target;`,
    },
    starterCode: `import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        // your code here
    }
}`,
    solution: `import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) {
                return new int[] { j, i };
            }
            seen.put(nums[i], i);
        }
        return new int[] { -1, -1 };
    }
}`,
    examples: [
      { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", note: "[1, 0] is equally fine." },
    ],
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
      { input: [[3, 3], 6], expected: [0, 1], hidden: true, description: "equal values, distinct indices" },
      {
        input: [[-1, -2, -3, -4, -5], -8],
        expected: [2, 4],
        hidden: true,
        description: "negative numbers",
      },
      {
        input: [[0, 4, 3, 0], 0],
        expected: [0, 3],
        hidden: true,
        description: "the pair is two zeroes",
      },
    ],
    hints: [
      "The obvious approach checks every pair. The cost of that grows with the square of the input, and the reason is that you keep re-searching ground you already covered.",
      "When you are standing on `nums[i]`, what single specific value would complete the pair, and could you have recognised it when you walked past it earlier?",
      "A hash map from value to index lets you ask 'have I already seen the number I need?' in constant time.",
      "Walk the array once, keeping a `Map<Integer, Integer>` from value to the index it was seen at. At each `i`, compute `target - nums[i]` and look it up. If it is present you have your pair — return that stored index and `i`. Otherwise record `nums[i] -> i` and continue. Look up before inserting, or an element whose value is exactly half the target will match itself.",
    ],
    pitfalls: [
      "Inserting before looking up lets an element pair with itself.",
      "Duplicate values overwrite each other in the map — that is fine here, because you look up before inserting.",
    ],
    complexity: { time: "O(n)", space: "O(n)" },
  },

  {
    id: "dsa-trees-max-depth",
    track: "dsa",
    topic: "trees",
    difficulty: "easy",
    kind: "method",
    title: "Maximum Depth of a Binary Tree",
    prompt:
      "Return the number of nodes on the longest path from the root down to a leaf. " +
      "An empty tree has depth 0.\n\n" +
      "Trees are written in level order, with `null` marking an absent child: " +
      "`[3, 9, 20, null, null, 15, 7]`.",
    signature: {
      className: "Solution",
      method: "maxDepth",
      params: [{ name: "root", type: "TreeNode" }],
      returns: "int",
    },
    starterCode: `class Solution {
    public int maxDepth(TreeNode root) {
        // your code here
    }
}`,
    solution: `class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
}`,
    examples: [
      { input: "root = [3, 9, 20, null, null, 15, 7]", output: "3" },
      { input: "root = []", output: "0" },
    ],
    testCases: [
      { input: [[3, 9, 20, null, null, 15, 7]], expected: 3 },
      { input: [[1, null, 2]], expected: 2, description: "right-leaning" },
      { input: [[]], expected: 0, hidden: true, description: "empty level-order array" },
      { input: [null], expected: 0, hidden: true, description: "an explicitly null tree" },
      { input: [[0]], expected: 1, hidden: true, description: "a single node holding 0" },
      {
        input: [[1, 2, null, 3, null, 4, null, 5]],
        expected: 5,
        hidden: true,
        description: "a left spine",
      },
    ],
    hints: [
      "The depth of a tree is defined in terms of the depth of smaller trees. That shape usually tells you what kind of solution fits.",
      "If you already knew the depth of the left subtree and the depth of the right subtree, what would you do with those two numbers?",
      "Recursion. The base case is the empty tree; every other case combines the two subtree answers.",
      "Return 0 when `root` is null. Otherwise return `1 + Math.max(maxDepth(root.left), maxDepth(root.right))` — the 1 counts the current node, and the max picks whichever side runs deeper. An iterative level-order traversal counting levels works too and avoids deep recursion on a degenerate tree.",
    ],
    pitfalls: [
      "Depth counts nodes, not edges, so a single node is depth 1 and not 0.",
      "A tree that is one long chain recurses as deep as it is tall — worth remembering when inputs get large.",
    ],
    complexity: { time: "O(n)", space: "O(h) for the call stack" },
  },
];
