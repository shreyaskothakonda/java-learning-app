/**
 * Concept-page validation.
 *
 * The expensive half of this — does the example actually print what the page
 * says — needs a JVM and lives in scripts/validate-concepts.ts, wired into
 * `npm run validate:all` and the pre-commit hook. What is here is everything
 * that can be checked without one, plus proof that the checks can fail.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CONCEPTS, getConcept } from "./concepts/index.js";
import { outputMatches, validateConcept, validateConcepts } from "./concepts/validate.js";
import type { Concept } from "./concepts/types.js";

const SLUGS = new Set(CONCEPTS.map((c) => c.slug));

test("every shipped concept passes static validation", () => {
  const report = validateConcepts(CONCEPTS);
  const errors = report.byConcept.flatMap((r) => r.errors);
  assert.deepEqual(errors, [], errors.join("\n  "));
  assert.deepEqual(report.duplicateSlugs, []);
});

test("every example is a whole program, because a fragment cannot be verified", () => {
  for (const c of CONCEPTS) {
    for (const ex of c.examples) {
      assert.match(ex.code, /class\s+Main\b/, `${c.slug}: ${ex.caption}`);
      assert.match(ex.code, /static\s+void\s+main\s*\(/, `${c.slug}: ${ex.caption}`);
      assert.notEqual(ex.expectedOutput.trim(), "", `${c.slug}: ${ex.caption} claims no output`);
    }
  }
});

test("every quiz answer is a real option and every one explains itself", () => {
  for (const c of CONCEPTS) {
    for (const [i, q] of c.quiz.entries()) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length, `${c.slug} quiz ${i}: bad index`);
      assert.notEqual(q.explain.trim(), "", `${c.slug} quiz ${i}: a tick with no teaching`);
      assert.equal(
        new Set(q.options).size,
        q.options.length,
        `${c.slug} quiz ${i}: duplicate options`,
      );
    }
  }
});

test("cross-references resolve", () => {
  for (const c of CONCEPTS) {
    for (const s of c.seeAlso ?? []) {
      assert.ok(getConcept(s), `${c.slug}: seeAlso "${s}" does not exist`);
      assert.notEqual(s, c.slug, `${c.slug}: seeAlso points at itself`);
    }
  }
});

// ------------------------------------------------- the validator can fail

function broken(over: Partial<Concept>): Concept {
  return {
    slug: "sample",
    topic: "syntax",
    title: "Sample",
    summary: "A sample.",
    sections: [{ heading: "H", body: "B" }],
    examples: [
      {
        caption: "c",
        code: "public class Main { public static void main(String[] a) { System.out.println(1); } }",
        expectedOutput: "1",
      },
    ],
    pitfalls: [{ wrong: "a", right: "b", why: "c" }],
    quiz: [{ question: "q", options: ["a", "b"], answer: 0, explain: "e" }],
    ...over,
  };
}

test("the validator rejects what it claims to reject", () => {
  // Each of these has been a real authoring mistake in some codebase, and a
  // validator nobody has watched fail is a validator nobody should trust.
  const cases: [string, Partial<Concept>, RegExp][] = [
    ["an unknown topic", { topic: "not-a-topic" }, /not in the manifest/],
    ["a fragment instead of a program", { examples: [{ caption: "c", code: "int x = 1;", expectedOutput: "1" }] }, /no "class Main"/],
    [
      "an example that claims nothing",
      { examples: [{ caption: "c", code: "public class Main { public static void main(String[] a) {} }", expectedOutput: "" }] },
      /states no expected output/,
    ],
    ["a quiz answer out of range", { quiz: [{ question: "q", options: ["a", "b"], answer: 5, explain: "e" }] }, /out of range/],
    ["a quiz with no explanation", { quiz: [{ question: "q", options: ["a", "b"], answer: 0, explain: "" }] }, /no explanation/],
    ["duplicate quiz options", { quiz: [{ question: "q", options: ["a", "a"], answer: 0, explain: "e" }] }, /duplicate options/],
    ["a pitfall that says the same thing twice", { pitfalls: [{ wrong: "x", right: "x", why: "y" }] }, /wrong and right are the same/],
    ["a dangling seeAlso", { seeAlso: ["no-such-concept"] }, /is not a concept/],
    ["a practice link to no problem", { practice: ["no-such-problem"] }, /is not a problem/],
    ["no examples at all", { examples: [] }, /no examples/],
    ["a slug that is not kebab-case", { slug: "Not Kebab" }, /kebab-case/],
  ];

  for (const [label, over, expected] of cases) {
    const errors = validateConcept(broken(over), SLUGS);
    assert.ok(
      errors.some((e) => expected.test(e)),
      `${label}: expected an error matching ${expected}, got ${JSON.stringify(errors)}`,
    );
  }
});

test("a correct concept produces no errors, so the checks are not just always-on", () => {
  assert.deepEqual(validateConcept(broken({}), SLUGS), []);
});

// ------------------------------------------------------- output comparison

test("trailing whitespace does not fail a page, but a changed value does", () => {
  // Trailing spaces are invisible in a source file. A different number is the
  // whole point of the gate.
  assert.equal(outputMatches("a\nb  \n", "a\nb"), true);
  assert.equal(outputMatches("\na\nb\n\n", "a\nb"), true);
  assert.equal(outputMatches("a\r\nb", "a\nb"), true);
  assert.equal(outputMatches("true", "false"), false);
  assert.equal(outputMatches("a\nb", "a\nc"), false);
  // Alignment INSIDE a line is part of what the example prints, so it counts.
  assert.equal(outputMatches("127 == 127 : true", "127 == 127 :true"), false);
  // A missing line is a failure, not a near miss.
  assert.equal(outputMatches("a", "a\nb"), false);
});
