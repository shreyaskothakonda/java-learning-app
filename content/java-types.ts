/**
 * The type registry: JSON value -> Java source literal, plus per-type
 * validation and rendering.
 *
 * `TYPES` is `Record<JavaType, TypeSpec>`, so adding a member to the `JavaType`
 * union without implementing it here is a compile error. That is the whole
 * point of keeping the union closed.
 *
 * Serialization follows LeetCode's conventions on purpose — level-order arrays
 * with `null` holes for trees, plain arrays for linked lists. Every model has
 * seen that encoding tens of thousands of times, so an invented format would
 * cost generation accuracy on every test case the authoring pipeline writes.
 */

import { LIMITS, type JavaType, type JsonValue, type TypeSpec } from "./types.js";

// ---------------------------------------------------------------- primitives

const JAVA_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
  "\0": "\\0",
};

function escapeCommon(ch: string): string | null {
  const mapped = JAVA_ESCAPES[ch];
  if (mapped) return mapped;
  const code = ch.codePointAt(0)!;
  // Escape control chars and anything the compiler might read as a line
  // terminator. Printable non-ASCII is left alone; files are written UTF-8.
  if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
    return `\\u${code.toString(16).padStart(4, "0")}`;
  }
  return null;
}

export function javaString(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else out += escapeCommon(ch) ?? ch;
  }
  return out + '"';
}

export function javaChar(s: string): string {
  const ch = s;
  if (ch === "'") return "'\\''";
  return `'${escapeCommon(ch) ?? ch}'`;
}

/**
 * `String(v) + "d"` is valid for every finite double, including integers and
 * exponent forms: `1d`, `1.5d`, `1e+21d`. Appending `.0` instead would produce
 * `1e+21.0`, which does not compile.
 */
function javaDouble(v: number | string): string {
  if (v === "NaN") return "Double.NaN";
  if (v === "Infinity") return "Double.POSITIVE_INFINITY";
  if (v === "-Infinity") return "Double.NEGATIVE_INFINITY";
  return `${String(v)}d`;
}

function javaLong(v: number | string): string {
  return `${typeof v === "string" ? v : String(v)}L`;
}

// ---------------------------------------------------------------- validation

const isArr = Array.isArray;
const isObj = (v: JsonValue): v is { [k: string]: JsonValue } =>
  typeof v === "object" && v !== null && !isArr(v);

function expected(what: string, v: JsonValue): string[] {
  return [`expected ${what}, got ${JSON.stringify(v) ?? "undefined"}`];
}

function checkInt(v: JsonValue): string[] {
  if (typeof v !== "number" || !Number.isInteger(v)) return expected("an int", v);
  if (v < LIMITS.intMin || v > LIMITS.intMax) return [`int out of range: ${v}`];
  return [];
}

/**
 * `long` is the footgun that corrupts data silently: JSON numbers lose
 * precision past 2^53, so a large value authored as a number is already wrong
 * by the time it reaches us. Numbers are accepted only inside the safe range;
 * anything larger must be authored as a string.
 */
function checkLong(v: JsonValue): string[] {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) return expected("an integer long", v);
    if (!Number.isSafeInteger(v)) {
      return [
        `long ${v} exceeds JSON's safe integer range (2^53) and has already lost ` +
          `precision — author it as a string, e.g. "${v}"`,
      ];
    }
    return [];
  }
  if (typeof v === "string") {
    if (!/^-?\d+$/.test(v)) return [`long string must be digits only, got ${JSON.stringify(v)}`];
    const n = BigInt(v);
    if (n < LIMITS.longMin || n > LIMITS.longMax) return [`long out of range: ${v}`];
    return [];
  }
  return expected("a long (number or digit string)", v);
}

function checkDouble(v: JsonValue): string[] {
  if (typeof v === "number") return Number.isFinite(v) ? [] : expected("a finite double", v);
  if (v === "NaN" || v === "Infinity" || v === "-Infinity") return [];
  return expected('a double (number, or "NaN" / "Infinity" / "-Infinity")', v);
}

