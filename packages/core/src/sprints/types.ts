/**
 * @module sprints
 *
 * Innovation Sprints Framework — structured time-boxed innovation sprints
 * with auto-generated agendas, timed phases, facilitation prompts, and
 * retrospective analytics.
 */

import { z } from "zod";

// ---- Sprint Phases ----

export const SprintPhaseTypeSchema = z.enum([
  "investigate",
  "diverge",
  "converge",
  "stress-test",
  "prioritize",
  "retrospective",
  "break",
  "custom",
]);

export type SprintPhaseType = z.infer<typeof SprintPhaseTypeSchema>;

export const SprintPhaseSchema = z.object({
  id: z.string().max(100),
  type: SprintPhaseTypeSchema,
  name: z.string().max(200),
  /** Duration in minutes. */
  durationMinutes: z.number().int().min(1).max(480),
  /** Facilitation prompt / instructions. */
  facilitationPrompt: z.string().max(3000),
  /** Phase status. */
  status: z.enum(["pending", "active", "completed", "skipped"]),
  /** Actual start time. */
  startedAt: z.string().optional(),
  /** Actual end time. */
  completedAt: z.string().optional(),
  /** Output/artifacts from this phase. */
  outputs: z.array(z.string().max(2000)).max(50).optional(),
});

export type SprintPhase = z.infer<typeof SprintPhaseSchema>;

// ---- Sprint Template ----

export const SprintTemplateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  /** Total duration in minutes. */
  totalMinutes: z.number().int().min(15).max(480),
  /** Format category. */
  format: z.enum(["lightning", "half-day", "full-day", "async"]),
  /** Ordered phases. */
  phases: z.array(SprintPhaseSchema).max(20),
  /** Target team size. */
  teamSize: z.object({
    min: z.number().int().min(1),
    max: z.number().int().max(100),
  }),
});

export type SprintTemplate = z.infer<typeof SprintTemplateSchema>;

// ---- Sprint Instance ----

export const SprintStatusSchema = z.enum([
  "draft",
  "ready",
  "in-progress",
  "paused",
  "completed",
  "cancelled",
]);

export const SprintSchema = z.object({
  id: z.string().max(200),
  templateId: z.string().max(100),
  subject: z.string().max(500),
  status: SprintStatusSchema,
  phases: z.array(SprintPhaseSchema),
  currentPhaseIndex: z.number().int().min(-1),
  /** Participants. */
  participants: z.array(z.string().max(200)).max(100),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  /** Collected ideas. */
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(3000).optional(),
        phase: z.string().max(100),
        author: z.string().max(200).optional(),
        votes: z.number().int().min(0).optional(),
      })
    )
    .max(200),
});

export type Sprint = z.infer<typeof SprintSchema>;

// ---- Retrospective ----

export const SprintRetrospectiveSchema = z.object({
  sprintId: z.string().max(200),
  /** Total ideas generated. */
  totalIdeas: z.number().int().min(0),
  /** Ideas per phase. */
  ideasPerPhase: z.record(z.string(), z.number().int().min(0)),
  /** Time utilization (actual vs planned). */
  timeUtilization: z.number().min(0).max(2),
  /** Phase completion rates. */
  phaseCompletionRate: z.number().min(0).max(1),
  /** Participant engagement score (0–100). */
  engagementScore: z.number().min(0).max(100),
  /** What went well. */
  wentWell: z.array(z.string().max(500)).max(20),
  /** What could improve. */
  couldImprove: z.array(z.string().max(500)).max(20),
  /** Action items for next sprint. */
  actionItems: z.array(z.string().max(500)).max(20),
  generatedAt: z.string(),
});

export type SprintRetrospective = z.infer<typeof SprintRetrospectiveSchema>;

// ---- Config ----

export interface SprintConfig {
  /** Template ID to use. */
  templateId?: string;
  /** Custom phase durations (override template). */
  phaseDurations?: Record<string, number>;
  /** LLM model. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
}
