/**
 * Redaction and filtering.
 *
 * The plan calls the redaction test non-negotiable, and it is the right call:
 * everything else about the hint feature is a quality question, but leaking
 * the solution or a hidden case breaks the exercise outright, silently, and in
 * a way no one would notice from the outside.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ALL, getProblem } from "@content/index.js";
import { filterHint, filterTutor } from "./filter.js";
import { HINT_SYSTEM, hintUser, tutorUser } from "./prompts.js";
import { redactProblem, renderContext, visibleFailingCase } from "./redact.js";

// ------------------------------------------------------------- redaction

test("redaction strips the solution from every problem in the corpus", () => {
  for (const p of ALL) {
    const serialised = JSON.stringify(redactProblem(p));
    assert.ok(
      !serialised.includes(p.solution),
      `${p.id}: the solution survived redaction`,
    );
    // Also check for distinctive fragments, not just the whole string — a
    // partial leak is still a leak.
    const bodyLines = p.solution
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 20 && !l.startsWith("//") && !l.startsWith("import"));
    for (const line of bodyLines) {
      assert.ok(!serialised.includes(line), `${p.id}: solution line leaked: ${line}`);
    }
  }
});

test("redaction strips hidden test cases from every problem in the corpus", () => {
  for (const p of ALL) {
    const serialised = JSON.stringify(redactProblem(p));
    const hidden = p.testCases.filter((c) => c.hidden);
    assert.ok(hidden.length > 0, `${p.id} should have hidden cases to test against`);
    for (const c of hidden) {
      const asJson = JSON.stringify(c);
      // Every distinctive scalar from a hidden case must be absent.
      for (const token of asJson.match(/-?\d{3,}/g) ?? []) {
        assert.ok(
          !serialised.includes(token),
          `${p.id}: hidden-case value ${token} leaked into redacted context`,
        );
      }
      // A description that also appears in the problem's own public prompt is
      // not a leak — the learner reads that text before writing a line.
      const publicText = `${p.prompt} ${p.title} ${(p.examples ?? []).map((e) => `${e.input} ${e.output} ${e.note ?? ""}`).join(" ")}`;
      if (c.description && !publicText.includes(c.description)) {
        assert.ok(
          !serialised.includes(c.description),
          `${p.id}: hidden-case description leaked: ${c.description}`,
        );
      }
    }
  }
});

test("the fully built hint prompt contains neither solution nor hidden cases", () => {
  for (const p of ALL) {
    const prompt =
      HINT_SYSTEM[3]! + "\n" + hintUser(redactProblem(p), "class Solution {}", null, 3);
    assert.ok(!prompt.includes(p.solution), `${p.id}: solution reached the prompt`);
    const publicText = `${p.prompt} ${p.title}`;
    for (const c of p.testCases.filter((x) => x.hidden)) {
      if (c.description && !publicText.includes(c.description)) {
        assert.ok(!prompt.includes(c.description), `${p.id}: hidden case reached the prompt`);
      }
    }
  }
});

test("redacted context still carries enough to be useful", () => {
  const p = getProblem("dsa-hashing-two-sum")!;
  const ctx = renderContext(redactProblem(p));
  assert.match(ctx, /Two Sum/);
  assert.match(ctx, /hashing/);
  assert.match(ctx, /twoSum/, "the signature is needed — it is not a secret");
});

test("a hidden failing case is never offered as the failing case", () => {
  const p = getProblem("fund-arrays-average")!;
  const results = [
    { index: 0, passed: true, hidden: false },
    { index: 4, passed: false, hidden: true, input: "scores = [2147483647, 2147483647]", expected: "2.147483647E9" },
  ];
  assert.equal(
    visibleFailingCase(p, results),
    null,
    "only a hidden case failed, so there is nothing showable",
  );
});

test("a visible failing case is rendered for the prompt", () => {
  const p = getProblem("fund-arrays-average")!;
  const out = visibleFailingCase(p, [
    { index: 0, passed: false, hidden: false, input: "scores = [1, 2, 3]", expected: "2.0", actual: "2" },
  ]);
  assert.match(out ?? "", /scores = \[1, 2, 3\]/);
  assert.match(out ?? "", /expected: 2\.0/);
});

// ---------------------------------------------------------------- filter

const SOLUTION = `class Solution {
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
}`;

test("a good level-1 hint passes", () => {
  const v = filterHint(
    "This is really two jobs at once, and the second one has an edge case the first does not.",
    0,
    SOLUTION,
  );
  assert.equal(v.ok, true);
});

test("a hint that hands over the solution is rejected", () => {
  const v = filterHint(
    "Use a write index starting at 1 and a read index, then:\n```java\nfor (int read = 1; read < nums.length; read++) {\n  if (nums[read] != nums[write - 1]) {\n    nums[write] = nums[read];\n    write++;\n  }\n}\n```",
    0,
    SOLUTION,
  );
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /lines of code|loop body|overlap/);
});

test("a loop body in prose is rejected below the top rung", () => {
  const v = filterHint("Write for (int i = 0; i < nums.length; i++) { and compare each pair.", 1, SOLUTION);
  assert.equal(v.ok, false);
});

test("level 2 must be a question", () => {
  assert.equal(filterHint("Look at your write index.", 1, SOLUTION).ok, false);
  assert.equal(
    filterHint("What value is your write index comparing against on each pass?", 1, SOLUTION).ok,
    true,
  );
});

test("the top rung may name a single expression but not a program", () => {
  const ok = filterHint(
    "Keep two positions. Advance the reader every pass, and only advance the writer when you meet a value worth keeping, copying it across as you go. Handle the empty input before the walk begins.",
    3,
    SOLUTION,
  );
  assert.equal(ok.ok, true);
});

test("an empty response is rejected rather than shown", () => {
  assert.equal(filterHint("   ", 0, SOLUTION).ok, false);
});

test("a realistic prose leak is rejected at the low rungs but allowed at the top", () => {
  // The same sentence is a leak at level 1 and is exactly what level 4 exists
  // to say. That is why the allowance scales with the rung.
  const leak =
    "Track a write index and a read index, then copy nums[read] into nums[write] whenever they differ.";
  assert.equal(filterHint(leak, 0, SOLUTION).ok, false, "level 1 must reject it");
  assert.equal(filterHint(leak, 1, SOLUTION).ok, false, "level 2 must reject it");
  assert.equal(filterHint(leak, 3, SOLUTION).ok, true, "level 4 is allowed to say this");
});

test("every authored hint passes its own level's filter", () => {
  // The authored ladder is the gold standard for what is acceptable at each
  // rung. A filter that rejects it is calibrated wrong, not the hint.
  for (const p of ALL) {
    p.hints.forEach((h, level) => {
      const v = filterHint(h, level, p.solution);
      assert.equal(
        v.ok,
        true,
        `${p.id} L${level + 1} was rejected: ${(v as { reason?: string }).reason}`,
      );
    });
  }
});

// --------------------------------------------------------------- prompts

test("each rung has its own prompt, and they are genuinely different", () => {
  const levels = [0, 1, 2, 3].map((l) => HINT_SYSTEM[l]!);
  assert.equal(new Set(levels).size, 4, "a level parameter in one prompt is not four prompts");
  assert.match(levels[1]!, /question mark/, "L2 must demand a question");
  assert.match(levels[0]!, /Never name a data structure/, "L1 must not name the technique");
});

test("no prompt invites the model to produce a full solution", () => {
  for (const [level, prompt] of Object.entries(HINT_SYSTEM)) {
    assert.match(
      prompt,
      /Do not write code|Never write code|Do not write a method/,
      `level ${level} does not forbid writing code`,
    );
  }
});


// ------------------------------------------------------------- the tutor

/** What the learner can already read, which the filter subtracts first. */
function visibleOf(p: (typeof ALL)[number]): { prompt: string; userCode: string } {
  return {
    prompt: `${p.prompt} ${(p.examples ?? []).map((e) => `${e.input} ${e.output}`).join(" ")}`,
    userCode: p.starterCode,
  };
}

