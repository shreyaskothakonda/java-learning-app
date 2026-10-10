/**
 * `--selftest`: the acceptance test for a PACKAGED build.
 *
 * Everything in this project is tested from source, which is exactly why
 * packaging needs its own check: the Phase 2 path bug passed every test for
 * days because the tests ran under tsx and the bug only existed in the bundle.
 * A packaged app has a third layout again, an asar archive, a different working
 * directory, a different environment, and — from this phase — a seatbelt
 * profile that development does not use.
 *
 * So this runs the real thing through the real paths:
 *
 *     ./MyApp.app/Contents/MacOS/Java\ Tutor --selftest
 *
 * It exits non-zero if anything is wrong, which makes "the package works" a
 * command rather than an opinion. It also verifies the sandbox is a boundary
 * rather than a setting, by trying to escape it.
 */

import { app } from "electron";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ALL } from "../../content/index.js";
import { CONCEPTS } from "../../content/concepts/index.js";
import { outputMatches } from "../../content/concepts/validate.js";
import { LATEST_VERSION } from "./db/migrations.js";
import { openDb } from "./db/index.js";
import { findJdk } from "./services/jdk.js";
import { runJavaSource, runProblem } from "./services/java-runner.js";
import { dataDir, describePaths, missingResources, runtimeDir, sandboxProfile } from "./paths.js";

type Check = { name: string; ok: boolean; detail: string };

const PROBE = join(homedir(), ".java-tutor-sandbox-probe");

/**
 * A program that tries to write outside the run directory.
 *
 * Under the seatbelt profile this must fail. Running it is the difference
 * between "the profile is configured" and "the profile is enforced" — the
 * first is a line in a yml file and the second is the thing being claimed.
 */
const ESCAPE_ATTEMPT = `import java.io.*;

public class Main {
    public static void main(String[] args) {
        File out = new File(System.getProperty("user.home"), ".java-tutor-sandbox-probe");
        try (FileWriter w = new FileWriter(out)) {
            w.write("escaped");
            System.out.println("WROTE");
        } catch (Exception e) {
            System.out.println("DENIED");
        }
    }
}`;

export async function runSelfTest(): Promise<number> {
  const checks: Check[] = [];
  const workRoot = join(app.getPath("userData"), "runs");
  const profile = sandboxProfile();

  console.log(`java-tutor ${app.getVersion()} self-test`);
  console.log(`  paths:   ${describePaths()}\n`);

  // 1. Resources survived packaging. This is the check that would have caught
  //    a forgotten entry in extraResources before javac did.
  const missing = missingResources();
  checks.push({
    name: "resources",
    ok: missing.length === 0,
    detail: missing.length === 0 ? `intact under ${runtimeDir()}` : `MISSING: ${missing.join(", ")}`,
  });

  // 2. A JDK. The plan's decision was to use the system one and fail clearly.
  const jdk = await findJdk();
  checks.push({
    name: "jdk",
    ok: jdk !== null,
    detail: jdk ? `${jdk.version} at ${jdk.home}` : "no JDK found via /usr/libexec/java_home",
  });

  // 3. The database opens and migrates in the packaged app's userData.
  try {
    const db = openDb();
    const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
      | { version: number }
      | undefined;
    checks.push({
      name: "database",
      ok: row?.version === LATEST_VERSION,
      detail: `schema v${row?.version ?? "?"} (expected v${LATEST_VERSION}) at ${app.getPath("userData")}`,
    });
  } catch (e) {
    checks.push({ name: "database", ok: false, detail: (e as Error).message });
  }

  if (jdk && missing.length === 0) {
    // 4. A real problem, compiled and run through the packaged paths.
    const problem = ALL[0]!;
    const res = await runProblem(problem, problem.solution, {
      workRoot,
      visibleOnly: false,
      runtimeDir: runtimeDir(),
      dataDir: dataDir(),
      ...(profile !== undefined ? { sandboxProfile: profile } : {}),
    });
    const passed = res.phase === "ok" && res.caseResults.every((c) => c.passed);
    checks.push({
      name: "run a problem",
      ok: passed,
      detail: passed
        ? `${problem.id}: ${res.caseResults.length}/${res.caseResults.length} cases, ${res.compileMs}ms compile`
        : `${problem.id}: ${res.phase} — ${res.error ?? res.diagnostics[0]?.message ?? "cases failed"}`,
    });

    // 5. A concept example, which is the other thing that starts a JVM.
    const example = CONCEPTS[0]?.examples[0];
    if (example) {
      const snip = await runJavaSource(example.code, {
        workRoot,
        ...(profile !== undefined ? { sandboxProfile: profile } : {}),
      });
      const matched = snip.ok && outputMatches(snip.stdout, example.expectedOutput);
      checks.push({
        name: "run a concept example",
        ok: matched,
        detail: matched
          ? `${CONCEPTS[0]!.slug}: output matches the page`
          : `${CONCEPTS[0]!.slug}: ${snip.ok ? "output drifted" : snip.stderr || "did not run"}`,
      });
    }

    // 6. The sandbox is enforced, not merely configured.
    await rm(PROBE, { force: true });
    const escape = await runJavaSource(ESCAPE_ATTEMPT, {
      workRoot,
      ...(profile !== undefined ? { sandboxProfile: profile } : {}),
    });
    const said = escape.stdout.trim();
    const leaked = existsSync(PROBE);
    await rm(PROBE, { force: true });

    // The expectation keys on `app.isPackaged`, NOT on whether a profile
    // happened to be found.
    //
    // The first version branched on `profile === undefined` and reported "off
    // in development" whenever there was no profile — so a packaged build that
    // silently lost its sandbox passed this check and exited 0. Mutation
    // testing caught it: deleting the sandbox entirely left the self-test
    // green. A check conditioned on the thing it is meant to verify cannot
    // fail, which makes it worse than no check, because it reads as one.
    if (app.isPackaged) {
      const enforced = profile !== undefined && said === "DENIED" && !leaked;
      checks.push({
        name: "sandbox denies writes outside the run directory",
        ok: enforced,
        detail: enforced
          ? "the probe was refused"
          : profile === undefined
            ? "NO PROFILE IS IN USE — a packaged build must run sandboxed"
            : `THE PROBE ESCAPED: said ${said}, file ${leaked ? "was created" : "absent"}`,
      });
    } else {
      // Development runs unsandboxed by design, so the write SHOULD succeed.
      // Asserting the opposite here would pass for the wrong reason.
      checks.push({
        name: "sandbox (off in development, by design)",
        ok: profile === undefined && said === "WROTE",
        detail:
          profile === undefined && said === "WROTE"
            ? "the probe wrote, as expected without a profile"
            : `unexpected: profile=${profile ?? "none"}, probe said ${said}`,
      });
    }
  }

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`  ${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(42)} ${c.detail}`);
  }
  console.log(`\n${checks.length} checks, ${failed} failing`);
  return failed === 0 ? 0 : 1;
}

/** True when the process was started to self-test rather than to show a window. */
export function wantsSelfTest(): boolean {
  return process.argv.includes("--selftest");
}
