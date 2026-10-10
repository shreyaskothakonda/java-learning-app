/**
 * Hand-written concept pages, for the same reason the first problems were
 * hand-written: you have to feel the shape before automating it.
 *
 * One rule runs through all of these — ASSERT ONLY WHAT THE LANGUAGE
 * GUARANTEES. It is tempting to write an example that prints a HashMap's
 * iteration order, because the surprise is the lesson. But that order is not
 * specified, so the expected output would be a claim about this JDK on this
 * machine rather than about Java, and the page would fail for a learner on a
 * different one. Where the interesting behaviour is unspecified, the example
 * demonstrates the guaranteed alternative and the prose says the rest.
 */

import type { Concept } from "./types.js";

export const FUNDAMENTAL_CONCEPTS: Concept[] = [
  {
    slug: "int-vs-integer",
    topic: "syntax",
    title: "int and Integer are not the same thing",
    summary:
      "One is a primitive and always holds a number; the other is an object that can be null and compares by identity. Mixing them up produces two of the most common bugs in beginner Java.",
    sections: [
      {
        heading: "The difference",
        body: "An `int` is a value. It occupies a fixed slot, always holds a number, and cannot be null. An `Integer` is a reference to an object that wraps an int — so it can be null, it costs an allocation, and `==` on two of them compares references rather than numbers.\n\nJava converts between them automatically. That conversion is called autoboxing, and it is convenient right up until it is the bug.",
      },
      {
        heading: "Why the cache exists",
        body: "Boxing a small int is common enough that Java keeps a cache of Integer objects for -128 to 127 and hands out the same object every time. Outside that range you get a fresh object. Nothing about that is wrong, and none of it matters — until you use `==`, at which point the same code gives different answers for 127 and 128.",
      },
      {
        heading: "The rule",
        body: "Compare numbers with `==` only when both sides are primitives. The moment either side is an `Integer`, use `.equals`, or unbox deliberately with `intValue()`. And treat any `Integer` that came out of a collection as possibly null.",
      },
    ],
    examples: [
      {
        caption: "The same comparison, two different answers",
        code: `public class Main {
    public static void main(String[] args) {
        Integer a = 127, b = 127;
        Integer c = 128, d = 128;

        System.out.println("127 == 127 : " + (a == b));
        System.out.println("128 == 128 : " + (c == d));
        System.out.println("128 equals : " + c.equals(d));

        // Unboxing one side forces a numeric comparison.
        int e = 128;
        System.out.println("128 == int  : " + (c == e));
    }
}`,
        expectedOutput: `127 == 127 : true
128 == 128 : false
128 equals : true
128 == int  : true`,
        note: "Nothing about 128 is special to the language. It is the edge of a cache, and it is why == on boxed types is a bug that passes your first test.",
      },
      {
        caption: "A null that becomes a NullPointerException somewhere else",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> counts = new HashMap<>();
        counts.put("a", 1);

        Integer missing = counts.get("b");
        System.out.println("get on a missing key: " + missing);

        try {
            int n = missing;            // unboxing null
            System.out.println(n);
        } catch (NullPointerException e) {
            System.out.println("unboxing null threw: NullPointerException");
        }

        System.out.println("getOrDefault instead: " + counts.getOrDefault("b", 0));
    }
}`,
        expectedOutput: `get on a missing key: null
unboxing null threw: NullPointerException
getOrDefault instead: 0`,
        note: "The exception is thrown at the assignment, not at the lookup. That is why these are hard to find: the line that crashes is not the line that is wrong.",
      },
    ],
    pitfalls: [
      {
        wrong: "if (boxedA == boxedB) { ... }",
        right: "if (boxedA.equals(boxedB)) { ... }",
        why: "== compares references. It appears to work for small values because of the Integer cache, then fails above 127.",
      },
      {
        wrong: "int n = map.get(key);",
        right: "int n = map.getOrDefault(key, 0);",
        why: "A missing key returns null, and unboxing null throws a NullPointerException at the assignment.",
      },
      {
        wrong: "List<int> xs = new ArrayList<>();",
        right: "List<Integer> xs = new ArrayList<>();",
        why: "Generics hold objects, never primitives. This one is at least a compile error rather than a silent bug.",
      },
    ],
    quiz: [
      {
        question: "Integer a = 1000, b = 1000. What does a == b print?",
        options: ["true", "false", "It does not compile", "It throws"],
        answer: 1,
        explain:
          "1000 is outside the -128..127 cache, so each assignment creates a separate object and == compares two different references. Use a.equals(b).",
      },
      {
        question: "Which of these can be null?",
        options: ["int", "Integer", "Both", "Neither"],
        answer: 1,
        explain:
          "An int is a value and always holds a number. Integer is a reference and can be null — which is exactly why unboxing can throw.",
      },
      {
        question: "map.get(key) returns null for a missing key. What happens at `int n = map.get(key);`?",
        options: [
          "n becomes 0",
          "n becomes null",
          "A NullPointerException is thrown",
          "It does not compile",
        ],
        answer: 2,
        explain:
          "Java unboxes by calling intValue() on the reference. Calling it on null throws, at the assignment rather than at the lookup.",
      },
    ],
    seeAlso: ["equals-vs-double-equals"],
    practice: ["fund-arrays-average"],
  },

  {
    slug: "equals-vs-double-equals",
    topic: "arrays-strings",
    title: "Comparing strings with == is the bug you will hit first",
    summary:
      "`==` asks whether two references point at the same object. For strings that is almost never the question you meant, and Java's string interning makes it accidentally work often enough to be dangerous.",
    sections: [
      {
        heading: "What == actually asks",
        body: "For primitives, `==` compares values. For everything else — every object, including String — it compares references: are these two names for the same object in memory? `.equals` is what compares contents, and String overrides it to compare character by character.",
      },
      {
        heading: "Why it sometimes works",
        body: "Java keeps a pool of string literals. Two identical literals in your source are the same object, so `==` between them is true. Anything computed at run time — read from input, built with a StringBuilder, concatenated from variables — is a new object, and `==` is false even when the characters are identical.\n\nThis is the worst possible failure mode: it works in the small test you wrote and fails on real input.",
      },
      {
        heading: "The habit to build",
        body: "Use `.equals` for strings, always, without thinking about it. When one side might be null, put the literal first — `\"quit\".equals(input)` cannot throw — or use `Objects.equals(a, b)`, which handles null on both sides.",
      },
    ],
    examples: [
      {
        caption: "Identical characters, different answers",
        code: `public class Main {
    public static void main(String[] args) {
        String a = "hello";
        String b = "hello";                 // the same pooled literal
        String c = new String("hello");     // deliberately a new object

        System.out.println("literal == literal : " + (a == b));
        System.out.println("literal == new     : " + (a == c));
        System.out.println("equals             : " + a.equals(c));

        String part = "hel";
        String built = part + "lo";         // computed at run time
        System.out.println("built   == literal : " + (a == built));
        System.out.println("built   equals     : " + a.equals(built));
    }
}`,
        expectedOutput: `literal == literal : true
literal == new     : false
equals             : true
built   == literal : false
built   equals     : true`,
        note: "The first line is the dangerous one. It is why == on strings survives code review and dies in production.",
      },
      {
        caption: "Null-safe comparison",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        String input = null;

        System.out.println("literal first : " + "quit".equals(input));
        System.out.println("Objects.equals: " + Objects.equals(input, "quit"));

        try {
            System.out.println(input.equals("quit"));
        } catch (NullPointerException e) {
            System.out.println("input.equals threw: NullPointerException");
        }
    }
}`,
        expectedOutput: `literal first : false