test("a tutor prompt carries no solution and no hidden case", () => {
  // The tutor is the chattiest feature and the one most likely to be handed
  // extra context later "just so it can help properly". Same rule as hints.
  for (const p of ALL) {
    const prompt = tutorUser({
      ctx: redactProblem(p),
      userCode: p.starterCode,
      failingCase: null,
      message: "why does this not compile?",
    });
    assert.ok(!prompt.includes(p.solution), `${p.id}: the solution reached the tutor prompt`);
    for (const c of p.testCases.filter((x) => x.hidden)) {
      for (const token of JSON.stringify(c).match(/-?\d{3,}/g) ?? []) {
        assert.ok(!prompt.includes(token), `${p.id}: hidden-case value ${token} reached the tutor`);
      }
    }
  }
});

test("the tutor filter rejects the solution however it is dressed up", () => {
  for (const p of ALL) {
    const v = visibleOf(p);
    const fenced = filterTutor("Here you go:\n```java\n" + p.solution + "\n```", p.solution, v);
    assert.equal(fenced.ok, false, `${p.id}: a pasted solution passed`);

    // Reindented and stripped of its fence. Whitespace is collapsed on both
    // sides precisely so this is the same paste, not a new trick.
    const reindented = p.solution
      .split("\n")
      .map((l) => `      ${l.trim()}`)
      .join("\n");
    const loose = filterTutor(`Something like this:\n${reindented}`, p.solution, v);
    assert.equal(loose.ok, false, `${p.id}: a reindented solution passed`);
  }
});

