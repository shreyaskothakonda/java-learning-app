/**
 * The content model.
 *
 * The single most important property here: test-case values are stored as
 * JSON, never as live values, and every value is paired with a `JavaType` that
 * says how to turn it into Java source and how to compare it. Equality itself
 * is NOT decided in TypeScript — see `runtime/java/Judge.java`. After a JSON
 * round-trip you cannot tell `int` from `long` from `double`, and `1.0 === 1`
 * in JavaScript, so comparing here would produce false passes.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Track = "java-fundamentals" | "dsa" | "cp";
export type Difficulty = "easy" | "medium" | "hard";
export type ProblemKind = "method" | "stdio" | "class";

/**
 * A closed union, deliberately — not a free-form string.
 *
 * Every type needs exactly three things: a Java-literal emitter, a comparator,
 * and a renderer. A free-form string lets the authoring pipeline emit a type
 * nobody implemented, and the failure shows up as a problem that can never
 * pass. A closed union makes adding `Deque<Integer>` a deliberate change that
 * TypeScript's exhaustiveness checking will fail the build over if incomplete.
 */
export type JavaType =
  | "void"
  | "int"
  | "long"
  | "double"
  | "boolean"
  | "char"
  | "String"
  | "Integer" // nullable int
  | "int[]"
  | "long[]"
  | "double[]"
  | "boolean[]"
  | "char[]"
  | "String[]"
  | "int[][]"
  | "char[][]"
  | "String[][]"
  | "List<Integer>"
  | "List<String>"
  | "List<List<Integer>>"
  | "List<List<String>>"
  | "Map<String,Integer>"
  | "Map<Integer,Integer>"
  | "TreeNode"
  | "ListNode";

/** Which comparator in Judge.java decides equality for a value of this type. */
export type JudgeKind =
  | "prim"
  | "fp"
  | "deepArray"
  | "collection"
  | "map"
  | "tree"
  | "linkedList";

export interface TypeSpec {
  /** The type as written in Java source. */
  readonly java: string;
  readonly judge: JudgeKind;
  /** True for types that accept `null`. Primitives do not. */
  readonly nullable: boolean;
  /** JSON value -> Java source literal. `"int[]"` + `[1,2]` -> `new int[]{1, 2}` */
  emitLiteral(v: JsonValue): string;
  /** Human-facing rendering for prompts and result panes. */
  render(v: JsonValue): string;
  /** Static validation of an authored value. Returns problems, empty when fine. */
  validate(v: JsonValue): string[];
}

export type Param = { name: string; type: JavaType };

/** The signature a `method` problem asks the learner to implement. */
export type Signature = {
  className: "Solution";
  method: string;
  params: Param[];
  returns: JavaType;
};

/** The class a `class` problem asks the learner to implement. */
export type ClassSpec = {
  className: string;
  ctor: Param[];
  methods: { name: string; params: Param[]; returns: JavaType }[];
};

/**
 * How a case's actual value is compared to its expected value.
 *
 * Roughly 10-15% of DSA problems have no single correct answer, so this is
 * per-problem rather than per-type. `custom` is the one escape hatch — two
 * escape hatches would mean the authoring pipeline could pick the wrong one.
 */
export type Comparison =
  | { mode: "exact" }
  | { mode: "approx"; epsilon: number }
  /** Multiset equality — order does not matter. */
  | { mode: "unordered" }
  /** Multiset equality at both levels, e.g. group-anagrams, subsets. */
  | { mode: "unorderedNested" }
  /** `expected` is a list of acceptable answers; matching any one passes. */
  | { mode: "anyOf" }
  /**
   * The BODY of:
   *   static boolean check(Object[] args, Object actual, Object expected)
   *
   * `args` is the argument array AFTER the call, which is what makes in-place
   * mutation problems expressible. Injected into the generated harness.
   *
   * `expectedType` overrides the type `expected` is emitted and validated as.
   * In-place mutation problems need it: `removeDuplicates` returns an `int`,
   * but what you want to state as the expected answer is the `int[]` prefix.
   * Without the override the only options are validating `expected` against
   * the wrong type or not validating it at all — and custom is 10-15% of DSA
   * problems, too many to leave unchecked.
   */
  | { mode: "custom"; javaChecker: string; expectedType?: JavaType };

export type Resource = { label: string; url: string };
export type Example = { input: string; output: string; note?: string };

/** A `method` case: arguments in, value out. */
export type MethodCase = {
  input: JsonValue[];
  expected: JsonValue;
  hidden?: boolean;
  description?: string;
};

/** A `stdio` case: CP-style, piped stdin compared against stdout. */
export type StdioCase = {
  stdin?: string;
  stdout?: string;
  /** Sibling data files, for inputs too large to inline. */
  stdinFile?: string;
  stdoutFile?: string;
  timeLimitMs?: number;
  hidden?: boolean;
  description?: string;
};

/**
 * A `class` case: a sequence of operations against one instance.
 * ops[0] is always the constructor.
 *   ops:      [["LRUCache", 2], ["put", 1, 1], ["get", 1]]
 *   expected: [null, null, 1]
 */
export type ClassCase = {
  ops: [string, ...JsonValue[]][];
  expected: JsonValue[];
  hidden?: boolean;
  description?: string;
};

type Common = {
  id: string;
  track: Track;
  topic: string;
  difficulty: Difficulty;
  title: string;
  prompt: string;
  starterCode: string;
  solution: string;
  /**
   * Exactly four static hints, L1 Orient -> L4 Walk. These are the floor the
   * AI tutor falls back to, so the app is fully usable with no provider
   * configured. There is deliberately no L5: revealing the solution is a
   * plain button, not something we ask a model to withhold.
   */
  hints: [string, string, string, string];
  examples?: Example[];
  pitfalls?: string[];
  explanation?: string;
  complexity?: { time: string; space: string };
  resources?: Resource[];
  /** Pedagogy, not security: keeps a "learn for loops" problem honest. */
  allowedApis?: string[];
  bannedApis?: string[];
  timeLimitMs?: number;
  stackMb?: number;
};

export type MethodProblem = Common & {
  kind: "method";
  signature: Signature;
  testCases: MethodCase[];
  comparison?: Comparison;
};

export type StdioProblem = Common & {
  kind: "stdio";
  testCases: StdioCase[];
  /** Only `exact` (token-wise) and `approx` are meaningful for stdout. */
  comparison?: Extract<Comparison, { mode: "exact" } | { mode: "approx"; epsilon: number }>;
};

export type ClassProblem = Common & {
  kind: "class";
  classSpec: ClassSpec;
  testCases: ClassCase[];
  comparison?: Comparison;
};

export type Problem = MethodProblem | StdioProblem | ClassProblem;

/** Caps enforced by the validator; see content/validate.ts for the rationale. */
export const LIMITS = {
  /** javac's 64KB method bytecode limit is the real constraint. */
  maxLiteralElements: 512,
  maxLiteralJsonBytes: 8 * 1024,
  minVisibleCases: 2,
  minHiddenCases: 2,
  /** Java `long` range. */
  longMin: -(2n ** 63n),
  longMax: 2n ** 63n - 1n,
  intMin: -(2 ** 31),
  intMax: 2 ** 31 - 1,
} as const;
