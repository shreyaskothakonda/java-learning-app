/**
 * The post-filter: the last line of defence on a hint.
 *
 * Redaction stops the model seeing the solution; this stops it deriving one
 * anyway and handing it over. A model that has understood the problem can
 * write the answer without ever having read it, and at level 1 that ruins the
 * exercise just as thoroughly as copying would.
 *
 * On rejection the caller falls back to the problem's static hint, which is
 * why every problem ships four of them. The AI is an enhancement; the ladder
 * works with no provider at all.
 */

/** Tokens that carry meaning — short and common ones say nothing about overlap. */
function distinctiveTokens(text: string): Set<string> {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "you", "your", "are", "not",
    "int", "new", "return", "public", "class", "void", "static", "if", "else",
    "for", "while", "length", "size", "null", "true", "false",
  ]);
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 4 && !stop.has(t)),
  );
}

export type FilterVerdict = { ok: true } | { ok: false; reason: string };

const MAX_FENCED_LINES = 2;

/**
 * Overlap allowance per rung.
 *
 * Measured against the authored hints, which are the gold standard for what is
 * acceptable at each level: the worst legitimate one scores 22% (a level-2
 * probe that points at `nums[read]` in the learner's own code), while a
 * realistic prose leak — "track a write index and a read index, copy
 * nums[read] into nums[write]" — scores 27%.
 *
 * A single threshold has to fit in that 5-point gap, which is far too tight to
 * trust. Scaling by level resolves it, because the tension was never really
 * about the metric: that same sentence IS a leak at level 1 and is precisely
 * what level 4 is supposed to say. The ladder's own premise is the missing
 * variable.
 *
 * Treat this as a BACKSTOP regardless. The defences that do the real work are
 * structural: the model never receives the solution, and the code-shape checks
 * above do not depend on a similarity score at all.
 */
const MAX_OVERLAP = [0.15, 0.25, 0.35, 0.5];

/**
 * @param text     what the model produced
 * @param level    0-3; the ladder's top rung is allowed to say much more
 * @param solution the reference solution. The FILTER may see it even though
 *                 the PROMPT may not — they are built separately, and checking
 *                 against something is not the same as revealing it.
 */
export function filterHint(text: string, level: number, solution: string): FilterVerdict {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "empty response" };

  // Level 4 (Walk) is allowed prose describing the algorithm, but still not
  // a program. Levels 1-3 are allowed almost no code at all.
  const fences = [...trimmed.matchAll(/```[\s\S]*?```/g)];
  const fencedLines = fences.reduce(
    (n, m) => n + m[0].split("\n").filter((l) => l.trim() !== "" && !l.startsWith("```")).length,
    0,
  );
  const allowance = level >= 3 ? MAX_FENCED_LINES : 1;
  if (fencedLines > allowance) {
    return { ok: false, reason: `${fencedLines} lines of code at level ${level + 1}` };
  }

  // A method body given as prose rather than in a fence still gives it away.
  if (/\b(for|while)\s*\(.*\)\s*\{/.test(trimmed) && level < 3) {
    return { ok: false, reason: "contains a loop body" };
  }

  const hint = distinctiveTokens(trimmed);
  const sol = distinctiveTokens(solution);
  if (hint.size > 0 && sol.size > 0) {
    let shared = 0;
    for (const t of hint) if (sol.has(t)) shared++;
    const overlap = shared / hint.size;
    const allowed = MAX_OVERLAP[level] ?? 0.5;
    if (overlap > allowed) {
      return {
        ok: false,
        reason: `${Math.round(overlap * 100)}% token overlap with the solution at level ${level + 1} (max ${Math.round(allowed * 100)}%)`,
      };
    }
  }

  // L2 is the Probe rung: it asks one question. If it stopped asking, the
  // ladder has quietly lost a step.
  if (level === 1 && !trimmed.endsWith("?")) {
    return { ok: false, reason: "level 2 must be a question" };
  }
  return { ok: true };
}

// ------------------------------------------------------------- the tutor

