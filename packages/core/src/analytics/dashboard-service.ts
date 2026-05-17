/**
 * @module analytics/dashboard-service
 *
 * Dashboard data service — composes EventAggregator, analytics summaries,
 * portfolio metrics, outcome tracking, and ROI data into dashboard-ready
 * payloads for the Innovation Portfolio Dashboard.
 */

import { generateSummary, readEvents } from "./index.js";
import { getTimeSeries, generateReport, reportToMarkdown } from "./advanced.js";
import { getEventAggregator } from "./standard-events.js";
import type {
  Granularity,
  TimeSeriesBucket,
  AngleEffectivenessCell,
  VelocityMetrics,
  QualityTrendPoint,
  ExecutiveSummary,
} from "./standard-events.js";

// ---- Types ----

export interface DateRange {
  from?: string;
  to?: string;
}

export interface DashboardOverview {
  totalSessions: number;
  totalIdeas: number;
  avgQuality: number;
  topAngles: Array<{ angleId: string; count: number }>;
  trendDirection: "up" | "down" | "stable";
  successRate: number;
  avgDurationMs: number;
  recentEvents: Array<{ id: string; type: string; timestamp: string }>;
}

export interface VelocityChartData {
  granularity: Granularity;
  sessions: TimeSeriesBucket[];
  ideas: TimeSeriesBucket[];
  quality: QualityTrendPoint[];
  velocity: VelocityMetrics;
}

export interface QualityHeatmapData {
  cells: AngleEffectivenessCell[];
  angles: string[];
  domains: string[];
}

export interface TeamComparisonData {
  teams: Array<{
    teamId: string;
    sessions: number;
    ideas: number;
    implementations: number;
    avgQuality: number;
    innovationScore: number;
  }>;
}

export interface SessionDrillDown {
  sessionId: string;
  events: Array<{ id: string; type: string; timestamp: string; metadata: Record<string, unknown> }>;
  ideaCount: number;
  avgQuality: number;
  duration: number;
  angles: string[];
}

export interface ROISummaryData {
  totalIdeas: number;
  implementedCount: number;
  estimatedValue: number;
  actualValue: number;
  roi: number;
  implementationRate: number;
  funnelStages: Array<{ stage: string; count: number }>;
}

export interface ReportOptions {
  title?: string;
  startDate?: string;
  endDate?: string;
  includeHeatmap?: boolean;
  includeLeaderboard?: boolean;
}

export interface ExecutiveSummaryReport {
  period: string;
  highlights: string[];
  risks: string[];
  recommendations: string[];
  metrics: ExecutiveSummary;
}

// ---- DashboardService ----

/**
 * Composes multiple analytics sources into dashboard-ready data structures.
 */
export class DashboardService {
  private aggregator = getEventAggregator();

