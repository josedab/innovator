/**
 * @module analytics/standard-events
 *
 * Standardized event definitions and aggregation for the Innovation
 * Portfolio Dashboard. Provides typed events, time-series bucketing,
 * velocity metrics, quality trends, angle effectiveness heatmaps,
 * team leaderboards, and LLM-prompt-ready executive summaries.
 */

import { randomUUID } from "node:crypto";

// ---- Event Types ----

export const STANDARD_EVENT_TYPES = [
  "session_started",
  "investigation_completed",
  "angle_generated",
  "idea_scored",
  "synthesis_completed",
  "debate_started",
  "debate_concluded",
  "export_generated",
  "idea_implemented",
  "outcome_recorded",
] as const;

export type StandardEventType = (typeof STANDARD_EVENT_TYPES)[number];

/** Quality metrics attached to an event. */
export interface QualityMetrics {
  noveltyScore?: number;
  feasibilityScore?: number;
  impactScore?: number;
  overallScore?: number;
}

/** A standardised analytics event. */
export interface StandardEvent {
  id: string;
  type: StandardEventType;
  timestamp: string;
  sessionId?: string;
  userId?: string;
  teamId?: string;
  metadata: Record<string, unknown>;
  duration?: number;
  quality?: QualityMetrics;
}

// ---- Aggregation Result Types ----

export type Granularity = "hour" | "day" | "week" | "month";

export interface TimeSeriesBucket {
  bucket: string;
  count: number;
}

export interface VelocityMetrics {
  sessionsPerWeek: number;
  ideasPerSession: number;
  qualityAvg: number;
  totalSessions: number;
  totalIdeas: number;
}

export interface QualityTrendPoint {
  bucket: string;
  avgQuality: number;
  count: number;
}

export interface AngleEffectivenessCell {
  angle: string;
  domain: string;
  avgQuality: number;
  count: number;
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  innovationScore: number;
  sessions: number;
  ideas: number;
  implementations: number;
  avgQuality: number;
}

export interface ExecutiveSummary {
  generatedAt: string;
  totalSessions: number;
  totalIdeas: number;
  totalImplementations: number;
  avgQuality: number;
  velocityTrend: "increasing" | "decreasing" | "stable";
  topAngle: string | null;
  topTeam: string | null;
  summary: string;
}

// ---- Helpers ----

function getBucket(timestamp: string, granularity: Granularity): string {
  const d = new Date(timestamp);
  switch (granularity) {
    case "hour":
      return d.toISOString().slice(0, 13) + ":00";
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().slice(0, 10);
    }
    case "month":
      return d.toISOString().slice(0, 7);
  }
}

function isInRange(timestamp: string, from?: string, to?: string): boolean {
  if (from && timestamp < from) return false;
  if (to && timestamp > to) return false;
  return true;
}

// ---- EventAggregator ----

/**
 * In-memory event store with time-series aggregation, velocity metrics,
 * quality trends, angle effectiveness, team leaderboards, and executive
 * summary generation.
 */
export class EventAggregator {
  private events: StandardEvent[] = [];

  /** Record a new standardised event. */
  record(event: Omit<StandardEvent, "id" | "timestamp">): StandardEvent {
    const full: StandardEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.events.push(full);
    return full;
  }

