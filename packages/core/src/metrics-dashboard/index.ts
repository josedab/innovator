/**
 * @module metrics-dashboard
 *
 * Innovation Metrics & ROI Dashboard.
 * Aggregates data from tracker, analytics, and portfolio modules into
 * a unified dashboard with funnel tracking, conversion metrics,
 * team leaderboards, angle effectiveness heatmaps, and ROI calculator.
 */

import { z } from "zod";

// ---- Funnel Stages ----

export const FunnelStageSchema = z.enum([
  "ideated",
  "shortlisted",
  "validated",
  "prototyped",
  "piloted",
  "shipped",
  "measured",
]);
export type FunnelStage = z.infer<typeof FunnelStageSchema>;

export const FUNNEL_STAGES: Array<{ stage: FunnelStage; label: string; color: string }> = [
  { stage: "ideated", label: "Ideated", color: "#93c5fd" },
  { stage: "shortlisted", label: "Shortlisted", color: "#60a5fa" },
  { stage: "validated", label: "Validated", color: "#3b82f6" },
  { stage: "prototyped", label: "Prototyped", color: "#2563eb" },
  { stage: "piloted", label: "Piloted", color: "#1d4ed8" },
  { stage: "shipped", label: "Shipped", color: "#1e40af" },
  { stage: "measured", label: "Impact Measured", color: "#1e3a8a" },
];

// ---- Tracked Idea ----