test("the tutor filter passes every authored hint, which is the standard it is held to", () => {
  // The app hands the learner the L4 walk for the asking. A filter that
  // rejects the app's own top rung is miscalibrated, not strict — the same
  // reasoning that recalibrated the leak gate in the authoring pipeline.
  for (const p of ALL) {
    const v = visibleOf(p);
    for (const [i, hint] of p.hints.entries()) {
      const verdict = filterTutor(hint, p.solution, v);
      assert.equal(
        verdict.ok,
        true,
        `${p.id}: the filter rejected the authored L${i + 1} hint — ${(verdict as { reason?: string }).reason}`,
      );
    }
  }
});

test("the tutor may answer a question about Java, including with a short example", () => {
  // The whole reason this filter is not the hint filter. A beginner asking
  // for syntax needs syntax.
  const answers = [
    "A HashMap looks a value up by hashing the key, so it never has to scan. An array only knows positions, which is why finding a value in one means walking it.",
    "You write it like this:\n```java\nfor (int i = 0; i < xs.length; i++) {\n    System.out.println(xs[i]);\n}\n```\nThe enhanced for loop drops the index when you do not need one.",
    "An int cannot hold null because it is a primitive — there is no reference to be absent. Integer can, which is exactly why it costs you a null check.",
  ];
  for (const p of ALL) {
    for (const a of answers) {
      const verdict = filterTutor(a, p.solution, visibleOf(p));
      assert.equal(
        verdict.ok,
        true,
        `${p.id}: a general Java answer was rejected — ${(verdict as { reason?: string }).reason}`,
      );
    }
  }
});

test("a long code block is rejected even when its vocabulary is innocent", () => {
  // The length rule stands on its own. A fifteen-line block is a program
  // whatever it is about, and this is what keeps the tutor from writing one
  // for a problem whose solution has no distinctive vocabulary to measure.
  const p = ALL[0]!;
  const long = "```java\n" + Array.from({ length: 14 }, (_, i) => `System.out.println(${i});`).join("\n") + "\n```";
  const verdict = filterTutor(long, p.solution, visibleOf(p));
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /code block/);
});

test("an empty reply is a rejection, not an answer", () => {
  const p = ALL[0]!;
  assert.equal(filterTutor("   ", p.solution, visibleOf(p)).ok, false);
});

