import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  PortfolioItem,
  PortfolioMetrics,
  PortfolioInsight,
  IdeaLifecycleStage,
  StatusTransition,
} from "./types.js";

const PORTFOLIO_DIR = join(homedir(), ".innovator", "portfolio");

function ensureDir(): void {
  if (!existsSync(PORTFOLIO_DIR)) {
    mkdirSync(PORTFOLIO_DIR, { recursive: true });
  }
}

function itemPath(id: string): string {
  return join(PORTFOLIO_DIR, `${id}.json`);
}

/**
 * Add a new idea to the innovation portfolio.
 *
 * Creates a {@link PortfolioItem} in the `ideation` stage, persists it to
 * `~/.innovator/portfolio/<id>.json`, and returns the created item.
 *
 * @param params - Item creation parameters.
 * @param params.title - Short, descriptive name for the idea.
 * @param params.description - Full explanation of the idea.
 * @param params.sourceAngle - The innovation angle that generated this idea (e.g. `"scamper"`).
 * @param params.sessionId - Optional innovation session ID to link back to the originating session.
 * @param params.tags - Optional tags for categorisation and filtering.
 * @param params.assignee - Optional user or team assigned to the idea.
 * @returns The newly created {@link PortfolioItem} with a generated UUID.
 */
export function addPortfolioItem(params: {
  title: string;
  description: string;
  sourceAngle: string;
  sessionId?: string;
  tags?: string[];
  assignee?: string;
}): PortfolioItem {
  ensureDir();
  const now = new Date().toISOString();
  const item: PortfolioItem = {
    id: randomUUID(),
    sessionId: params.sessionId,
    title: params.title,
    description: params.description,
    sourceAngle: params.sourceAngle,
    stage: "ideation",
    transitions: [],
    createdAt: now,
    updatedAt: now,
    tags: params.tags ?? [],
    assignee: params.assignee,
  };
  writeFileSync(itemPath(item.id), JSON.stringify(item, null, 2), "utf-8");
  return item;
}

/**
 * Retrieve a portfolio item by its unique ID.
 *
 * Reads the item from `~/.innovator/portfolio/<id>.json`. Returns `undefined`
 * if the item does not exist or the file cannot be parsed.
 *
 * @param id - UUID of the portfolio item.
 * @returns The {@link PortfolioItem}, or `undefined` if not found.
 */
