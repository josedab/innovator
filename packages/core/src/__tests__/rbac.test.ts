import { describe, it, expect, beforeEach } from "vitest";
import {
  roleHasPermission,
  getRolePermissions,
  isRoleAtLeast,
  checkPermission,
  requirePermission,
  logAction,
  getAuditLog,
  clearAuditLog,
  PERMISSIONS,
  type AuthContext,
  type ExtendedRole,
  type Permission,
} from "../rbac/index.js";

describe("rbac", () => {
  beforeEach(() => {
    clearAuditLog();
  });

  // ---- roleHasPermission ----

  describe("roleHasPermission", () => {
    it("viewer can read but not create investigations", () => {
      expect(roleHasPermission("viewer", "investigation:read")).toBe(true);
      expect(roleHasPermission("viewer", "investigation:create")).toBe(false);
    });

    it("viewer has read-only permissions", () => {
      const readPerms: Permission[] = [
        "investigation:read",
        "angle:read",
        "idea:read",
        "session:read",
        "workspace:read",
        "artifact:read",
        "analytics:read",
      ];
      for (const perm of readPerms) {
        expect(roleHasPermission("viewer", perm)).toBe(true);
      }
      expect(roleHasPermission("viewer", "idea:create")).toBe(false);
      expect(roleHasPermission("viewer", "admin:api_keys")).toBe(false);
    });

    it("contributor can create and read but not delete", () => {
      expect(roleHasPermission("contributor", "investigation:create")).toBe(true);
      expect(roleHasPermission("contributor", "idea:create")).toBe(true);
      expect(roleHasPermission("contributor", "idea:vote")).toBe(true);
      expect(roleHasPermission("contributor", "investigation:delete")).toBe(false);
      expect(roleHasPermission("contributor", "workspace:delete")).toBe(false);
    });

    it("facilitator has contributor perms plus delete and invite", () => {
      expect(roleHasPermission("facilitator", "investigation:create")).toBe(true);
      expect(roleHasPermission("facilitator", "investigation:delete")).toBe(true);
      expect(roleHasPermission("facilitator", "angle:delete")).toBe(true);
      expect(roleHasPermission("facilitator", "workspace:invite")).toBe(true);
      expect(roleHasPermission("facilitator", "admin:api_keys")).toBe(false);
    });

    it("admin and owner have all permissions", () => {
      const allPerms = Object.keys(PERMISSIONS) as Permission[];
      for (const perm of allPerms) {
        expect(roleHasPermission("admin", perm)).toBe(true);
        expect(roleHasPermission("owner", perm)).toBe(true);
      }
    });

    it("returns false for unknown role", () => {
      expect(roleHasPermission("" as ExtendedRole, "idea:read")).toBe(false);
      expect(roleHasPermission("unknown" as ExtendedRole, "idea:read")).toBe(false);
    });
  });

  // ---- getRolePermissions ----

  describe("getRolePermissions", () => {
    it("returns 7 read permissions for viewer", () => {
      const perms = getRolePermissions("viewer");
      expect(perms).toHaveLength(7);
      expect(perms.every((p) => p.includes(":read") || p === "analytics:read")).toBe(true);
    });

    it("returns all permissions for admin", () => {
      const perms = getRolePermissions("admin");
      expect(perms.length).toBe(Object.keys(PERMISSIONS).length);
    });

    it("returns empty array for unknown role", () => {
      expect(getRolePermissions("bogus" as ExtendedRole)).toEqual([]);
    });
  });

  // ---- isRoleAtLeast ----

  describe("isRoleAtLeast", () => {
    it("viewer is at least viewer", () => {
      expect(isRoleAtLeast("viewer", "viewer")).toBe(true);
    });

    it("owner is at least any role", () => {
      const roles: ExtendedRole[] = ["viewer", "contributor", "facilitator", "admin", "owner"];
      for (const role of roles) {
        expect(isRoleAtLeast("owner", role)).toBe(true);
      }
    });

    it("viewer is not at least contributor", () => {
      expect(isRoleAtLeast("viewer", "contributor")).toBe(false);
    });

    it("hierarchy is viewer < contributor < facilitator < admin < owner", () => {
      expect(isRoleAtLeast("contributor", "viewer")).toBe(true);
      expect(isRoleAtLeast("facilitator", "contributor")).toBe(true);
      expect(isRoleAtLeast("admin", "facilitator")).toBe(true);
      expect(isRoleAtLeast("owner", "admin")).toBe(true);
    });

    it("returns false for unknown roles (maps to 0)", () => {
      expect(isRoleAtLeast("" as ExtendedRole, "viewer")).toBe(false);
      expect(isRoleAtLeast("viewer", "" as ExtendedRole)).toBe(true);
    });
  });

  // ---- checkPermission ----

  describe("checkPermission", () => {
    const baseAuth: AuthContext = {
      userId: "user-1",
      displayName: "Test User",
      provider: "github",
      workspaceRole: "contributor",
      workspaceId: "ws-1",
    };

    it("allows when role has permission", () => {
      const result = checkPermission(baseAuth, "idea:create");
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.userRole).toBe("contributor");
      expect(result.requiredPermission).toBe("idea:create");
    });

    it("denies when role lacks permission", () => {
      const result = checkPermission(baseAuth, "admin:api_keys");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("lacks permission");
      expect(result.userRole).toBe("contributor");
    });

    it("denies when no workspace context", () => {
      const noWs: AuthContext = {
        userId: "user-2",
        displayName: "No WS",
        provider: "anonymous",
      };
      const result = checkPermission(noWs, "idea:read");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("No workspace context");
      expect(result.userRole).toBeUndefined();
    });
  });

  // ---- requirePermission ----

  describe("requirePermission", () => {
    it("returns 401 when auth is undefined", () => {
      const result = requirePermission(undefined, "idea:read");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.status).toBe(401);
        expect(result.error).toBe("Authentication required");
      }
    });

    it("returns 403 when permission denied", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "Viewer",
        provider: "github",
        workspaceRole: "viewer",
        workspaceId: "ws-1",
      };
      const result = requirePermission(auth, "investigation:create");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.status).toBe(403);
      }
    });

    it("returns allowed true when permission granted", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "Admin",
        provider: "github",
        workspaceRole: "admin",
        workspaceId: "ws-1",
      };
      const result = requirePermission(auth, "admin:api_keys");
      expect(result.allowed).toBe(true);
    });

    it("returns 403 when auth has no workspace role", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "NoRole",
        provider: "api-key",
      };
      const result = requirePermission(auth, "idea:read");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.status).toBe(403);
      }
    });
  });

  // ---- Audit Log ----

  describe("logAction / getAuditLog", () => {
    it("logs an action and returns entry with id and timestamp", () => {
      const entry = logAction({
        userId: "u1",
        displayName: "Alice",
        action: "investigation:create",
        resource: "investigation",
        resourceId: "inv-1",
        workspaceId: "ws-1",
      });
      expect(entry.id).toMatch(/^audit_/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.userId).toBe("u1");
    });

    it("getAuditLog returns entries in reverse chronological order", () => {
      logAction({ userId: "u1", displayName: "A", action: "first", resource: "r" });
      logAction({ userId: "u2", displayName: "B", action: "second", resource: "r" });
      const log = getAuditLog();
      expect(log[0].action).toBe("second");
      expect(log[1].action).toBe("first");
    });

    it("filters by workspaceId", () => {
      logAction({
        userId: "u1",
        displayName: "A",
        action: "a1",
        resource: "r",
        workspaceId: "ws-1",
      });
      logAction({
        userId: "u1",
        displayName: "A",
        action: "a2",
        resource: "r",
        workspaceId: "ws-2",
      });
      const log = getAuditLog({ workspaceId: "ws-1" });
      expect(log).toHaveLength(1);
      expect(log[0].workspaceId).toBe("ws-1");
    });

    it("filters by userId", () => {
      logAction({ userId: "u1", displayName: "A", action: "a1", resource: "r" });
      logAction({ userId: "u2", displayName: "B", action: "a2", resource: "r" });
      const log = getAuditLog({ userId: "u2" });
      expect(log).toHaveLength(1);
      expect(log[0].userId).toBe("u2");
    });

    it("respects limit option", () => {
      for (let i = 0; i < 10; i++) {
        logAction({ userId: "u1", displayName: "A", action: `a${i}`, resource: "r" });
      }
      const log = getAuditLog({ limit: 3 });
      expect(log).toHaveLength(3);
    });

    it("defaults to 50 entries", () => {
      for (let i = 0; i < 60; i++) {
        logAction({ userId: "u1", displayName: "A", action: `a${i}`, resource: "r" });
      }
      const log = getAuditLog();
      expect(log).toHaveLength(50);
    });

    it("caps at 1000 entries in memory", () => {
      for (let i = 0; i < 1010; i++) {
        logAction({ userId: "u1", displayName: "A", action: `a${i}`, resource: "r" });
      }
      const log = getAuditLog({ limit: 2000 });
      expect(log.length).toBeLessThanOrEqual(1000);
    });

    it("clearAuditLog empties the log", () => {
      logAction({ userId: "u1", displayName: "A", action: "a1", resource: "r" });
      clearAuditLog();
      expect(getAuditLog()).toHaveLength(0);
    });

    it("combines workspaceId and userId filters", () => {
      logAction({
        userId: "u1",
        displayName: "A",
        action: "a1",
        resource: "r",
        workspaceId: "ws-1",
      });
      logAction({
        userId: "u2",
        displayName: "B",
        action: "a2",
        resource: "r",
        workspaceId: "ws-1",
      });
      logAction({
        userId: "u1",
        displayName: "A",
        action: "a3",
        resource: "r",
        workspaceId: "ws-2",
      });
      const log = getAuditLog({ workspaceId: "ws-1", userId: "u1" });
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe("a1");
    });
  });
});
