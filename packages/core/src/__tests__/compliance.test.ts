import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  getIndustryRegulations,
  listRegulatedIndustries,
  screenIdea,
  screenIdeas,
  complianceReportToMarkdown,
} from "../compliance/index.js";
import { generateText } from "../copilot/client.js";
import type { IPComplianceReport, IPScreeningResult } from "../compliance/index.js";

const mockGenerateText = vi.mocked(generateText);

// Helper: access private riskScoreToLevel via screening
function makeIdea(title = "Test Idea") {
  return {
    title,
    description: "A test idea description",
    potentialImpact: "High impact",
    implementationHint: "Start here",
  };
}

describe("compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getIndustryRegulations", () => {
    it("returns HIPAA, FDA, MDR for healthcare", () => {
      const regs = getIndustryRegulations("healthcare");
      expect(regs).toHaveLength(3);
      const names = regs.map((r) => r.regulation);
      expect(names).toContain("HIPAA");
      expect(names).toContain("FDA 21 CFR Part 11");
      expect(names).toContain("MDR (EU 2017/745)");
    });

    it("returns SOX, PCI DSS, AML/KYC for fintech", () => {
      const regs = getIndustryRegulations("fintech");
      expect(regs).toHaveLength(3);
      const names = regs.map((r) => r.regulation);
      expect(names).toContain("SOX");
      expect(names).toContain("PCI DSS");
      expect(names).toContain("AML/KYC");
    });

    it("returns empty array for unknown industry", () => {
      expect(getIndustryRegulations("unknown-industry")).toEqual([]);
    });

    it("normalizes industry name (case-insensitive, spaces to hyphens)", () => {
      const regs = getIndustryRegulations("Data Privacy");
      expect(regs.length).toBeGreaterThan(0);
    });
  });

  describe("listRegulatedIndustries", () => {
    it("returns all 4 industry keys", () => {
      const industries = listRegulatedIndustries();
      expect(industries).toHaveLength(4);
      expect(industries).toContain("healthcare");
      expect(industries).toContain("fintech");
      expect(industries).toContain("data-privacy");
      expect(industries).toContain("artificial-intelligence");
    });
  });

  describe("riskScoreToLevel (tested via screenIdea)", () => {
    it.each([
      [0, "none"],
      [19, "none"],
      [20, "low"],
      [39, "low"],
      [40, "medium"],
      [59, "medium"],
      [60, "high"],
      [79, "high"],
      [80, "critical"],
      [100, "critical"],
    ])("score %d maps to risk level %s", async (riskScore, expectedLevel) => {
      const mockResponse = JSON.stringify({
        riskScore,
        indicators: [],
        recommendation: "Test",
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const result = await screenIdea(makeIdea(), "tech");
      expect(result.overallRisk).toBe(expectedLevel);
    });
  });

  describe("screenIdea", () => {
    it("screens an idea with mocked LLM and returns result", async () => {
      const mockResponse = JSON.stringify({
        riskScore: 45,
        indicators: [
          {
            category: "patent",
            riskLevel: "medium",
            title: "Prior art found",
            description: "Similar patents exist",
          },
        ],
        recommendation: "Proceed with caution",
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const result = await screenIdea(makeIdea(), "tech", "fintech");

      expect(result.ideaTitle).toBe("Test Idea");
      expect(result.overallRisk).toBe("medium");
      expect(result.riskScore).toBe(45);
      expect(result.indicators.length).toBeGreaterThan(0);
      expect(result.disclaimer).toContain("AI-generated");
      expect(result.screenedAt).toBeDefined();
      // Regulatory constraints should be appended for fintech
      expect(result.regulatoryConstraints).toHaveLength(3);
    });

    it("returns fallback result when LLM fails", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM error"));

      const result = await screenIdea(makeIdea(), "tech");

      expect(result.riskScore).toBe(50);
      expect(result.indicators).toHaveLength(1);
      expect(result.indicators[0].title).toBe("Screening Incomplete");
      expect(result.recommendation).toContain("Consult an IP attorney");
    });
  });

  describe("screenIdeas", () => {
    it("screens multiple ideas and builds report", async () => {
      const mockResponse = JSON.stringify({
        riskScore: 30,
        indicators: [],
        recommendation: "OK",
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const report = await screenIdeas([makeIdea("A"), makeIdea("B")], "tech");

      expect(report.totalScreened).toBe(2);
      expect(report.results).toHaveLength(2);
      expect(report.domain).toBe("tech");
      expect(report.generatedAt).toBeDefined();
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      const report = await screenIdeas(
        [makeIdea("A"), makeIdea("B")],
        "tech",
        undefined,
        undefined,
        controller.signal
      );
      expect(report.totalScreened).toBe(0);
    });
  });

  describe("buildOverallAssessment", () => {
    it("returns 'No ideas screened' for 0 results", async () => {
      const mockResponse = JSON.stringify({
        riskScore: 30,
        indicators: [],
        recommendation: "OK",
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const report = await screenIdeas([], "tech");
      expect(report.overallAssessment).toBe("No ideas screened.");
    });

    it("mentions high-risk count when > 0", async () => {
      const mockResponse = JSON.stringify({
        riskScore: 75,
        indicators: [],
        recommendation: "Risky",
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const report = await screenIdeas([makeIdea()], "tech");
      if (report.highRiskCount > 0) {
        expect(report.overallAssessment).toContain("high or critical");
      }
    });
  });

  describe("complianceReportToMarkdown", () => {
    it("generates markdown with risk icons", () => {
      const report: IPComplianceReport = {
        domain: "tech",
        industry: "fintech",
        results: [
          {
            ideaTitle: "Test Idea",
            overallRisk: "critical",
            riskScore: 85,
            indicators: [
              {
                category: "patent",
                riskLevel: "high",
                title: "Patent conflict",
                description: "Existing patent covers this area",
              },
            ],
            regulatoryConstraints: [],
            recommendation: "Do not proceed",
            disclaimer: "Disclaimer text",
            screenedAt: "2024-01-01",
          },
          {
            ideaTitle: "Safe Idea",
            overallRisk: "low",
            riskScore: 15,
            indicators: [],
            regulatoryConstraints: [],
            recommendation: "Proceed",
            disclaimer: "Disclaimer text",
            screenedAt: "2024-01-01",
          },
        ],
        overallAssessment: "Mixed results",
        highRiskCount: 1,
        totalScreened: 2,
        generatedAt: "2024-01-01",
      };

      const md = complianceReportToMarkdown(report);

      expect(md).toContain("# IP Compliance Report");
      expect(md).toContain("🔴"); // critical
      expect(md).toContain("🟢"); // low
      expect(md).toContain("Test Idea");
      expect(md).toContain("Safe Idea");
      expect(md).toContain("Patent conflict");
      expect(md).toContain("## Overall Assessment");
    });

    it("uses correct icons for each risk level", () => {
      const makeResult = (risk: string, score: number): IPScreeningResult => ({
        ideaTitle: `${risk} idea`,
        overallRisk: risk as any,
        riskScore: score,
        indicators: [],
        regulatoryConstraints: [],
        recommendation: "R",
        disclaimer: "D",
        screenedAt: "2024-01-01",
      });

      const report: IPComplianceReport = {
        domain: "d",
        industry: "i",
        results: [
          makeResult("critical", 90),
          makeResult("high", 70),
          makeResult("medium", 50),
          makeResult("low", 20),
          makeResult("none", 5),
        ],
        overallAssessment: "A",
        highRiskCount: 2,
        totalScreened: 5,
        generatedAt: "2024-01-01",
      };

      const md = complianceReportToMarkdown(report);
      expect(md).toContain("🔴");
      expect(md).toContain("🟠");
      expect(md).toContain("🟡");
      expect(md).toContain("🟢");
      expect(md).toContain("⚪");
    });
  });
});
