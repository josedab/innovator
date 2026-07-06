import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  selectTopIdea: vi.fn(),
  innovationToPR: vi.fn(),
  workflowToScript: vi.fn(),
  generateText: vi.fn(),
  extractJson: vi.fn(),
  withRetry: vi.fn(),
}));

import {
  selectTopIdea,
  innovationToPR,
  workflowToScript,
  generateText,
  extractJson,
  withRetry,
} from "@innovator/core";
import type { InnovationIdea } from "@innovator/core";
import { POST } from "../idea-to-pr/route";

const mockSelectTopIdea = vi.mocked(selectTopIdea);
const mockInnovationToPR = vi.mocked(innovationToPR);
const mockWorkflowToScript = vi.mocked(workflowToScript);
const mockWithRetry = vi.mocked(withRetry);

// --- Test data ---

const MOCK_IDEA = {
  title: "Test idea",
  description: "A test innovation idea",
  potentialImpact: "High impact",
  sourceAngle: "scamper" as const,
  feasibility: "high" as const,
};

const MOCK_SYNTHESIS = {
  topIdeas: [MOCK_IDEA],
  themes: ["theme1"],
  recommendation: "Do this",
};

const MOCK_CONFIG = {
  owner: "user",
  repo: "repo",
  baseBranch: "main",
  branchPrefix: "innovation/",
  labels: ["innovation"],
  draft: true,
  stack: "typescript" as const,
  license: "MIT" as const,
};

const MOCK_PR_RESULT = {
  status: "planned",
  branchName: "innovation/test-idea",
  prTitle: "💡 Innovation: Test idea",
  filesCreated: 3,
  workflowPlan: {
    idea: { title: "Test" },
    branchName: "innovation/test",
    scaffold: null,
    prTitle: "Test",
    prBody: "Body",
    commands: [],
    createdAt: "2024-01-01",
  },
};

const MOCK_SCRIPT = "#!/bin/bash\necho 'hello'";

const MOCK_PLAN = {
  overview: "Test plan overview",
  phases: [
    {
      name: "Phase 1",
      description: "Setup",
      tasks: ["Task 1"],
      deliverables: ["Deliverable 1"],
    },
  ],
  risks: [{ risk: "Risk 1", mitigation: "Mitigate 1" }],
  estimatedComplexity: "medium",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/idea-to-pr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/idea-to-pr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PR result for valid input", async () => {
    mockInnovationToPR.mockReturnValue(MOCK_PR_RESULT as any);
    mockWorkflowToScript.mockReturnValue(MOCK_SCRIPT);

    const res = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: MOCK_CONFIG,
        ideaIndex: 0,
        generatePlan: false,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("planned");
    expect(data.branchName).toBe("innovation/test-idea");
    expect(data.filesCreated).toBe(3);
    expect(data.script).toBe(MOCK_SCRIPT);
    expect(mockInnovationToPR).toHaveBeenCalledOnce();
  });

  it("returns 400 for missing synthesis", async () => {
    const res = await POST(
      makeRequest({
        config: MOCK_CONFIG,
        ideaIndex: 0,
        generatePlan: false,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 for missing config.owner", async () => {
    const res = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: { ...MOCK_CONFIG, owner: "" },
        ideaIndex: 0,
        generatePlan: false,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid request");
  });

  it("returns 400 when synthesis has no ideas", async () => {
    const res = await POST(
      makeRequest({
        synthesis: { ...MOCK_SYNTHESIS, topIdeas: [] },
        config: MOCK_CONFIG,
        generatePlan: false,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid request");
  });

  it("falls back to selectTopIdea when ideaIndex is out of bounds", async () => {
    const fallbackIdea: InnovationIdea = {
      title: "Fallback idea",
      description: "Selected by algorithm",
      potentialImpact: "Medium",
      implementationHint: "",
    };
    mockSelectTopIdea.mockReturnValue(fallbackIdea);
    mockInnovationToPR.mockReturnValue(MOCK_PR_RESULT as any);
    mockWorkflowToScript.mockReturnValue(MOCK_SCRIPT);

    const res = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: MOCK_CONFIG,
        ideaIndex: 99,
        generatePlan: false,
      })
    );

    // ideaIndex 99 exceeds max(49) so Zod rejects it — use a valid but OOB index
    expect(res.status).toBe(400);

    // Now test with index within Zod range but beyond array length
    const res2 = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: MOCK_CONFIG,
        ideaIndex: 5,
        generatePlan: false,
      })
    );
    const data2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(mockSelectTopIdea).toHaveBeenCalledOnce();
    expect(data2.status).toBe("planned");
  });

  it("returns 500 when innovationToPR throws", async () => {
    mockInnovationToPR.mockImplementation(() => {
      throw new Error("PR creation failed");
    });

    const res = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: MOCK_CONFIG,
        ideaIndex: 0,
        generatePlan: false,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("PR pipeline failed. Please try again.");
  });

  it("generates implementation plan when generatePlan is true", async () => {
    mockWithRetry.mockResolvedValue(MOCK_PLAN as any);
    mockInnovationToPR.mockReturnValue(MOCK_PR_RESULT as any);
    mockWorkflowToScript.mockReturnValue(MOCK_SCRIPT);

    const res = await POST(
      makeRequest({
        synthesis: MOCK_SYNTHESIS,
        config: MOCK_CONFIG,
        ideaIndex: 0,
        generatePlan: true,
        model: "gpt-4.1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.implementationPlan).toEqual(MOCK_PLAN);
    expect(mockWithRetry).toHaveBeenCalledOnce();
  });
});
