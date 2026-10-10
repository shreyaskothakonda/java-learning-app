import { FUNDAMENTAL_CONCEPTS } from "./fundamentals.js";
import type { Concept } from "./types.js";

export const CONCEPTS: Concept[] = [...FUNDAMENTAL_CONCEPTS];

const BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

export function getConcept(slug: string): Concept | undefined {
  return BY_SLUG.get(slug);
}

export function getConceptsByTopic(topic: string): Concept[] {
  return CONCEPTS.filter((c) => c.topic === topic);
}

export * from "./types.js";
