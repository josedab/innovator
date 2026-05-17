import { z } from "zod";
import { randomUUID } from "node:crypto";

export const CreatorStatsSchema = z.object({
  creatorId: z.string(),
  totalPacks: z.number(),
  totalDownloads: z.number(),
  averageRating: z.number(),
  totalRevenue: z.number(),
  topPack: z.string().optional(),
  joinedAt: z.string(),
});
export type CreatorStats = z.infer<typeof CreatorStatsSchema>;

export const PackVersionSchema = z.object({
  version: z.string().max(50),
  publishedAt: z.string(),
  changelog: z.string().max(2000),
  downloadCount: z.number(),
});
export type PackVersion = z.infer<typeof PackVersionSchema>;

export const PackSubmissionSchema = z.object({
  id: z.string(),
  packId: z.string(),
  creatorId: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  submittedAt: z.string(),
  reviewedAt: z.string().optional(),
  reviewNotes: z.string().max(2000).optional(),
});
export type PackSubmission = z.infer<typeof PackSubmissionSchema>;

const submissions = new Map<string, PackSubmission>();
const creatorStats = new Map<string, CreatorStats>();
const packVersions = new Map<string, PackVersion[]>();

function getOrCreateCreatorStats(creatorId: string): CreatorStats {
  const existing = creatorStats.get(creatorId);
  if (existing) return existing;

  const stats = CreatorStatsSchema.parse({
    creatorId,
    totalPacks: 0,
    totalDownloads: 0,
    averageRating: 0,
    totalRevenue: 0,
    joinedAt: new Date().toISOString(),
  });
  creatorStats.set(creatorId, stats);
  return stats;
}

function getCreatorPackIds(creatorId: string): string[] {
  return [...new Set(Array.from(submissions.values()).filter((entry) => entry.creatorId === creatorId).map((entry) => entry.packId))];
}

function resolveTopPack(creatorId: string): string | undefined {
  const creatorPackIds = getCreatorPackIds(creatorId);
  if (creatorPackIds.length === 0) return undefined;

  return creatorPackIds
    .map((packId) => ({
      packId,
      downloads: (packVersions.get(packId) ?? []).reduce((sum, version) => sum + version.downloadCount, 0),
      versions: (packVersions.get(packId) ?? []).length,
    }))
    .sort((left, right) => right.downloads - left.downloads || right.versions - left.versions)[0]?.packId;
}

function saveCreatorStats(stats: CreatorStats): CreatorStats {
  const validated = CreatorStatsSchema.parse(stats);
  creatorStats.set(validated.creatorId, validated);
  return validated;
}

export function submitPack(packId: string, creatorId: string): PackSubmission {
  const submission = PackSubmissionSchema.parse({
    id: randomUUID(),
    packId,
    creatorId,
    status: "pending",
    submittedAt: new Date().toISOString(),
  });

  submissions.set(submission.id, submission);

  const currentStats = getOrCreateCreatorStats(creatorId);
  const nextStats = saveCreatorStats({
    ...currentStats,
    totalPacks: getCreatorPackIds(creatorId).length,
    topPack: resolveTopPack(creatorId) ?? packId,
  });

  creatorStats.set(creatorId, nextStats);
  return submission;
}

export function reviewSubmission(
  id: string,
  status: "approved" | "rejected",
  notes?: string
): PackSubmission | undefined {
  const submission = submissions.get(id);
  if (!submission) return undefined;

  const updated = PackSubmissionSchema.parse({
    ...submission,
    status,
    reviewedAt: new Date().toISOString(),
    reviewNotes: notes,
  });

  submissions.set(id, updated);
  return updated;
}

export function getCreatorStats(creatorId: string): CreatorStats | undefined {
  return creatorStats.get(creatorId);
}

export function updateCreatorStats(
  creatorId: string,
  downloads: number = 0,
  revenue: number = 0
): CreatorStats {
  const currentStats = getOrCreateCreatorStats(creatorId);
  const updated = saveCreatorStats({
    ...currentStats,
    totalPacks: getCreatorPackIds(creatorId).length,
    totalDownloads: currentStats.totalDownloads + downloads,
    totalRevenue: currentStats.totalRevenue + revenue,
    topPack: resolveTopPack(creatorId) ?? currentStats.topPack,
  });

  creatorStats.set(creatorId, updated);
  return updated;
}

export function addPackVersion(packId: string, version: string, changelog: string): PackVersion {
  const existing = packVersions.get(packId) ?? [];
  const duplicate = existing.find((entry) => entry.version === version);
  if (duplicate) return duplicate;

  const packVersion = PackVersionSchema.parse({
    version,
    publishedAt: new Date().toISOString(),
    changelog,
    downloadCount: 0,
  });

  packVersions.set(packId, [...existing, packVersion]);
  return packVersion;
}

export function getPackVersions(packId: string): PackVersion[] {
  return [...(packVersions.get(packId) ?? [])].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function listSubmissions(filter?: {
  status?: string;
  creatorId?: string;
}): PackSubmission[] {
  return Array.from(submissions.values())
    .filter((submission) => (filter?.status ? submission.status === filter.status : true))
    .filter((submission) => (filter?.creatorId ? submission.creatorId === filter.creatorId : true))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export function clearCreatorData(): void {
  submissions.clear();
  creatorStats.clear();
  packVersions.clear();
}
