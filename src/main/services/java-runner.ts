/**
 * Compiles and runs a learner's Java against a problem's test cases.
 *
 * Imports nothing from electron on purpose: `scripts/run-one.ts` drives this
 * same module from plain Node, which is what makes the runner testable without
 * booting a window. The caller supplies `workRoot`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile, copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CaseResult,
  Diagnostic,
  RunResult,
} from "@shared/types/runner.js";
import type { Problem, StdioProblem } from "../../../content/types.js";
import { buildHarness, renderInput } from "./harness-codegen.js";
import { parseJavacOutput, residualOutput } from "./diagnostics.js";
import { findJdk } from "./jdk.js";

const SENTINEL = "\u0001CASE\u0001";
const RUNTIME_DIR = fileURLToPath(new URL("../../../runtime/java/", import.meta.url));
const SUPPORT = ["Judge.java", "TreeNode.java", "ListNode.java"];

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_HEAP_MB = 256;
const DEFAULT_STACK_MB = 64;
/** Guards against a solution printing in an infinite loop. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export type RunOptions = {
  workRoot: string;
  visibleOnly?: boolean;
  /** Kept for post-mortem when a run fails; otherwise the dir is deleted. */
  keepOnFailure?: boolean;
  /** Where `stdinFile` / `stdoutFile` resolve from. Defaults to content/data. */
  dataDir?: string;
  /**
   * Path to a seatbelt profile to run the JVM under.
   *
   * Unset in the app: the learner's own code, on their own machine, in a
   * directory they already own — a sandbox buys nothing the timeout does not.
   * Set by the AUTHORING pipeline, which runs hundreds of never-reviewed
   * generated programs unattended, and that is a genuinely different risk.
   */
  sandboxProfile?: string;
  /**
   * Where Judge.java and the node classes live.
   *
   * Injected rather than derived from `import.meta.url`, because the depth
   * from this module to the project root is NOT the same in the source tree
   * (`src/main/services/`) as in the bundle (`out/main/index.js`) — a relative
   * guess works under tsx and silently resolves outside the project once
   * built. The Electron main process passes `app.getAppPath()`.
   */
  runtimeDir?: string;
};

type Spawned = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  ms: number;
};

/**
 * Runs a process in its own process GROUP so the whole tree can be killed.
 *
 * Killing by pid is not enough: a solution that spawns anything, or a JVM that
 * starts a helper, leaves orphans behind that survive the timeout and leak for
 * the lifetime of the app. `detached: true` plus `kill(-pid)` takes the group.
 */
function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; stdin?: string },
): Promise<Spawned> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, detached: true, stdio: "pipe" });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;
    let settled = false;

    const killGroup = (): void => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        // Group already gone.
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);

    const capture = (chunk: Buffer, into: "out" | "err"): void => {
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        if (!truncated) {
          truncated = true;
          killGroup();
        }
        return;
      }
      if (into === "out") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };

    child.stdout.on("data", (c: Buffer) => capture(c, "out"));
    child.stderr.on("data", (c: Buffer) => capture(c, "err"));

    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, truncated, ms: Date.now() - started });
    };

    child.on("error", (e) => {
      stderr += String(e);
      finish(null);
    });
    child.on("close", finish);

    if (opts.stdin !== undefined) {
      child.stdin.on("error", () => {
        // The program may exit without reading stdin; EPIPE is expected.
      });
      child.stdin.end(opts.stdin);
    } else {
      child.stdin.end();
    }
  });
}

type RawCase = {
  index: number;
  passed: boolean;
  actual: string | null;
  expected: string | null;
  error: string | null;
  durationMs: number;
};

/**
 * Splits the harness's stdout into case results and the learner's own output.
 *
 * Splitting on the sentinel rather than reading line by line matters: a
 * `System.out.print` with no trailing newline would otherwise leave user text
 * glued to the front of a result line.
 */
export function parseRunStream(stdout: string): { cases: RawCase[]; logs: string[] } {
  const chunks = stdout.split(SENTINEL);
  const logs: string[] = [];
  const cases: RawCase[] = [];

  const pushLog = (text: string): void => {
    for (const line of text.split("\n")) {
      if (line !== "") logs.push(line);
    }
  };

  pushLog(chunks[0] ?? "");

  for (const chunk of chunks.slice(1)) {
    const nl = chunk.indexOf("\n");
    const json = nl === -1 ? chunk : chunk.slice(0, nl);
    const rest = nl === -1 ? "" : chunk.slice(nl + 1);
    try {
      cases.push(JSON.parse(json) as RawCase);
    } catch {
      // A truncated final line (the process was killed mid-write) is expected.
      pushLog(json);
    }
    pushLog(rest);
  }
  return { cases, logs };
}

