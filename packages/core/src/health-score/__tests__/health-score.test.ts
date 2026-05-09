import { describe, it, expect } from "vitest";
import { computeHealthScore } from "../scorer.js";
import { HEALTH_AXES } from "../types.js";
import type { HealthScoreInput } from "../types.js";

describe("health-score", () => {
  describe("HEALTH_AXES", () => {
    it("defines exactly 6 axes", () => {
      expect(HEALTH_AXES).toHaveLength(6);
    });

    it("includes all expected axes", () => {
      expect(HEALTH_AXES).toContain("architectural-flexibility");
      expect(HEALTH_AXES).toContain("dependency-freshness");
      expect(HEALTH_AXES).toContain("test-coverage");
      expect(HEALTH_AXES).toContain("documentation-completeness");
      expect(HEALTH_AXES).toContain("community-activity");
      expect(HEALTH_AXES).toContain("innovation-velocity");
    });
  });

  describe("computeHealthScore", () => {
    it("returns a score between 0 and 100", () => {
      const result = computeHealthScore({});
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    });

    it("returns all 6 axis scores", () => {
      const result = computeHealthScore({});
      expect(result.axes).toHaveLength(6);
      for (const axis of result.axes) {
        expect(axis.score).toBeGreaterThanOrEqual(0);
        expect(axis.score).toBeLessThanOrEqual(100);
        expect(axis.label).toBeDefined();
        expect(axis.details).toBeDefined();
      }
    });

    it("provides summary text", () => {
      const result = computeHealthScore({});
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it("identifies strengths and weaknesses", () => {
      const result = computeHealthScore({
        fileCount: 100,
        testFileCount: 50,
        docFileCount: 10,
      });
      expect(result.topStrengths).toBeDefined();
      expect(result.topWeaknesses).toBeDefined();
      expect(result.topStrengths.length).toBeLessThanOrEqual(2);
      expect(result.topWeaknesses.length).toBeLessThanOrEqual(2);
    });

    it("generates improvement ideas for low scores", () => {
      const result = computeHealthScore({
        fileCount: 100,
        testFileCount: 1,
        docFileCount: 0,
      });
      expect(result.improvementIdeas.length).toBeGreaterThan(0);
    });

    it("rewards high test coverage", () => {
      const highCoverage = computeHealthScore({ fileCount: 100, testFileCount: 50 });
      const lowCoverage = computeHealthScore({ fileCount: 100, testFileCount: 2 });
      const highTestAxis = highCoverage.axes.find((a) => a.axis === "test-coverage");
      const lowTestAxis = lowCoverage.axes.find((a) => a.axis === "test-coverage");
      expect(highTestAxis!.score).toBeGreaterThan(lowTestAxis!.score);
    });

    it("penalizes anti-patterns in architecture", () => {
      const clean = computeHealthScore({ patterns: [] });
      const messy = computeHealthScore({
        patterns: [
          { type: "anti-pattern", severity: "high", name: "God class" },
          { type: "anti-pattern", severity: "high", name: "Circular dependency" },
        ],
      });
      const cleanArch = clean.axes.find((a) => a.axis === "architectural-flexibility");
      const messyArch = messy.axes.find((a) => a.axis === "architectural-flexibility");
      expect(cleanArch!.score).toBeGreaterThan(messyArch!.score);
    });

    it("scores higher with more layers", () => {
      const fewLayers = computeHealthScore({ layers: [{ name: "src", fileCount: 50 }] });
      const manyLayers = computeHealthScore({
        layers: [
          { name: "domain", fileCount: 20 },
          { name: "infrastructure", fileCount: 15 },
          { name: "presentation", fileCount: 15 },
          { name: "api", fileCount: 10 },
        ],
      });
      const fewArch = fewLayers.axes.find((a) => a.axis === "architectural-flexibility");
      const manyArch = manyLayers.axes.find((a) => a.axis === "architectural-flexibility");
      expect(manyArch!.score).toBeGreaterThan(fewArch!.score);
    });

    it("rewards recent community activity", () => {
      const active = computeHealthScore({
        commitCount: 200,
        contributorCount: 8,
        lastCommitDate: new Date().toISOString(),
      });
      const stale = computeHealthScore({
        commitCount: 5,
        contributorCount: 1,
        lastCommitDate: new Date(Date.now() - 365 * 86_400_000).toISOString(),
      });
      const activeScore = active.axes.find((a) => a.axis === "community-activity");
      const staleScore = stale.axes.find((a) => a.axis === "community-activity");
      expect(activeScore!.score).toBeGreaterThan(staleScore!.score);
    });

    it("penalizes many dependencies", () => {
      const lean = computeHealthScore({
        dependencies: Array.from({ length: 10 }, (_, i) => ({
          name: `dep-${i}`,
          type: "production",
        })),
      });
      const bloated = computeHealthScore({
        dependencies: Array.from({ length: 60 }, (_, i) => ({
          name: `dep-${i}`,
          type: "production",
        })),
      });
      const leanDep = lean.axes.find((a) => a.axis === "dependency-freshness");
      const bloatedDep = bloated.axes.find((a) => a.axis === "dependency-freshness");
      expect(leanDep!.score).toBeGreaterThan(bloatedDep!.score);
    });

    it("includes analyzedAt timestamp", () => {
      const result = computeHealthScore({});
      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt).getTime()).toBeGreaterThan(0);
    });
  });
});
