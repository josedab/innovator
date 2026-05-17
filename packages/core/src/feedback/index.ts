/**
 * @module feedback
 *
 * Feedback system for rating individual ideas and computing per-angle quality scores.
 * Stores feedback in ~/.innovator/feedback/ as JSON files.
 * Aggregated scores can be used to improve prompt templates.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Types ----

export const FeedbackRatingSchema = z.enum(["up", "down"]);
export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>;

export const IdeaFeedbackSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(),
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  rating: FeedbackRatingSchema,
  comment: z.string().max(2000).optional(),
  timestamp: z.string(),
});

export type IdeaFeedback = z.infer<typeof IdeaFeedbackSchema>;

export interface AngleQualityScore {
  angleId: string;
  totalFeedback: number;
  thumbsUp: number;
  thumbsDown: number;
  qualityScore: number;
  recentTrend: "improving" | "declining" | "stable";
  commonComplaints: string[];
}

export interface FeedbackSummary {
  totalFeedback: number;
  angleScores: AngleQualityScore[];
  bestAngle: string | null;
  worstAngle: string | null;
}

// ---- Storage ----

const FEEDBACK_DIR = join(homedir(), ".innovator", "feedback");

function ensureFeedbackDir(): void {
  if (!existsSync(FEEDBACK_DIR)) {
    mkdirSync(FEEDBACK_DIR, { recursive: true });
  }
}

/** Submit feedback for an idea.
 * @throws {z.ZodError} if the feedback data fails schema validation
 */
export function submitFeedback(params: {
  sessionId?: string;
  ideaTitle: string;
  angleId: string;
  rating: FeedbackRating;
  comment?: string;
}): string {
  ensureFeedbackDir();
  const id = randomUUID();
  const feedback = IdeaFeedbackSchema.parse({
    id,
    sessionId: params.sessionId,
    ideaTitle: params.ideaTitle,
    angleId: params.angleId,
    rating: params.rating,
    comment: params.comment,
    timestamp: new Date().toISOString(),
  });
  writeFileSync(join(FEEDBACK_DIR, `${id}.json`), JSON.stringify(feedback, null, 2), "utf-8");
  return id;
}

/** Load all feedback entries. */
export function loadAllFeedback(): IdeaFeedback[] {
  ensureFeedbackDir();
  const files = readdirSync(FEEDBACK_DIR).filter((f) => f.endsWith(".json"));
  const entries: IdeaFeedback[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(FEEDBACK_DIR, file), "utf-8");
      entries.push(IdeaFeedbackSchema.parse(JSON.parse(raw)));
    } catch {
      // Skip corrupt files
    }
  }
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Get feedback for a specific session. */
export function getSessionFeedback(sessionId: string): IdeaFeedback[] {
  return loadAllFeedback().filter((f) => f.sessionId === sessionId);
}

// ---- Aggregation ----

/** Compute per-angle quality scores from all feedback. */
export function computeAngleScores(): AngleQualityScore[] {
  const feedback = loadAllFeedback();
  const byAngle = new Map<string, IdeaFeedback[]>();

  for (const entry of feedback) {
    const existing = byAngle.get(entry.angleId) ?? [];
    existing.push(entry);
    byAngle.set(entry.angleId, existing);
  }

  const scores: AngleQualityScore[] = [];
  for (const [angleId, entries] of byAngle) {
    const thumbsUp = entries.filter((e) => e.rating === "up").length;
    const thumbsDown = entries.filter((e) => e.rating === "down").length;
    const total = entries.length;
    const qualityScore = total > 0 ? thumbsUp / total : 0.5;

    // Compute recent trend from last 10 entries
    const recent = entries.slice(0, 10);
    const recentUp = recent.filter((e) => e.rating === "up").length;
    const recentScore = recent.length > 0 ? recentUp / recent.length : 0.5;
    let recentTrend: "improving" | "declining" | "stable" = "stable";
    if (recent.length >= 3) {
      if (recentScore > qualityScore + 0.1) recentTrend = "improving";
      else if (recentScore < qualityScore - 0.1) recentTrend = "declining";
    }

    // Collect common complaints from down-rated entries
    const complaints = entries
      .filter((e) => e.rating === "down" && e.comment)
      .map((e) => e.comment!)
      .slice(0, 5);

    scores.push({
      angleId,
      totalFeedback: total,
      thumbsUp,
      thumbsDown,
      qualityScore: Math.round(qualityScore * 100) / 100,
      recentTrend,
      commonComplaints: complaints,
    });
  }

  return scores.sort((a, b) => b.qualityScore - a.qualityScore);
}

/** Generate a full feedback summary. */
export function getFeedbackSummary(): FeedbackSummary {
  const scores = computeAngleScores();
  const totalFeedback = scores.reduce((sum, s) => sum + s.totalFeedback, 0);

  return {
    totalFeedback,
    angleScores: scores,
    bestAngle: scores.length > 0 ? scores[0].angleId : null,
    worstAngle: scores.length > 0 ? scores[scores.length - 1].angleId : null,
  };
}

/**
 * Build a "feedback hint" string for prompt injection.
 * Identifies low-rated patterns and generates avoidance instructions.
 */
export function buildFeedbackHint(angleId: string): string | null {
  const scores = computeAngleScores();
  const angleScore = scores.find((s) => s.angleId === angleId);
  if (!angleScore || angleScore.totalFeedback < 3) return null;
  if (angleScore.qualityScore >= 0.7) return null;

  const complaints = angleScore.commonComplaints;
  if (complaints.length === 0) return null;

  return `QUALITY NOTE: Previous outputs for this angle received negative feedback. Common issues:\n${complaints.map((c) => `- ${c}`).join("\n")}\nPlease avoid these patterns and focus on actionable, specific ideas.`;
}