async function writeSources(
  dir: string,
  problem: Problem,
  userCode: string,
  visibleOnly: boolean,
  runtimeDir: string,
): Promise<ReturnType<typeof buildHarness>> {
  const harness = buildHarness(problem, visibleOnly);
  // Verbatim, so javac's line numbers match the editor exactly.
  await writeFile(join(dir, harness.userFileName), userCode, "utf8");
  if (harness.mainSource !== null) {
    await writeFile(join(dir, "Main.java"), harness.mainSource, "utf8");
  }
  await Promise.all(
    SUPPORT.map((f) => copyFile(join(runtimeDir, f), join(dir, f))),
  );
  return harness;
}

/**
 * Wraps a command in sandbox-exec when a profile is given.
 *
 * The JDK path must be absolute: /usr/bin/java is a stub that resolves the
 * real runtime through a helper the sandbox denies, so the wrapped command
 * fails with a misleading "Unable to locate a Java Runtime".
 */
function sandboxed(
  cmd: string,
  args: string[],
  profile: string | undefined,
  work: string,
): { cmd: string; args: string[] } {
  if (profile === undefined) return { cmd, args };
  return {
    cmd: "/usr/bin/sandbox-exec",
    args: ["-f", profile, "-D", `WORK=${work}`, cmd, ...args],
  };
}

function javaArgs(problem: Problem, mainClass: string, runId: string): string[] {
  const heap = DEFAULT_HEAP_MB;
  return [
    // Tags this JVM with the run that owns it. Shows up in `ps`, which makes a
    // leaked process traceable to its run — and lets the process-group-kill
    // test identify its own JVMs instead of counting every java on the machine
    // (that version failed whenever anything else ran Java concurrently).
    `-Djavatutor.run=${runId}`,
    `-Xmx${heap}m`,
    // Sizes threads the learner's own code spawns. The runner's own stack is
    // set explicitly in the generated harness; see harness-codegen.ts.
    `-Xss${problem.stackMb ?? DEFAULT_STACK_MB}m`,
    // SerialGC skips G1's region setup, worth ~15-25ms on a small heap.
    "-XX:+UseSerialGC",
    "-XX:-UsePerfData",
    "-Dfile.encoding=UTF-8",
    // Blocks java.net.http, java.sql and java.desktop. NOT a security
    // boundary: Socket and ProcessBuilder both live in java.base. It is free,
    // so it is worth having, but do not mistake it for isolation.
    "--limit-modules",
    "java.base",
    "-cp",
    ".",
    mainClass,
  ];
}

/** Compares stdout token-wise, so trailing whitespace never fails a case. */
function stdoutMatches(actual: string, want: string, epsilon?: number): boolean {
  const a = actual.trim().split(/\s+/).filter(Boolean);
  const b = want.trim().split(/\s+/).filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((tok, i) => {
    const other = b[i]!;
    if (tok === other) return true;
    if (epsilon === undefined) return false;
    const x = Number(tok);
    const y = Number(other);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= epsilon * Math.max(1, Math.abs(y));
  });
}

async function runStdioCases(
  dir: string,
  problem: StdioProblem,
  indices: number[],
  contentDir: string,
  javaBin: string,
  sandboxProfile: string | undefined,
  runId: string,
): Promise<{ caseResults: CaseResult[]; logs: string[]; runtimeMs: number }> {
  const caseResults: CaseResult[] = [];
  const logs: string[] = [];
  let runtimeMs = 0;

  for (const i of indices) {
    const tc = problem.testCases[i]!;
    const stdin =
      tc.stdin ?? (await readFile(join(contentDir, tc.stdinFile!), "utf8"));
    const want =
      tc.stdout ?? (await readFile(join(contentDir, tc.stdoutFile!), "utf8"));
    const limit = tc.timeLimitMs ?? problem.timeLimitMs ?? DEFAULT_TIMEOUT_MS;

    const j = sandboxed(javaBin, javaArgs(problem, "Main", runId), sandboxProfile, dir);
    const res = await runProcess(j.cmd, j.args, {
      cwd: dir,
      timeoutMs: limit,
      stdin,
    });
    runtimeMs += res.ms;

    const passed = !res.timedOut && res.code === 0 && stdoutMatches(res.stdout, want, problem.comparison?.mode === "approx" ? problem.comparison.epsilon : undefined);

    caseResults.push({
      index: i,
      passed,
      hidden: tc.hidden ?? false,
      ...(tc.description !== undefined ? { description: tc.description } : {}),
      actual: res.stdout.trim(),
      expected: want.trim(),
      input: stdin.length > 200 ? `${stdin.slice(0, 200)}… (${stdin.length} bytes)` : stdin,
      ...(res.timedOut
        ? { error: `exceeded the ${limit} ms time limit` }
        : res.stderr.trim() !== ""
          ? { error: res.stderr.trim().slice(0, 4000) }
          : {}),
      durationMs: res.ms,
      ...(res.timedOut ? { timedOut: true } : {}),
    });
  }
  return { caseResults, logs, runtimeMs };
}

