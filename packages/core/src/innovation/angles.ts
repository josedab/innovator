import type { AngleDefinition } from "../types.js";

export const ANGLES: AngleDefinition[] = [
  {
    id: "scamper",
    name: "SCAMPER",
    shortDescription: "Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse",
    icon: "🔄",
  },
  {
    id: "first-principles",
    name: "First Principles",
    shortDescription: "Decompose to fundamental truths, then rebuild novel solutions",
    icon: "🧱",
  },
  {
    id: "cross-domain",
    name: "Cross-Domain Analogy",
    shortDescription: "Map concepts from unrelated fields to spark unexpected ideas",
    icon: "🌐",
  },
  {
    id: "constraints",
    name: "Constraint Injection",
    shortDescription: "Add provocative constraints to force creative breakthroughs",
    icon: "🔒",
  },
  {
    id: "inversion",
    name: "Problem Inversion",
    shortDescription: "Flip the problem upside down, then reverse the insights",
    icon: "🔃",
  },
  {
    id: "perspectives",
    name: "Role-Based Perspectives",
    shortDescription: "View through different stakeholder lenses for fresh viewpoints",
    icon: "👥",
  },
  {
    id: "what-if",
    name: "What-If Scenarios",
    shortDescription: "Explore provocative hypotheticals to push boundaries",
    icon: "💭",
  },
  {
    id: "trend-collision",
    name: "Trend Collision",
    shortDescription: "Combine with emerging technology and social trends",
    icon: "⚡",
  },
];

/**
 * Look up an angle definition by its ID.
 *
 * @param id - The angle identifier (e.g. `"scamper"`, `"first-principles"`)
 * @returns The matching {@link AngleDefinition}, or `undefined` if not found
 *
 * @example
 * ```ts
 * const angle = getAngleById("scamper");
 * console.log(angle?.name); // "SCAMPER"
 * ```
 */
export function getAngleById(id: string): AngleDefinition | undefined {
  return ANGLES.find((a) => a.id === id);
}
