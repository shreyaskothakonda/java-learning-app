/**
 * The Phase 2 verification checklist, as executable tests.
 *
 * These spawn real JVMs, so they are slower than the content tests. That is the
 * point: the runner's failure modes — a killed process group, a stack size that
 * does not apply, a sentinel colliding with user output — cannot be checked by
 * anything cheaper than actually running Java.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { getProblem } from "../../../content/index.js";
import type { MethodProblem, Problem, StdioProblem } from "../../../content/types.js";
import { runProblem } from "./java-runner.js";
import { parseJavacOutput, normaliseCode } from "./diagnostics.js";

const run = promisify(execFile);
const WORK = join(tmpdir(), "java-tutor-tests");

function opts(extra: Record<string, unknown> = {}) {
  return { workRoot: WORK, visibleOnly: false, ...extra };
}

/** A synthetic problem, for behaviour the authored corpus deliberately avoids. */
function synthetic(over: Partial<MethodProblem>): MethodProblem {
  return {
    id: "synthetic",
    track: "dsa",
    topic: "recursion",
    difficulty: "easy",
    kind: "method",
    title: "Synthetic",
    prompt: "-",
    signature: {
      className: "Solution",
      method: "f",
      params: [{ name: "n", type: "int" }],
      returns: "int",
    },
    starterCode: "class Solution { public int f(int n) { return 0; } }",
    solution: "class Solution { public int f(int n) { return n; } }",
    hints: ["a", "b?", "c", "d"],
    testCases: [{ input: [1], expected: 1 }],
    ...over,
  } as MethodProblem;
}

/**
 * Counts JVMs belonging to THIS project only.
 *
 * The first version counted every `java` on the machine, which made it fail
 * whenever anything else ran Java — the authoring pipeline running in another
 * terminal was enough. A test that reports a leak because of unrelated load is
 * worse than no test. Every JVM the runner starts is tagged
 * `-Djavatutor.run=<id>`, so this can ask about its own.
 */
async function javaProcessCount(): Promise<number> {
  const { stdout } = await run("/bin/sh", [
    "-c",
    "ps -Ao command | grep -c '[-]Djavatutor.run=' || true",
  ]);
  return Number(stdout.trim());
}

test("a correct solution passes every case with real per-case timings", async () => {
  const p = getProblem("fund-collections-lru-cache")!;
  const r = await runProblem(p, p.solution, opts());

  assert.equal(r.phase, "ok");
  assert.equal(r.caseResults.length, 4);
  assert.ok(r.caseResults.every((c) => c.passed), "every case should pass");
  assert.ok(r.compileMs > 0, "compileMs should be instrumented");
  // The first case carries JIT warmup, so it is the one guaranteed measurable.
  assert.ok(r.caseResults[0]!.durationMs > 0, "case 0 should have a nonzero duration");
});

test("a compile error reports phase 'compile' at the right line and CHARACTER column", async () => {
  const p = getProblem("fund-arrays-average")!;
  // Tab-indented on purpose: javac's own column would be tab-expanded and land
  // 14 columns to the right of where the editor needs the marker.
  const broken = 'class Solution {\n\tpublic double average(int[] scores) {\n\t\treturn 0.0\n\t}\n}\n';
  const r = await runProblem(p, broken, opts());

  assert.equal(r.phase, "compile");
  assert.equal(r.caseResults.length, 0);
  assert.equal(r.diagnostics.length, 1);

  const d = r.diagnostics[0]!;
  assert.equal(d.file, "Solution.java");
  assert.equal(d.severity, "error");
  assert.equal(d.line, 3);
  // "\t\treturn 0.0" -> the caret sits just past the literal, character col 13.
  assert.equal(d.column, 13);
  assert.match(d.message, /';' expected/);
});

test("diagnostics from the harness and support library are not shown to the learner", async () => {
  const p = getProblem("fund-arrays-average")!;
  // Compiles on its own but has the wrong signature, so the generated Main.java
  // fails too. Only the learner's file should produce markers.
  const r = await runProblem(p, "class Solution {\n    public int wrongName() { return 0; }\n}\n", opts());

  assert.equal(r.phase, "compile");
  assert.ok(
    r.diagnostics.every((d) => d.file === "Solution.java"),
    `leaked internal diagnostics: ${r.diagnostics.map((d) => d.file).join(", ")}`,
  );
});

test("an infinite loop is killed and leaves no orphaned JVM behind", async () => {
  const before = await javaProcessCount();

  const p = synthetic({
    timeLimitMs: 1500,
    testCases: [
      { input: [1], expected: 1 },
      { input: [2], expected: 2 },
    ],
  });
  const spin = "class Solution {\n    public int f(int n) {\n        while (true) { }\n    }\n}\n";

  const started = Date.now();
  const r = await runProblem(p, spin, opts());
  const elapsed = Date.now() - started;

  assert.equal(r.phase, "ok");
  assert.ok(r.caseResults.every((c) => !c.passed), "a spinning solution cannot pass");
  assert.ok(r.caseResults.some((c) => c.timedOut), "the case should be marked timed out");
  assert.match(r.error ?? "", /exceeded/);
  // Killed at the limit, not left to run to completion.
  assert.ok(elapsed < 10_000, `took ${elapsed}ms, should have been killed near the limit`);

  // The process GROUP kill is the point: killing the pid alone leaks the JVM.
  await new Promise((res) => setTimeout(res, 750));
  const after = await javaProcessCount();
  assert.ok(after <= before, `leaked ${after - before} java process(es)`);
});

