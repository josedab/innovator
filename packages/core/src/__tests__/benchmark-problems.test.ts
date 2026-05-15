import { describe, it, expect, beforeEach } from "vitest";

import {
  BENCHMARK_PROBLEMS,
  getBenchmarkProblems,
  filterBenchmarkProblems,
  getBenchmarkProblem,
  recordBenchmarkResult,
  getBenchmarkResults,
  getAllBenchmarkResults,
  scoreBenchmarkRun,
  submitToLeaderboard,
  getLeaderboardEntries,
  benchmarkComparisonReport,
  clearBenchmarkState,
} from "../benchmark/problems.js";

describe("benchmark/problems", () => {
  beforeEach(() => {
    clearBenchmarkState();
  });

  describe("problem catalogue", () => {
    it("has 20 benchmark problems", () => {
      expect(BENCHMARK_PROBLEMS).toHaveLength(20);
    });

    it("covers all 5 domains", () => {
      const domains = new Set(BENCHMARK_PROBLEMS.map((p) => p.domain));
      expect(domains.size).toBe(5);
      expect(domains).toContain("technology");
      expect(domains).toContain("healthcare");
      expect(domains).toContain("sustainability");
      expect(domains).toContain("education");
      expect(domains).toContain("finance");
    });

    it("has 4 problems per domain", () => {
      const counts = new Map<string, number>();
      for (const p of BENCHMARK_PROBLEMS) {
        counts.set(p.domain, (counts.get(p.domain) ?? 0) + 1);
      }
      for (const [, count] of counts) {
        expect(count).toBe(4);
      }
    });

    it("each problem has rubrics", () => {
      for (const p of BENCHMARK_PROBLEMS) {
        expect(p.rubrics.length).toBeGreaterThanOrEqual(1);
        const totalWeight = p.rubrics.reduce((s, r) => s + r.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 1);
      }
    });

    it("each problem has valid IDs and tags", () => {
      const ids = new Set<string>();
      for (const p of BENCHMARK_PROBLEMS) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
        expect(p.tags.length).toBeGreaterThan(0);
        expect(p.subject.length).toBeGreaterThan(0);
      }
    });
  });

  describe("filtering", () => {
    it("filters by domain", () => {
      const tech = filterBenchmarkProblems({ domain: "technology" });
      expect(tech).toHaveLength(4);
    });

    it("filters by difficulty", () => {
      const hard = filterBenchmarkProblems({ difficulty: "hard" });
      expect(hard.length).toBeGreaterThan(0);
      expect(hard.every((p) => p.difficulty === "hard")).toBe(true);
    });

    it("filters by tags", () => {
      const ai = filterBenchmarkProblems({ tags: ["AI"] });
      expect(ai.length).toBeGreaterThan(0);
    });

    it("returns empty for non-matching filter", () => {
      expect(filterBenchmarkProblems({ tags: ["nonexistent-tag-xyz"] })).toHaveLength(0);
    });
  });

  describe("benchmark results", () => {
    it("records and retrieves results", () => {
      recordBenchmarkResult({
        problemId: "tech-01",
        model: "gpt-4",
        angles: ["scamper"],
        scores: { novelty: 8, feasibility: 7, impact: 9, specificity: 6 },
        overallScore: 7.5,
        ideaCount: 5,
        latencyMs: 1200,
        timestamp: new Date().toISOString(),
      });
      expect(getBenchmarkResults("tech-01")).toHaveLength(1);
      expect(getAllBenchmarkResults()).toHaveLength(1);
    });

    it("validates results on record", () => {
      expect(() =>
        recordBenchmarkResult({
          problemId: "tech-01",
          model: "gpt-4",
          angles: [],
          scores: {},
          overallScore: -1, // invalid
          ideaCount: 0,
          latencyMs: 0,
          timestamp: new Date().toISOString(),
        })
      ).toThrow();
    });
  });

  describe("scoring", () => {
    it("computes weighted scores", () => {
      const { overallScore, weightedScores } = scoreBenchmarkRun("tech-01", {
        novelty: 8,
        feasibility: 6,
        impact: 9,
        specificity: 7,
      });
      expect(overallScore).toBe(7.5);
      expect(weightedScores["novelty"]).toBe(2);
      expect(weightedScores["feasibility"]).toBe(1.5);
    });

    it("throws for unknown problem", () => {
      expect(() => scoreBenchmarkRun("nonexistent", {})).toThrow();
    });
  });

  describe("leaderboard", () => {
    it("submits and ranks entries", () => {
      const results = [
        {
          problemId: "tech-01",
          model: "gpt-4",
          angles: [],
          scores: {},
          overallScore: 8,
          ideaCount: 5,
          latencyMs: 1000,
          timestamp: new Date().toISOString(),
        },
        {
          problemId: "tech-02",
          model: "gpt-4",
          angles: [],
          scores: {},
          overallScore: 7,
          ideaCount: 4,
          latencyMs: 1100,
          timestamp: new Date().toISOString(),
        },
      ];
      for (const r of results) recordBenchmarkResult(r);

      const entry = submitToLeaderboard("gpt-4", "default angles", results);
      expect(entry.rank).toBe(1);
      expect(entry.averageScore).toBe(7.5);
      expect(entry.problemsCompleted).toBe(2);
    });

    it("ranks multiple models correctly", () => {
      const r1 = {
        problemId: "tech-01",
        model: "gpt-4",
        angles: [],
        scores: {},
        overallScore: 9,
        ideaCount: 5,
        latencyMs: 1000,
        timestamp: new Date().toISOString(),
      };
      const r2 = {
        problemId: "tech-01",
        model: "gpt-3.5",
        angles: [],
        scores: {},
        overallScore: 6,
        ideaCount: 3,
        latencyMs: 800,
        timestamp: new Date().toISOString(),
      };
      recordBenchmarkResult(r1);
      recordBenchmarkResult(r2);

      submitToLeaderboard("gpt-4", "default", [r1]);
      submitToLeaderboard("gpt-3.5", "default", [r2]);

      const lb = getLeaderboardEntries();
      expect(lb[0].model).toBe("gpt-4");
      expect(lb[0].rank).toBe(1);
      expect(lb[1].model).toBe("gpt-3.5");
      expect(lb[1].rank).toBe(2);
    });
  });

  describe("comparison report", () => {
    it("generates markdown report", () => {
      const results = [
        {
          problemId: "tech-01",
          model: "gpt-4",
          angles: [],
          scores: {},
          overallScore: 8,
          ideaCount: 5,
          latencyMs: 1000,
          timestamp: new Date().toISOString(),
        },
        {
          problemId: "tech-01",
          model: "claude",
          angles: [],
          scores: {},
          overallScore: 7,
          ideaCount: 4,
          latencyMs: 900,
          timestamp: new Date().toISOString(),
        },
      ];
      const md = benchmarkComparisonReport(results);
      expect(md).toContain("Benchmark Comparison");
      expect(md).toContain("gpt-4");
      expect(md).toContain("claude");
    });
  });
});
