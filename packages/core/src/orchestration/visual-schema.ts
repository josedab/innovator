/**
 * @module orchestration/visual-schema
 *
 * Extended schema for the visual DAG editor — positions, approval gates,
 * conditional branches, loops, and human-in-the-loop nodes.
 * Complementary to workflow-schema.ts with React Flow specific metadata.
 */

import { z } from "zod";

// ---- Visual Position ----

export const NodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type NodePosition = z.infer<typeof NodePositionSchema>;

// ---- Visual Node Types (extended from WorkflowStepType) ----

export const VisualNodeTypeSchema = z.enum([
  "investigate",
  "generate",
  "debate",
  "gate",
  "export",
  "filter",
  "score",
  "transform",
  "branch",
  "merge",
  "redteam",
  "synthesize",
  "artifact",
  "human-review",
  "condition",
  "loop",
  "custom",
]);
export type VisualNodeType = z.infer<typeof VisualNodeTypeSchema>;

// ---- Approval Gate ----

export const ApprovalGateSchema = z.object({
  prompt: z.string().max(2000),
  approvers: z.array(z.string().max(200)).max(20).optional(),
  minApprovals: z.number().int().min(1).max(20).default(1),
  timeoutMs: z.number().int().min(0).default(86400000),
  autoApproveCondition: z.string().max(500).optional(),
});
export type ApprovalGate = z.infer<typeof ApprovalGateSchema>;

// ---- Conditional Branch ----

export const ConditionalBranchSchema = z.object({
  condition: z.string().max(1000),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "matches"]),
  value: z.unknown(),
  trueTargets: z.array(z.string().max(100)).max(10),
  falseTargets: z.array(z.string().max(100)).max(10),
});
export type ConditionalBranch = z.infer<typeof ConditionalBranchSchema>;

// ---- Loop Config ----

export const LoopConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(20).default(3),
  exitCondition: z.string().max(1000).optional(),
  loopSteps: z.array(z.string().max(100)).max(20),
});
export type LoopConfig = z.infer<typeof LoopConfigSchema>;

// ---- Visual DAG Node ----

export const VisualDAGNodeSchema = z.object({
  id: z.string().max(100),
  type: VisualNodeTypeSchema,
  name: z.string().max(200),
  description: z.string().max(500).optional(),
  position: NodePositionSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  approval: ApprovalGateSchema.optional(),
  branch: ConditionalBranchSchema.optional(),
  loop: LoopConfigSchema.optional(),
  status: z
    .enum(["idle", "pending", "running", "completed", "failed", "skipped", "waiting-approval"])
    .default("idle"),
  // UI metadata
  collapsed: z.boolean().optional(),
  color: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});
export type VisualDAGNode = z.infer<typeof VisualDAGNodeSchema>;

// ---- Visual Edge ----

export const VisualEdgeSchema = z.object({
  id: z.string().max(100),
  source: z.string().max(100),
  target: z.string().max(100),
  type: z.enum(["dependency", "branch-true", "branch-false", "loop-back", "data-flow"]).optional(),
  label: z.string().max(200).optional(),
  animated: z.boolean().optional(),
});
export type VisualEdge = z.infer<typeof VisualEdgeSchema>;

// ---- Visual Workflow ----

export const VisualWorkflowSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000).optional(),
  version: z.string().max(50).default("1.0.0"),
  nodes: z.array(VisualDAGNodeSchema).min(1).max(50),
  edges: z.array(VisualEdgeSchema).max(200),
  variables: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  templateId: z.string().max(100).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type VisualWorkflow = z.infer<typeof VisualWorkflowSchema>;

// ---- Template Metadata ----

export const VisualWorkflowTemplateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  category: z.enum(["exploration", "analysis", "validation", "production", "specialized"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedDurationMinutes: z.number().int().min(1).max(480),
  workflow: VisualWorkflowSchema,
  thumbnail: z.string().max(500).optional(),
});
export type VisualWorkflowTemplate = z.infer<typeof VisualWorkflowTemplateSchema>;

// ---- Built-in Visual Templates ----