/**
 * A Java `char` is one UTF-16 code unit, so `s.length === 1` is exactly the
 * right check — it rejects "" , "ab", and astral characters like an emoji
 * (which is two code units and cannot fit in a char).
 */
function checkChar(v: JsonValue): string[] {
  if (typeof v !== "string") return expected("a 1-character string for char", v);
  if (v.length !== 1) {
    return [
      `char must be exactly one UTF-16 code unit, got ${JSON.stringify(v)} ` +
        `(length ${v.length})`,
    ];
  }
  return [];
}

/** Wraps a checker so `null` is accepted for reference types and only those. */
function nullable(check: (v: JsonValue) => string[]) {
  return (v: JsonValue): string[] => (v === null ? [] : check(v));
}

function eachElement(
  v: JsonValue,
  check: (e: JsonValue) => string[],
  what: string,
): string[] {
  if (!isArr(v)) return expected(what, v);
  return v.flatMap((e, i) => check(e).map((m) => `[${i}] ${m}`));
}

// ------------------------------------------------------------------ emitters

function emitArray(v: JsonValue, javaType: string, emit: (e: JsonValue) => string): string {
  if (v === null) return "null";
  return `new ${javaType}{${(v as JsonValue[]).map(emit).join(", ")}}`;
}

function emitNested(
  v: JsonValue,
  javaType: string,
  emit: (e: JsonValue) => string,
): string {
  if (v === null) return "null";
  const rows = (v as JsonValue[]).map((row) =>
    row === null ? "null" : `{${(row as JsonValue[]).map(emit).join(", ")}}`,
  );
  return `new ${javaType}{${rows.join(", ")}}`;
}

/**
 * Lists always carry an explicit type witness (`Judge.<Integer>list(...)`).
 * Inference would work in most positions but breaks on an empty list or a lone
 * `null` element, and a witness costs nothing in generated code.
 */
function emitList(v: JsonValue, elem: string, emit: (e: JsonValue) => string): string {
  if (v === null) return "null";
  const items = v as JsonValue[];
  // A lone `null` passed to a varargs method is read as the varargs ARRAY, not
  // as one null element: `Judge.<Integer>list(null)` compiles, then throws NPE
  // on `values.length`. A cast forces the single-element reading, and works
  // even for generic element types where `new List<Integer>[]{null}` would be
  // illegal generic array creation.
  if (items.length === 1 && items[0] === null) {
    return `Judge.<${elem}>list((${elem}) null)`;
  }
  return `Judge.<${elem}>list(${items.map(emit).join(", ")})`;
}

function emitMap(
  v: JsonValue,
  keyType: string,
  valType: string,
  emitKey: (k: string) => string,
  emitVal: (e: JsonValue) => string,
): string {
  if (v === null) return "null";
  const entries = Object.entries(v as Record<string, JsonValue>);
  const keys = entries.map(([k]) => emitKey(k)).join(", ");
  const vals = entries.map(([, val]) => emitVal(val)).join(", ");
  return `Judge.<${keyType},${valType}>map(new ${keyType}[]{${keys}}, new ${valType}[]{${vals}})`;
}

// ------------------------------------------------------------------ renderers

function renderJson(v: JsonValue): string {
  return JSON.stringify(v);
}

// ------------------------------------------------------------------- registry

function spec(s: TypeSpec): TypeSpec {
  return s;
}

