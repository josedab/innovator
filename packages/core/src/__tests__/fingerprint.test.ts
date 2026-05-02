import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  cosineSimilarity,
  findSimilar,
  searchFingerprints,
  storeFingerprint,
  getFingerprint,
  listFingerprints,
  clearFingerprints,
  fingerprintDistance,
} from "../fingerprint/index.js";

function makeFingerprint(overrides: Partial<IdeaFingerprint> = {}): IdeaFingerprint {
  return {
    ideaTitle: "Test Idea",
    hash: "abc12345",
    noveltyVector: {
      technicalNovelty: 0.8,
      marketNovelty: 0.6,
      processNovelty: 0.4,
      conceptualNovelty: 0.9,
    },
    domainBlend: {
      primaryDomain: "technology",
      secondaryDomains: ["healthcare"],
      blendScore: 0.7,
    },
    constraintProfile: {
      technicalConstraints: ["requires GPU"],
      resourceConstraints: ["needs team of 5"],
      regulatoryConstraints: [],
      constraintSeverity: 0.3,
    },
    feasibilitySignature: {
      technicalReadiness: 0.8,
      marketReadiness: 0.6,
      resourceAvailability: 0.7,
      timeToValue: "medium-term",
    },
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    tags: ["ai", "healthcare"],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("fingerprint", () => {
  beforeEach(() => {
    clearFingerprints();
  });

  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it("returns 0 for empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("handles vectors of different lengths", () => {
      const result = cosineSimilarity([1, 2, 3], [1, 2]);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe("store operations", () => {
    it("stores and retrieves a fingerprint", () => {
      const fp = makeFingerprint();
      storeFingerprint(fp);
      expect(getFingerprint("abc12345")).toEqual(fp);
    });

    it("lists all stored fingerprints", () => {
      storeFingerprint(makeFingerprint({ hash: "hash1" }));
      storeFingerprint(makeFingerprint({ hash: "hash2" }));
      expect(listFingerprints()).toHaveLength(2);
    });

    it("clears all fingerprints", () => {
      storeFingerprint(makeFingerprint());
      clearFingerprints();
      expect(listFingerprints()).toHaveLength(0);
    });
  });

  describe("findSimilar", () => {
    it("finds similar fingerprints above threshold", () => {
      const fp1 = makeFingerprint({ hash: "h1", embedding: [1, 0, 0] });
      const fp2 = makeFingerprint({ hash: "h2", embedding: [0.9, 0.1, 0] });
      const fp3 = makeFingerprint({ hash: "h3", embedding: [0, 1, 0] });
      storeFingerprint(fp1);
      storeFingerprint(fp2);
      storeFingerprint(fp3);

      const matches = findSimilar(fp1, 0.8);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].fingerprint.hash).toBe("h2");
    });

    it("throws for invalid threshold", () => {
      expect(() => findSimilar(makeFingerprint(), 1.5)).toThrow(
        "Threshold must be between 0 and 1"
      );
    });

    it("respects maxResults", () => {
      for (let i = 0; i < 20; i++) {
        storeFingerprint(makeFingerprint({ hash: `h${i}`, embedding: [1, 0, 0] }));
      }
      const fp = makeFingerprint({ hash: "query", embedding: [1, 0, 0] });
      const matches = findSimilar(fp, 0.5, 5);
      expect(matches.length).toBeLessThanOrEqual(5);
    });
  });

  describe("searchFingerprints", () => {
    it("searches by tags", () => {
      storeFingerprint(makeFingerprint({ hash: "h1", tags: ["ai", "ml"] }));
      storeFingerprint(makeFingerprint({ hash: "h2", tags: ["fintech"] }));

      const results = searchFingerprints({ tags: ["ai"] });
      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe("h1");
    });

    it("searches by domain", () => {
      storeFingerprint(makeFingerprint({ hash: "h1" }));
      const results = searchFingerprints({ domain: "technology" });
      expect(results).toHaveLength(1);
    });

    it("filters by minimum novelty", () => {
      storeFingerprint(
        makeFingerprint({
          hash: "h1",
          noveltyVector: {
            technicalNovelty: 0.9,
            marketNovelty: 0.9,
            processNovelty: 0.9,
            conceptualNovelty: 0.9,
          },
        })
      );
      storeFingerprint(
        makeFingerprint({
          hash: "h2",
          noveltyVector: {
            technicalNovelty: 0.1,
            marketNovelty: 0.1,
            processNovelty: 0.1,
            conceptualNovelty: 0.1,
          },
        })
      );

      const results = searchFingerprints({ minNovelty: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe("h1");
    });
  });

  describe("fingerprintDistance", () => {
    it("returns 1 for identical fingerprints", () => {
      const fp = makeFingerprint();
      const dist = fingerprintDistance(fp, fp);
      expect(dist).toBeCloseTo(1, 1);
    });

    it("returns lower value for dissimilar fingerprints", () => {
      const fp1 = makeFingerprint({ embedding: [1, 0, 0] });
      const fp2 = makeFingerprint({
        embedding: [0, 1, 0],
        noveltyVector: {
          technicalNovelty: 0.1,
          marketNovelty: 0.1,
          processNovelty: 0.1,
          conceptualNovelty: 0.1,
        },
      });
      const dist = fingerprintDistance(fp1, fp2);
      expect(dist).toBeLessThan(1);
    });
  });
});