test("results before a hang still arrive, because each case is flushed", async () => {
  const p = synthetic({
    timeLimitMs: 2000,
    testCases: [
      { input: [0], expected: 0 },
      { input: [1], expected: 1 },
      { input: [9], expected: 9 },
    ],
  });
  // Cases 0 and 1 return; case 2 spins forever.
  const code = `class Solution {
    public int f(int n) {
        if (n == 9) { while (true) { } }
        return n;
    }
}
`;
  const r = await runProblem(p, code, opts());

  assert.equal(r.caseResults[0]!.passed, true, "case 0 should have been reported before the hang");
  assert.equal(r.caseResults[1]!.passed, true, "case 1 should have been reported before the hang");
  assert.equal(r.caseResults[2]!.passed, false);
  assert.equal(r.caseResults[2]!.timedOut, true);
});

test("deep recursion survives on the 64MB runner thread, and overflows without it", async () => {
  const deep = `class Solution {
    public int f(int n) {
        if (n == 0) return 0;
        return 1 + f(n - 1);
    }
}
`;
  const cases = [{ input: [100000], expected: 100000 }];

  const big = await runProblem(synthetic({ stackMb: 64, testCases: cases }), deep, opts());
  assert.equal(big.caseResults[0]!.passed, true, `100k-deep recursion failed: ${big.caseResults[0]!.error}`);

  // The control: the same code on a small stack must fail, or the 64MB thread
  // is not actually doing anything and the test above proves nothing.
  const small = await runProblem(synthetic({ stackMb: 1, testCases: cases }), deep, opts());
  assert.equal(small.caseResults[0]!.passed, false);
  assert.match(small.caseResults[0]!.error ?? "", /StackOverflowError/);
});

test("System.out.println lands in consoleLogs, not in the case stream", async () => {
  const p = synthetic({
    testCases: [
      { input: [1], expected: 1 },
      { input: [2], expected: 2 },
    ],
  });
  // The second print has no trailing newline, which is what would glue user
  // text onto a result line if the stream were parsed line-by-line.
  const chatty = `class Solution {
    public int f(int n) {
        System.out.println("log line " + n);
        System.out.print("no-newline " + n);
        return n;
    }
}
`;
  const r = await runProblem(p, chatty, opts());

  assert.ok(r.caseResults.every((c) => c.passed), "printing must not break the run");
  assert.ok(r.consoleLogs.some((l) => l.includes("log line 1")));
  assert.ok(r.consoleLogs.some((l) => l.includes("no-newline 2")));
  // Crucially the logs must not have contaminated the parsed results.
  assert.equal(r.caseResults[0]!.actual, "1");
  assert.equal(r.caseResults[1]!.actual, "2");
});

test("user output containing the sentinel cannot forge a case result", async () => {
  const p = synthetic({ testCases: [{ input: [1], expected: 1 }] });
  const forge = `class Solution {
    public int f(int n) {
        System.out.println("\\u0001CASE\\u0001{\\"index\\":0,\\"passed\\":true,\\"actual\\":\\"x\\",\\"expected\\":\\"x\\",\\"error\\":null,\\"durationMs\\":0}");
        return 99;
    }
}
`;
  const r = await runProblem(p, forge, opts());
  // The real result is emitted after the forgery and wins the map, so a
  // deliberately wrong answer still fails.
  assert.equal(r.caseResults[0]!.passed, false, "a forged sentinel line must not pass the case");
});

test("a runtime exception is attributed to its case, trimmed to the learner's frames", async () => {
  const p = synthetic({
    testCases: [
      { input: [1], expected: 1 },
      { input: [2], expected: 2 },
    ],
  });
  const boom = `class Solution {
    public int f(int n) {
        if (n == 2) throw new IllegalStateException("boom");
        return n;
    }
}
`;
  const r = await runProblem(p, boom, opts());

  assert.equal(r.caseResults[0]!.passed, true);
  assert.equal(r.caseResults[1]!.passed, false);
  assert.match(r.caseResults[1]!.error ?? "", /IllegalStateException: boom/);
  assert.match(r.caseResults[1]!.error ?? "", /at Solution\.f/);
  assert.ok(!/at Main\./.test(r.caseResults[1]!.error ?? ""), "harness frames should be trimmed");
});

