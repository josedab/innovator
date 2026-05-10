/**
 * @module rbac/team-management
 *
 * Team hierarchies, department-level workspaces, usage quotas,
 * and admin dashboard data for enterprise deployments.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Types ----

export const TeamSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  parentId: z.string().max(100).optional(),
  ownerId: z.string().max(200),
  description: z.string().max(1000).optional(),
  memberIds: z.array(z.string().max(200)).max(500),
  settings: z
    .object({
      defaultRole: z.enum(["viewer", "contributor", "facilitator", "admin"]).default("contributor"),
      maxSessions: z.number().int().min(-1).default(-1),
      maxMembers: z.number().int().min(-1).default(-1),
      allowedAngles: z.array(z.string()).optional(),
      dataResidency: z.enum(["us", "eu", "ap", "any"]).default("any"),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Team = z.infer<typeof TeamSchema>;

export interface TeamHierarchy {
  team: Team;
  children: TeamHierarchy[];
  depth: number;
  totalMembers: number;
}

export interface UsageQuota {
  teamId: string;
  period: string;
  sessionsUsed: number;
  sessionsLimit: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  llmTokensUsed: number;
  llmTokensLimit: number;
  lastUpdated: string;
}

export interface AdminDashboardData {
  organizationId: string;
  overview: {
    totalTeams: number;
    totalUsers: number;
    activeUsers30d: number;
    totalSessions: number;
    storageUsedGB: number;
  };
  teamBreakdown: Array<{
    teamId: string;
    teamName: string;
    members: number;
    sessions: number;
    topAngles: string[];
    usagePercent: number;
  }>;
  costAllocation: Array<{
    teamId: string;
    teamName: string;
    llmTokens: number;
    estimatedCost: number;
    percentage: number;
  }>;
  complianceStatus: {
    ssoEnabled: boolean;
    mfaEnabled: boolean;
    auditLogEnabled: boolean;
    dataResidencyCompliant: boolean;
    activeViolations: number;
  };
  recentActivity: Array<{
    timestamp: string;
    userId: string;
    action: string;
    teamId?: string;
  }>;
}

// ---- In-Memory Stores ----

const teams = new Map<string, Team>();
const quotas = new Map<string, UsageQuota>();
const activities: Array<{ timestamp: string; userId: string; action: string; teamId?: string }> =
  [];

// ---- Team Management ----

export function createTeam(input: {
  name: string;
  slug: string;
  ownerId: string;
  parentId?: string;
  description?: string;
}): Team {
  if ([...teams.values()].some((t) => t.slug === input.slug)) {
    throw new Error(`Team slug "${input.slug}" already exists`);
  }

  if (input.parentId && !teams.has(input.parentId)) {
    throw new Error(`Parent team "${input.parentId}" not found`);
  }

  const now = new Date().toISOString();
  const team: Team = {
    id: randomUUID(),
    name: input.name,
    slug: input.slug,
    parentId: input.parentId,
    ownerId: input.ownerId,
    description: input.description,
    memberIds: [input.ownerId],
    createdAt: now,
    updatedAt: now,
  };

  teams.set(team.id, team);
  logActivity(input.ownerId, "team.created", team.id);
  return team;
}

export function getTeam(id: string): Team | undefined {
  return teams.get(id);
}

export function getTeamBySlug(slug: string): Team | undefined {
  return [...teams.values()].find((t) => t.slug === slug);
}

export function updateTeam(
  id: string,
  update: Partial<Pick<Team, "name" | "description" | "settings">>
): Team | undefined {
  const team = teams.get(id);
  if (!team) return undefined;

  if (update.name) team.name = update.name;
  if (update.description !== undefined) team.description = update.description;
  if (update.settings) team.settings = { ...team.settings, ...update.settings };
  team.updatedAt = new Date().toISOString();

  return team;
}

export function addTeamMember(teamId: string, userId: string): boolean {
  const team = teams.get(teamId);
  if (!team) return false;

  if (
    team.settings?.maxMembers &&
    team.settings.maxMembers > 0 &&
    team.memberIds.length >= team.settings.maxMembers
  ) {
    throw new Error(
      `Team "${team.name}" has reached its member limit (${team.settings.maxMembers})`
    );
  }

  if (!team.memberIds.includes(userId)) {
    team.memberIds.push(userId);
    team.updatedAt = new Date().toISOString();
    logActivity(userId, "team.member_added", teamId);
  }

  return true;
}

export function removeTeamMember(teamId: string, userId: string): boolean {
  const team = teams.get(teamId);
  if (!team) return false;

  team.memberIds = team.memberIds.filter((id) => id !== userId);
  team.updatedAt = new Date().toISOString();
  logActivity(userId, "team.member_removed", teamId);
  return true;
}

export function deleteTeam(id: string): boolean {
  // Check for child teams
  const children = [...teams.values()].filter((t) => t.parentId === id);
  if (children.length > 0) {
    throw new Error("Cannot delete team with child teams. Remove children first.");
  }

  return teams.delete(id);
}

// ---- Team Hierarchy ----

export function getTeamHierarchy(rootId?: string): TeamHierarchy[] {
  const rootTeams = rootId
    ? ([teams.get(rootId)].filter(Boolean) as Team[])
    : [...teams.values()].filter((t) => !t.parentId);

  return rootTeams.map((team) => buildHierarchy(team, 0));
}

function buildHierarchy(team: Team, depth: number): TeamHierarchy {
  const children = [...teams.values()]
    .filter((t) => t.parentId === team.id)
    .map((t) => buildHierarchy(t, depth + 1));

  const totalMembers = team.memberIds.length + children.reduce((sum, c) => sum + c.totalMembers, 0);

  return { team, children, depth, totalMembers };
}

export function listTeams(): Team[] {
  return [...teams.values()];
}

// ---- Usage Quotas ----

export function getQuota(teamId: string): UsageQuota {
  const period = currentPeriod();
  const key = `${teamId}:${period}`;
  return (
    quotas.get(key) ?? {
      teamId,
      period,
      sessionsUsed: 0,
      sessionsLimit: -1,
      apiCallsUsed: 0,
      apiCallsLimit: -1,
      storageUsedBytes: 0,
      storageLimitBytes: -1,
      llmTokensUsed: 0,
      llmTokensLimit: -1,
      lastUpdated: new Date().toISOString(),
    }
  );
}

export function setQuotaLimits(
  teamId: string,
  limits: Partial<
    Pick<UsageQuota, "sessionsLimit" | "apiCallsLimit" | "storageLimitBytes" | "llmTokensLimit">
  >
): UsageQuota {
  const quota = getQuota(teamId);
  Object.assign(quota, limits, { lastUpdated: new Date().toISOString() });
  quotas.set(`${teamId}:${quota.period}`, quota);
  return quota;
}

export function incrementQuota(
  teamId: string,
  field: "sessionsUsed" | "apiCallsUsed" | "llmTokensUsed",
  amount: number = 1
): { allowed: boolean; quota: UsageQuota; reason?: string } {
  const quota = getQuota(teamId);
  const limitField = field.replace("Used", "Limit") as keyof UsageQuota;
  const limit = quota[limitField] as number;

  if (limit > 0 && quota[field] + amount > limit) {
    return {
      allowed: false,
      quota,
      reason: `${field} quota exceeded (${quota[field] + amount}/${limit})`,
    };
  }

  quota[field] += amount;
  quota.lastUpdated = new Date().toISOString();
  quotas.set(`${teamId}:${quota.period}`, quota);
  return { allowed: true, quota };
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---- Admin Dashboard ----

export function getAdminDashboard(organizationId: string): AdminDashboardData {
  const allTeams = [...teams.values()];
  const allUserIds = new Set(allTeams.flatMap((t) => t.memberIds));

  const teamBreakdown = allTeams.map((team) => {
    const quota = getQuota(team.id);
    const usagePercent =
      quota.sessionsLimit > 0 ? Math.round((quota.sessionsUsed / quota.sessionsLimit) * 100) : 0;

    return {
      teamId: team.id,
      teamName: team.name,
      members: team.memberIds.length,
      sessions: quota.sessionsUsed,
      topAngles: [] as string[],
      usagePercent,
    };
  });

  const costAllocation = allTeams.map((team) => {
    const quota = getQuota(team.id);
    const estimatedCost = (quota.llmTokensUsed / 1_000_000) * 3; // rough estimate
    return {
      teamId: team.id,
      teamName: team.name,
      llmTokens: quota.llmTokensUsed,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      percentage: 0,
    };
  });

  const totalCost = costAllocation.reduce((s, c) => s + c.estimatedCost, 0);
  for (const c of costAllocation) {
    c.percentage = totalCost > 0 ? Math.round((c.estimatedCost / totalCost) * 100) : 0;
  }

  return {
    organizationId,
    overview: {
      totalTeams: allTeams.length,
      totalUsers: allUserIds.size,
      activeUsers30d: allUserIds.size,
      totalSessions: teamBreakdown.reduce((s, t) => s + t.sessions, 0),
      storageUsedGB: 0,
    },
    teamBreakdown,
    costAllocation,
    complianceStatus: {
      ssoEnabled: false,
      mfaEnabled: false,
      auditLogEnabled: true,
      dataResidencyCompliant: true,
      activeViolations: 0,
    },
    recentActivity: activities.slice(-50),
  };
}

// ---- Activity Logging ----

function logActivity(userId: string, action: string, teamId?: string): void {
  activities.push({
    timestamp: new Date().toISOString(),
    userId,
    action,
    teamId,
  });
  if (activities.length > 1000) activities.splice(0, activities.length - 1000);
}

export function clearTeamData(): void {
  teams.clear();
  quotas.clear();
  activities.length = 0;
}
