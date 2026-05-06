import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs", () => {
  const store = new Map<string, string>();
  return {
    existsSync: vi.fn((path: string) => store.has(path)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((path: string) => {
      if (!store.has(path)) throw new Error("ENOENT");
      return store.get(path)!;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    __store: store,
  };
});

import {
  laplaceMechanism,
  gaussianMechanism,
  privatizeIdea,
  findCrossOrgMatches,
  getPrivacyBudget,
  consumeBudget,
  clearPrivacyData,
} from "../index.js";
import type { PrivateIdea } from "../types.js";

const mockFs = vi.mocked(await import("node:fs"));
const store = (mockFs as unknown as { __store: Map<string, string> }).__store;

describe("privacy", () => {
  beforeEach(() => {
    store.clear();
    clearPrivacyData();
  });

  describe("laplaceMechanism", () => {
    it("produces noise centered around 0 over many samples", () => {
      const samples: number[] = [];
      for (let i = 0; i < 10000; i++) {
        samples.push(laplaceMechanism(1, 1));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(Math.abs(mean)).toBeLessThan(0.1);
    });

    it("noise scales with smaller epsilon (more noise)", () => {
      const smallEps: number[] = [];
      const largeEps: number[] = [];
      for (let i = 0; i < 5000; i++) {
        smallEps.push(Math.abs(laplaceMechanism(1, 0.1)));
        largeEps.push(Math.abs(laplaceMechanism(1, 10)));
      }
      const avgSmall = smallEps.reduce((a, b) => a + b, 0) / smallEps.length;
      const avgLarge = largeEps.reduce((a, b) => a + b, 0) / largeEps.length;
      expect(avgSmall).toBeGreaterThan(avgLarge);
    });

    it("noise scales with sensitivity", () => {
      const lowSens: number[] = [];
      const highSens: number[] = [];
      for (let i = 0; i < 5000; i++) {
        lowSens.push(Math.abs(laplaceMechanism(1, 1)));
        highSens.push(Math.abs(laplaceMechanism(10, 1)));
      }
      const avgLow = lowSens.reduce((a, b) => a + b, 0) / lowSens.length;
      const avgHigh = highSens.reduce((a, b) => a + b, 0) / highSens.length;
      expect(avgHigh).toBeGreaterThan(avgLow);
    });
  });

  describe("gaussianMechanism", () => {
    it("produces noise centered around 0 over many samples", () => {
      const samples: number[] = [];
      for (let i = 0; i < 10000; i++) {
        samples.push(gaussianMechanism(1, 1, 1e-5));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(Math.abs(mean)).toBeLessThan(0.2);
    });

    it("noise scales with smaller epsilon", () => {
      const smallEps: number[] = [];
      const largeEps: number[] = [];
      for (let i = 0; i < 5000; i++) {
        smallEps.push(Math.abs(gaussianMechanism(1, 0.1, 1e-5)));
        largeEps.push(Math.abs(gaussianMechanism(1, 10, 1e-5)));
      }
      const avgSmall = smallEps.reduce((a, b) => a + b, 0) / smallEps.length;
      const avgLarge = largeEps.reduce((a, b) => a + b, 0) / largeEps.length;
      expect(avgSmall).toBeGreaterThan(avgLarge);
    });
  });

  describe("privatizeIdea", () => {
    const idea = {
      title: "AI Healthcare Platform",
      description:
        "A cloud-based platform using AI for healthcare diagnostics and John Smith leads the team",
      potentialImpact: "Improve diagnostics",
      implementationHint: "Use ML models",
    };

    it("returns a private idea with all required fields", () => {
      const result = privatizeIdea(idea, "org1");
      expect(result.id).toBeTruthy();
      expect(result.fingerprintHash).toBeTruthy();
      expect(result.orgId).toBe("org1");
      expect(result.epsilon).toBe(1.0);
      expect(result.createdAt).toBeTruthy();
    });

    it("replaces entity-like names with [ENTITY]", () => {
      const result = privatizeIdea(idea, "org1");
      expect(result.abstractDescription).toContain("[ENTITY]");
    });

    it("truncates description to 200 chars", () => {
      const longIdea = {
        ...idea,
        description: "x".repeat(500),
      };
      const result = privatizeIdea(longIdea, "org1");
      expect(result.abstractDescription.length).toBeLessThanOrEqual(200);
    });

    it("produces deterministic SHA256 fingerprint for same idea", () => {
      const r1 = privatizeIdea(idea, "org1");
      const r2 = privatizeIdea(idea, "org2");
      expect(r1.fingerprintHash).toBe(r2.fingerprintHash);
      expect(r1.fingerprintHash.length).toBe(64);
    });

    it("buckets impact score correctly", () => {
      expect(privatizeIdea(idea, "org1", 85).impactBucket).toBe("transformative");
      expect(privatizeIdea(idea, "org1", 65).impactBucket).toBe("high");
      expect(privatizeIdea(idea, "org1", 45).impactBucket).toBe("medium");
      expect(privatizeIdea(idea, "org1", 20).impactBucket).toBe("low");
    });

    it("buckets feasibility score correctly", () => {
      expect(privatizeIdea(idea, "org1", 50, 8).feasibilityBucket).toBe("high");
      expect(privatizeIdea(idea, "org1", 50, 5).feasibilityBucket).toBe("medium");
      expect(privatizeIdea(idea, "org1", 50, 2).feasibilityBucket).toBe("low");
    });

    it("extracts domain tags from content", () => {
      const result = privatizeIdea(idea, "org1");
      expect(result.domainTags).toContain("ai");
      expect(result.domainTags).toContain("healthcare");
      expect(result.domainTags).toContain("cloud");
    });

    it("defaults category to 'general' when no domain tags found", () => {
      const genericIdea = {
        title: "Something",
        description: "A vague thing",
        potentialImpact: "Unknown",
        implementationHint: "TBD",
      };
      const result = privatizeIdea(genericIdea, "org1");
      expect(result.category).toBe("general");
    });

    it("noisy score is clamped between 0 and 100", () => {
      for (let i = 0; i < 50; i++) {
        const result = privatizeIdea(idea, "org1", 50);
        expect(result.noisyScore).toBeGreaterThanOrEqual(0);
        expect(result.noisyScore).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("findCrossOrgMatches", () => {
    function makePrivateIdea(overrides: Partial<PrivateIdea> = {}): PrivateIdea {
      return {
        id: "test-id",
        fingerprintHash: "hash1",
        category: "ai",
        abstractDescription: "desc",
        impactBucket: "high",
        feasibilityBucket: "medium",
        domainTags: ["ai", "cloud"],
        noisyScore: 70,
        epsilon: 1,
        orgId: "org1",
        createdAt: new Date().toISOString(),
        ...overrides,
      };
    }

    it("finds matches between ideas from different orgs with shared tags", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org1", domainTags: ["ai", "cloud"], category: "ai" }),
        makePrivateIdea({ id: "b", orgId: "org2", domainTags: ["ai", "cloud"], category: "ai" }),
      ];
      const result = findCrossOrgMatches(ideas);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.totalCandidates).toBe(2);
    });

    it("does not match ideas from the same org", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org1", domainTags: ["ai"] }),
        makePrivateIdea({ id: "b", orgId: "org1", domainTags: ["ai"] }),
      ];
      const result = findCrossOrgMatches(ideas);
      expect(result.matches).toHaveLength(0);
    });

    it("applies category bonus of 20 for same category", () => {
      const ideas = [
        makePrivateIdea({
          id: "a",
          orgId: "org1",
          domainTags: ["ai"],
          category: "ai",
          impactBucket: "high",
        }),
        makePrivateIdea({
          id: "b",
          orgId: "org2",
          domainTags: [],
          category: "ai",
          impactBucket: "high",
        }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 1 });
      expect(result.matches.length).toBeGreaterThan(0);
      // Category bonus (20) + impact match (15) = 35
      expect(result.matches[0].matchScore).toBe(35);
    });

    it("respects minMatchScore filter", () => {
      const ideas = [
        makePrivateIdea({ id: "a", orgId: "org1", domainTags: ["ai"] }),
        makePrivateIdea({ id: "b", orgId: "org2", domainTags: ["blockchain"] }),
      ];
      const result = findCrossOrgMatches(ideas, { minMatchScore: 90 });
      expect(result.matches).toHaveLength(0);
    });

    it("includes privacy guarantee string", () => {
      const result = findCrossOrgMatches([], { epsilon: 2.0 });
      expect(result.privacyGuarantee).toContain("ε=2");
      expect(result.epsilonUsed).toBe(2);
    });
  });

  describe("getPrivacyBudget / consumeBudget", () => {
    it("creates a new budget for an org", () => {
      const budget = getPrivacyBudget("org1", 10);
      expect(budget.orgId).toBe("org1");
      expect(budget.totalEpsilon).toBe(10);
      expect(budget.usedEpsilon).toBe(0);
      expect(budget.remainingEpsilon).toBe(10);
      expect(budget.queryCount).toBe(0);
    });

    it("returns existing budget on second call", () => {
      getPrivacyBudget("org1", 10);
      const budget = getPrivacyBudget("org1", 999);
      expect(budget.totalEpsilon).toBe(10);
    });

    it("consumeBudget decrements remaining epsilon", () => {
      getPrivacyBudget("org1", 10);
      const consumed = consumeBudget("org1", 3);
      expect(consumed).toBe(true);
      const budget = getPrivacyBudget("org1");
      expect(budget.usedEpsilon).toBe(3);
      expect(budget.remainingEpsilon).toBe(7);
      expect(budget.queryCount).toBe(1);
    });

    it("consumeBudget returns false when budget exhausted", () => {
      getPrivacyBudget("org1", 5);
      consumeBudget("org1", 3);
      const result = consumeBudget("org1", 3);
      expect(result).toBe(false);
    });

    it("consumeBudget returns false for unknown org", () => {
      expect(consumeBudget("unknown-org", 1)).toBe(false);
    });

    it("budget at exactly 0 remaining rejects any consumption", () => {
      getPrivacyBudget("org1", 5);
      consumeBudget("org1", 5);
      expect(consumeBudget("org1", 0.01)).toBe(false);
    });
  });
});
