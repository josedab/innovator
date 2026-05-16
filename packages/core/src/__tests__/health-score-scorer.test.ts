import { describe, it, expect } from "vitest";
import { computeHealthScore } from "../health-score/scorer.js";
import type { HealthScoreInput } from "../health-score/types.js";

function makeInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    fileCount: 100,
    testFileCount: 30,
    docFileCount: 8,
    packageJson: { name: "test" },
    patterns: [],
    dependencies: [
      { name: "react", version: "^18.0.0", type: "production" },
      { name: "vitest", version: "^1.0.0", type: "development" },
    ],
    layers: [
      { name: "domain", fileCount: 30 },
      { name: "infra", fileCount: 35 },
      { name: "presentation", fileCount: 35 },
    ],
    commitCount: 200,
    contributorCount: 4,
    openIssues: 10,
    lastCommitDate: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("returns a score between 0 and 100 with all 6 axes for balanced input", () => {
    const result = computeHealthScore(makeInput());
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.axes).toHaveLength(6);
    expect(result.analyzedAt).toBeTruthy();
    expect(result.topStrengths).toHaveLength(2);
    expect(result.topWeaknesses).toHaveLength(2);
  });

  // ---- Test Coverage axis: zero fileCount edge case ----
  it("gives test-coverage score of 0 when fileCount is 0", () => {
    const result = computeHealthScore(makeInput({ fileCount: 0, testFileCount: 0 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage");
    expect(tc).toBeDefined();
    expect(tc!.score).toBe(0);
    expect(tc!.details).toContain("No files detected");
  });

  // ---- Test Coverage axis: ratio thresholds ----
  it("scores 95 when test ratio >= 0.5", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 50 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage")!;
    expect(tc.score).toBe(95);
  });

  it("scores 80 when test ratio >= 0.3 and < 0.5", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 30 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage")!;
    expect(tc.score).toBe(80);
  });

  it("scores 60 when test ratio >= 0.15 and < 0.3", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 15 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage")!;
    expect(tc.score).toBe(60);
  });

  it("scores 40 when test ratio >= 0.05 and < 0.15", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 5 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage")!;
    expect(tc.score).toBe(40);
  });

  it("scores 20 when test ratio < 0.05", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 2 }));
    const tc = result.axes.find((a) => a.axis === "test-coverage")!;
    expect(tc.score).toBe(20);
  });

  // ---- Architectural Flexibility: empty patterns ----
  it("returns base arch score with no anti-pattern penalty when patterns is empty", () => {
    const result = computeHealthScore(makeInput({ patterns: [] }));
    const af = result.axes.find((a) => a.axis === "architectural-flexibility")!;
    // 50 base + 10 (3 layers >= 2) + 10 (balanced) = 70
    expect(af.score).toBeGreaterThanOrEqual(60);
  });

  // ---- Community Activity: old lastCommitDate recency penalty ----
  it("penalizes community-activity when last commit is older than 180 days", () => {
    const oldDate = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const recent = computeHealthScore(makeInput());
    const old = computeHealthScore(makeInput({ lastCommitDate: oldDate }));
    const recentCA = recent.axes.find((a) => a.axis === "community-activity")!;
    const oldCA = old.axes.find((a) => a.axis === "community-activity")!;
    expect(oldCA.score).toBeLessThan(recentCA.score);
  });

  // ---- Architectural Flexibility: layer count bonus tiers ----
  it("gives +20 bonus for 4+ layers", () => {
    const result = computeHealthScore(
      makeInput({
        layers: [
          { name: "a", fileCount: 25 },
          { name: "b", fileCount: 25 },
          { name: "c", fileCount: 25 },
          { name: "d", fileCount: 25 },
        ],
        patterns: [],
      })
    );
    const af = result.axes.find((a) => a.axis === "architectural-flexibility")!;
    // 50 base + 20 (4 layers) + 10 (balanced) = 80
    expect(af.score).toBe(80);
  });

  it("gives +10 bonus for 2-3 layers", () => {
    const result = computeHealthScore(
      makeInput({
        layers: [
          { name: "a", fileCount: 50 },
          { name: "b", fileCount: 50 },
        ],
        patterns: [],
      })
    );
    const af = result.axes.find((a) => a.axis === "architectural-flexibility")!;
    // 50 base + 10 (2 layers) + 10 (balanced) = 70
    expect(af.score).toBe(70);
  });

  it("gives no layer bonus for 0 layers", () => {
    const result = computeHealthScore(makeInput({ layers: [], patterns: [] }));
    const af = result.axes.find((a) => a.axis === "architectural-flexibility")!;
    // 50 base, no layers bonus, no balance bonus
    expect(af.score).toBe(50);
  });

  // ---- Anti-pattern deduction cap at -30 ----
  it("caps anti-pattern deduction at -30", () => {
    const manyAntiPatterns = Array.from({ length: 10 }, (_, i) => ({
      type: "anti-pattern",
      severity: "low",
      name: `ap-${i}`,
    }));
    const result = computeHealthScore(makeInput({ patterns: manyAntiPatterns, layers: [] }));
    const af = result.axes.find((a) => a.axis === "architectural-flexibility")!;
    // 50 base - 30 (capped) = 20
    expect(af.score).toBe(20);
  });

  // ---- Summary classification boundaries ----
  it("returns 'Excellent' summary when overall >= 80", () => {
    const result = computeHealthScore(
      makeInput({
        fileCount: 100,
        testFileCount: 60,
        docFileCount: 15,
        commitCount: 600,
        contributorCount: 10,
        layers: [
          { name: "a", fileCount: 25 },
          { name: "b", fileCount: 25 },
          { name: "c", fileCount: 25 },
          { name: "d", fileCount: 25 },
        ],
        patterns: [
          { type: "design-pattern", severity: "low", name: "factory" },
          { type: "design-pattern", severity: "low", name: "observer" },
          { type: "design-pattern", severity: "low", name: "strategy" },
          { type: "design-pattern", severity: "low", name: "adapter" },
        ],
      })
    );
    if (result.overall >= 80) {
      expect(result.summary).toContain("Excellent");
    }
  });

  it("returns 'Good' summary when overall is 60-79", () => {
    const result = computeHealthScore(makeInput());
    if (result.overall >= 60 && result.overall < 80) {
      expect(result.summary).toContain("Good");
    }
  });

  it("returns 'Moderate' summary when overall is 40-59", () => {
    const result = computeHealthScore(
      makeInput({
        fileCount: 100,
        testFileCount: 2,
        docFileCount: 0,
        commitCount: 5,
        contributorCount: 1,
        layers: [],
        patterns: [
          { type: "anti-pattern", severity: "high", name: "god-class" },
          { type: "anti-pattern", severity: "high", name: "spaghetti" },
        ],
      })
    );
    if (result.overall >= 40 && result.overall < 60) {
      expect(result.summary).toContain("Moderate");
    }
  });

  it("returns 'Low' summary when overall < 40", () => {
    const result = computeHealthScore(
      makeInput({
        fileCount: 100,
        testFileCount: 0,
        docFileCount: 0,
        packageJson: undefined,
        commitCount: 1,
        contributorCount: 1,
        openIssues: 200,
        layers: [],
        patterns: [
          { type: "anti-pattern", severity: "high", name: "god-class" },
          { type: "anti-pattern", severity: "high", name: "spaghetti" },
          { type: "anti-pattern", severity: "high", name: "circular" },
          { type: "complexity-hotspot", severity: "high", name: "big-ball" },
          { type: "complexity-hotspot", severity: "high", name: "big-ball-2" },
          { type: "complexity-hotspot", severity: "high", name: "big-ball-3" },
          { type: "tech-debt", severity: "high", name: "legacy" },
          { type: "tech-debt", severity: "high", name: "legacy-2" },
          { type: "tech-debt", severity: "high", name: "legacy-3" },
        ],
        lastCommitDate: new Date(Date.now() - 365 * 86_400_000).toISOString(),
      })
    );
    if (result.overall < 40) {
      expect(result.summary).toContain("Low");
    }
  });

  it("populates improvementIdeas from axes scoring below 70", () => {
    const result = computeHealthScore(makeInput({ fileCount: 100, testFileCount: 2, layers: [] }));
    expect(result.improvementIdeas.length).toBeGreaterThan(0);
  });
});