test("a solution reworded into prose is caught by vocabulary alone", () => {
  // The case the code rules cannot see: no fence, nothing verbatim, and yet
  // it hands the whole thing over. This is the only test the vocabulary rule
  // is load-bearing for — disabling that rule must fail here and nowhere else.
  const p = ALL.find((x) => x.id === "fund-collections-lru-cache")!;
  const leak =
    "Reach for a LinkedHashMap built with accessOrder set to true, have get " +
    "delegate to getOrDefault with minus one, and in put take the keySet " +
    "iterator and remove its first entry once you are over capacity.";
  const verdict = filterTutor(leak, p.solution, visibleOf(p));
  assert.equal(verdict.ok, false, "a reworded solution passed the filter");
  assert.match((verdict as { reason: string }).reason, /vocabulary only the solution uses/);
});

test("the vocabulary rule needs a count AND a rate, not either alone", () => {
  // Both halves are load-bearing and this pins why. A short reply that
  // happens to share two words is not a leak (the authored L3 hints reach
  // 22% on a rate alone), and a long reply that shares four words out of
  // three hundred is not one either.
  const p = ALL.find((x) => x.id === "fund-collections-lru-cache")!;
  const v = visibleOf(p);
  // High rate, low count: three words, one of them the solution's.
  assert.equal(filterTutor("Try LinkedHashMap.", p.solution, v).ok, true);
  // High count, low rate: the same leak diluted into a long answer is still
  // allowed through, which is the honest limit of a ratio-based check.
  const diluted =
    "LinkedHashMap accessOrder getOrDefault keySet " +
    Array.from({ length: 60 }, (_, i) => `unrelated${i}`).join(" ");
  assert.equal(filterTutor(diluted, p.solution, v).ok, true);
});


// ------------------------------------------------- the service, end to end

