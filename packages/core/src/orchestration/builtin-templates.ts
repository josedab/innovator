/**
 * @module orchestration/builtin-templates
 *
 * Five built-in workflow templates for common innovation patterns:
 * 1. Quick Explore – fast ideation sprint
 * 2. Deep Dive – thorough multi-angle analysis with debate
 * 3. Competitive Analysis – market-focused competitive intelligence
 * 4. Product Launch – end-to-end product innovation pipeline
 * 5. Patent Scan – IP-focused innovation with prior art analysis
 */

import type { WorkflowDSL } from "./workflow-dsl.js";

export const QUICK_EXPLORE_DSL: WorkflowDSL = {
  name: "Quick Explore",
  description:
    "Rapid ideation sprint: investigate a subject, generate ideas from 3 angles, and synthesize in under 2 minutes. Perfect for initial exploration.",
  version: "1.0.0",
  tags: ["quick", "beginner", "exploration"],
  steps: [
    { id: "investigate", type: "investigate", name: "Quick Investigation", timeout: 60 },
    {
      id: "generate",
      type: "generate",
      name: "Multi-Angle Generation",
      after: "investigate",
      angles: ["scamper", "first-principles", "cross-domain"],
      timeout: 90,
    },
    {
      id: "synthesize",
      type: "synthesize",
      name: "Rapid Synthesis",
      after: "generate",
      timeout: 60,
    },
  ],
};

export const DEEP_DIVE_DSL: WorkflowDSL = {
  name: "Deep Dive",
  description:
    "Comprehensive analysis pipeline with 5 innovation angles, red-team challenge, structured debate, human review gate, and artifact generation. For thorough innovation sessions.",
  version: "1.0.0",
  tags: ["thorough", "analysis", "debate", "redteam"],
  steps: [
    { id: "investigate", type: "investigate", name: "Deep Investigation", timeout: 180 },
    {
      id: "generate",
      type: "generate",
      name: "5-Angle Generation",
      after: "investigate",
      angles: ["scamper", "first-principles", "cross-domain", "constraints", "inversion"],
      timeout: 300,
    },
    { id: "score", type: "score", name: "Score Ideas", after: "generate", timeout: 120 },
    {
      id: "redteam",
      type: "redteam",
      name: "Red Team Challenge",
      after: "score",
      config: { intensity: "high" },
      timeout: 180,
    },
    {
      id: "debate",
      type: "debate",
      name: "Structured Debate",
      after: "redteam",
      config: { rounds: 3, perspectives: ["optimist", "critic", "pragmatist"] },
      timeout: 300,
    },
    {
      id: "review",
      type: "human-review",
      name: "Expert Review",
      after: "debate",
      approve: {
        prompt: "Review the debate outcomes. Are the top ideas robust enough to proceed?",
        timeout: 7200,
      },
    },
    {
      id: "synthesize",
      type: "synthesize",
      name: "Final Synthesis",
      after: "review",
      timeout: 120,
    },
    {
      id: "artifact",
      type: "artifact",
      name: "Generate PRD",
      after: "synthesize",
      config: { type: "prd" },
      timeout: 120,
    },
  ],
};

export const COMPETITIVE_ANALYSIS_DSL: WorkflowDSL = {
  name: "Competitive Analysis",
  description:
    "Market-focused competitive intelligence pipeline. Investigates competitive landscape, generates differentiation ideas, runs wargaming scenarios, and produces strategic artifacts.",
  version: "1.0.0",
  tags: ["competitive", "market", "strategy", "wargaming"],
  steps: [
    {
      id: "investigate-market",
      type: "investigate",
      name: "Market Investigation",
      config: { focus: "competitive-landscape" },
      timeout: 180,
    },
    {
      id: "generate-differentiation",
      type: "generate",
      name: "Differentiation Ideas",
      after: "investigate-market",
      angles: ["inversion", "cross-domain", "constraints"],
      config: { focus: "competitive-advantage" },
      timeout: 180,
    },
    {
      id: "generate-disruption",
      type: "generate",
      name: "Disruption Opportunities",
      after: "investigate-market",
      angles: ["first-principles", "scamper"],
      config: { focus: "market-disruption" },
      timeout: 180,
    },
    {
      id: "score",
      type: "score",
      name: "Score All Ideas",
      after: ["generate-differentiation", "generate-disruption"],
      timeout: 120,
    },
    {
      id: "redteam",
      type: "redteam",
      name: "Competitive Wargaming",
      after: "score",
      config: { mode: "competitive-response", competitors: 3 },
      timeout: 240,
    },
    {
      id: "synthesize",
      type: "synthesize",
      name: "Strategic Synthesis",
      after: "redteam",
      timeout: 120,
    },
    {
      id: "export",
      type: "export",
      name: "Strategy Report",
      after: "synthesize",
      config: { formats: ["markdown", "pptx"] },
      timeout: 60,
    },
  ],
};

