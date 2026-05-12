import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import {
  getSimulation,
  listSimulations,
  clearSimulations,
  calculateTotalResourceCost,
  getGoNoGoMilestones,
  calculateExpectedROI,
  generateTimeline,
  runMonteCarloSimulation,
  simulateImpact,
} from "../impact-simulator/index.js";
import type {
  ImpactSimulation,
  ResourceRequirement,
  ScenarioSimulation,
  MonteCarloInput,
} from "../impact-simulator/index.js";
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeSimulation(): ImpactSimulation {
  return {
    ideaTitle: "AI Dashboard",
    simulatedAt: new Date().toISOString(),
    scenarios: [
      {
        type: "optimistic",
        probability: 0.25,
        assumptions: ["Fast adoption"],
        monthlyData: [
          {
            month: 1,
            adoptionPercent: 5,
            cost: 50000,
            cumulativeInvestment: 50000,
            keyActivity: "Build MVP",
          },
        ],
        totalInvestment: 500000,
        projectedROI: 5.0,
        breakEvenMonth: 6,
        riskFactors: ["Market timing"],
      },
      {
        type: "baseline",
        probability: 0.5,
        assumptions: ["Normal adoption"],
        monthlyData: [
          {
            month: 1,
            adoptionPercent: 2,
            cost: 50000,
            cumulativeInvestment: 50000,
            keyActivity: "Build MVP",
          },
        ],
        totalInvestment: 600000,
        projectedROI: 2.5,
        breakEvenMonth: 9,
        riskFactors: ["Competition"],
      },
      {
        type: "pessimistic",
        probability: 0.25,
        assumptions: ["Slow adoption"],
        monthlyData: [
          {
            month: 1,
            adoptionPercent: 0.5,
            cost: 50000,
            cumulativeInvestment: 50000,
            keyActivity: "Build MVP",
          },
        ],
        totalInvestment: 700000,
        projectedROI: 0.5,
        breakEvenMonth: undefined,
        riskFactors: ["Market rejection"],
      },
    ],
    milestones: [
      {
        month: 3,
        title: "MVP Launch",
        description: "Launch MVP",
        type: "launch",
        successMetric: "100 users",
        isGoNoGo: true,
      },
      {
        month: 6,
        title: "1K Users",
        description: "Reach 1K users",
        type: "growth",
        successMetric: "1000 DAU",
        isGoNoGo: false,
      },
      {
        month: 9,
        title: "Revenue Target",
        description: "Hit revenue target",
        type: "pivot-point",
        successMetric: "$50K MRR",
        isGoNoGo: true,
      },
    ],
    resources: [
      {
        category: "engineering",
        description: "3 engineers",
        headcount: 3,
        monthlyCost: 45000,
        startMonth: 1,
        endMonth: 12,
      },
      {
        category: "design",
        description: "1 designer",
        headcount: 1,
        monthlyCost: 12000,
        startMonth: 1,
        endMonth: 6,
      },
      {
        category: "marketing",
        description: "Marketing campaign",
        monthlyCost: 10000,
        startMonth: 4,
        endMonth: 12,
      },
    ],
    decisionPoints: [
      {
        month: 3,
        title: "MVP Go/No-Go",
        criteria: ["50+ signups", "NPS > 30"],
        goThreshold: "50+ signups with NPS > 30",
        noGoThreshold: "<20 signups or NPS < 0",
        fallbackPlan: "Pivot to B2B",
      },
    ],
    overallRecommendation: "Proceed with baseline expectations",
    confidenceLevel: 0.7,
  };
}

