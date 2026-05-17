/**
 * @module angle-studio
 *
 * Angle Studio — visual pipeline editor for creating and customizing
 * innovation angle pipelines. Provides a data model for drag-and-drop
 * composition, reordering, and configuration of angle sequences.
 * The visual rendering is handled by the web UI; this module provides
 * the data model, validation, and serialization.
 */

import { z } from "zod";
import { ValidationError } from "../errors.js";
import { ANGLE_IDS, type AngleId } from "../types.js";

// ---- Schemas ----

/** Schema for position in the visual editor. */
export const StudioPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** Schema for a single node in the angle pipeline editor. */
export const StudioNodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["angle", "filter", "transform", "merge", "output"]),
  /** For angle nodes: the angle ID. */
  angleId: z.string().max(100).optional(),
  label: z.string().max(200),
  description: z.string().max(1000).optional(),
  position: StudioPositionSchema,
  /** Node-specific configuration. */
  config: z.record(z.unknown()).optional(),
  /** Whether this node is enabled. */
  enabled: z.boolean().default(true),
});

/** Schema for a connection between two nodes. */
export const StudioConnectionSchema = z.object({
  id: z.string().min(1).max(200),
  sourceNodeId: z.string().max(200),
  targetNodeId: z.string().max(200),
  /** Optional label for the connection. */
  label: z.string().max(200).optional(),
});

/** Schema for a complete angle pipeline. */
export const AnglePipelineSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  version: z.string().max(50).default("1.0.0"),
  author: z.string().max(200).optional(),
  nodes: z.array(StudioNodeSchema).max(50),
  connections: z.array(StudioConnectionSchema).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

/** Schema for pipeline validation result. */
export const PipelineValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string().max(500)).max(50),
  warnings: z.array(z.string().max(500)).max(50),
  nodeCount: z.number(),
  connectionCount: z.number(),
  executionOrder: z.array(z.string().max(200)).max(50),
});

// ---- Types ----

export type StudioPosition = z.infer<typeof StudioPositionSchema>;
export type StudioNode = z.infer<typeof StudioNodeSchema>;
export type StudioConnection = z.infer<typeof StudioConnectionSchema>;
export type AnglePipeline = z.infer<typeof AnglePipelineSchema>;
export type PipelineValidation = z.infer<typeof PipelineValidationSchema>;

// ---- In-Memory Store ----

const pipelines: Map<string, AnglePipeline> = new Map();

// ---- Pipeline CRUD ----

/**
 * Create a new angle pipeline.
 */
export function createPipeline(
  name: string,
  options?: { description?: string; author?: string; tags?: string[] }
): AnglePipeline {
  const now = new Date().toISOString();
  const id = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pipeline: AnglePipeline = {
    id,
    name,
    description: options?.description,
    version: "1.0.0",
    author: options?.author,
    nodes: [],
    connections: [],
    createdAt: now,
    updatedAt: now,
    tags: options?.tags,
  };

  pipelines.set(id, pipeline);
  return pipeline;
}

/**
 * Get a pipeline by ID.
 */
export function getPipeline(id: string): AnglePipeline | undefined {
  return pipelines.get(id);
}

/**
 * List all pipelines.
 */
export function listPipelines(): AnglePipeline[] {
  return Array.from(pipelines.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Delete a pipeline.
 */
export function deletePipeline(id: string): boolean {
  return pipelines.delete(id);
}

/**
 * Clear all pipelines (for testing).
 */
export function clearPipelines(): void {
  pipelines.clear();
}

// ---- Node Operations ----

/**
 * Add a node to a pipeline.
 */
export function addNode(pipelineId: string, node: StudioNode): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  // Validate no duplicate IDs
  if (pipeline.nodes.some((n) => n.id === node.id)) {
    throw new ValidationError(`Node with ID "${node.id}" already exists`);
  }

  pipeline.nodes.push(StudioNodeSchema.parse(node));
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

/**
 * Remove a node and its connections from a pipeline.
 */
export function removeNode(pipelineId: string, nodeId: string): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  pipeline.nodes = pipeline.nodes.filter((n) => n.id !== nodeId);
  pipeline.connections = pipeline.connections.filter(
    (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
  );
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

/**
 * Move a node to a new position (drag-and-drop).
 */
export function moveNode(
  pipelineId: string,
  nodeId: string,
  position: StudioPosition
): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  const node = pipeline.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  node.position = position;
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

/**
 * Update node configuration.
 */
export function updateNodeConfig(
  pipelineId: string,
  nodeId: string,
  config: Record<string, unknown>
): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  const node = pipeline.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  node.config = { ...node.config, ...config };
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

/**
 * Reorder nodes in the pipeline (for sequential execution).
 */
export function reorderNodes(pipelineId: string, nodeIds: string[]): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, n]));
  const reordered: StudioNode[] = [];

  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    if (node) reordered.push(node);
  }

  // Add any nodes not in the order list at the end
  for (const node of pipeline.nodes) {
    if (!nodeIds.includes(node.id)) reordered.push(node);
  }

  pipeline.nodes = reordered;
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

// ---- Connection Operations ----

/**
 * Add a connection between two nodes.
 */