/**
 * The pure functions above are the easy half. What actually has to hold is the
 * WIRING: that the thing built from the un-redacted problem, in a file where
 * `problem.solution` is in scope, still hands the model only redacted context
 * — and that a rejected reply does not quietly become history for the next
 * turn to build on.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiService } from "./service.js";
import { getChat, recordAttempt } from "../db/queries.js";
import { migrate } from "../db/migrations.js";
import type { ProviderRegistry } from "./registry.js";
import type { AiRequest } from "@shared/types/ai.js";

type Seen = { system: string; user: string; history: AiRequest["history"] };

async function serviceWith(
  t: { after: (fn: () => unknown) => void },
  reply: (req: AiRequest) => string,
  opts: { ignoreAbort?: boolean } = {},
): Promise<{ ai: AiService; db: DatabaseSync; seen: Seen[] }> {
  const dir = await mkdtemp(join(tmpdir(), "jt-ai-"));
  const db = new DatabaseSync(join(dir, "test.db"));
  migrate(db);
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const seen: Seen[] = [];
  const provider = {
    id: "ollama" as const,
    status: async () => ({ id: "ollama" as const, label: "stub", available: true, detail: "" }),
    complete: async (req: AiRequest) => {
      seen.push({ system: req.system, user: req.user, history: req.history });
      return reply(req);
    },
    stream: async (req: AiRequest, onText: (d: string) => void, signal?: AbortSignal) => {
      seen.push({ system: req.system, user: req.user, history: req.history });
      const text = reply(req);
      // Deliver it the way a real provider does: in pieces.
      for (const word of text.split(" ")) {
        if (signal?.aborted && opts.ignoreAbort !== true) throw new Error("aborted");
        onText(`${word} `);
      }
      return text;
    },
  };
  const registry = {
    get: () => provider,
    statuses: async () => [],
  } as unknown as ProviderRegistry;

  return { ai: new AiService(registry, () => db, () => "ollama"), db, seen };
}

const PROBLEM = ALL.find((p) => p.id === "fund-collections-lru-cache")!;

test("the tutor turn hands the provider redacted context and nothing else", async (t) => {
  const { ai, seen } = await serviceWith(t, () => "Have a look at what your get returns on a miss.");
  await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "am I close?", userCode: "class LRUCache {}" },
    () => {},
  );

  assert.equal(seen.length, 1);
  const sent = `${seen[0]!.system}\n${seen[0]!.user}`;
  assert.ok(!sent.includes(PROBLEM.solution), "the solution reached the provider");
  for (const c of PROBLEM.testCases.filter((x) => x.hidden)) {
    for (const token of JSON.stringify(c).match(/-?\d{3,}/g) ?? []) {
      assert.ok(!sent.includes(token), `hidden-case value ${token} reached the provider`);
    }
  }
  // And it DID get what it needs to be useful.
  assert.ok(sent.includes("class LRUCache {}"), "the learner's code did not reach the provider");
});

test("a turn streams, then persists both halves of the exchange", async (t) => {
  const { ai, db } = await serviceWith(t, () => "What does your get return when the key is absent?");
  const chunks: string[] = [];
  let firstAt: number | null = null;

  const res = await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "stuck", userCode: "" },
    (c) => {
      if (c.type === "first") firstAt = c.ms;
      else chunks.push(c.text);
    },
  );

  assert.equal(res.streamed, true);
  assert.ok(chunks.length > 1, "the reply arrived in one piece — that is not streaming");
  assert.notEqual(firstAt, null, "no first-token event was emitted");
  assert.equal(res.rejected, undefined);

  const history = getChat(db, PROBLEM.id);
  assert.deepEqual(history.map((m) => m.role), ["user", "assistant"]);
  assert.equal(history[0]!.content, "stuck");
  assert.equal(history[1]!.provider, "ollama");
});

test("a second turn carries the first as history", async (t) => {
  const { ai, seen } = await serviceWith(t, () => "Which key does your iterator land on first?");
  await ai.chat({ turnId: "t1", problemId: PROBLEM.id, message: "first", userCode: "" }, () => {});
  await ai.chat({ turnId: "t2", problemId: PROBLEM.id, message: "second", userCode: "" }, () => {});

  assert.deepEqual(seen[0]!.history, [], "the first turn should have no history");
  assert.deepEqual(
    seen[1]!.history?.map((m) => m.role),
    ["user", "assistant"],
    "the second turn should carry the first exchange",
  );
  assert.equal(seen[1]!.history![0]!.content, "first");
});

test("a reply that leaks the solution is not persisted as history", async (t) => {
  // The important half of this: not just that the learner does not see it,
  // but that the NEXT turn is not built on top of it. A leak kept in history
  // is a leak the model reads back as something it already established.
  const { ai, db } = await serviceWith(t, () => "```java\n" + PROBLEM.solution + "\n```");
  const res = await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "just tell me", userCode: "" },
    () => {},
  );

  assert.notEqual(res.rejected, undefined, "a pasted solution was accepted");
  assert.equal(res.text, "");
  const history = getChat(db, PROBLEM.id);
  // Their question stays — they should be able to rephrase from it.
  assert.deepEqual(history.map((m) => m.role), ["user"]);
});

test("a cancelled turn leaves no reply behind", async (t) => {
  const { ai, db } = await serviceWith(t, () => "one two three four five six");
  const controller = new AbortController();
  const res = await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "stop me", userCode: "" },
    () => controller.abort(),
    controller.signal,
  );
  assert.equal(res.rejected, "cancelled");
  assert.deepEqual(getChat(db, PROBLEM.id).map((m) => m.role), ["user"]);
});

test("with no provider the turn fails quietly and writes nothing", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jt-ai-"));
  const db = new DatabaseSync(join(dir, "test.db"));
  migrate(db);
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  const registry = { get: () => null, statuses: async () => [] } as unknown as ProviderRegistry;
  const ai = new AiService(registry, () => db, () => "none");

  const res = await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "hello", userCode: "" },
    () => {},
  );
  assert.equal(res.rejected, "no provider");
  // Not even the question: there was never a turn to rephrase.
  assert.equal(getChat(db, PROBLEM.id).length, 0);
});

test("a provider that ignores the stop button still does not get its reply stored", async (t) => {
  // Abort is cooperative. A provider that finishes anyway hands back a reply
  // the learner has already told us they do not want, and without this check
  // it would land in the transcript after they clicked Stop.
  const { ai, db } = await serviceWith(t, () => "one two three four", { ignoreAbort: true });
  const controller = new AbortController();
  const res = await ai.chat(
    { turnId: "t1", problemId: PROBLEM.id, message: "stop me", userCode: "" },
    () => controller.abort(),
    controller.signal,
  );
  assert.equal(res.rejected, "cancelled");
  assert.deepEqual(getChat(db, PROBLEM.id).map((m) => m.role), ["user"]);
});

test("the hint path also runs its post-filter, not just the tutor", async (t) => {
  // Found by mutation while testing the tutor: filterHint was thoroughly
  // tested as a function, and nothing proved the service ever CALLED it.
  // The two are different claims and only the second one protects a learner.
  const { ai } = await serviceWith(t, () => "```java\n" + PROBLEM.solution + "\n```");
  const res = await ai.hint({
    problemId: PROBLEM.id,
    level: 0,
    userCode: "class LRUCache {}",
    failedAttempts: 0,
  });
  assert.notEqual(res.rejected, undefined, "a hint containing the solution was served");
  assert.equal(res.text, "");
});


// ------------------------------------------------------------- code review

import { extractJson, parseReview } from "./review.js";

/** Marks a problem solved the only way the app can: a passing submit. */
function solve(db: DatabaseSync, problemId: string, code: string): void {
  recordAttempt(db, {
    problemId,
    code,
    status: "passed",
    submitted: true,
    testsPassed: 5,
    testsTotal: 5,
    compileMs: 400,
    runtimeMs: 12,
    hintLevel: 0,
  });
}

