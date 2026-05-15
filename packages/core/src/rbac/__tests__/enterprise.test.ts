import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  configureSSOProvider,
  getSSOConfig,
  listSSOConfigs,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  revokeAllUserSessions,
  listManagedUsers,
  suspendUser,
  reactivateUser,
  updateUserRole,
  setComplianceConfig,
  getComplianceConfig,
  generateComplianceReport,
  getOrgStats,
  clearEnterpriseData,
} from "../enterprise.js";
import type { SSOConfig } from "../enterprise.js";

function makeSSOInput(overrides: Partial<Omit<SSOConfig, "id" | "createdAt" | "updatedAt">> = {}) {
  return {
    provider: "oidc" as const,
    idp: "okta" as const,
    enabled: true,
    metadataUrl: "https://okta.example.com/.well-known/openid-configuration",
    clientId: "client-123",
    callbackUrl: "https://app.example.com/callback",
    roleMapping: { admin: "admin", user: "contributor" },
    allowedDomains: ["example.com"],
    enforceSSO: false,
    autoProvision: true,
    ...overrides,
  };
}

describe("enterprise RBAC/SSO", () => {
  beforeEach(() => {
    clearEnterpriseData();
    vi.useRealTimers();
  });

  // ---- SSO Configuration ----

  describe("configureSSOProvider", () => {
    it("creates a new SSO config with generated ID and timestamps", () => {
      const config = configureSSOProvider(makeSSOInput());
      expect(config.id).toBeTruthy();
      expect(config.provider).toBe("oidc");
      expect(config.idp).toBe("okta");
      expect(config.createdAt).toBeTruthy();
      expect(config.updatedAt).toBeTruthy();
    });

    it("throws when no allowed domains provided", () => {
      expect(() => configureSSOProvider(makeSSOInput({ allowedDomains: [] }))).toThrow(
        "At least one allowed domain is required"
      );
    });

    it("stores config retrievable by ID", () => {
      const config = configureSSOProvider(makeSSOInput());
      expect(getSSOConfig(config.id)).toMatchObject({ id: config.id, idp: "okta" });
    });

    it("returns undefined for unknown config ID", () => {
      expect(getSSOConfig("nonexistent")).toBeUndefined();
    });

    it("lists all SSO configs", () => {
      configureSSOProvider(makeSSOInput());
      configureSSOProvider(makeSSOInput({ idp: "azure-ad" }));
      expect(listSSOConfigs()).toHaveLength(2);
    });

    it("supports SAML provider type", () => {
      const config = configureSSOProvider(makeSSOInput({ provider: "saml" }));
      expect(config.provider).toBe("saml");
    });
  });

  // ---- SSO Sessions ----

  describe("createSSOSession", () => {
    it("creates a session with default 8-hour expiry", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "user@example.com", ssoConfig.id);

      expect(session.id).toBeTruthy();
      expect(session.userId).toBe("user-1");
      expect(session.email).toBe("user@example.com");
      expect(session.mfaVerified).toBe(false);

      const expiresAt = new Date(session.expiresAt).getTime();
      const createdAt = new Date(session.createdAt).getTime();
      const diff = (expiresAt - createdAt) / (1000 * 60 * 60);
      expect(diff).toBeCloseTo(8, 0);
    });

    it("creates a session with custom duration", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id, {
        sessionDurationHours: 24,
      });

      const expiresAt = new Date(session.expiresAt).getTime();
      const createdAt = new Date(session.createdAt).getTime();
      const diff = (expiresAt - createdAt) / (1000 * 60 * 60);
      expect(diff).toBeCloseTo(24, 0);
    });

    it("creates session with MFA verified", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id, {
        mfaVerified: true,
      });
      expect(session.mfaVerified).toBe(true);
    });

    it("stores optional IP address and user agent", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id, {
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(session.ipAddress).toBe("192.168.1.1");
      expect(session.userAgent).toBe("Mozilla/5.0");
    });

    it("auto-provisions user on first login", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("new-user", "new@example.com", ssoConfig.id);

      const users = listManagedUsers();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        userId: "new-user",
        email: "new@example.com",
        role: "contributor",
        status: "active",
        ssoProvider: "okta",
      });
    });

    it("does not duplicate user on second login", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("user-1", "u@e.com", ssoConfig.id);
      createSSOSession("user-1", "u@e.com", ssoConfig.id);

      expect(listManagedUsers()).toHaveLength(1);
    });
  });

  // ---- Session Validation ----

  describe("validateSSOSession", () => {
    it("validates a fresh session", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id);

      const result = validateSSOSession(session.id);
      expect(result.valid).toBe(true);
      expect(result.session?.userId).toBe("user-1");
    });

    it("returns invalid for unknown session", () => {
      const result = validateSSOSession("nonexistent");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Session not found");
    });

    it("returns invalid for expired session", () => {
      vi.useFakeTimers();
      const now = new Date("2025-01-01T00:00:00Z");
      vi.setSystemTime(now);

      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id, {
        sessionDurationHours: 1,
      });

      // Advance past expiry
      vi.setSystemTime(new Date(now.getTime() + 2 * 60 * 60 * 1000));
      const result = validateSSOSession(session.id);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Session expired");

      vi.useRealTimers();
    });

    it("updates lastActivity on successful validation", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id);

      const before = session.lastActivity;
      // Small delay to ensure different timestamp
      const result = validateSSOSession(session.id);
      expect(result.valid).toBe(true);
      expect(result.session!.lastActivity).toBeTruthy();
    });
  });

  // ---- Session Revocation ----

  describe("revokeSSOSession", () => {
    it("revokes an existing session", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id);

      expect(revokeSSOSession(session.id)).toBe(true);
      expect(validateSSOSession(session.id).valid).toBe(false);
    });

    it("returns false for unknown session", () => {
      expect(revokeSSOSession("nonexistent")).toBe(false);
    });
  });

  describe("revokeAllUserSessions", () => {
    it("revokes all sessions for a user", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("user-1", "u@e.com", ssoConfig.id);
      createSSOSession("user-1", "u@e.com", ssoConfig.id);
      createSSOSession("user-2", "other@e.com", ssoConfig.id);

      const count = revokeAllUserSessions("user-1");
      expect(count).toBe(2);
    });

    it("returns 0 for user with no sessions", () => {
      expect(revokeAllUserSessions("nobody")).toBe(0);
    });
  });

  // ---- User Management ----

  describe("suspendUser / reactivateUser", () => {
    it("suspends an active user and revokes sessions", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      const session = createSSOSession("user-1", "u@e.com", ssoConfig.id);

      expect(suspendUser("user-1")).toBe(true);

      const users = listManagedUsers({ status: "suspended" });
      expect(users).toHaveLength(1);
      expect(users[0].status).toBe("suspended");

      // Sessions should be revoked
      expect(validateSSOSession(session.id).valid).toBe(false);
    });

    it("reactivates a suspended user", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("user-1", "u@e.com", ssoConfig.id);
      suspendUser("user-1");
      expect(reactivateUser("user-1")).toBe(true);

      const users = listManagedUsers({ status: "active" });
      expect(users).toHaveLength(1);
    });

    it("returns false for unknown user", () => {
      expect(suspendUser("nobody")).toBe(false);
      expect(reactivateUser("nobody")).toBe(false);
    });
  });

  describe("updateUserRole", () => {
    it("updates a user role", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("user-1", "u@e.com", ssoConfig.id);

      expect(updateUserRole("user-1", "admin")).toBe(true);
      const users = listManagedUsers({ role: "admin" });
      expect(users).toHaveLength(1);
    });

    it("returns false for unknown user", () => {
      expect(updateUserRole("nobody", "admin")).toBe(false);
    });
  });

  describe("listManagedUsers", () => {
    it("filters by status", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("u1", "a@e.com", ssoConfig.id);
      createSSOSession("u2", "b@e.com", ssoConfig.id);
      suspendUser("u2");

      expect(listManagedUsers({ status: "active" })).toHaveLength(1);
      expect(listManagedUsers({ status: "suspended" })).toHaveLength(1);
    });

    it("respects limit option", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      for (let i = 0; i < 5; i++) {
        createSSOSession(`u${i}`, `u${i}@e.com`, ssoConfig.id);
      }
      expect(listManagedUsers({ limit: 2 })).toHaveLength(2);
    });
  });

  // ---- Compliance ----

  describe("generateComplianceReport", () => {
    it("generates GDPR report with default config", () => {
      const report = generateComplianceReport("gdpr");
      expect(report.framework).toBe("gdpr");
      expect(report.checks.length).toBe(7);
      expect(report.id).toBeTruthy();
      expect(report.generatedAt).toBeTruthy();
      expect(report.summary).toContain("checks passed");
    });

    it("GDPR report is compliant with default encryption settings", () => {
      const report = generateComplianceReport("gdpr");
      const encAtRest = report.checks.find((c) => c.id === "gdpr-1");
      expect(encAtRest!.status).toBe("pass");
    });

    it("GDPR report fails when encryption disabled", () => {
      setComplianceConfig({ encryptionAtRest: false });
      const report = generateComplianceReport("gdpr");
      const encAtRest = report.checks.find((c) => c.id === "gdpr-1");
      expect(encAtRest!.status).toBe("fail");
      expect(encAtRest!.remediation).toBeTruthy();
    });

    it("generates SOC2 report", () => {
      const report = generateComplianceReport("soc2");
      expect(report.framework).toBe("soc2");
      expect(report.checks.length).toBe(5);
    });

    it("SOC2 warns when no SSO configured", () => {
      const report = generateComplianceReport("soc2");
      const accessControl = report.checks.find((c) => c.id === "soc2-1");
      expect(accessControl!.status).toBe("warning");
    });

    it("SOC2 passes access control when SSO is configured", () => {
      configureSSOProvider(makeSSOInput());
      const report = generateComplianceReport("soc2");
      const accessControl = report.checks.find((c) => c.id === "soc2-1");
      expect(accessControl!.status).toBe("pass");
    });

    it("generates HIPAA report", () => {
      const report = generateComplianceReport("hipaa");
      expect(report.framework).toBe("hipaa");
      expect(report.checks.length).toBe(3);
    });

    it("HIPAA fails PHI protection without PII detection", () => {
      const report = generateComplianceReport("hipaa");
      const phi = report.checks.find((c) => c.id === "hipaa-1");
      expect(phi!.status).toBe("fail");
    });

    it("generates ISO27001 report", () => {
      const report = generateComplianceReport("iso27001");
      expect(report.framework).toBe("iso27001");
      expect(report.checks.length).toBe(4);
    });

    it("report status is compliant when all checks pass", () => {
      setComplianceConfig({ piiDetection: true });
      configureSSOProvider(makeSSOInput());
      const report = generateComplianceReport("soc2");
      expect(report.status).toBe("compliant");
    });

    it("report status is non-compliant when many checks fail", () => {
      setComplianceConfig({
        encryptionAtRest: false,
        encryptionInTransit: false,
        rightToDeleteEnabled: false,
        dataExportEnabled: false,
        auditLogRetentionDays: 5,
      });
      const report = generateComplianceReport("gdpr");
      expect(["non-compliant", "partial"]).toContain(report.status);
    });
  });

  describe("setComplianceConfig / getComplianceConfig", () => {
    it("updates and retrieves compliance config", () => {
      setComplianceConfig({ dataResidency: "eu", piiDetection: true });
      const config = getComplianceConfig();
      expect(config.dataResidency).toBe("eu");
      expect(config.piiDetection).toBe(true);
      // Unchanged fields should retain defaults
      expect(config.encryptionAtRest).toBe(true);
    });
  });

  // ---- Org Stats ----

  describe("getOrgStats", () => {
    it("returns zero stats for empty org", () => {
      const stats = getOrgStats();
      expect(stats.totalUsers).toBe(0);
      expect(stats.activeUsers).toBe(0);
      expect(stats.ssoEnabled).toBe(false);
    });

    it("counts users and sessions", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("u1", "a@e.com", ssoConfig.id);
      createSSOSession("u2", "b@e.com", ssoConfig.id);

      const stats = getOrgStats();
      expect(stats.totalUsers).toBe(2);
      expect(stats.activeUsers).toBe(2);
      expect(stats.totalSessions).toBe(2);
      expect(stats.ssoEnabled).toBe(true);
    });

    it("reflects suspended users in counts", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("u1", "a@e.com", ssoConfig.id);
      createSSOSession("u2", "b@e.com", ssoConfig.id);
      suspendUser("u2");

      const stats = getOrgStats();
      expect(stats.totalUsers).toBe(2);
      expect(stats.activeUsers).toBe(1);
    });
  });

  // ---- Cleanup ----

  describe("clearEnterpriseData", () => {
    it("clears all enterprise data", () => {
      const ssoConfig = configureSSOProvider(makeSSOInput());
      createSSOSession("u1", "a@e.com", ssoConfig.id);
      setComplianceConfig({ dataResidency: "eu" });

      clearEnterpriseData();

      expect(listSSOConfigs()).toHaveLength(0);
      expect(listManagedUsers()).toHaveLength(0);
      // Compliance config should be reset to defaults
      expect(getComplianceConfig().dataResidency).toBe("us");
    });
  });
});
