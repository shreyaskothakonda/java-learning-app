/**
 * Duplicate detection, with no model involved.
 *
 * A generator asked for eight problems in one topic will happily produce the
 * same problem three times with different wording. Catching that is pure text
 * work, so it costs nothing and runs before the expensive implement step.
 */

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "are", "not", "from",
  "given", "return", "array", "string", "integer", "number", "find", "each",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type DupeVerdict = { duplicate: false } | { duplicate: true; of: string; why: string };

/** Threshold from the plan: prompts sharing >0.6 of their vocabulary are the same problem. */
const JACCARD_LIMIT = 0.6;

export function checkDuplicate(
  candidate: { title: string; prompt: string },
  existing: { id: string; title: string; prompt: string }[],
): DupeVerdict {
  const nt = normaliseTitle(candidate.title);
  for (const e of existing) {
    if (normaliseTitle(e.title) === nt) {
      return { duplicate: true, of: e.id, why: `identical title "${e.title}"` };
    }
  }
  const ct = tokens(candidate.prompt);
  for (const e of existing) {
    const score = jaccard(ct, tokens(e.prompt));
    if (score > JACCARD_LIMIT) {
      return {
        duplicate: true,
        of: e.id,
        why: `${Math.round(score * 100)}% prompt overlap with "${e.title}"`,
      };
    }
  }
  return { duplicate: false };
}
