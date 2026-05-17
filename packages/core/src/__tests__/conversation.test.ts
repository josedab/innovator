import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  createConversation,
  getConversation,
  deleteConversation,
  listConversations,
  refineConversation,
  clearConversations,
  createExplorationTree,
  getExplorationTree,
  drillDown,
  getExplorationPath,
  getNodeBranches,
} from "../conversation/index.js";
import { generateText } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);

describe("conversation", () => {
  beforeEach(() => {
    clearConversations();
    vi.clearAllMocks();
  });

  describe("createConversation", () => {
    it("returns a context with UUID sessionId", () => {
      const ctx = createConversation({
        subject: "Test subject",
        angleResults: [],
      });
      expect(ctx.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(ctx.subject).toBe("Test subject");
      expect(ctx.messages).toEqual([]);
      expect(ctx.selectedIdeas).toEqual([]);
      expect(ctx.createdAt).toBeDefined();
      expect(ctx.updatedAt).toBeDefined();
    });

    it("stores investigation and synthesis", () => {
      const investigation = {
        summary: "Test",
        keyAspects: [],
        currentState: "current",
        challenges: ["c1"],
        opportunities: ["o1"],
      } as any;
      const ctx = createConversation({
        subject: "S",
        angleResults: [],
        investigation,
      });
      expect(ctx.investigation).toBe(investigation);
    });
  });

  describe("getConversation", () => {
    it("retrieves an existing conversation", () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      expect(getConversation(ctx.sessionId)).toBe(ctx);
    });

    it("returns undefined for unknown sessionId", () => {
      expect(getConversation("nonexistent")).toBeUndefined();
    });
  });

  describe("deleteConversation", () => {
    it("removes the conversation and returns true", () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      expect(deleteConversation(ctx.sessionId)).toBe(true);
      expect(getConversation(ctx.sessionId)).toBeUndefined();
    });

    it("returns false for unknown sessionId", () => {
      expect(deleteConversation("nonexistent")).toBe(false);
    });
  });

  describe("listConversations", () => {
    it("returns conversations sorted by updatedAt descending", () => {
      const _c1 = createConversation({ subject: "First", angleResults: [] });
      const _c2 = createConversation({ subject: "Second", angleResults: [] });

      const list = listConversations();
      expect(list).toHaveLength(2);
      // Most recently created should be first (or same timestamp)
      expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
    });

    it("returns empty array when no conversations", () => {
      expect(listConversations()).toEqual([]);
    });
  });

  describe("refineConversation", () => {
    it("appends user and assistant messages", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });

      const mockResponse = JSON.stringify({
        response: "Here are my thoughts",
        suggestions: ["Follow up 1"],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      const result = await refineConversation(ctx.sessionId, "Tell me more");

      expect(result.response).toBe("Here are my thoughts");
      expect(ctx.messages).toHaveLength(2);
      expect(ctx.messages[0].role).toBe("user");
      expect(ctx.messages[0].content).toBe("Tell me more");
      expect(ctx.messages[1].role).toBe("assistant");
    });

    it("updates updatedAt timestamp", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const originalUpdatedAt = ctx.updatedAt;

      const mockResponse = JSON.stringify({
        response: "Response",
        suggestions: [],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      await refineConversation(ctx.sessionId, "Message");

      expect(ctx.updatedAt >= originalUpdatedAt).toBe(true);
    });

    it("throws for unknown sessionId", async () => {
      await expect(refineConversation("nonexistent", "msg")).rejects.toThrow(
        'Conversation session "nonexistent" not found'
      );
    });

    it("updates selectedIdeas when provided", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });

      const mockResponse = JSON.stringify({
        response: "Response",
        suggestions: [],
      });
      mockGenerateText.mockResolvedValue(mockResponse);

      await refineConversation(ctx.sessionId, "msg", ["Idea A", "Idea B"]);

      expect(ctx.selectedIdeas).toEqual(["Idea A", "Idea B"]);
    });
  });

  describe("createExplorationTree", () => {
    it("creates tree with root node from conversation session", () => {
      const ctx = createConversation({
        subject: "AI Innovation",
        angleResults: [],
        synthesis: {
          topIdeas: [
            {
              title: "Idea1",
              description: "Desc1",
              sourceAngle: "SCAMPER",
              potentialImpact: "High",
              feasibility: "medium",
            },
          ],
          themes: ["AI"],
          recommendation: "Go for it",
        } as any,
        investigation: {
          summary: "AI is evolving",
          keyAspects: [],
          currentState: "",
          challenges: [],
          opportunities: [],
        } as any,
      });

      const tree = createExplorationTree(ctx.sessionId);
      expect(tree).not.toBeNull();
      expect(tree!.sessionId).toBe(ctx.sessionId);
      expect(tree!.subject).toBe("AI Innovation");
      expect(tree!.rootNodeId).toBeDefined();
      expect(tree!.nodes[tree!.rootNodeId].depth).toBe(0);
      expect(tree!.nodes[tree!.rootNodeId].ideas).toHaveLength(1);
      expect(tree!.nodes[tree!.rootNodeId].suggestions).toHaveLength(3);
    });

    it("returns null for non-existent session", () => {
      expect(createExplorationTree("nonexistent")).toBeNull();
    });
  });

  describe("getExplorationTree", () => {
    it("retrieves an existing tree", () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      createExplorationTree(ctx.sessionId);
      const tree = getExplorationTree(ctx.sessionId);
      expect(tree).toBeDefined();
      expect(tree!.sessionId).toBe(ctx.sessionId);
    });

    it("returns undefined for non-existent tree", () => {
      expect(getExplorationTree("nonexistent")).toBeUndefined();
    });
  });

  describe("drillDown", () => {
    it("creates a child node with mocked LLM", async () => {
      const ctx = createConversation({ subject: "Robotics", angleResults: [] });
      const tree = createExplorationTree(ctx.sessionId)!;
      const rootId = tree.rootNodeId;

      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          response: "Deeper analysis of robotics",
          updatedIdeas: [
            { title: "SubIdea", description: "D", potentialImpact: "P", implementationHint: "H" },
          ],
          suggestions: ["Go deeper"],
        })
      );

      const childNode = await drillDown(ctx.sessionId, rootId, "What about humanoid robots?");
      expect(childNode.parentId).toBe(rootId);
      expect(childNode.depth).toBe(1);
      expect(childNode.query).toBe("What about humanoid robots?");
      expect(childNode.response).toBe("Deeper analysis of robotics");
      expect(childNode.ideas).toHaveLength(1);
    });

    it("throws for non-existent tree", async () => {
      await expect(drillDown("nonexistent", "node", "q")).rejects.toThrow(
        "Exploration tree not found"
      );
    });

    it("throws for non-existent parent node", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      createExplorationTree(ctx.sessionId);
      await expect(drillDown(ctx.sessionId, "bad-node", "q")).rejects.toThrow(
        'Parent node "bad-node" not found'
      );
    });

    it("throws when max depth (20) is reached", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const tree = createExplorationTree(ctx.sessionId)!;
      // Manually set root node depth to 20
      tree.nodes[tree.rootNodeId].depth = 20;
      await expect(drillDown(ctx.sessionId, tree.rootNodeId, "q")).rejects.toThrow(
        "Maximum exploration depth reached"
      );
    });
  });

  describe("getExplorationPath", () => {
    it("returns path from root to leaf", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const tree = createExplorationTree(ctx.sessionId)!;

      mockGenerateText.mockResolvedValue(JSON.stringify({ response: "R", suggestions: ["S"] }));

      const child = await drillDown(ctx.sessionId, tree.rootNodeId, "q1");
      const path = getExplorationPath(ctx.sessionId, child.id);
      expect(path).toHaveLength(2);
      expect(path[0].id).toBe(tree.rootNodeId); // root first
      expect(path[1].id).toBe(child.id); // leaf last
    });

    it("returns empty for non-existent tree", () => {
      expect(getExplorationPath("nonexistent", "node")).toEqual([]);
    });
  });

  describe("getNodeBranches", () => {
    it("returns sibling branches from a node", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const tree = createExplorationTree(ctx.sessionId)!;

      mockGenerateText.mockResolvedValue(JSON.stringify({ response: "R", suggestions: ["S"] }));

      await drillDown(ctx.sessionId, tree.rootNodeId, "branch1");
      await drillDown(ctx.sessionId, tree.rootNodeId, "branch2");

      const branches = getNodeBranches(ctx.sessionId, tree.rootNodeId);
      expect(branches).toHaveLength(2);
    });

    it("returns empty for non-existent tree", () => {
      expect(getNodeBranches("nonexistent", "node")).toEqual([]);
    });

    it("returns empty for leaf node", async () => {
      const ctx = createConversation({ subject: "S", angleResults: [] });
      const tree = createExplorationTree(ctx.sessionId)!;

      mockGenerateText.mockResolvedValue(JSON.stringify({ response: "R", suggestions: ["S"] }));

      const child = await drillDown(ctx.sessionId, tree.rootNodeId, "q");
      const branches = getNodeBranches(ctx.sessionId, child.id);
      expect(branches).toHaveLength(0);
    });
  });
});
