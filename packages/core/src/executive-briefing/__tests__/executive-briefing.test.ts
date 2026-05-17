/**
 * Tests for the Executive Briefing Generator module.
 */

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
  withRetry: vi.fn((fn: () => unknown) => fn()),
  wrapUserInput: vi.fn((_tag: string, text: string) => text),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
vi.mock("../../copilot/client.js", () => ({
  generateText: mocks.generateText,
  extractJson: mocks.extractJson,
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: mocks.withRetry,
}));
vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: mocks.wrapUserInput,
  sanitizeLlmOutput: mocks.sanitizeLlmOutput,
}));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateExecutiveBriefing,
  briefingToMarkdown,
  briefingToHtml,
} from "../index.js";
import type { ExecutiveBriefing, BriefingInput } from "../index.js";

// ---- Helpers ----

const MOCK_LLM_RESPONSE = JSON.stringify({
  executiveSummary: "This is a strategic overview of the AI innovation portfolio.",
  keyFindings: ["Finding 1: AI adoption is accelerating", "Finding 2: Talent gap exists"],
  heatmap: [
    { ideaTitle: "Chatbot Platform", impact: "high", effort: "low" },
    { ideaTitle: "Data Pipeline", impact: "medium", effort: "high" },
  ],
  recommendations: [
    {
      title: "Invest in AI Infrastructure",
      description: "Build foundational ML infrastructure",
      priority: "immediate",
      expectedOutcome: "3x faster model deployment",
    },
  ],
  risks: [
    {
      risk: "Talent shortage",
      probability: "high",
      impact: "high",
      mitigation: "Invest in training programs",
    },
  ],
  resourceEstimate: {
    totalEffortWeeks: 12,
    teamSize: 3,
    budgetRange: "$50K-$100K",
  },
});

function createBriefingInput(overrides?: Partial<BriefingInput>): BriefingInput {
  return {
    subject: "AI Innovation Strategy",
    ideas: [
      { title: "Chatbot Platform", description: "AI-powered chatbot", score: 85 },
      { title: "Data Pipeline", description: "Automated data processing", score: 72 },
    ],
    ...overrides,
  };
}

