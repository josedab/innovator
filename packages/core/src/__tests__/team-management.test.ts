import { describe, it, expect, beforeEach } from "vitest";

import {
  createTeam,
  getTeam,
  updateTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
  getTeamHierarchy,
  getQuota,
  setQuotaLimits,
  incrementQuota,
  getAdminDashboard,
  clearTeamData,
  listTeams,
  getTeamBySlug,
} from "../rbac/team-management.js";

describe("rbac/team-management", () => {
  beforeEach(() => {
    clearTeamData();
  });

  // ---- Team CRUD lifecycle ----

  describe("team CRUD", () => {
    it("create → update → add members → delete lifecycle", () => {
      // Create
      const team = createTeam({
        name: "Engineering",
        slug: "engineering",
        ownerId: "owner-1",
        description: "Engineering team",
      });
      expect(team.id).toBeTruthy();
      expect(team.name).toBe("Engineering");
      expect(team.memberIds).toContain("owner-1");

      // Update
      const updated = updateTeam(team.id, { name: "Platform Engineering" });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Platform Engineering");

      // Add member
      expect(addTeamMember(team.id, "user-2")).toBe(true);
      expect(getTeam(team.id)!.memberIds).toContain("user-2");

      // Remove member
      expect(removeTeamMember(team.id, "user-2")).toBe(true);
      expect(getTeam(team.id)!.memberIds).not.toContain("user-2");

      // Delete
      expect(deleteTeam(team.id)).toBe(true);
      expect(getTeam(team.id)).toBeUndefined();
    });

    it("rejects duplicate slug", () => {
      createTeam({ name: "A", slug: "team-a", ownerId: "o1" });
      expect(() => createTeam({ name: "B", slug: "team-a", ownerId: "o2" })).toThrow(
        "already exists"
      );
    });

    it("rejects non-existent parent", () => {
      expect(() =>
        createTeam({ name: "Child", slug: "child", ownerId: "o1", parentId: "missing" })
      ).toThrow("not found");
    });

    it("getTeamBySlug returns correct team", () => {
      createTeam({ name: "Test", slug: "test-slug", ownerId: "o1" });
      const found = getTeamBySlug("test-slug");
      expect(found).toBeDefined();
      expect(found!.slug).toBe("test-slug");
    });
  });

  // ---- addTeamMember to non-existent team ----

  describe("addTeamMember", () => {
    it("returns false for non-existent team", () => {
      expect(addTeamMember("missing-team", "user-1")).toBe(false);
    });

    it("does not duplicate existing member", () => {
      const team = createTeam({ name: "T", slug: "t", ownerId: "o1" });
      addTeamMember(team.id, "o1"); // already a member
      expect(getTeam(team.id)!.memberIds.filter((id) => id === "o1")).toHaveLength(1);
    });

    it("enforces maxMembers setting", () => {
      const team = createTeam({
        name: "Small",
        slug: "small",
        ownerId: "o1",
      });
      updateTeam(team.id, {
        settings: {
          dataResidency: "any",
          defaultRole: "contributor",
          maxSessions: -1,
          maxMembers: 1,
        },
      });

      expect(() => addTeamMember(team.id, "user-2")).toThrow("member limit");
    });
  });

  // ---- getTeamHierarchy ----

  describe("getTeamHierarchy", () => {
    it("returns nested tree structure", () => {
      const parent = createTeam({ name: "Org", slug: "org", ownerId: "o1" });
      const child = createTeam({
        name: "Team A",
        slug: "team-a",
        ownerId: "o1",
        parentId: parent.id,
      });
      createTeam({
        name: "Sub Team",
        slug: "sub-team",
        ownerId: "o1",
        parentId: child.id,
      });

      const hierarchy = getTeamHierarchy();
      expect(hierarchy).toHaveLength(1); // only root
      expect(hierarchy[0].team.id).toBe(parent.id);
      expect(hierarchy[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].children).toHaveLength(1);
      expect(hierarchy[0].depth).toBe(0);
      expect(hierarchy[0].children[0].depth).toBe(1);
    });

    it("counts totalMembers recursively", () => {
      const parent = createTeam({ name: "Parent", slug: "parent", ownerId: "o1" });
      const child = createTeam({
        name: "Child",
        slug: "child",
        ownerId: "o2",
        parentId: parent.id,
      });
      addTeamMember(child.id, "u3");

      const hierarchy = getTeamHierarchy();
      // parent has 1 member, child has 2 → parent total = 1 + 2 = 3
      expect(hierarchy[0].totalMembers).toBe(3);
    });

    it("returns specific subtree when rootId given", () => {
      const parent = createTeam({ name: "P", slug: "p", ownerId: "o1" });
      const child = createTeam({ name: "C", slug: "c", ownerId: "o1", parentId: parent.id });

      const sub = getTeamHierarchy(child.id);
      expect(sub).toHaveLength(1);
      expect(sub[0].team.id).toBe(child.id);
    });
  });

  // ---- Quotas ----

  describe("getQuota / incrementQuota", () => {
    it("returns default quota for new team", () => {
      const quota = getQuota("new-team");
      expect(quota.sessionsUsed).toBe(0);
      expect(quota.sessionsLimit).toBe(-1); // unlimited
    });

    it("incrementQuota allows when under limit", () => {
      setQuotaLimits("team-q", { sessionsLimit: 10 });
      const result = incrementQuota("team-q", "sessionsUsed", 1);
      expect(result.allowed).toBe(true);
      expect(result.quota.sessionsUsed).toBe(1);
    });

    it("incrementQuota denies when exceeding limit", () => {
      setQuotaLimits("team-q", { sessionsLimit: 2 });
      incrementQuota("team-q", "sessionsUsed", 2);
      const result = incrementQuota("team-q", "sessionsUsed", 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("quota exceeded");
    });

    it("allows unlimited when limit is -1", () => {
      const result = incrementQuota("team-unlim", "sessionsUsed", 1000);
      expect(result.allowed).toBe(true);
    });
  });

  // ---- setQuotaLimits ----

  describe("setQuotaLimits", () => {
    it("persists quota limits", () => {
      setQuotaLimits("team-sl", { sessionsLimit: 50, apiCallsLimit: 1000 });
      const quota = getQuota("team-sl");
      expect(quota.sessionsLimit).toBe(50);
      expect(quota.apiCallsLimit).toBe(1000);
    });
  });

  // ---- deleteTeam ----

  describe("deleteTeam", () => {
    it("rejects deletion of team with children", () => {
      const parent = createTeam({ name: "P", slug: "p2", ownerId: "o1" });
      createTeam({ name: "C", slug: "c2", ownerId: "o1", parentId: parent.id });

      expect(() => deleteTeam(parent.id)).toThrow("child teams");
    });

    it("returns false for non-existent team", () => {
      expect(deleteTeam("missing")).toBe(false);
    });
  });

  // ---- getAdminDashboard ----

  describe("getAdminDashboard", () => {
    it("aggregates data correctly", () => {
      const t1 = createTeam({ name: "Team 1", slug: "t1", ownerId: "o1" });
      const t2 = createTeam({ name: "Team 2", slug: "t2", ownerId: "o2" });
      addTeamMember(t1.id, "u3");

      const dashboard = getAdminDashboard("org-1");
      expect(dashboard.organizationId).toBe("org-1");
      expect(dashboard.overview.totalTeams).toBe(2);
      expect(dashboard.overview.totalUsers).toBe(3); // o1, o2, u3
      expect(dashboard.teamBreakdown).toHaveLength(2);
      expect(dashboard.costAllocation).toHaveLength(2);
      expect(dashboard.complianceStatus).toBeDefined();
    });

    it("returns empty dashboard when no teams exist", () => {
      const dashboard = getAdminDashboard("empty-org");
      expect(dashboard.overview.totalTeams).toBe(0);
      expect(dashboard.overview.totalUsers).toBe(0);
      expect(dashboard.teamBreakdown).toHaveLength(0);
    });
  });
});
