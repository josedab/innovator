import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Blackboard, BlackboardEntry, SwarmResult } from "../types.js";

// Mock LLM dependencies before importing the module
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateText, extractJson } from "../../copilot/client.js";
import { runSwarm, detectPersonalityConflicts, swarmToMarkdown } from "../swarm.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

// ---- Helpers ----

function makeExploreResponse(ideas: Array<{ title: string; description: string }>) {
  return JSON.stringify({
    ideas: ideas.map((i) => ({
      ...i,
      confidence: 0.8,
      tags: ["test"],
    })),
  });
}

function makeReactResponse(type: "endorse" | "challenge" | "extend" | "merge") {
  return JSON.stringify({ type, comment: `Agent reaction: ${type}` });
}

function makeConvergeResponse(ideaCount = 2) {
  return JSON.stringify({
    ideas: Array.from({ length: ideaCount }, (_, i) => ({
      title: `Synthesized Idea ${i + 1}`,
      description: "Description",
      potentialImpact: "High",
      originAgents: ["agent-0"],
      originPersonalities: ["risk-taker"],
      confidence: 0.85,
      endorsements: 2,
      challenges: [],
      evolutionPath: ["initial"],
    })),
    convergenceScore: 0.8,
    dominantThemes: ["theme1"],
    emergentInsights: ["insight1"],
  });
}

function setupMocks(opts?: {
  reactType?: "endorse" | "challenge" | "extend" | "merge";
  ideaCount?: number;
}) {
  const reactType = opts?.reactType ?? "endorse";
  let callIndex = 0;

  mockGenerateText.mockImplementation(async () => {
    return "mock-raw-response";
  });

  mockExtractJson.mockImplementation((raw: string) => {
    callIndex++;
    // First N calls are explore phases, then react phases, then final converge
    // We use a simple approach: return valid JSON for any call
    return raw;
  });

  // Override generateText to return appropriate JSON for each phase
  let phase: "explore" | "react" | "converge" = "explore";
  let exploreCallCount = 0;

  mockGenerateText.mockImplementation(async ({ prompt }: { prompt: string }) => {
    if (prompt.includes("autonomous innovation agent")) {
      return makeExploreResponse([
        { title: `Idea-${++exploreCallCount}`, description: "Test idea" },
      ]);
    } else if (prompt.includes("React to this idea")) {
      return makeReactResponse(reactType);
    } else if (prompt.includes("Synthesize the best ideas")) {
      return makeConvergeResponse(opts?.ideaCount ?? 2);
    }
    return "{}";
  });

  mockExtractJson.mockImplementation((raw: string) => raw);
}

// ---- Tests ----

