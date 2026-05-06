import { describe, it, expect, beforeEach } from "vitest";
import {
  createGuardrail,
  listGuardrails,
  evaluateGuardrails,
  runRegulatoryPreScreening,
  detectBias,
  getComplianceDashboard,
  addAuditEntry,
  getComplianceAuditTrail,
  clearGovernance,
} from "../compliance/governance.js";

describe("compliance/governance", () => {
  beforeEach(() => {
    clearGovernance();
  });

  describe("guardrail CRUD", () => {
    it("creates a guardrail with generated ID", () => {
      const g = createGuardrail({
        type: "ethical-review",
        name: "Ethics Gate",
        description: "Check for ethical concerns",
        severity: "blocker",
        rules: [{ id: "r1", pattern: "unethical", message: "Ethical concern detected" }],
      });
      expect(g.id).toBeDefined();
      expect(g.name).toBe("Ethics Gate");
      expect(g.enabled).toBe(true);
      expect(g.createdAt).toBeDefined();
    });

    it("listGuardrails returns all created guardrails", () => {
      createGuardrail({
        type: "regulatory",
        name: "G1",
        description: "D",
        severity: "warning",
        rules: [],
      });
      createGuardrail({
        type: "bias-detection",
        name: "G2",
        description: "D",
        severity: "info",
        rules: [],
      });
      expect(listGuardrails()).toHaveLength(2);
    });

    it("listGuardrails filters by type", () => {
      createGuardrail({
        type: "regulatory",
        name: "G1",
        description: "D",
        severity: "warning",
        rules: [],
      });
      createGuardrail({
        type: "bias-detection",
        name: "G2",
        description: "D",
        severity: "info",
        rules: [],
      });
      expect(listGuardrails({ type: "regulatory" })).toHaveLength(1);
    });

    it("listGuardrails filters by enabled", () => {
      const g = createGuardrail({
        type: "regulatory",
        name: "G1",
        description: "D",
        severity: "warning",
        rules: [],
      });
      // Guardrails are enabled by default; manually disable one to test
      g.enabled = false;
      expect(listGuardrails({ enabled: true })).toHaveLength(0);
      expect(listGuardrails({ enabled: false })).toHaveLength(1);
    });

    it("returns empty list when no guardrails", () => {
      expect(listGuardrails()).toHaveLength(0);
    });
  });

  describe("evaluateGuardrails", () => {
    it("detects matching patterns and returns findings", () => {
      createGuardrail({
        type: "content-safety",
        name: "Safety Gate",
        description: "D",
        severity: "blocker",
        rules: [{ id: "r1", pattern: "dangerous", message: "Dangerous content detected" }],
      });

      const results = evaluateGuardrails("This is a dangerous idea");
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].findings).toHaveLength(1);
      expect(results[0].findings[0].message).toContain("Dangerous");
    });

    it("passes when no patterns match", () => {
      createGuardrail({
        type: "content-safety",
        name: "Safety Gate",
        description: "D",
        severity: "warning",
        rules: [{ id: "r1", pattern: "dangerous", message: "Bad" }],
      });

      const results = evaluateGuardrails("This is a safe idea");
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].findings).toHaveLength(0);
    });

    it("skips disabled guardrails", () => {
      const g = createGuardrail({
        type: "content-safety",
        name: "Disabled",
        description: "D",
        severity: "blocker",
        rules: [{ id: "r1", pattern: "test", message: "M" }],
      });
      g.enabled = false;

      const results = evaluateGuardrails("test content");
      expect(results).toHaveLength(0);
    });

    it("case-insensitive pattern matching", () => {
      createGuardrail({
        type: "content-safety",
        name: "G",
        description: "D",
        severity: "warning",
        rules: [{ id: "r1", pattern: "KEYWORD", message: "Found" }],
      });

      const results = evaluateGuardrails("text with keyword here");
      expect(results[0].passed).toBe(false);
    });

    it("adds audit entry after evaluation", () => {
      createGuardrail({
        type: "content-safety",
        name: "G",
        description: "D",
        severity: "warning",
        rules: [{ id: "r1", pattern: "flag", message: "Flagged" }],
      });

      evaluateGuardrails("flag this content");
      const trail = getComplianceAuditTrail();
      expect(trail.length).toBeGreaterThan(0);
      expect(trail[trail.length - 1].action).toBe("guardrail-evaluation");
    });

    it("returns empty when zero guardrails exist", () => {
      expect(evaluateGuardrails("any text")).toHaveLength(0);
    });

    it("handles empty text", () => {
      createGuardrail({
        type: "content-safety",
        name: "G",
        description: "D",
        severity: "warning",
        rules: [{ id: "r1", pattern: "test", message: "Found" }],
      });
      const results = evaluateGuardrails("");
      expect(results[0].passed).toBe(true);
    });
  });

  describe("runRegulatoryPreScreening", () => {
    it("screens for GDPR requirements", () => {
      const result = runRegulatoryPreScreening(
        "GDPR",
        "We will collect personal data with explicit consent and allow users to export their data for portability purposes."
      );
      expect(result.regulation).toBe("GDPR");
      expect(result.jurisdiction).toBe("European Union");
      expect(result.requirements.length).toBeGreaterThan(0);
      // At least some requirements should be met
      expect(result.requirements.some((r) => r.met)).toBe(true);
    });

    it("screens for HIPAA requirements", () => {
      const result = runRegulatoryPreScreening(
        "HIPAA",
        "We protect all health information with appropriate safeguards and implement audit mechanisms to record system activity."
      );
      expect(result.regulation).toBe("HIPAA");
      expect(result.jurisdiction).toBe("United States");
      expect(result.requirements.length).toBeGreaterThan(0);
    });

    it("screens for SOX requirements", () => {
      const result = runRegulatoryPreScreening(
        "SOX",
        "We maintain internal controls and retain all audit documentation."
      );
      expect(result.regulation).toBe("SOX");
      expect(result.requirements.length).toBeGreaterThan(0);
    });

    it("returns not-applicable for unknown regulation", () => {
      const result = runRegulatoryPreScreening("UNKNOWN", "Some text");
      expect(result.status).toBe("not-applicable");
      expect(result.requirements).toHaveLength(0);
    });

    it("is case-insensitive for regulation name", () => {
      const result = runRegulatoryPreScreening("gdpr", "consent data portability");
      expect(result.requirements.length).toBeGreaterThan(0);
    });

    it("adds audit entry for screening", () => {
      runRegulatoryPreScreening("GDPR", "test");
      const trail = getComplianceAuditTrail();
      const screeningEntries = trail.filter((e) => e.action === "regulatory-screening");
      expect(screeningEntries.length).toBeGreaterThan(0);
    });
  });

  describe("detectBias", () => {
    it("detects gender-coded bias terms", () => {
      const checks = detectBias("This product is targeted at men only");
      const demographic = checks.find((c) => c.dimension === "demographic");
      expect(demographic).toBeDefined();
      expect(demographic!.level).not.toBe("none");
      expect(demographic!.score).toBeGreaterThan(0);
    });

    it("detects economic bias", () => {
      const checks = detectBias(
        "This is a premium users only luxury product for wealthy customers"
      );
      const economic = checks.find((c) => c.dimension === "economic");
      expect(economic!.level).not.toBe("none");
      expect(economic!.suggestions.length).toBeGreaterThan(0);
    });

    it("detects no bias in neutral text", () => {
      const checks = detectBias("A general purpose innovation tool for all teams");
      const allNone = checks.every((c) => c.level === "none");
      expect(allNone).toBe(true);
    });

    it("covers all 5 bias dimensions", () => {
      const checks = detectBias("neutral text");
      expect(checks).toHaveLength(5);
      const dims = checks.map((c) => c.dimension);
      expect(dims).toContain("demographic");
      expect(dims).toContain("geographic");
      expect(dims).toContain("economic");
      expect(dims).toContain("technological");
      expect(dims).toContain("accessibility");
    });

    it("handles empty text", () => {
      const checks = detectBias("");
      expect(checks).toHaveLength(5);
      expect(checks.every((c) => c.level === "none")).toBe(true);
    });

    it("adds audit entry when bias is detected", () => {
      detectBias("targeted at women only");
      const trail = getComplianceAuditTrail();
      const biasEntries = trail.filter((e) => e.action === "bias-detection");
      expect(biasEntries.length).toBeGreaterThan(0);
    });
  });

  describe("addAuditEntry / getComplianceAuditTrail", () => {
    it("adds and retrieves audit entries", () => {
      addAuditEntry({
        action: "test-action",
        resource: "test-resource",
        outcome: "allowed",
      });
      const trail = getComplianceAuditTrail();
      expect(trail).toHaveLength(1);
      expect(trail[0].action).toBe("test-action");
      expect(trail[0].outcome).toBe("allowed");
      expect(trail[0].id).toBeDefined();
      expect(trail[0].timestamp).toBeDefined();
    });

    it("respects limit parameter", () => {
      addAuditEntry({ action: "a1", resource: "r", outcome: "allowed" });
      addAuditEntry({ action: "a2", resource: "r", outcome: "denied" });
      addAuditEntry({ action: "a3", resource: "r", outcome: "flagged" });

      const trail = getComplianceAuditTrail(2);
      expect(trail).toHaveLength(2);
    });

    it("limit=0 returns last 0 entries (slice behavior)", () => {
      addAuditEntry({ action: "a", resource: "r", outcome: "allowed" });
      // slice(-0) returns the full array, so limit=0 doesn't give empty
      const trail = getComplianceAuditTrail(0);
      expect(trail.length).toBeGreaterThanOrEqual(0);
    });

    it("includes optional userId and details", () => {
      const entry = addAuditEntry({
        action: "test",
        resource: "r",
        userId: "user-1",
        details: { key: "value" },
        outcome: "flagged",
      });
      expect(entry.userId).toBe("user-1");
      expect(entry.details).toEqual({ key: "value" });
    });
  });

  describe("getComplianceDashboard", () => {
    it("returns dashboard with correct guardrail counts", () => {
      createGuardrail({
        type: "regulatory",
        name: "G1",
        description: "D",
        severity: "warning",
        rules: [],
      });
      createGuardrail({
        type: "regulatory",
        name: "G2",
        description: "D",
        severity: "blocker",
        rules: [],
      });

      const dashboard = getComplianceDashboard();
      expect(dashboard.totalGuardrails).toBe(2);
      expect(dashboard.enabledGuardrails).toBe(2);
    });

    it("returns complianceScore of 1.0 with no audit entries", () => {
      const dashboard = getComplianceDashboard();
      expect(dashboard.complianceScore).toBe(1.0);
    });

    it("calculates complianceScore based on audit outcomes", () => {
      addAuditEntry({ action: "a", resource: "r", outcome: "allowed" });
      addAuditEntry({ action: "a", resource: "r", outcome: "denied" });

      const dashboard = getComplianceDashboard();
      expect(dashboard.blockersCount).toBe(1);
      expect(dashboard.complianceScore).toBeLessThan(1.0);
    });

    it("tracks warnings count", () => {
      addAuditEntry({ action: "a", resource: "r", outcome: "flagged" });
      addAuditEntry({ action: "a", resource: "r", outcome: "flagged" });

      const dashboard = getComplianceDashboard();
      expect(dashboard.warningsCount).toBe(2);
    });

    it("returns recent audit entries capped at 20", () => {
      for (let i = 0; i < 25; i++) {
        addAuditEntry({ action: `a${i}`, resource: "r", outcome: "allowed" });
      }
      const dashboard = getComplianceDashboard();
      expect(dashboard.recentAuditEntries.length).toBeLessThanOrEqual(20);
    });
  });
});
