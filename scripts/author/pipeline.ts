/**
 * The authoring pipeline.
 *
 *   DESIGN    -> a spec for one problem, no code yet
 *   DEDUPE    -> no model; pure text against what already exists
 *   IMPLEMENT -> solution, starter, cases, hints, pitfalls
 *   VALIDATE  -> the static checks, free
 *   GATES     -> compile+run, starter-must-fail, mutant-must-fail
 *   REPAIR    -> up to 3 attempts, SOLUTION ONLY
 *   EMIT      -> a typed TS module
 *
 * SCOPE, stated plainly: this generates `method` problems only. The corpus
 * also needs `class` (op-sequence: LRUCache, MinStack, and every OOP
 * fundamentals problem) and `stdio` (the whole CP track). Both need their own
 * design and implement prompts — a class problem has to invent a coherent
 * operation sequence, and a stdio problem has to produce paired input/output
 * files — so they are a real increment, not a flag. Roughly two thirds of the
 * planned 145 are `method`, so this covers the bulk but not the corpus.
 *
 * The repair rule is the one that decides whether the corpus is worth
 * anything. A model asked to fix a failing problem will, given the chance,
 * "fix" it by weakening the test cases until the solution passes — and the
 * result is a problem that asserts nothing and looks fine. So repair is not
 * asked to leave the cases alone; it is structurally unable to change them.
 * The pipeline keeps the original cases and splices in only the new solution.
 */

import { createHash } from "node:crypto";
import type { Difficulty, Problem } from "../../content/types.js";
import type { TopicSpec } from "../../content/specs/types.js";
import { ClaudeCodeProvider } from "../../src/main/ai/adapters/claude-code.js";
import { checkDuplicate } from "./dedupe.js";
import { allPassed, runGates, type GateOptions, type GateResult } from "./gates.js";

export type AuthorLog = (line: string) => void;

export type PipelineOptions = GateOptions & {
  spec: TopicSpec;
  existing: { id: string; title: string; prompt: string }[];
  provider: ClaudeCodeProvider;
  log: AuthorLog;
  maxRepairs?: number;
};

export type Outcome =
  | { status: "accepted"; problem: Problem; repairs: number; gates: GateResult[] }
  | { status: "rejected"; title: string; reason: string; gates?: GateResult[] };

const MAX_REPAIRS = 3;

