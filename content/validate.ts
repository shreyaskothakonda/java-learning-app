/**
 * Static validation, run before anything is compiled.
 *
 * This is the cheap half of the quality gate. The expensive half — compiling
 * the reference solution and running it against its own cases, plus the
 * starter-must-fail and mutant-must-fail checks — arrives in Phase 6 once the
 * Java runner exists. Everything catchable without a JVM belongs here.
 */

import { countElements, TYPES } from "./java-types.js";
import { topicFor } from "./manifest.js";
import {
  LIMITS,
  type ClassProblem,
  type Comparison,
  type JavaType,
  type JsonValue,
  type MethodProblem,
  type Param,
  type Problem,
  type StdioProblem,
} from "./types.js";

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function checkValue(type: JavaType, v: JsonValue, where: string): string[] {
  const spec = TYPES[type];
  const errs = spec.validate(v).map((m) => `${where}: ${m}`);
  if (v === null && !spec.nullable) {
    errs.push(`${where}: null is not allowed for primitive type ${type} — use a boxed type`);
  }
  const n = countElements(v);
  if (n > LIMITS.maxLiteralElements) {
    errs.push(
      `${where}: ${n} elements exceeds the ${LIMITS.maxLiteralElements}-element literal cap ` +
        `(javac's 64KB method limit) — this is a performance test, make it a stdio problem`,
    );
  }
  const bytes = JSON.stringify(v)?.length ?? 0;
  if (bytes > LIMITS.maxLiteralJsonBytes) {
    errs.push(
      `${where}: ${bytes} bytes of JSON exceeds the ${LIMITS.maxLiteralJsonBytes}-byte literal ` +
        `cap — make it a stdio problem reading from a file`,
    );
  }
  return errs;
}

function checkArgs(params: Param[], args: JsonValue[], where: string): string[] {
  if (args.length !== params.length) {
    return [`${where}: expected ${params.length} argument(s), got ${args.length}`];
  }
  return params.flatMap((p, i) => checkValue(p.type, args[i]!, `${where} arg ${i} (${p.name})`));
}

function checkComparison(c: Comparison | undefined, where: string): string[] {
  if (!c) return [];
  if (c.mode === "approx" && !(c.epsilon > 0)) {
    return [`${where}: approx comparison needs a positive epsilon, got ${c.epsilon}`];
  }
  if (c.mode === "custom" && c.javaChecker.trim() === "") {
    return [`${where}: custom comparison needs a non-empty javaChecker body`];
  }
  if (c.mode === "custom" && !/\breturn\b/.test(c.javaChecker)) {
    return [`${where}: custom javaChecker must return a boolean`];
  }
  return [];
}

function checkCaseSplit(cases: { hidden?: boolean }[], where: string): string[] {
  const errs: string[] = [];
  const visible = cases.filter((c) => !c.hidden).length;
  const hidden = cases.length - visible;
  if (visible < LIMITS.minVisibleCases) {
    errs.push(`${where}: needs at least ${LIMITS.minVisibleCases} visible cases, has ${visible}`);
  }
  if (hidden < LIMITS.minHiddenCases) {
    errs.push(
      `${where}: needs at least ${LIMITS.minHiddenCases} hidden cases, has ${hidden} — ` +
        `without hidden cases a solution can be hardcoded`,
    );
  }
  return errs;
}

function checkCommon(p: Problem): string[] {
  const errs: string[] = [];
  if (!ID_RE.test(p.id)) errs.push(`id ${JSON.stringify(p.id)} must be lowercase kebab-case`);

  const topic = topicFor(p.topic);
  if (!topic) errs.push(`topic ${JSON.stringify(p.topic)} is not in the manifest`);
  else if (topic.track !== p.track) {
    errs.push(`topic ${JSON.stringify(p.topic)} belongs to track ${topic.track}, not ${p.track}`);
  }

  for (const [field, value] of [
    ["title", p.title],
    ["prompt", p.prompt],
    ["starterCode", p.starterCode],
    ["solution", p.solution],
  ] as const) {
    if (value.trim() === "") errs.push(`${field} is empty`);
  }

  if (p.solution.trim() === p.starterCode.trim()) {
    errs.push("solution is identical to starterCode");
  }

  if (p.hints.length !== 4) errs.push(`hints must be exactly 4 (L1-L4), got ${p.hints.length}`);
  p.hints.forEach((h, i) => {
    if (h.trim() === "") errs.push(`hints[${i}] (L${i + 1}) is empty`);
  });
  // L2 Probe is a question by construction; if it stops asking, it has become
  // a statement and the hint ladder has collapsed by one rung.
  if (p.hints[1] && !p.hints[1].trim().endsWith("?")) {
    errs.push("hints[1] (L2 Probe) must be a question ending in '?'");
  }

  for (const api of p.bannedApis ?? []) {
    if (p.solution.includes(api)) {
      errs.push(`solution uses banned API ${JSON.stringify(api)}`);
    }
  }
  return errs;
}

