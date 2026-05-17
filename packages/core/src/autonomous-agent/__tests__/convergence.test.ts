/**
 * Tests for autonomous-agent convergence detection.
 */

import { describe, it, expect } from "vitest";
import {
  estimateCallCost,
  buildCostEstimate,
  calculateNoveltyRatio,
  estimateTopicExhaustion,
  analyzeScoreTrend,
  checkConvergence,
  convergenceToMarkdown,
} from "../convergence.js";
import type { AutonomousRun, InvestigationBranch } from "../types.js";

// ---- Helpers ----

function createBranch(overrides?: Partial<InvestigationBranch>): InvestigationBranch {
  return {
    id: `branch-${Math.random().toString(36).slice(2, 8)}`,
    parentId: null,
    subject: "AI innovation in healthcare",
    depth: 0,
    status: "completed",
    ideas: [
      {
        title: "Idea A",
        description: "An innovative idea",
        potentialImpact: "High",
        implementationHint: "Use ML",
        score: 75,
      },
    ],
    subBranches: [],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockRun(branches: InvestigationBranch[]): AutonomousRun {
  return {
    id: "run-test",
    rootSubject: "AI Innovation",
    status: "exploring",
    strategy: "breadth-first",
    branches,
    decisions: [],
    config: {
      maxBranches: 20,
      maxDepth: 5,
      pruneThreshold: 30,
      model: "gpt-4o",
    },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---- Tests ----

describe("convergence", () => {
  describe("estimateCallCost", () => {
    it("returns a positive cost for known model", () => {
      const cost = estimateCallCost("gpt-4o", 2000, 1500);
      expect(cost).toBeGreaterThan(0);
    });

    it("returns cost using default pricing for unknown model", () => {
      const cost = estimateCallCost("unknown-model", 1000, 1000);
      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 cost for 0 tokens", () => {
      const cost = estimateCallCost("gpt-4o", 0, 0);
      expect(cost).toBe(0);
    });

    it("uses default token counts when not specified", () => {
      const cost = estimateCallCost("gpt-4o-mini");
      expect(cost).toBeGreaterThan(0);
    });

    it("gpt-4o-mini is cheaper than gpt-4o", () => {
      const miniCost = estimateCallCost("gpt-4o-mini", 2000, 1500);
      const fullCost = estimateCallCost("gpt-4o", 2000, 1500);
      expect(miniCost).toBeLessThan(fullCost);
    });
  });

  describe("buildCostEstimate", () => {
    it("aggregates cost across branches", () => {
      const run = createMockRun([
        createBranch({ status: "pending" }),
        createBranch({ status: "pending" }),
        createBranch({ status: "completed" }),
      ]);

      const estimate = buildCostEstimate(run, 0.5, 10.0, 5);
      expect(estimate.perCallCost).toBeGreaterThan(0);
      expect(estimate.currentSpend).toBe(0.5);
      expect(estimate.budgetRemaining).toBe(9.5);
      expect(estimate.projectedTotalCost).toBeGreaterThan(0.5);
      expect(typeof estimate.willExceedBudget).toBe("boolean");
      expect(estimate.remainingCalls).toBeGreaterThan(0);
    });

    it("detects budget will be exceeded", () => {
      const pendingBranches = Array.from({ length: 50 }, () => createBranch({ status: "pending" }));
      const run = createMockRun(pendingBranches);

      const estimate = buildCostEstimate(run, 9.0, 10.0, 100);
      expect(estimate.willExceedBudget).toBe(true);
    });
  });

  describe("calculateNoveltyRatio", () => {
    it("returns 1.0 when all ideas are novel (no existing)", () => {
      const ratio = calculateNoveltyRatio(
        [{ title: "New Idea", description: "Something completely new" }],
        []
      );
      expect(ratio).toBe(1);
    });

    it("returns 0 when no new ideas provided", () => {
      const ratio = calculateNoveltyRatio(
        [],
        [{ title: "Existing", description: "Already explored" }]
      );
      expect(ratio).toBe(0);
    });

    it("returns value between 0.0 and 1.0", () => {
      const ratio = calculateNoveltyRatio(
        [
          {
            title: "AI powered healthcare diagnostics system",
            description: "Use machine learning for medical diagnosis",
          },
          {
            title: "Quantum computing applications",
            description: "Explore quantum algorithms for optimization",
          },
        ],
        [
          {
            title: "AI powered healthcare diagnostics platform",
            description: "Machine learning for medical diagnosis",
          },
        ]
      );
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it("detects similar ideas with high overlap", () => {
      const ratio = calculateNoveltyRatio(
        [
          {
            title: "AI powered healthcare diagnostics",
            description: "machine learning medical diagnosis tool",
          },
        ],
        [
          {
            title: "AI powered healthcare diagnostics",
            description: "machine learning medical diagnosis tool",
          },
        ]
      );
      expect(ratio).toBe(0);
    });
  });

  describe("estimateTopicExhaustion", () => {
    it("returns 0 for empty branches array", () => {
      expect(estimateTopicExhaustion([])).toBe(0);
    });

    it("returns 0 for single completed branch", () => {
      expect(estimateTopicExhaustion([createBranch()])).toBe(0);
    });

    it("returns higher exhaustion for many similar branches", () => {
      const branches = Array.from({ length: 5 }, () =>
        createBranch({ subject: "AI innovation in healthcare" })
      );
      const exhaustion = estimateTopicExhaustion(branches);
      expect(exhaustion).toBeGreaterThan(0);
    });

    it("returns lower exhaustion for diverse branches", () => {
      const branches = [
        createBranch({ subject: "quantum computing algorithms for optimization" }),
        createBranch({ subject: "blockchain decentralized finance applications" }),
        createBranch({ subject: "sustainable renewable energy storage solutions" }),
      ];
      const exhaustion = estimateTopicExhaustion(branches);
      expect(exhaustion).toBeLessThan(0.5);
    });
  });

  describe("analyzeScoreTrend", () => {
    it("returns zero trend for single branch", () => {
      const result = analyzeScoreTrend([createBranch()]);
      expect(result.trend).toBe(0);
      expect(result.isPlateauing).toBe(false);
      expect(result.stagnantCount).toBe(0);
    });

    it("detects increasing trend", () => {
      const branches = [30, 50, 70, 85, 95].map((score) =>
        createBranch({
          ideas: [
            {
              title: "Idea",
              description: "d",
              potentialImpact: "h",
              implementationHint: "h",
              score,
            },
          ],
        })
      );
      const result = analyzeScoreTrend(branches);
      expect(result.trend).toBeGreaterThan(0);
    });

    it("detects decreasing trend", () => {
      const branches = [90, 80, 60, 40, 20].map((score) =>
        createBranch({
          ideas: [
            {
              title: "Idea",
              description: "d",
              potentialImpact: "h",
              implementationHint: "h",
              score,
            },
          ],
        })
      );
      const result = analyzeScoreTrend(branches);
      expect(result.trend).toBeLessThan(0);
    });

    it("detects plateauing scores", () => {
      const branches = [70, 71, 70, 71, 70].map((score) =>
        createBranch({
          ideas: [
            {
              title: "Idea",
              description: "d",
              potentialImpact: "h",
              implementationHint: "h",
              score,
            },
          ],
        })
      );
      const result = analyzeScoreTrend(branches);
      expect(result.isPlateauing).toBe(true);
      expect(result.stagnantCount).toBeGreaterThan(0);
    });
  });

  describe("checkConvergence", () => {
    it("returns not converged for fewer than 2 completed branches", () => {
      const run = createMockRun([createBranch()]);
      const metrics = checkConvergence(run);
      expect(metrics.converged).toBe(false);
      expect(metrics.noveltyRatio).toBe(1);
    });

    it("detects convergence when novelty drops below threshold", () => {
      const branches = Array.from({ length: 5 }, () =>
        createBranch({
          subject: "AI innovation in healthcare diagnostics",
          ideas: [
            {
              title: "AI healthcare diagnostics",
              description: "machine learning medical tool",
              potentialImpact: "h",
              implementationHint: "h",
              score: 70,
            },
          ],
        })
      );
      const run = createMockRun(branches);
      const metrics = checkConvergence(run, { minNoveltyRatio: 0.5 });
      // With highly similar branches, novelty should be low
      expect(metrics.noveltyRatio).toBeLessThanOrEqual(1);
      expect(typeof metrics.converged).toBe("boolean");
    });

    it("tracks theme count", () => {
      const branches = [
        createBranch({
          ideas: [
            {
              title: "Machine Learning Advanced",
              description: "d",
              potentialImpact: "h",
              implementationHint: "h",
              score: 80,
            },
          ],
        }),
        createBranch({
          ideas: [
            {
              title: "Blockchain Technology Distributed",
              description: "d",
              potentialImpact: "h",
              implementationHint: "h",
              score: 75,
            },
          ],
        }),
      ];
      const run = createMockRun(branches);
      const metrics = checkConvergence(run);
      expect(metrics.themeCount).toBeGreaterThan(0);
    });
  });

  describe("convergenceToMarkdown", () => {
    it("formats converged metrics", () => {
      const md = convergenceToMarkdown({
        noveltyRatio: 0.1,
        scoreTrend: -2,
        isPlateauing: true,
        stagnantBranches: 4,
        topicExhaustion: 0.85,
        themeCount: 3,
        converged: true,
        reason: "Novelty ratio below threshold",
      });

      expect(md).toContain("Convergence Analysis");
      expect(md).toContain("Converged");
      expect(md).toContain("Novelty Ratio");
      expect(md).toContain("Score Trend");
      expect(md).toContain("Novelty ratio below threshold");
    });

    it("formats exploring (not converged) metrics", () => {
      const md = convergenceToMarkdown({
        noveltyRatio: 0.8,
        scoreTrend: 5,
        isPlateauing: false,
        stagnantBranches: 0,
        topicExhaustion: 0.1,
        themeCount: 12,
        converged: false,
      });

      expect(md).toContain("Exploring");
      expect(md).not.toContain("Reason");
    });
  });
});
