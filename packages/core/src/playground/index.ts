/**
 * @module playground
 *
 * Hosted playground / SaaS mode infrastructure.
 * Provides session management, free-tier rate limiting,
 * shareable result URLs, and usage tracking.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const PlaygroundSessionSchema = z.object({
  id: z.string().max(100),
  userId: z.string().max(200).optional(),
  subject: z.string().max(5000),
  status: z.enum(["pending", "running", "completed", "failed", "expired"]),
  shareId: z.string().max(50).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  result: z.unknown().optional(),
  tier: z.enum(["free", "pro", "team", "enterprise"]).default("free"),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type PlaygroundSession = z.infer<typeof PlaygroundSessionSchema>;

export const UsageLimitSchema = z.object({
  tier: z.enum(["free", "pro", "team", "enterprise"]),
  maxSessionsPerDay: z.number().int(),
  maxSessionsPerMonth: z.number().int(),
  maxSubjectLength: z.number().int().min(0),
  maxAngles: z.number().int().min(0),
  features: z.array(z.string().max(100)),
});

export type UsageLimit = z.infer<typeof UsageLimitSchema>;

export interface UserUsage {
  userId: string;
  tier: "free" | "pro" | "team" | "enterprise";
  sessionsToday: number;
  sessionsThisMonth: number;
  lastSessionAt?: string;
  totalSessions: number;
}

// ---- Tier Configuration ----

export const TIER_LIMITS: Record<string, UsageLimit> = {
  free: {
    tier: "free",
    maxSessionsPerDay: 3,
    maxSessionsPerMonth: 30,
    maxSubjectLength: 500,
    maxAngles: 3,
    features: ["investigate", "generate", "synthesize", "share"],
  },
  pro: {
    tier: "pro",
    maxSessionsPerDay: 50,
    maxSessionsPerMonth: 500,
    maxSubjectLength: 5000,
    maxAngles: 8,
    features: [
      "investigate",
      "generate",
      "synthesize",
      "share",
      "debate",
      "redteam",
      "artifacts",
      "export",
      "analytics",
    ],
  },
  team: {
    tier: "team",
    maxSessionsPerDay: 200,
    maxSessionsPerMonth: 2000,
    maxSubjectLength: 5000,
    maxAngles: 20,
    features: [
      "investigate",
      "generate",
      "synthesize",
      "share",
      "debate",
      "redteam",
      "artifacts",
      "export",
      "analytics",
      "collaboration",
      "canvas",
      "workflows",
      "coaching",
    ],
  },
  enterprise: {
    tier: "enterprise",
    maxSessionsPerDay: -1,
    maxSessionsPerMonth: -1,
    maxSubjectLength: 10000,
    maxAngles: 50,
    features: ["all"],
  },
};

// ---- In-Memory Store ----

const sessions = new Map<string, PlaygroundSession>();
const shareIndex = new Map<string, string>();
const userUsageStore = new Map<string, UserUsage>();

function generateShareId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Create a new playground session. */
export function createPlaygroundSession(
  subject: string,
  userId?: string,
  tier: PlaygroundSession["tier"] = "free"
): PlaygroundSession {
  const id = randomUUID();
  const shareId = generateShareId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const session: PlaygroundSession = {
    id,
    userId,
    subject,
    status: "pending",
    shareId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tier,
  };

  sessions.set(id, session);
  shareIndex.set(shareId, id);

  if (userId) {
    const usage = getUserUsage(userId);
    const today = now.toISOString().split("T")[0];
    const lastDay = usage.lastSessionAt?.split("T")[0];
    if (lastDay !== today) usage.sessionsToday = 0;
    usage.sessionsToday++;
    usage.sessionsThisMonth++;
    usage.totalSessions++;
    usage.lastSessionAt = now.toISOString();
    userUsageStore.set(userId, usage);
  }

  return session;
}

/** Get session by ID. */
export function getPlaygroundSession(id: string): PlaygroundSession | undefined {
  return sessions.get(id);
}

/** Get session by share ID. */
export function getSessionByShareId(shareId: string): PlaygroundSession | undefined {
  const sessionId = shareIndex.get(shareId);
  if (!sessionId) return undefined;
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    session.status = "expired";
  }
  return session;
}

