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
} from "../index.js";

describe("rbac", () => {
  beforeEach(() => {
    clearAuditLog();
  });

  describe("roleHasPermission", () => {
    it("viewer can read ideas", () => {
      expect(roleHasPermission("viewer", "idea:read")).toBe(true);
    });

    it("viewer cannot create ideas", () => {
      expect(roleHasPermission("viewer", "idea:create")).toBe(false);
    });

    it("contributor can create ideas", () => {
      expect(roleHasPermission("contributor", "idea:create")).toBe(true);
    });

    it("contributor cannot delete ideas", () => {
      expect(roleHasPermission("contributor", "idea:delete")).toBe(false);
    });

    it("facilitator can delete ideas", () => {
      expect(roleHasPermission("facilitator", "idea:delete")).toBe(true);
    });

    it("facilitator can invite workspace members", () => {
      expect(roleHasPermission("facilitator", "workspace:invite")).toBe(true);
    });

    it("admin has all permissions", () => {
      const allPerms = Object.keys(PERMISSIONS) as Permission[];
      for (const perm of allPerms) {
        expect(roleHasPermission("admin", perm)).toBe(true);
      }
    });

    it("owner has all permissions (same as admin)", () => {
      const allPerms = Object.keys(PERMISSIONS) as Permission[];
      for (const perm of allPerms) {
        expect(roleHasPermission("owner", perm)).toBe(true);
      }
    });

    it("returns false for unknown role", () => {
      expect(roleHasPermission("unknown" as ExtendedRole, "idea:read")).toBe(false);
    });
  });

  describe("getRolePermissions", () => {
    it("returns viewer permissions", () => {
      const perms = getRolePermissions("viewer");
      expect(perms).toContain("idea:read");
      expect(perms).not.toContain("idea:create");
    });

    it("returns empty array for unknown role", () => {
      expect(getRolePermissions("unknown" as ExtendedRole)).toEqual([]);
    });

    it("admin has more permissions than contributor", () => {
      expect(getRolePermissions("admin").length).toBeGreaterThan(
        getRolePermissions("contributor").length
      );
    });
  });

  describe("isRoleAtLeast", () => {
    it("owner is at least viewer", () => {
      expect(isRoleAtLeast("owner", "viewer")).toBe(true);
    });

    it("viewer is at least viewer", () => {
      expect(isRoleAtLeast("viewer", "viewer")).toBe(true);
    });

    it("viewer is not at least contributor", () => {
      expect(isRoleAtLeast("viewer", "contributor")).toBe(false);
    });

    it("admin is at least facilitator", () => {
      expect(isRoleAtLeast("admin", "facilitator")).toBe(true);
    });

    it("facilitator is not at least admin", () => {
      expect(isRoleAtLeast("facilitator", "admin")).toBe(false);
    });

    it("contributor is at least contributor", () => {
      expect(isRoleAtLeast("contributor", "contributor")).toBe(true);
    });

    it("handles full hierarchy: viewer < contributor < facilitator < admin < owner", () => {
      const hierarchy: ExtendedRole[] = ["viewer", "contributor", "facilitator", "admin", "owner"];
      for (let i = 0; i < hierarchy.length; i++) {
        for (let j = 0; j <= i; j++) {
          expect(isRoleAtLeast(hierarchy[i], hierarchy[j])).toBe(true);
        }
        for (let j = i + 1; j < hierarchy.length; j++) {
          expect(isRoleAtLeast(hierarchy[i], hierarchy[j])).toBe(false);
        }
      }
    });

    it("returns false for unknown role string", () => {
      expect(isRoleAtLeast("unknown" as ExtendedRole, "viewer")).toBe(false);
    });
  });

  describe("checkPermission", () => {
    it("allows admin to do anything", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "Admin",
        provider: "github",
        workspaceRole: "admin",
        workspaceId: "ws1",
      };
      const result = checkPermission(auth, "workspace:delete");
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.userRole).toBe("admin");
    });

    it("denies viewer from creating ideas", () => {
      const auth: AuthContext = {
        userId: "u2",
        displayName: "Viewer",
        provider: "google",
        workspaceRole: "viewer",
        workspaceId: "ws1",
      };
      const result = checkPermission(auth, "idea:create");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("lacks permission");
    });

    it("returns not allowed when no workspace context", () => {
      const auth: AuthContext = {
        userId: "u3",
        displayName: "NoWs",
        provider: "anonymous",
      };
      const result = checkPermission(auth, "idea:read");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("No workspace context");
    });
  });

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
        workspaceId: "ws1",
      };
      const result = requirePermission(auth, "workspace:delete");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.status).toBe(403);
      }
    });

    it("returns allowed: true when permission granted", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "Admin",
        provider: "api-key",
        workspaceRole: "admin",
        workspaceId: "ws1",
      };
      const result = requirePermission(auth, "admin:api_keys");
      expect(result.allowed).toBe(true);
    });

    it("returns 403 for auth with no workspace role", () => {
      const auth: AuthContext = {
        userId: "u1",
        displayName: "User",
        provider: "github",
      };
      const result = requirePermission(auth, "idea:read");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.status).toBe(403);
      }
    });
  });

  describe("logAction / getAuditLog", () => {
    it("logs an action with auto-generated id and timestamp", () => {
      const entry = logAction({
        userId: "u1",
        displayName: "Alice",
        action: "create",
        resource: "idea",
        resourceId: "i1",
        workspaceId: "ws1",
      });
      expect(entry.id).toMatch(/^audit_/);
      expect(entry.timestamp).toBeTruthy();
      expect(entry.userId).toBe("u1");
    });

    it("getAuditLog returns logged entries", () => {
      logAction({ userId: "u1", displayName: "A", action: "create", resource: "idea" });
      logAction({ userId: "u2", displayName: "B", action: "delete", resource: "idea" });
      const log = getAuditLog();
      expect(log.length).toBe(2);
    });

    it("most recent entries come first", () => {
      logAction({ userId: "u1", displayName: "A", action: "first", resource: "idea" });
      logAction({ userId: "u1", displayName: "A", action: "second", resource: "idea" });
      const log = getAuditLog();
      expect(log[0].action).toBe("second");
    });

    it("filters by workspaceId", () => {
      logAction({
        userId: "u1",
        displayName: "A",
        action: "a",
        resource: "idea",
        workspaceId: "ws1",
      });
      logAction({
        userId: "u1",
        displayName: "A",
        action: "b",
        resource: "idea",
        workspaceId: "ws2",
      });
      const log = getAuditLog({ workspaceId: "ws1" });
      expect(log.length).toBe(1);
      expect(log[0].workspaceId).toBe("ws1");
    });

    it("filters by userId", () => {
      logAction({ userId: "u1", displayName: "A", action: "a", resource: "idea" });
      logAction({ userId: "u2", displayName: "B", action: "b", resource: "idea" });
      const log = getAuditLog({ userId: "u2" });
      expect(log.length).toBe(1);
      expect(log[0].userId).toBe("u2");
    });

    it("respects limit option", () => {
      for (let i = 0; i < 10; i++) {
        logAction({ userId: "u1", displayName: "A", action: `action-${i}`, resource: "idea" });
      }
      const log = getAuditLog({ limit: 3 });
      expect(log.length).toBe(3);
    });

    it("defaults to limit of 50", () => {
      for (let i = 0; i < 60; i++) {
        logAction({ userId: "u1", displayName: "A", action: `action-${i}`, resource: "idea" });
      }
      const log = getAuditLog();
      expect(log.length).toBe(50);
    });

    it("caps at 1000 entries in memory", () => {
      for (let i = 0; i < 1010; i++) {
        logAction({ userId: "u1", displayName: "A", action: `action-${i}`, resource: "idea" });
      }
      const log = getAuditLog({ limit: 2000 });
      expect(log.length).toBe(1000);
    });

    it("clearAuditLog empties the log", () => {
      logAction({ userId: "u1", displayName: "A", action: "a", resource: "idea" });
      clearAuditLog();
      expect(getAuditLog()).toHaveLength(0);
    });
  });
});