const GOOD_REVIEW = JSON.stringify({
  verdict: "Correct and readable, but it boxes on every iteration.",
  complexity: { time: "O(n)", space: "O(n)", note: "The map dominates." },
  strengths: ["The empty case is handled first."],
  improvements: [{ what: "Use getOrDefault", why: "It removes the null check" }],
  idiom: ["merge replaces the check-then-put"],
});

test("a review is refused until the problem is actually solved", async (t) => {
  // The gate that matters: this is the one prompt containing the reference
  // solution, so "have they passed?" is answered against the database before
  // anything is built — not by whether the button was rendered.
  const { ai, seen } = await serviceWith(t, () => GOOD_REVIEW);
  const res = await ai.review({ problemId: PROBLEM.id, userCode: "class LRUCache {}" });

  assert.equal(res.rejected, "not solved yet");
  assert.equal(res.review, null);
  // And crucially: no call was made at all, so the solution never left the
  // process. A refusal after the prompt was built would be no refusal.
  assert.equal(seen.length, 0, "a prompt was built for an unsolved problem");
});

test("a solved problem does send the reference solution, which is the deliberate exception", async (t) => {
  // Asserted rather than assumed. Review is the one feature allowed to see the
  // answer, and if that ever stops being true this test should be the thing
  // that says so — silently losing it would make reviews vaguer for no
  // visible reason.
  const { ai, db, seen } = await serviceWith(t, () => GOOD_REVIEW);
  solve(db, PROBLEM.id, "class LRUCache {}");

  const res = await ai.review({ problemId: PROBLEM.id, userCode: "class LRUCache { int x; }" });
  assert.equal(res.rejected, undefined);
  assert.equal(res.review?.verdict, "Correct and readable, but it boxes on every iteration.");
  assert.ok(seen[0]!.user.includes(PROBLEM.solution), "the reference solution was not sent");
  assert.ok(seen[0]!.user.includes("class LRUCache { int x; }"), "their code was not sent");
});

test("a review is cached against the code it describes, not the problem", async (t) => {
  const { ai, db, seen } = await serviceWith(t, () => GOOD_REVIEW);
  solve(db, PROBLEM.id, "v1");

  const first = await ai.review({ problemId: PROBLEM.id, userCode: "v1" });
  const second = await ai.review({ problemId: PROBLEM.id, userCode: "v1" });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(seen.length, 1, "the cached review still called the provider");

  // Edited code is different code. Serving the old review against it would be
  // describing a version that no longer exists.
  const edited = await ai.review({ problemId: PROBLEM.id, userCode: "v2" });
  assert.equal(edited.cached, false);
  assert.equal(seen.length, 2);
});

