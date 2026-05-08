/**
 * @module tracker
 *
 * Idea fitness tracker — maps exported ideas to external issue trackers
 * (GitHub Issues, Linear, Jira) and tracks their lifecycle status.
 * Stores mappings in ~/.innovator/tracker/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Types ----

export const ExternalStatusSchema = z.enum(["open", "in-progress", "closed", "unknown"]);
export type ExternalStatus = z.infer<typeof ExternalStatusSchema>;

export const TrackerPlatformSchema = z.enum(["github", "linear", "jira"]);
export type TrackerPlatform = z.infer<typeof TrackerPlatformSchema>;

export const TrackedIdeaSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  platform: TrackerPlatformSchema,
  externalId: z.string().max(500),
  externalUrl: z.string().max(2000).optional(),
  status: ExternalStatusSchema,
  exportedAt: z.string(),
  lastCheckedAt: z.string().optional(),
  statusHistory: z.array(
    z.object({
      status: ExternalStatusSchema,
      timestamp: z.string(),
    })
  ),
});

export type TrackedIdea = z.infer<typeof TrackedIdeaSchema>;

/** Aggregated dashboard view of all tracked ideas with statistics and insights. */
export interface TrackerDashboard {
  totalTracked: number;
  totalExported: number;
  byStatus: Record<ExternalStatus, number>;
  byPlatform: Record<string, number>;
  byAngle: Record<string, { exported: number; shipped: number }>;
  innovationHitRate: number;
  insights: string[];
}

// ---- Storage ----

const TRACKER_DIR = join(homedir(), ".innovator", "tracker");

function ensureTrackerDir(): void {
  if (!existsSync(TRACKER_DIR)) {
    mkdirSync(TRACKER_DIR, { recursive: true });
  }
}

/** Track an exported idea with its external ID. */
export function trackIdea(params: {
  sessionId: string;
  ideaTitle: string;
  angleId: string;
  platform: TrackerPlatform;
  externalId: string;
  externalUrl?: string;
}): string {
  ensureTrackerDir();
  const id = randomUUID();
  const now = new Date().toISOString();
  const tracked: TrackedIdea = {
    id,
    sessionId: params.sessionId,
    ideaTitle: params.ideaTitle,
    angleId: params.angleId,
    platform: params.platform,
    externalId: params.externalId,
    externalUrl: params.externalUrl,
    status: "open",
    exportedAt: now,
    statusHistory: [{ status: "open", timestamp: now }],
  };
  writeFileSync(join(TRACKER_DIR, `${id}.json`), JSON.stringify(tracked, null, 2), "utf-8");
  return id;
}

/** Load all tracked ideas. */
export function loadTrackedIdeas(): TrackedIdea[] {
  ensureTrackerDir();
  const files = readdirSync(TRACKER_DIR).filter((f) => f.endsWith(".json"));
  const ideas: TrackedIdea[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(TRACKER_DIR, file), "utf-8");
      ideas.push(TrackedIdeaSchema.parse(JSON.parse(raw)));
    } catch {
      // Skip corrupt files
    }
  }
  return ideas.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
}

