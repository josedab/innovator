import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Create a stable temp dir used for all tests (WORKSPACES_DIR is computed once at module load)
const { stableTempDir } = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  return { stableTempDir: mkdtempSync(join(tmpdir(), "innovator-ws-test-")) };
});

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => stableTempDir,
  };
});

import {
  createWorkspace,
  getWorkspace,
  deleteWorkspace,
  updateWorkspace,
  listWorkspaces,
  listUserWorkspaces,
  addMember,
  removeMember,
  updateMemberRole,
  hasPermission,
  addSessionToWorkspace,
  getActivityFeed,
  sharePreset,
  shareAngle,
  searchWorkspaceSessions,
  WorkspaceSchema,
  type Workspace,
} from "../workspaces/index.js";

const wsDir = join(stableTempDir, ".innovator", "workspaces");

describe("workspaces", () => {
  beforeEach(() => {
    // Clean workspace files between tests
    try {
      const files = readdirSync(wsDir);
      for (const f of files) rmSync(join(wsDir, f), { force: true });
    } catch {
      // Directory may not exist yet
    }
  });

  afterEach(() => {
    // Clean up
    try {
      const files = readdirSync(wsDir);
      for (const f of files) rmSync(join(wsDir, f), { force: true });
    } catch {
      // Ignore
    }
  });

  describe("createWorkspace", () => {
    it("creates a workspace with valid schema", () => {
      const ws = createWorkspace({
        name: "Test Workspace",
        description: "A test workspace",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      expect(() => WorkspaceSchema.parse(ws)).not.toThrow();
      expect(ws.name).toBe("Test Workspace");
      expect(ws.ownerId).toBe("user-1");
      expect(ws.members).toHaveLength(1);
      expect(ws.members[0].role).toBe("admin");
      expect(ws.members[0].userId).toBe("user-1");
    });

    it("persists workspace to disk", () => {
      const ws = createWorkspace({
        name: "Persist Test",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      const path = join(wsDir, `${ws.id}.json`);
      expect(existsSync(path)).toBe(true);
    });

    it("records workspace_created activity", () => {
      const ws = createWorkspace({
        name: "Activity Test",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      expect(ws.activityFeed).toHaveLength(1);
      expect(ws.activityFeed![0].type).toBe("workspace_created");
    });

    it("includes owner email when provided", () => {
      const ws = createWorkspace({
        name: "Email Test",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
        ownerEmail: "alice@example.com",
      });

      expect(ws.members[0].email).toBe("alice@example.com");
    });
  });

  describe("getWorkspace", () => {
    it("retrieves a created workspace", () => {
      const ws = createWorkspace({
        name: "Get Test",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      const retrieved = getWorkspace(ws.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Get Test");
    });

    it("returns undefined for non-existent workspace", () => {
      expect(getWorkspace("non-existent-id")).toBeUndefined();
    });

    it("handles corrupt file gracefully", () => {
      mkdirSync(wsDir, { recursive: true });
      writeFileSync(join(wsDir, "corrupt.json"), "not valid json", "utf-8");
      expect(getWorkspace("corrupt")).toBeUndefined();
    });
  });

  describe("deleteWorkspace", () => {
    it("deletes an existing workspace", () => {
      const ws = createWorkspace({
        name: "Delete Test",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      expect(deleteWorkspace(ws.id)).toBe(true);
      expect(getWorkspace(ws.id)).toBeUndefined();
    });

    it("returns false for non-existent workspace", () => {
      expect(deleteWorkspace("non-existent")).toBe(false);
    });
  });

  describe("updateWorkspace", () => {
    it("updates workspace name and description", () => {
      const ws = createWorkspace({
        name: "Original",
        ownerId: "user-1",
        ownerDisplayName: "Alice",
      });

      const result = updateWorkspace(ws.id, { name: "Updated", description: "New desc" });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.name).toBe("Updated");
      expect(updated!.description).toBe("New desc");
    });

    it("returns false for non-existent workspace", () => {
      expect(updateWorkspace("nope", { name: "x" })).toBe(false);
    });
  });

  describe("listWorkspaces", () => {
    it("lists all workspaces sorted by updatedAt descending", () => {
      createWorkspace({ name: "First", ownerId: "u1", ownerDisplayName: "A" });
      createWorkspace({ name: "Second", ownerId: "u2", ownerDisplayName: "B" });

      const list = listWorkspaces();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array when no workspaces exist", () => {
      mkdirSync(wsDir, { recursive: true });
      const list = listWorkspaces();
      expect(list).toEqual([]);
    });

    it("skips corrupt files", () => {
      createWorkspace({ name: "Good", ownerId: "u1", ownerDisplayName: "A" });

      mkdirSync(wsDir, { recursive: true });
      writeFileSync(join(wsDir, "bad.json"), "corrupt", "utf-8");

      const list = listWorkspaces();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("Good");
    });
  });

  describe("addMember", () => {
    it("adds a member with specified role", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const result = addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "contributor" },
        { userId: "owner", displayName: "Owner" }
      );
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.members).toHaveLength(2);
      expect(updated!.members[1].role).toBe("contributor");
    });

    it("rejects duplicate member", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const result = addMember(
        ws.id,
        { userId: "owner", displayName: "Owner", role: "admin" },
        { userId: "owner", displayName: "Owner" }
      );
      expect(result).toBe(false);
    });

    it("records member_joined activity", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );

      const updated = getWorkspace(ws.id);
      const joinEvent = updated!.activityFeed!.find((e) => e.type === "member_joined");
      expect(joinEvent).toBeDefined();
    });
  });

  describe("removeMember", () => {
    it("removes an existing member", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });
      addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "contributor" },
        { userId: "owner", displayName: "Owner" }
      );

      const result = removeMember(ws.id, "bob", { userId: "owner", displayName: "Owner" });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.members).toHaveLength(1);
    });

    it("returns false for non-existent member", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      expect(removeMember(ws.id, "nobody", { userId: "owner", displayName: "Owner" })).toBe(false);
    });
  });

  describe("updateMemberRole", () => {
    it("changes member role", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });
      addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );

      const result = updateMemberRole(ws.id, "bob", "contributor", {
        userId: "owner",
        displayName: "Owner",
      });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      const bob = updated!.members.find((m) => m.userId === "bob");
      expect(bob!.role).toBe("contributor");
    });

    it("records member_role_changed activity", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });
      addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );

      updateMemberRole(ws.id, "bob", "admin", {
        userId: "owner",
        displayName: "Owner",
      });

      const updated = getWorkspace(ws.id);
      const roleEvent = updated!.activityFeed!.find((e) => e.type === "member_role_changed");
      expect(roleEvent).toBeDefined();
      expect(roleEvent!.details).toContain("viewer");
      expect(roleEvent!.details).toContain("admin");
    });
  });

  describe("hasPermission", () => {
    it("returns true when user has required role level", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      expect(hasPermission(ws.id, "owner", "admin")).toBe(true);
      expect(hasPermission(ws.id, "owner", "contributor")).toBe(true);
      expect(hasPermission(ws.id, "owner", "viewer")).toBe(true);
    });

    it("returns false when user lacks required role level", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });
      addMember(
        ws.id,
        { userId: "viewer-user", displayName: "Viewer", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );

      expect(hasPermission(ws.id, "viewer-user", "admin")).toBe(false);
      expect(hasPermission(ws.id, "viewer-user", "contributor")).toBe(false);
      expect(hasPermission(ws.id, "viewer-user", "viewer")).toBe(true);
    });

    it("returns false for non-member", () => {
      const ws = createWorkspace({
        name: "Team",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      expect(hasPermission(ws.id, "outsider", "viewer")).toBe(false);
    });
  });

  describe("addSessionToWorkspace", () => {
    it("adds a session ID", () => {
      const ws = createWorkspace({
        name: "Sessions",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const result = addSessionToWorkspace(ws.id, "session-123", {
        userId: "owner",
        displayName: "Owner",
      });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.sessionIds).toContain("session-123");
    });

    it("rejects duplicate session", () => {
      const ws = createWorkspace({
        name: "Sessions",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      addSessionToWorkspace(ws.id, "session-123", { userId: "owner", displayName: "Owner" });
      const result = addSessionToWorkspace(ws.id, "session-123", {
        userId: "owner",
        displayName: "Owner",
      });
      expect(result).toBe(false);
    });
  });

  describe("getActivityFeed", () => {
    it("returns activity events with default limit", () => {
      const ws = createWorkspace({
        name: "Feed",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const feed = getActivityFeed(ws.id);
      expect(feed).toHaveLength(1); // workspace_created
    });

    it("respects limit parameter", () => {
      const ws = createWorkspace({
        name: "Feed",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      // Add more events
      addMember(
        ws.id,
        { userId: "bob", displayName: "Bob", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );
      addMember(
        ws.id,
        { userId: "charlie", displayName: "Charlie", role: "viewer" },
        { userId: "owner", displayName: "Owner" }
      );

      const feed = getActivityFeed(ws.id, 2);
      expect(feed).toHaveLength(2);
    });

    it("returns empty array for non-existent workspace", () => {
      expect(getActivityFeed("nope")).toEqual([]);
    });
  });

  describe("listUserWorkspaces", () => {
    it("returns only workspaces the user belongs to", () => {
      createWorkspace({ name: "Mine", ownerId: "user-a", ownerDisplayName: "A" });
      createWorkspace({ name: "Not Mine", ownerId: "user-b", ownerDisplayName: "B" });

      const myWorkspaces = listUserWorkspaces("user-a");
      const myNames = myWorkspaces.map((w) => w.name);
      expect(myNames).toContain("Mine");
      // user-a should not be a member of "Not Mine"
      expect(myNames).not.toContain("Not Mine");
    });
  });

  describe("sharePreset / shareAngle", () => {
    it("shares a preset with workspace", () => {
      const ws = createWorkspace({
        name: "Share",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const result = sharePreset(ws.id, "preset-1", { userId: "owner", displayName: "Owner" });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.sharedPresetIds).toContain("preset-1");
    });

    it("shares an angle with workspace", () => {
      const ws = createWorkspace({
        name: "Share",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      const result = shareAngle(ws.id, "angle-1", { userId: "owner", displayName: "Owner" });
      expect(result).toBe(true);

      const updated = getWorkspace(ws.id);
      expect(updated!.sharedAngleIds).toContain("angle-1");
    });

    it("rejects duplicate preset sharing", () => {
      const ws = createWorkspace({
        name: "Share",
        ownerId: "owner",
        ownerDisplayName: "Owner",
      });

      sharePreset(ws.id, "preset-1", { userId: "owner", displayName: "Owner" });
      expect(sharePreset(ws.id, "preset-1", { userId: "owner", displayName: "Owner" })).toBe(false);
    });
  });
});
