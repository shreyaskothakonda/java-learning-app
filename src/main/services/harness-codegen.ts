/**
 * Generates the `Main.java` that drives one problem's test cases.
 *
 * Two rules shape everything here:
 *
 *  1. The learner's code is written to its own file, VERBATIM. Injecting even
 *     one line would shift every javac line number, which would put Monaco's
 *     markers on the wrong row and make the AI error-explainer quote the wrong
 *     line. The harness is a separate compilation unit for exactly that reason.
 *  2. Each case is its own method. javac caps a method's bytecode at 64KB, and
 *     inlining a few hundred cases with array literals reaches that.
 */

import { TYPES } from "../../../content/java-types.js";
import type {
  ClassProblem,
  Comparison,
  JavaType,
  JsonValue,
  MethodProblem,
  Problem,
} from "../../../content/types.js";

const DEFAULT_STACK_MB = 64;

export type Harness = {
  /** File the learner's code goes in; must match any `public class` they write. */
  userFileName: string;
  /** null for stdio problems, where the learner writes `main` themselves. */
  mainSource: string | null;
  /** Indices into problem.testCases, in the order the harness runs them. */
  caseIndices: number[];
};

function indent(src: string, by = 8): string {
  const pad = " ".repeat(by);
  return src
    .split("\n")
    .map((l) => (l.trim() === "" ? l : pad + l))
    .join("\n");
}

/** The boolean expression that decides whether a case passed. */
function passExpr(cmp: Comparison | undefined): string {
  switch (cmp?.mode) {
    case "approx":
      return `Judge.approx(actual, exp, ${cmp.epsilon})`;
    case "unordered":
      return "Judge.unordered(actual, exp)";
    case "unorderedNested":
      return "Judge.unorderedNested(actual, exp)";
    case "anyOf":
      return "Judge.anyOf(actual, (Object[]) exp)";
    case "custom":
      return "check(a, actual, exp)";
    default:
      return "Judge.eq(actual, exp)";
  }
}

function emitExpected(p: MethodProblem, expected: JsonValue): string {
  const cmp = p.comparison;
  if (cmp?.mode === "anyOf") {
    const alts = (expected as JsonValue[]).map((alt) =>
      TYPES[p.signature.returns].emitLiteral(alt),
    );
    return `new Object[]{${alts.join(", ")}}`;
  }
  const type: JavaType =
    cmp?.mode === "custom" ? (cmp.expectedType ?? p.signature.returns) : p.signature.returns;
  return TYPES[type].emitLiteral(expected);
}

function methodCase(p: MethodProblem, caseIndex: number, slot: number): string {
  const tc = p.testCases[caseIndex]!;
  const sig = p.signature;

  // Arguments are materialised into locals FIRST, then captured into `a`, so a
  // custom checker inspecting `a` after the call sees the same objects the
  // method mutated. That is what makes in-place problems verifiable at all.
  const argDecls = sig.params.map(
    (param, i) => `${TYPES[param.type].java} p${i} = ${TYPES[param.type].emitLiteral(tc.input[i]!)};`,
  );
  const argNames = sig.params.map((_, i) => `p${i}`);
  const call = `sol.${sig.method}(${argNames.join(", ")})`;
  const invoke =
    sig.returns === "void"
      ? `${call};\n            actual = null;`
      : `actual = ${call};`;

  return `    static void case${slot}() {
        Object actual = null;
        Object exp = null;
        Object[] a = new Object[0];
        String err = null;
        boolean passed = false;
        long dt = 0;
        try {
${indent(argDecls.join("\n"), 12)}
            a = new Object[]{${argNames.join(", ")}};
            exp = ${emitExpected(p, tc.expected)};
            Solution sol = new Solution();
            long t0 = System.nanoTime();
            ${invoke}
            dt = System.nanoTime() - t0;
            passed = ${passExpr(p.comparison)};
        } catch (Throwable e) {
            err = Judge.trim(e);
        }
        Judge.emit(${caseIndex}, passed, Judge.render(actual), Judge.render(exp), err, dt);
    }`;
}

