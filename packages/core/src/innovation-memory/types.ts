/**
 * @module innovation-memory/types
 *
 * Types for the Innovation Memory & Learning Loop — persistent cross-session
 * memory that tracks angle effectiveness, detects patterns, surfaces
 * serendipitous connections, and delivers context-aware recommendations.
 */

import { z } from "zod";

// ---- Memory Node ----

export const MemoryNodeTypeSchema = z.enum([
  "concept",
  "idea",
  "investigation",
  "angle",
  "domain",
  "pattern",
  "connection",
]);
export type MemoryNodeType = z.infer<typeof MemoryNodeTypeSchema>;

export const MemoryNodeSchema = z.object({
  id: z.string().max(200),
  type: MemoryNodeTypeSchema,
  label: z.string().max(500),
  description: z.string().max(2000).optional(),
  sessionIds: z.array(z.string().max(200)).max(100),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  occurrenceCount: z.number().int().min(1),
  effectivenessScore: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type MemoryNode = z.infer<typeof MemoryNodeSchema>;

// ---- Memory Edge ----

export const MemoryEdgeTypeSchema = z.enum([
  "related",
  "enables",
  "derived-from",
  "contradicts",
  "synergy",
  "recurrent",
  "serendipitous",
]);
export type MemoryEdgeType = z.infer<typeof MemoryEdgeTypeSchema>;

export const MemoryEdgeSchema = z.object({
  source: z.string().max(200),
  target: z.string().max(200),
  type: MemoryEdgeTypeSchema,
  weight: z.number().min(0).max(1).default(0.5),
  evidence: z.string().max(1000).optional(),
  sessionIds: z.array(z.string().max(200)).max(100),
  createdAt: z.string(),
});
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>;

// ---- Memory Graph ----

export const MemoryGraphSchema = z.object({
  nodes: z.array(MemoryNodeSchema).max(10000),
  edges: z.array(MemoryEdgeSchema).max(50000),
  lastUpdatedAt: z.string(),
  totalSessions: z.number().int().min(0),
});
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>;

// ---- Recommendation ----

export const RecommendationTypeSchema = z.enum([
  "pre-session",
  "mid-session-nudge",
  "angle-suggestion",
  "connection-alert",
  "pattern-insight",
  "domain-expertise",
]);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

export const MemoryRecommendationSchema = z.object({
  id: z.string().max(200),
  type: RecommendationTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  relatedNodes: z.array(z.string().max(200)).max(20),
  relatedSessions: z.array(z.string().max(200)).max(10),
  actionable: z.boolean().default(true),
  suggestedAngle: z.string().max(100).optional(),
  suggestedSubject: z.string().max(500).optional(),
  createdAt: z.string(),
});
export type MemoryRecommendation = z.infer<typeof MemoryRecommendationSchema>;

// ---- Analytics Event ----

export const InnovationEventTypeSchema = z.enum([
  "session.started",
  "session.completed",
  "session.exported",
  "investigation.completed",
  "angle.generated",
  "angle.rated",
  "idea.created",
  "idea.accepted",
  "idea.rejected",
  "synthesis.completed",
  "debate.completed",
  "redteam.completed",
  "pipeline.started",
  "pipeline.completed",
  "pipeline.failed",
  "recommendation.shown",
  "recommendation.accepted",
  "recommendation.dismissed",
  "collaboration.joined",
  "collaboration.voted",
]);
export type InnovationEventType = z.infer<typeof InnovationEventTypeSchema>;

export const InnovationEventSchema = z.object({
  id: z.string().max(200),
  type: InnovationEventTypeSchema,
  sessionId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  timestamp: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  metadata: z
    .object({
      subject: z.string().max(500).optional(),
      angleId: z.string().max(100).optional(),
      domain: z.string().max(200).optional(),
      model: z.string().max(100).optional(),
      durationMs: z.number().int().min(0).optional(),
      ideaCount: z.number().int().min(0).optional(),
      qualityScore: z.number().min(0).max(100).optional(),
    })
    .optional(),
});
export type InnovationEvent = z.infer<typeof InnovationEventSchema>;

// ---- Domain Profile ----

export const DomainProfileSchema = z.object({
  domain: z.string().max(200),
  sessionCount: z.number().int().min(0),
  topAngles: z
    .array(
      z.object({
        angleId: z.string().max(100),
        effectivenessScore: z.number().min(0).max(1),
        usageCount: z.number().int().min(0),
      })
    )
    .max(10),
  commonPatterns: z.array(z.string().max(500)).max(20),
  averageQuality: z.number().min(0).max(100),
  lastActiveAt: z.string(),
});
export type DomainProfile = z.infer<typeof DomainProfileSchema>;