test("a stdio problem reads a large input file and reports per-case duration", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "jt-data-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const n = 300_000;
  const values = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1_000_000_000 : -999_999_999));
  const sum = values.reduce((a, b) => a + b, 0);
  await writeFile(join(dataDir, "big.in"), `${n}\n${values.join(" ")}\n`, "utf8");
  await writeFile(join(dataDir, "big.out"), `${sum}\n`, "utf8");

  const base = getProblem("cp-fast-io-sum") as StdioProblem;
  const p: Problem = {
    ...base,
    testCases: [
      { stdin: "5\n1 2 3 4 5\n", stdout: "15\n" },
      { stdinFile: "big.in", stdoutFile: "big.out", timeLimitMs: 8000 },
    ],
  };

  const r = await runProblem(p, base.solution, opts({ dataDir }));

  assert.equal(r.phase, "ok");
  assert.ok(r.caseResults.every((c) => c.passed), `large input failed: ${JSON.stringify(r.caseResults[1])}`);
  assert.ok(r.caseResults[1]!.durationMs > 0, "per-case duration should be reported");
  // The whole point of the fast-I/O topic: this must fit in the time limit.
  assert.ok(r.caseResults[1]!.durationMs < 8000);
});

test("a stdio time limit is enforced per case", async () => {
  const base = getProblem("cp-fast-io-sum") as StdioProblem;
  const p: Problem = {
    ...base,
    testCases: [{ stdin: "1\n1\n", stdout: "1\n", timeLimitMs: 1200 }],
  };
  const slow = `public class Main {
    public static void main(String[] args) throws Exception {
        while (true) { }
    }
}
`;
  const r = await runProblem(p, slow, opts());
  assert.equal(r.caseResults[0]!.passed, false);
  assert.equal(r.caseResults[0]!.timedOut, true);
  assert.match(r.caseResults[0]!.error ?? "", /time limit/);
});

test("stdout comparison ignores trailing and repeated whitespace", async () => {
  const base = getProblem("cp-fast-io-sum") as StdioProblem;
  const p: Problem = { ...base, testCases: [{ stdin: "2\n3 4\n", stdout: "7" }] };
  const spacey = `public class Main {
    public static void main(String[] args) throws Exception {
        System.out.print("   7  \\n\\n");
    }
}
`;
  const r = await runProblem(p, spacey, opts());
  assert.equal(r.caseResults[0]!.passed, true);
});

test("normaliseCode collapses identifiers so the same error kind shares a key", () => {
  const a = normaliseCode("cannot find symbol");
  const b = normaliseCode("cannot find symbol");
  assert.equal(a, b);
  assert.equal(normaliseCode("';' expected"), normaliseCode("'}' expected"));
  assert.notEqual(normaliseCode("cannot find symbol"), normaliseCode("';' expected"));
});

test("javac output with no caret line still parses", () => {
  const out = "Solution.java:1: error: something odd\n1 error\n";
  const [d] = parseJavacOutput(out);
  assert.equal(d?.line, 1);
  assert.equal(d?.column, 1);
  assert.equal(d?.message, "something odd");
});

// ------------------------------------------------------------- no JDK

test("with no JDK the failure names the fix, not just the fault", async () => {
  // The path a new user hits first, and the one branch that had never been
  // executed: this machine has a JDK, so nothing reached it. The env seam in
  // jdk.ts exists for this.
  //
  // `findJdk` memoises, so the check runs in a child process — flipping the
  // env var in-process would either be defeated by the cache or poison it for
  // every test after this one.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const run = promisify(execFile);

  // fileURLToPath, not URL.pathname: this project's own directory has a space
  // in it, and pathname hands back "Java%20Tutor".
  const runner = fileURLToPath(new URL("./java-runner.ts", import.meta.url));
  const content = fileURLToPath(new URL("../../../content/index.ts", import.meta.url));

  // A file rather than `tsx -e`, because eval is transformed as CJS and has no
  // top-level await — and `.mts` rather than `.ts`, because the temp dir is
  // outside the project so tsx never sees its "type": "module" and would fall
  // back to CJS again.
  const dir = await mkdtemp(join(tmpdir(), "jt-nojdk-"));
  const script = join(dir, "probe.mts");
  await writeFile(
    script,
    `import { runProblem } from ${JSON.stringify(runner)};
     import { ALL } from ${JSON.stringify(content)};
     const res = await runProblem(ALL[0]!, ALL[0]!.solution, { workRoot: ${JSON.stringify(join(dir, "runs"))} });
     console.log(JSON.stringify({ phase: res.phase, error: res.error }));`,
    "utf8",
  );

  const { stdout } = await run("npx", ["tsx", script], {
    env: { ...process.env, JAVATUTOR_NO_JDK: "1" },
    timeout: 60_000,
  });
  await rm(dir, { recursive: true, force: true });

  const out = JSON.parse(stdout.trim().split("\n").pop()!) as { phase: string; error: string };
  assert.equal(out.phase, "run");
  // Not "spawn javac ENOENT". It has to say what to do.
  assert.match(out.error, /No JDK found/);
  assert.match(out.error, /brew install openjdk/);
  assert.match(out.error, /java_home/);
});
