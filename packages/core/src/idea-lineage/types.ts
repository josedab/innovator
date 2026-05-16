/**
 * @module idea-lineage
 *
 * Idea Lineage Visualization — data model and graph builder for tracing
 * how ideas evolve across sessions: investigation → angles → gauntlet →
 * evolution → merge. Outputs graph data suitable for D3.js or React Flow.
 */

import { z } from "zod";

// ---- Lineage Node ----

export const LineageNodeTypeSchema = z.enum([
  "investigation",
  "angle",
  "idea",
  "gauntlet-result",
  "evolution",
  "merge",
  "session",
  "synthesis",
]);

export type LineageNodeType = z.infer<typeof LineageNodeTypeSchema>;

export const LineageNodeSchema = z.object({
  id: z.string().max(200),
  type: LineageNodeTypeSchema,
  label: z.string().max(500),
  /** Session ID where this node was created. */
  sessionId: z.string().max(200).optional(),
  /** Timestamp of creation. */
  createdAt: z.string(),
  /** Associated score if available. */
  score: z.number().min(0).max(100).optional(),
  /** Visual metadata. */
  metadata: z.record(z.string(), z.string().max(500)).optional(),
  /** Position hint for layout (optional). */
  x: z.number().optional(),
  y: z.number().optional(),
});

export type LineageNode = z.infer<typeof LineageNodeSchema>;

// ---- Lineage Edge ----

export const LineageEdgeTypeSchema = z.enum([
  "investigated-by",
  "generated-from",
  "survived-gauntlet",
  "failed-gauntlet",
  "evolved-into",
  "merged-with",
  "synthesized-from",
  "inspired-by",
]);

export type LineageEdgeType = z.infer<typeof LineageEdgeTypeSchema>;

export const LineageEdgeSchema = z.object({
  id: z.string().max(200),
  source: z.string().max(200),
  target: z.string().max(200),
  type: LineageEdgeTypeSchema,
  /** Edge label. */
  label: z.string().max(300).optional(),
  /** Edge weight for visualization (0–1). */
  weight: z.number().min(0).max(1).optional(),
  createdAt: z.string(),
});

export type LineageEdge = z.infer<typeof LineageEdgeSchema>;

// ---- Lineage Graph ----

export const LineageGraphSchema = z.object({
  id: z.string().max(200),
  /** Root subject. */
  subject: z.string().max(500),
  nodes: z.array(LineageNodeSchema).max(1000),
  edges: z.array(LineageEdgeSchema).max(5000),
  /** Depth of the graph (longest path from root). */
  depth: z.number().int().min(0),
  /** Total sessions contributing. */
  sessionCount: z.number().int().min(0),
  generatedAt: z.string(),
});

export type LineageGraph = z.infer<typeof LineageGraphSchema>;

// ---- Config ----

export interface LineageConfig {
  /** Maximum depth to traverse. */
  maxDepth?: number;
  /** Include gauntlet failure paths. */
  includeFailures?: boolean;
  /** Filter by session IDs. */
  sessionIds?: string[];
}
