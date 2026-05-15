/**
 * Tests for the Enterprise SSO & Compliance Suite (SOC 2 tracker, DLP, IP policies).
 */
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initSOC2Tracker,
  getSOC2Readiness,
  updateSOC2Control,
  setIPPolicy,
  getIPPolicy,
  checkIPAccess,
  setDLPPolicy,
  getDLPPolicy,
  scanForDLPViolations,
  setDataResidencyPolicy,
  getDataResidencyPolicy,
  setRetentionPolicy,
  getRetentionPolicy,
  setBrandingConfig,
  getBrandingConfig,
  clearEnterpriseData as clearSOC2Data,
} from "../rbac/soc2-tracker.js";

beforeEach(() => {
  clearSOC2Data();
});

describe("soc2-tracker", () => {
  describe("SOC 2 readiness", () => {
    it("initializes with default controls", () => {
      const readiness = initSOC2Tracker("tenant-1");
      expect(readiness.tenantId).toBe("tenant-1");
      expect(readiness.controls.length).toBeGreaterThan(0);
      expect(readiness.overallReadiness).toBe(0);
      expect(readiness.controls.every((c) => c.status === "not-started")).toBe(true);
    });

    it("retrieves readiness by tenant", () => {
      initSOC2Tracker("tenant-1");
      const readiness = getSOC2Readiness("tenant-1");
      expect(readiness).toBeDefined();
      expect(readiness!.tenantId).toBe("tenant-1");
    });

    it("returns undefined for unknown tenant", () => {
      expect(getSOC2Readiness("nonexistent")).toBeUndefined();
    });

    it("updates control status and recalculates scores", () => {
      initSOC2Tracker("t1");
      const updated = updateSOC2Control("t1", "CC1.1", {
        status: "verified",
        evidence: ["Security policy document v2.0"],
        owner: "CISO",
      });

      expect(updated).toBeDefined();
      const control = updated!.controls.find((c) => c.id === "CC1.1")!;
      expect(control.status).toBe("verified");
      expect(control.evidence).toContain("Security policy document v2.0");
      expect(control.owner).toBe("CISO");
      expect(control.lastReviewedAt).toBeDefined();
      expect(updated!.overallReadiness).toBeGreaterThan(0);
      expect(updated!.categoryScores.security).toBeGreaterThan(0);
    });

    it("returns undefined for unknown control", () => {
      initSOC2Tracker("t1");
      const result = updateSOC2Control("t1", "NONEXISTENT", { status: "verified" });
      expect(result).toBeUndefined();
    });

    it("calculates 100% when all controls are verified", () => {
      initSOC2Tracker("t1");
      const readiness = getSOC2Readiness("t1")!;
      for (const control of readiness.controls) {
        updateSOC2Control("t1", control.id, { status: "verified" });
      }
      const final = getSOC2Readiness("t1")!;
      expect(final.overallReadiness).toBe(100);
    });
  });

  describe("IP policies", () => {
    it("sets and retrieves IP policy", () => {
      setIPPolicy({
        tenantId: "t1",
        enabled: true,
        defaultAction: "deny",
        rules: [
          {
            id: "r1",
            type: "allow",
            cidr: "10.0.0.0/8",
            description: "Internal",
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      });

      const policy = getIPPolicy("t1");
      expect(policy).toBeDefined();
      expect(policy!.enabled).toBe(true);
      expect(policy!.rules).toHaveLength(1);
    });

    it("checks IP access", () => {
      setIPPolicy({
        tenantId: "t1",
        enabled: true,
        defaultAction: "deny",
        rules: [
          { id: "r1", type: "allow", cidr: "10.0.0.0/8", createdAt: new Date().toISOString() },
        ],
        updatedAt: new Date().toISOString(),
      });

      expect(checkIPAccess("t1", "10.0.1.5")).toBe(true);
    });

    it("allows all when policy is disabled", () => {
      expect(checkIPAccess("t1", "192.168.1.1")).toBe(true);
    });
  });

  describe("DLP policies", () => {
    it("sets and retrieves DLP policy", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [
          {
            id: "dlp-1",
            type: "credit-card",
            name: "Credit Card Detection",
            action: "block",
            enabled: true,
          },
          {
            id: "dlp-2",
            type: "api-key",
            name: "API Key Detection",
            action: "redact",
            enabled: true,
          },
          {
            id: "dlp-3",
            type: "pii-detection",
            name: "PII Detection",
            action: "warn",
            enabled: true,
          },
        ],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const policy = getDLPPolicy("t1");
      expect(policy!.rules).toHaveLength(3);
    });

    it("detects credit card numbers", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [{ id: "cc", type: "credit-card", name: "CC", action: "block", enabled: true }],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const violations = scanForDLPViolations("t1", "My card is 4111 1111 1111 1111 thanks");
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleName).toBe("CC");
      expect(violations[0].action).toBe("block");
    });

    it("detects API keys", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [{ id: "key", type: "api-key", name: "API Key", action: "redact", enabled: true }],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const violations = scanForDLPViolations("t1", "Use this: sk_1234567890abcdefghijklmnop");
      expect(violations.length).toBeGreaterThan(0);
    });

    it("detects PII (email)", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [{ id: "pii", type: "pii-detection", name: "PII", action: "warn", enabled: true }],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const violations = scanForDLPViolations("t1", "Contact john@example.com for details");
      expect(violations.length).toBeGreaterThan(0);
    });

    it("supports keyword blocking", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [
          {
            id: "kw",
            type: "keyword-block",
            name: "Blocked Words",
            action: "block",
            enabled: true,
            pattern: "confidential,secret,classified",
          },
        ],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const violations = scanForDLPViolations("t1", "This is a confidential document");
      expect(violations).toHaveLength(1);
      expect(violations[0].match).toBe("confidential");
    });

    it("returns empty when DLP is disabled", () => {
      const violations = scanForDLPViolations("t1", "4111 1111 1111 1111");
      expect(violations).toHaveLength(0);
    });

    it("skips disabled rules", () => {
      setDLPPolicy({
        tenantId: "t1",
        enabled: true,
        rules: [{ id: "cc", type: "credit-card", name: "CC", action: "block", enabled: false }],
        scanInputs: true,
        scanOutputs: true,
        updatedAt: new Date().toISOString(),
      });

      const violations = scanForDLPViolations("t1", "4111 1111 1111 1111");
      expect(violations).toHaveLength(0);
    });
  });

  describe("data residency", () => {
    it("sets and retrieves policy", () => {
      setDataResidencyPolicy({
        tenantId: "t1",
        primaryRegion: "eu",
        allowedRegions: ["eu"],
        encryptionKeyRegion: "eu",
        crossBorderTransferEnabled: false,
        dataProcessingAgreement: true,
        updatedAt: new Date().toISOString(),
      });

      const policy = getDataResidencyPolicy("t1");
      expect(policy!.primaryRegion).toBe("eu");
      expect(policy!.crossBorderTransferEnabled).toBe(false);
    });
  });

  describe("retention policies", () => {
    it("sets and retrieves retention policy", () => {
      setRetentionPolicy({
        tenantId: "t1",
        sessionRetentionDays: 90,
        auditLogRetentionDays: 365,
        analyticsRetentionDays: 180,
        deletedDataPurgeDays: 7,
        updatedAt: new Date().toISOString(),
      });

      const policy = getRetentionPolicy("t1");
      expect(policy!.sessionRetentionDays).toBe(90);
      expect(policy!.deletedDataPurgeDays).toBe(7);
    });
  });

  describe("branding", () => {
    it("sets and retrieves branding config", () => {
      setBrandingConfig({
        tenantId: "t1",
        companyName: "Acme Corp",
        primaryColor: "#FF5733",
        logoUrl: "https://acme.com/logo.png",
        updatedAt: new Date().toISOString(),
      });

      const config = getBrandingConfig("t1");
      expect(config!.companyName).toBe("Acme Corp");
      expect(config!.primaryColor).toBe("#FF5733");
    });

    it("returns undefined for unknown tenant", () => {
      expect(getBrandingConfig("nonexistent")).toBeUndefined();
    });
  });
});