function checkMethod(p: MethodProblem): string[] {
  const errs: string[] = [];
  const sig = p.signature;

  if (!/^[a-z][A-Za-z0-9]*$/.test(sig.method)) {
    errs.push(`signature.method ${JSON.stringify(sig.method)} is not a Java method name`);
  }
  // The starter must contain the exact method name, or the learner is being
  // asked to implement something the harness will not find.
  if (!p.starterCode.includes(sig.method)) {
    errs.push(`starterCode does not mention signature.method ${JSON.stringify(sig.method)}`);
  }
  if (!p.solution.includes(sig.method)) {
    errs.push(`solution does not mention signature.method ${JSON.stringify(sig.method)}`);
  }

  const names = new Set<string>();
  for (const param of sig.params) {
    if (names.has(param.name)) errs.push(`duplicate parameter name ${JSON.stringify(param.name)}`);
    names.add(param.name);
  }

  errs.push(...checkComparison(p.comparison, "comparison"));
  errs.push(...checkCaseSplit(p.testCases, "testCases"));

  p.testCases.forEach((tc, i) => {
    errs.push(...checkArgs(sig.params, tc.input, `case ${i}`));
    if (p.comparison?.mode === "custom") {
      // With a custom checker `expected` is whatever the checker wants, so it
      // is validated against the declared override when there is one. This
      // case comes first because a void method with a custom checker still
      // needs a real expected value for the checker to compare against.
      const t = p.comparison.expectedType ?? sig.returns;
      errs.push(...checkValue(t, tc.expected, `case ${i} expected (as ${t})`));
    } else if (sig.returns === "void") {
      if (tc.expected !== null) {
        errs.push(`case ${i}: a void method must have expected: null`);
      }
    } else if (p.comparison?.mode === "anyOf") {
      // `expected` is a list of acceptable answers, each of the return type.
      if (!Array.isArray(tc.expected)) {
        errs.push(`case ${i}: anyOf comparison needs expected to be an array of answers`);
      } else {
        tc.expected.forEach((alt, j) => {
          errs.push(...checkValue(sig.returns, alt, `case ${i} expected[${j}]`));
        });
      }
    } else {
      errs.push(...checkValue(sig.returns, tc.expected, `case ${i} expected`));
    }
  });

  // A void method with no custom checker can never be verified: there is no
  // return value to compare and nothing inspecting the arguments.
  if (sig.returns === "void" && p.comparison?.mode !== "custom") {
    errs.push(
      "a void method needs comparison.mode 'custom' — otherwise there is nothing to check",
    );
  }
  return errs;
}

function checkClass(p: ClassProblem): string[] {
  const errs: string[] = [];
  const { classSpec: cs } = p;

  if (!/^[A-Z][A-Za-z0-9]*$/.test(cs.className)) {
    errs.push(`classSpec.className ${JSON.stringify(cs.className)} is not a Java class name`);
  }
  if (!p.starterCode.includes(cs.className)) {
    errs.push(`starterCode does not declare ${cs.className}`);
  }

  const methods = new Map(cs.methods.map((m) => [m.name, m]));
  errs.push(...checkComparison(p.comparison, "comparison"));
  errs.push(...checkCaseSplit(p.testCases, "testCases"));

  p.testCases.forEach((tc, i) => {
    if (tc.ops.length === 0) {
      errs.push(`case ${i}: needs at least one op`);
      return;
    }
    if (tc.ops.length !== tc.expected.length) {
      errs.push(
        `case ${i}: ${tc.ops.length} ops but ${tc.expected.length} expected values — ` +
          `they must line up one-to-one`,
      );
    }

    tc.ops.forEach((op, j) => {
      const [name, ...args] = op;
      const at = `case ${i} op ${j} (${name})`;

      if (j === 0) {
        if (name !== cs.className) {
          errs.push(`${at}: the first op must construct ${cs.className}`);
          return;
        }
        errs.push(...checkArgs(cs.ctor, args, at));
        if (tc.expected[0] !== null) errs.push(`${at}: constructor must expect null`);
        return;
      }

      if (name === cs.className) {
        errs.push(`${at}: only op 0 may be the constructor`);
        return;
      }
      const m = methods.get(name);
      if (!m) {
        errs.push(`${at}: no such method — declared: ${[...methods.keys()].join(", ") || "none"}`);
        return;
      }
      errs.push(...checkArgs(m.params, args, at));

      const exp = tc.expected[j] ?? null;
      if (m.returns === "void") {
        if (exp !== null) errs.push(`${at}: returns void, so expected must be null`);
      } else {
        errs.push(...checkValue(m.returns, exp, `${at} expected`));
      }
    });
  });

  for (const m of cs.methods) {
    if (!p.solution.includes(m.name)) {
      errs.push(`solution does not implement declared method ${JSON.stringify(m.name)}`);
    }
  }
  return errs;
}