export function addConnection(
  pipelineId: string,
  sourceNodeId: string,
  targetNodeId: string,
  label?: string
): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  // Validate nodes exist
  if (!pipeline.nodes.some((n) => n.id === sourceNodeId)) {
    throw new ValidationError(`Source node "${sourceNodeId}" not found`);
  }
  if (!pipeline.nodes.some((n) => n.id === targetNodeId)) {
    throw new ValidationError(`Target node "${targetNodeId}" not found`);
  }

  // Prevent self-connections
  if (sourceNodeId === targetNodeId) {
    throw new ValidationError("Cannot connect a node to itself");
  }

  // Prevent duplicate connections
  if (
    pipeline.connections.some(
      (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId
    )
  ) {
    throw new ValidationError("Connection already exists");
  }

  const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pipeline.connections.push({ id, sourceNodeId, targetNodeId, label });
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

/**
 * Remove a connection.
 */
export function removeConnection(
  pipelineId: string,
  connectionId: string
): AnglePipeline | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;

  pipeline.connections = pipeline.connections.filter((c) => c.id !== connectionId);
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

// ---- Validation ----

/**
 * Validate a pipeline for correctness.
 */
export function validatePipeline(pipelineId: string): PipelineValidation {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    return {
      valid: false,
      errors: [`Pipeline "${pipelineId}" not found`],
      warnings: [],
      nodeCount: 0,
      connectionCount: 0,
      executionOrder: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for empty pipeline
  if (pipeline.nodes.length === 0) {
    errors.push("Pipeline has no nodes");
  }

  // Check for angle nodes without angleId
  for (const node of pipeline.nodes) {
    if (node.type === "angle" && !node.angleId) {
      errors.push(`Angle node "${node.id}" has no angleId configured`);
    }
    if (node.type === "angle" && node.angleId && !ANGLE_IDS.includes(node.angleId as AngleId)) {
      warnings.push(`Angle "${node.angleId}" in node "${node.id}" is a custom angle`);
    }
  }

  // Check for disconnected nodes
  const connectedNodes = new Set<string>();
  for (const conn of pipeline.connections) {
    connectedNodes.add(conn.sourceNodeId);
    connectedNodes.add(conn.targetNodeId);
  }
  const disconnected = pipeline.nodes.filter(
    (n) => !connectedNodes.has(n.id) && pipeline.nodes.length > 1
  );
  for (const node of disconnected) {
    warnings.push(`Node "${node.id}" is not connected to any other node`);
  }

  // Check for cycles (topological sort)
  const executionOrder = topologicalSort(pipeline);
  if (executionOrder.length < pipeline.nodes.length && pipeline.connections.length > 0) {
    errors.push("Pipeline contains a cycle — execution order cannot be determined");
  }

  // Check disabled nodes
  const disabledCount = pipeline.nodes.filter((n) => !n.enabled).length;
  if (disabledCount > 0) {
    warnings.push(`${disabledCount} node(s) are disabled`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: pipeline.nodes.length,
    connectionCount: pipeline.connections.length,
    executionOrder,
  };
}

/**
 * Topological sort of pipeline nodes.
 */
function topologicalSort(pipeline: AnglePipeline): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of pipeline.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const conn of pipeline.connections) {
    inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) ?? 0) + 1);
    adjacency.get(conn.sourceNodeId)?.push(conn.targetNodeId);
  }

  const queue = pipeline.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return order;
}

// ---- Templates ----

/**
 * Create a pipeline from a preset template.
 */
export function createFromTemplate(
  template: "basic" | "comprehensive" | "speed" | "deep-dive",
  name?: string
): AnglePipeline {
  const configs: Record<string, { angles: AngleId[]; description: string }> = {
    basic: {
      angles: ["scamper", "first-principles", "cross-domain"],
      description: "Basic 3-angle pipeline for quick innovation",
    },
    comprehensive: {
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
      description: "Full 8-angle pipeline for comprehensive exploration",
    },
    speed: {
      angles: ["scamper", "what-if"],
      description: "2-angle speed pipeline for rapid ideation",
    },
    "deep-dive": {
      angles: ["first-principles", "constraints", "inversion", "perspectives"],
      description: "4-angle deep-dive for thorough analysis",
    },
  };

  const config = configs[template];
  const pipeline = createPipeline(name ?? `${template} pipeline`, {
    description: config.description,
    tags: [template],
  });

  // Add angle nodes in a grid layout
  for (let i = 0; i < config.angles.length; i++) {
    addNode(pipeline.id, {
      id: `angle-${config.angles[i]}`,
      type: "angle",
      angleId: config.angles[i],
      label: config.angles[i],
      position: { x: 200, y: 100 + i * 120 },
      enabled: true,
    });
  }

  // Add output/merge node
  addNode(pipeline.id, {
    id: "output",
    type: "merge",
    label: "Synthesize",
    position: { x: 500, y: 100 + config.angles.length * 60 },
    enabled: true,
  });

  // Connect all angles to output
  for (const angle of config.angles) {
    addConnection(pipeline.id, `angle-${angle}`, "output");
  }

  return getPipeline(pipeline.id)!;
}

/**
 * Extract the angle execution order from a pipeline.
 */
export function extractAngleOrder(pipelineId: string): AngleId[] {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return [];

  const validation = validatePipeline(pipelineId);
  return validation.executionOrder
    .map((nodeId) => pipeline.nodes.find((n) => n.id === nodeId))
    .filter((n): n is StudioNode => n !== undefined && n.type === "angle" && n.enabled)
    .map((n) => n.angleId as AngleId)
    .filter(Boolean);
}

/**
 * Serialize a pipeline to JSON string.
 */
export function serializePipeline(pipelineId: string): string | undefined {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return undefined;
  return JSON.stringify(pipeline, null, 2);
}

/**
 * Deserialize and import a pipeline from JSON.
 */
export function importPipeline(json: string): AnglePipeline {
  const data = AnglePipelineSchema.parse(JSON.parse(json));
  data.updatedAt = new Date().toISOString();
  pipelines.set(data.id, data);
  return data;
}
