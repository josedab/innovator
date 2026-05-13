import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateEmbedding = vi.fn((text: string) => {
  const tokens = text.toLowerCase().split(/\s+/);
  const vec = new Array(10).fill(0);
  for (const t of tokens) {
    for (let i = 0; i < t.length; i++) {
      vec[i % 10] += t.charCodeAt(i) / 100;
    }
  }
  return vec;
});

const mockCosineSimilarity = vi.fn((a: number[], b: number[]) => {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
});

vi.mock("../../rag/embeddings.js", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...(args as [string])),
  cosineSimilarity: (...args: unknown[]) => mockCosineSimilarity(...(args as [number[], number[]])),
}));

import {
  checkHallucinatedStatistics,
  checkVaguePlatitudes,
  checkCrossAngleDuplication,
  checkSelfContradictions,
  runQualityGate,
  type QualityIssue,
} from "../index.js";

import type { InnovationIdea, AngleResult } from "../../types.js";

function makeIdea(overrides: Partial<InnovationIdea> = {}): InnovationIdea {
  return {
    title: "Test Idea",
    description: "A solid innovation concept",
    potentialImpact: "Significant improvement",
    implementationHint: "Start with a prototype",
    ...overrides,
  };
}

function makeAngleResult(
  angleId: string,
  ideas: InnovationIdea[],
  overrides: Partial<AngleResult> = {}
): AngleResult {
  return {
    angleId,
    angleName: angleId.toUpperCase(),
    ideas,
    reasoning: "Applied angle",
    ...overrides,
  };
}