export function getPortfolioItem(id: string): PortfolioItem | undefined {
  try {
    const path = itemPath(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as PortfolioItem;
  } catch {
    return undefined;
  }
}

/**
 * Transition a portfolio item to a new lifecycle stage.
 *
 * Records a {@link StatusTransition} with timestamps and optional metadata,
 * updates the item's current stage, and persists the change.
 *
 * Valid stages: `ideation` → `evaluation` → `prototyping` → `shipped` | `abandoned`.
 *
 * @param id - UUID of the portfolio item to transition.
 * @param toStage - The target {@link IdeaLifecycleStage}.
 * @param reason - Optional reason for the transition (e.g. `"passed feasibility review"`).
 * @param userId - Optional ID of the user who initiated the transition.
 * @returns The updated {@link PortfolioItem}, or `undefined` if the item was not found.
 */
export function transitionItem(
  id: string,
  toStage: IdeaLifecycleStage,
  reason?: string,
  userId?: string
): PortfolioItem | undefined {
  const item = getPortfolioItem(id);
  if (!item) return undefined;

  const transition: StatusTransition = {
    from: item.stage,
    to: toStage,
    timestamp: new Date().toISOString(),
    reason,
    userId,
  };

  item.transitions.push(transition);
  item.stage = toStage;
  item.updatedAt = new Date().toISOString();
  writeFileSync(itemPath(id), JSON.stringify(item, null, 2), "utf-8");
  return item;
}

/**
 * Update a portfolio item's metadata.
 *
 * Merges the provided fields into the existing item. Only supplied fields are
 * overwritten; omitted fields remain unchanged. The `updatedAt` timestamp is
 * refreshed automatically.
 *
 * @param id - UUID of the portfolio item to update.
 * @param updates - Partial metadata to merge.
 * @param updates.outcome - Free-text outcome description (e.g. `"launched as v2 feature"`).
 * @param updates.impactScore - Numeric impact score from 0 to 10.
 * @param updates.tags - Replacement tag array (overwrites existing tags).
 * @param updates.assignee - New assignee user or team.
 * @returns `true` if the item was found and updated, `false` otherwise.
 */
export function updatePortfolioItem(
  id: string,
  updates: {
    outcome?: string;
    impactScore?: number;
    tags?: string[];
    assignee?: string;
  }
): boolean {
  const item = getPortfolioItem(id);
  if (!item) return false;

  if (updates.outcome !== undefined) item.outcome = updates.outcome;
  if (updates.impactScore !== undefined) item.impactScore = updates.impactScore;
  if (updates.tags !== undefined) item.tags = updates.tags;
  if (updates.assignee !== undefined) item.assignee = updates.assignee;
  item.updatedAt = new Date().toISOString();

  writeFileSync(itemPath(id), JSON.stringify(item, null, 2), "utf-8");
  return true;
}

/**
 * Delete a portfolio item permanently.
 *
 * Removes the item's JSON file from `~/.innovator/portfolio/`. This action
 * is irreversible.
 *
 * @param id - UUID of the portfolio item to delete.
 * @returns `true` if the item existed and was deleted, `false` if not found.
 */
export function deletePortfolioItem(id: string): boolean {
  const path = itemPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/**
 * List all portfolio items, sorted by most recently updated first.
 *
 * Reads every `.json` file in `~/.innovator/portfolio/` and returns them as
 * an array. Corrupt or unreadable files are silently skipped.
 *
 * @returns Array of {@link PortfolioItem} objects, sorted descending by `updatedAt`.
 */
export function listPortfolioItems(): PortfolioItem[] {
  ensureDir();
  const files = readdirSync(PORTFOLIO_DIR).filter((f) => f.endsWith(".json"));
  const items: PortfolioItem[] = [];
  for (const file of files) {
    try {
      items.push(JSON.parse(readFileSync(join(PORTFOLIO_DIR, file), "utf-8")) as PortfolioItem);
    } catch {
      // Skip corrupt files
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Compute aggregated metrics across the entire portfolio.
 *
 * Calculates totals by stage and angle, conversion rates between lifecycle
 * stages, average time spent in each stage, and idea creation velocity
 * (ideas per week).
 *
 * @returns A {@link PortfolioMetrics} snapshot of the current portfolio state.
 */
export function getPortfolioMetrics(): PortfolioMetrics {
  const items = listPortfolioItems();
  const stages: IdeaLifecycleStage[] = [
    "ideation",
    "evaluation",
    "prototyping",
    "shipped",
    "abandoned",
  ];

  const byStage: Record<string, number> = {};
  const byAngle: Record<string, number> = {};
  for (const s of stages) byStage[s] = 0;

  for (const item of items) {
    byStage[item.stage] = (byStage[item.stage] ?? 0) + 1;
    byAngle[item.sourceAngle] = (byAngle[item.sourceAngle] ?? 0) + 1;
  }

  const total = items.length || 1;
  const evaluated = items.filter((i) => i.transitions.some((t) => t.to === "evaluation")).length;
  const prototyped = items.filter((i) => i.transitions.some((t) => t.to === "prototyping")).length;
  const shipped = items.filter((i) => i.transitions.some((t) => t.to === "shipped")).length;

  // Average time in each stage
  const avgTimeInStageMs: Record<string, number> = {};
  for (const stage of stages) {
    const durations: number[] = [];
    for (const item of items) {
      const entered = item.transitions.find((t) => t.to === stage);
      const exited = item.transitions.find((t) => t.from === stage);
      if (entered && exited) {
        durations.push(
          new Date(exited.timestamp).getTime() - new Date(entered.timestamp).getTime()
        );
      }
    }
    avgTimeInStageMs[stage] =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  // Velocity: ideas created per week
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentIdeas = items.filter((i) => new Date(i.createdAt).getTime() >= oneWeekAgo).length;

  return {
    totalIdeas: items.length,
    byStage: byStage as Record<IdeaLifecycleStage, number>,
    byAngle,
    conversionRates: {
      ideationToEvaluation: evaluated / total,
      evaluationToPrototyping: evaluated > 0 ? prototyped / evaluated : 0,
      prototypingToShipped: prototyped > 0 ? shipped / prototyped : 0,
      overallShipRate: shipped / total,
    },
    avgTimeInStageMs: avgTimeInStageMs as Record<IdeaLifecycleStage, number>,
    velocityPerWeek: recentIdeas,
  };
}

/**
 * Generate actionable insights from portfolio metrics.
 *
 * Analyzes conversion rates, velocity, stage distribution, and angle
 * performance to produce an array of typed insights:
 * - `"strength"` — metrics that exceed benchmarks (e.g. high ship rate).
 * - `"warning"` — metrics that suggest problems (e.g. low evaluation rate).
 * - `"opportunity"` — areas with untapped potential (e.g. prototype backlog).
 *
 * @returns Array of {@link PortfolioInsight} objects. May be empty if the
 *   portfolio has too few items to draw conclusions.
 */
export function generatePortfolioInsights(): PortfolioInsight[] {
  const metrics = getPortfolioMetrics();
  const insights: PortfolioInsight[] = [];

  if (metrics.conversionRates.overallShipRate > 0.2) {
    insights.push({
      type: "strength",
      title: "Strong shipping rate",
      description: `${(metrics.conversionRates.overallShipRate * 100).toFixed(0)}% of ideas have been shipped — above typical benchmarks.`,
    });
  }

  if (metrics.conversionRates.ideationToEvaluation < 0.3 && metrics.totalIdeas > 5) {
    insights.push({
      type: "warning",
      title: "Low evaluation rate",
      description:
        "Most ideas aren't progressing past ideation. Consider more structured evaluation criteria.",
    });
  }

  if (
    metrics.byStage.prototyping > metrics.byStage.shipped * 2 &&
    metrics.byStage.prototyping > 3
  ) {
    insights.push({
      type: "opportunity",
      title: "Prototype backlog",
      description: `${metrics.byStage.prototyping} ideas are stuck in prototyping. Prioritize shipping or pruning.`,
    });
  }

  if (metrics.velocityPerWeek > 5) {
    insights.push({
      type: "strength",
      title: "High idea velocity",
      description: `${metrics.velocityPerWeek} new ideas this week shows strong creative momentum.`,
    });
  }

  // Find best-performing angle
  const topAngle = Object.entries(metrics.byAngle).sort(([, a], [, b]) => b - a)[0];
  if (topAngle && metrics.totalIdeas > 3) {
    insights.push({
      type: "opportunity",
      title: `Top angle: ${topAngle[0]}`,
      description: `${topAngle[0]} has generated the most ideas (${topAngle[1]}). Consider deeper exploration.`,
    });
  }

  return insights;
}

// ---- Dashboard Data Builder ----

/** Comprehensive dashboard data combining portfolio, analytics, and sessions. */
export interface InnovationDashboardData {
  portfolio: PortfolioMetrics;
  insights: PortfolioInsight[];
  funnel: {
    subjects: number;
    investigations: number;
    ideas: number;
    scored: number;
    exported: number;
    shipped: number;
  };
  angleEffectiveness: Array<{
    angleId: string;
    timesUsed: number;
    totalIdeas: number;
    avgIdeasPerRun: number;
    shipRate: number;
  }>;
  activityTimeline: Array<{
    date: string;
    sessions: number;
    ideas: number;
  }>;
  healthScore: {
    overall: number;
    velocity: number;
    diversity: number;
    quality: number;
  };
  topSubjects: Array<{ subject: string; count: number }>;
  generatedAt: string;
}

/**
 * Build comprehensive dashboard data from portfolio items and session history.
 */
export function buildDashboardData(
  sessions: Array<{
    subject: string;
    createdAt: string;
    angleResults: Array<{ angleId: string; angleName: string; ideas: Array<unknown> }>;
  }>
): InnovationDashboardData {
  const metrics = getPortfolioMetrics();
  const insights = generatePortfolioInsights();
  const items = listPortfolioItems();

  // Funnel
  const subjectSet = new Set(sessions.map((s) => s.subject.toLowerCase().trim()));
  const totalIdeas = sessions.reduce(
    (sum, s) => sum + s.angleResults.reduce((a, ar) => a + ar.ideas.length, 0),
    0
  );

  const funnel = {
    subjects: subjectSet.size,
    investigations: sessions.length,
    ideas: totalIdeas,
    scored: items.filter((i) => i.transitions.some((t) => t.to === "evaluation")).length,
    exported: items.filter((i) => i.transitions.length > 0).length,
    shipped: items.filter((i) => i.stage === "shipped").length,
  };

  // Angle effectiveness
  const angleMap = new Map<string, { used: number; ideas: number; shipped: number }>();
  for (const s of sessions) {
    for (const ar of s.angleResults) {
      const entry = angleMap.get(ar.angleId) ?? { used: 0, ideas: 0, shipped: 0 };
      entry.used++;
      entry.ideas += ar.ideas.length;
      angleMap.set(ar.angleId, entry);
    }
  }
  for (const item of items.filter((i) => i.stage === "shipped")) {
    const entry = angleMap.get(item.sourceAngle);
    if (entry) entry.shipped++;
  }

  const angleEffectiveness = Array.from(angleMap.entries())
    .map(([angleId, d]) => ({
      angleId,
      timesUsed: d.used,
      totalIdeas: d.ideas,
      avgIdeasPerRun: d.used > 0 ? +(d.ideas / d.used).toFixed(1) : 0,
      shipRate: d.ideas > 0 ? +(d.shipped / d.ideas).toFixed(3) : 0,
    }))
    .sort((a, b) => b.timesUsed - a.timesUsed);

  // Activity timeline (last 30 days)
  const dateMap = new Map<string, { sessions: number; ideas: number }>();
  for (const s of sessions) {
    const date = s.createdAt.split("T")[0];
    const entry = dateMap.get(date) ?? { sessions: 0, ideas: 0 };
    entry.sessions++;
    entry.ideas += s.angleResults.reduce((a, ar) => a + ar.ideas.length, 0);
    dateMap.set(date, entry);
  }
  const activityTimeline = Array.from(dateMap.entries())
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  // Health score
  const distinctAngles = angleMap.size;
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const recentSessions = sessions.filter((s) => s.createdAt >= fourWeeksAgo);
  const velocityScore = Math.min(100, Math.round((recentSessions.length / 4) * 20));
  const diversityScore = Math.min(100, Math.round((distinctAngles / 8) * 100));
  const qualityScore =
    totalIdeas > 0 ? Math.min(100, Math.round((funnel.shipped / totalIdeas) * 500)) : 0;

  // Top subjects
  const subjectCounts = new Map<string, number>();
  for (const s of sessions) {
    const key = s.subject.toLowerCase().trim();
    subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
  }
  const topSubjects = Array.from(subjectCounts.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    portfolio: metrics,
    insights,
    funnel,
    angleEffectiveness,
    activityTimeline,
    healthScore: {
      overall: Math.round((velocityScore + diversityScore + qualityScore) / 3),
      velocity: velocityScore,
      diversity: diversityScore,
      quality: qualityScore,
    },
    topSubjects,
    generatedAt: new Date().toISOString(),
  };
}
