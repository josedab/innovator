/**
 * Tests for SaaS workspaces and shareable results.
 */
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { describe, it, expect, beforeEach, vi } from "vitest";

// Import directly from saas module to avoid conflicts with collaboration workspace
import {
  createWorkspace,
  getWorkspace,
  listTenantWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
  createSharedResult,
  getSharedResult,
  listSharedResults,
  clearSaasData,
} from "../saas/index.js";

beforeEach(() => {
  clearSaasData();
});

describe("workspaces", () => {
  it("creates a workspace", () => {
    const ws = createWorkspace({
      tenantId: "tenant-1",
      name: "Engineering",
      slug: "engineering",
      ownerId: "user-1",
      description: "Engineering team workspace",
    });

    expect(ws.id).toBeDefined();
    expect(ws.name).toBe("Engineering");
    expect(ws.slug).toBe("engineering");
    expect(ws.tenantId).toBe("tenant-1");
    expect(ws.members).toHaveLength(1);
    expect(ws.members[0].role).toBe("owner");
    expect(ws.members[0].userId).toBe("user-1");
  });

  it("prevents duplicate slugs within a tenant", () => {
    createWorkspace({
      tenantId: "tenant-1",
      name: "Engineering",
      slug: "engineering",
      ownerId: "user-1",
    });

    expect(() =>
      createWorkspace({
        tenantId: "tenant-1",
        name: "Engineering 2",
        slug: "engineering",
        ownerId: "user-2",
      })
    ).toThrow('already exists');
  });

  it("retrieves a workspace by ID", () => {
    const ws = createWorkspace({
      tenantId: "tenant-1",
      name: "Team",
      slug: "team",
      ownerId: "user-1",
    });

    const retrieved = getWorkspace(ws.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Team");
  });

  it("lists workspaces for a tenant", () => {
    createWorkspace({ tenantId: "t1", name: "A", slug: "a", ownerId: "u1" });
    createWorkspace({ tenantId: "t1", name: "B", slug: "b", ownerId: "u2" });
    createWorkspace({ tenantId: "t2", name: "C", slug: "c", ownerId: "u3" });

    expect(listTenantWorkspaces("t1")).toHaveLength(2);
    expect(listTenantWorkspaces("t2")).toHaveLength(1);
    expect(listTenantWorkspaces("t3")).toHaveLength(0);
  });

  it("adds a member to a workspace", () => {
    const ws = createWorkspace({ tenantId: "t1", name: "A", slug: "a", ownerId: "u1" });
    const updated = addWorkspaceMember(ws.id, "u2", "member");

    expect(updated).toBeDefined();
    expect(updated!.members).toHaveLength(2);
    expect(updated!.members[1].userId).toBe("u2");
    expect(updated!.members[1].role).toBe("member");
  });

  it("does not add duplicate members", () => {
    const ws = createWorkspace({ tenantId: "t1", name: "A", slug: "a", ownerId: "u1" });
    addWorkspaceMember(ws.id, "u2", "member");
    const updated = addWorkspaceMember(ws.id, "u2", "admin");
    expect(updated!.members).toHaveLength(2);
  });

  it("removes a member from a workspace", () => {
    const ws = createWorkspace({ tenantId: "t1", name: "A", slug: "a", ownerId: "u1" });
    addWorkspaceMember(ws.id, "u2", "member");
    expect(removeWorkspaceMember(ws.id, "u2")).toBe(true);
    expect(getWorkspace(ws.id)!.members).toHaveLength(1);
  });

  it("prevents removing the last owner", () => {
    const ws = createWorkspace({ tenantId: "t1", name: "A", slug: "a", ownerId: "u1" });
    expect(() => removeWorkspaceMember(ws.id, "u1")).toThrow("last owner");
  });

  it("returns undefined for nonexistent workspace", () => {
    expect(getWorkspace("nonexistent")).toBeUndefined();
    expect(addWorkspaceMember("nonexistent", "u1")).toBeUndefined();
    expect(removeWorkspaceMember("nonexistent", "u1")).toBe(false);
  });
});

describe("shareable results", () => {
  it("creates a shared result with hash", () => {
    const result = createSharedResult({
      createdBy: "user-1",
      title: "My Innovation",
      resultType: "investigation",
      resultData: { summary: "Test result" },
    });

    expect(result.hash).toBeDefined();
    expect(result.hash).toHaveLength(12);
    expect(result.title).toBe("My Innovation");
    expect(result.visibility).toBe("public");
    expect(result.viewCount).toBe(0);
  });

  it("retrieves a shared result by hash", () => {
    const created = createSharedResult({
      createdBy: "user-1",
      title: "Test",
      resultType: "session",
      resultData: "raw data",
    });

    const retrieved = getSharedResult(created.hash);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe("Test");
    expect(retrieved!.viewCount).toBe(1);
  });

  it("increments view count on each access", () => {
    const created = createSharedResult({
      createdBy: "user-1",
      title: "Test",
      resultType: "pipeline",
      resultData: {},
    });

    getSharedResult(created.hash);
    getSharedResult(created.hash);
    const third = getSharedResult(created.hash);
    expect(third!.viewCount).toBe(3);
  });

  it("returns undefined for expired results", () => {
    const created = createSharedResult({
      createdBy: "user-1",
      title: "Expired",
      resultType: "investigation",
      resultData: {},
      expiresInDays: -1, // expired
    });

    expect(getSharedResult(created.hash)).toBeUndefined();
  });

  it("returns undefined for nonexistent hash", () => {
    expect(getSharedResult("doesnotexist")).toBeUndefined();
  });

  it("lists results by creator", () => {
    createSharedResult({ createdBy: "u1", title: "A", resultType: "investigation", resultData: {} });
    createSharedResult({ createdBy: "u1", title: "B", resultType: "session", resultData: {} });
    createSharedResult({ createdBy: "u2", title: "C", resultType: "pipeline", resultData: {} });

    const u1Results = listSharedResults("u1");
    expect(u1Results).toHaveLength(2);
    expect(listSharedResults("u2")).toHaveLength(1);
    expect(listSharedResults("u3")).toHaveLength(0);
  });

  it("creates with team visibility and tenant", () => {
    const result = createSharedResult({
      createdBy: "user-1",
      title: "Team result",
      resultType: "portfolio",
      resultData: {},
      tenantId: "t1",
      workspaceId: "ws1",
      visibility: "team",
    });

    expect(result.visibility).toBe("team");
    expect(result.tenantId).toBe("t1");
    expect(result.workspaceId).toBe("ws1");
  });
});