/**
 * The tutor's filter, which is NOT the hint filter with the numbers moved.
 *
 * Two things make the tutor a different problem:
 *
 *  1. It is allowed to write code. A beginner asking "how do I loop over an
 *     array in Java?" needs two lines of Java, and a tutor that refuses is
 *     useless. So "contains a loop" cannot be the test.
 *  2. It is allowed to name the learner's variables — that is the point of
 *     showing it their code. Their variables usually share names with the
 *     solution's, so raw overlap is high for an innocent reply.
 *
 * Measured across the corpus (scripts/_calib, reproduced in ai.test.ts), which
 * is what the three rules below are actually built on rather than guessed at:
 *
 *                        verbatim lines   secret-vocab tokens   rate
 *   pasted solution           4-15               1-13          14-65%
 *   solution as prose            0               1-13          20-68%
 *   authored L4 walk hint        0                0-6           5-19%
 *   authored L3 hint             0                0-2           0-22%
 *   a general Java answer        0                0-2           0-18%
 *
 * The authored hints are the standard: the app hands the learner the L4 walk
 * on request, so a filter that rejects it is miscalibrated, not strict. That
 * rules out any threshold on rate alone — L3 reaches 22% and a pasted solution
 * can sit at 14%, because a short reply has few tokens and each shared one is
 * a large fraction of them. The count and the rate together separate cleanly;
 * either alone does not.
 *
 * WHAT THIS DOES NOT CATCH, stated rather than papered over: a problem whose
 * solution uses no vocabulary the prompt has not already used — "compute the
 * average" — has a secret vocabulary of one token, and no measure of leaked
 * words can work on it. For those the code rules are the whole defence, and
 * that is tolerable, because the most such a tutor can give away is roughly
 * what the L4 hint gives away for the asking.
 *
 * AND, because streaming makes this weaker than it looks: the reply is checked
 * when COMPLETE, and by then the learner has watched it arrive. Rejection pulls
 * it from the transcript and from history; it cannot unsee it. The defence that
 * holds is structural — the tutor never receives the solution — and this is a
 * backstop against a model deriving one, at the cost of a turn.
 */

/** A fenced block this long is a method, not an illustration. */
const MAX_FENCE_LINES = 10;
/** Lines of the solution reproduced verbatim before it counts as handing it over. */
const MAX_VERBATIM_LINES = 2;

/** Solution lines worth matching on — braces and imports match everything. */
function significantLines(code: string): string[] {
  return code
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(
      (l) =>
        l.length >= 8 &&
        !l.startsWith("import") &&
        !l.startsWith("//") &&
        !/^[{}\s]*$/.test(l),
    );
}

export function filterTutor(
  text: string,
  solution: string,
  visible: { prompt: string; userCode: string },
): FilterVerdict {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "empty response" };

  // 1. Length. Three lines illustrate; fifteen implement.
  for (const f of trimmed.matchAll(/```[\s\S]*?```/g)) {
    const lines = f[0].split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("```"));
    if (lines.length > MAX_FENCE_LINES) {
      return { ok: false, reason: `a ${lines.length}-line code block is a solution, not an example` };
    }
  }

  // 2. Verbatim reproduction. Whitespace is collapsed on both sides, so
  // reindenting does not evade it — renaming the variables would, which is
  // what rule 3 is for.
  const flat = trimmed.replace(/\s+/g, " ");
  const copied = significantLines(solution).filter((l) => flat.includes(l)).length;
  if (copied > MAX_VERBATIM_LINES) {
    return { ok: false, reason: `${copied} lines of the reference solution reproduced verbatim` };
  }

  // 3. The solution's PRIVATE vocabulary — everything the learner can already
  // read is subtracted first, so naming their own variables costs nothing.
  const known = distinctiveTokens(`${visible.prompt} ${visible.userCode}`);
  const secret = new Set([...distinctiveTokens(solution)].filter((t) => !known.has(t)));
  const reply = distinctiveTokens(trimmed);
  if (secret.size === 0 || reply.size === 0) return { ok: true };

  let shared = 0;
  for (const t of reply) if (secret.has(t)) shared++;
  const rate = shared / reply.size;
  if (shared >= 4 && rate > 0.25) {
    return {
      ok: false,
      reason: `${shared} of ${reply.size} distinctive words (${Math.round(rate * 100)}%) are vocabulary only the solution uses`,
    };
  }
  return { ok: true };
}
