/**
 * @module knowledge-graph/types
 *
 * Shared schemas and types for the persistent knowledge graph.
 */

import { z } from "zod";

export const EntityNodeSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  type: z.enum([
    "concept",
    "technology",
    "challenge",
    "opportunity",
    "person",
    "organization",
    "domain",
  ]),
  description: z.string().max(2000).optional(),
  sourceSessionIds: z.array(z.string()),
  firstSeen: z.string(),
  lastSeen: z.string(),
  occurrenceCount: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RelationshipEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum([
    "related_to",
    "enables",
    "challenges",
    "part_of",
    "derived_from",
    "contrasts_with",
  ]),
  weight: z.number().min(0).max(1),
  sourceSessionIds: z.array(z.string()),
  label: z.string().max(200).optional(),
});

export const KnowledgeGraphSchema = z.object({
  nodes: z.array(EntityNodeSchema),
  edges: z.array(RelationshipEdgeSchema),
  lastUpdated: z.string(),
  sessionCount: z.number(),
});

export type EntityNode = z.infer<typeof EntityNodeSchema>;
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>;
export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;
