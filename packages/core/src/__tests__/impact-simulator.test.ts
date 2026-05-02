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
  getSimulation,
  listSimulations,
  clearSimulations,
  calculateTotalResourceCost,
  getGoNoGoMilestones,
  calculateExpectedROI,
  generateTimeline,
} from "../impact-simulator/index.js";
import type {
  ImpactSimulation,
  ResourceRequirement,
  ScenarioSimulation,
} from "../impact-simulator/index.js";

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
});