function checkStdio(p: StdioProblem): string[] {
  const errs: string[] = [];
  errs.push(...checkComparison(p.comparison, "comparison"));
  errs.push(...checkCaseSplit(p.testCases, "testCases"));

  // stdio problems run under a time limit, which is most of the point.
  if (p.track === "cp" && p.timeLimitMs === undefined) {
    errs.push("a cp-track stdio problem should declare timeLimitMs");
  }
  if (!/\bmain\b/.test(p.starterCode)) {
    errs.push("starterCode for a stdio problem must declare a main method");
  }

  p.testCases.forEach((tc, i) => {
    const hasIn = tc.stdin !== undefined || tc.stdinFile !== undefined;
    const hasOut = tc.stdout !== undefined || tc.stdoutFile !== undefined;
    if (!hasIn) errs.push(`case ${i}: needs stdin or stdinFile`);
    if (!hasOut) errs.push(`case ${i}: needs stdout or stdoutFile`);
    if (tc.stdin !== undefined && tc.stdinFile !== undefined) {
      errs.push(`case ${i}: set stdin or stdinFile, not both`);
    }
    if (tc.stdout !== undefined && tc.stdoutFile !== undefined) {
      errs.push(`case ${i}: set stdout or stdoutFile, not both`);
    }
    // A data file name, not a path. The runner resolves these against
    // content/data and refuses anything that climbs out, but the validator is
    // where it should be caught: this runs on every authored AND generated
    // problem, before anything is written to disk or read from it. The
    // authoring pipeline exists so a model can write content, and `stdio`
    // generation is still an open gap — the first generated case carrying
    // "../../../../etc/passwd" should fail the gate, not the runner.
    for (const [field, value] of [
      ["stdinFile", tc.stdinFile],
      ["stdoutFile", tc.stdoutFile],
    ] as const) {
      if (value === undefined) continue;
      if (value !== value.trim() || value === "") {
        errs.push(`case ${i}: ${field} must be a non-empty file name`);
      } else if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(value) || value.split("/").includes("..")) {
        errs.push(
          `case ${i}: ${field} must be a relative name under content/data, got "${value}"`,
        );
      }
    }
  });
  return errs;
}

/** Returns human-readable problems. An empty array means the problem is valid. */
export function validateProblem(p: Problem): string[] {
  const errs = checkCommon(p);
  switch (p.kind) {
    case "method":
      errs.push(...checkMethod(p));
      break;
    case "class":
      errs.push(...checkClass(p));
      break;
    case "stdio":
      errs.push(...checkStdio(p));
      break;
    default: {
      const never: never = p;
      errs.push(`unknown problem kind: ${JSON.stringify(never)}`);
    }
  }
  return errs;
}

export type ValidationReport = {
  ok: boolean;
  byProblem: { id: string; title: string; errors: string[] }[];
  duplicateIds: string[];
};

export function validateAll(problems: Problem[]): ValidationReport {
  const seen = new Map<string, number>();
  for (const p of problems) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  const duplicateIds = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const byProblem = problems.map((p) => ({
    id: p.id,
    title: p.title,
    errors: validateProblem(p),
  }));

  return {
    ok: duplicateIds.length === 0 && byProblem.every((r) => r.errors.length === 0),
    byProblem,
    duplicateIds,
  };
}