function json<T>(text: string): T | null {
  // Models wrap JSON in prose or fences however they feel; take the outermost
  // object rather than trusting the response to be bare.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Wraps a bare method in a class if the model returned one.
 *
 * The prompt asks for a complete source file, but this failed on every early
 * generation, and the resulting javac error ("compact source file does not
 * have main method") points nowhere near the actual cause. The transformation
 * is deterministic and safe, so doing it here is better than spending a JVM
 * run and one of three repair attempts rediscovering it each time.
 *
 * Imports must be hoisted above the class — leaving them inside it is not
 * valid Java, so a naive wrap would swap one confusing error for another.
 */
export function normaliseSource(code: string, className: string): { code: string; wrapped: boolean } {
  const trimmed = code.trim();
  if (/^\s*(?:public\s+|final\s+|abstract\s+)*(?:class|interface|enum|record)\s/m.test(trimmed)) {
    return { code: trimmed, wrapped: false };
  }
  const lines = trimmed.split("\n");
  const imports = lines.filter((l) => /^\s*import\s/.test(l));
  const body = lines.filter((l) => !/^\s*import\s/.test(l));
  const indented = body.map((l) => (l.trim() === "" ? l : `    ${l}`)).join("\n");
  return {
    code: `${imports.length ? imports.join("\n") + "\n\n" : ""}class ${className} {\n${indented}\n}`,
    wrapped: true,
  };
}

/**
 * Rejects a prompt that explains the approach.
 *
 * Found by reading generated output, not by any gate: two of the first three
 * problems stated the algorithm outright ("keep a Map from each value to the
 * most recent index... one pass, O(n) time"). That is the level-3 and level-4
 * hints written into the question, and no compile-and-run check can see it.
 *
 * Deliberately conservative — it looks for the giveaway phrasings, not for any
 * mention of a word. A prompt may legitimately say "return a list".
 */
const GIVEAWAY = [
  /\b(linear|constant|quadratic)\s+time\b/i,
  /\b(one|single|two)[- ]pass\b/i,
  /\buse a (hash\s*)?(map|set|list|stack|queue|deque|array)\b/i,
  /\bkeep a (map|set|running|hash)/i,
  /\bhash\s*map\b/i,
  /\btwo pointers?\b/i,
  /\bsliding window\b/i,
  /\bthe naive (approach|solution)\b/i,
  /\binstead,? (keep|use|build|store)\b/i,
];

export function promptLeaksApproach(prompt: string): string | null {
  for (const re of GIVEAWAY) {
    const m = re.exec(prompt);
    if (m) return m[0];
  }

  // Complexity needs a finer rule than the rest, because it cuts both ways.
  // "Both get and put must run in O(1)" is part of the problem's CONTRACT —
  // remove it from LRU Cache and the problem becomes trivial. But "an O(n^2)
  // solution will time out" describes the approach and belongs in the hints.
  //
  // The distinguishing feature is whether the sentence states a requirement on
  // the answer or comments on how to reach it. Flagging every O(...) was the
  // first version, and it rejected a hand-authored problem.
  for (const sentence of prompt.split(/(?<=[.!?])\s+/)) {
    const m = /\bO\([^)]*\)/.exec(sentence);
    if (!m) continue;
    const isRequirement = /\b(must|should|has to|required to|needs? to)\b/i.test(sentence);
    if (!isRequirement) return m[0];
  }
  return null;
}

function slug(topic: string, title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${topic}-${base}`;
}

// ------------------------------------------------------------------ design

type Design = {
  title: string;
  difficulty: Difficulty;
  prompt: string;
  signature: { method: string; params: { name: string; type: string }[]; returns: string };
  examples: { input: string; output: string; note?: string }[];
  whyThisTopic: string;
};

const DESIGN_SYSTEM = `You design Java practice problems. You return JSON only — no prose, no fences.

A good problem here has a naive solution and a better one, and the gap between
them IS the lesson. Avoid puzzles, avoid trivia, avoid anything whose difficulty
is in reading the question.

Return exactly:
{"title": string, "difficulty": "easy"|"medium"|"hard", "prompt": string,
 "signature": {"method": string, "params": [{"name": string, "type": string}], "returns": string},
 "examples": [{"input": string, "output": string, "note": string}],
 "whyThisTopic": string}

Types must come from this closed list, exactly as written:
int, long, double, boolean, char, String, Integer, int[], long[], double[],
boolean[], char[], String[], int[][], char[][], String[][], List<Integer>,
List<String>, List<List<Integer>>, List<List<String>>, Map<String,Integer>,
Map<Integer,Integer>, TreeNode, ListNode

The prompt states WHAT is asked and every edge case the tests check. It must
NOT state HOW. Specifically, the prompt may not:
- name a data structure or algorithm ("use a Map", "a set", "two pointers"),
- describe the approach or the number of passes,
- state a complexity ("O(n)", "linear time"),
- warn about a language behaviour that IS the insight (HashMap iteration order,
  integer overflow) — that belongs in the hint ladder and the pitfalls,
- claim a performance limit the test cases do not actually enforce. If the
  cases are small, say nothing about input size.
Everything in that list is what the four hint rungs exist to reveal, one at a
time. A prompt that explains the approach leaves the learner nothing to do.

A sentinel return value must be impossible as a real answer. Returning ' ' for
"no repeated character" is a defect: a space is a character and can itself
repeat, so the caller cannot tell the two apart. Prefer a value outside the
answer's domain (-1 for a non-negative index, Integer.MIN_VALUE, an empty
string, null for a boxed type) and say so in the prompt.

The title must name what the problem asks for. A title that describes a
different problem than the prompt is a defect.

Difficulty must come from the algorithm, not from parsing the question. Do not
invent unusual tie-break rules or layered conditions to make something harder —
that produces a reading-comprehension puzzle, not a hashing exercise.

Keep the prompt to a few sentences plus a short list of edge cases. If a
learner could read it two ways, it is not finished.`;

async function design(
  opts: PipelineOptions,
  avoid: string[],
  want: Difficulty,
): Promise<Design | null> {
  const s = opts.spec;
  const user = [
    `Topic: ${s.topic} (${s.track})`,
    `Teaching: ${s.conceptsCovered.join("; ")}`,
    `Difficulty anchors: ${s.exemplars.map((e) => `${e.difficulty} = "${e.title}" (${e.note})`).join("; ")}`,
    `Allowed APIs: ${s.allowedApis.join(", ")}`,
    `Banned (the lesson is skipped if used): ${s.bannedApis.join(", ")}`,
    s.notes ? `Notes: ${s.notes.join(" ")}` : "",
    "",
    `Do NOT propose any of these, or anything close to them: ${[...s.forbidTitles, ...avoid].join(", ")}`,
    "",
    `Design ONE problem at difficulty "${want}". Judge that RELATIVE to the anchors above, not in the abstract.`,
    "JSON only.",
  ].join("\n");

  const text = await opts.provider.complete({
    feature: "review",
    system: DESIGN_SYSTEM,
    user,
    model: "deep",
    maxTokens: 1500,
    maxTurns: 4,
  });
  return json<Design>(text);
}

// --------------------------------------------------------------- implement

type Implementation = {
  starterCode: string;
  solution: string;
  testCases: { input: unknown[]; expected: unknown; hidden?: boolean; description?: string }[];
  hints: [string, string, string, string];
  pitfalls: string[];
  explanation: string;
  complexity: { time: string; space: string };
};

const IMPLEMENT_SYSTEM = `You implement a designed Java practice problem. Return JSON only.

{"starterCode": string, "solution": string,
 "testCases": [{"input": [...], "expected": ..., "hidden": bool, "description": string}],
 "hints": [string, string, string, string],
 "pitfalls": [string], "explanation": string,
 "complexity": {"time": string, "space": string}}

RULES, all of which are checked mechanically afterwards:
- starterCode and solution are each a COMPLETE Java source file, including the
  class declaration and any imports. Not a bare method. Exactly this shape:

      import java.util.*;

      class Solution {
          public int example(int[] nums) {
              // ...
          }
      }

  A bare method is compiled by JDK 25 as a "compact source file" and fails with
  "does not have main method", which tells you nothing about the real problem.
- starterCode declares the method with the exact signature and does NOT solve it.
- solution compiles and passes every case.
- At least 2 visible cases and at least 2 HIDDEN cases. Hidden cases must probe
  edges the visible ones do not: empty input, a single element, duplicates,
  negatives, the largest value in range.
- Test values are JSON. A long beyond 2^53 must be a STRING. A char is a
  1-character string. null is never allowed for int/long/double/boolean/char.
- hints are exactly four rungs and must not give the answer away early:
    [0] orient: restate the shape of the difficulty. Name no technique.
    [1] probe: ONE question about the learner's code. Must end in "?".
    [2] nudge: name the data structure or technique, not the steps.
    [3] walk: the algorithm in prose. At most one short Java expression.
- Write British English. No greetings, no "Great question".`;

async function implement(opts: PipelineOptions, d: Design): Promise<Implementation | null> {
  const user = [
    `Title: ${d.title} (${d.difficulty})`,
    `Signature: ${d.signature.returns} ${d.signature.method}(${d.signature.params.map((p) => `${p.type} ${p.name}`).join(", ")})`,
    "",
    d.prompt,
    "",
    `Banned APIs: ${opts.spec.bannedApis.join(", ") || "none"}`,
    "",
    "Implement it. JSON only.",
  ].join("\n");

  const text = await opts.provider.complete({
    feature: "review",
    system: IMPLEMENT_SYSTEM,
    user,
    model: "balanced",
    maxTokens: 4000,
    maxTurns: 4,
  });
  return json<Implementation>(text);
}

// ------------------------------------------------------------------ repair

const REPAIR_SYSTEM = `A Java practice problem failed its automated checks.

Return JSON with ONE key: {"solution": string}

Fix the SOLUTION so it passes the stated test cases. The test cases are fixed
and are not yours to change — they are not included here for that reason. If
the solution cannot be made to pass them, say so by returning
{"solution": ""} rather than guessing.`;

async function repair(
  opts: PipelineOptions,
  problem: Problem,
  gates: GateResult[],
): Promise<string | null> {
  const failed = gates.filter((g) => !g.ok).map((g) => `${g.gate}: ${g.detail}`).join("\n");
  const cases =
    problem.kind === "method"
      ? problem.testCases
          .map((c, i) => `  case ${i}: ${JSON.stringify(c.input)} -> ${JSON.stringify(c.expected)}`)
          .join("\n")
      : "";
  const user = [
    `Signature: ${problem.kind === "method" ? `${problem.signature.returns} ${problem.signature.method}` : problem.kind}`,
    problem.prompt,
    "",
    "What failed:",
    failed,
    "",
    "The cases it must satisfy (fixed):",
    cases,
    "",
    "Current solution:",
    problem.solution,
  ].join("\n");

  const text = await opts.provider.complete({
    feature: "review",
    system: REPAIR_SYSTEM,
    user,
    model: "balanced",
    maxTokens: 2000,
    maxTurns: 4,
  });
  const parsed = json<{ solution: string }>(text);
  return parsed?.solution?.trim() || null;
}

/** Fingerprint of the test cases, so a repair that changed them is detectable. */
export function caseFingerprint(p: Problem): string {
  return createHash("sha256").update(JSON.stringify(p.testCases)).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------- assemble

/** Assembles a `method` problem. See the SCOPE note at the top of this file. */
function assemble(spec: TopicSpec, d: Design, impl: Implementation): Problem {
  return {
    id: slug(spec.topic, d.title),
    track: spec.track,
    topic: spec.topic,
    difficulty: d.difficulty,
    kind: "method",
    title: d.title,
    prompt: d.prompt,
    signature: {
      className: "Solution",
      method: d.signature.method,
      params: d.signature.params.map((p) => ({ name: p.name, type: p.type })),
      returns: d.signature.returns,
    },
    starterCode: normaliseSource(impl.starterCode, "Solution").code,
    solution: normaliseSource(impl.solution, "Solution").code,
    hints: impl.hints,
    testCases: impl.testCases,
    examples: d.examples,
    pitfalls: impl.pitfalls,
    explanation: impl.explanation,
    complexity: impl.complexity,
    ...(spec.bannedApis.length > 0 ? { bannedApis: spec.bannedApis } : {}),
  } as Problem;
}

// ------------------------------------------------------------------ driver

export async function authorOne(
  opts: PipelineOptions,
  avoid: string[],
  want: Difficulty,
): Promise<Outcome> {
  const { log } = opts;

  const d = await design(opts, avoid, want);
  if (!d) return { status: "rejected", title: "?", reason: "design step returned unparseable JSON" };
  log(`  design    "${d.title}" (${d.difficulty}${d.difficulty !== want ? ` — asked for ${want}` : ""})`);
  // Take the requested difficulty as authoritative. A model that labels its
  // own output drifts to "medium"; the spec's mix is the thing being asked for.
  d.difficulty = want;

  const leak = promptLeaksApproach(d.prompt);
  if (leak !== null) {
    return {
      status: "rejected",
      title: d.title,
      reason: `prompt gives away the approach ("${leak}") — that is the hint ladder's job`,
    };
  }

  const dupe = checkDuplicate(d, opts.existing);
  if (dupe.duplicate) {
    return { status: "rejected", title: d.title, reason: `duplicate — ${dupe.why}` };
  }

  const impl = await implement(opts, d);
  if (!impl) return { status: "rejected", title: d.title, reason: "implement step returned unparseable JSON" };
  const wrapped = normaliseSource(impl.solution, "Solution").wrapped;
  log(
    `  implement ${impl.testCases.length} cases, ${impl.testCases.filter((c) => c.hidden).length} hidden` +
      (wrapped ? " (bare method — wrapped in a class)" : ""),
  );

  let problem = assemble(opts.spec, d, impl);
  const fingerprint = caseFingerprint(problem);

  let gates = await runGates(problem, opts);
  let repairs = 0;
  const limit = opts.maxRepairs ?? MAX_REPAIRS;

  while (!allPassed(gates) && repairs < limit) {
    const failing = gates.filter((g) => !g.ok);
    // Only a wrong solution is repairable. Vacuous cases are a design fault,
    // and "repairing" them means weakening the tests — discard instead.
    if (!failing.every((g) => g.gate === "solution-passes" || g.gate === "banned-apis")) {
      break;
    }
    repairs++;
    log(`  repair ${repairs}/${limit}: ${failing.map((g) => `${g.gate} — ${g.detail.slice(0, 150)}`).join(" | ")}`);
    const fixed = await repair(opts, problem, gates);
    if (!fixed) break;

    // The solution is spliced in. Everything else — above all the test cases —
    // is carried over untouched, so a repair CANNOT weaken the tests.
    problem = { ...problem, solution: normaliseSource(fixed, "Solution").code };
    if (caseFingerprint(problem) !== fingerprint) {
      return { status: "rejected", title: d.title, reason: "repair altered the test cases" };
    }
    gates = await runGates(problem, opts);
  }

  if (!allPassed(gates)) {
    return {
      status: "rejected",
      title: d.title,
      reason: gates.filter((g) => !g.ok).map((g) => `${g.gate}: ${g.detail}`).join(" | "),
      gates,
    };
  }
  return { status: "accepted", problem, repairs, gates };
}
