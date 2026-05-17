/**
 * @module realtime/facilitation-ai
 *
 * AI Facilitation Engine — automated session timing, groupthink detection,
 * balanced participation enforcement, and smart phase transitions
 * for collaborative war room sessions.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { WarRoom } from "./war-room.js";

// ---- Schemas ----

export const FacilitationAlertSchema = z.object({
  id: z.string(),
  type: z.enum([
    "groupthink-detected",
    "low-participation",
    "time-warning",
    "phase-ready",
    "dominant-speaker",
    "stale-discussion",
    "consensus-reached",
    "divergent-opinions",
  ]),
  severity: z.enum(["info", "warning", "action-required"]),
  message: z.string().max(500),
  suggestion: z.string().max(500),
  targetUserIds: z.array(z.string().max(200)).max(50).default([]),
  timestamp: z.string(),
  dismissed: z.boolean().default(false),
});
export type FacilitationAlert = z.infer<typeof FacilitationAlertSchema>;

export const PhaseTimingSchema = z.object({
  phase: z.string(),
  durationMinutes: z.number().min(1).max(120),
  warningAtMinutes: z.number().min(1),
  autoAdvance: z.boolean().default(false),
});
export type PhaseTiming = z.infer<typeof PhaseTimingSchema>;

export const ParticipationStatsSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  ideasSubmitted: z.number().int().min(0),
  votesGiven: z.number().int().min(0),
  canvasEdits: z.number().int().min(0),
  participationScore: z.number().min(0).max(1),
  lastActivity: z.string(),
});
export type ParticipationStats = z.infer<typeof ParticipationStatsSchema>;

export const FacilitationReportSchema = z.object({
  roomId: z.string(),
  alerts: z.array(FacilitationAlertSchema),
  participation: z.array(ParticipationStatsSchema),
  groupthinkRisk: z.number().min(0).max(1),
  participationBalance: z.number().min(0).max(1),
  phaseTimings: z.array(
    z.object({
      phase: z.string(),
      durationMinutes: z.number(),
      onTime: z.boolean(),
    })
  ),
  recommendations: z.array(z.string().max(300)),
  generatedAt: z.string(),
});
export type FacilitationReport = z.infer<typeof FacilitationReportSchema>;

// ---- Default Phase Timings ----

export const DEFAULT_PHASE_TIMINGS: PhaseTiming[] = [
  { phase: "lobby", durationMinutes: 5, warningAtMinutes: 4, autoAdvance: false },
  { phase: "investigation", durationMinutes: 15, warningAtMinutes: 12, autoAdvance: false },
  { phase: "ideation", durationMinutes: 25, warningAtMinutes: 20, autoAdvance: false },
  { phase: "scoring", durationMinutes: 10, warningAtMinutes: 8, autoAdvance: false },
  { phase: "synthesis", durationMinutes: 15, warningAtMinutes: 12, autoAdvance: false },
  { phase: "review", durationMinutes: 10, warningAtMinutes: 8, autoAdvance: false },
];

// ---- Groupthink Detection ----

/**
 * Detect groupthink risk based on voting patterns and idea similarity.
 * Returns 0-1 score where 1 = high groupthink risk.
 */