function classCase(p: ClassProblem, caseIndex: number, slot: number): string {
  const tc = p.testCases[caseIndex]!;
  const cs = p.classSpec;
  const byName = new Map(cs.methods.map((m) => [m.name, m]));

  const stmts: string[] = [];
  const expectedParts: string[] = [];

  tc.ops.forEach((op, j) => {
    const [name, ...args] = op;
    if (j === 0) {
      const lits = cs.ctor.map((param, i) => TYPES[param.type].emitLiteral(args[i]!));
      stmts.push(`obj = new ${cs.className}(${lits.join(", ")});`);
      stmts.push("res.add(null);");
      expectedParts.push("null");
      return;
    }
    const m = byName.get(name)!;
    const lits = m.params.map((param, i) => TYPES[param.type].emitLiteral(args[i]!));
    const invocation = `obj.${name}(${lits.join(", ")})`;
    if (m.returns === "void") {
      stmts.push(`${invocation};`);
      stmts.push("res.add(null);");
      expectedParts.push("null");
    } else {
      stmts.push(`res.add(${invocation});`);
      expectedParts.push(TYPES[m.returns].emitLiteral(tc.expected[j] ?? null));
    }
  });

  // The explicit `new Object[]{...}` form rather than plain varargs: a lone
  // `null` argument would otherwise be read as the varargs array itself.
  return `    static void case${slot}() {
        Object actual = null;
        Object exp = null;
        String err = null;
        boolean passed = false;
        long dt = 0;
        List<Object> res = new ArrayList<>();
        ${cs.className} obj = null;
        try {
            exp = Judge.<Object>list(new Object[]{${expectedParts.join(", ")}});
            long t0 = System.nanoTime();
${indent(stmts.join("\n"), 12)}
            dt = System.nanoTime() - t0;
            actual = res;
            passed = ${passExpr(p.comparison)};
        } catch (Throwable e) {
            err = Judge.trim(e);
            actual = res;
        }
        Judge.emit(${caseIndex}, passed, Judge.render(actual), Judge.render(exp), err, dt);
    }`;
}

/**
 * Builds the harness for a problem.
 *
 * `visibleOnly` is Run; the full set is Submit.
 */
export function buildHarness(p: Problem, visibleOnly: boolean): Harness {
  const caseIndices = p.testCases
    .map((tc, i) => ({ tc, i }))
    .filter(({ tc }) => !visibleOnly || !tc.hidden)
    .map(({ i }) => i);

  if (p.kind === "stdio") {
    // The learner writes `main` themselves; stdin and stdout are the protocol.
    return { userFileName: "Main.java", mainSource: null, caseIndices };
  }

  const userFileName = p.kind === "class" ? `${p.classSpec.className}.java` : "Solution.java";
  const bodies = caseIndices.map((caseIndex, slot) =>
    p.kind === "method" ? methodCase(p, caseIndex, slot) : classCase(p, caseIndex, slot),
  );
  const calls = caseIndices.map((_, slot) => `        case${slot}();`).join("\n");

  const checker =
    p.comparison?.mode === "custom"
      ? `
    static boolean check(Object[] args, Object actual, Object expected) {
${indent(p.comparison.javaChecker, 8)}
    }
`
      : "";

  const stackBytes = (p.stackMb ?? DEFAULT_STACK_MB) * 1024 * 1024;

  const mainSource = `import java.util.*;

/** Generated harness — do not edit. */
public class Main {
    public static void main(String[] args) throws Exception {
        // The learner's method runs on a thread with an explicit stack size.
        //
        // Measured on JDK 26 / macOS arm64: -Xss alone IS honoured on the
        // primordial thread, so this is not the load-bearing mechanism the
        // way folklore suggests. It is kept because it is the one that does
        // not depend on a JVM flag being honoured, and because the two cover
        // different ground — -Xss also sizes any thread the learner spawns
        // themselves, while this guarantees the runner's own stack.
        Thread t = new Thread(null, Main::runAll, "runner", ${stackBytes}L);
        t.start();
        t.join();
    }

    static void runAll() {
${calls}
    }
${checker}
${bodies.join("\n\n")}
}
`;

  return { userFileName, mainSource, caseIndices };
}

/** Renders a case's inputs for display, without needing the JVM. */
export function renderInput(p: Problem, caseIndex: number): string | undefined {
  if (p.kind === "method") {
    const tc = p.testCases[caseIndex]!;
    return p.signature.params
      .map((param, i) => `${param.name} = ${TYPES[param.type].render(tc.input[i]!)}`)
      .join(", ");
  }
  if (p.kind === "class") {
    const tc = p.testCases[caseIndex]!;
    return tc.ops.map((op) => `${op[0]}(${op.slice(1).map((a) => JSON.stringify(a)).join(", ")})`).join(" ");
  }
  return undefined;
}
