/**
 * Validator tests.
 *
 * Each footgun from the design gets a deliberately corrupted problem and an
 * assertion that the message names the actual mistake. A validator that
 * rejects bad input with an unreadable message is only half working — the
 * authoring pipeline feeds these strings back to the model as repair input.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ALL } from "./index.js";
import { validateAll, validateProblem } from "./validate.js";
import type { ClassProblem, MethodProblem, Problem, StdioProblem } from "./types.js";

/** A minimal problem that passes, used as the base for each corruption. */
function baseMethod(): MethodProblem {
  return {
    id: "test-base",
    track: "dsa",
    topic: "hashing",
    difficulty: "easy",
    kind: "method",
    title: "Base",
    prompt: "Add one.",
    signature: {
      className: "Solution",
      method: "addOne",
      params: [{ name: "n", type: "int" }],
      returns: "int",
    },
    starterCode: "class Solution {\n    public int addOne(int n) {\n    }\n}",
    solution: "class Solution {\n    public int addOne(int n) {\n        return n + 1;\n    }\n}",
    hints: ["Orient.", "What is n?", "Add.", "Return n + 1."],
    testCases: [
      { input: [1], expected: 2 },
      { input: [2], expected: 3 },
      { input: [3], expected: 4, hidden: true },
      { input: [4], expected: 5, hidden: true },
    ],
  };
}

function errorsFor(mutate: (p: MethodProblem) => void): string[] {
  const p = baseMethod();
  mutate(p);
  return validateProblem(p);
}

function assertMentions(errors: string[], needle: string): void {
  const hit = errors.some((e) => e.toLowerCase().includes(needle.toLowerCase()));
  assert.ok(hit, `no error mentioned ${JSON.stringify(needle)}. Got:\n  ${errors.join("\n  ")}`);
}

test("the base problem is valid", () => {
  assert.deepEqual(validateProblem(baseMethod()), []);
});

test("footgun: a long past 2^53 authored as a number is rejected", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "long" }];
    // Already precision-lost by the time it is written down.
    p.testCases[0]!.input = [9007199254740993];
  });
  assertMentions(errors, "safe integer");
  assertMentions(errors, "author it as a string");
});

test("footgun: a long authored as a string is accepted", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "long" }];
    for (const tc of p.testCases) tc.input = ["9007199254740993"];
  });
  assert.deepEqual(errors, []);
});

test("footgun: a char of length 2 is rejected", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "char" }];
    p.testCases[0]!.input = ["ab"];
  });
  assertMentions(errors, "exactly one UTF-16 code unit");
});

test("footgun: an emoji is rejected as a char (two code units)", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "char" }];
    p.testCases[0]!.input = ["\u{1F600}"];
  });
  assertMentions(errors, "exactly one UTF-16 code unit");
});

test("footgun: null on a primitive is rejected", () => {
  const errors = errorsFor((p) => {
    p.testCases[0]!.input = [null];
  });
  assertMentions(errors, "null is not allowed for primitive type int");
  assertMentions(errors, "use a boxed type");
});

test("null is accepted for the boxed Integer", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "Integer" }];
    for (const tc of p.testCases) tc.input = [null];
  });
  assert.deepEqual(errors, []);
});

test("an oversized literal is pushed toward a stdio problem", () => {
  const errors = errorsFor((p) => {
    p.signature.params = [{ name: "n", type: "int[]" }];
    p.testCases[0]!.input = [Array.from({ length: 600 }, (_, i) => i)];
  });
  assertMentions(errors, "literal cap");
  assertMentions(errors, "stdio problem");
});

test("too few hidden cases is rejected, with the reason", () => {
  const errors = errorsFor((p) => {
    for (const tc of p.testCases) tc.hidden = false;
  });
  assertMentions(errors, "at least 2 hidden cases");
  assertMentions(errors, "hardcoded");
});

test("an L2 hint that stopped being a question is rejected", () => {
  const errors = errorsFor((p) => {
    p.hints[1] = "Use a hash map.";
  });
  assertMentions(errors, "L2 Probe");
});

test("argument arity is checked against the signature", () => {
  const errors = errorsFor((p) => {
    p.testCases[0]!.input = [1, 2];
  });
  assertMentions(errors, "expected 1 argument");
});

test("a topic from another track is rejected", () => {
  const errors = errorsFor((p) => {
    p.topic = "syntax"; // java-fundamentals, not dsa
  });
  assertMentions(errors, "belongs to track java-fundamentals");
});

test("an unknown topic is rejected", () => {
  const errors = errorsFor((p) => {
    p.topic = "quantum-sorting";
  });
  assertMentions(errors, "not in the manifest");
});

test("a solution using its own banned API is rejected", () => {
  const errors = errorsFor((p) => {
    p.bannedApis = ["return"];
  });
  assertMentions(errors, "banned API");
});

test("a starter identical to the solution is rejected", () => {
  const errors = errorsFor((p) => {
    p.starterCode = p.solution;
  });
  assertMentions(errors, "identical to starterCode");
});

test("a void method with no custom checker is rejected as unverifiable", () => {
  const errors = errorsFor((p) => {
    p.signature.returns = "void";
    for (const tc of p.testCases) tc.expected = null;
  });
  assertMentions(errors, "nothing to check");
});

