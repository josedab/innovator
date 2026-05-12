import { describe, it, expect, beforeEach } from "vitest";
import {
  scimCreateUser,
  scimGetUser,
  scimUpdateUser,
  scimDeleteUser,
  scimListUsers,
  scimCreateGroup,
  scimGetGroup,
  scimUpdateGroup,
  scimListGroups,
  getDataResidency,
  setDataResidency,
  checkDataResidency,
  setScimToken,
  validateScimToken,
  clearScimData,
} from "../scim.js";

describe("rbac/scim", () => {
  beforeEach(() => {
    clearScimData();
  });

  describe("SCIM Users", () => {
    it("should create a user", () => {
      const user = scimCreateUser({
        userName: "jdoe",
        displayName: "John Doe",
        emails: [{ value: "jdoe@example.com", type: "work", primary: true }],
      });

      expect(user.id).toBeTruthy();
      expect(user.userName).toBe("jdoe");
      expect(user.displayName).toBe("John Doe");
      expect(user.active).toBe(true);
      expect(user.meta.resourceType).toBe("User");
    });

    it("should get a user by ID", () => {
      const created = scimCreateUser({
        userName: "jdoe",
        displayName: "John Doe",
        emails: [{ value: "jdoe@example.com" }],
      });

      const found = scimGetUser(created.id);
      expect(found).toBeTruthy();
      expect(found!.userName).toBe("jdoe");
    });

    it("should return undefined for unknown user", () => {
      expect(scimGetUser("nonexistent")).toBeUndefined();
    });

    it("should update a user", () => {
      const user = scimCreateUser({
        userName: "jdoe",
        displayName: "John",
        emails: [{ value: "jdoe@example.com" }],
      });

      const updated = scimUpdateUser(user.id, {
        displayName: "John Doe Updated",
        active: false,
      });

      expect(updated).toBeTruthy();
      expect(updated!.displayName).toBe("John Doe Updated");
      expect(updated!.active).toBe(false);
    });

    it("should reject invalid emails on update", () => {
      const user = scimCreateUser({
        userName: "jdoe",
        displayName: "John",
        emails: [{ value: "jdoe@example.com" }],
      });

      expect(() =>
        scimUpdateUser(user.id, { emails: [{ value: "invalid-email" }] })
      ).toThrow("Invalid email");
    });

    it("should return undefined when updating nonexistent user", () => {
      expect(scimUpdateUser("nonexistent", { displayName: "X" })).toBeUndefined();
    });

    it("should deactivate a user on delete", () => {
      const user = scimCreateUser({
        userName: "jdoe",
        displayName: "John",
        emails: [{ value: "jdoe@example.com" }],
      });

      const deleted = scimDeleteUser(user.id);
      expect(deleted).toBe(true);

      const found = scimGetUser(user.id);
      expect(found!.active).toBe(false);
    });

    it("should return false when deleting nonexistent user", () => {
      expect(scimDeleteUser("nonexistent")).toBe(false);
    });

    it("should list users with pagination", () => {
      scimCreateUser({ userName: "a", displayName: "A", emails: [{ value: "a@x.com" }] });
      scimCreateUser({ userName: "b", displayName: "B", emails: [{ value: "b@x.com" }] });
      scimCreateUser({ userName: "c", displayName: "C", emails: [{ value: "c@x.com" }] });

      const { users, totalResults } = scimListUsers({ startIndex: 1, count: 2 });
      expect(users).toHaveLength(2);
      expect(totalResults).toBe(3);
    });

    it("should filter users by userName", () => {
      scimCreateUser({ userName: "alice", displayName: "Alice", emails: [{ value: "a@x.com" }] });
      scimCreateUser({ userName: "bob", displayName: "Bob", emails: [{ value: "b@x.com" }] });

      const { users } = scimListUsers({ filter: 'userName eq "alice"' });
      expect(users).toHaveLength(1);
      expect(users[0].userName).toBe("alice");
    });
  });

  describe("SCIM Groups", () => {
    it("should create a group", () => {
      const group = scimCreateGroup({
        displayName: "Engineering",
        members: [{ value: "user-1", display: "Alice" }],
      });

      expect(group.id).toBeTruthy();
      expect(group.displayName).toBe("Engineering");
      expect(group.members).toHaveLength(1);
    });

    it("should get a group by ID", () => {
      const created = scimCreateGroup({ displayName: "Team" });
      const found = scimGetGroup(created.id);
      expect(found!.displayName).toBe("Team");
    });

    it("should update group members", () => {
      const group = scimCreateGroup({ displayName: "Team" });
      const updated = scimUpdateGroup(group.id, {
        members: [{ value: "u1" }, { value: "u2" }],
      });
      expect(updated!.members).toHaveLength(2);
    });

    it("should list all groups", () => {
      scimCreateGroup({ displayName: "A" });
      scimCreateGroup({ displayName: "B" });
      expect(scimListGroups()).toHaveLength(2);
    });
  });

  describe("Data Residency", () => {
    it("should return default config", () => {
      const config = getDataResidency();
      expect(config.region).toBe("us-east");
      expect(config.enforced).toBe(false);
    });

    it("should update config", () => {
      setDataResidency({ region: "eu-west", enforced: true });
      const config = getDataResidency();
      expect(config.region).toBe("eu-west");
      expect(config.enforced).toBe(true);
    });

    it("should allow any region when not enforced", () => {
      setDataResidency({ enforced: false });
      expect(checkDataResidency("ap-southeast").allowed).toBe(true);
    });

    it("should block disallowed regions when enforced", () => {
      setDataResidency({
        enforced: true,
        allowedRegions: ["eu-west"],
        region: "eu-west",
        crossBorderTransferAllowed: false,
      });
      const result = checkDataResidency("us-east");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not allowed");
    });

    it("should allow primary region when enforced", () => {
      setDataResidency({
        enforced: true,
        allowedRegions: ["eu-west"],
        region: "eu-west",
        crossBorderTransferAllowed: false,
      });
      expect(checkDataResidency("eu-west").allowed).toBe(true);
    });
  });

  describe("SCIM Token", () => {
    it("should validate correct token", () => {
      setScimToken("my-secret-token");
      expect(validateScimToken("my-secret-token")).toBe(true);
    });

    it("should reject incorrect token", () => {
      setScimToken("my-secret-token");
      expect(validateScimToken("wrong-token")).toBe(false);
    });

    it("should reject when no token is set", () => {
      expect(validateScimToken("any")).toBe(false);
    });
  });
});
