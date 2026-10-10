/**
 * Static validation for concept pages.
 *
 * Everything here is a check that costs nothing and would otherwise be found
 * by a learner. The expensive half — does the example actually compile and
 * print what the page claims — lives in scripts/validate-concepts.ts, because
 * it needs a JVM.
 */

import { getAllProblems } from "../index.js";
import { topicExists } from "../manifest.js";
import type { Concept } from "./types.js";

export function validateConcept(c: Concept, allSlugs: Set<string>): string[] {
  const errors: string[] = [];
  const at = (s: string): string => `${c.slug}: ${s}`;

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) {
    errors.push(at("slug must be kebab-case"));
  }
  if (!topicExists(c.topic)) {
    errors.push(at(`topic "${c.topic}" is not in the manifest`));
  }
  if (c.summary.trim() === "") errors.push(at("summary is empty"));
  if (c.sections.length === 0) errors.push(at("no sections"));
  for (const s of c.sections) {
    if (s.heading.trim() === "" || s.body.trim() === "") {
      errors.push(at(`section "${s.heading}" is empty`));
    }
  }

  if (c.examples.length === 0) errors.push(at("no examples — a concept page with nothing to run is a blog post"));
  for (const [i, ex] of c.examples.entries()) {
    // The example must be a whole program, because an example that cannot be
    // run cannot be verified, and an unverified example is the one that rots.
    if (!/\bclass\s+Main\b/.test(ex.code)) {
      errors.push(at(`example ${i} has no "class Main"`));
    }
    if (!/static\s+void\s+main\s*\(/.test(ex.code)) {
      errors.push(at(`example ${i} has no main method`));
    }
    if (ex.expectedOutput.trim() === "") {
      errors.push(at(`example ${i} states no expected output, so nothing about it is checked`));
    }
    if (ex.caption.trim() === "") errors.push(at(`example ${i} has no caption`));
  }

  for (const [i, p] of c.pitfalls.entries()) {
    if (p.wrong.trim() === p.right.trim()) {
      errors.push(at(`pitfall ${i}: wrong and right are the same`));
    }
    if (p.why.trim() === "") errors.push(at(`pitfall ${i} has no explanation`));
  }

  for (const [i, q] of c.quiz.entries()) {
    if (q.options.length < 2) errors.push(at(`quiz ${i} needs at least two options`));
    if (q.answer < 0 || q.answer >= q.options.length) {
      errors.push(at(`quiz ${i}: answer index ${q.answer} is out of range`));
    }
    if (new Set(q.options.map((o) => o.trim())).size !== q.options.length) {
      errors.push(at(`quiz ${i} has duplicate options`));
    }
    // The explanation is the teaching. A tick with nothing after it is a
    // score, and a score is not why anyone is here.
    if (q.explain.trim() === "") errors.push(at(`quiz ${i} has no explanation`));
    if (q.question.trim() === "") errors.push(at(`quiz ${i} has no question`));
  }

  for (const slug of c.seeAlso ?? []) {
    if (!allSlugs.has(slug)) errors.push(at(`seeAlso "${slug}" is not a concept`));
    if (slug === c.slug) errors.push(at("seeAlso points at itself"));
  }

  const problemIds = new Set(getAllProblems().map((p) => p.id));
  for (const id of c.practice ?? []) {
    if (!problemIds.has(id)) errors.push(at(`practice "${id}" is not a problem`));
  }

  return errors;
}

export function validateConcepts(concepts: Concept[]): {
  byConcept: { slug: string; errors: string[] }[];
  duplicateSlugs: string[];
} {
  const slugs = new Set(concepts.map((c) => c.slug));
  const seen = new Set<string>();
  const duplicateSlugs: string[] = [];
  for (const c of concepts) {
    if (seen.has(c.slug)) duplicateSlugs.push(c.slug);
    seen.add(c.slug);
  }
  return {
    byConcept: concepts.map((c) => ({ slug: c.slug, errors: validateConcept(c, slugs) })),
    duplicateSlugs,
  };
}

/**
 * Compares a program's real output with what a page claims it prints.
 *
 * Trailing whitespace on a line is invisible in a source file and would fail a
 * page for no reason; a changed VALUE must fail it. So each line is trimmed at
 * the end and blank lines at the edges are dropped, and nothing else is
 * normalised — the alignment inside a line is part of what the example prints.
 */
export function outputMatches(actual: string, expected: string): boolean {
  const norm = (s: string): string =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .join("\n")
      .replace(/^\n+|\n+$/g, "");
  return norm(actual) === norm(expected);
}
