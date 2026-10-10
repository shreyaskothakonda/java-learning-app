/**
 * Where the app's on-disk resources live.
 *
 * One function, one branch, and every caller goes through it. That is a direct
 * response to the Phase 2 bug: `runtimeDir` was derived from `import.meta.url`,
 * the depth from the module to the project root differs between the source tree
 * (`src/main/services/`) and the bundle (`out/main/index.js`), and the result
 * silently resolved to a directory outside the project once built. Every test
 * passed the whole time, because the tests run from source.
 *
 * Packaging adds a third layout, so the fix is to stop deriving it at all. The
 * builder is configured (electron-builder.yml, `extraResources`) so that the
 * layout BELOW the root is identical in both cases —
 *
 *   dev        <repo>/runtime/java, <repo>/content/data
 *   packaged   MyApp.app/Contents/Resources/runtime/java, .../content/data
 *
 * — which is why only the root needs a branch. Anything that adds a resource
 * must add it to `extraResources` as well, and `verifyResources` is what says
 * so out loud instead of failing later inside javac.
 */

import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Files that must exist for a run to be possible at all. */
const REQUIRED = [
  join("runtime", "java", "Judge.java"),
  join("runtime", "java", "TreeNode.java"),
  join("runtime", "java", "ListNode.java"),
  join("runtime", "sandbox.sb"),
];

export function resourceRoot(): string {
  // process.resourcesPath is Contents/Resources; app.getAppPath() there would
  // be the asar, which javac cannot read from.
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

export function runtimeDir(): string {
  return join(resourceRoot(), "runtime", "java");
}

export function dataDir(): string {
  return join(resourceRoot(), "content", "data");
}

/**
 * The seatbelt profile, or undefined when it is not to be used.
 *
 * ON in a packaged build, off in development, and the reasoning is not
 * "packaged means safer to be strict" — it is that the two builds face
 * different code. In development the only Java that runs is mine and the
 * corpus's. A packaged app runs whatever a learner types or pastes into the
 * editor, and "paste this solution from the forum and run it" is a normal
 * thing for someone learning to do.
 *
 * What it actually buys: a pasted `Files.walk(Paths.get("/"))` cannot delete
 * anything outside the run directory, and nothing that runs can open a socket.
 * What it does not: it is not protection from the user, who owns the machine
 * and can run javac themselves. It is protection from what they were told to
 * paste.
 */
export function sandboxProfile(): string | undefined {
  if (!app.isPackaged) return undefined;
  const profile = join(resourceRoot(), "runtime", "sandbox.sb");
  // A missing profile must not silently mean "no sandbox". Better to run
  // unsandboxed and say so than to believe in a boundary that is not there.
  if (!existsSync(profile)) {
    console.warn(`[paths] seatbelt profile missing at ${profile} — running WITHOUT a sandbox`);
    return undefined;
  }
  return profile;
}

/** Absent resources, relative to the root. Empty when the package is intact. */
export function missingResources(): string[] {
  const root = resourceRoot();
  return REQUIRED.filter((rel) => !existsSync(join(root, rel)));
}

export function describePaths(): string {
  return [
    `packaged=${app.isPackaged}`,
    `root=${resourceRoot()}`,
    `runtime=${runtimeDir()}`,
    `data=${dataDir()}`,
    `sandbox=${sandboxProfile() ?? "off"}`,
  ].join("\n         ");
}