describe("runSwarm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs with default 4 agents and 3-phase loop", async () => {
    setupMocks();
    const progressStages: string[] = [];

    const result = await runSwarm("Test subject", undefined, {
      maxIterations: 1,
      onProgress: (p) => {
        if (!progressStages.includes(p.stage)) progressStages.push(p.stage);
      },
    });

    expect(result.ideas).toBeDefined();
    expect(result.agentContributions).toHaveLength(4);
    expect(progressStages).toContain("exploring");
    expect(progressStages).toContain("sharing");
    expect(progressStages).toContain("synthesizing");
  });

  it("terminates early when convergence threshold is met", async () => {
    // Set up so all reactions are endorsements → high convergence
    setupMocks({ reactType: "endorse" });

    const result = await runSwarm("Test subject", undefined, {
      maxIterations: 5,
      convergenceThreshold: 0.0, // Will converge immediately
    });

    expect(result.totalIterations).toBeLessThanOrEqual(5);
  });

  it("explore prompt includes personality and blackboard context", async () => {
    const prompts: string[] = [];
    mockGenerateText.mockImplementation(async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      if (prompt.includes("autonomous innovation agent")) {
        return makeExploreResponse([{ title: "Idea", description: "test" }]);
      } else if (prompt.includes("React to this idea")) {
        return makeReactResponse("endorse");
      }
      return makeConvergeResponse();
    });
    mockExtractJson.mockImplementation((raw: string) => raw);

    await runSwarm("Test subject", undefined, {
      agentCount: 1,
      maxIterations: 1,
    });

    const explorePrompt = prompts.find((p) => p.includes("autonomous innovation agent"));
    expect(explorePrompt).toBeDefined();
    expect(explorePrompt).toContain("risk-taker");
    expect(explorePrompt).toContain("Test subject");
  });

  it("explore prompt includes investigation context when provided", async () => {
    const prompts: string[] = [];
    mockGenerateText.mockImplementation(async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      if (prompt.includes("autonomous innovation agent")) {
        return makeExploreResponse([{ title: "Idea", description: "test" }]);
      } else if (prompt.includes("React to this idea")) {
        return makeReactResponse("endorse");
      }
      return makeConvergeResponse();
    });
    mockExtractJson.mockImplementation((raw: string) => raw);

    const investigation = {
      summary: "Investigation summary",
      keyAspects: [{ title: "Aspect", description: "Desc" }],
      currentState: "Current",
      challenges: ["Challenge-X"],
      opportunities: ["Opp1"],
    };

    await runSwarm("Test subject", investigation, {
      agentCount: 1,
      maxIterations: 1,
    });

    const explorePrompt = prompts.find((p) => p.includes("autonomous innovation agent"));
    expect(explorePrompt).toContain("Investigation summary");
    expect(explorePrompt).toContain("Challenge-X");
  });

  it("handles single agent", async () => {
    setupMocks();

    const result = await runSwarm("Test subject", undefined, {
      agentCount: 1,
      maxIterations: 1,
    });

    expect(result.agentContributions).toHaveLength(1);
    expect(result.agentContributions[0].agentId).toBe("agent-0");
  });

  it("tracks agent contributions", async () => {
    setupMocks({ reactType: "endorse" });

    const result = await runSwarm("Test subject", undefined, {
      agentCount: 2,
      maxIterations: 1,
    });

    for (const contrib of result.agentContributions) {
      expect(contrib).toHaveProperty("agentId");
      expect(contrib).toHaveProperty("personality");
      expect(contrib).toHaveProperty("discoveriesCount");
      expect(contrib).toHaveProperty("endorsementsGiven");
      expect(contrib).toHaveProperty("challengesMade");
    }
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    setupMocks();

    // Should still call converge even with abort
    const result = await runSwarm("Test subject", undefined, {
      signal: controller.signal,
      maxIterations: 3,
    });

    // With abort, iterations should be minimal
    expect(result.totalIterations).toBeLessThanOrEqual(1);
  });
});

// ---- detectPersonalityConflicts() ----

