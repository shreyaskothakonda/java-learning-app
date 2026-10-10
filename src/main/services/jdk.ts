import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Jdk = { home: string; version: string };

let cached: Jdk | null | undefined;

/**
 * Locates a JDK via macOS's own resolver.
 *
 * We deliberately do not read JAVA_HOME first: it is frequently stale or
 * points at a JRE without `javac`, and a missing compiler surfaces much later
 * as a confusing runner failure. `java_home` returns only real JDKs.
 */
export async function findJdk(): Promise<Jdk | null> {
  if (cached !== undefined) return cached;
  // A test seam, and the only way to exercise the no-JDK path on a machine
  // that has one. "Install one, then symlink it" is the first thing a new user
  // may have to do, so the message they get had better be the one that was
  // written — and until this existed, nothing had ever run that branch.
  if (process.env["JAVATUTOR_NO_JDK"] === "1") {
    cached = null;
    return cached;
  }
  try {
    const { stdout: home } = await run("/usr/libexec/java_home", [], { timeout: 5000 });
    const trimmed = home.trim();
    const { stderr, stdout } = await run(`${trimmed}/bin/javac`, ["-version"], { timeout: 5000 });
    // javac prints to stdout on modern JDKs, stderr on older ones.
    const version = (stdout || stderr).trim().replace(/^javac\s+/, "");
    cached = { home: trimmed, version };
  } catch {
    cached = null;
  }
  return cached;
}