Objects.equals: false
input.equals threw: NullPointerException`,
      },
    ],
    pitfalls: [
      {
        wrong: 'if (name == "quit") { ... }',
        right: 'if ("quit".equals(name)) { ... }',
        why: "== compares references. It is true only when both sides happen to be the same pooled literal, which stops being true the moment the value comes from input.",
      },
      {
        wrong: "if (name.equals(other))",
        right: "if (Objects.equals(name, other))",
        why: "The first throws when name is null. Objects.equals treats two nulls as equal and never throws.",
      },
      {
        wrong: "if (sb == other)  // sb is a StringBuilder",
        right: "if (sb.toString().equals(other))",
        why: "StringBuilder does not override equals at all, so even .equals on two builders compares references.",
      },
    ],
    quiz: [
      {
        question: 'String a = "hi"; String b = new String("hi"); What is a == b?',
        options: ["true", "false", "It does not compile", "It depends on the JDK"],
        answer: 1,
        explain:
          "`new String` is an explicit instruction to allocate a separate object, so the two references differ. a.equals(b) is true.",
      },
      {
        question: "Which comparison is safe when either side may be null?",
        options: ['a.equals(b)', 'Objects.equals(a, b)', 'a == b', 'a.compareTo(b) == 0'],
        answer: 1,
        explain:
          "Objects.equals null-checks the first argument for you and treats two nulls as equal. a.equals(b) throws if a is null, and compareTo throws too.",
      },
      {
        question: "Why does == on strings often appear to work in small programs?",
        options: [
          "Java compares strings by value when they are short",
          "Identical literals in the source are the same pooled object",
          "The compiler rewrites == into equals",
          "It does not — it always fails",
        ],
        answer: 1,
        explain:
          "Literals are interned, so two identical literals are one object. Anything built at run time is not, which is why the bug surfaces only on real input.",
      },
    ],
    seeAlso: ["int-vs-integer"],
  },

  {
    slug: "hashmap-essentials",
    topic: "collections",
    title: "The four HashMap methods that replace most of your loops",
    summary:
      "getOrDefault, merge, computeIfAbsent and putIfAbsent turn the usual four-line check-then-update into one line — and remove the null bug that lives in the check.",
    sections: [
      {
        heading: "Counting, the long way and the short way",
        body: "Almost every frequency count starts as: get the value, check whether it was null, put back either 1 or the old value plus 1. That is four lines, one of which is a null check you will eventually forget.\n\n`merge(key, 1, Integer::sum)` is the whole thing: store 1 if the key is absent, otherwise combine the old value with 1 using the function given.",
      },
      {
        heading: "Grouping",
        body: "The same shape appears when the value is a collection: get the list, create it if it is null, add to it. `computeIfAbsent(key, k -> new ArrayList<>())` returns the existing list or installs a new one and returns that, so the add is always safe. The lambda runs only when the key is missing, which is why it takes a function rather than a value.",
      },
      {
        heading: "Order is not part of the contract",
        body: "A HashMap makes no promise about iteration order, and that is not a detail to work around — it is the deal you accept in exchange for O(1) lookup. Do not write code that depends on the order you happened to observe.\n\nWhen you need an order, say so in the type: `LinkedHashMap` iterates in insertion order, `TreeMap` in sorted key order. Both are guarantees you can rely on.",
      },
    ],
    examples: [
      {
        caption: "Four lines become one",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        String[] words = {"red", "blue", "red", "green", "red"};

        Map<String, Integer> longWay = new HashMap<>();
        for (String w : words) {
            Integer seen = longWay.get(w);
            if (seen == null) longWay.put(w, 1);
            else longWay.put(w, seen + 1);
        }

        Map<String, Integer> shortWay = new HashMap<>();
        for (String w : words) {
            shortWay.merge(w, 1, Integer::sum);
        }

        System.out.println("same result: " + longWay.equals(shortWay));
        System.out.println("red counted: " + shortWay.get("red"));
        System.out.println("missing key: " + shortWay.getOrDefault("purple", 0));
    }
}`,
        expectedOutput: `same result: true
red counted: 3
missing key: 0`,
        note: "Map.equals compares contents, not order, which is why the two maps compare equal without either one having a defined iteration order.",
      },
      {
        caption: "Grouping without a null check",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        String[] names = {"Ada", "Alan", "Grace", "Alonzo"};

        Map<Character, List<String>> byInitial = new TreeMap<>();
        for (String n : names) {
            byInitial.computeIfAbsent(n.charAt(0), k -> new ArrayList<>()).add(n);
        }

        // A TreeMap iterates in sorted key order, so this output is guaranteed.
        for (Map.Entry<Character, List<String>> e : byInitial.entrySet()) {
            System.out.println(e.getKey() + " -> " + e.getValue());
        }
    }
}`,
        expectedOutput: `A -> [Ada, Alan, Alonzo]