export const TYPES: Record<JavaType, TypeSpec> = {
  void: spec({
    java: "void",
    judge: "prim",
    nullable: true,
    emitLiteral: () => "null",
    render: () => "void",
    validate: (v) => (v === null ? [] : expected("null for a void return", v)),
  }),

  int: spec({
    java: "int",
    judge: "prim",
    nullable: false,
    emitLiteral: (v) => String(v),
    render: renderJson,
    validate: checkInt,
  }),

  long: spec({
    java: "long",
    judge: "prim",
    nullable: false,
    emitLiteral: (v) => javaLong(v as number | string),
    render: (v) => String(v),
    validate: checkLong,
  }),

  double: spec({
    java: "double",
    judge: "fp",
    nullable: false,
    emitLiteral: (v) => javaDouble(v as number | string),
    render: (v) => String(v),
    validate: checkDouble,
  }),

  boolean: spec({
    java: "boolean",
    judge: "prim",
    nullable: false,
    emitLiteral: (v) => String(v),
    render: renderJson,
    validate: (v) => (typeof v === "boolean" ? [] : expected("a boolean", v)),
  }),

  char: spec({
    java: "char",
    judge: "prim",
    nullable: false,
    emitLiteral: (v) => javaChar(v as string),
    render: (v) => `'${String(v)}'`,
    validate: checkChar,
  }),

  String: spec({
    java: "String",
    judge: "prim",
    nullable: true,
    emitLiteral: (v) => (v === null ? "null" : javaString(v as string)),
    render: renderJson,
    validate: nullable((v) => (typeof v === "string" ? [] : expected("a String", v))),
  }),

  Integer: spec({
    java: "Integer",
    judge: "prim",
    nullable: true,
    emitLiteral: (v) => (v === null ? "null" : String(v)),
    render: renderJson,
    validate: nullable(checkInt),
  }),

  "int[]": spec({
    java: "int[]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitArray(v, "int[]", (e) => String(e)),
    render: renderJson,
    validate: nullable((v) => eachElement(v, checkInt, "an int[]")),
  }),

  "long[]": spec({
    java: "long[]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitArray(v, "long[]", (e) => javaLong(e as number | string)),
    render: renderJson,
    validate: nullable((v) => eachElement(v, checkLong, "a long[]")),
  }),

  "double[]": spec({
    java: "double[]",
    judge: "fp",
    nullable: true,
    emitLiteral: (v) => emitArray(v, "double[]", (e) => javaDouble(e as number | string)),
    render: renderJson,
    validate: nullable((v) => eachElement(v, checkDouble, "a double[]")),
  }),

  "boolean[]": spec({
    java: "boolean[]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitArray(v, "boolean[]", (e) => String(e)),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(v, (e) => (typeof e === "boolean" ? [] : expected("a boolean", e)), "a boolean[]"),
    ),
  }),

  "char[]": spec({
    java: "char[]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitArray(v, "char[]", (e) => javaChar(e as string)),
    render: (v) => (v === null ? "null" : `[${(v as JsonValue[]).map((c) => `'${String(c)}'`).join(", ")}]`),
    validate: nullable((v) => eachElement(v, checkChar, "a char[]")),
  }),

  "String[]": spec({
    java: "String[]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) =>
      emitArray(v, "String[]", (e) => (e === null ? "null" : javaString(e as string))),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(
        v,
        nullable((e) => (typeof e === "string" ? [] : expected("a String", e))),
        "a String[]",
      ),
    ),
  }),

  "int[][]": spec({
    java: "int[][]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitNested(v, "int[][]", (e) => String(e)),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(v, nullable((row) => eachElement(row, checkInt, "an int[]")), "an int[][]"),
    ),
  }),

  "char[][]": spec({
    java: "char[][]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) => emitNested(v, "char[][]", (e) => javaChar(e as string)),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(v, nullable((row) => eachElement(row, checkChar, "a char[]")), "a char[][]"),
    ),
  }),

  "String[][]": spec({
    java: "String[][]",
    judge: "deepArray",
    nullable: true,
    emitLiteral: (v) =>
      emitNested(v, "String[][]", (e) => (e === null ? "null" : javaString(e as string))),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(
        v,
        nullable((row) =>
          eachElement(
            row,
            nullable((e) => (typeof e === "string" ? [] : expected("a String", e))),
            "a String[]",
          ),
        ),
        "a String[][]",
      ),
    ),
  }),

  "List<Integer>": spec({
    java: "List<Integer>",
    judge: "collection",
    nullable: true,
    emitLiteral: (v) => emitList(v, "Integer", (e) => (e === null ? "null" : String(e))),
    render: renderJson,
    validate: nullable((v) => eachElement(v, nullable(checkInt), "a List<Integer>")),
  }),

  "List<String>": spec({
    java: "List<String>",
    judge: "collection",
    nullable: true,
    emitLiteral: (v) => emitList(v, "String", (e) => (e === null ? "null" : javaString(e as string))),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(
        v,
        nullable((e) => (typeof e === "string" ? [] : expected("a String", e))),
        "a List<String>",
      ),
    ),
  }),

  "List<List<Integer>>": spec({
    java: "List<List<Integer>>",
    judge: "collection",
    nullable: true,
    emitLiteral: (v) =>
      emitList(v, "List<Integer>", (row) =>
        emitList(row, "Integer", (e) => (e === null ? "null" : String(e))),
      ),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(
        v,
        nullable((row) => eachElement(row, nullable(checkInt), "a List<Integer>")),
        "a List<List<Integer>>",
      ),
    ),
  }),

  "List<List<String>>": spec({
    java: "List<List<String>>",
    judge: "collection",
    nullable: true,
    emitLiteral: (v) =>
      emitList(v, "List<String>", (row) =>
        emitList(row, "String", (e) => (e === null ? "null" : javaString(e as string))),
      ),
    render: renderJson,
    validate: nullable((v) =>
      eachElement(
        v,
        nullable((row) =>
          eachElement(
            row,
            nullable((e) => (typeof e === "string" ? [] : expected("a String", e))),
            "a List<String>",
          ),
        ),
        "a List<List<String>>",
      ),
    ),
  }),

  "Map<String,Integer>": spec({
    java: "Map<String,Integer>",
    judge: "map",
    nullable: true,
    emitLiteral: (v) =>
      emitMap(v, "String", "Integer", javaString, (e) => (e === null ? "null" : String(e))),
    render: renderJson,
    validate: nullable((v) => {
      if (!isObj(v)) return expected("a Map<String,Integer> object", v);
      return Object.entries(v).flatMap(([k, val]) =>
        nullable(checkInt)(val).map((m) => `key ${JSON.stringify(k)}: ${m}`),
      );
    }),
  }),

  "Map<Integer,Integer>": spec({
    java: "Map<Integer,Integer>",
    judge: "map",
    nullable: true,
    emitLiteral: (v) =>
      emitMap(v, "Integer", "Integer", (k) => k, (e) => (e === null ? "null" : String(e))),
    render: renderJson,
    validate: nullable((v) => {
      if (!isObj(v)) return expected("a Map<Integer,Integer> object", v);
      // JSON object keys are always strings, so integer keys must parse back.
      return Object.entries(v).flatMap(([k, val]) => {
        const keyErrs = /^-?\d+$/.test(k)
          ? checkInt(Number(k)).map((m) => `key ${JSON.stringify(k)}: ${m}`)
          : [`key ${JSON.stringify(k)} is not an integer`];
        return [...keyErrs, ...nullable(checkInt)(val).map((m) => `key ${JSON.stringify(k)}: ${m}`)];
      });
    }),
  }),

  /** Level-order with `null` holes, LeetCode-style: [3,9,20,null,null,15,7]. */
  TreeNode: spec({
    java: "TreeNode",
    judge: "tree",
    nullable: true,
    emitLiteral: (v) =>
      v === null
        ? "null"
        : `Judge.tree(new Integer[]{${(v as JsonValue[])
            .map((e) => (e === null ? "null" : String(e)))
            .join(", ")}})`,
    render: renderJson,
    validate: nullable((v) => eachElement(v, nullable(checkInt), "a TreeNode level-order array")),
  }),

  ListNode: spec({
    java: "ListNode",
    judge: "linkedList",
    nullable: true,
    emitLiteral: (v) =>
      v === null
        ? "null"
        : `Judge.linked(new Integer[]{${(v as JsonValue[]).map((e) => String(e)).join(", ")}})`,
    render: renderJson,
    validate: nullable((v) => eachElement(v, checkInt, "a ListNode value array")),
  }),
};

/** Counts scalar leaves, for the literal-size cap. */
export function countElements(v: JsonValue): number {
  if (isArr(v)) return v.reduce<number>((n, e) => n + countElements(e), 0);
  if (isObj(v)) return Object.values(v).reduce<number>((n, e) => n + countElements(e), 0);
  return 1;
}