export const PRODUCT_LAUNCH_DSL: WorkflowDSL = {
  name: "Product Launch",
  description:
    "End-to-end product innovation pipeline. From investigation through idea generation, validation, debate, to PRD and implementation plan. Includes quality gates and team review.",
  version: "1.0.0",
  tags: ["product", "launch", "end-to-end", "prd"],
  steps: [
    {
      id: "investigate",
      type: "investigate",
      name: "Problem Space Investigation",
      timeout: 180,
    },
    {
      id: "generate-solutions",
      type: "generate",
      name: "Solution Ideation",
      after: "investigate",
      angles: ["scamper", "first-principles", "cross-domain", "constraints", "perspectives"],
      timeout: 300,
    },
    {
      id: "score",
      type: "score",
      name: "Feasibility Scoring",
      after: "generate-solutions",
      config: { criteria: ["novelty", "feasibility", "impact", "market-fit"] },
      timeout: 120,
    },
    {
      id: "filter",
      type: "filter",
      name: "Top Ideas Filter",
      after: "score",
      config: { minScore: 65, maxIdeas: 5 },
      timeout: 30,
    },
    {
      id: "debate",
      type: "debate",
      name: "Product Debate",
      after: "filter",
      config: { rounds: 2, perspectives: ["user-advocate", "engineer", "business"] },
      timeout: 240,
    },
    {
      id: "team-review",
      type: "human-review",
      name: "Team Sign-Off",
      after: "debate",
      approve: {
        prompt:
          "Review the top product ideas and debate outcomes. Approve the best ideas for PRD generation.",
        timeout: 86400,
        approvers: 2,
      },
    },
    {
      id: "synthesize",
      type: "synthesize",
      name: "Product Synthesis",
      after: "team-review",
      timeout: 120,
    },
    {
      id: "prd",
      type: "artifact",
      name: "Generate PRD",
      after: "synthesize",
      config: { type: "prd" },
      timeout: 180,
    },
    {
      id: "tech-spec",
      type: "artifact",
      name: "Technical Spec",
      after: "synthesize",
      config: { type: "tech-spec" },
      timeout: 180,
    },
  ],
};

export const PATENT_SCAN_DSL: WorkflowDSL = {
  name: "Patent Scan",
  description:
    "IP-focused innovation pipeline. Investigates prior art, generates novel approaches that avoid existing patents, runs red-team IP challenge, and produces patentability assessment.",
  version: "1.0.0",
  tags: ["patent", "ip", "prior-art", "novel"],
  steps: [
    {
      id: "investigate-prior-art",
      type: "investigate",
      name: "Prior Art Investigation",
      config: { focus: "patent-landscape", depth: "comprehensive" },
      timeout: 240,
    },
    {
      id: "generate-novel",
      type: "generate",
      name: "Novel Approach Generation",
      after: "investigate-prior-art",
      angles: ["first-principles", "inversion", "cross-domain"],
      config: { focus: "patentable-innovation", avoidPriorArt: true },
      timeout: 300,
    },
    {
      id: "score-novelty",
      type: "score",
      name: "Novelty Scoring",
      after: "generate-novel",
      config: { criteria: ["novelty", "non-obviousness", "utility", "enablement"] },
      timeout: 120,
    },
    {
      id: "ip-challenge",
      type: "redteam",
      name: "IP Red Team Challenge",
      after: "score-novelty",
      config: { mode: "patent-challenge", examinerPerspective: true },
      timeout: 240,
    },
    {
      id: "check-viability",
      type: "condition",
      name: "Viability Check",
      after: "ip-challenge",
      when: { field: "ip-challenge.output.patentableCount", op: "gte", value: 1 },
      then: ["synthesize"],
      else: ["refine-loop"],
    },
    {
      id: "refine-loop",
      type: "loop",
      name: "Refinement Loop",
      after: "check-viability",
      repeat: {
        times: 2,
        steps: ["generate-novel", "score-novelty"],
        until: { field: "score-novelty.output.topScore", op: "gte", value: 80 },
      },
    },
    {
      id: "synthesize",
      type: "synthesize",
      name: "Patent Synthesis",
      after: ["check-viability", "refine-loop"],
      continueOnError: true,
      timeout: 120,
    },
    {
      id: "patent-report",
      type: "artifact",
      name: "Patentability Report",
      after: "synthesize",
      config: { type: "patent-assessment" },
      timeout: 180,
    },
  ],
};

/** All built-in DSL templates. */
export const BUILTIN_WORKFLOW_DSLS: Record<string, WorkflowDSL> = {
  "quick-explore": QUICK_EXPLORE_DSL,
  "deep-dive": DEEP_DIVE_DSL,
  "competitive-analysis": COMPETITIVE_ANALYSIS_DSL,
  "product-launch": PRODUCT_LAUNCH_DSL,
  "patent-scan": PATENT_SCAN_DSL,
};

/** Get a built-in DSL template by ID. */
export function getBuiltinDSL(id: string): WorkflowDSL | undefined {
  return BUILTIN_WORKFLOW_DSLS[id];
}

/** List all built-in DSL template IDs. */
export function listBuiltinDSLs(): Array<{ id: string; name: string; description?: string }> {
  return Object.entries(BUILTIN_WORKFLOW_DSLS).map(([id, dsl]) => ({
    id,
    name: dsl.name,
    description: dsl.description,
  }));
}
