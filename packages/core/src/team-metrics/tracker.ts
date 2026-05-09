/**
 * Team innovation velocity tracking and metrics computation.
 */
import type {
  InnovationEvent,
  InnovationEventType,
  TeamMetrics,
  LeaderboardEntry,
} from "./types.js";

const events: InnovationEvent[] = [];
const MAX_EVENTS = 100_000;

/** Record an innovation event. */
export function recordInnovationEvent(
  event: Omit<InnovationEvent, "id" | "timestamp">
): InnovationEvent {
  const record: InnovationEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  events.push(record);

  // Cap events to prevent memory leaks
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  return record;
}

/** Get team metrics for a period. */
export function getTeamMetrics(
  teamId: string,
  periodType: "weekly" | "monthly" = "weekly"
): TeamMetrics {
  const teamEvents = events.filter((e) => e.teamId === teamId);
  const periodMs = periodType === "weekly" ? 7 * 86_400_000 : 30 * 86_400_000;
  const periodStart = new Date(Date.now() - periodMs);
  const periodEvents = teamEvents.filter((e) => new Date(e.timestamp) >= periodStart);

  const ideasGenerated = periodEvents.filter((e) => e.type === "idea-generated").length;
  const ideasImplemented = periodEvents.filter((e) => e.type === "idea-implemented").length;
  const sessionsStarted = periodEvents.filter((e) => e.type === "session-start").length;
  const sessionsCompleted = periodEvents.filter((e) => e.type === "session-completed").length;

  // Average quality score
  const scoredEvents = periodEvents.filter(
    (e) => e.type === "idea-scored" && e.qualityScore !== undefined
  );
  const avgQualityScore =
    scoredEvents.length > 0
      ? scoredEvents.reduce((sum, e) => sum + (e.qualityScore ?? 0), 0) / scoredEvents.length
      : 0;

  // Quality trend (compare current half vs previous half)
  const halfPeriod = periodMs / 2;
  const recentScored = scoredEvents.filter(
    (e) => new Date(e.timestamp).getTime() > Date.now() - halfPeriod
  );
  const olderScored = scoredEvents.filter(
    (e) => new Date(e.timestamp).getTime() <= Date.now() - halfPeriod
  );
  const recentAvg =
    recentScored.length > 0
      ? recentScored.reduce((s, e) => s + (e.qualityScore ?? 0), 0) / recentScored.length
      : 0;
  const olderAvg =
    olderScored.length > 0
      ? olderScored.reduce((s, e) => s + (e.qualityScore ?? 0), 0) / olderScored.length
      : 0;
  const qualityTrend =
    olderAvg > 0 ? Math.max(-1, Math.min(1, (recentAvg - olderAvg) / olderAvg)) : 0;

  // Active days
  const activeDays = new Set(periodEvents.map((e) => e.timestamp.slice(0, 10))).size;
  const ideaVelocity = activeDays > 0 ? Math.round((ideasGenerated / activeDays) * 10) / 10 : 0;

  const implementationRate =
    ideasGenerated > 0 ? Math.round((ideasImplemented / ideasGenerated) * 100) / 100 : 0;

  // Top angles
  const angleMap = new Map<string, { count: number; totalScore: number }>();
  for (const e of periodEvents.filter((e) => e.angleId)) {
    const entry = angleMap.get(e.angleId!) ?? { count: 0, totalScore: 0 };
    entry.count++;
    if (e.qualityScore) entry.totalScore += e.qualityScore;
    angleMap.set(e.angleId!, entry);
  }
  const topAngles = Array.from(angleMap.entries())
    .map(([angleId, data]) => ({
      angleId,
      count: data.count,
      avgScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Member activity
  const memberMap = new Map<
    string,
    { ideas: number; sessions: number; totalScore: number; scoreCount: number }
  >();
  for (const e of periodEvents) {
    const entry = memberMap.get(e.userId) ?? {
      ideas: 0,
      sessions: 0,
      totalScore: 0,
      scoreCount: 0,
    };
    if (e.type === "idea-generated") entry.ideas++;
    if (e.type === "session-start") entry.sessions++;
    if (e.type === "idea-scored" && e.qualityScore !== undefined) {
      entry.totalScore += e.qualityScore;
      entry.scoreCount++;
    }
    memberMap.set(e.userId, entry);
  }
  const memberActivity = Array.from(memberMap.entries()).map(([userId, data]) => ({
    userId,
    ideas: data.ideas,
    sessions: data.sessions,
    avgScore: data.scoreCount > 0 ? Math.round(data.totalScore / data.scoreCount) : 0,
  }));

  // Current streak
  const currentStreak = computeStreak(teamEvents);

  return {
    teamId,
    period: periodStart.toISOString().slice(0, 10),
    periodType,
    ideasGenerated,
    ideasImplemented,
    sessionsStarted,
    sessionsCompleted,
    avgQualityScore: Math.round(avgQualityScore * 10) / 10,
    qualityTrend: Math.round(qualityTrend * 100) / 100,
    ideaVelocity,
    implementationRate,
    topAngles,
    memberActivity,
    currentStreak,
  };
}

/** Get leaderboard for a team (opt-in). */
export function getTeamLeaderboard(teamId: string): LeaderboardEntry[] {
  const teamEvents = events.filter((e) => e.teamId === teamId);
  const memberMap = new Map<
    string,
    {
      totalIdeas: number;
      totalScore: number;
      scoreCount: number;
      sessionsCompleted: number;
    }
  >();

  for (const e of teamEvents) {
    const entry = memberMap.get(e.userId) ?? {
      totalIdeas: 0,
      totalScore: 0,
      scoreCount: 0,
      sessionsCompleted: 0,
    };
    if (e.type === "idea-generated") entry.totalIdeas++;
    if (e.type === "session-completed") entry.sessionsCompleted++;
    if (e.type === "idea-scored" && e.qualityScore !== undefined) {
      entry.totalScore += e.qualityScore;
      entry.scoreCount++;
    }
    memberMap.set(e.userId, entry);
  }

  const entries: LeaderboardEntry[] = Array.from(memberMap.entries()).map(([userId, data]) => {
    const avgScore = data.scoreCount > 0 ? data.totalScore / data.scoreCount : 0;
    // Quality-weighted score prevents gaming by rewarding quality over quantity
    const qualityWeightedScore = data.totalIdeas * (avgScore / 100);
    const userEvents = teamEvents.filter((e) => e.userId === userId);
    const currentStreak = computeStreak(userEvents);

    return {
      userId,
      teamId,
      totalIdeas: data.totalIdeas,
      avgQualityScore: Math.round(avgScore * 10) / 10,
      qualityWeightedScore: Math.round(qualityWeightedScore * 10) / 10,
      sessionsCompleted: data.sessionsCompleted,
      currentStreak,
      rank: 0,
    };
  });

  // Rank by quality-weighted score
  entries.sort((a, b) => b.qualityWeightedScore - a.qualityWeightedScore);
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return entries;
}

/** Get all events for a team (for export). */
export function getTeamEvents(teamId: string, limit: number = 100): InnovationEvent[] {
  return events
    .filter((e) => e.teamId === teamId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/** Clear all events (testing). */
export function clearTeamEvents(): void {
  events.length = 0;
}

function computeStreak(events: InnovationEvent[]): number {
  if (events.length === 0) return 0;

  const activeDates = new Set(events.map((e) => e.timestamp.slice(0, 10)));
  const sortedDates = Array.from(activeDates).sort().reverse();

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let checkDate = today;

  for (let i = 0; i < 365; i++) {
    if (sortedDates.includes(checkDate)) {
      streak++;
    } else if (streak > 0) {
      break;
    }
    const d = new Date(checkDate);
    d.setDate(d.getDate() - 1);
    checkDate = d.toISOString().slice(0, 10);
  }

  return streak;
}