test("a custom checker that never returns is rejected", () => {
  const errors = errorsFor((p) => {
    p.comparison = { mode: "custom", javaChecker: "int x = 1;" };
  });
  assertMentions(errors, "must return a boolean");
});

test("approx comparison needs a positive epsilon", () => {
  const errors = errorsFor((p) => {
    p.comparison = { mode: "approx", epsilon: 0 };
  });
  assertMentions(errors, "positive epsilon");
});

test("custom expectedType is what expected gets validated against", () => {
  // expected is an int[] while the method returns int — legal only because
  // expectedType says so.
  const ok = errorsFor((p) => {
    p.comparison = { mode: "custom", expectedType: "int[]", javaChecker: "return true;" };
    for (const tc of p.testCases) tc.expected = [1, 2];
  });
  assert.deepEqual(ok, []);

  // ...and it is still type-checked, not waved through.
  const bad = errorsFor((p) => {
    p.comparison = { mode: "custom", expectedType: "int[]", javaChecker: "return true;" };
    for (const tc of p.testCases) tc.expected = ["not", "ints"];
  });
  assertMentions(bad, "expected an int");
});

test("class kind: an op naming an undeclared method is rejected", () => {
  const p = ALL.find((x): x is ClassProblem => x.kind === "class")!;
  const broken: ClassProblem = structuredClone(p);
  broken.testCases[0]!.ops[1] = ["frobnicate", 1];
  assertMentions(validateProblem(broken), "no such method");
});

test("class kind: ops and expected must line up one-to-one", () => {
  const p = ALL.find((x): x is ClassProblem => x.kind === "class")!;
  const broken: ClassProblem = structuredClone(p);
  broken.testCases[0]!.expected.pop();
  assertMentions(validateProblem(broken), "line up one-to-one");
});

test("class kind: the first op must be the constructor", () => {
  const p = ALL.find((x): x is ClassProblem => x.kind === "class")!;
  const broken: ClassProblem = structuredClone(p);
  broken.testCases[0]!.ops[0] = ["get", 1];
  assertMentions(validateProblem(broken), "first op must construct");
});

test("class kind: a void method must expect null", () => {
  const p = ALL.find((x): x is ClassProblem => x.kind === "class")!;
  const broken: ClassProblem = structuredClone(p);
  broken.testCases[0]!.expected[1] = 99; // op 1 is put(), which returns void
  assertMentions(validateProblem(broken), "returns void");
});

test("stdio kind: a case with no expected stdout is rejected", () => {
  const p = ALL.find((x): x is StdioProblem => x.kind === "stdio")!;
  const broken: StdioProblem = structuredClone(p);
  delete broken.testCases[0]!.stdout;
  assertMentions(validateProblem(broken), "needs stdout");
});

test("stdio kind: a cp problem without a time limit is rejected", () => {
  const p = ALL.find((x): x is StdioProblem => x.kind === "stdio")!;
  const broken: StdioProblem = structuredClone(p);
  delete broken.timeLimitMs;
  assertMentions(validateProblem(broken), "timeLimitMs");
});

test("duplicate ids are caught across the corpus", () => {
  const dup: Problem[] = [baseMethod(), baseMethod()];
  const report = validateAll(dup);
  assert.equal(report.ok, false);
  assert.deepEqual(report.duplicateIds, ["test-base"]);
});

test("the whole authored corpus is valid", () => {
  const report = validateAll(ALL);
  const failures = report.byProblem.filter((r) => r.errors.length > 0);
  assert.deepEqual(
    failures.map((f) => `${f.id}: ${f.errors.join("; ")}`),
    [],
  );
  assert.deepEqual(report.duplicateIds, []);
  assert.ok(report.ok);
});

test("the corpus exercises all three problem kinds", () => {
  const kinds = new Set(ALL.map((p) => p.kind));
  assert.deepEqual([...kinds].sort(), ["class", "method", "stdio"]);
});

// -------------------------------------------------- stdio data file paths

test("a stdio data file that climbs out of content/data is rejected", async () => {
  // The validator is the right place for this, not the runner: it runs on
  // every authored AND generated problem before anything touches the disk,
  // and `stdio` generation is still an open gap in the authoring pipeline.
  const { validateProblem } = await import("./validate.js");
  const { ALL } = await import("./index.js");

  const stdio = ALL.find((p) => p.kind === "stdio");
  assert.ok(stdio, "no stdio problem to base the fixture on");

  const bad = [
    "../secret.txt",
    "../../etc/passwd",
    "/etc/passwd",
    "sub/../../out.txt",
    "",
    " spaced.txt",
  ];
  for (const name of bad) {
    const p = { ...stdio, testCases: [{ stdinFile: name, stdout: "1" }] } as typeof stdio;
    const errs = validateProblem(p);
    assert.ok(
      errs.some((e) => /stdinFile/.test(e)),
      `accepted stdinFile "${name}": ${JSON.stringify(errs)}`,
    );
  }

  // And an ordinary name still passes, so the rule is not simply "always no".
  for (const name of ["big-input.txt", "cp/fast-io-1.in", "case_01.txt"]) {
    const p = { ...stdio, testCases: [{ stdinFile: name, stdout: "1" }] } as typeof stdio;
    const errs = validateProblem(p).filter((e) => /stdinFile/.test(e));
    assert.deepEqual(errs, [], `rejected a legitimate name "${name}"`);
  }
});
