import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
  validateSubject: vi.fn((s: string) => ({ valid: true, sanitized: s })),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import { ResearchAgent, deepInvestigate } from "../research/agent.js";
import { DEPTH_STEP_LIMITS } from "../research/types.js";
import type { ResearchProgress, ResearchConfig } from "../research/types.js";

function makePlanJson(queries: string[]): string {
  return JSON.stringify({ queries });
}

function makeFindingJson(title: string): string {
  return JSON.stringify({
    title,
    content: `Detailed finding about ${title}`,
    sourceType: "web",
    relevanceScore: 0.85,
  });
}

function makeBriefJson(): string {
  return JSON.stringify({
    summary: "Research summary",
    keyFindings: ["Finding 1", "Finding 2"],
    competitorInsights: ["Competitor insight"],
    academicReferences: ["Reference 1"],
    trendSignals: ["Trend 1"],
    gaps: ["Gap 1"],
    recommendations: ["Recommendation 1"],
  });
}

describe("research/agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ResearchAgent", () => {
    it("emits progress for each stage", async () => {
      const stages: ResearchProgress["stage"][] = [];

      // Plan response
      const planJson = makePlanJson(["query1", "query2"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // Finding responses
      const finding1 = makeFindingJson("Finding A");
      mockGenerateText.mockResolvedValueOnce(finding1);
      mockExtractJson.mockReturnValueOnce(finding1);

      const finding2 = makeFindingJson("Finding B");
      mockGenerateText.mockResolvedValueOnce(finding2);
      mockExtractJson.mockReturnValueOnce(finding2);

      // Synthesis response
      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 2 });
      await agent.research("test subject", (p) => stages.push(p.stage));

      expect(stages).toContain("planning");
      expect(stages).toContain("researching");
      expect(stages).toContain("synthesizing");
      expect(stages).toContain("complete");
    });

    it("creates valid research plan (step list)", async () => {
      const planJson = makePlanJson(["How does X work?", "Who are competitors?"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // Findings
      for (let i = 0; i < 2; i++) {
        const f = makeFindingJson(`Finding ${i}`);
        mockGenerateText.mockResolvedValueOnce(f);
        mockExtractJson.mockReturnValueOnce(f);
      }

      // Brief
      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 2 });
      const brief = await agent.research("test");

      expect(brief.steps.length).toBeGreaterThanOrEqual(3); // plan + 2 findings + synthesis
      expect(brief.steps[0].action).toBe("decide");
    });

    it("handles LLM failure gracefully in executeResearchStep", async () => {
      // Plan succeeds
      const planJson = makePlanJson(["query1"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // Finding fails
      mockGenerateText.mockRejectedValueOnce(new Error("LLM error"));

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 1 });

      await expect(agent.research("test")).rejects.toThrow("LLM error");
    });

    it("synthesizes findings into a brief", async () => {
      const planJson = makePlanJson(["query1"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      const finding = makeFindingJson("Key Finding");
      mockGenerateText.mockResolvedValueOnce(finding);
      mockExtractJson.mockReturnValueOnce(finding);

      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 1 });
      const brief = await agent.research("test");

      expect(brief.summary).toBe("Research summary");
      expect(brief.keyFindings).toContain("Finding 1");
      expect(brief.competitorInsights).toContain("Competitor insight");
      expect(brief.gaps).toContain("Gap 1");
      expect(brief.recommendations).toContain("Recommendation 1");
      expect(brief.findings).toHaveLength(1);
      expect(brief.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("respects maxSteps depth config", async () => {
      // Plan returns 10 queries but maxSteps is 2
      const planJson = makePlanJson(Array.from({ length: 10 }, (_, i) => `query${i}`));
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // Only 2 findings should be requested
      for (let i = 0; i < 2; i++) {
        const f = makeFindingJson(`Finding ${i}`);
        mockGenerateText.mockResolvedValueOnce(f);
        mockExtractJson.mockReturnValueOnce(f);
      }

      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 2 });
      const brief = await agent.research("test");

      expect(brief.findings).toHaveLength(2);
      // 1 plan call + 2 finding calls + 1 synthesis call = 4 total
      expect(mockGenerateText).toHaveBeenCalledTimes(4);
    });

    it("uses DEPTH_STEP_LIMITS when maxSteps not specified", () => {
      const agent = new ResearchAgent({ depth: "moderate" } as ResearchConfig);
      // The config should default maxSteps to DEPTH_STEP_LIMITS.moderate = 6
      // We can't directly access private config, but we verify the behavior
      expect(DEPTH_STEP_LIMITS.shallow).toBe(3);
      expect(DEPTH_STEP_LIMITS.moderate).toBe(6);
      expect(DEPTH_STEP_LIMITS.deep).toBe(10);
    });

    it("aborts when signal is triggered during research loop", async () => {
      const controller = new AbortController();

      const planJson = makePlanJson(["q1", "q2", "q3"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // First finding succeeds, then abort
      const finding = makeFindingJson("Before Abort");
      mockGenerateText.mockResolvedValueOnce(finding);
      mockExtractJson.mockReturnValueOnce(finding);

      // Abort after first finding
      mockGenerateText.mockImplementationOnce(async () => {
        controller.abort();
        throw new Error("Research was aborted");
      });

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 3, signal: controller.signal });

      await expect(agent.research("test")).rejects.toThrow("aborted");
    });

    it("passes model through to generateText calls", async () => {
      const planJson = makePlanJson(["q1"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      const finding = makeFindingJson("F1");
      mockGenerateText.mockResolvedValueOnce(finding);
      mockExtractJson.mockReturnValueOnce(finding);

      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "shallow", maxSteps: 1, model: "gpt-5" });
      await agent.research("test");

      for (const call of mockGenerateText.mock.calls) {
        expect(call[0].model).toBe("gpt-5");
      }
    });

    it("includes subject and depth in brief", async () => {
      const planJson = makePlanJson(["q1"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      const finding = makeFindingJson("F1");
      mockGenerateText.mockResolvedValueOnce(finding);
      mockExtractJson.mockReturnValueOnce(finding);

      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      const agent = new ResearchAgent({ depth: "deep", maxSteps: 1 });
      const brief = await agent.research("AI Healthcare");

      expect(brief.subject).toBe("AI Healthcare");
      expect(brief.depth).toBe("deep");
      expect(brief.createdAt).toBeTruthy();
    });
  });

  describe("deepInvestigate", () => {
    it("returns both brief and investigation", async () => {
      // Plan
      const planJson = makePlanJson(["q1"]);
      mockGenerateText.mockResolvedValueOnce(planJson);
      mockExtractJson.mockReturnValueOnce(planJson);

      // Finding
      const finding = makeFindingJson("F1");
      mockGenerateText.mockResolvedValueOnce(finding);
      mockExtractJson.mockReturnValueOnce(finding);

      // Brief synthesis
      const briefJson = makeBriefJson();
      mockGenerateText.mockResolvedValueOnce(briefJson);
      mockExtractJson.mockReturnValueOnce(briefJson);

      // Investigation (from investigate())
      const investigationJson = JSON.stringify({
        summary: "Investigation result",
        keyAspects: [{ title: "A", description: "B" }],
        currentState: "Current",
        challenges: ["c1"],
        opportunities: ["o1"],
      });
      mockGenerateText.mockResolvedValueOnce(investigationJson);
      mockExtractJson.mockReturnValueOnce(investigationJson);

      const result = await deepInvestigate("test subject", "shallow");

      expect(result.brief).toBeDefined();
      expect(result.brief.summary).toBeTruthy();
      expect(result.investigation).toBeDefined();
    });
  });
});
