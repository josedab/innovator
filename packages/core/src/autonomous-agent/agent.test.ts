import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateText, mockExtractJson } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockExtractJson: vi.fn(),
}));

const { mockWithRetry } = vi.hoisted(() => ({
  mockWithRetry: vi.fn(),
}));

const { mockInvestigate } = vi.hoisted(() => ({
  mockInvestigate: vi.fn(),
}));

const { mockGenerateForAngle } = vi.hoisted(() => ({
  mockGenerateForAngle: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: mockGenerateText,
  extractJson: mockExtractJson,
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: mockWithRetry,
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: (s: string) => s,
  wrapUserInput: (_label: string, s: string) => s,
}));

vi.mock("../innovation/investigate.js", () => ({
  investigate: mockInvestigate,
}));

vi.mock("../innovation/generate.js", () => ({
  generateForAngle: mockGenerateForAngle,
}));

import { runAutonomousAgent, autonomousRunToMarkdown } from "./agent.js";

describe("runAutonomousAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: withRetry just executes the function
    mockWithRetry.mockImplementation(async (fn: () => Promise<string>) => fn());

    // Default: investigate returns a basic result
    mockInvestigate.mockResolvedValue({
      summary: "Test investigation summary",
      keyAspects: [{ title: "Key", description: "Aspect" }],
      currentState: "Current",
      challenges: ["Challenge"],
      opportunities: ["Opportunity"],
    });

    // Default: generateForAngle returns basic ideas
    mockGenerateForAngle.mockResolvedValue({
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Test Idea",
          description: "A test idea",
          potentialImpact: "High",
          implementationHint: "Start here",
        },
      ],
      reasoning: "Applied angle",
    });
  });

  it("completes with maxBranches=1, maxDepth=1 (simplest case)", async () => {
    // LLM decision: synthesize immediately
    mockGenerateText.mockResolvedValue("json response");
    mockExtractJson
      .mockReturnValueOnce(
        JSON.stringify({
          action: "synthesize",
          reasoning: "Enough data collected",
          newSubjects: [],
        })
      )
      .mockReturnValueOnce(
        JSON.stringify({
          title: "Test Portfolio",
          summary: "Summary of findings",
          topIdeas: [
            {
              title: "Idea 1",
              description: "Desc",
              sourceSubject: "Test subject",
              score: 85,
              feasibility: "high",
            },
          ],
          themes: ["AI"],
        })
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progress: any[] = [];
    const run = await runAutonomousAgent("Test subject", (p) => progress.push({ ...p }), {
      maxBranches: 2,
      maxDepth: 1,
    });

    expect(run.status).toBe("completed");
    expect(run.rootSubject).toBe("Test subject");
    expect(run.branches.length).toBeGreaterThanOrEqual(1);
    expect(run.portfolio).toBeDefined();
    expect(run.portfolio!.title).toBe("Test Portfolio");
  });

  it("branching: LLM returns branch action creates child branches", async () => {
    let callCount = 0;
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({
          action: "branch",
          reasoning: "Split into sub-topics",
          newSubjects: ["Sub-topic A", "Sub-topic B"],
        });
      }
      if (callCount <= 3) {
        return JSON.stringify({
          action: "synthesize",
          reasoning: "Done",
          newSubjects: [],
        });
      }
      // Portfolio synthesis
      return JSON.stringify({
        title: "Portfolio",
        summary: "Summary",
        topIdeas: [],
        themes: [],
      });
    });

    const run = await runAutonomousAgent("Root", () => {}, {
      maxBranches: 10,
      maxDepth: 3,
    });

    expect(run.status).toBe("completed");
    expect(run.branches.length).toBeGreaterThan(1);
  });

  it("prune action stops exploring branch", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson
      .mockReturnValueOnce(
        JSON.stringify({
          action: "prune",
          reasoning: "Low potential",
          newSubjects: [],
        })
      )
      .mockReturnValueOnce(
        JSON.stringify({
          title: "Portfolio",
          summary: "Summary",
          topIdeas: [],
          themes: [],
        })
      );

    const run = await runAutonomousAgent("Test", () => {}, {
      maxBranches: 5,
      maxDepth: 3,
    });

    expect(run.status).toBe("completed");
    const decision = run.decisions.find((d) => d.action === "prune");
    expect(decision).toBeDefined();
  });

  it("maxBranches hit stops creating branches", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockImplementation(() =>
      JSON.stringify({
        action: "branch",
        reasoning: "More exploration",
        newSubjects: ["A", "B", "C"],
      })
    );

    // Override for portfolio
    let extractCallCount = 0;
    mockExtractJson.mockImplementation(() => {
      extractCallCount++;
      if (extractCallCount <= 3) {
        return JSON.stringify({
          action: "branch",
          reasoning: "Branch more",
          newSubjects: ["X", "Y"],
        });
      }
      return JSON.stringify({
        title: "Portfolio",
        summary: "Done",
        topIdeas: [],
        themes: [],
      });
    });

    const run = await runAutonomousAgent("Test", () => {}, {
      maxBranches: 3,
      maxDepth: 5,
    });

    expect(run.branches.length).toBeLessThanOrEqual(3);
  });

  it("progress callback receives updates", async () => {
    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        title: "Portfolio",
        summary: "Done",
        topIdeas: [],
        themes: [],
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressUpdates: any[] = [];
    await runAutonomousAgent("Test", (p) => progressUpdates.push({ ...p }), {
      maxBranches: 1,
      maxDepth: 0,
    });

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0]).toHaveProperty("runId");
    expect(progressUpdates[0]).toHaveProperty("status");
  });

  it("AbortSignal cancellation mid-loop", async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    mockGenerateText.mockResolvedValue("json");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        title: "Portfolio",
        summary: "Done",
        topIdeas: [],
        themes: [],
      })
    );

    const run = await runAutonomousAgent("Test", () => {}, {
      maxBranches: 10,
      maxDepth: 5,
      signal: controller.signal,
    });

    expect(run.status).toBe("failed");
  });

  it("handles gracefully when portfolio synthesis fails", async () => {
    mockGenerateText.mockResolvedValue("json");
    // Decision succeeds, portfolio fails
    let callCount = 0;
    mockExtractJson.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({
          action: "synthesize",
          reasoning: "Done",
          newSubjects: [],
        });
      }
      return "invalid json";
    });
    mockWithRetry.mockImplementation(async (fn: () => Promise<string>) => fn());

    const run = await runAutonomousAgent("Test", () => {}, {
      maxBranches: 1,
      maxDepth: 1,
    });

    // Should still complete with fallback portfolio
    expect(run.status).toBe("completed");
    expect(run.portfolio).toBeDefined();
    expect(run.portfolio!.summary).toContain("failed");
  });
});

