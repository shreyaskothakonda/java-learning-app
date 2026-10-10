/**
 * The one dependency the app cannot supply for itself.
 *
 * The plan's decision for v1 was to use the system JDK rather than bundling
 * one with jlink — bundling triples the download and complicates notarisation
 * for a user base of one. The cost of that decision is this banner: if there
 * is no JDK, nothing in the app works, and the failure has to be legible
 * BEFORE the first Run rather than as a line in the results rail after it.
 *
 * So it says what is missing, what to type, and why the second command is
 * needed — `brew install openjdk` alone leaves a keg-only install that
 * /usr/libexec/java_home cannot see, which is exactly the sort of half-working
 * state that makes someone give up.
 */

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { DUR, EASE, dur } from "../design/motion.js";

export function JdkBanner(): React.JSX.Element | null {
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.api.system.info().then((info) => setMissing(info.javaVersion === null));
  }, []);

  useEffect(() => {
    if (!missing || !bar.current) return;
    gsap.fromTo(
      bar.current,
      { height: 0, opacity: 0 },
      { height: "auto", opacity: 1, duration: dur(DUR.base), ease: EASE.out },
    );
  }, [missing]);

  if (!missing) return null;

  const fix = "brew install openjdk && sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk";

  return (
    <div
      ref={bar}
      role="status"
      style={{
        flex: "none",
        background: "var(--accent-tint)",
        borderBottom: "var(--rule-w) solid var(--accent)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          No JDK found — nothing can compile or run
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-muted)" }}>
          Java Tutor uses the JDK already on your Mac and does not bundle one.{" "}
          <span className="mono" style={{ color: "var(--ink)" }}>
            /usr/libexec/java_home
          </span>{" "}
          found nothing. Install one, then symlink it so macOS can see it — Homebrew's
          openjdk is keg-only, so the first command alone is not enough.
        </div>
      </div>
      <button
        className="btn"
        style={{ marginLeft: "auto", flex: "none" }}
        onClick={() => {
          void navigator.clipboard.writeText(fix).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Copied" : "Copy the fix"}
      </button>
    </div>
  );
}
