/**
 * @module pipeline-builder/visual-studio
 *
 * Visual Innovation Studio — drag-and-drop node-based pipeline builder
 * with typed input/output ports, connection validation, React Flow
 * integration types, and a template gallery.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Port Schemas ----

export const PortTypeSchema = z.enum([
  "subject",
  "investigation",
  "angle-results",
  "ideas",
  "scores",
  "synthesis",
  "validation",
  "artifact",
  "text",
  "config",
]);
export type PortType = z.infer<typeof PortTypeSchema>;

export const PortSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(100),
  type: PortTypeSchema,
  direction: z.enum(["input", "output"]),
  required: z.boolean().default(true),
  multiple: z.boolean().default(false),
});
export type Port = z.infer<typeof PortSchema>;

// ---- Node Schemas ----

export const NodeTypeSchema = z.enum([
  "investigate",
  "generate",
  "score",
  "synthesize",
  "validate",
  "filter",
  "merge",
  "export",
  "artifact",
  "custom",
  "input",
  "output",
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const VisualNodeSchema = z.object({
  id: z.string().max(100),
  type: NodeTypeSchema,
  label: z.string().max(200),
  description: z.string().max(500).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.unknown()).default({}),
  inputs: z.array(PortSchema).max(10),
  outputs: z.array(PortSchema).max(10),
  status: z.enum(["idle", "running", "completed", "error"]).default("idle"),
  resultSummary: z.string().max(500).optional(),
});
export type VisualNode = z.infer<typeof VisualNodeSchema>;

// ---- Connection Schemas ----

export const ConnectionSchema = z.object({
  id: z.string().max(100),
  sourceNodeId: z.string().max(100),
  sourcePortId: z.string().max(100),
  targetNodeId: z.string().max(100),
  targetPortId: z.string().max(100),
  animated: z.boolean().default(false),
});
export type Connection = z.infer<typeof ConnectionSchema>;

// ---- Visual Pipeline Schema ----

export const VisualPipelineSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(1000).optional(),
  nodes: z.array(VisualNodeSchema).max(50),
  connections: z.array(ConnectionSchema).max(200),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number().min(0.1).max(5),
    })
    .default({ x: 0, y: 0, zoom: 1 }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VisualPipeline = z.infer<typeof VisualPipelineSchema>;

// ---- Validation ----

export const ValidationIssueSchema = z.object({
  type: z.enum(["error", "warning"]),
  nodeId: z.string().max(100).optional(),
  connectionId: z.string().max(100).optional(),
  message: z.string().max(500),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// ---- Connection Compatibility Matrix ----

const PORT_COMPATIBILITY: Record<string, string[]> = {
  subject: ["investigation", "text"],
  investigation: ["angle-results", "ideas", "text"],
  "angle-results": ["ideas", "scores", "synthesis", "text"],
  ideas: ["scores", "synthesis", "validation", "artifact", "text"],
  scores: ["synthesis", "ideas", "text"],
  synthesis: ["artifact", "text", "validation"],
  validation: ["artifact", "text"],
  artifact: ["text"],
  text: ["text", "subject", "investigation", "ideas"],
  config: ["config"],
};

/**
 * Check if two ports are compatible for connection.
 */
export function arePortsCompatible(sourcePort: Port, targetPort: Port): boolean {
  if (sourcePort.direction !== "output" || targetPort.direction !== "input") return false;
  const compatible = PORT_COMPATIBILITY[sourcePort.type] ?? [];
  return compatible.includes(targetPort.type) || sourcePort.type === targetPort.type;
}

/**
 * Validate a visual pipeline for structural correctness.
 */
