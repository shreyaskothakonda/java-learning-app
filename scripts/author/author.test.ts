/**
 * Pipeline logic that does not need a model.
 *
 * The repair rule is the important one. A model asked to fix a failing problem
 * will, given the opportunity, "fix" it by weakening the test cases — and the
 * result looks fine and asserts nothing. The pipeline is built so that cannot
 * happen structurally, and this proves the structure rather than the prompt.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ALL, getProblem } from "@content/index.js";
import { checkDuplicate, normaliseTitle } from "./dedupe.js";
import { caseFingerprint } from "./pipeline.js";
import { mutate } from "./gates.js";
import type { Problem } from "@content/types.js";

// ------------------------------------------------------------------ dedupe

const existing = ALL.map((p) => ({ id: p.id, title: p.title, prompt: p.prompt }));

test("an identical title is caught regardless of punctuation or case", () => {
  const v = checkDuplicate({ title: "two sum", prompt: "Something else entirely." }, existing);
  assert.equal(v.duplicate, true);
  assert.match((v as { why: string }).why, /identical title/);
});

test("a reworded duplicate is caught by prompt overlap", () => {
  const twoSum = getProblem("dsa-hashing-two-sum")!;
  const v = checkDuplicate({ title: "Pair That Sums To Target", prompt: twoSum.prompt }, existing);
  assert.equal(v.duplicate, true);
  assert.match((v as { why: string }).why, /overlap/);
});

test("a genuinely different problem is not flagged", () => {
  const v = checkDuplicate(
    {
      title: "Most Frequent Character",
      prompt: "Return the character that occurs most often in the given string. Ties go to whichever appears first.",
    },
    existing,
  );
  assert.equal(v.duplicate, false);
});

test("title normalisation ignores case and punctuation", () => {
  assert.equal(normaliseTitle("Two-Sum!"), normaliseTitle("two sum"));
});

// ------------------------------------------------------------------ repair

test("the case fingerprint changes if and only if the cases change", () => {
  const p = getProblem("dsa-hashing-two-sum")!;
  const before = caseFingerprint(p);

  // Changing the solution — what repair is allowed to do — must not move it.
  assert.equal(caseFingerprint({ ...p, solution: "class Solution {}" } as Problem), before);
  // Changing a prompt must not move it either.
  assert.equal(caseFingerprint({ ...p, prompt: "different wording" } as Problem), before);

  // Weakening a case — what repair must never do — must move it.
  const weakened = {
    ...p,
    testCases: p.testCases.slice(0, 2),
  } as Problem;
  assert.notEqual(caseFingerprint(weakened), before, "dropping cases must be detectable");

  const edited = {
    ...p,
    testCases: p.testCases.map((c, i) => (i === 0 ? { ...c, expected: [9, 9] } : c)),
  } as Problem;
  assert.notEqual(caseFingerprint(edited), before, "editing an expected value must be detectable");
});

// ----------------------------------------------------------------- mutants

test("mutants are constructed for every authored solution", () => {
  for (const p of ALL) {
    const m = mutate(p.solution);
    assert.ok(m.length > 0, `${p.id}: no mutant could be constructed, so the cases go unchecked`);
  }
});

test("a mutant actually differs from the original", () => {
  for (const p of ALL) {
    for (const m of mutate(p.solution)) {
      assert.notEqual(m.code, p.solution, `${p.id}: mutant ${m.name} is identical to the solution`);
    }
  }
});

test("the return-constant mutant is the one that catches vacuous cases", () => {
  const solution = "class S { int f(int[] a) { int n = 0; for (int x : a) n++; return n; } }";
  const names = mutate(solution).map((m) => m.name);
  assert.ok(names.includes("return-constant"));
  const constant = mutate(solution).find((m) => m.name === "return-constant")!;
  assert.match(constant.code, /return 0;/);
});

// ------------------------------------------------------------- normalise

test("a bare method is wrapped in a class, with imports hoisted", async () => {
  const { normaliseSource } = await import("./pipeline.js");

  const bare = `import java.util.*;

public int countPairs(int[] nums) {
    Map<Integer, Integer> seen = new HashMap<>();
    return seen.size();
}`;
  const out = normaliseSource(bare, "Solution");
  assert.equal(out.wrapped, true);
  // Imports must sit ABOVE the class, or the wrap swaps one bad error for another.
  assert.match(out.code, /^import java\.util\.\*;\s*\n\s*\nclass Solution \{/);
  assert.ok(!/class Solution \{[\s\S]*import /.test(out.code), "an import ended up inside the class");
  assert.match(out.code, /public int countPairs/);
});

test("an already-complete source file is left alone", async () => {
  const { normaliseSource } = await import("./pipeline.js");
  for (const src of [
    "class Solution {\n    public int f() { return 1; }\n}",
    "import java.util.*;\n\npublic class Solution {\n    public int f() { return 1; }\n}",
    "final class Solution {\n    int f() { return 1; }\n}",
  ]) {
    const out = normaliseSource(src, "Solution");
    assert.equal(out.wrapped, false, `should not have wrapped:\n${src}`);
    assert.equal(out.code, src.trim());
  }
});

test("the wrapped output is real Java that javac accepts", async () => {
  const { normaliseSource } = await import("./pipeline.js");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const run = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "jt-wrap-"));
  const { code } = normaliseSource(
    "import java.util.*;\n\npublic int size(List<String> xs) {\n    return xs.size();\n}",
    "Solution",
  );
  await writeFile(join(dir, "Solution.java"), code, "utf8");
  await run("javac", ["-d", dir, join(dir, "Solution.java")]);
  await rm(dir, { recursive: true, force: true });
});

// ------------------------------------------------------- approach leaking

test("a prompt that states the approach is rejected", async () => {
  const { promptLeaksApproach } = await import("./pipeline.js");

  // Verbatim from the first generated batch — every one passed all the
  // compile-and-run gates and every one gave the answer away.
  const realLeaks = [
    "The naive approach compares every index against every other index, which is O(n*k). Instead, keep a Map from each value to the most recent index at which it was seen.",
    "`nums` may contain up to 200000 elements, so an O(n^2) count-by-rescanning solution will time out.",
    "A warning about iteration order: a HashMap does not iterate in the order you inserted keys.",
    "Use a set to track which values you have already seen.",
    "This can be solved with two pointers in linear time.",
  ];
  for (const p of realLeaks) {
    assert.notEqual(promptLeaksApproach(p), null, `should have been flagged: ${p.slice(0, 60)}`);
  }
});

test("a clean prompt is not flagged", async () => {
  const { promptLeaksApproach } = await import("./pipeline.js");
  // Deliberately includes words the gate must NOT trip on: a prompt may talk
  // about returning a list, or about a map as the SUBJECT of the question.
  const clean = [
    "Return the element that appears most often in `nums`. If several tie, return the smallest. An empty array returns Integer.MIN_VALUE.",
    "Return a list of every value that appears more than once, in ascending order. The input is never null and may be empty.",
    "Given a map of names to scores, return the name with the highest score. Ties go to whichever name sorts first.",
  ];
  for (const p of clean) {
    assert.equal(promptLeaksApproach(p), null, `false positive on: ${p.slice(0, 60)}`);
  }
});

test("every authored prompt in the corpus passes the leak gate", async () => {
  const { promptLeaksApproach } = await import("./pipeline.js");
  // The hand-written problems are the standard the generator is being held to.
  // If the gate rejects them, the gate is wrong.
  for (const p of ALL) {
    assert.equal(
      promptLeaksApproach(p.prompt),
      null,
      `${p.id}: the gate flagged a hand-authored prompt — it is miscalibrated`,
    );
  }
});