export async function runProblem(
  problem: Problem,
  userCode: string,
  opts: RunOptions,
): Promise<RunResult> {
  const jdk = await findJdk();
  if (!jdk) {
    return {
      phase: "run",
      diagnostics: [],
      caseResults: [],
      consoleLogs: [],
      error:
        "No JDK found. Java Tutor uses the JDK already on your Mac and does not bundle one. " +
        "Install one with `brew install openjdk`, then symlink it so macOS can see it:\n" +
        "  sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk\n" +
        "Homebrew's openjdk is keg-only, so /usr/libexec/java_home cannot find it without that second step.",
      compileMs: 0,
      runtimeMs: 0,
    };
  }

  const runtimeDir = opts.runtimeDir ?? RUNTIME_DIR;
  const missing = SUPPORT.filter((f) => !existsSync(join(runtimeDir, f)));
  if (missing.length > 0) {
    return {
      phase: "run",
      diagnostics: [],
      caseResults: [],
      consoleLogs: [],
      error:
        `The Java support library is missing (${missing.join(", ")}). Looked in ` +
        `${runtimeDir}. This is a packaging problem, not a problem with your code.`,
      compileMs: 0,
      runtimeMs: 0,
    };
  }

  await mkdir(opts.workRoot, { recursive: true });
  const dir = await mkdtemp(join(opts.workRoot, "run-"));
  const runId = dir.slice(dir.lastIndexOf("run-"));
  let keep = false;

  try {
    const visibleOnly = opts.visibleOnly ?? false;
    const harness = await writeSources(
      dir,
      problem,
      userCode,
      visibleOnly,
      runtimeDir,
    );

    const compile = await runProcess(
      join(jdk.home, "bin", "javac"),
      ["-encoding", "UTF-8", "-nowarn", "-d", ".", ...SUPPORT, harness.userFileName,
        ...(harness.mainSource !== null ? ["Main.java"] : [])],
      { cwd: dir, timeoutMs: 30_000 },
    );

    if (compile.code !== 0) {
      const diagnostics = parseJavacOutput(compile.stderr).filter(
        // Diagnostics in the support library or the generated harness are our
        // bug, not the learner's — surfacing them as editor markers would
        // point at a file they cannot see.
        (d: Diagnostic) => d.file === harness.userFileName,
      );
      const residual = residualOutput(compile.stderr, diagnostics);
      keep = opts.keepOnFailure ?? false;
      return {
        phase: "compile",
        diagnostics,
        caseResults: [],
        consoleLogs: [],
        ...(diagnostics.length === 0
          ? { error: residual || "Compilation failed but javac reported nothing parseable." }
          : {}),
        compileMs: compile.ms,
        runtimeMs: 0,
      };
    }

    if (problem.kind === "stdio") {
      const contentDir =
        opts.dataDir ?? fileURLToPath(new URL("../../../content/data/", import.meta.url));
      const { caseResults, logs, runtimeMs } = await runStdioCases(
        dir,
        problem,
        harness.caseIndices,
        contentDir,
        join(jdk.home, "bin", "java"),
        opts.sandboxProfile,
        runId,
      );
      return {
        phase: "ok",
        diagnostics: [],
        caseResults,
        consoleLogs: logs,
        compileMs: compile.ms,
        runtimeMs,
      };
    }

    const timeout = problem.timeLimitMs ?? DEFAULT_TIMEOUT_MS;
    const jv = sandboxed(
      join(jdk.home, "bin", "java"),
      javaArgs(problem, "Main", runId),
      opts.sandboxProfile,
      dir,
    );
    const run = await runProcess(jv.cmd, jv.args, { cwd: dir, timeoutMs: timeout });

    const { cases, logs } = parseRunStream(run.stdout);
    const byIndex = new Map(cases.map((c) => [c.index, c]));

    const caseResults: CaseResult[] = harness.caseIndices.map((i) => {
      const tc = problem.testCases[i]!;
      const raw = byIndex.get(i);
      const input = renderInput(problem, i);
      if (!raw) {
        // No result means the JVM died before reaching this case — the timeout
        // or a hard crash. Cases before it still reported, which is the point
        // of flushing per case.
        return {
          index: i,
          passed: false,
          hidden: tc.hidden ?? false,
          ...(tc.description !== undefined ? { description: tc.description } : {}),
          ...(input !== undefined ? { input } : {}),
          error: run.timedOut
            ? `did not finish — the run exceeded ${timeout} ms`
            : "did not run",
          durationMs: 0,
          ...(run.timedOut ? { timedOut: true } : {}),
        };
      }
      return {
        index: i,
        passed: raw.passed,
        hidden: tc.hidden ?? false,
        ...(tc.description !== undefined ? { description: tc.description } : {}),
        ...(input !== undefined ? { input } : {}),
        ...(raw.actual !== null ? { actual: raw.actual } : {}),
        ...(raw.expected !== null ? { expected: raw.expected } : {}),
        ...(raw.error !== null ? { error: raw.error } : {}),
        durationMs: raw.durationMs,
      };
    });

    const stderrText = run.stderr.trim();
    keep = (opts.keepOnFailure ?? false) && caseResults.some((c) => !c.passed);

    return {
      phase: "ok",
      diagnostics: [],
      caseResults,
      consoleLogs: logs,
      ...(run.timedOut
        ? { error: `Execution exceeded ${timeout} ms and was stopped.` }
        : run.truncated
          ? { error: "Stopped after 4 MB of output — is something printing in a loop?" }
          : stderrText !== ""
            ? { error: stderrText.slice(0, 4000) }
            : {}),
      compileMs: compile.ms,
      runtimeMs: run.ms,
    };
  } finally {
    if (!keep) await rm(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------- standalone source

export type SnippetResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
  compileMs: number;
  runtimeMs: number;
  timedOut: boolean;
};

/**
 * Compiles and runs one self-contained Java file with a `main`.
 *
 * Built for the concept pages, where every example claims to print something
 * specific. A claim in prose is a claim; a claim the build checks is a fact,
 * and `npm run validate:all` fails if a concept page's example stops printing
 * what the page says it prints. That is the same discipline the authoring
 * pipeline applies to problems, applied to the teaching material.
 *
 * Shares the process-group kill, the timeout, the heap and stack caps and the
 * sandbox wrapper with `runProblem` — a second, weaker way to start a JVM is
 * exactly how one of them ends up leaking processes.
 */
export async function runJavaSource(
  source: string,
  opts: {
    workRoot: string;
    /** Must match the public class in `source`. */
    className?: string;
    timeoutMs?: number;
    stdin?: string;
    sandboxProfile?: string;
  },
): Promise<SnippetResult> {
  const jdk = await findJdk();
  const empty = { stdout: "", stderr: "", diagnostics: [], compileMs: 0, runtimeMs: 0, timedOut: false };
  if (!jdk) {
    return { ...empty, ok: false, stderr: "No JDK found." };
  }

  const className = opts.className ?? "Main";
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await mkdir(opts.workRoot, { recursive: true });
  const dir = await mkdtemp(join(opts.workRoot, "snip-"));
  const runId = dir.slice(dir.lastIndexOf("snip-"));

  try {
    const file = `${className}.java`;
    await writeFile(join(dir, file), source, "utf8");

    const compile = await runProcess(
      join(jdk.home, "bin", "javac"),
      ["-encoding", "UTF-8", "-nowarn", "-d", ".", file],
      { cwd: dir, timeoutMs: 30_000 },
    );
    if (compile.code !== 0) {
      const diagnostics = parseJavacOutput(compile.stderr).filter((d) => d.file === file);
      return {
        ok: false,
        stdout: "",
        stderr: diagnostics.length === 0 ? residualOutput(compile.stderr, diagnostics) : "",
        diagnostics,
        compileMs: compile.ms,
        runtimeMs: 0,
        timedOut: false,
      };
    }

    const args = [
      `-Djavatutor.run=${runId}`,
      `-Xmx${DEFAULT_HEAP_MB}m`,
      `-Xss${DEFAULT_STACK_MB}m`,
      "-XX:+UseSerialGC",
      "-XX:-UsePerfData",
      "-Dfile.encoding=UTF-8",
      "--limit-modules",
      "java.base",
      "-cp",
      ".",
      className,
    ];
    const jv = sandboxed(join(jdk.home, "bin", "java"), args, opts.sandboxProfile, dir);
    const run = await runProcess(jv.cmd, jv.args, {
      cwd: dir,
      timeoutMs: timeout,
      ...(opts.stdin !== undefined ? { stdin: opts.stdin } : {}),
    });

    return {
      ok: !run.timedOut && run.code === 0,
      stdout: run.stdout,
      stderr: run.stderr.trim().slice(0, 4000),
      diagnostics: [],
      compileMs: compile.ms,
      runtimeMs: run.ms,
      timedOut: run.timedOut,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
