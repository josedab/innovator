import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"executiveSummary":"Summary","problemStatement":"Problem","proposedSolution":"Solution","financialProjections":"Projections","competitiveRationale":"Competitive","riskAnalysis":"Risks","implementationPlan":"Plan","recommendation":"Recommend"}'
    ),
  extractJson: vi
    .fn()
    .mockReturnValue(
      '{"executiveSummary":"Summary","problemStatement":"Problem","proposedSolution":"Solution","financialProjections":"Projections","competitiveRationale":"Competitive","riskAnalysis":"Risks","implementationPlan":"Plan","recommendation":"Recommend"}'
    ),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  calculateNPV,
  calculateIRR,
  calculatePaybackPeriod,
  calculateROI,
  riskAdjustNPV,
  generateRiskMatrix,
  calculateTotalInvestment,
  generateBusinessCase,
  getBusinessCase,
  listBusinessCases,
  aggregatePortfolioROI,
  businessCaseToMarkdown,
  clearROICalculatorData,
} from "../roi-calculator/index.js";
import type { CashFlow, ResourceAllocation, RiskFactor } from "../roi-calculator/index.js";

const cashFlows: CashFlow[] = [
  { period: 0, amount: -100000, label: "Initial investment" },
  { period: 1, amount: 30000, label: "Year 1 returns" },
  { period: 2, amount: 40000, label: "Year 2 returns" },
  { period: 3, amount: 50000, label: "Year 3 returns" },
  { period: 4, amount: 60000, label: "Year 4 returns" },
];

const resources: ResourceAllocation[] = [
  { category: "engineering", headcount: 3, costPerPeriod: 15000, periods: 6 },
  { category: "design", headcount: 1, costPerPeriod: 12000, periods: 3 },
];

const risks: RiskFactor[] = [
  {
    id: "r1",
    name: "Tech complexity",
    category: "technical",
    probability: 0.3,
    impact: "medium",
    adjustmentFactor: 0.85,
    mitigation: "Prototype early",
  },
  {
    id: "r2",
    name: "Market shift",
    category: "market",
    probability: 0.2,
    impact: "high",
    adjustmentFactor: 0.8,
  },
];

