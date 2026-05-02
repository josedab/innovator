/**
 * @module depth
 *
 * Investigation depth tiers: shallow, standard, and deep.
 * Controls the thoroughness of subject investigation by varying
 * LLM call count and token budget.
 */

import { z } from "zod";
import type { Investigation } from "../types.js";

export const DepthSchema = z.enum(["shallow", "standard", "deep"]);
export type Depth = z.infer<typeof DepthSchema>;

export interface DepthConfig {
  depth: Depth;
  label: string;
  description: string;
  estimatedCalls: number;
  estimatedTimeSeconds: string;
}

export const DEPTH_CONFIGS: Record<Depth, DepthConfig> = {
  shallow: {
    depth: "shallow",
    label: "Shallow",
    description: "Quick single-call investigation with reduced token budget (~5s)",
    estimatedCalls: 1,
    estimatedTimeSeconds: "3-8",
  },
  standard: {
    depth: "standard",
    label: "Standard",
    description: "Default investigation with thorough analysis",
    estimatedCalls: 1,
    estimatedTimeSeconds: "10-20",
  },
  deep: {
    depth: "deep",
    label: "Deep",
    description:
      "Multi-step investigation: initial analysis → sub-topic deep-dives → synthesis (4-5 LLM calls)",
    estimatedCalls: 5,
    estimatedTimeSeconds: "30-60",
  },
};

export function getDepthConfig(depth: Depth): DepthConfig {
  return DEPTH_CONFIGS[depth];
}

/** Build a shallow investigation prompt that requests a concise result. */
export function buildShallowInvestigationPrompt(subject: string): string {
  return `You are an innovation analyst. Provide a brief investigation of the following subject.
Be concise — this is a quick-scan analysis.

SUBJECT: """${subject}"""

Respond with valid JSON only:
{
  "summary": "1-2 sentence summary",
  "keyAspects": [{"title": "Name", "description": "Brief (1 sentence)"}],
  "currentState": "1-2 sentences on current state",
  "challenges": ["Challenge 1", "Challenge 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"]
}

Provide 2-3 key aspects, 2-3 challenges, and 2-3 opportunities. Keep each answer brief.`;
}

/** Build a prompt to identify sub-topics for deep investigation. */
export function buildSubTopicPrompt(subject: string, initialInvestigation: Investigation): string {
  return `Based on this initial investigation, identify 3 specific sub-topics that warrant deeper analysis.

SUBJECT: """${subject}"""

INITIAL INVESTIGATION:
Summary: ${initialInvestigation.summary}
Challenges: ${initialInvestigation.challenges.join("; ")}
Opportunities: ${initialInvestigation.opportunities.join("; ")}

Respond with valid JSON only:
{
  "subTopics": [
    {"title": "Sub-topic 1", "rationale": "Why this needs deeper investigation"},
    {"title": "Sub-topic 2", "rationale": "Why this needs deeper investigation"},
    {"title": "Sub-topic 3", "rationale": "Why this needs deeper investigation"}
  ]
}`;
}

/** Build a deep-dive prompt for a specific sub-topic. */
export function buildDeepDivePrompt(subject: string, subTopic: string, rationale: string): string {
  return `You are a specialist analyst. Deep-dive into a specific sub-topic of a broader subject.

SUBJECT: """${subject}"""
SUB-TOPIC: """${subTopic}"""
RATIONALE: """${rationale}"""

Provide an in-depth analysis. Respond with valid JSON only:
{
  "findings": "Detailed findings (3-5 sentences)",
  "additionalChallenges": ["Challenge specific to this sub-topic"],
  "additionalOpportunities": ["Opportunity specific to this sub-topic"],
  "keyInsight": "The most important insight from this deep-dive"
}`;
}

/** Build a synthesis prompt that merges initial + deep-dive results. */
export function buildDeepSynthesisPrompt(
  subject: string,
  initial: Investigation,
  deepDives: Array<{
    subTopic: string;
    findings: string;
    challenges: string[];
    opportunities: string[];
    keyInsight: string;
  }>
): string {
  const diveSummaries = deepDives
    .map(
      (d) =>
        `Sub-topic: ${d.subTopic}\nFindings: ${d.findings}\nKey Insight: ${d.keyInsight}\nChallenges: ${d.challenges.join("; ")}\nOpportunities: ${d.opportunities.join("; ")}`
    )
    .join("\n\n");

  return `You are an expert innovation analyst. Synthesize an initial investigation with deep-dive results into a comprehensive investigation.

SUBJECT: """${subject}"""

INITIAL INVESTIGATION:
Summary: ${initial.summary}
Key Aspects: ${initial.keyAspects.map((a) => `${a.title}: ${a.description}`).join("; ")}
Current State: ${initial.currentState}
Challenges: ${initial.challenges.join("; ")}
Opportunities: ${initial.opportunities.join("; ")}

DEEP-DIVE RESULTS:
${diveSummaries}

Synthesize all findings into a comprehensive investigation. Respond with valid JSON only:
{
  "summary": "Comprehensive 3-5 sentence summary incorporating deep-dive insights",
  "keyAspects": [{"title": "Aspect name", "description": "Enriched description with deep-dive findings"}],
  "currentState": "Comprehensive description of current state incorporating deep-dive details",
  "challenges": ["Enriched challenge incorporating deep-dive findings"],
  "opportunities": ["Enriched opportunity incorporating deep-dive findings"]
}

Provide 5-8 key aspects, 4-6 challenges, and 4-6 opportunities. Integrate insights from all deep-dives.`;
}

export const SubTopicSchema = z.object({
  subTopics: z
    .array(
      z.object({
        title: z.string().max(500),
        rationale: z.string().max(2000),
      })
    )
    .min(1)
    .max(5),
});

export const DeepDiveResultSchema = z.object({
  findings: z.string().max(5000),
  additionalChallenges: z.array(z.string().max(2000)).max(10),
  additionalOpportunities: z.array(z.string().max(2000)).max(10),
  keyInsight: z.string().max(2000),
});

export type SubTopicResult = z.infer<typeof SubTopicSchema>;
export type DeepDiveResult = z.infer<typeof DeepDiveResultSchema>;

/**
 * Heuristic to suggest a depth level based on subject complexity.
 * Returns 'deep' for subjects with ambiguous, complex, or multi-domain signals.
 */
export function suggestDepth(subject: string): Depth {
  const complexitySignals = [
    /\b(vs|versus|compared?\s+to|trade-?offs?)\b/i,
    /\b(ecosystem|platform|infrastructure|architecture)\b/i,
    /\b(strategy|transformation|paradigm|disruption)\b/i,
    /\band\b.*\band\b/i,
  ];
  const matchCount = complexitySignals.filter((r) => r.test(subject)).length;
  if (matchCount >= 2 || subject.length > 200) return "deep";
  if (matchCount >= 1 || subject.length > 100) return "standard";
  return "shallow";
}
