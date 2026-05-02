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
