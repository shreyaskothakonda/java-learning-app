/**
 * Parsing a model's review into something the UI can render.
 *
 * Asking for JSON and getting JSON are different events. Models wrap it in a
 * fence, prefix it with "Here is the review:", trail it with a closing remark,
 * or produce a field as a string where an array was asked for. None of that is
 * exceptional — it is the normal distribution of replies — so the parser
 * treats all of it as expected input rather than as an error, and only gives
 * up when there is genuinely no object there.
 *
 * Kept separate from the service so it can be tested without a provider, a
 * database or a JVM. Every failure mode below is a real one that came back
 * from an actual call at some point.
 */

import type { CodeReview } from "@shared/types/ai.js";

/**
 * Pulls the first complete JSON object out of a reply.
 *
 * Brace-counting rather than a regex, and string-aware: a `{` inside a quoted
 * string ("use a map like {a=1}") would otherwise unbalance the count and
 * swallow the rest of the reply.
 */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** A field that should be a list of strings, however it arrived. */
function toStrings(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter((s) => s !== "");
  }
  // A single string where a list was asked for is a reply, not a failure.
  if (typeof v === "string" && v.trim() !== "") return [v.trim()];
  return [];
}

function toText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validates and normalises. Returns null when the reply cannot be a review —
 * the caller then shows nothing rather than a half-empty panel, because a
 * review missing its verdict reads as the model having nothing to say.
 */
export function parseReview(text: string): CodeReview | null {
  const json = extractJson(text);
  if (json === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const verdict = toText(o["verdict"]);
  if (verdict === "") return null;

  const cx = (typeof o["complexity"] === "object" && o["complexity"] !== null
    ? (o["complexity"] as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const improvements = Array.isArray(o["improvements"])
    ? (o["improvements"] as unknown[])
        .map((x) => {
          if (typeof x === "string") return { what: x.trim(), why: "" };
          if (typeof x === "object" && x !== null) {
            const r = x as Record<string, unknown>;
            return { what: toText(r["what"]), why: toText(r["why"]) };
          }
          return { what: "", why: "" };
        })
        .filter((i) => i.what !== "")
    : [];

  return {
    verdict,
    complexity: {
      time: toText(cx["time"]),
      space: toText(cx["space"]),
      note: toText(cx["note"]),
    },
    strengths: toStrings(o["strengths"]),
    improvements,
    idiom: toStrings(o["idiom"]),
  };
}