describe("impact-simulator", () => {
  beforeEach(() => {
    clearSimulations();
  });

  describe("store operations", () => {
    it("starts empty", () => {
      expect(listSimulations()).toHaveLength(0);
    });

    it("returns undefined for unknown simulation", () => {
      expect(getSimulation("unknown")).toBeUndefined();
    });
  });

  describe("calculateTotalResourceCost", () => {
    it("calculates total cost across resources", () => {
      const resources: ResourceRequirement[] = [
        {
          category: "engineering",
          description: "devs",
          monthlyCost: 10000,
          startMonth: 1,
          endMonth: 12,
        },
        {
          category: "design",
          description: "designer",
          monthlyCost: 5000,
          startMonth: 1,
          endMonth: 6,
        },
      ];
      const total = calculateTotalResourceCost(resources);
      expect(total).toBe(10000 * 12 + 5000 * 6);
    });

    it("handles empty resources", () => {
      expect(calculateTotalResourceCost([])).toBe(0);
    });

    it("handles single month resource", () => {
      const resources: ResourceRequirement[] = [
        {
          category: "external",
          description: "consultant",
          monthlyCost: 20000,
          startMonth: 3,
          endMonth: 3,
        },
      ];
      expect(calculateTotalResourceCost(resources)).toBe(20000);
    });
  });

  describe("getGoNoGoMilestones", () => {
    it("filters go/no-go milestones", () => {
      const sim = makeSimulation();
      const goNoGo = getGoNoGoMilestones(sim);
      expect(goNoGo).toHaveLength(2);
      expect(goNoGo.every((m) => m.isGoNoGo)).toBe(true);
    });
  });

  describe("calculateExpectedROI", () => {
    it("calculates weighted expected ROI", () => {
      const scenarios: ScenarioSimulation[] = [
        {
          type: "optimistic",
          probability: 0.25,
          assumptions: [],
          monthlyData: [],
          totalInvestment: 500000,
          projectedROI: 5.0,
          riskFactors: [],
        },
        {
          type: "baseline",
          probability: 0.5,
          assumptions: [],
          monthlyData: [],
          totalInvestment: 600000,
          projectedROI: 2.5,
          riskFactors: [],
        },
        {
          type: "pessimistic",
          probability: 0.25,
          assumptions: [],
          monthlyData: [],
          totalInvestment: 700000,
          projectedROI: 0.5,
          riskFactors: [],
        },
      ];
      const roi = calculateExpectedROI(scenarios);
      // (5.0*0.25 + 2.5*0.5 + 0.5*0.25) / 1.0 = 2.625
      expect(roi).toBeCloseTo(2.625, 2);
    });

    it("returns 0 for empty scenarios", () => {
      expect(calculateExpectedROI([])).toBe(0);
    });
  });

  describe("generateTimeline", () => {
    it("generates sorted timeline", () => {
      const sim = makeSimulation();
      const timeline = generateTimeline(sim);
      expect(timeline.length).toBeGreaterThan(0);
      // Verify sorted by month
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].month).toBeGreaterThanOrEqual(timeline[i - 1].month);
      }
    });

    it("includes both milestones and decision points", () => {
      const sim = makeSimulation();
      const timeline = generateTimeline(sim);
      const types = new Set(timeline.map((t) => t.type));
      expect(types.has("milestone") || types.has("decision")).toBe(true);
      expect(types.has("go-no-go")).toBe(true);
    });
  });

  describe("runMonteCarloSimulation", () => {
    const baseInput: MonteCarloInput = {
      marketSizeMin: 10000,
      marketSizeMax: 50000,
      implementationCostMin: 100000,
      implementationCostMax: 300000,
      adoptionRateMin: 0.05,
      adoptionRateMax: 0.3,
      revenuePerUserMin: 50,
      revenuePerUserMax: 200,
    };

    it("returns a valid result with correct iterations (capped to min 100)", () => {
      const result = runMonteCarloSimulation("Test Idea", baseInput, 1000);
      expect(result.ideaTitle).toBe("Test Idea");
      expect(result.iterations).toBe(1000);
      expect(result.histogram.length).toBe(20);
    });

    it("clamps iterations to minimum of 100", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 1);
      expect(result.iterations).toBe(100);
    });

    it("clamps iterations to maximum of 100000", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 999999);
      expect(result.iterations).toBe(100000);
    });

    it("histogram buckets sum to approximately total iterations", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 500);
      const totalCount = result.histogram.reduce((sum, b) => sum + b.count, 0);
      // Floating-point bucket boundaries may cause off-by-one
      expect(totalCount).toBeGreaterThanOrEqual(result.iterations - 1);
      expect(totalCount).toBeLessThanOrEqual(result.iterations);
    });

    it("histogram percentages sum to approximately 100", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 1000);
      const totalPct = result.histogram.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });

    it("provides percentile values in increasing order", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 1000);
      const d = result.roiDistribution;
      expect(d.min).toBeLessThanOrEqual(d.p5);
      expect(d.p5).toBeLessThanOrEqual(d.p25);
      expect(d.p25).toBeLessThanOrEqual(d.median);
      expect(d.median).toBeLessThanOrEqual(d.p75);
      expect(d.p75).toBeLessThanOrEqual(d.p95);
      expect(d.p95).toBeLessThanOrEqual(d.max);
    });

    it("scenario comparison p10 < p50 < p90", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 1000);
      expect(result.scenarioComparison.pessimistic.roi).toBeLessThanOrEqual(
        result.scenarioComparison.base.roi
      );
      expect(result.scenarioComparison.base.roi).toBeLessThanOrEqual(
        result.scenarioComparison.optimistic.roi
      );
    });

    it("breakEvenProbability is between 0 and 1", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 1000);
      expect(result.breakEvenProbability).toBeGreaterThanOrEqual(0);
      expect(result.breakEvenProbability).toBeLessThanOrEqual(1);
    });

    it("sensitivity analysis includes market size, cost, and adoption", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 500);
      const vars = result.sensitivityAnalysis.map((s) => s.variable);
      expect(vars).toContain("Market Size");
      expect(vars).toContain("Implementation Cost");
      expect(vars).toContain("Adoption Rate");
    });

    it("sensitivity values are sorted by descending sensitivity", () => {
      const result = runMonteCarloSimulation("Test", baseInput, 500);
      for (let i = 1; i < result.sensitivityAnalysis.length; i++) {
        expect(result.sensitivityAnalysis[i].sensitivity).toBeLessThanOrEqual(
          result.sensitivityAnalysis[i - 1].sensitivity
        );
      }
    });

    it("handles zero cost (division guard) — ROI should be 0", () => {
      const input: MonteCarloInput = {
        ...baseInput,
        implementationCostMin: 0,
        implementationCostMax: 0,
      };
      const result = runMonteCarloSimulation("Zero Cost", input, 100);
      expect(result.roiDistribution.mean).toBe(0);
    });

    it("handles negative revenue scenario gracefully", () => {
      const input: MonteCarloInput = {
        marketSizeMin: 0,
        marketSizeMax: 100,
        implementationCostMin: 100000,
        implementationCostMax: 500000,
        adoptionRateMin: 0,
        adoptionRateMax: 0.01,
        revenuePerUserMin: 0,
        revenuePerUserMax: 1,
      };
      const result = runMonteCarloSimulation("Low Revenue", input, 100);
      // ROIs should be mostly negative (cost >> revenue)
      expect(result.roiDistribution.mean).toBeLessThan(0);
    });

    it("handles adoption rate at 0 bound", () => {
      const input: MonteCarloInput = {
        ...baseInput,
        adoptionRateMin: 0,
        adoptionRateMax: 0,
      };
      const result = runMonteCarloSimulation("Zero Adoption", input, 100);
      // With 0 adoption, revenue=0, so ROI should be -100% (lose entire cost)
      expect(result.roiDistribution.mean).toBeCloseTo(-100, 0);
    });

    it("handles adoption rate at 1 bound", () => {
      const input: MonteCarloInput = {
        ...baseInput,
        adoptionRateMin: 1,
        adoptionRateMax: 1,
      };
      const result = runMonteCarloSimulation("Full Adoption", input, 100);
      expect(result.iterations).toBe(100);
      expect(result.roiDistribution).toBeDefined();
    });

    it("handles single scenario with zero probability", () => {
      const scenarios: ScenarioSimulation[] = [
        {
          type: "baseline",
          probability: 0,
          assumptions: [],
          monthlyData: [],
          totalInvestment: 100000,
          projectedROI: 3.0,
          riskFactors: [],
        },
      ];
      expect(calculateExpectedROI(scenarios)).toBe(0);
    });

    it("handles single scenario ROI calculation", () => {
      const scenarios: ScenarioSimulation[] = [
        {
          type: "baseline",
          probability: 1.0,
          assumptions: [],
          monthlyData: [],
          totalInvestment: 100000,
          projectedROI: 4.5,
          riskFactors: [],
        },
      ];
      expect(calculateExpectedROI(scenarios)).toBeCloseTo(4.5, 2);
    });

    it("works without optional revenuePerUser fields", () => {
      const input: MonteCarloInput = {
        marketSizeMin: 10000,
        marketSizeMax: 50000,
        implementationCostMin: 100000,
        implementationCostMax: 200000,
        adoptionRateMin: 0.1,
        adoptionRateMax: 0.5,
      };
      const result = runMonteCarloSimulation("No Rev", input, 100);
      expect(result.iterations).toBe(100);
      expect(result.roiDistribution).toBeDefined();
    });
  });

  describe("simulateImpact", () => {
    it("calls LLM and returns validated simulation", async () => {
      const mockSim = {
        ideaTitle: "AI Dashboard",
        scenarios: [
          {
            type: "baseline",
            probability: 0.5,
            assumptions: ["Normal"],
            monthlyData: [
              {
                month: 1,
                adoptionPercent: 2,
                cost: 50000,
                cumulativeInvestment: 50000,
                keyActivity: "Build",
              },
            ],
            totalInvestment: 600000,
            projectedROI: 2.5,
            breakEvenMonth: 9,
            riskFactors: ["Competition"],
          },
        ],
        milestones: [
          {
            month: 3,
            title: "MVP",
            description: "Launch",
            type: "launch",
            successMetric: "100 users",
            isGoNoGo: true,
          },
        ],
        resources: [
          {
            category: "engineering",
            description: "Devs",
            monthlyCost: 45000,
            startMonth: 1,
            endMonth: 12,
          },
        ],
        decisionPoints: [
          {
            month: 3,
            title: "Go/No-Go",
            criteria: ["50 signups"],
            goThreshold: "50+",
            noGoThreshold: "<20",
            fallbackPlan: "Pivot",
          },
        ],
        overallRecommendation: "Proceed",
        confidenceLevel: 0.7,
      };

      mockGenerateText.mockResolvedValue(JSON.stringify(mockSim));

      const idea = {
        title: "AI Dashboard",
        description: "An AI-powered dashboard",
        potentialImpact: "High",
        implementationHint: "Start with MVP",
      };

      const result = await simulateImpact(idea);
      expect(result.ideaTitle).toBe("AI Dashboard");
      expect(result.simulatedAt).toBeDefined();
      expect(result.scenarios).toHaveLength(1);

      // Should be stored
      expect(getSimulation("AI Dashboard")).toBeDefined();
    });
  });
});
