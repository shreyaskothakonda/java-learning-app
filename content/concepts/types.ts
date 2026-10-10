/**
 * Concept pages: the reference half of the app.
 *
 * The JS platform this is modelled on shipped 58 GSAP visualisations for its
 * concept pages. Those are not ported — half of them explain JavaScript
 * semantics (the event loop, hoisting, `this`) that do not exist in Java, and
 * the rest are weeks of animation work on the least differentiated part of the
 * product. What actually teaches Java is a claim you can run.
 *
 * Hence the shape below. Every example is a COMPLETE, COMPILABLE program with
 * the output it produces stated alongside it, and `npm run validate:all`
 * compiles and runs every one of them and fails if the output has drifted.
 * A page cannot rot into a lie about what Java does, because the build checks.
 *
 * That constraint is also why examples are whole files rather than fragments:
 * a fragment cannot be run, so a fragment cannot be verified, and an
 * unverified fragment is exactly the thing that goes stale.
 */

/** A runnable example. The output is an assertion, not a comment. */
export type ConceptExample = {
  caption: string;
  /** A complete file with a `public class Main` and a `main` method. */
  code: string;
  /**
   * Exactly what the program prints. Compared token-wise by the validator, so
   * trailing whitespace never fails a page, but a changed VALUE does.
   */
  expectedOutput: string;
  /** Why the output is what it is, when that is the surprising part. */
  note?: string;
};

/**
 * A pitfall as a pair, never as prose alone.
 *
 * "Do not use == on strings" is forgettable. The two lines side by side, one
 * printing false and one printing true, is not.
 */
export type Pitfall = {
  wrong: string;
  right: string;
  why: string;
};

export type QuizQuestion = {
  question: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Shown after answering, right or wrong. The teaching is here, not in the tick. */
  explain: string;
};

export type Concept = {
  slug: string;
  /** Must be a topic id in content/manifest.ts — the page belongs to the spine. */
  topic: string;
  title: string;
  /** One or two sentences. Shown in the index; has to stand alone. */
  summary: string;
  sections: { heading: string; body: string }[];
  examples: ConceptExample[];
  pitfalls: Pitfall[];
  quiz: QuizQuestion[];
  /** Other concept slugs. Validated to exist. */
  seeAlso?: string[];
  /** Problem ids that exercise this concept. Validated to exist. */
  practice?: string[];
};