/** Update the status of a tracked idea. */
export function updateTrackedIdeaStatus(id: string, status: ExternalStatus): boolean {
  const path = join(TRACKER_DIR, `${id}.json`);
  if (!existsSync(path)) return false;

  try {
    const tracked = TrackedIdeaSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
    const now = new Date().toISOString();
    tracked.status = status;
    tracked.lastCheckedAt = now;
    tracked.statusHistory.push({ status, timestamp: now });
    writeFileSync(path, JSON.stringify(tracked, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Get a tracked idea by ID. */
export function getTrackedIdea(id: string): TrackedIdea | undefined {
  const path = join(TRACKER_DIR, `${id}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return TrackedIdeaSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return undefined;
  }
}

/** Build the tracker dashboard with statistics and AI-generated insights. */
export function buildDashboard(): TrackerDashboard {
  const ideas = loadTrackedIdeas();
  const totalTracked = ideas.length;

  const byStatus: Record<ExternalStatus, number> = {
    open: 0,
    "in-progress": 0,
    closed: 0,
    unknown: 0,
  };
  const byPlatform: Record<string, number> = {};
  const byAngle: Record<string, { exported: number; shipped: number }> = {};

  for (const idea of ideas) {
    byStatus[idea.status]++;
    byPlatform[idea.platform] = (byPlatform[idea.platform] ?? 0) + 1;

    if (!byAngle[idea.angleId]) {
      byAngle[idea.angleId] = { exported: 0, shipped: 0 };
    }
    byAngle[idea.angleId].exported++;
    if (idea.status === "closed") {
      byAngle[idea.angleId].shipped++;
    }
  }

  const shipped = byStatus.closed;
  const innovationHitRate = totalTracked > 0 ? Math.round((shipped / totalTracked) * 100) / 100 : 0;

  // Generate insights
  const insights: string[] = [];
  if (totalTracked === 0) {
    insights.push("No ideas tracked yet. Export ideas to GitHub/Linear/Jira to start tracking.");
  } else {
    insights.push(
      `Innovation hit rate: ${Math.round(innovationHitRate * 100)}% (${shipped}/${totalTracked} shipped)`
    );

    // Find best-performing angle
    const angleEntries = Object.entries(byAngle).filter(([, v]) => v.exported >= 2);
    if (angleEntries.length > 0) {
      const bestAngle = angleEntries.sort(
        ([, a], [, b]) => b.shipped / b.exported - a.shipped / a.exported
      )[0];
      if (bestAngle[1].shipped > 0) {
        const rate = Math.round((bestAngle[1].shipped / bestAngle[1].exported) * 100);
        insights.push(`Best performing angle: ${bestAngle[0]} (${rate}% ship rate)`);
      }
    }

    if (byStatus["in-progress"] > 0) {
      insights.push(`${byStatus["in-progress"]} ideas currently in progress`);
    }
  }

  return {
    totalTracked,
    totalExported: totalTracked,
    byStatus,
    byPlatform,
    byAngle,
    innovationHitRate,
    insights,
  };
}

// ---- Impact Tracking ----

export const ImpactLinkSchema = z.object({
  id: z.string().max(100),
  ideaId: z.string().max(100),
  ideaTitle: z.string().max(500),
  linkType: z.enum(["commit", "pr", "issue", "jira-ticket", "launch", "manual"]),
  externalRef: z.string().max(2000),
  externalUrl: z.string().max(2000).optional(),
  linkedAt: z.string(),
  detectedBy: z.enum(["manual", "auto-semantic", "auto-keyword"]),
  confidence: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string().max(500)).optional(),
});

export const ImpactMetricsSchema = z.object({
  ideaId: z.string().max(100),
  ideaTitle: z.string().max(500),
  timeToImplementationDays: z.number().nullable(),
  implementationLinks: z.array(ImpactLinkSchema),
  status: z.enum(["not-started", "in-progress", "implemented", "launched", "abandoned"]),
  estimatedROI: z
    .object({
      revenueImpact: z.number().optional(),
      costSavings: z.number().optional(),
      timesSaved: z.number().optional(),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
});

export const ImpactDashboardSchema = z.object({
  totalIdeas: z.number(),
  implementedIdeas: z.number(),
  implementationRate: z.number().min(0).max(1),
  avgTimeToImplementationDays: z.number().nullable(),
  totalEstimatedROI: z.number(),
  ideaByStatus: z.record(z.number()),
  topPerformers: z
    .array(
      z.object({
        ideaTitle: z.string().max(500),
        roi: z.number(),
        timeToImplementDays: z.number(),
      })
    )
    .max(10),
  angleEffectiveness: z
    .array(
      z.object({
        angleId: z.string().max(100),
        ideasGenerated: z.number(),
        ideasImplemented: z.number(),
        implementationRate: z.number().min(0).max(1),
      })
    )
    .max(20),
  monthlyTrend: z
    .array(
      z.object({
        month: z.string().max(10),
        ideasGenerated: z.number(),
        ideasImplemented: z.number(),
      })
    )
    .max(24),
});

export type ImpactLink = z.infer<typeof ImpactLinkSchema>;
export type ImpactMetrics = z.infer<typeof ImpactMetricsSchema>;
export type ImpactDashboard = z.infer<typeof ImpactDashboardSchema>;

const impactLinks = new Map<string, ImpactLink[]>();
const impactMetrics = new Map<string, ImpactMetrics>();

/** Link an implementation artifact to an idea. */
export function linkImplementation(params: {
  ideaId: string;
  ideaTitle: string;
  linkType: ImpactLink["linkType"];
  externalRef: string;
  externalUrl?: string;
  detectedBy?: ImpactLink["detectedBy"];
  confidence?: number;
  metadata?: Record<string, string>;
}): ImpactLink {
  const link: ImpactLink = {
    id: `link_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    ideaId: params.ideaId,
    ideaTitle: params.ideaTitle,
    linkType: params.linkType,
    externalRef: params.externalRef,
    externalUrl: params.externalUrl,
    linkedAt: new Date().toISOString(),
    detectedBy: params.detectedBy ?? "manual",
    confidence: params.confidence ?? 1,
    metadata: params.metadata,
  };

  const existing = impactLinks.get(params.ideaId) ?? [];
  existing.push(link);
  impactLinks.set(params.ideaId, existing);

  // Update impact metrics
  updateImpactMetrics(params.ideaId, params.ideaTitle);

  return link;
}

/** Get impact links for an idea. */
export function getImpactLinks(ideaId: string): ImpactLink[] {
  return impactLinks.get(ideaId) ?? [];
}

/** Update impact metrics for an idea based on its links. */
function updateImpactMetrics(ideaId: string, ideaTitle: string): void {
  const links = impactLinks.get(ideaId) ?? [];

  const hasImplementation = links.some((l) => ["commit", "pr", "launch"].includes(l.linkType));
  const hasLaunch = links.some((l) => l.linkType === "launch");

  const existing = impactMetrics.get(ideaId);
  const earliestLink =
    links.length > 0
      ? links.reduce((min, l) => (l.linkedAt < min ? l.linkedAt : min), links[0].linkedAt)
      : null;

  const metrics: ImpactMetrics = {
    ideaId,
    ideaTitle,
    timeToImplementationDays: earliestLink
      ? Math.round((Date.now() - new Date(earliestLink).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    implementationLinks: links,
    status: hasLaunch
      ? "launched"
      : hasImplementation
        ? "implemented"
        : links.length > 0
          ? "in-progress"
          : "not-started",
    estimatedROI: existing?.estimatedROI,
  };

  impactMetrics.set(ideaId, metrics);
}

/** Set estimated ROI for an idea. */
export function setIdeaROI(
  ideaId: string,
  roi: {
    revenueImpact?: number;
    costSavings?: number;
    timesSaved?: number;
    confidence?: number;
  }
): boolean {
  const metrics = impactMetrics.get(ideaId);
  if (!metrics) return false;

  metrics.estimatedROI = {
    ...roi,
    confidence: roi.confidence ?? 0.5,
  };

  return true;
}

/** Auto-detect potential links using keyword matching. */
export function autoDetectLinks(
  ideaTitle: string,
  ideaDescription: string,
  commits: Array<{ sha: string; message: string; url?: string }>
): Array<{ ref: string; url?: string; confidence: number }> {
  const keywords = extractKeywords(ideaTitle + " " + ideaDescription);
  const matches: Array<{ ref: string; url?: string; confidence: number }> = [];

  for (const commit of commits) {
    const commitKeywords = extractKeywords(commit.message);
    const overlap = keywords.filter((k) => commitKeywords.includes(k));
    const confidence = keywords.length > 0 ? overlap.length / keywords.length : 0;

    if (confidence >= 0.3) {
      matches.push({
        ref: commit.sha,
        url: commit.url,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "and",
    "or",
    "not",
    "this",
    "that",
    "it",
  ]);
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Build the executive-facing impact dashboard. */
export function buildImpactDashboard(): ImpactDashboard {
  const ideas = loadTrackedIdeas();
  const allMetrics = Array.from(impactMetrics.values());

  const totalIdeas = Math.max(ideas.length, allMetrics.length);
  const implementedIdeas = allMetrics.filter(
    (m) => m.status === "implemented" || m.status === "launched"
  ).length;

  const implementationRate = totalIdeas > 0 ? implementedIdeas / totalIdeas : 0;

  const implementationTimes = allMetrics
    .map((m) => m.timeToImplementationDays)
    .filter((t): t is number => t !== null && t > 0);
  const avgTimeToImplementationDays =
    implementationTimes.length > 0
      ? Math.round(implementationTimes.reduce((s, t) => s + t, 0) / implementationTimes.length)
      : null;

  const totalEstimatedROI = allMetrics.reduce((sum, m) => {
    if (!m.estimatedROI) return sum;
    return sum + (m.estimatedROI.revenueImpact ?? 0) + (m.estimatedROI.costSavings ?? 0);
  }, 0);

  const ideaByStatus: Record<string, number> = {};
  for (const m of allMetrics) {
    ideaByStatus[m.status] = (ideaByStatus[m.status] ?? 0) + 1;
  }

  const topPerformers = allMetrics
    .filter((m) => m.estimatedROI)
    .sort((a, b) => {
      const roiA = (a.estimatedROI?.revenueImpact ?? 0) + (a.estimatedROI?.costSavings ?? 0);
      const roiB = (b.estimatedROI?.revenueImpact ?? 0) + (b.estimatedROI?.costSavings ?? 0);
      return roiB - roiA;
    })
    .slice(0, 10)
    .map((m) => ({
      ideaTitle: m.ideaTitle,
      roi: (m.estimatedROI?.revenueImpact ?? 0) + (m.estimatedROI?.costSavings ?? 0),
      timeToImplementDays: m.timeToImplementationDays ?? 0,
    }));

  // Angle effectiveness from tracked ideas
  const angleMap = new Map<string, { generated: number; implemented: number }>();
  for (const idea of ideas) {
    const entry = angleMap.get(idea.angleId) ?? { generated: 0, implemented: 0 };
    entry.generated++;
    if (idea.status === "closed") entry.implemented++;
    angleMap.set(idea.angleId, entry);
  }

  const angleEffectiveness = Array.from(angleMap.entries())
    .map(([angleId, data]) => ({
      angleId,
      ideasGenerated: data.generated,
      ideasImplemented: data.implemented,
      implementationRate: data.generated > 0 ? data.implemented / data.generated : 0,
    }))
    .sort((a, b) => b.implementationRate - a.implementationRate);

  return {
    totalIdeas,
    implementedIdeas,
    implementationRate: Math.round(implementationRate * 100) / 100,
    avgTimeToImplementationDays,
    totalEstimatedROI,
    ideaByStatus,
    topPerformers,
    angleEffectiveness,
    monthlyTrend: [],
  };
}

/** Clear impact tracking data (for testing). */
export function clearImpactTracking(): void {
  impactLinks.clear();
  impactMetrics.clear();
}