export function validateVisualPipeline(pipeline: VisualPipeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, n]));

  // Check for disconnected required inputs
  for (const node of pipeline.nodes) {
    for (const input of node.inputs) {
      if (!input.required) continue;
      const hasConnection = pipeline.connections.some(
        (c) => c.targetNodeId === node.id && c.targetPortId === input.id
      );
      if (!hasConnection) {
        issues.push({
          type: "error",
          nodeId: node.id,
          message: `Required input "${input.name}" on "${node.label}" is not connected`,
        });
      }
    }
  }

  // Check connection validity
  for (const conn of pipeline.connections) {
    const sourceNode = nodeMap.get(conn.sourceNodeId);
    const targetNode = nodeMap.get(conn.targetNodeId);

    if (!sourceNode) {
      issues.push({
        type: "error",
        connectionId: conn.id,
        message: `Source node "${conn.sourceNodeId}" not found`,
      });
      continue;
    }
    if (!targetNode) {
      issues.push({
        type: "error",
        connectionId: conn.id,
        message: `Target node "${conn.targetNodeId}" not found`,
      });
      continue;
    }

    const sourcePort = sourceNode.outputs.find((p) => p.id === conn.sourcePortId);
    const targetPort = targetNode.inputs.find((p) => p.id === conn.targetPortId);

    if (!sourcePort) {
      issues.push({
        type: "error",
        connectionId: conn.id,
        message: `Source port "${conn.sourcePortId}" not found`,
      });
      continue;
    }
    if (!targetPort) {
      issues.push({
        type: "error",
        connectionId: conn.id,
        message: `Target port "${conn.targetPortId}" not found`,
      });
      continue;
    }

    if (!arePortsCompatible(sourcePort, targetPort)) {
      issues.push({
        type: "error",
        connectionId: conn.id,
        message: `Incompatible port types: ${sourcePort.type} → ${targetPort.type}`,
      });
    }
  }

  // Check for cycles
  if (hasCycle(pipeline)) {
    issues.push({ type: "error", message: "Pipeline contains a cycle" });
  }

  // Warn about orphan nodes (no inputs or outputs connected)
  for (const node of pipeline.nodes) {
    if (node.type === "input" || node.type === "output") continue;
    const hasInput = pipeline.connections.some((c) => c.targetNodeId === node.id);
    const hasOutput = pipeline.connections.some((c) => c.sourceNodeId === node.id);
    if (!hasInput && !hasOutput) {
      issues.push({
        type: "warning",
        nodeId: node.id,
        message: `Node "${node.label}" is disconnected`,
      });
    }
  }

  return issues;
}