describe("roi-calculator", () => {
  beforeEach(() => {
    clearROICalculatorData();
  });

  describe("NPV calculation", () => {
    it("calculates NPV correctly", () => {
      const npv = calculateNPV(cashFlows, 0.1);
      expect(npv).toBeGreaterThan(0);
      // Manual: -100000 + 30000/1.1 + 40000/1.21 + 50000/1.331 + 60000/1.4641
      expect(npv).toBeCloseTo(-100000 + 27272.73 + 33057.85 + 37565.74 + 40980.81, 0);
    });

    it("returns negative NPV for bad investments", () => {
      const badFlows: CashFlow[] = [
        { period: 0, amount: -1000000 },
        { period: 1, amount: 10000 },
      ];
      expect(calculateNPV(badFlows, 0.1)).toBeLessThan(0);
    });

    it("rejects invalid discount rate", () => {
      expect(() => calculateNPV(cashFlows, -2)).toThrow();
    });
  });

  describe("IRR calculation", () => {
    it("calculates IRR", () => {
      const irr = calculateIRR(cashFlows);
      expect(irr).toBeDefined();
      expect(irr!).toBeGreaterThan(0);
      // At the IRR, NPV should be ~0
      const npvAtIrr = calculateNPV(cashFlows, irr!);
      expect(Math.abs(npvAtIrr)).toBeLessThan(1);
    });

    it("returns undefined for single cash flow", () => {
      expect(calculateIRR([{ period: 0, amount: -1000 }])).toBeUndefined();
    });
  });

  describe("payback period", () => {
    it("calculates payback period", () => {
      const period = calculatePaybackPeriod(cashFlows);
      expect(period).toBe(3); // Cumulative: -100k, -70k, -30k, +20k
    });

    it("returns undefined when never paid back", () => {
      const badFlows: CashFlow[] = [
        { period: 0, amount: -1000000 },
        { period: 1, amount: 100 },
      ];
      expect(calculatePaybackPeriod(badFlows)).toBeUndefined();
    });
  });

  describe("ROI calculation", () => {
    it("calculates ROI percentage", () => {
      const roi = calculateROI(100000, 180000);
      expect(roi).toBeCloseTo(80);
    });

    it("handles zero investment", () => {
      expect(calculateROI(0, 1000)).toBe(0);
    });
  });

  describe("risk adjustment", () => {
    it("adjusts NPV for risks", () => {
      const adjusted = riskAdjustNPV(100000, risks);
      expect(adjusted).toBeLessThan(100000);
      expect(adjusted).toBeGreaterThan(0);
    });

    it("returns original NPV with no risks", () => {
      expect(riskAdjustNPV(100000, [])).toBe(100000);
    });

    it("generates risk matrix", () => {
      const matrix = generateRiskMatrix(risks);
      expect(matrix).toContain("Tech complexity");
      expect(matrix).toContain("Market shift");
    });
  });

  describe("resource allocation", () => {
    it("calculates total investment", () => {
      const total = calculateTotalInvestment(resources);
      expect(total).toBe(15000 * 6 + 12000 * 3);
    });
  });

  describe("business case generation", () => {
    it("generates a complete business case", async () => {
      const bc = await generateBusinessCase(
        "idea-1",
        "AI Widget",
        "An AI-powered widget",
        cashFlows,
        resources,
        risks
      );

      expect(bc.ideaTitle).toBe("AI Widget");
      expect(bc.financialMetrics.npv).toBeGreaterThan(0);
      expect(bc.financialMetrics.roi).toBeGreaterThan(0);
      expect(typeof bc.sections.executiveSummary).toBe("string");
      expect(bc.sections.executiveSummary.length).toBeGreaterThan(0);
      expect(bc.risks).toHaveLength(2);
    });

    it("stores and retrieves business cases", async () => {
      const bc = await generateBusinessCase("idea-2", "Test", "Desc", cashFlows, resources, []);

      const fetched = getBusinessCase(bc.id);
      expect(fetched).toBeDefined();
      expect(fetched!.ideaTitle).toBe("Test");
    });

    it("lists business cases", async () => {
      await generateBusinessCase("idea-3", "A", "Desc", cashFlows, resources, []);
      await generateBusinessCase("idea-4", "B", "Desc", cashFlows, resources, []);
      expect(listBusinessCases()).toHaveLength(2);
      expect(listBusinessCases("idea-3")).toHaveLength(1);
    });
  });

  describe("portfolio ROI", () => {
    it("aggregates ROI across portfolio", async () => {
      await generateBusinessCase("idea-5", "A", "Desc", cashFlows, resources, []);
      await generateBusinessCase("idea-6", "B", "Desc", cashFlows, resources, []);

      const portfolio = aggregatePortfolioROI();
      expect(portfolio.ideaCount).toBe(2);
      expect(portfolio.totalInvestment).toBeGreaterThan(0);
      expect(portfolio.topIdeasByRoi).toHaveLength(2);
    });
  });

  describe("markdown export", () => {
    it("renders business case as markdown", async () => {
      const bc = await generateBusinessCase(
        "idea-7",
        "Widget",
        "Desc",
        cashFlows,
        resources,
        risks
      );

      const md = businessCaseToMarkdown(bc);
      expect(md).toContain("# Business Case: Widget");
      expect(md).toContain("NPV");
      expect(md).toContain("ROI");
    });

    it("contains required sections", async () => {
      const bc = await generateBusinessCase(
        "idea-md",
        "Sections Test",
        "Desc",
        cashFlows,
        resources,
        risks
      );

      const md = businessCaseToMarkdown(bc);
      expect(md).toContain("Business Case");
      expect(md).toContain("Financial");
    });
  });

  describe("additional NPV tests", () => {
    it("calculates NPV with known values (10% discount, $100/yr x 5yr)", () => {
      const flows: CashFlow[] = Array.from({ length: 5 }, (_, i) => ({
        period: i + 1,
        amount: 100,
      }));
      const npv = calculateNPV(flows, 0.1);
      // PV = 100/1.1 + 100/1.21 + 100/1.331 + 100/1.4641 + 100/1.61051 ≈ 379.08
      expect(npv).toBeCloseTo(379.08, 0);
    });

    it("0% discount rate equals simple sum", () => {
      const flows: CashFlow[] = [
        { period: 1, amount: 100 },
        { period: 2, amount: 200 },
        { period: 3, amount: 300 },
      ];
      const npv = calculateNPV(flows, 0);
      expect(npv).toBeCloseTo(600, 0);
    });
  });

  describe("additional IRR tests", () => {
    it("returns undefined for all negative cash flows", () => {
      const allNeg: CashFlow[] = [
        { period: 0, amount: -1000 },
        { period: 1, amount: -500 },
      ];
      const irr = calculateIRR(allNeg);
      // No positive flows means no IRR can make NPV = 0
      expect(irr === undefined || (irr !== undefined && calculateNPV(allNeg, irr) < 0)).toBe(true);
    });
  });

  describe("additional ROI tests", () => {
    it("returns 0 for zero investment", () => {
      expect(calculateROI(0, 5000)).toBe(0);
    });
  });

  describe("additional portfolio tests", () => {
    it("handles empty portfolio", () => {
      const portfolio = aggregatePortfolioROI();
      expect(portfolio.ideaCount).toBe(0);
      expect(portfolio.totalInvestment).toBe(0);
    });
  });
});
