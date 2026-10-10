/**
 * Plain-English explanation of a compiler error.
 *
 * javac's own message is shown first and immediately — it is precise, and a
 * learner has to become fluent in it eventually. This arrives underneath as a
 * translation, never as a replacement.
 *
 * Cached on the normalised diagnostic, so the second time someone forgets a
 * semicolon the explanation is instant rather than a six-second wait. That
 * matters more here than anywhere else in the app: beginners hit the same
 * handful of errors over and over.
 */

import { useEffect, useRef, useState } from "react";
import type { Diagnostic } from "@shared/types/runner.js";
import { rise } from "../design/motion.js";

type Props = { problemId: string; diagnostic: Diagnostic; userCode: string };

/** A few lines around the error — never the whole file. */
function excerpt(code: string, line: number, span = 2): string {
  const lines = code.split("\n");
  const from = Math.max(0, line - 1 - span);
  const to = Math.min(lines.length, line + span);
  return lines
    .slice(from, to)
    .map((l, i) => `${String(from + i + 1).padStart(3)} | ${l}`)
    .join("\n");
}

export function ErrorExplainer({ problemId, diagnostic, userCode }: Props): React.JSX.Element | null {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const token = useRef(0);

  useEffect(() => {
    const mine = ++token.current;
    setText(null);
    setLoading(true);
    void window.api.ai
      .explain({
        problemId,
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.detail !== undefined ? { detail: diagnostic.detail } : {}),
        line: diagnostic.line,
        excerpt: excerpt(userCode, diagnostic.line),
      })
      .then((r) => {
        if (token.current !== mine) return;
        setText(r.text === "" ? null : r.text);
        setCached(r.cached);
        setLoading(false);
      })
      .catch(() => {
        if (token.current === mine) setLoading(false);
      });
  }, [problemId, diagnostic.code, diagnostic.line, diagnostic.message, diagnostic.detail, userCode]);

  useEffect(() => {
    if (text && box.current) rise(box.current, { y: 6 });
  }, [text]);

  if (!loading && text === null) return null;

  return (
    <div
      ref={box}
      style={{
        borderTop: "1px solid var(--rule-soft)",
        marginTop: 12,
        paddingTop: 12,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        In plain English{cached ? " · cached" : ""}
      </div>
      {loading ? (
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
          asking the coach…
        </div>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{text}</div>
      )}
    </div>
  );
}
