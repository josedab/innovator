import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

export const TenantRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const TenantMemberSchema = z.object({
  userId: z.string(),
  email: z.string().max(500),
  role: TenantRoleSchema,
  joinedAt: z.string(),
});
export type TenantMember = z.infer<typeof TenantMemberSchema>;

export const TenantWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  slug: z.string().max(100),
  ownerId: z.string(),
  members: z.array(TenantMemberSchema).max(500),
  settings: z
    .object({
      allowedModels: z.array(z.string()).optional(),
      maxSessionsPerDay: z.number().optional(),
      dataRetentionDays: z.number().optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantWorkspace = z.infer<typeof TenantWorkspaceSchema>;

export const BillingTierSchema = z.enum(["free", "starter", "professional", "enterprise"]);
export type BillingTier = z.infer<typeof BillingTierSchema>;

export const UsageMeterSchema = z.object({
  workspaceId: z.string(),
  period: z.string(), // YYYY-MM
  sessionsUsed: z.number(),
  tokensUsed: z.number(),
  membersCount: z.number(),
  tier: BillingTierSchema,
});
export type UsageMeter = z.infer<typeof UsageMeterSchema>;

// In-memory stores
const tenantWorkspaces = new Map<string, TenantWorkspace>();
const usageMeters = new Map<string, UsageMeter>();

const TIER_LIMITS: Record<
  BillingTier,
  { maxSessions: number; maxMembers: number; maxTokens: number }
> = {
  free: { maxSessions: 25, maxMembers: 1, maxTokens: 100_000 },
  starter: { maxSessions: 250, maxMembers: 5, maxTokens: 1_000_000 },
  professional: { maxSessions: 2_500, maxMembers: 25, maxTokens: 10_000_000 },
  enterprise: {
    maxSessions: Number.MAX_SAFE_INTEGER,
    maxMembers: Number.MAX_SAFE_INTEGER,
    maxTokens: Number.MAX_SAFE_INTEGER,
  },
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageKey(workspaceId: string, period: string = currentPeriod()): string {
  return `${workspaceId}:${period}`;
}

function initializeUsage(workspaceId: string, tier: BillingTier = "free"): UsageMeter {
  const workspace = tenantWorkspaces.get(workspaceId);
  const meter = UsageMeterSchema.parse({
    workspaceId,
    period: currentPeriod(),
    sessionsUsed: 0,
    tokensUsed: 0,
    membersCount: workspace?.members.length ?? 0,
    tier,
  });
  usageMeters.set(usageKey(workspaceId, meter.period), meter);
  return meter;
}

function getOrCreateUsageMeter(workspaceId: string): UsageMeter {
  return usageMeters.get(usageKey(workspaceId)) ?? initializeUsage(workspaceId);
}

function syncMemberCount(workspaceId: string): void {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) return;

  const period = currentPeriod();
  const current = usageMeters.get(usageKey(workspaceId, period)) ?? initializeUsage(workspaceId);
  const updated = UsageMeterSchema.parse({
    ...current,
    membersCount: workspace.members.length,
  });
  usageMeters.set(usageKey(workspaceId, period), updated);
}

// CRUD + billing
export function createTenantWorkspace(params: {
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  settings?: TenantWorkspace["settings"];
  billingTier?: BillingTier;
}): TenantWorkspace {
  if (Array.from(tenantWorkspaces.values()).some((workspace) => workspace.slug === params.slug)) {
    throw new ValidationError(`Tenant workspace slug "${params.slug}" already exists`);
  }

  const now = new Date().toISOString();
  const workspace = TenantWorkspaceSchema.parse({
    id: randomUUID(),
    name: params.name,
    slug: params.slug,
    ownerId: params.ownerId,
    members: [
      {
        userId: params.ownerId,
        email: params.ownerEmail,
        role: "owner",
        joinedAt: now,
      },
    ],
    settings: params.settings,
    createdAt: now,
    updatedAt: now,
  });

  tenantWorkspaces.set(workspace.id, workspace);
  initializeUsage(workspace.id, params.billingTier ?? "free");
  return workspace;
}

export function getTenantWorkspace(id: string): TenantWorkspace | undefined {
  return tenantWorkspaces.get(id);
}

export function listTenantWorkspaces(ownerId?: string): TenantWorkspace[] {
  const workspaces = Array.from(tenantWorkspaces.values());
  const filtered = ownerId
    ? workspaces.filter((workspace) => workspace.ownerId === ownerId)
    : workspaces;
  return filtered.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function addTenantMember(
  workspaceId: string,
  member: {
    userId: string;
    email: string;
    role?: TenantRole;
  }
): TenantWorkspace | undefined {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) return undefined;
  if (workspace.members.some((existing) => existing.userId === member.userId)) return workspace;

  const tier = getOrCreateUsageMeter(workspaceId).tier;
  if (workspace.members.length >= getTierLimits(tier).maxMembers) {
    throw new ValidationError(`Tenant workspace has reached the ${tier} member limit`);
  }

  const updated = TenantWorkspaceSchema.parse({
    ...workspace,
    members: [
      ...workspace.members,
      {
        userId: member.userId,
        email: member.email,
        role: member.role ?? "member",
        joinedAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  });

  tenantWorkspaces.set(workspaceId, updated);
  syncMemberCount(workspaceId);
  return updated;
}

export function removeTenantMember(
  workspaceId: string,
  userId: string
): TenantWorkspace | undefined {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) return undefined;

  const member = workspace.members.find((existing) => existing.userId === userId);
  if (!member) return workspace;

  const ownerCount = workspace.members.filter((existing) => existing.role === "owner").length;
  if (member.role === "owner" && ownerCount <= 1) {
    throw new ValidationError("Cannot remove the last owner from a tenant workspace");
  }

  const updated = TenantWorkspaceSchema.parse({
    ...workspace,
    members: workspace.members.filter((existing) => existing.userId !== userId),
    updatedAt: new Date().toISOString(),
  });

  tenantWorkspaces.set(workspaceId, updated);
  syncMemberCount(workspaceId);
  return updated;
}

export function updateTenantMemberRole(
  workspaceId: string,
  userId: string,
  role: TenantRole
): TenantWorkspace | undefined {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) return undefined;

  const currentMember = workspace.members.find((member) => member.userId === userId);
  if (!currentMember) return workspace;

  const ownerCount = workspace.members.filter((member) => member.role === "owner").length;
  if (currentMember.role === "owner" && role !== "owner" && ownerCount <= 1) {
    throw new ValidationError("Cannot demote the last owner of a tenant workspace");
  }

  const updated = TenantWorkspaceSchema.parse({
    ...workspace,
    members: workspace.members.map((member) =>
      member.userId === userId ? { ...member, role } : member
    ),
    updatedAt: new Date().toISOString(),
  });

  tenantWorkspaces.set(workspaceId, updated);
  syncMemberCount(workspaceId);
  return updated;
}

export function getTierLimits(tier: BillingTier): {
  maxSessions: number;
  maxMembers: number;
  maxTokens: number;
} {
  return TIER_LIMITS[tier];
}

export function recordUsage(
  workspaceId: string,
  sessions: number = 1,
  tokens: number = 0
): UsageMeter {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) throw new ValidationError(`Tenant workspace "${workspaceId}" not found`);

  const current = getOrCreateUsageMeter(workspaceId);
  const updated = UsageMeterSchema.parse({
    ...current,
    sessionsUsed: current.sessionsUsed + sessions,
    tokensUsed: current.tokensUsed + tokens,
    membersCount: workspace.members.length,
  });

  usageMeters.set(usageKey(workspaceId, updated.period), updated);
  return updated;
}

export function getUsage(workspaceId: string, period?: string): UsageMeter | undefined {
  return usageMeters.get(usageKey(workspaceId, period ?? currentPeriod()));
}

export function isWithinLimits(workspaceId: string): boolean {
  const workspace = tenantWorkspaces.get(workspaceId);
  if (!workspace) return false;

  const meter = getOrCreateUsageMeter(workspaceId);
  const limits = getTierLimits(meter.tier);
  const sessionCap = workspace.settings?.maxSessionsPerDay ?? limits.maxSessions;

  return (
    meter.sessionsUsed <= sessionCap &&
    meter.tokensUsed <= limits.maxTokens &&
    workspace.members.length <= limits.maxMembers
  );
}

export function deleteTenantWorkspace(id: string): boolean {
  const deleted = tenantWorkspaces.delete(id);
  if (!deleted) return false;

  for (const key of usageMeters.keys()) {
    if (key.startsWith(`${id}:`)) usageMeters.delete(key);
  }

  return true;
}

export function clearTenantData(): void {
  tenantWorkspaces.clear();
  usageMeters.clear();
}