export function detectGroupthink(room: WarRoom): {
  risk: number;
  indicators: string[];
} {
  const indicators: string[] = [];
  let riskScore = 0;

  const participants = room.members.filter(
    (m) => m.role === "participant" || m.role === "facilitator"
  );
  if (participants.length < 2) return { risk: 0, indicators: [] };

  // 1. Voting unanimity — if everyone votes the same way
  if (room.votes.length > 0) {
    const ideaVotes = new Map<string, number[]>();
    for (const vote of room.votes) {
      const votes = ideaVotes.get(vote.ideaId) ?? [];
      votes.push(vote.value);
      ideaVotes.set(vote.ideaId, votes);
    }

    let unanimousCount = 0;
    let totalVotedIdeas = 0;
    for (const [, votes] of ideaVotes) {
      if (votes.length < 2) continue;
      totalVotedIdeas++;
      const allSame = votes.every((v) => v === votes[0]);
      if (allSame) unanimousCount++;
    }

    if (totalVotedIdeas > 0) {
      const unanimityRate = unanimousCount / totalVotedIdeas;
      if (unanimityRate > 0.8) {
        riskScore += 0.3;
        indicators.push(`High voting unanimity (${Math.round(unanimityRate * 100)}%)`);
      }
    }
  }

  // 2. Idea clustering — if all ideas come from few people
  const canvasAuthors = new Map<string, number>();
  for (const obj of room.canvas) {
    canvasAuthors.set(obj.createdBy, (canvasAuthors.get(obj.createdBy) ?? 0) + 1);
  }
  if (canvasAuthors.size > 0 && participants.length > 2) {
    const authorCount = canvasAuthors.size;
    const participationRate = authorCount / participants.length;
    if (participationRate < 0.5) {
      riskScore += 0.25;
      indicators.push(
        `Only ${Math.round(participationRate * 100)}% of participants contributing ideas`
      );
    }
  }

  // 3. No dissenting votes
  if (room.votes.length > 3) {
    const negativeVotes = room.votes.filter((v) => v.value < 0);
    if (negativeVotes.length === 0) {
      riskScore += 0.2;
      indicators.push("No dissenting votes — consider playing devil's advocate");
    }
  }

  // 4. Rapid convergence without exploration
  if (room.canvas.length > 0 && room.canvas.length < participants.length) {
    riskScore += 0.15;
    indicators.push("Fewer ideas than participants — encourage more divergent thinking");
  }

  return {
    risk: Math.min(1, +riskScore.toFixed(3)),
    indicators,
  };
}

// ---- Participation Balance ----

/** Compute participation stats for all war room members. */
export function computeParticipationStats(room: WarRoom): ParticipationStats[] {
  const participants = room.members.filter((m) => m.role !== "observer");

  return participants.map((member) => {
    const ideasSubmitted = room.canvas.filter((o) => o.createdBy === member.userId).length;
    const votesGiven = room.votes.filter((v) => v.userId === member.userId).length;
    const canvasEdits = room.operations.filter((o) => o.userId === member.userId).length;

    const total = ideasSubmitted + votesGiven + canvasEdits;
    const maxExpected =
      Math.max(room.canvas.length, 1) + Math.max(room.votes.length / participants.length, 1);
    const participationScore = Math.min(1, total / maxExpected);

    return {
      userId: member.userId,
      displayName: member.displayName,
      ideasSubmitted,
      votesGiven,
      canvasEdits,
      participationScore: +participationScore.toFixed(3),
      lastActivity: member.lastActivity,
    };
  });
}

/** Detect participation imbalances and generate alerts. */
export function detectParticipationImbalance(room: WarRoom): FacilitationAlert[] {
  const alerts: FacilitationAlert[] = [];
  const stats = computeParticipationStats(room);
  const participants = stats.filter(
    (s) => s.participationScore > 0 || s.ideasSubmitted > 0 || s.votesGiven > 0
  );

  if (participants.length < 2) return alerts;

  // Detect dominant speaker
  const sortedByActivity = [...stats].sort((a, b) => b.participationScore - a.participationScore);
  const topParticipant = sortedByActivity[0];
  const avgScore = stats.reduce((sum, s) => sum + s.participationScore, 0) / stats.length;

  if (topParticipant.participationScore > avgScore * 2.5 && stats.length > 2) {
    alerts.push({
      id: randomUUID(),
      type: "dominant-speaker",
      severity: "warning",
      message: `${topParticipant.displayName} is contributing significantly more than others`,
      suggestion: "Consider inviting quieter participants to share their perspectives",
      targetUserIds: [topParticipant.userId],
      timestamp: new Date().toISOString(),
      dismissed: false,
    });
  }

  // Detect low participation
  const lowParticipants = stats.filter((s) => s.participationScore < 0.1 && s.ideasSubmitted === 0);
  if (lowParticipants.length > 0 && room.phase !== "lobby") {
    alerts.push({
      id: randomUUID(),
      type: "low-participation",
      severity: "action-required",
      message: `${lowParticipants.length} participant(s) haven't contributed yet`,
      suggestion: "Try direct prompts or breakout activities to engage all participants",
      targetUserIds: lowParticipants.map((p) => p.userId),
      timestamp: new Date().toISOString(),
      dismissed: false,
    });
  }

  return alerts;
}

