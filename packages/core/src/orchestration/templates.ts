/**
 * @module orchestration/templates
 *
 * Built-in workflow templates for common innovation patterns.
 * Each template is a pre-configured DAG workflow that can be
 * customized and executed immediately.
 */

import { type DAGWorkflow, DAGWorkflowSchema } from "./dag-engine.js";
import type { z } from "zod";
import { ValidationError } from "../errors.js";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "standard" | "advanced" | "team" | "rapid" | "enterprise";
  tags: string[];
  workflow: DAGWorkflow;
}

type DAGWorkflowInput = z.input<typeof DAGWorkflowSchema>;

function defineTemplate(
  meta: Omit<WorkflowTemplate, "workflow">,
  workflow: DAGWorkflowInput
): WorkflowTemplate {
  return { ...meta, workflow: DAGWorkflowSchema.parse(workflow) };
}

/** Quick innovation sprint: investigate → generate → synthesize */
export const rapidInnovationTemplate: WorkflowTemplate = defineTemplate(
  {
    id: "rapid-innovation",
    name: "Rapid Innovation Sprint",
    description:
      "Fast-paced pipeline for quick ideation. Investigates a subject, generates ideas from 3 angles, and synthesizes the best ones.",
    category: "rapid",
    tags: ["quick", "ideation", "beginner-friendly"],
  },
  {
    id: "rapid-innovation",
    name: "Rapid Innovation Sprint",
    version: "1.0.0",
    nodes: [
      {
        id: "investigate",
        type: "investigate",
        name: "Deep Investigation",
        dependsOn: [],
        timeout: 120,
      },
      {
        id: "generate-scamper",
        type: "generate",
        name: "SCAMPER Ideation",
        dependsOn: ["investigate"],
        config: { angle: "scamper" },
        timeout: 120,
      },
      {
        id: "generate-first-principles",
        type: "generate",
        name: "First Principles",
        dependsOn: ["investigate"],
        config: { angle: "first-principles" },
        timeout: 120,
      },
      {
        id: "generate-cross-domain",
        type: "generate",
        name: "Cross-Domain Transfer",
        dependsOn: ["investigate"],
        config: { angle: "cross-domain" },
        timeout: 120,
      },
      {
        id: "synthesize",
        type: "synthesize",
        name: "Synthesis",
        dependsOn: ["generate-scamper", "generate-first-principles", "generate-cross-domain"],
        timeout: 120,
      },
    ],
  }
);

/** Full pipeline with red-teaming and debate stages */
export const deepAnalysisTemplate: WorkflowTemplate = defineTemplate(
  {
    id: "deep-analysis",
    name: "Deep Analysis Pipeline",
    description:
      "Comprehensive pipeline with investigation, multi-angle generation, red-team challenge, structured debate, and export. Includes a quality gate before export.",
    category: "advanced",
    tags: ["thorough", "red-team", "debate", "quality"],
  },
  {
    id: "deep-analysis",
    name: "Deep Analysis Pipeline",
    version: "1.0.0",
    nodes: [
      {
        id: "investigate",
        type: "investigate",
        name: "Investigation",
        dependsOn: [],
        timeout: 180,
      },
      {
        id: "generate",
        type: "generate",
        name: "Multi-Angle Generation",
        dependsOn: ["investigate"],
        config: {
          angles: ["scamper", "first-principles", "cross-domain", "constraints", "inversion"],
        },
        timeout: 300,
      },
      { id: "score", type: "score", name: "Idea Scoring", dependsOn: ["generate"], timeout: 120 },
      {
        id: "redteam",
        type: "redteam",
        name: "Red Team Challenge",
        dependsOn: ["score"],
        config: { challengeIntensity: "high" },
        timeout: 180,
      },
      {
        id: "debate",
        type: "debate",
        name: "Structured Debate",
        dependsOn: ["redteam"],
        config: { rounds: 3, perspectives: ["optimist", "critic", "pragmatist"] },
        timeout: 300,
      },
      {
        id: "quality-gate",
        type: "gate",
        name: "Quality Check",
        dependsOn: ["debate"],
        config: { minScore: 70, minIdeas: 3 },
        timeout: 60,
      },
      {
        id: "synthesize",
        type: "synthesize",
        name: "Final Synthesis",
        dependsOn: ["quality-gate"],
        timeout: 120,
      },
      {
        id: "export",
        type: "export",
        name: "Export Results",
        dependsOn: ["synthesize"],
        config: { formats: ["markdown", "json"] },
        timeout: 60,
      },
    ],
  }
);