function createMockBriefing(): ExecutiveBriefing {
  return {
    id: "briefing-test123",
    title: "Innovation Briefing: AI Strategy",
    subject: "AI Strategy",
    format: "markdown",
    executiveSummary: "Strategic overview of AI portfolio.",
    keyFindings: ["Finding 1", "Finding 2"],
    heatmap: {
      title: "Portfolio Heatmap: AI Strategy",
      cells: [
        { ideaTitle: "Chatbot", impact: "high", effort: "low", quadrant: "quick-win", score: 85 },
        { ideaTitle: "Pipeline", impact: "medium", effort: "high", quadrant: "avoid" },
      ],
      summary: "2 ideas analyzed. 1 quick wins identified.",
      recommendedFocus: ["Chatbot"],
    },
    recommendations: [
      {
        title: "Invest in AI",
        description: "Build ML infra",
        priority: "immediate",
        expectedOutcome: "Faster deployment",
      },
    ],
    risks: [
      { risk: "Talent gap", probability: "high", impact: "high", mitigation: "Training" },
    ],
    resourceEstimate: { totalEffortWeeks: 12, teamSize: 3, budgetRange: "$50K-$100K" },
    generatedAt: new Date().toISOString(),
  };
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executive-briefing", () => {
  describe("generateExecutiveBriefing", () => {
    it("returns a valid ExecutiveBriefing shape", async () => {
      mocks.generateText.mockResolvedValue(MOCK_LLM_RESPONSE);
      const input = createBriefingInput();

      const briefing = await generateExecutiveBriefing(input);

      expect(briefing.id).toMatch(/^briefing-/);
      expect(briefing.title).toContain("AI Innovation Strategy");
      expect(briefing.subject).toBe("AI Innovation Strategy");
      expect(briefing.executiveSummary).toBeTruthy();
      expect(briefing.keyFindings.length).toBeGreaterThan(0);
      expect(briefing.heatmap.cells.length).toBeGreaterThan(0);
      expect(briefing.recommendations.length).toBeGreaterThan(0);
      expect(briefing.risks.length).toBeGreaterThan(0);
      expect(briefing.resourceEstimate).toBeDefined();
      expect(briefing.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("classifies heatmap quadrants correctly", async () => {
      mocks.generateText.mockResolvedValue(MOCK_LLM_RESPONSE);
      const briefing = await generateExecutiveBriefing(createBriefingInput());

      const quickWins = briefing.heatmap.cells.filter((c) => c.quadrant === "quick-win");
      // High impact + low effort = quick-win
      expect(quickWins.some((c) => c.ideaTitle === "Chatbot Platform")).toBe(true);
    });

    it("handles LLM returning malformed JSON (retry mechanism)", async () => {
      mocks.withRetry.mockRejectedValueOnce(new Error("Failed after retries"));

      await expect(generateExecutiveBriefing(createBriefingInput())).rejects.toThrow(
        "Failed after retries"
      );
    });

    it("handles empty portfolio input", async () => {
      mocks.generateText.mockResolvedValue(MOCK_LLM_RESPONSE);
      const input = createBriefingInput({ ideas: [] });

      const briefing = await generateExecutiveBriefing(input);
      expect(briefing.id).toMatch(/^briefing-/);
    });

    it("handles single-idea briefing", async () => {
      mocks.generateText.mockResolvedValue(MOCK_LLM_RESPONSE);
      const input = createBriefingInput({
        ideas: [{ title: "Solo Idea", description: "Only one idea" }],
      });

      const briefing = await generateExecutiveBriefing(input);
      expect(briefing.id).toMatch(/^briefing-/);
    });
  });

  describe("briefingToMarkdown", () => {
    it("includes all sections", () => {
      const briefing = createMockBriefing();
      const md = briefingToMarkdown(briefing);

      expect(md).toContain("Executive Summary");
      expect(md).toContain("Key Findings");
      expect(md).toContain("Portfolio Heatmap");
      expect(md).toContain("Strategic Recommendations");
      expect(md).toContain("Risk Assessment");
      expect(md).toContain("Resource Estimate");
    });

    it("includes heatmap table", () => {
      const briefing = createMockBriefing();
      const md = briefingToMarkdown(briefing);

      expect(md).toContain("| Idea | Impact | Effort | Quadrant |");
      expect(md).toContain("Chatbot");
    });

    it("includes recommended focus quick wins", () => {
      const briefing = createMockBriefing();
      const md = briefingToMarkdown(briefing);

      expect(md).toContain("Recommended Focus");
      expect(md).toContain("**Chatbot**");
    });

    it("includes risk table", () => {
      const briefing = createMockBriefing();
      const md = briefingToMarkdown(briefing);

      expect(md).toContain("| Risk | Probability | Impact | Mitigation |");
      expect(md).toContain("Talent gap");
    });

    it("includes resource estimate", () => {
      const briefing = createMockBriefing();
      const md = briefingToMarkdown(briefing);

      expect(md).toContain("12 person-weeks");
      expect(md).toContain("3 people");
      expect(md).toContain("$50K-$100K");
    });
  });

  describe("briefingToHtml", () => {
    it("generates valid HTML structure", () => {
      const briefing = createMockBriefing();
      const html = briefingToHtml(briefing);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<title>");
      expect(html).toContain("</title>");
    });

    it("includes executive summary section", () => {
      const briefing = createMockBriefing();
      const html = briefingToHtml(briefing);

      expect(html).toContain("Executive Summary");
      expect(html).toContain(briefing.executiveSummary);
    });

    it("includes heatmap table with color-coded quadrants", () => {
      const briefing = createMockBriefing();
      const html = briefingToHtml(briefing);

      expect(html).toContain("<table>");
      expect(html).toContain("Chatbot");
      expect(html).toContain("quick-win");
      expect(html).toContain("style=");
    });

    it("includes recommendations", () => {
      const briefing = createMockBriefing();
      const html = briefingToHtml(briefing);

      expect(html).toContain("Recommendations");
      expect(html).toContain("Invest in AI");
    });

    it("includes risk assessment", () => {
      const briefing = createMockBriefing();
      const html = briefingToHtml(briefing);

      expect(html).toContain("Risk Assessment");
      expect(html).toContain("Talent gap");
    });
  });
});
