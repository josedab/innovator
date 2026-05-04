import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: (s: string) => s,
  sanitizeUserInput: (s: string) => s,
  wrapUserInput: (_label: string, val: string) => val,
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

import { assessPriorArt, runPatentScan, patentScanToMarkdown } from "../patent-scanner/index.js";
import type { InnovationIdea } from "../types.js";

const testIdea: InnovationIdea = {
  title: "AI Code Review",
  description: "Automated code review using LLMs",
  potentialImpact: "Reduce review time by 50%",
  implementationHint: "Fine-tune on code diffs",
};

const mockPriorArtResponse = {
  riskLevel: "low",
  relatedPatents: [
    {
      patentNumber: "US12345678",
      title: "Machine Learning Code Analysis",
      abstract: "A system for analyzing code",
      applicant: "TechCorp",
      filingDate: "2023-01-15",
      database: "USPTO",
      relevanceScore: 72,
    },
  ],
  whiteSpaceAreas: ["Real-time review", "Multi-language support"],
  recommendations: ["Focus on unique diff analysis approach"],
  freedomToOperate: 85,
  noveltyAssessment: "Moderate novelty — builds on existing ML code analysis",
};

describe("patent-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assessPriorArt", () => {
    it("calls LLM and returns structured assessment", async () => {
      const responseStr = JSON.stringify(mockPriorArtResponse);
      mockGenerateText.mockResolvedValue(responseStr);
      mockExtractJson.mockReturnValue(responseStr);

      const result = await assessPriorArt("AI tools", testIdea);

      expect(result.ideaTitle).toBe("AI Code Review");
      expect(result.riskLevel).toBe("low");
      expect(result.relatedPatents).toHaveLength(1);
      expect(result.relatedPatents[0].patentNumber).toBe("US12345678");
      expect(result.freedomToOperate).toBe(85);
      expect(result.whiteSpaceAreas).toHaveLength(2);
      expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it("generates correct patent URLs by database", async () => {
      const response = {
        ...mockPriorArtResponse,
        relatedPatents: [
          { ...mockPriorArtResponse.relatedPatents[0], database: "USPTO", patentNumber: "US111" },
          { ...mockPriorArtResponse.relatedPatents[0], database: "EPO", patentNumber: "EP222" },
          { ...mockPriorArtResponse.relatedPatents[0], database: "WIPO", patentNumber: "WO333" },
        ],
      };
      const responseStr = JSON.stringify(response);
      mockGenerateText.mockResolvedValue(responseStr);
      mockExtractJson.mockReturnValue(responseStr);

      const result = await assessPriorArt("AI", testIdea);

      expect(result.relatedPatents[0].url).toContain("patents.google.com");
      expect(result.relatedPatents[1].url).toContain("espacenet");
      expect(result.relatedPatents[2].url).toContain("patentscope.wipo");
    });

    it("uses specified databases from config", async () => {
      const responseStr = JSON.stringify(mockPriorArtResponse);
      mockGenerateText.mockResolvedValue(responseStr);
      mockExtractJson.mockReturnValue(responseStr);

      await assessPriorArt("AI", testIdea, { databases: ["USPTO"] });
      const promptArg = mockGenerateText.mock.calls[0][0];
      expect(promptArg.prompt).toContain("USPTO");
    });

    it("limits patents per idea", async () => {
      const manyPatents = Array.from({ length: 15 }, (_, i) => ({
        ...mockPriorArtResponse.relatedPatents[0],
        patentNumber: `US${i}`,
      }));
      const response = { ...mockPriorArtResponse, relatedPatents: manyPatents };
      const responseStr = JSON.stringify(response);
      mockGenerateText.mockResolvedValue(responseStr);
      mockExtractJson.mockReturnValue(responseStr);

      const result = await assessPriorArt("AI", testIdea, { maxPatentsPerIdea: 5 });
      expect(result.relatedPatents.length).toBeLessThanOrEqual(5);
    });

    it("handles special characters in subject", async () => {
      const responseStr = JSON.stringify(mockPriorArtResponse);
      mockGenerateText.mockResolvedValue(responseStr);
      mockExtractJson.mockReturnValue(responseStr);

      const ideaWithSpecialChars: InnovationIdea = {
        title: 'Test "Idea" with <special> & chars',
        description: "Description with 'quotes' and unicode: 日本語",
        potentialImpact: "High impact",
        implementationHint: "Hint",
      };

      const result = await assessPriorArt("AI & ML", ideaWithSpecialChars);
      expect(result.ideaTitle).toBe('Test "Idea" with <special> & chars');
    });
  });

  describe("runPatentScan", () => {
    it("orchestrates prior art + white space analysis with progress", async () => {
      const priorArtStr = JSON.stringify(mockPriorArtResponse);
      const whiteSpaceStr = JSON.stringify({
        whiteSpaces: [
          { area: "Real-time analysis", opportunity: "No patents here", competitorDensity: "low" },
        ],
        overallRisk: "low",
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(() => {
        callCount++;
        // First call: assessPriorArt, second call: white space analysis
        return Promise.resolve(callCount === 1 ? priorArtStr : whiteSpaceStr);
      });
      mockExtractJson.mockImplementation((raw: string) => raw);

      const progress: Array<{ stage: string }> = [];
      const result = await runPatentScan("AI tools", [testIdea], (p) =>
        progress.push({ stage: p.stage })
      );

      expect(result.subject).toBe("AI tools");
      expect(result.assessments).toHaveLength(1);
      expect(result.overallRisk).toBe("low");
      expect(result.whiteSpaceMap).toHaveLength(1);
      expect(result.databasesSearched).toEqual(["USPTO", "EPO", "WIPO"]);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.some((p) => p.stage === "searching")).toBe(true);
      expect(progress.some((p) => p.stage === "complete")).toBe(true);
    });

    it("throws for empty ideas array", async () => {
      await expect(runPatentScan("AI", [])).rejects.toThrow("No ideas to scan");
    });

    it("handles assessment failure with fallback", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("LLM failed"));
      // Second call for white space analysis
      const whiteSpaceStr = JSON.stringify({
        whiteSpaces: [],
        overallRisk: "moderate",
      });
      mockGenerateText.mockResolvedValueOnce(whiteSpaceStr);
      mockExtractJson.mockImplementation((raw: string) => raw);

      const result = await runPatentScan("AI", [testIdea]);
      expect(result.assessments).toHaveLength(1);
      expect(result.assessments[0].riskLevel).toBe("moderate"); // fallback
      expect(result.assessments[0].recommendations).toContain(
        "Assessment failed — manual review recommended"
      );
    });

    it("fires progress callbacks for each stage", async () => {
      const priorArtStr = JSON.stringify(mockPriorArtResponse);
      const whiteSpaceStr = JSON.stringify({
        whiteSpaces: [],
        overallRisk: "low",
      });
      mockGenerateText
        .mockResolvedValueOnce(priorArtStr)
        .mockResolvedValueOnce(priorArtStr)
        .mockResolvedValueOnce(whiteSpaceStr);
      mockExtractJson.mockImplementation((raw: string) => raw);

      const stages: string[] = [];
      await runPatentScan("AI", [testIdea, testIdea], (p) => stages.push(p.stage));

      expect(stages).toContain("searching");
      expect(stages).toContain("analyzing");
      expect(stages).toContain("assessing");
      expect(stages).toContain("complete");
    });
  });

  describe("patentScanToMarkdown", () => {
    it("formats all sections", () => {
      const result = {
        subject: "AI Tools",
        assessments: [
          {
            ideaTitle: "Code Review AI",
            riskLevel: "low" as const,
            relatedPatents: [
              {
                id: "p1",
                patentNumber: "US123",
                title: "Related Patent",
                abstract: "Abstract",
                applicant: "Corp",
                filingDate: "2023-01-01",
                database: "USPTO" as const,
                relevanceScore: 80,
                url: "https://patents.google.com/patent/US123",
              },
            ],
            whiteSpaceAreas: ["Area 1"],
            recommendations: ["Rec 1"],
            freedomToOperate: 85,
            noveltyAssessment: "Novel approach",
          },
        ],
        overallRisk: "low" as const,
        whiteSpaceMap: [
          { area: "Real-time", opportunity: "High potential", competitorDensity: "low" as const },
        ],
        databasesSearched: ["USPTO" as const, "EPO" as const],
        totalPatentsAnalyzed: 1,
        scanDurationMs: 5000,
        createdAt: new Date().toISOString(),
      };

      const md = patentScanToMarkdown(result);
      expect(md).toContain("# Patent Scan: AI Tools");
      expect(md).toContain("**Overall Risk:** low");
      expect(md).toContain("Code Review AI");
      expect(md).toContain("US123");
      expect(md).toContain("Freedom to Operate");
      expect(md).toContain("White Space");
      expect(md).toContain("Real-time");
    });

    it("handles empty arrays", () => {
      const result = {
        subject: "Empty Scan",
        assessments: [],
        overallRisk: "clear" as const,
        whiteSpaceMap: [],
        databasesSearched: ["USPTO" as const],
        totalPatentsAnalyzed: 0,
        scanDurationMs: 100,
        createdAt: new Date().toISOString(),
      };

      const md = patentScanToMarkdown(result);
      expect(md).toContain("# Patent Scan: Empty Scan");
      expect(md).not.toContain("White Space Opportunities");
    });
  });
});