describe("quality-gate", () => {
  // ---- checkHallucinatedStatistics ----

  describe("checkHallucinatedStatistics", () => {
    it("detects percentage-of pattern", () => {
      const idea = makeIdea({ description: "Studies show 75% of all users prefer this" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("hallucinated-statistic");
      expect(issues[0].severity).toBe("high");
    });

    it("detects 'studies show that' pattern", () => {
      const idea = makeIdea({ description: "Studies show that 95 percent adoption is expected" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects 'according to research' pattern", () => {
      const idea = makeIdea({
        potentialImpact: "According to recent research, 8 in 10 users agree",
      });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects approximate large numbers", () => {
      const idea = makeIdea({ description: "Approximately 500 billion devices connected" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects market size patterns", () => {
      const idea = makeIdea({ description: "The market size is $42 billion" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects suspiciously precise percentages", () => {
      const idea = makeIdea({ description: "This achieves 87.3% accuracy improvement" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("detects future predictions with specific %", () => {
      const idea = makeIdea({ description: "By 2030, 60% of companies will adopt this" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("returns empty for clean text", () => {
      const idea = makeIdea({ description: "This is a well-grounded suggestion" });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues).toHaveLength(0);
    });

    it("checks all text fields (description, potentialImpact, implementationHint)", () => {
      const idea = makeIdea({
        description: "Clean text",
        potentialImpact: "Clean text",
        implementationHint: "Market value of $10 billion is expected",
      });
      const issues = checkHallucinatedStatistics(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  // ---- checkVaguePlatitudes ----

  describe("checkVaguePlatitudes", () => {
    it("returns low severity for 1-2 platitudes", () => {
      const idea = makeIdea({
        description: "This is a cutting edge solution",
      });
      const issues = checkVaguePlatitudes(idea, "scamper");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("low");
      expect(issues[0].type).toBe("vague-platitude");
    });

    it("returns medium severity for 3+ platitudes", () => {
      const idea = makeIdea({
        title: "Leverage synergies for a paradigm shift",
        description: "This game changer will move the needle significantly",
        potentialImpact: "Best practices in the industry",
      });
      const issues = checkVaguePlatitudes(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
      const mediumIssues = issues.filter((i) => i.severity === "medium");
      expect(mediumIssues.length).toBeGreaterThan(0);
    });

    it("is case-insensitive", () => {
      const idea = makeIdea({
        description: "This is CUTTING EDGE technology",
      });
      const issues = checkVaguePlatitudes(idea, "scamper");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("returns empty for clean text", () => {
      const idea = makeIdea({
        title: "Database sharding for horizontal scale",
        description: "Split the user table across 4 nodes based on user_id modulo",
        potentialImpact: "Reduces p99 latency from 200ms to 50ms",
      });
      const issues = checkVaguePlatitudes(idea, "scamper");
      expect(issues).toHaveLength(0);
    });

    it("detects all known platitude phrases", () => {
      // Test a selection of platitude phrases from different categories
      const phrases = [
        "leverage synergies",
        "think outside the box",
        "paradigm shift",
        "low-hanging fruit",
        "move the needle",
        "value proposition",
        "world-class",
        "innovative solution",
        "holistic approach",
        "seamless integration",
        "actionable insights",
        "digital transformation",
        "scalable solution",
        "end-to-end",
        "mission-critical",
      ];

      for (const phrase of phrases) {
        const idea = makeIdea({ description: `This is a ${phrase} approach` });
        const issues = checkVaguePlatitudes(idea, "scamper");
        expect(issues.length, `Expected platitude detected for: "${phrase}"`).toBeGreaterThan(0);
      }
    });
  });

  // ---- checkCrossAngleDuplication ----

  describe("checkCrossAngleDuplication", () => {
    it("detects duplicates across different angles", () => {
      // Force high similarity
      mockCosineSimilarity.mockReturnValue(0.95);

      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({ title: "Build an API gateway", description: "API gateway for microservices" }),
        ]),
        makeAngleResult("first-principles", [
          makeIdea({ title: "Create API gateway", description: "Gateway for microservice APIs" }),
        ]),
      ];

      const issues = checkCrossAngleDuplication(results, 0.85);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("cross-angle-duplicate");
      expect(issues[0].severity).toBe("medium");
    });

    it("does not flag ideas within same angle", () => {
      mockCosineSimilarity.mockReturnValue(0.99);

      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({ title: "Idea A", description: "Same topic" }),
          makeIdea({ title: "Idea B", description: "Same topic" }),
        ]),
      ];

      const issues = checkCrossAngleDuplication(results, 0.85);
      expect(issues).toHaveLength(0);
    });

    it("does not flag below threshold", () => {
      mockCosineSimilarity.mockReturnValue(0.5);

      const results: AngleResult[] = [
        makeAngleResult("scamper", [makeIdea({ title: "A" })]),
        makeAngleResult("first-principles", [makeIdea({ title: "B" })]),
      ];

      const issues = checkCrossAngleDuplication(results, 0.85);
      expect(issues).toHaveLength(0);
    });

    it("handles empty angle results", () => {
      const issues = checkCrossAngleDuplication([], 0.85);
      expect(issues).toHaveLength(0);
    });
  });

  // ---- checkSelfContradictions ----

  describe("checkSelfContradictions", () => {
    it("detects opposing terms on similar topics", () => {
      mockCosineSimilarity.mockReturnValue(0.7);

      const result = makeAngleResult("scamper", [
        makeIdea({
          title: "Increase automation",
          description: "Automate all workflows to increase efficiency",
        }),
        makeIdea({
          title: "Decrease automation",
          description: "Reduce automation to decrease complexity",
        }),
      ]);

      const issues = checkSelfContradictions(result);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("self-contradiction");
    });

    it("detects centralize/decentralize contradiction", () => {
      mockCosineSimilarity.mockReturnValue(0.6);

      const result = makeAngleResult("scamper", [
        makeIdea({
          title: "Centralize data storage",
          description: "Put all data in a centralize store",
        }),
        makeIdea({
          title: "Decentralize data",
          description: "Use decentralize distributed storage",
        }),
      ]);

      const issues = checkSelfContradictions(result);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("does not flag when topics differ (low similarity)", () => {
      mockCosineSimilarity.mockReturnValue(0.1);

      const result = makeAngleResult("scamper", [
        makeIdea({
          title: "Increase speed",
          description: "Make the system faster to increase throughput",
        }),
        makeIdea({
          title: "Decrease cost",
          description: "Reduce infrastructure to decrease spending",
        }),
      ]);

      const issues = checkSelfContradictions(result);
      expect(issues).toHaveLength(0);
    });

    it("handles single-idea angle (no contradictions possible)", () => {
      const result = makeAngleResult("scamper", [makeIdea()]);
      const issues = checkSelfContradictions(result);
      expect(issues).toHaveLength(0);
    });

    it("handles empty ideas", () => {
      const result = makeAngleResult("scamper", []);
      const issues = checkSelfContradictions(result);
      expect(issues).toHaveLength(0);
    });
  });

  // ---- runQualityGate ----

  describe("runQualityGate", () => {
    beforeEach(async () => {
      mockCosineSimilarity.mockReturnValue(0.1); // Default: no duplicates
    });

    it("returns score 100 for clean ideas", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({
            title: "Clean Idea",
            description: "Specific and grounded suggestion",
            potentialImpact: "Reduces latency by optimizing query paths",
            implementationHint: "Refactor the data layer",
          }),
        ]),
      ];

      const report = runQualityGate(results);
      expect(report.overallScore).toBe(100);
      expect(report.issues).toHaveLength(0);
      expect(report.passesGate).toBe(true);
      expect(report.checkedIdeas).toBe(1);
      expect(report.summary).toContain("passed quality checks");
    });

    it("deducts 15 points per high-severity issue", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({ description: "Studies show that 90 percent improvement is expected" }),
        ]),
      ];

      const report = runQualityGate(results);
      const highIssues = report.issues.filter((i) => i.severity === "high");
      expect(highIssues.length).toBeGreaterThan(0);
      expect(report.overallScore).toBe(100 - highIssues.length * 15);
    });

    it("deducts 3 points per low-severity issue", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [makeIdea({ description: "This is a cutting edge approach" })]),
      ];

      const report = runQualityGate(results);
      const lowIssues = report.issues.filter((i) => i.severity === "low");
      expect(lowIssues.length).toBeGreaterThan(0);
      expect(report.overallScore).toBe(100 - lowIssues.length * 3);
    });

    it("score is clamped to 0 minimum", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({
            description:
              "Studies show that 90% of all users. Market value of $50 billion. By 2025, 80% adoption. Approximately 100 billion devices. According to research, 7 in 10 prefer. The 45.7% improvement. Studies show that 60 percent growth.",
          }),
        ]),
      ];

      const report = runQualityGate(results);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    });

    it("respects minScore config for passesGate", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({ description: "Studies show that 90 percent improvement" }),
        ]),
      ];

      const strict = runQualityGate(results, { minScore: 95 });
      expect(strict.passesGate).toBe(false);

      const lenient = runQualityGate(results, { minScore: 10 });
      expect(lenient.passesGate).toBe(true);
    });

    it("can disable individual checks", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({
            description: "Studies show that 90 percent improvement. This cutting edge approach.",
          }),
        ]),
      ];

      const withAll = runQualityGate(results);
      const withoutHallucinations = runQualityGate(results, { checkHallucinations: false });
      const withoutVagueness = runQualityGate(results, { checkVagueness: false });

      expect(withoutHallucinations.issues.length).toBeLessThan(withAll.issues.length);
      expect(withoutVagueness.issues.length).toBeLessThan(withAll.issues.length);
    });

    it("summary includes issue counts", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [
          makeIdea({ description: "Studies show that 90 percent improvement" }),
        ]),
      ];

      const report = runQualityGate(results);
      expect(report.summary).toContain("issue");
      expect(report.summary).toContain("high");
    });

    it("counts total ideas across multiple angles", () => {
      const results: AngleResult[] = [
        makeAngleResult("scamper", [makeIdea(), makeIdea()]),
        makeAngleResult("first-principles", [makeIdea()]),
      ];

      const report = runQualityGate(results);
      expect(report.checkedIdeas).toBe(3);
    });

    it("handles empty angle results", () => {
      const report = runQualityGate([]);
      expect(report.overallScore).toBe(100);
      expect(report.issues).toHaveLength(0);
      expect(report.checkedIdeas).toBe(0);
    });
  });
});