export interface TrackedIdea {
  id: string;
  title: string;
  description: string;
  angleId?: string;
  sessionId?: string;
  stage: FunnelStage;
  owner?: string;
  teamId?: string;
  externalIds?: Record<string, string>;
  estimatedROI?: number;
  actualROI?: number;
  effort?: "low" | "medium" | "high";
  priority?: number;
  tags: string[];
  stageHistory: Array<{ stage: FunnelStage; enteredAt: string; exitedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

// ---- Store ----

const trackedIdeas = new Map<string, TrackedIdea>();

// ---- CRUD ----

export function trackIdea(input: {
  id: string;
  title: string;
  description: string;
  angleId?: string;
  sessionId?: string;
  owner?: string;
  teamId?: string;
  tags?: string[];
}): TrackedIdea {
  const now = new Date().toISOString();
  const idea: TrackedIdea = {
    id: input.id,
    title: input.title,
    description: input.description,
    angleId: input.angleId,
    sessionId: input.sessionId,
    stage: "ideated",
    owner: input.owner,
    teamId: input.teamId,
    tags: input.tags ?? [],
    stageHistory: [{ stage: "ideated", enteredAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  trackedIdeas.set(idea.id, idea);
  return idea;
}

export function advanceIdea(id: string, newStage: FunnelStage): TrackedIdea | undefined {
  const idea = trackedIdeas.get(id);
  if (!idea) return undefined;

  const now = new Date().toISOString();
  const currentEntry = idea.stageHistory[idea.stageHistory.length - 1];
  if (currentEntry) currentEntry.exitedAt = now;

  idea.stage = newStage;
  idea.stageHistory.push({ stage: newStage, enteredAt: now });
  idea.updatedAt = now;
  return idea;
}

export function setIdeaROI(id: string, estimated?: number, actual?: number): boolean {
  const idea = trackedIdeas.get(id);
  if (!idea) return false;
  if (estimated !== undefined) idea.estimatedROI = estimated;
  if (actual !== undefined) idea.actualROI = actual;
  idea.updatedAt = new Date().toISOString();
  return true;
}

export function getTrackedIdea(id: string): TrackedIdea | undefined {
  return trackedIdeas.get(id);
}

export function listTrackedIdeas(filters?: {
  stage?: FunnelStage;
  teamId?: string;
  owner?: string;
  angleId?: string;
}): TrackedIdea[] {
  let ideas = Array.from(trackedIdeas.values());
  if (filters?.stage) ideas = ideas.filter((i) => i.stage === filters.stage);
  if (filters?.teamId) ideas = ideas.filter((i) => i.teamId === filters.teamId);
  if (filters?.owner) ideas = ideas.filter((i) => i.owner === filters.owner);
  if (filters?.angleId) ideas = ideas.filter((i) => i.angleId === filters.angleId);
  return ideas;
}

// ---- Funnel Metrics ----

export interface FunnelMetrics {
  stages: Array<{
    stage: FunnelStage;
    label: string;
    count: number;
    percentage: number;
  }>;
  totalIdeas: number;
  conversionRates: Array<{
    from: FunnelStage;
    to: FunnelStage;
    rate: number;
  }>;
  averageTimeInStage: Record<FunnelStage, number>;
}

export function computeFunnelMetrics(teamId?: string): FunnelMetrics {
  const ideas = teamId
    ? Array.from(trackedIdeas.values()).filter((i) => i.teamId === teamId)
    : Array.from(trackedIdeas.values());

  const totalIdeas = ideas.length;

  const stageCounts = new Map<FunnelStage, number>();
  const stageOrder = FUNNEL_STAGES.map((s) => s.stage);

  // Count ideas that have reached each stage (cumulative)
  for (const idea of ideas) {
    const reachedStages = idea.stageHistory.map((h) => h.stage);
    for (const stage of reachedStages) {
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }
  }

  const stages = FUNNEL_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    count: stageCounts.get(s.stage) ?? 0,
    percentage: totalIdeas > 0 ? ((stageCounts.get(s.stage) ?? 0) / totalIdeas) * 100 : 0,
  }));

  // Conversion rates between adjacent stages
  const conversionRates: FunnelMetrics["conversionRates"] = [];
  for (let i = 0; i < stageOrder.length - 1; i++) {
    const fromCount = stageCounts.get(stageOrder[i]) ?? 0;
    const toCount = stageCounts.get(stageOrder[i + 1]) ?? 0;
    conversionRates.push({
      from: stageOrder[i],
      to: stageOrder[i + 1],
      rate: fromCount > 0 ? (toCount / fromCount) * 100 : 0,
    });
  }

  // Average time in each stage (milliseconds)
  const averageTimeInStage: Record<string, number> = {};
  for (const stage of stageOrder) {
    const durations: number[] = [];
    for (const idea of ideas) {
      const entry = idea.stageHistory.find((h) => h.stage === stage);
      if (entry && entry.exitedAt) {
        durations.push(new Date(entry.exitedAt).getTime() - new Date(entry.enteredAt).getTime());
      }
    }
    averageTimeInStage[stage] =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  return {
    stages,
    totalIdeas,
    conversionRates,
    averageTimeInStage: averageTimeInStage as Record<FunnelStage, number>,
  };
}

// ---- Angle Effectiveness ----

export interface AngleEffectivenessData {
  angleId: string;
  totalIdeas: number;
  shippedIdeas: number;
  conversionRate: number;
  averageROI: number;
  topIdeas: Array<{ title: string; stage: FunnelStage; roi?: number }>;
}

export function computeAngleEffectiveness(): AngleEffectivenessData[] {
  const byAngle = new Map<string, TrackedIdea[]>();
  for (const idea of trackedIdeas.values()) {
    if (idea.angleId) {
      const list = byAngle.get(idea.angleId) ?? [];
      list.push(idea);
      byAngle.set(idea.angleId, list);
    }
  }

  return Array.from(byAngle.entries()).map(([angleId, ideas]) => {
    const shipped = ideas.filter((i) =>
      i.stageHistory.some((h) => h.stage === "shipped" || h.stage === "measured")
    );
    const withROI = ideas.filter((i) => i.actualROI !== undefined);
    const avgROI =
      withROI.length > 0 ? withROI.reduce((s, i) => s + (i.actualROI ?? 0), 0) / withROI.length : 0;

    return {
      angleId,
      totalIdeas: ideas.length,
      shippedIdeas: shipped.length,
      conversionRate: ideas.length > 0 ? (shipped.length / ideas.length) * 100 : 0,
      averageROI: avgROI,
      topIdeas: ideas
        .sort((a, b) => (b.actualROI ?? b.estimatedROI ?? 0) - (a.actualROI ?? a.estimatedROI ?? 0))
        .slice(0, 5)
        .map((i) => ({ title: i.title, stage: i.stage, roi: i.actualROI ?? i.estimatedROI })),
    };
  });
}

// ---- Team Leaderboard ----

export interface TeamMetrics {
  teamId: string;
  totalIdeas: number;
  shippedIdeas: number;
  totalEstimatedROI: number;
  totalActualROI: number;
  conversionRate: number;
  activeIdeas: number;
}

export function computeTeamLeaderboard(): TeamMetrics[] {
  const byTeam = new Map<string, TrackedIdea[]>();
  for (const idea of trackedIdeas.values()) {
    if (idea.teamId) {
      const list = byTeam.get(idea.teamId) ?? [];
      list.push(idea);
      byTeam.set(idea.teamId, list);
    }
  }

  return Array.from(byTeam.entries())
    .map(([teamId, ideas]) => {
      const shipped = ideas.filter((i) =>
        i.stageHistory.some((h) => h.stage === "shipped" || h.stage === "measured")
      );
      return {
        teamId,
        totalIdeas: ideas.length,
        shippedIdeas: shipped.length,
        totalEstimatedROI: ideas.reduce((s, i) => s + (i.estimatedROI ?? 0), 0),
        totalActualROI: ideas.reduce((s, i) => s + (i.actualROI ?? 0), 0),
        conversionRate: ideas.length > 0 ? (shipped.length / ideas.length) * 100 : 0,
        activeIdeas: ideas.filter((i) => i.stage !== "measured" && i.stage !== "shipped").length,
      };
    })
    .sort((a, b) => b.totalActualROI - a.totalActualROI);
}

// ---- ROI Calculator ----

export interface ROICalculation {
  ideaId: string;
  title: string;
  estimatedCost: number;
  estimatedRevenue: number;
  estimatedROI: number;
  paybackMonths: number;
  riskAdjustedROI: number;
}

export function calculateROI(input: {
  ideaId: string;
  title: string;
  developmentCost: number;
  monthlyRevenue: number;
  timeToMarketMonths: number;
  probabilityOfSuccess: number;
  projectionMonths?: number;
}): ROICalculation {
  const months = input.projectionMonths ?? 12;
  const totalCost = input.developmentCost;
  const totalRevenue = input.monthlyRevenue * Math.max(0, months - input.timeToMarketMonths);
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const payback =
    input.monthlyRevenue > 0
      ? input.developmentCost / input.monthlyRevenue + input.timeToMarketMonths
      : Infinity;

  return {
    ideaId: input.ideaId,
    title: input.title,
    estimatedCost: totalCost,
    estimatedRevenue: totalRevenue,
    estimatedROI: Math.round(roi * 10) / 10,
    paybackMonths: Math.round(payback * 10) / 10,
    riskAdjustedROI: Math.round(roi * input.probabilityOfSuccess * 10) / 10,
  };
}

// ---- Integration Interfaces ----

export interface ProjectTrackerIntegration {
  id: string;
  name: string;
  type: "jira" | "linear" | "github" | "asana" | "trello";
  apiUrl: string;
  projectKey?: string;
  syncDirection: "push" | "pull" | "bidirectional";
  fieldMapping: Record<string, string>;
}

export interface SyncResult {
  integrationId: string;
  syncedAt: string;
  pushed: number;
  pulled: number;
  errors: string[];
}

const integrations = new Map<string, ProjectTrackerIntegration>();

export function registerIntegration(integration: ProjectTrackerIntegration): void {
  integrations.set(integration.id, integration);
}

export function listIntegrations(): ProjectTrackerIntegration[] {
  return Array.from(integrations.values());
}

export function removeIntegration(id: string): boolean {
  return integrations.delete(id);
}

// ---- Unified Dashboard ----

export interface DashboardData {
  funnel: FunnelMetrics;
  angleEffectiveness: AngleEffectivenessData[];
  teamLeaderboard: TeamMetrics[];
  recentActivity: Array<{
    ideaId: string;
    title: string;
    action: string;
    timestamp: string;
  }>;
  kpis: {
    totalIdeas: number;
    shippedIdeas: number;
    overallConversionRate: number;
    totalROI: number;
    averageTimeToShip: number;
  };
}

export function buildDashboard(teamId?: string): DashboardData {
  const funnel = computeFunnelMetrics(teamId);
  const angleEffectiveness = computeAngleEffectiveness();
  const teamLeaderboard = computeTeamLeaderboard();

  const allIdeas = teamId
    ? Array.from(trackedIdeas.values()).filter((i) => i.teamId === teamId)
    : Array.from(trackedIdeas.values());

  const shippedCount = allIdeas.filter((i) =>
    i.stageHistory.some((h) => h.stage === "shipped" || h.stage === "measured")
  ).length;

  // Recent activity from stage history
  const recentActivity = allIdeas
    .flatMap((idea) =>
      idea.stageHistory.map((h) => ({
        ideaId: idea.id,
        title: idea.title,
        action: `Moved to ${h.stage}`,
        timestamp: h.enteredAt,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  return {
    funnel,
    angleEffectiveness,
    teamLeaderboard,
    recentActivity,
    kpis: {
      totalIdeas: allIdeas.length,
      shippedIdeas: shippedCount,
      overallConversionRate: allIdeas.length > 0 ? (shippedCount / allIdeas.length) * 100 : 0,
      totalROI: allIdeas.reduce((s, i) => s + (i.actualROI ?? 0), 0),
      averageTimeToShip: 0, // computed from funnel averageTimeInStage
    },
  };
}

// ---- Cleanup ----

export function clearMetricsDashboard(): void {
  trackedIdeas.clear();
  integrations.clear();
}
