/**
 * The encoding gate.
 *
 * Every `JavaType` emitter is compiled by the real javac AND executed, then the
 * printed value is compared against what the author wrote. Compiling alone is
 * not enough: `1e+21` plus a naive ".0" suffix compiles as nothing and a
 * `long` past 2^53 silently loses precision. Only round-tripping through the
 * JVM catches those.
 *
 * This is the cheapest possible check on the plan's highest-rated risk — that
 * the test-case encoding proves insufficient. If it breaks, stop and redesign
 * before any content is generated against it.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { TYPES } from "./java-types.js";
import type { JavaType, JsonValue } from "./types.js";

const run = promisify(execFile);
const RUNTIME = fileURLToPath(new URL("../runtime/java/", import.meta.url));

/** One authored value per type, chosen to hit the failure modes not the happy path. */
const FIXTURES: { type: JavaType; json: JsonValue; prints: string }[] = [
  { type: "int", json: 5, prints: "5" },
  { type: "int", json: -2147483648, prints: "-2147483648" },
  // The precision footgun: this value is unrepresentable as a JSON number.
  { type: "long", json: "9007199254740993", prints: "9007199254740993" },
  { type: "long", json: "-9223372036854775808", prints: "-9223372036854775808" },
  { type: "long", json: 42, prints: "42" },
  { type: "double", json: 1.5, prints: "1.5" },
  // An integral double must not print as "2", and must not emit "2.0.0".
  { type: "double", json: 2, prints: "2.0" },
  // String(1e21) is "1e+21"; appending ".0" would not compile.
  { type: "double", json: 1e21, prints: "1.0E21" },
  { type: "double", json: "Infinity", prints: "Infinity" },
  { type: "double", json: "NaN", prints: "NaN" },
  { type: "boolean", json: true, prints: "true" },
  { type: "char", json: "'", prints: "'" },
  { type: "char", json: "\\", prints: "\\" },
  { type: "String", json: 'a"b\\c', prints: 'a"b\\c' },
  { type: "String", json: null, prints: "null" },
  { type: "Integer", json: null, prints: "null" },
  { type: "Integer", json: 7, prints: "7" },
  { type: "int[]", json: [1, -2147483648], prints: "[1, -2147483648]" },
  { type: "int[]", json: [], prints: "[]" },
  { type: "int[]", json: null, prints: "null" },
  { type: "long[]", json: ["9007199254740993", 1], prints: "[9007199254740993, 1]" },
  { type: "double[]", json: [1, 2.5], prints: "[1.0, 2.5]" },
  { type: "boolean[]", json: [true, false], prints: "[true, false]" },
  { type: "char[]", json: ["a", "'"], prints: "[a, ']" },
  { type: "String[]", json: ["x", null], prints: "[x, null]" },
  { type: "int[][]", json: [[1, 2], null], prints: "[[1, 2], null]" },
  { type: "char[][]", json: [["a"], ["b"]], prints: "[[a], [b]]" },
  { type: "String[][]", json: [["p"], null], prints: "[[p], null]" },
  { type: "List<Integer>", json: [1, null, 3], prints: "[1, null, 3]" },
  { type: "List<Integer>", json: [], prints: "[]" },
  // A lone null is the varargs trap: without a cast this compiles and then
  // throws NPE, because null is read as the varargs array itself.
  { type: "List<Integer>", json: [null], prints: "[null]" },
  { type: "List<String>", json: [null], prints: "[null]" },
  { type: "List<List<Integer>>", json: [null], prints: "[null]" },
  { type: "List<String>", json: ["a", null], prints: "[a, null]" },
  { type: "List<List<Integer>>", json: [[1], [2, 3]], prints: "[[1], [2, 3]]" },
  { type: "List<List<String>>", json: [["a"]], prints: "[[a]]" },
  { type: "Map<String,Integer>", json: { a: 1, b: 2 }, prints: "{a=1, b=2}" },
  { type: "Map<Integer,Integer>", json: { "1": 10, "2": 20 }, prints: "{1=10, 2=20}" },
  {
    type: "TreeNode",
    json: [3, 9, 20, null, null, 15, 7],
    prints: "[3, 9, 20, null, null, 15, 7]",
  },
  { type: "TreeNode", json: [1, null, 2], prints: "[1, null, 2]" },
  { type: "TreeNode", json: [], prints: "[]" },
  { type: "ListNode", json: [1, 2, 3], prints: "[1, 2, 3]" },
];

/** How to turn a variable of this type back into a printable string in Java. */
function printExpr(type: JavaType, name: string): string {
  switch (TYPES[type].judge) {
    case "tree":
      return `Arrays.toString(Judge.treeToArray(${name}))`;
    case "linkedList":
      return `Arrays.toString(Judge.linkedToArray(${name}))`;
    default:
      break;
  }
  if (type.endsWith("[][]")) return `Arrays.deepToString(${name})`;
  if (type.endsWith("[]")) return `(${name} == null ? "null" : Arrays.toString(${name}))`;
  return `String.valueOf(${name})`;
}

test("every JavaType emitter compiles and round-trips through the JVM", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jt-emit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  for (const f of ["Judge.java", "TreeNode.java", "ListNode.java"]) {
    await copyFile(join(RUNTIME, f), join(dir, f));
  }

  const decls: string[] = [];
  const prints: string[] = [];
  FIXTURES.forEach((f, i) => {
    const name = `v${i}`;
    decls.push(`        ${TYPES[f.type].java} ${name} = ${TYPES[f.type].emitLiteral(f.json)};`);
    prints.push(`        System.out.println(${printExpr(f.type, name)});`);
  });

  const source = `import java.util.*;

public class EmitCheck {
    public static void main(String[] args) {
${decls.join("\n")}
${prints.join("\n")}
    }
}
`;
  await writeFile(join(dir, "EmitCheck.java"), source, "utf8");

  try {
    await run("javac", ["-encoding", "UTF-8", "-d", dir, join(dir, "EmitCheck.java"), join(dir, "Judge.java"), join(dir, "TreeNode.java"), join(dir, "ListNode.java")], { cwd: dir });
  } catch (e) {
    const err = e as { stderr?: string };
    assert.fail(`emitted literals did not compile:\n${err.stderr ?? String(e)}\n\n${source}`);
  }

  const { stdout } = await run("java", ["-cp", dir, "EmitCheck"], { cwd: dir });
  const lines = stdout.split("\n");

  FIXTURES.forEach((f, i) => {
    assert.equal(
      lines[i],
      f.prints,
      `${f.type} ${JSON.stringify(f.json)} emitted as ` +
        `${TYPES[f.type].emitLiteral(f.json)} printed ${JSON.stringify(lines[i])}, ` +
        `expected ${JSON.stringify(f.prints)}`,
    );
  });
});

test("the fixture table covers every JavaType", () => {
  const covered = new Set(FIXTURES.map((f) => f.type));
  const missing = (Object.keys(TYPES) as JavaType[]).filter(
    (t) => t !== "void" && !covered.has(t),
  );
  assert.deepEqual(missing, [], `types with no emit fixture: ${missing.join(", ")}`);
});
