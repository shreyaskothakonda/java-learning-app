/**
 * The quality gates a generated problem must clear.
 *
 * The compile-and-run gate catches "the reference solution is wrong". It does
 * NOT catch the failure mode models actually produce, which is a problem whose
 * every case expects the same value, so that any stub passes and the problem
 * asserts nothing. Two extra JVM invocations catch that:
 *
 *   starter-must-fail — run the STARTER code. If it passes, the problem is
 *                       already solved and there is nothing to learn.
 *   mutant-must-fail  — run a deliberately broken variant. If it passes, the
 *                       test cases are vacuous.
 *
 * This is the step that would be skipped under time pressure and is the one
 * that decides whether the corpus is worth anything.
 */

import { runProblem } from "../../src/main/services/java-runner.js";
import type { Problem } from "../../content/types.js";
import { validateProblem } from "../../content/validate.js";

export type GateResult = { ok: boolean; gate: string; detail: string };

export type GateOptions = {
  workRoot: string;
  runtimeDir: string;
  /** Path to the seatbelt profile. Unattended runs must pass one. */
  sandboxProfile?: string;
};

async function run(p: Problem, code: string, opts: GateOptions) {
  return runProblem(p, code, {
    workRoot: opts.workRoot,
    visibleOnly: false,
    runtimeDir: opts.runtimeDir,
    ...(opts.sandboxProfile !== undefined ? { sandboxProfile: opts.sandboxProfile } : {}),
  });
}

/**
 * Mutants: small, plausible wrongness of the kind a learner produces.
 *
 * Deliberately not random noise — a mutant that does not compile proves
 * nothing about the test cases, it only proves javac works.
 */
export function mutate(solution: string): { name: string; code: string }[] {
  const out: { name: string; code: string }[] = [];

  // Return a constant. Catches "every case expects the same value".
  const constant = solution
    .replace(/return\s+[^;]+;/g, (m) =>
      /return\s+(0|null|false|true|-1|"")\s*;/.test(m) ? m : "return 0;",
    );
  if (constant !== solution) out.push({ name: "return-constant", code: constant });

  // Off-by-one on every loop bound. Catches boundary-blind cases.
  const offByOne = solution.replace(/<\s*([A-Za-z_][\w.]*(?:\.length|\.size\(\))?)/g, "< $1 - 1");
  if (offByOne !== solution) out.push({ name: "off-by-one", code: offByOne });

  // Drop the guard clause. Catches a missing empty/null case.
  const noGuard = solution.replace(/if\s*\([^)]*\)\s*return[^;]*;\s*/, "");
  if (noGuard !== solution) out.push({ name: "no-guard", code: noGuard });

  return out;
}

export async function runGates(p: Problem, opts: GateOptions): Promise<GateResult[]> {
  const results: GateResult[] = [];

  // 1. Static validation — free, so it runs before any JVM starts.
  const staticErrors = validateProblem(p);
  results.push({
    ok: staticErrors.length === 0,
    gate: "static",
    detail: staticErrors.length === 0 ? "valid" : staticErrors.join("; "),
  });
  if (staticErrors.length > 0) return results;

  // 2. The reference solution must pass every case, visible and hidden.
  const ref = await run(p, p.solution, opts);
  const refPassed = ref.phase === "ok" && ref.caseResults.every((c) => c.passed);
  results.push({
    ok: refPassed,
    gate: "solution-passes",
    detail: refPassed
      ? `${ref.caseResults.length}/${ref.caseResults.length}`
      : ref.phase === "compile"
        ? `did not compile: ${ref.diagnostics[0]?.message ?? ref.error ?? "unknown"}`
        : ref.caseResults
            .filter((c) => !c.passed)
            .map((c) => `case ${c.index}: expected ${c.expected} got ${c.actual ?? c.error}`)
            .join("; "),
  });
  if (!refPassed) return results;

  // 3. The starter must NOT pass. If it does, the problem is already solved.
  const starter = await run(p, p.starterCode, opts);
  const starterPassed = starter.phase === "ok" && starter.caseResults.every((c) => c.passed);
  results.push({
    ok: !starterPassed,
    gate: "starter-fails",
    detail: starterPassed
      ? "the starter code already passes — there is nothing to solve"
      : starter.phase === "compile"
        ? "starter does not compile (expected)"
        : "starter fails cases (expected)",
  });

  // 4. At least one mutant must fail, or the cases assert nothing.
  const mutants = mutate(p.solution);
  if (mutants.length === 0) {
    results.push({ ok: false, gate: "mutant-fails", detail: "could not construct any mutant" });
    return results;
  }
  const survivors: string[] = [];
  for (const m of mutants) {
    const r = await run(p, m.code, opts);
    const passed = r.phase === "ok" && r.caseResults.every((c) => c.passed);
    if (passed) survivors.push(m.name);
  }
  results.push({
    ok: survivors.length < mutants.length,
    gate: "mutant-fails",
    detail:
      survivors.length === mutants.length
        ? `every mutant passed (${survivors.join(", ")}) — the test cases are vacuous`
        : `${mutants.length - survivors.length}/${mutants.length} mutants caught`,
  });

  // 5. The reference solution must not use its own banned APIs.
  if (p.bannedApis && p.bannedApis.length > 0) {
    const used = p.bannedApis.filter((api) => p.solution.includes(api));
    results.push({
      ok: used.length === 0,
      gate: "banned-apis",
      detail: used.length === 0 ? "clean" : `solution uses ${used.join(", ")}`,
    });
  }

  return results;
}

export function allPassed(results: GateResult[]): boolean {
  return results.every((r) => r.ok);
}