  /** Return all stored events (newest first). */
  getEvents(): StandardEvent[] {
    return [...this.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /** Time-bucketed counts for a given event type. */
  getTimeSeries(
    eventType: StandardEventType,
    granularity: Granularity = "day",
    from?: string,
    to?: string,
  ): TimeSeriesBucket[] {
    const buckets = new Map<string, number>();

    for (const e of this.events) {
      if (e.type !== eventType) continue;
      if (!isInRange(e.timestamp, from, to)) continue;
      const bucket = getBucket(e.timestamp, granularity);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    return Array.from(buckets.entries())
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /** Innovation velocity: sessions/week, ideas/session, quality average. */
  getVelocityMetrics(teamId?: string, from?: string, to?: string): VelocityMetrics {
    const filtered = this.events.filter((e) => {
      if (teamId && e.teamId !== teamId) return false;
      return isInRange(e.timestamp, from, to);
    });

    const sessions = filtered.filter((e) => e.type === "session_started");
    const ideas = filtered.filter((e) => e.type === "angle_generated");
    const scored = filtered.filter(
      (e) => e.type === "idea_scored" && e.quality?.overallScore != null,
    );

    const totalSessions = sessions.length;
    const totalIdeas = ideas.reduce(
      (sum, e) => sum + ((e.metadata.ideaCount as number) ?? 1),
      0,
    );

    // Weeks spanned
    const timestamps = filtered.map((e) => new Date(e.timestamp).getTime());
    const span =
      timestamps.length > 1
        ? (Math.max(...timestamps) - Math.min(...timestamps)) / (7 * 24 * 60 * 60 * 1000)
        : 1;
    const weeks = Math.max(1, Math.ceil(span));

    const qualityAvg =
      scored.length > 0
        ? scored.reduce((sum, e) => sum + (e.quality!.overallScore ?? 0), 0) / scored.length
        : 0;

    return {
      sessionsPerWeek: +(totalSessions / weeks).toFixed(2),
      ideasPerSession: totalSessions > 0 ? +(totalIdeas / totalSessions).toFixed(2) : 0,
      qualityAvg: +qualityAvg.toFixed(2),
      totalSessions,
      totalIdeas,
    };
  }

  /** Quality score trends over time. */
  getQualityTrends(from?: string, to?: string): QualityTrendPoint[] {
    const buckets = new Map<string, { sum: number; count: number }>();

    for (const e of this.events) {
      if (e.quality?.overallScore == null) continue;
      if (!isInRange(e.timestamp, from, to)) continue;
      const bucket = getBucket(e.timestamp, "week");
      const entry = buckets.get(bucket) ?? { sum: 0, count: 0 };
      entry.sum += e.quality.overallScore;
      entry.count++;
      buckets.set(bucket, entry);
    }

    return Array.from(buckets.entries())
      .map(([bucket, { sum, count }]) => ({
        bucket,
        avgQuality: +(sum / count).toFixed(2),
        count,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /** Angle × domain effectiveness heatmap. */
  getAngleEffectiveness(): AngleEffectivenessCell[] {
    const cells = new Map<string, { sum: number; count: number }>();

    for (const e of this.events) {
      if (e.type !== "angle_generated" && e.type !== "idea_scored") continue;
      const angle = (e.metadata.angleId as string) ?? "unknown";
      const domain = (e.metadata.domain as string) ?? "general";
      const quality = e.quality?.overallScore ?? (e.metadata.avgScore as number) ?? null;
      if (quality == null) continue;

      const key = `${angle}::${domain}`;
      const entry = cells.get(key) ?? { sum: 0, count: 0 };
      entry.sum += quality;
      entry.count++;
      cells.set(key, entry);
    }

    return Array.from(cells.entries())
      .map(([key, { sum, count }]) => {
        const [angle, domain] = key.split("::");
        return { angle, domain, avgQuality: +(sum / count).toFixed(2), count };
      })
      .sort((a, b) => b.avgQuality - a.avgQuality);
  }

  /** Ranked teams by composite innovation score. */
  getTeamLeaderboard(limit: number = 10): TeamLeaderboardEntry[] {
    const teams = new Map<
      string,
      { sessions: number; ideas: number; implementations: number; qualitySum: number; qualityCount: number }
    >();

    for (const e of this.events) {
      const teamId = e.teamId ?? "unassigned";
      const entry = teams.get(teamId) ?? {
        sessions: 0,
        ideas: 0,
        implementations: 0,
        qualitySum: 0,
        qualityCount: 0,
      };

      switch (e.type) {
        case "session_started":
          entry.sessions++;
          break;
        case "angle_generated":
          entry.ideas += (e.metadata.ideaCount as number) ?? 1;
          break;
        case "idea_implemented":
          entry.implementations++;
          break;
        case "idea_scored":
          if (e.quality?.overallScore != null) {
            entry.qualitySum += e.quality.overallScore;
            entry.qualityCount++;
          }
          break;
      }

      teams.set(teamId, entry);
    }

    return Array.from(teams.entries())
      .map(([teamId, m]) => {
        const avgQuality = m.qualityCount > 0 ? m.qualitySum / m.qualityCount : 0;
        // Composite score: weighted combination of activity and quality
        const innovationScore =
          m.sessions * 1 + m.ideas * 0.5 + m.implementations * 5 + avgQuality * 2;
        return {
          rank: 0,
          teamId,
          innovationScore: +innovationScore.toFixed(2),
          sessions: m.sessions,
          ideas: m.ideas,
          implementations: m.implementations,
          avgQuality: +avgQuality.toFixed(2),
        };
      })
      .sort((a, b) => b.innovationScore - a.innovationScore)
      .slice(0, limit)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }

  /** Generate an LLM-prompt-ready executive summary. */
  generateExecutiveSummary(): ExecutiveSummary {
    const now = new Date().toISOString();
    const sessions = this.events.filter((e) => e.type === "session_started");
    const ideas = this.events.filter((e) => e.type === "angle_generated");
    const implementations = this.events.filter((e) => e.type === "idea_implemented");
    const scored = this.events.filter(
      (e) => e.quality?.overallScore != null,
    );

    const totalSessions = sessions.length;
    const totalIdeas = ideas.reduce(
      (sum, e) => sum + ((e.metadata.ideaCount as number) ?? 1),
      0,
    );
    const totalImplementations = implementations.length;
    const avgQuality =
      scored.length > 0
        ? +(scored.reduce((s, e) => s + (e.quality!.overallScore ?? 0), 0) / scored.length).toFixed(2)
        : 0;

    // Velocity trend: compare first vs second half of events
    let velocityTrend: ExecutiveSummary["velocityTrend"] = "stable";
    if (sessions.length >= 4) {
      const sorted = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const half = Math.floor(sorted.length / 2);
      const firstHalf = half;
      const secondHalf = sorted.length - half;
      if (secondHalf > firstHalf * 1.2) velocityTrend = "increasing";
      else if (secondHalf < firstHalf * 0.8) velocityTrend = "decreasing";
    }

    // Top angle
    const angleCounts = new Map<string, number>();
    for (const e of ideas) {
      const angle = (e.metadata.angleId as string) ?? "unknown";
      angleCounts.set(angle, (angleCounts.get(angle) ?? 0) + 1);
    }
    const topAngle = Array.from(angleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Top team
    const leaderboard = this.getTeamLeaderboard(1);
    const topTeam = leaderboard[0]?.teamId ?? null;

    const lines: string[] = [];
    lines.push(`Innovation Portfolio Summary (as of ${now.split("T")[0]})`);
    lines.push("");
    lines.push(`Total sessions: ${totalSessions}, Ideas generated: ${totalIdeas}, Implementations: ${totalImplementations}`);
    lines.push(`Average quality score: ${avgQuality}, Velocity trend: ${velocityTrend}`);
    if (topAngle) lines.push(`Top performing angle: ${topAngle}`);
    if (topTeam && topTeam !== "unassigned") lines.push(`Leading team: ${topTeam}`);

    return {
      generatedAt: now,
      totalSessions,
      totalIdeas,
      totalImplementations,
      avgQuality,
      velocityTrend,
      topAngle,
      topTeam: topTeam !== "unassigned" ? topTeam : null,
      summary: lines.join("\n"),
    };
  }

  /** Clear all events (for testing). */
  clear(): void {
    this.events = [];
  }
}

// ---- Singleton ----

let instance: EventAggregator | undefined;

/** Get the shared EventAggregator instance. */
export function getEventAggregator(): EventAggregator {
  if (!instance) instance = new EventAggregator();
  return instance;
}