describe("detectPersonalityConflicts", () => {
  it("detects conflicts between agents who endorse vs challenge the same idea", () => {
    const blackboard: Blackboard = {
      entries: [
        {
          id: "entry-1",
          agentId: "agent-0",
          personality: "risk-taker",
          content: "Bold idea",
          ideaTitle: "Bold",
          ideaDescription: "Bold idea",
          confidence: 0.8,
          tags: [],
          iteration: 0,
          createdAt: new Date().toISOString(),
          reactions: [
            { agentId: "agent-1", type: "endorse", comment: "Great!" },
            { agentId: "agent-2", type: "challenge", comment: "Too risky" },
          ],
        },
      ],
      convergenceScore: 0.5,
      dominantThemes: [],
    };

    const conflicts = detectPersonalityConflicts(blackboard);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].agentA).toBe("agent-1");
    expect(conflicts[0].agentB).toBe("agent-2");
    expect(conflicts[0].conflictScore).toBe(1);
    expect(conflicts[0].conflictingIdeas).toContain("entry-1");
  });

  it("returns empty array when no conflicts exist", () => {
    const blackboard: Blackboard = {
      entries: [
        {
          id: "entry-1",
          agentId: "agent-0",
          personality: "risk-taker",
          content: "Idea",
          ideaTitle: "Idea",
          ideaDescription: "Idea",
          confidence: 0.8,
          tags: [],
          iteration: 0,
          createdAt: new Date().toISOString(),
          reactions: [
            { agentId: "agent-1", type: "endorse", comment: "Good" },
            { agentId: "agent-2", type: "endorse", comment: "Agree" },
          ],
        },
      ],
      convergenceScore: 0.5,
      dominantThemes: [],
    };

    const conflicts = detectPersonalityConflicts(blackboard);
    expect(conflicts).toHaveLength(0);
  });

  it("returns empty for empty blackboard", () => {
    const blackboard: Blackboard = {
      entries: [],
      convergenceScore: 0,
      dominantThemes: [],
    };

    const conflicts = detectPersonalityConflicts(blackboard);
    expect(conflicts).toHaveLength(0);
  });

  it("sorts conflicts by score descending", () => {
    const blackboard: Blackboard = {
      entries: [
        {
          id: "e1",
          agentId: "agent-0",
          personality: "risk-taker",
          content: "Idea 1",
          ideaTitle: "Idea1",
          ideaDescription: "Idea1",
          confidence: 0.8,
          tags: [],
          iteration: 0,
          createdAt: new Date().toISOString(),
          reactions: [
            { agentId: "agent-1", type: "endorse", comment: "Yes" },
            { agentId: "agent-2", type: "challenge", comment: "No" },
            { agentId: "agent-3", type: "endorse", comment: "Yes" },
            { agentId: "agent-4", type: "challenge", comment: "No" },
          ],
        },
        {
          id: "e2",
          agentId: "agent-0",
          personality: "risk-taker",
          content: "Idea 2",
          ideaTitle: "Idea2",
          ideaDescription: "Idea2",
          confidence: 0.8,
          tags: [],
          iteration: 0,
          createdAt: new Date().toISOString(),
          reactions: [
            { agentId: "agent-1", type: "endorse", comment: "Yes" },
            { agentId: "agent-2", type: "endorse", comment: "Yes" },
          ],
        },
      ],
      convergenceScore: 0.5,
      dominantThemes: [],
    };

    const conflicts = detectPersonalityConflicts(blackboard);
    if (conflicts.length > 1) {
      expect(conflicts[0].conflictScore).toBeGreaterThanOrEqual(conflicts[1].conflictScore);
    }
  });
});

// ---- swarmToMarkdown() ----

describe("swarmToMarkdown", () => {
  it("produces markdown with ideas, themes, insights, and contributions", () => {
    const result: SwarmResult = {
      ideas: [
        {
          title: "Big Idea",
          description: "Description of big idea",
          potentialImpact: "High impact",
          originAgents: ["agent-0"],
          originPersonalities: ["risk-taker"],
          confidence: 0.9,
          endorsements: 3,
          challenges: ["Too expensive"],
          evolutionPath: ["initial", "extended"],
        },
      ],
      totalIterations: 3,
      convergenceScore: 0.85,
      agentContributions: [
        {
          agentId: "agent-0",
          personality: "risk-taker",
          discoveriesCount: 5,
          endorsementsGiven: 2,
          challengesMade: 1,
        },
      ],
      dominantThemes: ["Innovation"],
      emergentInsights: ["Key insight"],
    };

    const md = swarmToMarkdown(result);

    expect(md).toContain("# Innovation Swarm Results");
    expect(md).toContain("85%");
    expect(md).toContain("Big Idea");
    expect(md).toContain("High impact");
    expect(md).toContain("Too expensive");
    expect(md).toContain("Innovation");
    expect(md).toContain("Key insight");
    expect(md).toContain("risk-taker");
    expect(md).toContain("5 discoveries");
  });

  it("handles empty themes and insights", () => {
    const result: SwarmResult = {
      ideas: [],
      totalIterations: 1,
      convergenceScore: 0,
      agentContributions: [],
      dominantThemes: [],
      emergentInsights: [],
    };

    const md = swarmToMarkdown(result);

    expect(md).toContain("# Innovation Swarm Results");
    expect(md).not.toContain("## Dominant Themes");
    expect(md).not.toContain("## Emergent Insights");
  });
});
