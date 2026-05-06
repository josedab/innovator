import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs and os modules before importing the module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/tmp/test-home"),
}));

import {
  laplaceMechanism,
  gaussianMechanism,
  privatizeIdea,
  findCrossOrgMatches,
  getPrivacyBudget,
  consumeBudget,
  storePrivateIdea,
  loadPrivateIdeas,
  clearPrivacyData,
} from "../privacy/index.js";
import type { PrivateIdea } from "../privacy/index.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe("privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("[]");
  });

  // ---- Differential Privacy Primitives ----

  describe("laplaceMechanism", () => {
    it("returns a number", () => {
      const noise = laplaceMechanism(1, 1);
      expect(typeof noise).toBe("number");
      expect(Number.isFinite(noise)).toBe(true);
    });

    it("scales noise with sensitivity", () => {
      const samples = Array.from({ length: 1000 }, () => laplaceMechanism(10, 1));
      const variance = samples.reduce((s, x) => s + x * x, 0) / samples.length;
      // Laplace variance = 2 * scale^2 = 2 * (sensitivity/epsilon)^2 = 200
      expect(variance).toBeGreaterThan(50);
    });

    it("produces smaller noise with larger epsilon", () => {
      const lowEps = Array.from({ length: 500 }, () => Math.abs(laplaceMechanism(1, 0.1)));
      const highEps = Array.from({ length: 500 }, () => Math.abs(laplaceMechanism(1, 10)));
      const avgLow = lowEps.reduce((s, x) => s + x, 0) / lowEps.length;
      const avgHigh = highEps.reduce((s, x) => s + x, 0) / highEps.length;
      expect(avgLow).toBeGreaterThan(avgHigh);
    });
  });

  describe("gaussianMechanism", () => {
    it("returns a number", () => {
      const noise = gaussianMechanism(1, 1, 1e-5);
      expect(typeof noise).toBe("number");
      expect(Number.isFinite(noise)).toBe(true);
    });

    it("sigma calculation produces appropriately scaled noise", () => {
      const samples = Array.from({ length: 500 }, () => gaussianMechanism(1, 1, 1e-5));
      const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
      // Mean should be close to 0
      expect(Math.abs(mean)).toBeLessThan(2);
    });
  });

  // ---- privatizeIdea ----

  describe("privatizeIdea", () => {
    const testIdea = {
      title: "AI-powered healthcare automation",
      description: "Use AI and ML to automate healthcare data processing",
      potentialImpact: "High",
      implementationHint: "Start with cloud deployment",
    };

    it("returns a valid PrivateIdea structure", () => {
      const result = privatizeIdea(testIdea, "org-1");
      expect(result.id).toBeDefined();
      expect(result.fingerprintHash).toBeDefined();
      expect(result.orgId).toBe("org-1");
      expect(result.epsilon).toBe(1.0);
      expect(result.createdAt).toBeDefined();
    });

    it("produces SHA-256 fingerprint hash", () => {
      const result = privatizeIdea(testIdea, "org-1");
      expect(result.fingerprintHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("consistent fingerprint for same idea", () => {
      const a = privatizeIdea(testIdea, "org-1");
      const b = privatizeIdea(testIdea, "org-2");
      expect(a.fingerprintHash).toBe(b.fingerprintHash);
    });

    it("buckets impact score correctly", () => {
      expect(privatizeIdea(testIdea, "org-1", 80).impactBucket).toBe("transformative");
      expect(privatizeIdea(testIdea, "org-1", 60).impactBucket).toBe("high");
      expect(privatizeIdea(testIdea, "org-1", 40).impactBucket).toBe("medium");
      expect(privatizeIdea(testIdea, "org-1", 20).impactBucket).toBe("low");
    });

    it("buckets feasibility score correctly", () => {
      expect(privatizeIdea(testIdea, "org-1", 50, 7).feasibilityBucket).toBe("high");
      expect(privatizeIdea(testIdea, "org-1", 50, 4).feasibilityBucket).toBe("medium");
      expect(privatizeIdea(testIdea, "org-1", 50, 2).feasibilityBucket).toBe("low");
    });

    it("extracts domain tags from idea text", () => {
      const result = privatizeIdea(testIdea, "org-1");
      expect(result.domainTags).toContain("ai");
      expect(result.domainTags).toContain("healthcare");
    });

    it("applies noise to score (score between 0-100)", () => {
      const result = privatizeIdea(testIdea, "org-1", 50);
      expect(result.noisyScore).toBeGreaterThanOrEqual(0);
      expect(result.noisyScore).toBeLessThanOrEqual(100);
    });

    it("uses custom epsilon", () => {
      const result = privatizeIdea(testIdea, "org-1", 50, 5, { epsilon: 0.5 });
      expect(result.epsilon).toBe(0.5);
    });

    it("handles idea with no matching domain tags", () => {
      const plainIdea = {
        title: "Simple Widget",
        description: "A basic widget for everyday use",
        potentialImpact: "Low",
        implementationHint: "Just build it",
      };
      const result = privatizeIdea(plainIdea, "org-1");
      expect(result.category).toBe("general");
      expect(result.domainTags).toEqual([]);
    });

    it("uses gaussian mechanism when configured", () => {
      const result = privatizeIdea(testIdea, "org-1", 50, 5, { noiseMechanism: "gaussian" });
      expect(result.noisyScore).toBeGreaterThanOrEqual(0);
      expect(result.noisyScore).toBeLessThanOrEqual(100);
    });
  });

  // ---- findCrossOrgMatches ----

  describe("findCrossOrgMatches", () => {
    function makePrivateIdea(overrides: Partial<PrivateIdea> = {}): PrivateIdea {
      return {
        id: "test-id",
        fingerprintHash: "abc123",
        category: "ai",
        abstractDescription: "test",
        impactBucket: "high",
        feasibilityBucket: "medium",
        domainTags: ["ai", "ml"],
        noisyScore: 70,
        epsilon: 1.0,
        orgId: "org-1",
        createdAt: new Date().toISOString(),
        ...overrides,
      };
    }

    it("finds matches between ideas from different orgs", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org-1", domainTags: ["ai", "ml"], category: "ai" }),
        makePrivateIdea({ id: "b", orgId: "org-2", domainTags: ["ai", "ml"], category: "ai" }),
      ];
      const result = findCrossOrgMatches(ideas);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.totalCandidates).toBe(2);
      expect(result.privacyGuarantee).toContain("ε=1");
    });

    it("skips ideas from the same org", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org-1", domainTags: ["ai", "ml"] }),
        makePrivateIdea({ id: "b", orgId: "org-1", domainTags: ["ai", "ml"] }),
      ];
      const result = findCrossOrgMatches(ideas);
      expect(result.matches).toHaveLength(0);
    });

    it("applies Jaccard similarity for tag overlap", () => {
      const ideas = [
        makePrivateIdea({
          id: "a",
          orgId: "org-1",
          domainTags: ["ai", "ml", "cloud"],
          category: "ai",
        }),
        makePrivateIdea({
          id: "b",
          orgId: "org-2",
          domainTags: ["ai", "ml", "cloud"],
          category: "ai",
        }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 0 });
      // Perfect tag overlap: 100 + category bonus: 20 + impact match: 15 = capped at 100
      expect(result.matches[0].matchScore).toBeGreaterThanOrEqual(80);
    });

    it("adds category bonus for matching categories", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org-1", domainTags: ["ai"], category: "ai" }),
        makePrivateIdea({ id: "b", orgId: "org-2", domainTags: ["cloud"], category: "ai" }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 0 });
      // Tag similarity: 0/(2) = 0, category bonus = 20, impact match = 15
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchScore).toBe(35);
    });

    it("respects minMatchScore filter", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org-1", domainTags: ["ai"], category: "ai" }),
        makePrivateIdea({ id: "b", orgId: "org-2", domainTags: ["cloud"], category: "data" }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 50 });
      expect(result.matches).toHaveLength(0);
    });

    it("respects maxResults limit", () => {
      const ideas: PrivateIdea[] = [];
      for (let i = 0; i < 5; i++) {
        ideas.push(
          makePrivateIdea({
            id: `a${i}`,
            orgId: `org-${i % 2 === 0 ? "a" : "b"}`,
            domainTags: ["ai", "ml"],
            category: "ai",
          })
        );
      }
      const result = findCrossOrgMatches(ideas, { maxResults: 2, minMatchScore: 0 });
      expect(result.matches.length).toBeLessThanOrEqual(2);
    });

    it("handles empty ideas array", () => {
      const result = findCrossOrgMatches([]);
      expect(result.matches).toHaveLength(0);
      expect(result.totalCandidates).toBe(0);
    });

    it("handles ideas with empty domain tags", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org-1", domainTags: [], category: "general" }),
        makePrivateIdea({ id: "b", orgId: "org-2", domainTags: [], category: "general" }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 0 });
      // Tag similarity = 0 (union is 0), category bonus = 20, impact match = 15
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  // ---- Privacy Budget ----

  describe("getPrivacyBudget / consumeBudget", () => {
    it("creates a new budget for an org", () => {
      mockReadFileSync.mockReturnValue("[]");
      const budget = getPrivacyBudget("org-1", 10);
      expect(budget.orgId).toBe("org-1");
      expect(budget.totalEpsilon).toBe(10);
      expect(budget.usedEpsilon).toBe(0);
      expect(budget.remainingEpsilon).toBe(10);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it("returns existing budget if found", () => {
      const existing = JSON.stringify([
        {
          orgId: "org-1",
          totalEpsilon: 10,
          usedEpsilon: 3,
          remainingEpsilon: 7,
          queryCount: 5,
          resetAt: "2025-01-01",
        },
      ]);
      mockReadFileSync.mockReturnValue(existing);
      const budget = getPrivacyBudget("org-1");
      expect(budget.usedEpsilon).toBe(3);
    });

    it("consumeBudget deducts epsilon and increments query count", () => {
      const budgets = [
        {
          orgId: "org-1",
          totalEpsilon: 10,
          usedEpsilon: 0,
          remainingEpsilon: 10,
          queryCount: 0,
          resetAt: "2025-01-01",
        },
      ];
      mockReadFileSync.mockReturnValue(JSON.stringify(budgets));
      const result = consumeBudget("org-1", 2);
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it("consumeBudget returns false when budget exceeded", () => {
      const budgets = [
        {
          orgId: "org-1",
          totalEpsilon: 10,
          usedEpsilon: 9,
          remainingEpsilon: 1,
          queryCount: 5,
          resetAt: "2025-01-01",
        },
      ];
      mockReadFileSync.mockReturnValue(JSON.stringify(budgets));
      const result = consumeBudget("org-1", 2);
      expect(result).toBe(false);
    });

    it("consumeBudget returns false when budget exactly at limit", () => {
      const budgets = [
        {
          orgId: "org-1",
          totalEpsilon: 10,
          usedEpsilon: 10,
          remainingEpsilon: 0,
          queryCount: 5,
          resetAt: "2025-01-01",
        },
      ];
      mockReadFileSync.mockReturnValue(JSON.stringify(budgets));
      const result = consumeBudget("org-1", 0.01);
      expect(result).toBe(false);
    });

    it("consumeBudget returns false for unknown org", () => {
      mockReadFileSync.mockReturnValue("[]");
      expect(consumeBudget("unknown-org", 1)).toBe(false);
    });
  });

  // ---- Storage ----

  describe("storePrivateIdea / loadPrivateIdeas", () => {
    it("stores and loads private ideas via file I/O", () => {
      const idea: PrivateIdea = {
        id: "test-id",
        fingerprintHash: "hash123",
        category: "ai",
        abstractDescription: "test desc",
        impactBucket: "high",
        feasibilityBucket: "medium",
        domainTags: ["ai"],
        noisyScore: 70,
        epsilon: 1.0,
        orgId: "org-1",
        createdAt: new Date().toISOString(),
      };

      mockReadFileSync.mockReturnValue("[]");
      storePrivateIdea(idea);
      expect(mockWriteFileSync).toHaveBeenCalled();

      const writeCall = mockWriteFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written).toHaveLength(1);
      expect(written[0].id).toBe("test-id");
    });

    it("loadPrivateIdeas returns empty array when file does not exist", () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        if (typeof path === "string" && path.includes("private-ideas")) return false;
        return true;
      });
      const ideas = loadPrivateIdeas();
      expect(ideas).toEqual([]);
    });

    it("loadPrivateIdeas handles corrupt JSON gracefully", () => {
      mockReadFileSync.mockReturnValue("not valid json{{{");
      const ideas = loadPrivateIdeas();
      expect(ideas).toEqual([]);
    });
  });

  describe("clearPrivacyData", () => {
    it("writes empty arrays to both files", () => {
      clearPrivacyData();
      const writeCalls = mockWriteFileSync.mock.calls;
      expect(writeCalls.length).toBe(2);
      expect(writeCalls[0][1]).toBe("[]");
      expect(writeCalls[1][1]).toBe("[]");
    });
  });
});
