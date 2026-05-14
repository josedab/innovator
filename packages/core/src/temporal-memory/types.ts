/**
 * @module temporal-memory
 *
 * Temporal Innovation Memory — persistent knowledge graph with temporal
 * dimensions. Tracks concept evolution, idea genealogy, outcome causality,
 * and cross-session connections over time. Supports natural-language
 * temporal queries and recurrence detection.
 */

import { z } from "zod";

// ---- Temporal Node ----

export const TemporalNodeTypeSchema = z.enum([
  "concept",
  "idea",
  "outcome",
  "session",
  "angle",
  "theme",
  "challenge",
  "opportunity",
]);

export type TemporalNodeType = z.infer<typeof TemporalNodeTypeSchema>;

export const TemporalNodeSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(500),
  type: TemporalNodeTypeSchema,
  createdAt: z.string(),
  modifiedAt: z.string(),
  obsoletedAt: z.string().optional(),
  confidence: z.number().min(0).max(1),
  sessionIds: z.array(z.string().max(200)),
  occurrenceCount: z.number().int().min(1),
  metadata: z.record(z.string().max(2000)).optional(),
});

export type TemporalNode = z.infer<typeof TemporalNodeSchema>;

// ---- Temporal Edge ----

export const TemporalEdgeTypeSchema = z.enum([
  "evolved_into",
  "caused",
  "recurs_as",
  "contradicts",
  "enables",
  "part_of",
  "similar_to",
  "derived_from",
  "invalidates",
]);

export type TemporalEdgeType = z.infer<typeof TemporalEdgeTypeSchema>;

export const TemporalEdgeSchema = z.object({
  id: z.string().max(200),
  source: z.string().max(200),
  target: z.string().max(200),
  type: TemporalEdgeTypeSchema,
  timestamp: z.string(),
  strength: z.number().min(0).max(1),
  evidence: z.string().max(2000).optional(),
  sessionId: z.string().max(200).optional(),
});

export type TemporalEdge = z.infer<typeof TemporalEdgeSchema>;

// ---- Temporal Graph ----

export const TemporalGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(TemporalNodeSchema),
  edges: z.array(TemporalEdgeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TemporalGraph = z.infer<typeof TemporalGraphSchema>;

// ---- Query Types ----

export interface TemporalQuery {
  question: string;
  timeRange?: { from: string; to: string };
  conceptFilter?: string[];
  nodeTypes?: TemporalNodeType[];
  maxResults?: number;
}

export interface TemporalQueryResult {
  narrative: string;
  matchingNodes: TemporalNode[];
  matchingEdges: TemporalEdge[];
  timeline: Array<{
    timestamp: string;
    event: string;
    nodeId: string;
  }>;
  recurrences: Array<{
    concept: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    sessions: string[];
  }>;
}

// ---- Recurrence ----

export interface ConceptRecurrence {
  concept: string;
  nodeId: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sessions: string[];
}

// ---- Innovation Velocity ----

export interface InnovationVelocity {
  period: string;
  ideasPerMonth: number;
  conceptEvolutionRate: number;
  outcomeLeadTimeDays: number | null;
  activeConcepts: number;
  newConcepts: number;
  obsoletedConcepts: number;
}

// ---- Ingestion ----

export interface SessionIngestion {
  sessionId: string;
  subject: string;
  investigation?: {
    summary: string;
    keyAspects: Array<{ title: string; description: string }>;
    challenges: string[];
    opportunities: string[];
  };
  ideas: Array<{
    title: string;
    description: string;
    angleId: string;
  }>;
  themes?: string[];
  outcome?: {
    status: "shipped" | "abandoned" | "in-progress" | "evolved";
    reasoning?: string;
  };
  timestamp: string;
}