/** Team collaboration with human review gates */
export const teamCollaborationTemplate: WorkflowTemplate = defineTemplate(
  {
    id: "team-collaboration",
    name: "Team Collaboration Workflow",
    description:
      "Collaborative pipeline with human-in-the-loop review gates for team alignment. Investigation is reviewed before generation, and final ideas require team approval.",
    category: "team",
    tags: ["collaboration", "review", "team", "approval"],
  },
  {
    id: "team-collaboration",
    name: "Team Collaboration Workflow",
    version: "1.0.0",
    nodes: [
      {
        id: "investigate",
        type: "investigate",
        name: "Team Investigation",
        dependsOn: [],
        timeout: 180,
      },
      {
        id: "review-investigation",
        type: "human-review",
        name: "Review Investigation",
        dependsOn: ["investigate"],
        gate: {
          prompt:
            "Review the investigation results. Does the analysis cover all relevant aspects? Approve to proceed with idea generation.",
          timeout: 3600,
          autoApprove: false,
          requiredApprovers: 1,
        },
        timeout: 3600,
      },
      {
        id: "generate-parallel-1",
        type: "generate",
        name: "Innovation Track A",
        dependsOn: ["review-investigation"],
        config: { angles: ["scamper", "first-principles"] },
        timeout: 180,
      },
      {
        id: "generate-parallel-2",
        type: "generate",
        name: "Innovation Track B",
        dependsOn: ["review-investigation"],
        config: { angles: ["cross-domain", "what-if"] },
        timeout: 180,
      },
      {
        id: "synthesize",
        type: "synthesize",
        name: "Merge & Synthesize",
        dependsOn: ["generate-parallel-1", "generate-parallel-2"],
        timeout: 120,
      },
      {
        id: "review-ideas",
        type: "human-review",
        name: "Team Idea Review",
        dependsOn: ["synthesize"],
        gate: {
          prompt:
            "Review the synthesized ideas. Vote on the top ideas to move forward. Approve to finalize.",
          timeout: 7200,
          autoApprove: false,
          requiredApprovers: 2,
        },
        timeout: 3600,
      },
      {
        id: "export",
        type: "export",
        name: "Export Approved Ideas",
        dependsOn: ["review-ideas"],
        config: { formats: ["markdown", "json"] },
        timeout: 60,
      },
    ],
  }
);

/** Conditional branching based on investigation complexity */
export const adaptivePipelineTemplate: WorkflowTemplate = defineTemplate(
  {
    id: "adaptive-pipeline",
    name: "Adaptive Innovation Pipeline",
    description:
      "Automatically adjusts depth based on subject complexity. Simple subjects get a fast pipeline; complex subjects trigger deep analysis with debate and red-teaming.",
    category: "advanced",
    tags: ["adaptive", "conditional", "smart", "auto"],
  },
  {
    id: "adaptive-pipeline",
    name: "Adaptive Innovation Pipeline",
    version: "1.0.0",
    nodes: [
      {
        id: "investigate",
        type: "investigate",
        name: "Initial Investigation",
        dependsOn: [],
        timeout: 180,
      },
      {
        id: "check-complexity",
        type: "condition",
        name: "Complexity Check",
        dependsOn: ["investigate"],
        condition: { field: "investigate.output.complexity", operator: "gte", value: 7 },
        branches: {
          trueBranch: ["deep-generate", "redteam", "debate"],
          falseBranch: ["quick-generate"],
        },
        timeout: 10,
      },
      {
        id: "quick-generate",
        type: "generate",
        name: "Quick Generation",
        dependsOn: ["check-complexity"],
        config: { angles: ["scamper", "first-principles"] },
        timeout: 120,
      },
      {
        id: "deep-generate",
        type: "generate",
        name: "Deep Multi-Angle Generation",
        dependsOn: ["check-complexity"],
        config: {
          angles: [
            "scamper",
            "first-principles",
            "cross-domain",
            "constraints",
            "inversion",
            "perspectives",
          ],
        },
        timeout: 300,
      },
      {
        id: "redteam",
        type: "redteam",
        name: "Red Team Challenge",
        dependsOn: ["deep-generate"],
        timeout: 180,
      },
      {
        id: "debate",
        type: "debate",
        name: "Structured Debate",
        dependsOn: ["redteam"],
        timeout: 240,
      },
      {
        id: "synthesize",
        type: "synthesize",
        name: "Final Synthesis",
        dependsOn: ["quick-generate", "debate"],
        continueOnError: true,
        timeout: 120,
      },
    ],
  }
);