G -> [Grace]`,
        note: "A TreeMap is used here rather than a HashMap for a specific reason: the example prints the iteration order, and only a sorted or insertion-ordered map lets it promise what that order will be.",
      },
      {
        caption: "When you need the order back",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> inserted = List.of("zebra", "apple", "mango");

        Map<String, Integer> linked = new LinkedHashMap<>();
        Map<String, Integer> sorted = new TreeMap<>();
        for (String s : inserted) {
            linked.put(s, s.length());
            sorted.put(s, s.length());
        }

        System.out.println("insertion order: " + new ArrayList<>(linked.keySet()));
        System.out.println("sorted order   : " + new ArrayList<>(sorted.keySet()));
    }
}`,
        expectedOutput: `insertion order: [zebra, apple, mango]
sorted order   : [apple, mango, zebra]`,
      },
    ],
    pitfalls: [
      {
        wrong: "int n = counts.get(word) + 1;",
        right: "counts.merge(word, 1, Integer::sum);",
        why: "get returns null for an absent key and unboxing it throws. merge handles the absent case as part of its contract.",
      },
      {
        wrong: "computeIfAbsent(k, new ArrayList<>())",
        right: "computeIfAbsent(k, k2 -> new ArrayList<>())",
        why: "It takes a function so the list is only created when the key is missing. The first form does not compile, which is the good outcome — the equivalent mistake with putIfAbsent does compile and allocates on every call.",
      },
      {
        wrong: "for (String k : hashMap.keySet())  // expecting insertion order",
        right: "Map<String, Integer> m = new LinkedHashMap<>();",
        why: "HashMap's iteration order is unspecified. Code that relies on the order you observed today can break on a different JDK, or after an unrelated change to the keys.",
      },
    ],
    quiz: [
      {
        question: "What does counts.merge(\"a\", 1, Integer::sum) do when \"a\" is absent?",
        options: [
          "Throws a NullPointerException",
          "Stores 1",
          "Stores 0",
          "Does nothing",
        ],
        answer: 1,
        explain:
          "merge stores the given value when the key is absent, and applies the function only when there is an existing value to combine with.",
      },
      {
        question: "Which map guarantees iteration in the order you inserted keys?",
        options: ["HashMap", "TreeMap", "LinkedHashMap", "All of them"],
        answer: 2,
        explain:
          "LinkedHashMap keeps insertion order. TreeMap iterates in sorted key order. HashMap promises no order at all.",
      },
      {
        question: "Why does computeIfAbsent take a lambda rather than a value?",
        options: [
          "So it can be used with generics",
          "So the value is only constructed when the key is missing",
          "Because values must be immutable",
          "It is just a style choice",
        ],
        answer: 1,
        explain:
          "Passing a value would construct it on every call, including the overwhelming majority where the key is already present. The lambda runs only when it is needed.",
      },
    ],
    seeAlso: ["arrays-vs-lists", "int-vs-integer"],
    practice: ["dsa-hashing-two-sum", "hashing-most-frequent-ticket-code"],
  },

  {
    slug: "arrays-vs-lists",
    topic: "collections",
    title: "Arrays and Lists, and the bridge between them that lies to you",
    summary:
      "An array has a fixed length and holds primitives; a List grows and holds objects. `Arrays.asList` looks like the bridge between them and is a fixed-size view with a trap for int[].",
    sections: [
      {
        heading: "Two different things",
        body: "An array's length is fixed when you create it and is a field, not a method: `xs.length`. A List's size can change and is a method: `xs.size()`. An array can hold primitives directly — `int[]` really is a block of ints — while a List can only hold objects, so a list of numbers is a `List<Integer>` with all the boxing that implies.",
      },
      {
        heading: "The asList trap",
        body: "`Arrays.asList(xs)` does not copy. It returns a fixed-size list backed by the array, so `set` writes through to the array and `add` throws `UnsupportedOperationException`. When you want a real list, wrap it: `new ArrayList<>(Arrays.asList(xs))`.\n\nThe sharper trap is with primitives. `Arrays.asList` takes a varargs of objects, and an `int[]` is a single object, so you get a `List<int[]>` of size 1 rather than a list of the numbers. It compiles. It is almost never what you meant.",
      },
      {
        heading: "Going both ways",
        body: "From a `List<String>` to an array: `list.toArray(new String[0])`. From an `int[]` to a `List<Integer>` there is no direct route that avoids boxing — `Arrays.stream(xs).boxed().toList()` is the usual one, and the fact that it is not shorter is the language telling you the conversion is not free.",
      },
    ],
    examples: [
      {
        caption: "asList is a view, not a copy",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        String[] colours = {"red", "green", "blue"};
        List<String> view = Arrays.asList(colours);

        view.set(0, "crimson");
        System.out.println("array changed too: " + colours[0]);

        try {
            view.add("yellow");
        } catch (UnsupportedOperationException e) {
            System.out.println("add threw: UnsupportedOperationException");
        }

        List<String> real = new ArrayList<>(Arrays.asList(colours));
        real.add("yellow");
        System.out.println("copy is growable: " + real.size());
        System.out.println("original length : " + colours.length);
    }
}`,
        expectedOutput: `array changed too: crimson
add threw: UnsupportedOperationException
copy is growable: 4
original length : 3`,
      },
      {
        caption: "The int[] trap, and the fix",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        int[] numbers = {1, 2, 3};

        List<int[]> wrong = Arrays.asList(numbers);
        System.out.println("size of the wrong list: " + wrong.size());

        List<Integer> right = Arrays.stream(numbers).boxed().toList();
        System.out.println("size of the right list: " + right.size());
        System.out.println("contents: " + right);

        Integer[] boxed = {1, 2, 3};
        System.out.println("Integer[] works as you expect: " + Arrays.asList(boxed).size());
    }
}`,
        expectedOutput: `size of the wrong list: 1
size of the right list: 3
contents: [1, 2, 3]
Integer[] works as you expect: 3`,
        note: "The first line is the whole point. An int[] is one object, so the varargs call sees one argument — and the compiler is perfectly happy.",
      },
    ],
    pitfalls: [
      {
        wrong: "List<Integer> xs = Arrays.asList(intArray);",
        right: "List<Integer> xs = Arrays.stream(intArray).boxed().toList();",
        why: "An int[] is a single object to a varargs method, so the first gives you a one-element List<int[]>.",
      },
      {
        wrong: "Arrays.asList(xs).add(y);",
        right: "new ArrayList<>(Arrays.asList(xs)).add(y);",
        why: "asList returns a fixed-size view of the array. Adding to it throws UnsupportedOperationException at run time.",
      },
      {
        wrong: "xs.length() on an array, or xs.size on a list",
        right: "array.length (a field), list.size() (a method)",
        why: "Arrays and collections were designed years apart and never reconciled. It is a compile error either way, but it catches everyone at least once.",
      },
    ],
    quiz: [
      {
        question: "int[] xs = {1,2,3}; What is Arrays.asList(xs).size()?",
        options: ["3", "1", "0", "It does not compile"],
        answer: 1,
        explain:
          "asList takes varargs of objects. An int[] is one object, so you get a List<int[]> containing a single element — the array itself.",
      },
      {
        question: "What does Arrays.asList(arr).add(x) do?",
        options: [
          "Grows the list and leaves the array alone",
          "Grows both",
          "Throws UnsupportedOperationException",
          "Does not compile",
        ],
        answer: 2,
        explain:
          "The returned list is a fixed-size view backed by the array. set writes through; add and remove throw.",
      },
      {
        question: "Which is correct for an array and which for a list?",
        options: [
          "array.size(), list.length",
          "array.length, list.size()",
          "Both use .length",
          "Both use .size()",
        ],
        answer: 1,
        explain:
          "length is a field on arrays; size() is a method on collections. There is no deeper reason — they come from different eras of the language.",
      },
    ],
    seeAlso: ["hashmap-essentials"],
    practice: ["dsa-two-pointers-remove-duplicates"],
  },
];