  /** High-level overview metrics for the dashboard header. */
  getOverview(teamId?: string, dateRange?: DateRange): DashboardOverview {
    const summary = generateSummary();
    const velocity = this.aggregator.getVelocityMetrics(teamId, dateRange?.from, dateRange?.to);

    const sessionSeries = getTimeSeries("sessions", {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    });

    let trendDirection: DashboardOverview["trendDirection"] = "stable";
    if (sessionSeries.trend === "increasing") trendDirection = "up";
    else if (sessionSeries.trend === "decreasing") trendDirection = "down";

    return {
      totalSessions: summary.totalPipelines,
      totalIdeas: summary.totalIdeas,
      avgQuality: velocity.qualityAvg,
      topAngles: summary.angleUsage.slice(0, 5).map((a) => ({
        angleId: a.angleId,
        count: a.count,
      })),
      trendDirection,
      successRate: summary.successRate,
      avgDurationMs: summary.averageDurationMs,
      recentEvents: summary.recentEvents.slice(0, 10).map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
      })),
    };
  }

  /** Time series data for velocity chart rendering. */
  getVelocityChart(granularity: Granularity = "day", range?: DateRange): VelocityChartData {
    const sessions = this.aggregator.getTimeSeries(
      "session_started",
      granularity,
      range?.from,
      range?.to
    );
    const ideas = this.aggregator.getTimeSeries(
      "angle_generated",
      granularity,
      range?.from,
      range?.to
    );
    const quality = this.aggregator.getQualityTrends(range?.from, range?.to);
    const velocity = this.aggregator.getVelocityMetrics(undefined, range?.from, range?.to);

    return { granularity, sessions, ideas, quality, velocity };
  }

  /** Angle × domain quality heatmap. */
  getQualityHeatmap(): QualityHeatmapData {
    const cells = this.aggregator.getAngleEffectiveness();
    const angles = Array.from(new Set(cells.map((c) => c.angle)));
    const domains = Array.from(new Set(cells.map((c) => c.domain)));
    return { cells, angles, domains };
  }

  /** Side-by-side comparison of team metrics. */
  getTeamComparison(teamIds: string[]): TeamComparisonData {
    const leaderboard = this.aggregator.getTeamLeaderboard(100);
    const idSet = new Set(teamIds);
    const teams = leaderboard
      .filter((e) => idSet.size === 0 || idSet.has(e.teamId))
      .map((e) => ({
        teamId: e.teamId,
        sessions: e.sessions,
        ideas: e.ideas,
        implementations: e.implementations,
        avgQuality: e.avgQuality,
        innovationScore: e.innovationScore,
      }));
    return { teams };
  }

  /** Detailed metrics for a single session. */
  getDrillDown(sessionId: string): SessionDrillDown {
    const allEvents = this.aggregator.getEvents();
    const events = allEvents.filter((e) => e.sessionId === sessionId);

    const ideaEvents = events.filter((e) => e.type === "angle_generated");
    const ideaCount = ideaEvents.reduce(
      (sum, e) => sum + ((e.metadata.ideaCount as number) ?? 1),
      0
    );

    const scored = events.filter((e) => e.quality?.overallScore != null);
    const avgQuality =
      scored.length > 0
        ? +(scored.reduce((s, e) => s + (e.quality!.overallScore ?? 0), 0) / scored.length).toFixed(
            2
          )
        : 0;

    const durations = events.filter((e) => e.duration != null).map((e) => e.duration!);
    const duration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : 0;

    const angles = Array.from(
      new Set(ideaEvents.map((e) => (e.metadata.angleId as string) ?? "unknown"))
    );

    return {
      sessionId,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        metadata: e.metadata,
      })),
      ideaCount,
      avgQuality,
      duration,
      angles,
    };
  }

  /** Aggregated ROI summary. */
  getROISummary(_portfolioId?: string): ROISummaryData {
    const summary = generateSummary();
    const execSummary = this.aggregator.generateExecutiveSummary();
    const events = readEvents();

    const implementedEvents = events.filter(
      (e) => e.type === "session_exported" || e.type === "artifact_generated"
    );
    const implementedCount = execSummary.totalImplementations || implementedEvents.length;

    const estimatedValue = summary.totalIdeas * 500;
    const actualValue = implementedCount * 10000;
    const totalInvestment = summary.totalPipelines * 50;
    const roi =
      totalInvestment > 0
        ? +(((actualValue - totalInvestment) / totalInvestment) * 100).toFixed(1)
        : 0;

    const funnelStages = [
      { stage: "Sessions", count: summary.totalPipelines },
      { stage: "Ideas Generated", count: summary.totalIdeas },
      { stage: "Ideas Scored", count: events.filter((e) => e.type === "ideas_scored").length },
      { stage: "Exported", count: implementedEvents.length },
      { stage: "Implemented", count: implementedCount },
    ];

    return {
      totalIdeas: summary.totalIdeas,
      implementedCount,
      estimatedValue,
      actualValue,
      roi,
      implementationRate:
        summary.totalIdeas > 0 ? +(implementedCount / summary.totalIdeas).toFixed(3) : 0,
      funnelStages,
    };
  }

  /** Generate a markdown report. */
  generateReport(options?: ReportOptions): string {
    const report = generateReport({
      title: options?.title,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });
    return reportToMarkdown(report);
  }

  /** Structured executive summary with highlights, risks, recommendations. */
  generateExecutiveSummary(period: string): ExecutiveSummaryReport {
    const metrics = this.aggregator.generateExecutiveSummary();
    const summary = generateSummary();

    const highlights: string[] = [];
    const risks: string[] = [];
    const recommendations: string[] = [];

    // Highlights
    if (metrics.totalSessions > 0) {
      highlights.push(
        `${metrics.totalSessions} innovation sessions conducted, generating ${metrics.totalIdeas} ideas.`
      );
    }
    if (metrics.totalImplementations > 0) {
      highlights.push(`${metrics.totalImplementations} ideas moved to implementation.`);
    }
    if (metrics.avgQuality > 7) {
      highlights.push(`High average quality score of ${metrics.avgQuality}/10.`);
    }
    if (metrics.velocityTrend === "increasing") {
      highlights.push("Innovation velocity is trending upward.");
    }

    // Risks
    if (metrics.velocityTrend === "decreasing") {
      risks.push("Innovation velocity is declining — team engagement may be dropping.");
    }
    if (summary.successRate < 0.7 && summary.totalPipelines > 3) {
      risks.push(
        `Pipeline success rate is ${Math.round(summary.successRate * 100)}%, below 70% threshold.`
      );
    }
    if (metrics.totalImplementations === 0 && metrics.totalIdeas > 10) {
      risks.push("No ideas have progressed to implementation despite high idea volume.");
    }

    // Recommendations
    if (metrics.totalSessions === 0) {
      recommendations.push("Start innovation sessions to build momentum.");
    }
    if (metrics.avgQuality < 5 && metrics.avgQuality > 0) {
      recommendations.push("Focus on idea quality — consider using more diverse angles.");
    }
    if (summary.angleUsage.length < 3 && summary.totalPipelines > 5) {
      recommendations.push("Diversify innovation angles to explore new solution spaces.");
    }
    if (metrics.topAngle) {
      recommendations.push(
        `Continue leveraging "${metrics.topAngle}" as the top-performing angle.`
      );
    }

    return { period, highlights, risks, recommendations, metrics };
  }
}

// ---- Singleton ----

let instance: DashboardService | undefined;

/** Get the shared DashboardService instance. */
export function getDashboardService(): DashboardService {
  if (!instance) instance = new DashboardService();
  return instance;
}