test("a reply that is not a review is refused rather than half-rendered", async (t) => {
  const { ai, db } = await serviceWith(t, () => "I had a look and it seems fine to me!");
  solve(db, PROBLEM.id, "code");
  const res = await ai.review({ problemId: PROBLEM.id, userCode: "code" });
  assert.equal(res.review, null);
  assert.match(res.rejected ?? "", /not a review/);
});

// ------------------------------------------------------- parsing the reply

test("JSON is found however the model wrapped it", () => {
  // Every one of these shapes is what "reply with one JSON object" actually
  // produces some fraction of the time.
  const object = '{"verdict":"fine","complexity":{"time":"O(n)"}}';
  for (const [label, text] of [
    ["bare", object],
    ["fenced", "```json\n" + object + "\n```"],
    ["with a preamble", "Here is the review:\n" + object],
    ["with a closing remark", object + "\n\nHope that helps!"],
    ["both", "Sure —\n```json\n" + object + "\n```\nLet me know."],
  ] as [string, string][]) {
    assert.equal(extractJson(text), object, label);
  }
});

test("an UNBALANCED brace inside a string does not truncate the object", () => {
  // The braces have to be unbalanced for this to test anything. A balanced
  // "{a=1}" inside a string counts up and back down again, so a scanner with
  // no idea what a string is still lands in the right place — the first
  // version of this test made exactly that mistake and passed either way.
  //
  // Unbalanced is also the realistic case: a Java review talks about "the
  // closing } on line 12" constantly.
  const stray = '{"verdict":"your closing } is on the wrong line","complexity":{"time":"O(n)"}}';
  assert.equal(extractJson(stray), stray);
  assert.equal(parseReview(stray)?.verdict, "your closing } is on the wrong line");

  const opener = '{"verdict":"an opening { with no partner","complexity":{"time":"O(1)"}}';
  assert.equal(extractJson(opener), opener);
  assert.equal(parseReview(opener)?.complexity.time, "O(1)");

  // An escaped quote must not be read as the end of the string. This one is
  // deliberately constructed rather than observed: it needs an ODD number of
  // escaped quotes before a stray brace, because an even number flips the
  // scanner out of the string and back in again and lands on the right answer
  // by accident. Two earlier versions of this assertion did exactly that and
  // passed with escape handling removed entirely.
  const escaped = '{"verdict":"a quote \\" then } here","complexity":{"time":"O(n)"}}';
  assert.equal(extractJson(escaped), escaped);
  assert.equal(parseReview(escaped)?.complexity.time, "O(n)");
});

test("a reply with no object at all yields nothing", () => {
  assert.equal(extractJson("no json here"), null);
  assert.equal(parseReview("no json here"), null);
  assert.equal(parseReview("{ not valid json }"), null);
});

test("a review without a verdict is not a review", () => {
  // Half a review renders as a panel with a heading and nothing under it,
  // which reads as the model having nothing to say rather than as a failure.
  assert.equal(parseReview('{"strengths":["a"]}'), null);
  assert.equal(parseReview('{"verdict":"   "}'), null);
});

test("fields that arrived in the wrong shape are coerced, not rejected", () => {
  // A single string where a list was asked for is a reply, not a failure, and
  // throwing the whole review away over it would be the wrong trade.
  const r = parseReview(
    JSON.stringify({
      verdict: "fine",
      strengths: "just the one",
      improvements: ["a bare string improvement", { what: "structured", why: "because" }],
      idiom: null,
    }),
  );
  assert.deepEqual(r?.strengths, ["just the one"]);
  assert.deepEqual(r?.improvements, [
    { what: "a bare string improvement", why: "" },
    { what: "structured", why: "because" },
  ]);
  assert.deepEqual(r?.idiom, []);
  assert.deepEqual(r?.complexity, { time: "", space: "", note: "" });
});