export const VISUAL_TEMPLATES: VisualWorkflowTemplate[] = [
  {
    id: "quick-explore",
    name: "Quick Explore",
    description: "Rapid ideation sprint — investigate, generate from 3 angles, and synthesize.",
    category: "exploration",
    difficulty: "beginner",
    estimatedDurationMinutes: 2,
    workflow: {
      id: "tpl-quick-explore",
      name: "Quick Explore",
      version: "1.0.0",
      nodes: [
        {
          id: "investigate",
          type: "investigate",
          name: "Quick Investigation",
          position: { x: 100, y: 200 },
          status: "idle",
        },
        {
          id: "generate",
          type: "generate",
          name: "Multi-Angle Generation",
          position: { x: 400, y: 200 },
          config: { angles: ["scamper", "first-principles", "cross-domain"] },
          status: "idle",
        },
        {
          id: "synthesize",
          type: "synthesize",
          name: "Rapid Synthesis",
          position: { x: 700, y: 200 },
          status: "idle",
        },
      ],
      edges: [
        { id: "e1", source: "investigate", target: "generate" },
        { id: "e2", source: "generate", target: "synthesize" },
      ],
    },
  },
  {
    id: "deep-dive",
    name: "Deep Dive",
    description:
      "Thorough multi-angle analysis with red-team challenge, debate, and human review gate.",
    category: "analysis",
    difficulty: "advanced",
    estimatedDurationMinutes: 30,
    workflow: {
      id: "tpl-deep-dive",
      name: "Deep Dive",
      version: "1.0.0",
      nodes: [
        {
          id: "investigate",
          type: "investigate",
          name: "Deep Investigation",
          position: { x: 100, y: 200 },
          status: "idle",
        },
        {
          id: "generate",
          type: "generate",
          name: "5-Angle Generation",
          position: { x: 350, y: 200 },
          config: {
            angles: ["scamper", "first-principles", "cross-domain", "constraints", "inversion"],
          },
          status: "idle",
        },
        {
          id: "score",
          type: "score",
          name: "Score Ideas",
          position: { x: 600, y: 200 },
          status: "idle",
        },
        {
          id: "redteam",
          type: "redteam",
          name: "Red Team Challenge",
          position: { x: 600, y: 350 },
          status: "idle",
        },
        {
          id: "debate",
          type: "debate",
          name: "Structured Debate",
          position: { x: 850, y: 275 },
          config: { rounds: 3 },
          status: "idle",
        },
        {
          id: "review",
          type: "human-review",
          name: "Expert Review",
          position: { x: 1100, y: 275 },
          approval: {
            prompt: "Review debate outcomes. Are top ideas robust?",
            minApprovals: 1,
            timeoutMs: 7200000,
          },
          status: "idle",
        },
        {
          id: "synthesize",
          type: "synthesize",
          name: "Final Synthesis",
          position: { x: 1350, y: 275 },
          status: "idle",
        },
      ],
      edges: [
        { id: "e1", source: "investigate", target: "generate" },
        { id: "e2", source: "generate", target: "score" },
        { id: "e3", source: "generate", target: "redteam" },
        { id: "e4", source: "score", target: "debate" },
        { id: "e5", source: "redteam", target: "debate" },
        { id: "e6", source: "debate", target: "review" },
        { id: "e7", source: "review", target: "synthesize" },
      ],
    },
  },
  {
    id: "competitive-analysis",
    name: "Competitive Analysis",
    description:
      "Market-focused pipeline with differentiation and disruption branches, competitive wargaming.",
    category: "analysis",
    difficulty: "intermediate",
    estimatedDurationMinutes: 15,
    workflow: {
      id: "tpl-competitive",
      name: "Competitive Analysis",
      version: "1.0.0",
      nodes: [
        {
          id: "investigate",
          type: "investigate",
          name: "Market Investigation",
          position: { x: 100, y: 250 },
          status: "idle",
        },
        {
          id: "differentiation",
          type: "generate",
          name: "Differentiation Ideas",
          position: { x: 400, y: 150 },
          config: { angles: ["inversion", "cross-domain", "constraints"] },
          status: "idle",
        },
        {
          id: "disruption",
          type: "generate",
          name: "Disruption Opportunities",
          position: { x: 400, y: 350 },
          config: { angles: ["first-principles", "scamper"] },
          status: "idle",
        },
        {
          id: "merge",
          type: "merge",
          name: "Merge Ideas",
          position: { x: 700, y: 250 },
          status: "idle",
        },
        {
          id: "wargame",
          type: "redteam",
          name: "Competitive Wargaming",
          position: { x: 950, y: 250 },
          status: "idle",
        },
        {
          id: "synthesize",
          type: "synthesize",
          name: "Strategic Synthesis",
          position: { x: 1200, y: 250 },
          status: "idle",
        },
      ],
      edges: [
        { id: "e1", source: "investigate", target: "differentiation" },
        { id: "e2", source: "investigate", target: "disruption" },
        { id: "e3", source: "differentiation", target: "merge" },
        { id: "e4", source: "disruption", target: "merge" },
        { id: "e5", source: "merge", target: "wargame" },
        { id: "e6", source: "wargame", target: "synthesize" },
      ],
    },
  },
  {
    id: "product-launch",
    name: "Product Launch",
    description:
      "End-to-end product innovation with quality gate, team sign-off, and PRD + tech spec generation.",
    category: "production",
    difficulty: "advanced",
    estimatedDurationMinutes: 45,
    workflow: {
      id: "tpl-product-launch",
      name: "Product Launch",
      version: "1.0.0",
      nodes: [
        {
          id: "investigate",
          type: "investigate",
          name: "Problem Space",
          position: { x: 50, y: 200 },
          status: "idle",
        },
        {
          id: "generate",
          type: "generate",
          name: "Solution Ideation",
          position: { x: 280, y: 200 },
          config: {
            angles: ["scamper", "first-principles", "cross-domain", "constraints", "perspectives"],
          },
          status: "idle",
        },
        {
          id: "score",
          type: "score",
          name: "Feasibility Score",
          position: { x: 510, y: 200 },
          status: "idle",
        },
        {
          id: "filter",
          type: "filter",
          name: "Top Ideas",
          position: { x: 740, y: 200 },
          config: { minScore: 65, maxIdeas: 5 },
          status: "idle",
        },
        {
          id: "debate",
          type: "debate",
          name: "Product Debate",
          position: { x: 970, y: 200 },
          config: { rounds: 2 },
          status: "idle",
        },
        {
          id: "approval",
          type: "human-review",
          name: "Team Sign-Off",
          position: { x: 1200, y: 200 },
          approval: {
            prompt: "Approve best ideas for PRD generation.",
            minApprovals: 2,
            timeoutMs: 86400000,
          },
          status: "idle",
        },
        {
          id: "synthesize",
          type: "synthesize",
          name: "Product Synthesis",
          position: { x: 1430, y: 200 },
          status: "idle",
        },
        {
          id: "prd",
          type: "artifact",
          name: "Generate PRD",
          position: { x: 1660, y: 130 },
          config: { type: "prd" },
          status: "idle",
        },
        {
          id: "techspec",
          type: "artifact",
          name: "Tech Spec",
          position: { x: 1660, y: 270 },
          config: { type: "tech-spec" },
          status: "idle",
        },
      ],
      edges: [
        { id: "e1", source: "investigate", target: "generate" },
        { id: "e2", source: "generate", target: "score" },
        { id: "e3", source: "score", target: "filter" },
        { id: "e4", source: "filter", target: "debate" },
        { id: "e5", source: "debate", target: "approval" },
        { id: "e6", source: "approval", target: "synthesize" },
        { id: "e7", source: "synthesize", target: "prd" },
        { id: "e8", source: "synthesize", target: "techspec" },
      ],
    },
  },
  {
    id: "patent-scan",
    name: "Patent Scan",
    description:
      "IP-focused innovation with prior art investigation, novelty scoring, and refinement loop.",
    category: "specialized",
    difficulty: "advanced",
    estimatedDurationMinutes: 30,
    workflow: {
      id: "tpl-patent-scan",
      name: "Patent Scan",
      version: "1.0.0",
      nodes: [
        {
          id: "prior-art",
          type: "investigate",
          name: "Prior Art Investigation",
          position: { x: 100, y: 200 },
          status: "idle",
        },
        {
          id: "generate",
          type: "generate",
          name: "Novel Approaches",
          position: { x: 380, y: 200 },
          config: { angles: ["first-principles", "inversion", "cross-domain"] },
          status: "idle",
        },
        {
          id: "novelty-score",
          type: "score",
          name: "Novelty Scoring",
          position: { x: 660, y: 200 },
          status: "idle",
        },
        {
          id: "ip-challenge",
          type: "redteam",
          name: "IP Red Team",
          position: { x: 940, y: 200 },
          status: "idle",
        },
        {
          id: "viability",
          type: "condition",
          name: "Viability Check",
          position: { x: 1220, y: 200 },
          branch: {
            condition: "patentableCount",
            operator: "gte",
            value: 1,
            trueTargets: ["synthesize"],
            falseTargets: ["generate"],
          },
          status: "idle",
        },
        {
          id: "synthesize",
          type: "synthesize",
          name: "Patent Synthesis",
          position: { x: 1500, y: 200 },
          status: "idle",
        },
        {
          id: "report",
          type: "artifact",
          name: "Patentability Report",
          position: { x: 1780, y: 200 },
          config: { type: "patent-assessment" },
          status: "idle",
        },
      ],
      edges: [
        { id: "e1", source: "prior-art", target: "generate" },
        { id: "e2", source: "generate", target: "novelty-score" },
        { id: "e3", source: "novelty-score", target: "ip-challenge" },
        { id: "e4", source: "ip-challenge", target: "viability" },
        {
          id: "e5",
          source: "viability",
          target: "synthesize",
          type: "branch-true",
          label: "Patentable",
        },
        {
          id: "e6",
          source: "viability",
          target: "generate",
          type: "branch-false",
          label: "Refine",
          animated: true,
        },
        { id: "e7", source: "synthesize", target: "report" },
      ],
    },
  },
];

/** Get a visual workflow template by ID. */
export function getVisualTemplate(id: string): VisualWorkflowTemplate | undefined {
  return VISUAL_TEMPLATES.find((t) => t.id === id);
}

/** List all visual workflow templates. */
export function listVisualTemplates(): VisualWorkflowTemplate[] {
  return VISUAL_TEMPLATES;
}