describe("autonomousRunToMarkdown", () => {
  it("formats branches, decisions, portfolio correctly", () => {
    const run = {
      id: "run-1",
      rootSubject: "AI Innovation",
      status: "completed" as const,
      strategy: "adaptive" as const,
      branches: [
        {
          id: "b1",
          parentId: null,
          subject: "AI Innovation",
          depth: 0,
          status: "completed" as const,
          ideas: [
            {
              title: "Idea 1",
              description: "desc",
              potentialImpact: "high",
              implementationHint: "hint",
            },
          ],
          subBranches: [],
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "b2",
          parentId: "b1",
          subject: "Sub-topic",
          depth: 1,
          status: "pruned" as const,
          ideas: [],
          subBranches: [],
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
      decisions: [],
      config: { maxBranches: 10, maxDepth: 3 },
      startedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      portfolio: {
        id: "p1",
        title: "AI Portfolio",
        summary: "Key findings",
        topIdeas: [
          {
            title: "Top Idea",
            description: "Description of top idea that is very detailed and long",
            sourceSubject: "AI Innovation",
            sourceBranchId: "b1",
            score: 90,
            feasibility: "high" as const,
          },
        ],
        themes: ["machine learning", "automation"],
        explorationMap: [],
        totalBranches: 2,
        totalIdeas: 1,
        durationMs: 5000,
        createdAt: "2024-01-01T00:00:00Z",
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = autonomousRunToMarkdown(run as any);

    expect(md).toContain("# Autonomous Innovation: AI Innovation");
    expect(md).toContain("**Status:** completed");
    expect(md).toContain("## Portfolio");
    expect(md).toContain("AI Portfolio");
    expect(md).toContain("Top Idea");
    expect(md).toContain("machine learning");
    expect(md).toContain("## Exploration Map");
    expect(md).toContain("✅ AI Innovation");
    expect(md).toContain("✂️ Sub-topic");
  });

  it("handles run without portfolio", () => {
    const run = {
      id: "run-1",
      rootSubject: "Test",
      status: "exploring" as const,
      strategy: "adaptive",
      branches: [
        {
          id: "b1",
          parentId: null,
          subject: "Test",
          depth: 0,
          status: "active" as const,
          ideas: [],
          subBranches: [],
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
      decisions: [],
      config: {},
      startedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = autonomousRunToMarkdown(run as any);
    expect(md).toContain("# Autonomous Innovation: Test");
    expect(md).not.toContain("## Portfolio");
    expect(md).toContain("## Exploration Map");
  });
});
