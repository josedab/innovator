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

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  generatePlaybook,
  generatePlaybookFromPipeline,
  PlaybookSchema,
  PlaybookFormatSchema,
  type Playbook,
  type PlaybookFormat,
} from "../playbook/index.js";
import type { Investigation, AngleResult, Synthesis, PipelineProgress } from "../types.js";

const MOCK_INVESTIGATION: Investigation = {
  summary: "Innovation in developer tools",
  keyAspects: [{ title: "AI Integration", description: "Using AI in dev workflows" }],
  currentState: "Early adoption phase",
  challenges: ["Cost", "Accuracy"],
  opportunities: ["Faster development", "Better quality"],
};

const MOCK_ANGLE_RESULTS: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Idea1",
        description: "Substitute manual review",
        potentialImpact: "High",
        implementationHint: "Use LLMs",
      },
    ],
    reasoning: "Applied SCAMPER methodology",
  },
];

const MOCK_SYNTHESIS: Synthesis = {
  topIdeas: [
    {
      title: "AI Code Review",
      description: "Automated code review using LLMs",
      sourceAngle: "scamper",
      potentialImpact: "50% faster reviews",
      feasibility: "high",
    },
  ],
  themes: ["automation", "developer experience"],
  recommendation: "Start with code review automation as a quick win",
};

function makePlaybookSectionsJson(): string {
  return JSON.stringify({
    executiveSummary: "Executive summary of the innovation playbook.",
    roadmap: [
      {
        phase: "Phase 1: Quick Wins",
        timeframe: "Weeks 1-4",
        activities: ["Setup infrastructure", "Pilot program"],
        deliverables: ["MVP", "Pilot results"],
        dependencies: ["Team availability"],
      },
      {
        phase: "Phase 2: Scale",
        timeframe: "Months 2-3",
        activities: ["Full rollout"],
        deliverables: ["Production system"],
      },
    ],
    risks: [
      {
        risk: "Cost overrun",
        likelihood: "medium",
        impact: "high",
        mitigation: "Set budget limits",
      },
      {
        risk: "Low adoption",
        likelihood: "low",
        impact: "medium",
        mitigation: "Training program",
      },
    ],
    nextSteps: ["Assemble team", "Define KPIs", "Start pilot"],
  });
}

describe("playbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const json = makePlaybookSectionsJson();
    mockGenerateText.mockResolvedValue(json);
    mockExtractJson.mockReturnValue(json);
  });

  describe("generatePlaybook", () => {
    it("returns valid PlaybookSchema result (markdown)", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS,
        "markdown"
      );

      expect(() => PlaybookSchema.parse(playbook)).not.toThrow();
      expect(playbook.format).toBe("markdown");
      expect(playbook.title).toContain("dev tools");
      expect(playbook.generatedAt).toBeTruthy();
    });

    it("returns valid PlaybookSchema result (html)", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS,
        "html"
      );

      expect(playbook.format).toBe("html");
      expect(playbook.content).toContain("<!DOCTYPE html>");
      expect(playbook.content).toContain("<html");
    });

    it("includes roadmap items in correct order", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS
      );

      expect(playbook.sections.roadmap).toHaveLength(2);
      expect(playbook.sections.roadmap[0].phase).toContain("Quick Wins");
      expect(playbook.sections.roadmap[1].phase).toContain("Scale");
    });

    it("includes risk likelihood/impact matrix", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS
      );

      expect(playbook.sections.risks).toHaveLength(2);
      expect(playbook.sections.risks[0].likelihood).toBe("medium");
      expect(playbook.sections.risks[0].impact).toBe("high");
    });

    it("throws when required data is missing", async () => {
      await expect(
        generatePlaybook("", MOCK_INVESTIGATION, MOCK_ANGLE_RESULTS, MOCK_SYNTHESIS)
      ).rejects.toThrow("Complete pipeline results required");

      await expect(
        generatePlaybook("test", MOCK_INVESTIGATION, [], MOCK_SYNTHESIS)
      ).rejects.toThrow("Complete pipeline results required");
    });

    it("passes model and signal through", async () => {
      const controller = new AbortController();
      await generatePlaybook(
        "test",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS,
        "markdown",
        "gpt-5",
        controller.signal
      );

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-5", signal: controller.signal })
      );
    });

    it("markdown content includes all major sections", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS
      );

      expect(playbook.content).toContain("Executive Summary");
      expect(playbook.content).toContain("Investigation Overview");
      expect(playbook.content).toContain("Implementation Roadmap");
      expect(playbook.content).toContain("Risk Assessment");
      expect(playbook.content).toContain("Next Steps");
      expect(playbook.content).toContain("Table of Contents");
    });

    it("markdown content includes investigation details", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS
      );

      expect(playbook.content).toContain(MOCK_INVESTIGATION.summary);
      expect(playbook.content).toContain("Cost");
      expect(playbook.content).toContain("Faster development");
    });

    it("markdown content includes synthesis themes and recommendation", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS
      );

      expect(playbook.content).toContain("automation");
      expect(playbook.content).toContain("Start with code review");
    });

    it("HTML output includes CSS styling", async () => {
      const playbook = await generatePlaybook(
        "dev tools",
        MOCK_INVESTIGATION,
        MOCK_ANGLE_RESULTS,
        MOCK_SYNTHESIS,
        "html"
      );

      expect(playbook.content).toContain("<style>");
      expect(playbook.content).toContain("font-family");
    });
  });

  describe("generatePlaybookFromPipeline", () => {
    it("wires pipeline results correctly", async () => {
      const progress: PipelineProgress = {
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 1,
        angleResults: MOCK_ANGLE_RESULTS,
        investigation: MOCK_INVESTIGATION,
        synthesis: MOCK_SYNTHESIS,
      };

      const playbook = await generatePlaybookFromPipeline(progress);

      expect(playbook.title).toContain("Innovation Playbook");
      expect(playbook.format).toBe("markdown");
    });

    it("throws when pipeline is not complete", async () => {
      const progress: PipelineProgress = {
        stage: "generating",
        completedAngles: [],
        totalAngles: 1,
        angleResults: [],
      };

      await expect(generatePlaybookFromPipeline(progress)).rejects.toThrow(
        "Pipeline must be complete"
      );
    });

    it("throws when pipeline has no investigation", async () => {
      const progress: PipelineProgress = {
        stage: "complete",
        completedAngles: [],
        totalAngles: 0,
        angleResults: [],
        synthesis: MOCK_SYNTHESIS,
      };

      await expect(generatePlaybookFromPipeline(progress)).rejects.toThrow(
        "Pipeline must be complete"
      );
    });

    it("accepts format override", async () => {
      const progress: PipelineProgress = {
        stage: "complete",
        completedAngles: ["scamper"],
        totalAngles: 1,
        angleResults: MOCK_ANGLE_RESULTS,
        investigation: MOCK_INVESTIGATION,
        synthesis: MOCK_SYNTHESIS,
      };

      const playbook = await generatePlaybookFromPipeline(progress, "html");
      expect(playbook.format).toBe("html");
    });
  });

  describe("PlaybookFormatSchema", () => {
    it("accepts valid formats", () => {
      expect(PlaybookFormatSchema.parse("markdown")).toBe("markdown");
      expect(PlaybookFormatSchema.parse("html")).toBe("html");
    });

    it("rejects invalid formats", () => {
      expect(() => PlaybookFormatSchema.parse("pdf")).toThrow();
    });
  });
});