function hasCycle(pipeline: VisualPipeline): boolean {
  const adj = new Map<string, string[]>();
  for (const node of pipeline.nodes) adj.set(node.id, []);
  for (const conn of pipeline.connections) {
    adj.get(conn.sourceNodeId)?.push(conn.targetNodeId);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of pipeline.nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}

// ---- Node Library ----

/** Node definitions for each module type. */
export const NODE_LIBRARY: ReadonlyArray<{
  type: NodeType;
  label: string;
  description: string;
  inputs: Port[];
  outputs: Port[];
  defaultConfig: Record<string, unknown>;
}> = [
  {
    type: "input",
    label: "Subject Input",
    description: "Starting point — enter a subject to investigate",
    inputs: [],
    outputs: [
      {
        id: "subject-out",
        name: "Subject",
        type: "subject",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { subject: "" },
  },
  {
    type: "investigate",
    label: "Investigation",
    description: "Analyze a subject to uncover key aspects, challenges, and opportunities",
    inputs: [
      {
        id: "subject-in",
        name: "Subject",
        type: "subject",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "investigation-out",
        name: "Investigation",
        type: "investigation",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { depth: "standard", model: undefined },
  },
  {
    type: "generate",
    label: "Idea Generation",
    description: "Generate innovation ideas from specific angles",
    inputs: [
      {
        id: "investigation-in",
        name: "Investigation",
        type: "investigation",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "ideas-out",
        name: "Ideas",
        type: "angle-results",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { angles: [], maxIdeas: 10 },
  },
  {
    type: "score",
    label: "Idea Scoring",
    description: "Score ideas by feasibility, impact, and novelty",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "angle-results",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "scores-out",
        name: "Scores",
        type: "scores",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { dimensions: ["feasibility", "impact", "novelty"] },
  },
  {
    type: "synthesize",
    label: "Synthesis",
    description: "Synthesize ideas into top recommendations",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "angle-results",
        direction: "input",
        required: true,
        multiple: true,
      },
    ],
    outputs: [
      {
        id: "synthesis-out",
        name: "Synthesis",
        type: "synthesis",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { topN: 5 },
  },
  {
    type: "validate",
    label: "Validation",
    description: "Validate ideas for feasibility, market fit, and IP risks",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "ideas",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "validation-out",
        name: "Validation",
        type: "validation",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { validators: ["patent", "market", "feasibility"] },
  },
  {
    type: "filter",
    label: "Filter",
    description: "Filter ideas by score thresholds or criteria",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "ideas",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "ideas-out",
        name: "Filtered Ideas",
        type: "ideas",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { minFeasibility: 5, minImpact: 5 },
  },
  {
    type: "merge",
    label: "Merge",
    description: "Merge results from multiple branches",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "ideas",
        direction: "input",
        required: true,
        multiple: true,
      },
    ],
    outputs: [
      {
        id: "ideas-out",
        name: "Merged Ideas",
        type: "ideas",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: {},
  },
  {
    type: "artifact",
    label: "Artifact Generator",
    description: "Generate a PRD, tech spec, or pitch deck from ideas",
    inputs: [
      {
        id: "ideas-in",
        name: "Ideas",
        type: "ideas",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [
      {
        id: "artifact-out",
        name: "Artifact",
        type: "artifact",
        direction: "output",
        required: true,
        multiple: false,
      },
    ],
    defaultConfig: { type: "prd" },
  },
  {
    type: "export",
    label: "Export",
    description: "Export results to Markdown, JSON, or other formats",
    inputs: [
      {
        id: "data-in",
        name: "Data",
        type: "text",
        direction: "input",
        required: true,
        multiple: false,
      },
    ],
    outputs: [],
    defaultConfig: { format: "markdown" },
  },
  {
    type: "output",
    label: "Pipeline Output",
    description: "Final output node collecting pipeline results",
    inputs: [
      {
        id: "result-in",
        name: "Result",
        type: "text",
        direction: "input",
        required: true,
        multiple: true,
      },
    ],
    outputs: [],
    defaultConfig: {},
  },
];

/**
 * Get the node library for the visual pipeline builder.
 */
export function getNodeLibrary(): typeof NODE_LIBRARY {
  return NODE_LIBRARY;
}

// ---- Template Gallery ----

export const TemplateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(1000),
  category: z.enum(["quick-start", "deep-research", "validation", "competitive", "custom"]),
  pipeline: VisualPipelineSchema,
  tags: z.array(z.string().max(50)).max(10).default([]),
});
export type Template = z.infer<typeof TemplateSchema>;

function makeNode(
  type: NodeType,
  label: string,
  x: number,
  y: number,
  extra?: Partial<VisualNode>
): VisualNode {
  const def = NODE_LIBRARY.find((n) => n.type === type);
  return {
    id: randomUUID(),
    type,
    label,
    position: { x, y },
    config: def?.defaultConfig ?? {},
    inputs: def?.inputs ?? [],
    outputs: def?.outputs ?? [],
    status: "idle",
    ...extra,
  };
}

/**
 * Get pre-built pipeline templates.
 */
export function getTemplateGallery(): Template[] {
  const now = new Date().toISOString();

  // Quick Ideation template
  const qi_input = makeNode("input", "Subject", 0, 100);
  const qi_investigate = makeNode("investigate", "Quick Investigate", 300, 100);
  const qi_generate = makeNode("generate", "Generate Ideas", 600, 100);
  const qi_output = makeNode("output", "Results", 900, 100);

  const quickIdeation: Template = {
    id: "template-quick-ideation",
    name: "Quick Ideation",
    description: "Fast investigation → idea generation pipeline for rapid brainstorming",
    category: "quick-start",
    tags: ["fast", "brainstorm"],
    pipeline: {
      id: "pipeline-quick-ideation",
      name: "Quick Ideation",
      nodes: [qi_input, qi_investigate, qi_generate, qi_output],
      connections: [
        {
          id: randomUUID(),
          sourceNodeId: qi_input.id,
          sourcePortId: "subject-out",
          targetNodeId: qi_investigate.id,
          targetPortId: "subject-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: qi_investigate.id,
          sourcePortId: "investigation-out",
          targetNodeId: qi_generate.id,
          targetPortId: "investigation-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: qi_generate.id,
          sourcePortId: "ideas-out",
          targetNodeId: qi_output.id,
          targetPortId: "result-in",
          animated: false,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    },
  };

  // Full Pipeline template
  const fp_input = makeNode("input", "Subject", 0, 200);
  const fp_investigate = makeNode("investigate", "Deep Investigation", 250, 200);
  const fp_generate = makeNode("generate", "Multi-Angle Generation", 500, 200);
  const fp_score = makeNode("score", "Score Ideas", 750, 100);
  const fp_synth = makeNode("synthesize", "Synthesize", 750, 300);
  const fp_output = makeNode("output", "Final Results", 1000, 200);

  const fullPipeline: Template = {
    id: "template-full-pipeline",
    name: "Full Innovation Pipeline",
    description: "Complete end-to-end pipeline: investigate → generate → score → synthesize",
    category: "deep-research",
    tags: ["comprehensive", "full"],
    pipeline: {
      id: "pipeline-full",
      name: "Full Innovation Pipeline",
      nodes: [fp_input, fp_investigate, fp_generate, fp_score, fp_synth, fp_output],
      connections: [
        {
          id: randomUUID(),
          sourceNodeId: fp_input.id,
          sourcePortId: "subject-out",
          targetNodeId: fp_investigate.id,
          targetPortId: "subject-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: fp_investigate.id,
          sourcePortId: "investigation-out",
          targetNodeId: fp_generate.id,
          targetPortId: "investigation-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: fp_generate.id,
          sourcePortId: "ideas-out",
          targetNodeId: fp_score.id,
          targetPortId: "ideas-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: fp_generate.id,
          sourcePortId: "ideas-out",
          targetNodeId: fp_synth.id,
          targetPortId: "ideas-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: fp_score.id,
          sourcePortId: "scores-out",
          targetNodeId: fp_output.id,
          targetPortId: "result-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: fp_synth.id,
          sourcePortId: "synthesis-out",
          targetNodeId: fp_output.id,
          targetPortId: "result-in",
          animated: false,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    },
  };

  // Validation Pipeline template
  const vp_input = makeNode("input", "Subject", 0, 200);
  const vp_investigate = makeNode("investigate", "Investigate", 250, 200);
  const vp_generate = makeNode("generate", "Generate", 500, 200);
  const vp_validate = makeNode("validate", "Validate Ideas", 750, 200);
  const vp_output = makeNode("output", "Validated Results", 1000, 200);

  const validationPipeline: Template = {
    id: "template-validation",
    name: "Validation Pipeline",
    description: "Generate ideas and validate them for feasibility, market fit, and IP risks",
    category: "validation",
    tags: ["validation", "feasibility"],
    pipeline: {
      id: "pipeline-validation",
      name: "Validation Pipeline",
      nodes: [vp_input, vp_investigate, vp_generate, vp_validate, vp_output],
      connections: [
        {
          id: randomUUID(),
          sourceNodeId: vp_input.id,
          sourcePortId: "subject-out",
          targetNodeId: vp_investigate.id,
          targetPortId: "subject-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: vp_investigate.id,
          sourcePortId: "investigation-out",
          targetNodeId: vp_generate.id,
          targetPortId: "investigation-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: vp_generate.id,
          sourcePortId: "ideas-out",
          targetNodeId: vp_validate.id,
          targetPortId: "ideas-in",
          animated: false,
        },
        {
          id: randomUUID(),
          sourceNodeId: vp_validate.id,
          sourcePortId: "validation-out",
          targetNodeId: vp_output.id,
          targetPortId: "result-in",
          animated: false,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    },
  };

  return [quickIdeation, fullPipeline, validationPipeline];
}

// ---- Pipeline Store ----

const visualPipelines = new Map<string, VisualPipeline>();

/**
 * Save a visual pipeline.
 */
export function saveVisualPipeline(pipeline: VisualPipeline): VisualPipeline {
  const validated = VisualPipelineSchema.parse(pipeline);
  visualPipelines.set(validated.id, validated);
  return validated;
}

/**
 * Get a visual pipeline by ID.
 */
export function getVisualPipeline(pipelineId: string): VisualPipeline | undefined {
  return visualPipelines.get(pipelineId);
}

/**
 * List all saved visual pipelines.
 */
export function listVisualPipelines(): VisualPipeline[] {
  return Array.from(visualPipelines.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

/**
 * Delete a visual pipeline.
 */
export function deleteVisualPipeline(pipelineId: string): boolean {
  return visualPipelines.delete(pipelineId);
}

/**
 * Clear all visual pipelines (for testing).
 */
export function clearVisualPipelines(): void {
  visualPipelines.clear();
}
