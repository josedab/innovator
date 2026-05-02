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

/** Add an idea to the portfolio. */
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

/** Get a portfolio item by ID. */
export function getPortfolioItem(id: string): PortfolioItem | undefined {
  try {
    const path = itemPath(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as PortfolioItem;
  } catch {
    return undefined;
  }
}

/** Transition an item to a new lifecycle stage. */
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

/** Update a portfolio item's metadata. */
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

/** Delete a portfolio item. */
export function deletePortfolioItem(id: string): boolean {
  const path = itemPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** List all portfolio items. */
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

/** Compute portfolio metrics from all items. */
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

/** Generate insights from portfolio metrics. */
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
