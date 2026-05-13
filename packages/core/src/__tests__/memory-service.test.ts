import { describe, it, expect, beforeEach } from "vitest";
import { InnovationMemoryService, cosineSimilarity } from "../learning-loop/memory-service.js";

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "s1",
    type: "idea" as const,
    content: "Test idea",
    domain: "fintech",
    embedding: [1, 0, 0],
    tags: ["test"],
    qualityScore: 7,
    metadata: { angleId: "first-principles" },
    ...overrides,
  };
}

describe("InnovationMemoryService", () => {
  let svc: InnovationMemoryService;

  beforeEach(() => {
    svc = new InnovationMemoryService();
  });

  describe("cosineSimilarity", () => {
    it("returns 1 for identical unit vectors", () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("returns 0 for empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("returns 0 for mismatched lengths", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it("returns 0 for zero vectors", () => {
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });

    it("computes similarity for arbitrary vectors", () => {
      const sim = cosineSimilarity([1, 2, 3], [1, 2, 3]);
      expect(sim).toBeCloseTo(1);
    });
  });

  describe("storeEntry", () => {
    it("stores an entry and assigns an id", () => {
      const entry = svc.storeEntry(makeEntry());
      expect(entry.id).toBeDefined();
      expect(entry.createdAt).toBeDefined();
      expect(svc.size).toBe(1);
    });

    it("uses provided id if given", () => {
      const entry = svc.storeEntry(makeEntry({ id: "custom-id" }));
      expect(entry.id).toBe("custom-id");
    });
  });

  describe("query", () => {
    it("returns entries ranked by cosine similarity", () => {
      svc.storeEntry(makeEntry({ embedding: [1, 0, 0], content: "A" }));
      svc.storeEntry(makeEntry({ embedding: [0, 1, 0], content: "B" }));
      const results = svc.query([1, 0, 0]);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].entry.content).toBe("A");
      expect(results[0].score).toBeCloseTo(1);
    });

    it("filters by domain", () => {
      svc.storeEntry(makeEntry({ domain: "fintech", embedding: [1, 0, 0] }));
      svc.storeEntry(makeEntry({ domain: "health", embedding: [1, 0, 0] }));
      const results = svc.query([1, 0, 0], { domain: "health" });
      expect(results).toHaveLength(1);
      expect(results[0].entry.domain).toBe("health");
    });

    it("filters by type", () => {
      svc.storeEntry(makeEntry({ type: "idea", embedding: [1, 0, 0] }));
      svc.storeEntry(makeEntry({ type: "insight", embedding: [1, 0, 0] }));
      const results = svc.query([1, 0, 0], { type: "insight" });
      expect(results).toHaveLength(1);
    });

    it("respects minQuality", () => {
      svc.storeEntry(makeEntry({ qualityScore: 3, embedding: [1, 0, 0] }));
      svc.storeEntry(makeEntry({ qualityScore: 8, embedding: [1, 0, 0] }));
      const results = svc.query([1, 0, 0], { minQuality: 5 });
      expect(results).toHaveLength(1);
      expect(results[0].entry.qualityScore).toBe(8);
    });

    it("returns empty for empty store", () => {
      expect(svc.query([1, 0, 0])).toHaveLength(0);
    });
  });

  describe("getEffectiveAngles", () => {
    it("returns angles ranked by average quality", () => {
      svc.storeEntry(makeEntry({ qualityScore: 9, metadata: { angleId: "a1" } }));
      svc.storeEntry(makeEntry({ qualityScore: 3, metadata: { angleId: "a2" } }));
      const result = svc.getEffectiveAngles("fintech");
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].angleId).toBe("a1");
      expect(result[0].averageQuality).toBe(9);
    });

    it("only considers idea and outcome types", () => {
      svc.storeEntry(makeEntry({ type: "insight", metadata: { angleId: "a1" } }));
      const result = svc.getEffectiveAngles();
      expect(result).toHaveLength(0);
    });

    it("returns empty for empty store", () => {
      expect(svc.getEffectiveAngles()).toHaveLength(0);
    });
  });

  describe("getBiasFrequency", () => {
    it("tracks angle usage frequency", () => {
      svc.recordAngleUsage("u1", "a1");
      svc.recordAngleUsage("u1", "a1");
      svc.recordAngleUsage("u1", "a2");
      const bias = svc.getBiasFrequency("u1");
      expect(bias).toHaveLength(2);
      expect(bias[0].angleId).toBe("a1");
      expect(bias[0].count).toBe(2);
      expect(bias[0].percentage).toBeCloseTo(66.67);
    });

    it("returns empty for unknown user", () => {
      expect(svc.getBiasFrequency("unknown")).toHaveLength(0);
    });
  });

  describe("getRecommendations", () => {
    it("returns recommendations structure", () => {
      const rec = svc.getRecommendations("fintech");
      expect(rec).toHaveProperty("suggestedAngles");
      expect(rec).toHaveProperty("pastInsights");
      expect(rec).toHaveProperty("avoidAngles");
    });

    it("suggests effective angles with sufficient samples", () => {
      for (let i = 0; i < 3; i++) {
        svc.storeEntry(makeEntry({ qualityScore: 8, metadata: { angleId: "good-angle" } }));
      }
      const rec = svc.getRecommendations("fintech");
      expect(rec.suggestedAngles.some((a) => a.angleId === "good-angle")).toBe(true);
    });

    it("identifies low-quality angles to avoid", () => {
      for (let i = 0; i < 4; i++) {
        svc.storeEntry(makeEntry({ qualityScore: 2, metadata: { angleId: "bad-angle" } }));
      }
      const rec = svc.getRecommendations("fintech");
      expect(rec.avoidAngles.some((a) => a.angleId === "bad-angle")).toBe(true);
    });

    it("includes high-quality past insights", () => {
      svc.storeEntry(makeEntry({ type: "insight", qualityScore: 9, content: "Great insight" }));
      const rec = svc.getRecommendations("fintech");
      expect(rec.pastInsights.length).toBeGreaterThanOrEqual(1);
      expect(rec.pastInsights[0].content).toBe("Great insight");
    });
  });

  describe("getMidSessionNudges", () => {
    it("suggests untried effective angles", () => {
      for (let i = 0; i < 3; i++) {
        svc.storeEntry(makeEntry({ qualityScore: 8, metadata: { angleId: "untried" } }));
      }
      const nudges = svc.getMidSessionNudges({
        sessionId: "s1",
        currentAngles: ["other"],
        domain: "fintech",
      });
      expect(nudges.some((n) => n.type === "try-angle" && n.relatedAngleId === "untried")).toBe(
        true
      );
    });

    it("includes revisit-insight nudges for high-quality insights", () => {
      svc.storeEntry(makeEntry({ type: "insight", qualityScore: 9 }));
      const nudges = svc.getMidSessionNudges({
        sessionId: "s1",
        currentAngles: [],
        domain: "fintech",
      });
      expect(nudges.some((n) => n.type === "revisit-insight")).toBe(true);
    });

    it("returns empty nudges for empty store", () => {
      const nudges = svc.getMidSessionNudges({
        sessionId: "s1",
        currentAngles: [],
        domain: "fintech",
      });
      expect(nudges).toHaveLength(0);
    });

    it("limits nudges to 5", () => {
      for (let i = 0; i < 20; i++) {
        svc.storeEntry(makeEntry({ qualityScore: 8, metadata: { angleId: `angle-${i}` } }));
        svc.storeEntry(makeEntry({ qualityScore: 8, metadata: { angleId: `angle-${i}` } }));
      }
      const nudges = svc.getMidSessionNudges({
        sessionId: "s1",
        currentAngles: [],
        domain: "fintech",
      });
      expect(nudges.length).toBeLessThanOrEqual(5);
    });
  });
});