/** Update session. */
export function updatePlaygroundSession(
  id: string,
  update: Partial<Pick<PlaygroundSession, "status" | "result" | "completedAt">>
): PlaygroundSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (update.status) session.status = update.status;
  if (update.result) session.result = update.result;
  if (update.completedAt) session.completedAt = update.completedAt;
  return session;
}

/** Get user sessions. */
export function getUserSessions(userId: string, limit = 20): PlaygroundSession[] {
  return Array.from(sessions.values())
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Get user usage. */
export function getUserUsage(userId: string): UserUsage {
  return (
    userUsageStore.get(userId) ?? {
      userId,
      tier: "free",
      sessionsToday: 0,
      sessionsThisMonth: 0,
      totalSessions: 0,
    }
  );
}

/** Check usage limits. */
export function checkUsageLimit(userId: string): {
  allowed: boolean;
  reason?: string;
  remaining: number;
  limit: number;
} {
  const usage = getUserUsage(userId);
  const limits = TIER_LIMITS[usage.tier] ?? TIER_LIMITS.free;

  if (limits.maxSessionsPerDay > 0 && usage.sessionsToday >= limits.maxSessionsPerDay) {
    return {
      allowed: false,
      reason: `Daily limit reached (${limits.maxSessionsPerDay}/day on ${usage.tier} tier)`,
      remaining: 0,
      limit: limits.maxSessionsPerDay,
    };
  }

  if (limits.maxSessionsPerMonth > 0 && usage.sessionsThisMonth >= limits.maxSessionsPerMonth) {
    return {
      allowed: false,
      reason: `Monthly limit reached (${limits.maxSessionsPerMonth}/month on ${usage.tier} tier)`,
      remaining: 0,
      limit: limits.maxSessionsPerMonth,
    };
  }

  const remaining =
    limits.maxSessionsPerDay > 0 ? limits.maxSessionsPerDay - usage.sessionsToday : -1;

  return { allowed: true, remaining, limit: limits.maxSessionsPerDay };
}

/** Check feature availability. */
export function isFeatureAvailable(tier: string, feature: string): boolean {
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  return limits.features.includes("all") || limits.features.includes(feature);
}

/** Clean expired sessions. */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (session.expiresAt && new Date(session.expiresAt) < now) {
      sessions.delete(id);
      if (session.shareId) shareIndex.delete(session.shareId);
      cleaned++;
    }
  }
  return cleaned;
}

/** Clear all data (testing). */
export function clearPlaygroundData(): void {
  sessions.clear();
  shareIndex.clear();
  userUsageStore.clear();
  workspaces.clear();
}

// ---- Workspace Management ----

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  tier: PlaygroundSession["tier"];
  createdAt: string;
  sessionIds: string[];
  settings: {
    defaultModel?: string;
    allowPublicSharing: boolean;
  };
}

const workspaces = new Map<string, Workspace>();

/** Create a team workspace. */
export function createWorkspace(
  name: string,
  ownerId: string,
  tier: PlaygroundSession["tier"] = "team"
): Workspace {
  const workspace: Workspace = {
    id: randomUUID(),
    name,
    ownerId,
    memberIds: [ownerId],
    tier,
    createdAt: new Date().toISOString(),
    sessionIds: [],
    settings: { allowPublicSharing: true },
  };
  workspaces.set(workspace.id, workspace);
  return workspace;
}

/** Get workspace by ID. */
export function getWorkspace(workspaceId: string): Workspace | undefined {
  return workspaces.get(workspaceId);
}

/** Add a member to a workspace. */
export function addWorkspaceMember(workspaceId: string, userId: string): boolean {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) return false;
  const limits = TIER_LIMITS[workspace.tier] ?? TIER_LIMITS.free;
  const maxMembers = workspace.tier === "enterprise" ? Infinity : limits.maxSessionsPerDay;
  if (workspace.memberIds.length >= maxMembers) return false;
  if (!workspace.memberIds.includes(userId)) {
    workspace.memberIds.push(userId);
  }
  return true;
}

/** List workspaces for a user. */
export function listUserWorkspaces(userId: string): Workspace[] {
  return Array.from(workspaces.values()).filter(
    (w) => w.ownerId === userId || w.memberIds.includes(userId)
  );
}

/** Add a session to a workspace. */
export function addSessionToWorkspace(workspaceId: string, sessionId: string): boolean {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) return false;
  if (!workspace.sessionIds.includes(sessionId)) {
    workspace.sessionIds.push(sessionId);
  }
  return true;
}