// ---- Facilitation Report ----

/** Generate a comprehensive facilitation report for a war room session. */
export function generateFacilitationReport(room: WarRoom): FacilitationReport {
  const groupthinkResult = detectGroupthink(room);
  const participationStats = computeParticipationStats(room);
  const participationAlerts = detectParticipationImbalance(room);

  // Compute participation balance (Gini coefficient inverse)
  const scores = participationStats.map((s) => s.participationScore);
  let balance = 1;
  if (scores.length > 1) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (mean > 0) {
      const gini =
        scores.reduce((sum, s) => {
          return sum + scores.reduce((inner, t) => inner + Math.abs(s - t), 0);
        }, 0) /
        (2 * scores.length * scores.length * mean);
      balance = Math.max(0, +(1 - gini).toFixed(3));
    }
  }

  // Build alerts
  const alerts = [...participationAlerts];

  if (groupthinkResult.risk > 0.5) {
    alerts.push({
      id: randomUUID(),
      type: "groupthink-detected",
      severity: "warning",
      message: `Groupthink risk is ${Math.round(groupthinkResult.risk * 100)}%`,
      suggestion: "Introduce devil's advocate role or anonymous idea submission",
      targetUserIds: [],
      timestamp: new Date().toISOString(),
      dismissed: false,
    });
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (groupthinkResult.risk > 0.3) {
    recommendations.push("Consider using anonymous voting to reduce conformity bias");
  }
  if (balance < 0.5) {
    recommendations.push("Use round-robin or structured turns to ensure balanced participation");
  }
  if (room.canvas.length === 0 && room.phase !== "lobby") {
    recommendations.push("No ideas on canvas yet — consider starting with silent brainstorming");
  }
  if (room.votes.length === 0 && room.phase === "scoring") {
    recommendations.push("Voting hasn't started — remind participants to evaluate ideas");
  }

  return {
    roomId: room.id,
    alerts,
    participation: participationStats,
    groupthinkRisk: groupthinkResult.risk,
    participationBalance: balance,
    phaseTimings: [],
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Phase Timer Management ----

export interface PhaseTimerState {
  phase: string;
  startedAt: string;
  durationMinutes: number;
  elapsedMs: number;
  remainingMs: number;
  isOvertime: boolean;
  warningIssued: boolean;
  progress: number; // 0-1
}

const phaseStartTimes = new Map<
  string,
  { phase: string; startedAt: number; durationMinutes: number; warningIssued: boolean }
>();

/** Start a phase timer for a war room. */
export function startPhaseTimer(
  roomId: string,
  phase: string,
  durationMinutes?: number
): PhaseTimerState {
  const timing = DEFAULT_PHASE_TIMINGS.find((t) => t.phase === phase);
  const duration = durationMinutes ?? timing?.durationMinutes ?? 15;

  phaseStartTimes.set(roomId, {
    phase,
    startedAt: Date.now(),
    durationMinutes: duration,
    warningIssued: false,
  });

  return getPhaseTimerState(roomId)!;
}

/** Get current phase timer state. */
export function getPhaseTimerState(roomId: string): PhaseTimerState | null {
  const timer = phaseStartTimes.get(roomId);
  if (!timer) return null;

  const elapsedMs = Date.now() - timer.startedAt;
  const totalMs = timer.durationMinutes * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const isOvertime = elapsedMs > totalMs;
  const progress = Math.min(1, elapsedMs / totalMs);

  // Auto-issue warning at configured threshold
  const timing = DEFAULT_PHASE_TIMINGS.find((t) => t.phase === timer.phase);
  const warningThresholdMs = (timing?.warningAtMinutes ?? timer.durationMinutes * 0.8) * 60 * 1000;
  if (elapsedMs >= warningThresholdMs && !timer.warningIssued) {
    timer.warningIssued = true;
  }

  return {
    phase: timer.phase,
    startedAt: new Date(timer.startedAt).toISOString(),
    durationMinutes: timer.durationMinutes,
    elapsedMs,
    remainingMs,
    isOvertime,
    warningIssued: timer.warningIssued,
    progress: +progress.toFixed(3),
  };
}

/** Stop and record a phase timer. Returns the final elapsed time. */
export function stopPhaseTimer(roomId: string): { phase: string; elapsedMs: number } | null {
  const timer = phaseStartTimes.get(roomId);
  if (!timer) return null;
  const result = { phase: timer.phase, elapsedMs: Date.now() - timer.startedAt };
  phaseStartTimes.delete(roomId);
  return result;
}

/** Check if a phase should auto-advance based on timer. */
export function shouldAutoAdvance(roomId: string): boolean {
  const state = getPhaseTimerState(roomId);
  if (!state) return false;
  const timing = DEFAULT_PHASE_TIMINGS.find((t) => t.phase === state.phase);
  return (timing?.autoAdvance ?? false) && state.isOvertime;
}

// ---- Consensus Detection ----

export interface ConsensusResult {
  hasConsensus: boolean;
  consensusLevel: number; // 0-1
  topIdeas: Array<{ ideaId: string; votes: number; avgScore: number }>;
  disagreements: Array<{ ideaId: string; variance: number }>;
  recommendation: string;
}

/** Detect voting consensus in a war room. */
export function detectConsensus(room: WarRoom, threshold: number = 0.7): ConsensusResult {
  const ideaVotes = new Map<string, number[]>();

  for (const vote of room.votes) {
    const votes = ideaVotes.get(vote.ideaId) ?? [];
    votes.push(vote.value);
    ideaVotes.set(vote.ideaId, votes);
  }

  if (ideaVotes.size === 0) {
    return {
      hasConsensus: false,
      consensusLevel: 0,
      topIdeas: [],
      disagreements: [],
      recommendation: "No votes cast yet — initiate voting to gauge consensus.",
    };
  }

  const ideaStats: Array<{ ideaId: string; votes: number; avgScore: number; variance: number }> =
    [];

  for (const [ideaId, votes] of ideaVotes) {
    const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
    const variance = votes.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / votes.length;
    ideaStats.push({
      ideaId,
      votes: votes.length,
      avgScore: +avg.toFixed(2),
      variance: +variance.toFixed(3),
    });
  }

  // Sort by average score descending
  ideaStats.sort((a, b) => b.avgScore - a.avgScore);

  // Consensus = low variance + clear winner
  const topIdea = ideaStats[0];
  const secondIdea = ideaStats[1];
  const participants = room.members.filter((m) => m.role !== "observer").length;
  const voteCoverage = topIdea ? topIdea.votes / Math.max(participants, 1) : 0;

  // Score consensus: low variance, high coverage, clear gap between #1 and #2
  let consensusLevel = 0;
  if (topIdea) {
    const variancePenalty = Math.min(1, topIdea.variance);
    const gapBonus = secondIdea
      ? Math.min(0.3, (topIdea.avgScore - secondIdea.avgScore) * 0.3)
      : 0.2;
    consensusLevel = Math.max(
      0,
      Math.min(1, voteCoverage * 0.4 + (1 - variancePenalty) * 0.4 + gapBonus)
    );
  }

  const hasConsensus = consensusLevel >= threshold;

  const disagreements = ideaStats
    .filter((s) => s.variance > 0.5)
    .map((s) => ({ ideaId: s.ideaId, variance: s.variance }));

  let recommendation: string;
  if (hasConsensus) {
    recommendation = "Strong consensus reached — ready to proceed with the top idea.";
  } else if (consensusLevel > 0.4) {
    recommendation =
      "Partial consensus — consider a brief discussion to resolve remaining disagreements.";
  } else {
    recommendation = "No consensus yet — try structured debate or dot-voting to narrow options.";
  }

  return {
    hasConsensus,
    consensusLevel: +consensusLevel.toFixed(3),
    topIdeas: ideaStats.slice(0, 5).map((s) => ({
      ideaId: s.ideaId,
      votes: s.votes,
      avgScore: s.avgScore,
    })),
    disagreements,
    recommendation,
  };
}

/** Clear facilitation data (for testing). */
export function clearFacilitationData(): void {
  phaseStartTimes.clear();
}
