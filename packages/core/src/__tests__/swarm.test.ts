import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { runSwarm, swarmToMarkdown, detectPersonalityConflicts } from "../swarm/index.js";
import { PERSONALITY_DESCRIPTIONS, SwarmResultSchema } from "../swarm/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("swarm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PERSONALITY_DESCRIPTIONS", () => {
    it("should define descriptions for all personalities", () => {
      expect(Object.keys(PERSONALITY_DESCRIPTIONS)).toHaveLength(8);
      expect(PERSONALITY_DESCRIPTIONS["risk-taker"]).toBeTruthy();
      expect(PERSONALITY_DESCRIPTIONS["pragmatist"]).toBeTruthy();
    });
  });

  describe("runSwarm", () => {
    it("should run a multi-agent swarm and return results", async () => {
      const exploreResponse = JSON.stringify({
        ideas: [
          {
            title: "Test Idea",
            description: "A test idea",
            confidence: 0.8,
            tags: ["test"],
          },
        ],
      });

      const reactResponse = JSON.stringify({
        type: "endorse",
        comment: "Great idea!",
      });

      const convergeResponse = JSON.stringify({
        ideas: [
          {
            title: "Converged Idea",
            description: "A converged idea",
            potentialImpact: "High",
            originAgents: ["agent-0"],
            originPersonalities: ["risk-taker"],
            confidence: 0.9,
            endorsements: 2,
            challenges: [],
            evolutionPath: ["initial"],
          },
        ],
        convergenceScore: 0.8,
        dominantThemes: ["innovation"],
        emergentInsights: ["cross-pollination works"],
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(async () => {
        callCount++;
        // First N calls are explore, then react, then converge
        if (callCount <= 2) return exploreResponse;
        if (callCount <= 4) return reactResponse;
        return convergeResponse;
      });

      const result = await runSwarm("AI assistants", undefined, {
        agentCount: 2,
        maxIterations: 1,
      });

      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0].title).toBe("Converged Idea");
      expect(result.agentContributions).toHaveLength(2);
      expect(result.dominantThemes).toContain("innovation");
    });

    it("should call onProgress callback", async () => {
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          ideas: [{ title: "T", description: "D", confidence: 0.5, tags: [] }],
        })
      );
      // Override converge response at end
      let callIdx = 0;
      mockGenerateText.mockImplementation(async () => {
        callIdx++;
        if (callIdx > 4) {
          return JSON.stringify({
            ideas: [],
            convergenceScore: 0.5,
            dominantThemes: [],
            emergentInsights: [],
          });
        }
        if (callIdx > 2) {
          return JSON.stringify({ type: "endorse", comment: "ok" });
        }
        return JSON.stringify({
          ideas: [{ title: "T", description: "D", confidence: 0.5, tags: [] }],
        });
      });

      const progress: string[] = [];
      await runSwarm("test", undefined, {
        agentCount: 2,
        maxIterations: 1,
        onProgress: (p) => progress.push(p.stage),
      });

      expect(progress).toContain("initializing");
      expect(progress).toContain("exploring");
    });
  });

  describe("swarmToMarkdown", () => {
    it("should convert result to markdown", () => {
      const result = SwarmResultSchema.parse({
        ideas: [
          {
            title: "Test Idea",
            description: "Description",
            potentialImpact: "High",
            originAgents: ["a-0"],
            originPersonalities: ["risk-taker"],
            confidence: 0.9,
            endorsements: 3,
            challenges: ["challenge1"],
            evolutionPath: ["v1"],
          },
        ],
        totalIterations: 2,
        convergenceScore: 0.85,
        agentContributions: [
          {
            agentId: "a-0",
            personality: "risk-taker",
            discoveriesCount: 3,
            endorsementsGiven: 2,
            challengesMade: 1,
          },
        ],
        dominantThemes: ["theme1"],
        emergentInsights: ["insight1"],
      });

      const md = swarmToMarkdown(result);
      expect(md).toContain("Innovation Swarm Results");
      expect(md).toContain("Test Idea");
      expect(md).toContain("85%");
    });
  });

  describe("detectPersonalityConflicts", () => {
    it("should detect conflicts between agents with opposing reactions", () => {
      const blackboard = {
        entries: [
          {
            id: "entry-1",
            agentId: "agent-0",
            personality: "risk-taker" as const,
            content: "Bold idea",
            ideaTitle: "Bold Idea",
            ideaDescription: "A bold idea",
            confidence: 0.8,
            tags: [],
            iteration: 0,
            createdAt: new Date().toISOString(),
            reactions: [
              { agentId: "agent-1", type: "endorse" as const, comment: "Love it" },
              { agentId: "agent-2", type: "challenge" as const, comment: "Too risky" },
            ],
          },
          {
            id: "entry-2",
            agentId: "agent-1",
            personality: "pragmatist" as const,
            content: "Safe idea",
            ideaTitle: "Safe Idea",
            ideaDescription: "A safe idea",
            confidence: 0.6,
            tags: [],
            iteration: 0,
            createdAt: new Date().toISOString(),
            reactions: [
              { agentId: "agent-2", type: "endorse" as const, comment: "Makes sense" },
              { agentId: "agent-0", type: "challenge" as const, comment: "Too boring" },
            ],
          },
        ],
        convergenceScore: 0.5,
        dominantThemes: [],
      };

      const conflicts = detectPersonalityConflicts(blackboard);
      // agent-1 endorsed entry-1, agent-2 challenged entry-1 → conflict
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it("should return empty for no conflicts", () => {
      const blackboard = {
        entries: [
          {
            id: "entry-1",
            agentId: "agent-0",
            personality: "risk-taker" as const,
            content: "Idea",
            ideaTitle: "Idea",
            ideaDescription: "An idea",
            confidence: 0.8,
            tags: [],
            iteration: 0,
            createdAt: new Date().toISOString(),
            reactions: [
              { agentId: "agent-1", type: "endorse" as const, comment: "Good" },
              { agentId: "agent-2", type: "endorse" as const, comment: "Also good" },
            ],
          },
        ],
        convergenceScore: 0.9,
        dominantThemes: [],
      };

      const conflicts = detectPersonalityConflicts(blackboard);
      expect(conflicts).toHaveLength(0);
    });
  });
});
