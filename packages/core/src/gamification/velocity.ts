/**
 * @module gamification/velocity
 *
 * Innovation velocity metrics and leaderboards.
 */

import { z } from "zod";

export const VelocityMetricsSchema = z.object({
  userId: z.string().max(200),
  period: z.string().max(20),
  ideasGenerated: z.number().int().min(0),
  sessionsCompleted: z.number().int().min(0),
  avgIdeaQuality: z.number().min(0).max(10),
  anglesExplored: z.number().int().min(0),
  velocityScore: z.number().min(0).max(100),
  rank: z.number().int().min(1).optional(),
});
export type VelocityMetrics = z.infer<typeof VelocityMetricsSchema>;

export interface VelocityActivity {
  userId: string;
  timestamp: string;
  ideasGenerated?: number;
  sessionsCompleted?: number;
  avgIdeaQuality?: number;
  anglesExplored?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function filterActivitiesByDays(
  userId: string,
  activities: VelocityActivity[],
  days: number
): VelocityActivity[] {
  const cutoff = Date.now() - days * 86_400_000;
  return activities.filter(
    (activity) => activity.userId === userId && new Date(activity.timestamp).getTime() >= cutoff
  );
}

function buildVelocityMetrics(
  userId: string,
  period: string,
  activities: VelocityActivity[]
): VelocityMetrics {
  const ideasGenerated = activities.reduce(
    (sum, activity) => sum + (activity.ideasGenerated ?? 0),
    0
  );
  const sessionsCompleted = activities.reduce(
    (sum, activity) => sum + (activity.sessionsCompleted ?? 0),
    0
  );
  const anglesExplored = activities.reduce(
    (sum, activity) => sum + (activity.anglesExplored ?? 0),
    0
  );

  const qualityWeight = activities.reduce(
    (sum, activity) =>
      sum + Math.max(activity.ideasGenerated ?? activity.sessionsCompleted ?? 1, 1),
    0
  );
  const weightedQuality = activities.reduce((sum, activity) => {
    const weight = Math.max(activity.ideasGenerated ?? activity.sessionsCompleted ?? 1, 1);
    return sum + (activity.avgIdeaQuality ?? 0) * weight;
  }, 0);
  const avgIdeaQuality = qualityWeight > 0 ? weightedQuality / qualityWeight : 0;

  return VelocityMetricsSchema.parse({
    userId,
    period,
    ideasGenerated,
    sessionsCompleted,
    avgIdeaQuality: roundToTenth(clamp(avgIdeaQuality, 0, 10)),
    anglesExplored,
    velocityScore: computeVelocityScore({
      ideas: ideasGenerated,
      sessions: sessionsCompleted,
      quality: avgIdeaQuality,
      angles: anglesExplored,
    }),
  });
}

export function computeVelocityScore(input: {
  ideas: number;
  sessions: number;
  quality: number;
  angles: number;
}): number {
  const ideaComponent = (clamp(input.ideas, 0, 20) / 20) * 35;
  const sessionComponent = (clamp(input.sessions, 0, 10) / 10) * 25;
  const qualityComponent = (clamp(input.quality, 0, 10) / 10) * 25;
  const angleComponent = (clamp(input.angles, 0, 8) / 8) * 15;

  return roundToTenth(
    clamp(ideaComponent + sessionComponent + qualityComponent + angleComponent, 0, 100)
  );
}

export function getWeeklyVelocity(userId: string, activities: VelocityActivity[]): VelocityMetrics {
  return buildVelocityMetrics(userId, "weekly", filterActivitiesByDays(userId, activities, 7));
}

export function getMonthlyVelocity(
  userId: string,
  activities: VelocityActivity[]
): VelocityMetrics {
  return buildVelocityMetrics(userId, "monthly", filterActivitiesByDays(userId, activities, 30));
}

export function getVelocityLeaderboard(
  activities: VelocityActivity[],
  period: string,
  limit: number = 20
): VelocityMetrics[] {
  const userIds = Array.from(new Set(activities.map((activity) => activity.userId)));
  const builder = period.toLowerCase().startsWith("month") ? getMonthlyVelocity : getWeeklyVelocity;

  return userIds
    .map((userId) => builder(userId, activities))
    .sort(
      (a, b) =>
        b.velocityScore - a.velocityScore ||
        b.avgIdeaQuality - a.avgIdeaQuality ||
        b.ideasGenerated - a.ideasGenerated ||
        a.userId.localeCompare(b.userId)
    )
    .slice(0, limit)
    .map((metrics, index) => VelocityMetricsSchema.parse({ ...metrics, period, rank: index + 1 }));
}

export function velocityToMarkdown(metrics: VelocityMetrics): string {
  return [
    `# ⚡ Innovation Velocity: ${metrics.userId}`,
    "",
    `- **Period:** ${metrics.period}`,
    `- **Velocity score:** ${metrics.velocityScore}/100`,
    `- **Ideas generated:** ${metrics.ideasGenerated}`,
    `- **Sessions completed:** ${metrics.sessionsCompleted}`,
    `- **Average idea quality:** ${metrics.avgIdeaQuality}/10`,
    `- **Angles explored:** ${metrics.anglesExplored}`,
    metrics.rank ? `- **Rank:** #${metrics.rank}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
