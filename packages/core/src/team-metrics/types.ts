import { z } from "zod";

/** Types of trackable innovation events. */
export type InnovationEventType =
  | "session-start"
  | "idea-generated"
  | "idea-scored"
  | "idea-implemented"
  | "session-completed"
  | "idea-exported";

/** A single innovation event. */
export interface InnovationEvent {
  id: string;
  type: InnovationEventType;
  userId: string;
  teamId: string;
  sessionId?: string;
  ideaId?: string;
  angleId?: string;
  qualityScore?: number;
  metadata?: Record<string, string>;
  timestamp: string;
}

/** Weekly/monthly metrics for a team. */
export interface TeamMetrics {
  teamId: string;
  period: string; // ISO date for the period start
  periodType: "weekly" | "monthly";
  ideasGenerated: number;
  ideasImplemented: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  avgQualityScore: number;
  qualityTrend: number; // -1 to 1 (declining to improving)
  ideaVelocity: number; // ideas per active day
  implementationRate: number; // implemented / generated
  topAngles: Array<{ angleId: string; count: number; avgScore: number }>;
  memberActivity: Array<{ userId: string; ideas: number; sessions: number; avgScore: number }>;
  currentStreak: number; // consecutive active days
}

/** Team leaderboard entry. */
export interface LeaderboardEntry {
  userId: string;
  teamId: string;
  totalIdeas: number;
  avgQualityScore: number;
  qualityWeightedScore: number;
  sessionsCompleted: number;
  currentStreak: number;
  rank: number;
}

/** Zod schema for recording an event. */
export const RecordEventSchema = z.object({
  type: z.enum([
    "session-start",
    "idea-generated",
    "idea-scored",
    "idea-implemented",
    "session-completed",
    "idea-exported",
  ]),
  userId: z.string().min(1).max(100),
  teamId: z.string().min(1).max(100),
  sessionId: z.string().max(100).optional(),
  ideaId: z.string().max(100).optional(),
  angleId: z.string().max(100).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
  metadata: z.record(z.string().max(500)).optional(),
});
