import type { Problem } from "../types.js";

export const CP: Problem[] = [
  {
    id: "cp-fast-io-sum",
    track: "cp",
    topic: "fast-io",
    difficulty: "easy",
    kind: "stdio",
    title: "Sum of N Integers",
    prompt:
      "The first line holds `N`. The second line holds `N` space-separated integers.\n\n" +
      "Print their sum, followed by a newline.\n\n" +
      "`N` can be up to 10^6 and each value up to 10^9 in magnitude, so the sum does not fit " +
      "in an `int` — and `Scanner` is too slow at this size.",
    // Only exact (whitespace-normalised, token-wise) makes sense for stdout.
    comparison: { mode: "exact" },
    timeLimitMs: 2000,
    starterCode: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        // your code here
    }
}`,
    solution: `import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        // StreamTokenizer is the fastest simple reader in the standard library.
        StreamTokenizer in = new StreamTokenizer(new BufferedInputStream(System.in));
        in.nextToken();
        int n = (int) in.nval;
        long sum = 0;
        for (int i = 0; i < n; i++) {
            in.nextToken();
            sum += (long) in.nval;
        }
        System.out.println(sum);
    }
}`,
    examples: [
      { input: "5\\n1 2 3 4 5", output: "15" },
      { input: "1\\n-7", output: "-7" },
    ],
    testCases: [
      { stdin: "5\n1 2 3 4 5\n", stdout: "15\n" },
      { stdin: "1\n-7\n", stdout: "-7\n" },
      { stdin: "0\n\n", stdout: "0\n", hidden: true, description: "no values at all" },
      {
        stdin: "3\n1000000000 1000000000 1000000000\n",
        stdout: "3000000000\n",
        hidden: true,
        description: "the sum overflows a 32-bit int",
      },
      {
        stdin: "4\n-1000000000 -1000000000 -1000000000 -1000000000\n",
        stdout: "-4000000000\n",
        hidden: true,
        description: "negative overflow",
      },
    ],
    hints: [
      "Two things about this problem have nothing to do with adding numbers: how big the answer gets, and how fast you can read the input.",
      "What is the largest value your accumulator could hold, and does that fit in the type you chose?",
      "Accumulate into a `long`, and read with `StreamTokenizer` or `BufferedReader` rather than `Scanner`.",
      "Wrap `System.in` in a `BufferedInputStream` and hand it to a `StreamTokenizer`. Call `nextToken()` once for N, then N more times, reading each value from the `nval` field and adding it into a `long`. Print once at the end. `Scanner` does regex work per token and is roughly an order of magnitude too slow at 10^6 values.",
    ],
    pitfalls: [
      "`Scanner` will time out at this input size even though the logic is right.",
      "`StreamTokenizer.nval` is a `double`, so cast it — and note it only holds integers exactly up to 2^53.",
      "Printing inside the loop instead of once at the end is its own performance problem.",
    ],
    complexity: { time: "O(n)", space: "O(1)" },
    resources: [
      {
        label: "StreamTokenizer",
        url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/StreamTokenizer.html",
      },
    ],
  },
];
