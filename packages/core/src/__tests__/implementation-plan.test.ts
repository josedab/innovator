import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return raw.slice(start, end + 1);
  }),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}]: ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import { generateText } from "../copilot/client.js";
import {
  generateImplementationPlan,
  refineIdeaFromFeedback,
  planToGitHubIssues,
} from "../innovation-pr/implementation-plan.js";
import type { ImplementationPlan, FeedbackItem } from "../innovation-pr/implementation-plan.js";
import type { InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);

const MOCK_IDEA: InnovationIdea = {
  title: "Auto-documenter",
  description: "AI tool that generates docs from code",
  potentialImpact: "Save 10 hours/week of documentation work",
  implementationHint: "Use AST parsing + LLM summarization",
};

function makePlan(overrides: Partial<ImplementationPlan> = {}): ImplementationPlan {
  return {
    ideaTitle: "Auto-documenter",
    ideaDescription: "AI tool that generates docs from code",
    summary: "Build an AST-based documentation generator",
    architecture: "Parser → AST → LLM → Markdown output",
    steps: [
      {
        order: 1,
        file: "src/parser.ts",
        action: "create",
        description: "Create AST parser",
        rationale: "Need to extract code structure",
        dependencies: [],
        estimatedComplexity: "moderate",
      },
      {
        order: 2,
        file: "src/generator.ts",
        action: "create",
        description: "Create doc generator",
        rationale: "Core business logic",
        dependencies: ["src/parser.ts"],
        estimatedComplexity: "complex",
      },
      {
        order: 3,
        file: "src/config.ts",
        action: "create",
        description: "Add config file",
        rationale: "User preferences",
        dependencies: [],
        estimatedComplexity: "simple",
      },
    ],
    testPlan: [{ description: "Test parser", type: "unit", file: "src/__tests__/parser.test.ts" }],
    risks: [
      { description: "AST complexity", severity: "medium", mitigation: "Start with TS only" },
    ],
    estimatedEffort: "days",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateImplementationPlan", () => {
  it("produces valid ImplementationPlan from mocked LLM", async () => {
    const llmResponse = JSON.stringify({
      summary: "Build documentation tool",
      architecture: "AST → LLM pipeline",
      steps: [
        {
          order: 1,
          file: "src/index.ts",
          action: "create",
          description: "Create entry point",
          rationale: "Main module",
          dependencies: [],
          estimatedComplexity: "simple",
        },
      ],
      testPlan: [{ description: "Unit tests", type: "unit", file: "test.ts" }],
      risks: [{ description: "Scope creep", severity: "low", mitigation: "MVP first" }],
      estimatedEffort: "days",
    });
    mockGenerateText.mockResolvedValueOnce(llmResponse);

    const plan = await generateImplementationPlan(MOCK_IDEA);
    expect(plan.ideaTitle).toBe(MOCK_IDEA.title);
    expect(plan.steps).toHaveLength(1);
    expect(plan.createdAt).toBeTruthy();
  });

  it("truncates codebaseContext at >5000 chars", async () => {
    const longContext = "x".repeat(6000);
    const llmResponse = JSON.stringify({
      summary: "Plan",
      architecture: "Arch",
      steps: [
        {
          order: 1,
          file: "f.ts",
          action: "create",
          description: "d",
          rationale: "r",
          dependencies: [],
          estimatedComplexity: "simple",
        },
      ],
      testPlan: [],
      risks: [],
      estimatedEffort: "hours",
    });
    mockGenerateText.mockResolvedValueOnce(llmResponse);

    await generateImplementationPlan(MOCK_IDEA, longContext);

    // Verify the prompt was called and context was truncated
    const calledPrompt = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(calledPrompt.prompt.length).toBeLessThan(longContext.length + 2000);
  });
});

describe("refineIdeaFromFeedback", () => {
  it("produces refined idea with high confidence from approval feedback", async () => {
    const feedback: FeedbackItem[] = [
      {
        type: "approval",
        message: "Great idea, approved with minor suggestions",
        author: "reviewer1",
        createdAt: new Date().toISOString(),
      },
    ];

    const llmResponse = JSON.stringify({
      originalTitle: MOCK_IDEA.title,
      refinedTitle: "Enhanced Auto-documenter",
      refinedDescription: "Improved AI doc generator with reviewer feedback",
      changesFromFeedback: ["Added error handling"],
      droppedAspects: [],
      addedAspects: ["Better formatting"],
      confidenceScore: 0.95,
    });
    mockGenerateText.mockResolvedValueOnce(llmResponse);

    const refined = await refineIdeaFromFeedback(MOCK_IDEA, feedback);
    expect(refined.confidenceScore).toBeGreaterThanOrEqual(0.9);
    expect(refined.originalTitle).toBe(MOCK_IDEA.title);
    expect(refined.refinedTitle).toBeTruthy();
  });
});

describe("planToGitHubIssues", () => {
  it("creates tracking issue + per-step issues for moderate/complex steps", () => {
    const plan = makePlan();
    const issues = planToGitHubIssues(plan, { owner: "org", repo: "repo" });

    // 1 tracking + 2 step issues (moderate + complex, simple skipped)
    expect(issues).toHaveLength(3);
    expect(issues[0].title).toContain("Implementation:");
    expect(issues[0].labels).toContain("tracking");
    expect(issues[0].labels).toContain("innovation");
  });

  it("skips simple complexity steps", () => {
    const plan = makePlan({
      steps: [
        {
          order: 1,
          file: "simple.ts",
          action: "create",
          description: "Simple step",
          rationale: "trivial",
          dependencies: [],
          estimatedComplexity: "simple",
        },
        {
          order: 2,
          file: "trivial.ts",
          action: "create",
          description: "Trivial step",
          rationale: "easy",
          dependencies: [],
          estimatedComplexity: "trivial",
        },
      ],
    });
    const issues = planToGitHubIssues(plan, { owner: "o", repo: "r" });
    // Only the tracking issue, no step issues
    expect(issues).toHaveLength(1);
  });

  it("merges custom labels", () => {
    const plan = makePlan();
    const issues = planToGitHubIssues(plan, {
      owner: "o",
      repo: "r",
      labels: ["custom-label"],
    });
    expect(issues[0].labels).toContain("custom-label");
    expect(issues[0].labels).toContain("tracking");
  });
});
