import { beforeEach, describe, expect, it } from "vitest";
import {
  addTenantMember,
  clearTenantData,
  createTenantWorkspace,
  deleteTenantWorkspace,
  getTenantWorkspace,
  getTierLimits,
  getUsage,
  isWithinLimits,
  listTenantWorkspaces,
  recordUsage,
  removeTenantMember,
  updateTenantMemberRole,
} from "../saas/multi-tenancy.js";

describe("saas/multi-tenancy", () => {
  beforeEach(() => {
    clearTenantData();
  });

  it("creates and lists tenant workspaces by owner", () => {
    const alpha = createTenantWorkspace({
      name: "Alpha",
      slug: "alpha",
      ownerId: "owner-1",
      ownerEmail: "owner-1@example.com",
      billingTier: "starter",
    });
    createTenantWorkspace({
      name: "Beta",
      slug: "beta",
      ownerId: "owner-2",
      ownerEmail: "owner-2@example.com",
    });

    expect(getTenantWorkspace(alpha.id)?.members[0].role).toBe("owner");
    expect(listTenantWorkspaces("owner-1")).toHaveLength(1);
    expect(listTenantWorkspaces()).toHaveLength(2);
  });

  it("adds, updates, and removes tenant members", () => {
    const workspace = createTenantWorkspace({
      name: "Team Workspace",
      slug: "team-workspace",
      ownerId: "owner-1",
      ownerEmail: "owner-1@example.com",
      billingTier: "starter",
    });

    const withMember = addTenantMember(workspace.id, {
      userId: "user-2",
      email: "user-2@example.com",
      role: "viewer",
    });
    expect(withMember?.members).toHaveLength(2);

    const updated = updateTenantMemberRole(workspace.id, "user-2", "admin");
    expect(updated?.members.find((member) => member.userId === "user-2")?.role).toBe("admin");

    const removed = removeTenantMember(workspace.id, "user-2");
    expect(removed?.members).toHaveLength(1);
  });

  it("tracks usage and enforces tier limits", () => {
    const workspace = createTenantWorkspace({
      name: "Free Workspace",
      slug: "free-workspace",
      ownerId: "owner-1",
      ownerEmail: "owner-1@example.com",
    });

    const limits = getTierLimits("free");
    expect(limits).toEqual({ maxSessions: 25, maxMembers: 1, maxTokens: 100000 });

    recordUsage(workspace.id, 10, 50_000);
    expect(getUsage(workspace.id)).toMatchObject({ sessionsUsed: 10, tokensUsed: 50_000, tier: "free" });
    expect(isWithinLimits(workspace.id)).toBe(true);

    recordUsage(workspace.id, 20, 60_000);
    expect(isWithinLimits(workspace.id)).toBe(false);
  });

  it("deletes tenant workspaces and usage data", () => {
    const workspace = createTenantWorkspace({
      name: "Disposable",
      slug: "disposable",
      ownerId: "owner-1",
      ownerEmail: "owner-1@example.com",
      billingTier: "professional",
    });

    recordUsage(workspace.id, 5, 1_000);
    expect(deleteTenantWorkspace(workspace.id)).toBe(true);
    expect(getTenantWorkspace(workspace.id)).toBeUndefined();
    expect(getUsage(workspace.id)).toBeUndefined();
  });
});
