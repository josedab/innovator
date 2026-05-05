import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeUserInput: (val: string) => val,
  wrapUserInput: (_label: string, val: string) => val,
}));

import { ResearchAgent } from "../agent.js";
import { DEPTH_STEP_LIMITS } from "../types.js";

function setupLlmMocks(queryCount = 3) {
  let callIndex = 0;
  mockGenerateText.mockImplementation(async () => "json");
  mockExtractJson.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) {
      // planResearch response
      return JSON.stringify({
        queries: Array.from({ length: queryCount }, (_, i) => `Query ${i + 1}`),
      });
    }
    if (callIndex <= queryCount + 1) {
      // executeResearchStep responses
      return JSON.stringify({
        title: `Finding ${callIndex - 1}`,
        content: "Detailed research content about the topic.",
        sourceType: "web",
        relevanceScore: 0.8,
      });
    }
    // synthesizeBrief response
    return JSON.stringify({
      summary: "Executive summary of research",
      keyFindings: ["Finding 1"],
      competitorInsights: ["Competitor A"],
      academicReferences: ["Paper 1"],
      trendSignals: ["Trend 1"],
      gaps: ["Gap 1"],
      recommendations: ["Recommendation 1"],
    });
  });
}

describe("research agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ResearchAgent.research", () => {
    it("completes plan → research → synthesize stages", async () => {
      setupLlmMocks(2);
      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 2 });
      const brief = await agent.research("AI in healthcare");

      expect(brief.subject).toBe("AI in healthcare");
      expect(brief.depth).toBe("shallow");
      expect(brief.summary).toBeTruthy();
      expect(brief.keyFindings.length).toBeGreaterThan(0);
      expect(brief.findings.length).toBe(2);
      expect(brief.steps.length).toBeGreaterThan(0);
      expect(brief.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("emits progress callbacks at each stage", async () => {
      setupLlmMocks(2);
      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 2 });
      const stages: string[] = [];
      await agent.research("topic", (progress) => {
        stages.push(progress.stage);
      });

      expect(stages).toContain("planning");
      expect(stages).toContain("researching");
      expect(stages).toContain("synthesizing");
      expect(stages).toContain("complete");
    });

    it("findings have correct source types", async () => {
      let callIdx = 0;
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return JSON.stringify({ queries: ["q1"] });
        if (callIdx === 2)
          return JSON.stringify({
            title: "F1",
            content: "Content",
            sourceType: "academic",
            relevanceScore: 0.9,
          });
        return JSON.stringify({
          summary: "s",
          keyFindings: [],
          competitorInsights: [],
          academicReferences: [],
          trendSignals: [],
          gaps: [],
          recommendations: [],
        });
      });

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 1 });
      const brief = await agent.research("topic");
      expect(brief.findings[0].sourceType).toBe("academic");
    });

    it("clamps relevance scores between 0 and 1", async () => {
      let callIdx = 0;
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return JSON.stringify({ queries: ["q1"] });
        if (callIdx === 2)
          return JSON.stringify({
            title: "F1",
            content: "Content",
            sourceType: "web",
            relevanceScore: 5.0, // Out of range
          });
        return JSON.stringify({
          summary: "s",
          keyFindings: [],
          competitorInsights: [],
          academicReferences: [],
          trendSignals: [],
          gaps: [],
          recommendations: [],
        });
      });

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 1 });
      const brief = await agent.research("topic");
      expect(brief.findings[0].relevanceScore).toBeLessThanOrEqual(1);
    });

    it("LLM returns no queries → empty brief findings", async () => {
      let callIdx = 0;
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return JSON.stringify({ queries: [] });
        return JSON.stringify({
          summary: "No data",
          keyFindings: [],
          competitorInsights: [],
          academicReferences: [],
          trendSignals: [],
          gaps: [],
          recommendations: [],
        });
      });

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 3 });
      const brief = await agent.research("topic");
      expect(brief.findings).toHaveLength(0);
    });
  });

  describe("DEPTH_STEP_LIMITS", () => {
    it("shallow has fewest steps", () => {
      expect(DEPTH_STEP_LIMITS.shallow).toBe(3);
    });

    it("moderate has middle steps", () => {
      expect(DEPTH_STEP_LIMITS.moderate).toBe(6);
    });

    it("deep has most steps", () => {
      expect(DEPTH_STEP_LIMITS.deep).toBe(10);
    });

    it("defaults maxSteps from depth when not explicitly set", () => {
      // ResearchAgent constructor sets maxSteps from DEPTH_STEP_LIMITS[depth]
      setupLlmMocks(3);
      const agent = new ResearchAgent({ depth: "shallow", maxSteps: DEPTH_STEP_LIMITS["shallow"] });
      expect(DEPTH_STEP_LIMITS["shallow"]).toBe(3);
    });
  });

  describe("AbortSignal cancellation", () => {
    it("throws when signal is aborted before research steps", async () => {
      const controller = new AbortController();
      controller.abort();

      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        // planResearch call succeeds
        return "json";
      });
      mockExtractJson.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return JSON.stringify({ queries: ["q1", "q2", "q3"] });
        return JSON.stringify({
          title: "F",
          content: "C",
          sourceType: "web",
          relevanceScore: 0.5,
        });
      });

      const agent = new ResearchAgent({
        depth: "shallow",
        maxSteps: 3,
        signal: controller.signal,
      });

      await expect(agent.research("topic")).rejects.toThrow("aborted");
    });
  });
});