/** Iterative refinement loop */
export const iterativeRefinementTemplate: WorkflowTemplate = defineTemplate(
  {
    id: "iterative-refinement",
    name: "Iterative Refinement Loop",
    description:
      "Generates ideas, scores them, and iteratively refines low-scoring ideas up to 3 times. Includes a quality gate to exit the loop early when ideas meet the threshold.",
    category: "advanced",
    tags: ["iterative", "refinement", "loop", "quality"],
  },
  {
    id: "iterative-refinement",
    name: "Iterative Refinement Loop",
    version: "1.0.0",
    nodes: [
      {
        id: "investigate",
        type: "investigate",
        name: "Investigation",
        dependsOn: [],
        timeout: 180,
      },
      {
        id: "initial-generate",
        type: "generate",
        name: "Initial Generation",
        dependsOn: ["investigate"],
        config: { angles: ["scamper", "first-principles", "cross-domain"] },
        timeout: 180,
      },
      {
        id: "refinement-loop",
        type: "loop",
        name: "Refinement Loop",
        dependsOn: ["initial-generate"],
        loop: {
          maxIterations: 3,
          exitCondition: { field: "refinement-loop.avgScore", operator: "gte", value: 80 },
          loopBody: ["score-iteration", "refine-iteration"],
        },
        timeout: 600,
      },
      { id: "score-iteration", type: "score", name: "Score Ideas", dependsOn: [], timeout: 120 },
      {
        id: "refine-iteration",
        type: "generate",
        name: "Refine Low-Scoring Ideas",
        dependsOn: [],
        config: { mode: "refine", minScore: 60 },
        timeout: 180,
      },
      {
        id: "synthesize",
        type: "synthesize",
        name: "Final Synthesis",
        dependsOn: ["refinement-loop"],
        timeout: 120,
      },
      {
        id: "artifact",
        type: "artifact",
        name: "Generate PRD",
        dependsOn: ["synthesize"],
        config: { type: "prd" },
        timeout: 120,
      },
    ],
  }
);

// ---- Template Registry ----

const builtInTemplates: WorkflowTemplate[] = [
  rapidInnovationTemplate,
  deepAnalysisTemplate,
  teamCollaborationTemplate,
  adaptivePipelineTemplate,
  iterativeRefinementTemplate,
];

const customTemplates = new Map<string, WorkflowTemplate>();

/** Get all available workflow templates. */
export function getWorkflowTemplates(): WorkflowTemplate[] {
  return [...builtInTemplates, ...Array.from(customTemplates.values())];
}

/** Get a workflow template by ID. */
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return builtInTemplates.find((t) => t.id === id) ?? customTemplates.get(id);
}

/** Register a custom workflow template. */
export function registerWorkflowTemplate(template: WorkflowTemplate): void {
  if (template.id.length > 100) throw new ValidationError("Template ID too long");
  customTemplates.set(template.id, template);
}

/** Remove a custom workflow template. */
export function unregisterWorkflowTemplate(id: string): boolean {
  return customTemplates.delete(id);
}

/** Get templates by category. */
export function getTemplatesByCategory(category: WorkflowTemplate["category"]): WorkflowTemplate[] {
  return getWorkflowTemplates().filter((t) => t.category === category);
}

/** Clear all custom templates (for testing). */
export function clearCustomTemplates(): void {
  customTemplates.clear();
}
