/**
 * Streaming latency, measured before any of the chat UI was written.
 *
 * Phase 5 established that the provider available on this machine takes ~16s
 * for a real hint. The question Phase 7 turns on is a different one: of those
 * seconds, how many pass before the FIRST token? Streaming is worth building
 * only if the answer is "few" — if the first token also arrives at 16s, then
 * "streaming" is a spinner with extra steps and the tutor pane should be
 * designed around a wait instead of around a typing effect.
 *
 *   npx tsx scripts/bench-stream.ts [n]
 */

import { ALL } from "../content/index.js";
import { ProviderRegistry } from "../src/main/ai/registry.js";
import { TUTOR_SYSTEM, tutorUser } from "../src/main/ai/prompts.js";
import { redactProblem } from "../src/main/ai/redact.js";

const n = Number(process.argv[2] ?? 3);
const problem = ALL[0]!;

// A real question against real code, not "say hello" — the Phase 5 lesson was
// that a trivial prompt understates this by nearly half.
const user = tutorUser({
  ctx: redactProblem(problem),
  userCode: problem.starterCode,
  failingCase: null,
  message: "I do not really understand what a HashMap gives me here that an array does not. Can you explain the difference in how they look things up?",
});

const registry = new ProviderRegistry({ packaged: false });
const id = await registry.defaultProvider();
const provider = registry.get(id);
if (!provider || !provider.stream) {
  console.log(`provider ${id} cannot stream — nothing to measure`);
  process.exit(0);
}

console.log(`provider: ${id}  n=${n}  problem: ${problem.id}\n`);

const first: number[] = [];
const total: number[] = [];

for (let i = 0; i < n; i++) {
  const t0 = Date.now();
  let firstMs: number | null = null;
  let chunks = 0;
  let chars = 0;

  const text = await provider.stream(
    { feature: "tutor", system: TUTOR_SYSTEM, user, model: "balanced", maxTokens: 500 },
    (delta) => {
      if (firstMs === null) firstMs = Date.now() - t0;
      chunks++;
      chars += delta.length;
    },
  );

  const ms = Date.now() - t0;
  first.push(firstMs ?? ms);
  total.push(ms);
  console.log(
    `  run ${i + 1}: first token ${firstMs ?? "never"}ms · complete ${ms}ms · ` +
      `${chunks} chunks · ${chars} chars · ${text.length ? "ok" : "EMPTY"}`,
  );
}

const p50 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

console.log(
  `\nfirst token p50 ${p50(first)}ms · complete p50 ${p50(total)}ms · ` +
    `${Math.round((1 - p50(first) / p50(total)) * 100)}% of the reply arrives progressively`,
);
