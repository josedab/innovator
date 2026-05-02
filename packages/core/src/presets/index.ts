/**
 * @module presets
 *
 * Built-in domain presets and template management.
 * Each preset pre-selects angles and provides context for common use cases.
 */

import type { Preset, AngleId } from "../types.js";

/** Built-in presets shipped with Innovator. */
export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "startup-validation",
    name: "Startup Idea Validation",
    description:
      "Validate a startup idea from multiple angles — market fit, competitive landscape, technical feasibility, and go-to-market strategy.",
    icon: "🚀",
    category: "Business",
    suggestedSubject: "e.g., 'AI-powered personal finance app for Gen Z'",
    selectedAngles: [
      "first-principles",
      "perspectives",
      "constraints",
      "what-if",
      "trend-collision",
    ],
    contextHints:
      "Focus on market viability, customer pain points, competitive moats, and realistic paths to first revenue.",
    tags: ["startup", "validation", "business"],
  },
  {
    id: "product-brainstorm",
    name: "Product Feature Brainstorm",
    description:
      "Generate innovative features for an existing product. Explore user needs, competitive gaps, and emerging technology integration.",
    icon: "💡",
    category: "Product",
    suggestedSubject: "e.g., 'Video conferencing platform for remote teams'",
    selectedAngles: ["scamper", "cross-domain", "perspectives", "what-if"],
    contextHints:
      "Focus on user experience improvements, differentiation from competitors, and features that drive retention.",
    tags: ["product", "features", "brainstorm"],
  },
  {
    id: "tech-architecture",
    name: "Technical Architecture Review",
    description:
      "Rethink a system's architecture from first principles. Explore alternative approaches, scalability patterns, and emerging tech.",
    icon: "🏗️",
    category: "Engineering",
    suggestedSubject: "e.g., 'Microservices architecture for e-commerce platform'",
    selectedAngles: [
      "first-principles",
      "constraints",
      "inversion",
      "trend-collision",
      "cross-domain",
    ],
    contextHints:
      "Focus on scalability, reliability, developer experience, cost optimization, and future-proofing.",
    tags: ["architecture", "engineering", "technical"],
  },
  {
    id: "market-entry",
    name: "Market Entry Strategy",
    description:
      "Develop a strategy for entering a new market. Analyze competitors, identify gaps, and find unconventional entry points.",
    icon: "🌍",
    category: "Business",
    suggestedSubject: "e.g., 'Plant-based protein market in Southeast Asia'",
    selectedAngles: ["perspectives", "inversion", "what-if", "trend-collision", "constraints"],
    contextHints:
      "Focus on local market dynamics, regulatory environment, distribution channels, and cultural adaptation.",
    tags: ["market", "strategy", "entry"],
  },
  {
    id: "process-improvement",
    name: "Process Improvement",
    description:
      "Optimize and reimagine a business or technical process. Find bottlenecks, eliminate waste, and discover automation opportunities.",
    icon: "⚙️",
    category: "Operations",
    suggestedSubject: "e.g., 'Software deployment pipeline for a 50-person engineering team'",
    selectedAngles: ["scamper", "first-principles", "inversion", "constraints", "cross-domain"],
    contextHints:
      "Focus on cycle time reduction, error rates, developer satisfaction, and measurable improvements.",
    tags: ["process", "improvement", "operations"],
  },
];

/** Get all available presets (built-in + any user presets in the future). */
export function getPresets(): Preset[] {
  return [...BUILT_IN_PRESETS];
}

/** Get a preset by ID. */
export function getPresetById(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/** Get presets filtered by category. */
export function getPresetsByCategory(category: string): Preset[] {
  return BUILT_IN_PRESETS.filter((p) => p.category.toLowerCase() === category.toLowerCase());
}

/** Get presets filtered by tag. */
export function getPresetsByTag(tag: string): Preset[] {
  return BUILT_IN_PRESETS.filter((p) => p.tags?.includes(tag.toLowerCase()));
}
