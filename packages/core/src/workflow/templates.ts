/**
 * @module workflow/templates
 *
 * Built-in starter workflow templates for the DAG editor.
 * Each template is a pre-configured WorkflowConfig with conditional
 * branches and domain-specific stage configurations.
 */

import type { WorkflowConfig } from "./index.js";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  config: WorkflowConfig;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "quick-ideation",
    name: "Quick Ideation Sprint",
    description:
      "Fast 3-angle ideation session with top-N filtering. Ideal for brainstorming sessions.",
    category: "ideation",
    tags: ["quick", "brainstorming", "beginner"],
    config: {
      name: "Quick Ideation Sprint",
      description: "Fast ideation with 3 complementary angles and immediate synthesis",
      version: "1.0.0",
      stages: [
        { id: "investigate", name: "Subject Investigation", type: "investigate" },
        {
          id: "generate-divergent",
          name: "Divergent Ideation",
          type: "generate",
          angles: ["scamper", "what-if", "cross-domain"],
        },
        { id: "score", name: "Score Ideas", type: "score" },
        {
          id: "filter-top",
          name: "Filter Top 5",
          type: "filter",
          filter: { maxResults: 5, minFeasibility: 4 },
        },
        { id: "synthesize", name: "Strategic Synthesis", type: "synthesize" },
      ],
      synthesisRules: { strategy: "top-n", maxIdeas: 5 },
      outputFormat: { format: "markdown", includeScores: true, includeReasoning: true },
    },
  },
  {
    id: "deep-research",
    name: "Deep Research Pipeline",
    description:
      "Comprehensive 8-angle analysis with multi-round scoring and clustering synthesis. For serious innovation projects.",
    category: "research",
    tags: ["comprehensive", "research", "advanced"],
    config: {
      name: "Deep Research Pipeline",
      description: "Full investigation with all angles, multi-round scoring, and themed clustering",
      version: "1.0.0",
      stages: [
        { id: "investigate", name: "Deep Investigation", type: "investigate" },
        {
          id: "generate-all",
          name: "All-Angle Generation",
          type: "generate",
          angles: [
            "scamper",
            "first-principles",
            "cross-domain",
            "constraints",
            "inversion",
            "perspectives",
            "what-if",
            "trend-collision",
          ],
        },
        { id: "score-round-1", name: "Initial Scoring", type: "score" },
        {
          id: "filter-viable",
          name: "Filter Viable Ideas",
          type: "filter",
          filter: { minFeasibility: 3, minImpact: 5, maxResults: 20 },
        },
        { id: "score-round-2", name: "Deep Scoring", type: "score" },
        {
          id: "filter-top",
          name: "Filter Top Ideas",
          type: "filter",
          filter: { minFeasibility: 5, minImpact: 6, maxResults: 10 },
        },
        { id: "synthesize", name: "Themed Synthesis", type: "synthesize" },
      ],
      synthesisRules: { strategy: "cluster", maxIdeas: 10, diversityWeight: 0.6 },
      outputFormat: { format: "json", includeScores: true, includeReasoning: true },
      defaults: { timeout: 180 },
    },
  },
  {
    id: "competitive-analysis",
    name: "Competitive Analysis Workflow",
    description:
      "Innovation through competitive lens — analyze gaps, find differentiators, build moats.",
    category: "strategy",
    tags: ["competitive", "strategy", "business"],
    config: {
      name: "Competitive Analysis Workflow",
      description: "Investigate competitive landscape, generate differentiating innovations",
      version: "1.0.0",
      stages: [
        { id: "investigate", name: "Market Investigation", type: "investigate" },
        {
          id: "generate-disruption",
          name: "Disruptive Ideas",
          type: "generate",
          angles: ["first-principles", "inversion", "trend-collision"],
        },
        {
          id: "generate-incremental",
          name: "Incremental Improvements",
          type: "generate",
          angles: ["scamper", "constraints", "perspectives"],
          continueOnError: true,
        },
        { id: "score", name: "Competitive Scoring", type: "score" },
        {
          id: "filter",
          name: "Filter High-Impact",
          type: "filter",
          filter: { minImpact: 7, maxResults: 8 },
        },
        { id: "synthesize", name: "Strategic Synthesis", type: "synthesize" },
      ],
      synthesisRules: { strategy: "diverse", maxIdeas: 8, diversityWeight: 0.7 },
      outputFormat: { format: "markdown", includeScores: true },
    },
  },
  {
    id: "product-innovation",
    name: "Product Innovation Pipeline",
    description: "End-to-end product innovation — from user needs to actionable feature specs.",
    category: "product",
    tags: ["product", "features", "user-centered"],
    config: {
      name: "Product Innovation Pipeline",
      description: "User-centered innovation with role-based perspectives and feasibility gates",
      version: "1.0.0",
      stages: [
        { id: "investigate", name: "User Need Analysis", type: "investigate" },
        {
          id: "generate-user",
          name: "User-Centered Ideas",
          type: "generate",
          angles: ["perspectives", "what-if", "cross-domain"],
        },
        {
          id: "generate-tech",
          name: "Technical Solutions",
          type: "generate",
          angles: ["first-principles", "constraints", "scamper"],
        },
        { id: "score", name: "Feasibility & Impact Score", type: "score" },
        {
          id: "filter-feasible",
          name: "Feasibility Gate",
          type: "filter",
          filter: { minFeasibility: 6, minImpact: 5, maxResults: 10 },
        },
        { id: "synthesize", name: "Feature Spec Synthesis", type: "synthesize" },
      ],
      synthesisRules: { strategy: "theme-based", maxIdeas: 10 },
      outputFormat: { format: "json", includeScores: true, includeReasoning: true },
    },
  },
  {
    id: "moonshot-workshop",
    name: "Moonshot Workshop",
    description:
      "High-risk, high-reward ideation with constraint injection and paradigm-breaking focus.",
    category: "moonshot",
    tags: ["moonshot", "bold", "visionary"],
    config: {
      name: "Moonshot Workshop",
      description: "Bold innovation with provocation and inversion techniques",
      version: "1.0.0",
      stages: [
        { id: "investigate", name: "Frontier Investigation", type: "investigate" },
        {
          id: "generate-moonshot",
          name: "Moonshot Ideation",
          type: "generate",
          angles: ["inversion", "what-if", "trend-collision"],
        },
        {
          id: "generate-provocation",
          name: "Provocative Ideas",
          type: "generate",
          angles: ["constraints", "first-principles"],
          continueOnError: true,
        },
        { id: "score", name: "Impact-Only Scoring", type: "score" },
        {
          id: "filter-bold",
          name: "Filter for Boldness",
          type: "filter",
          filter: { minImpact: 8, minNovelty: 7, maxResults: 5 },
        },
        { id: "synthesize", name: "Moonshot Synthesis", type: "synthesize" },
      ],
      synthesisRules: { strategy: "diverse", maxIdeas: 5, diversityWeight: 0.9 },
      outputFormat: { format: "markdown", includeReasoning: true },
    },
  },
];

/** Get all available workflow templates. */
export function listWorkflowTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES;
}

/** Get a workflow template by ID. */
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/** Get templates filtered by category. */
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}
