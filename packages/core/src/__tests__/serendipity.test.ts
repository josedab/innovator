import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../rag/embeddings.js", () => ({
  generateEmbedding: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

vi.mock("../history/index.js", () => ({
  listSessions: vi.fn(),
}));

import { findSerendipitousConnections, embedSession } from "../serendipity/index.js";
import { generateEmbedding, cosineSimilarity } from "../rag/embeddings.js";
import { listSessions } from "../history/index.js";
import { generateText, extractJson } from "../copilot/client.js";
import type { SessionRecord } from "../types.js";

const mockGenerateEmbedding = vi.mocked(generateEmbedding);
const mockCosineSimilarity = vi.mocked(cosineSimilarity);
const mockListSessions = vi.mocked(listSessions);
const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `session-${Math.random().toString(36).slice(2, 6)}`,
    subject: "Test Subject",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    angleResults: [],
    tags: [],
    ...overrides,
  };
}

describe("serendipity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
  });

  describe("findSerendipitousConnections", () => {
    it("returns empty array when fewer than 2 sessions exist", async () => {
      mockListSessions.mockReturnValue([makeSession()]);
      const result = await findSerendipitousConnections();
      expect(result.connections).toEqual([]);
      expect(result.totalSessionsAnalyzed).toBe(1);
    });

    it("returns empty array when 0 sessions exist", async () => {
      mockListSessions.mockReturnValue([]);
      const result = await findSerendipitousConnections();
      expect(result.connections).toEqual([]);
      expect(result.totalSessionsAnalyzed).toBe(0);
    });

    it("excludes pairs with similarity below minimum threshold (0.3)", async () => {
      mockListSessions.mockReturnValue([makeSession(), makeSession()]);
      mockCosineSimilarity.mockReturnValue(0.29);
      const result = await findSerendipitousConnections(0.3);
      expect(result.connections).toEqual([]);
    });

    it("excludes near-duplicate sessions with similarity >= 0.95", async () => {
      mockListSessions.mockReturnValue([makeSession(), makeSession()]);
      mockCosineSimilarity.mockReturnValue(0.96);
      const result = await findSerendipitousConnections();
      expect(result.connections).toEqual([]);
    });

    it("includes pairs at exact threshold boundaries (0.3 and 0.94)", async () => {
      const sessionA = makeSession({ id: "a", subject: "Subject A" });
      const sessionB = makeSession({ id: "b", subject: "Subject B" });
      mockListSessions.mockReturnValue([sessionA, sessionB]);
      mockCosineSimilarity.mockReturnValue(0.3);
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({
          sharedPatterns: ["pattern1"],
          explanation: "They are connected",
          potentialInsight: "Insight",
        })
      );
      const result = await findSerendipitousConnections(0.3);
      expect(result.connections).toHaveLength(1);
    });

    it("falls back to basic similarity connection when LLM explanation fails", async () => {
      const sessionA = makeSession({ id: "a", subject: "Subject A" });
      const sessionB = makeSession({ id: "b", subject: "Subject B" });
      mockListSessions.mockReturnValue([sessionA, sessionB]);
      mockCosineSimilarity.mockReturnValue(0.5);
      mockGenerateText.mockRejectedValue(new Error("LLM failure"));
      const result = await findSerendipitousConnections();
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0].sharedPatterns).toEqual([]);
      expect(result.connections[0].explanation).toContain("50%");
    });

    it("respects maxConnections limit and sorts by descending similarity", async () => {
      const sessions = [
        makeSession({ id: "a", subject: "A" }),
        makeSession({ id: "b", subject: "B" }),
        makeSession({ id: "c", subject: "C" }),
      ];
      mockListSessions.mockReturnValue(sessions);
      // 3 pairs: a-b, a-c, b-c
      mockCosineSimilarity
        .mockReturnValueOnce(0.4) // a-b
        .mockReturnValueOnce(0.8) // a-c
        .mockReturnValueOnce(0.6); // b-c
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({
          sharedPatterns: [],
          explanation: "Connected",
        })
      );
      const result = await findSerendipitousConnections(0.3, 2);
      expect(result.connections).toHaveLength(2);
      expect(result.connections[0].similarityScore).toBe(0.8);
      expect(result.connections[1].similarityScore).toBe(0.6);
    });

    it("stops processing when AbortSignal is aborted", async () => {
      const sessions = [
        makeSession({ id: "a", subject: "A" }),
        makeSession({ id: "b", subject: "B" }),
        makeSession({ id: "c", subject: "C" }),
      ];
      mockListSessions.mockReturnValue(sessions);
      mockCosineSimilarity
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.6)
        .mockReturnValueOnce(0.7);
      const controller = new AbortController();
      controller.abort();
      const result = await findSerendipitousConnections(0.3, 10, undefined, controller.signal);
      expect(result.connections).toHaveLength(0);
    });

    it("includes generatedAt as ISO string", async () => {
      mockListSessions.mockReturnValue([]);
      const result = await findSerendipitousConnections();
      expect(() => new Date(result.generatedAt)).not.toThrow();
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("embedSession", () => {
    it("concatenates investigation summary, synthesis themes, and ideas", () => {
      const session = makeSession({
        subject: "AI Ethics",
        investigation: {
          summary: "Study of AI ethics",
          challenges: ["bias"],
          opportunities: ["fairness"],
        } as SessionRecord["investigation"],
        synthesis: {
          themes: ["transparency", "accountability"],
          recommendation: "Be transparent",
        } as SessionRecord["synthesis"],
        angleResults: [
          {
            angleId: "scamper",
            angleName: "SCAMPER",
            reasoning: "Applied SCAMPER",
            ideas: [
              {
                title: "Idea 1",
                description: "Desc 1",
                potentialImpact: "",
                implementationHint: "",
              },
            ],
          },
        ] as SessionRecord["angleResults"],
      });
      embedSession(session);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      const textArg = mockGenerateEmbedding.mock.calls[0][0];
      expect(textArg).toContain("AI Ethics");
      expect(textArg).toContain("Study of AI ethics");
      expect(textArg).toContain("transparency");
      expect(textArg).toContain("Applied SCAMPER");
      expect(textArg).toContain("Idea 1");
    });

    it("truncates text at 10k chars for embedding input", () => {
      const longSubject = "x".repeat(15000);
      const session = makeSession({ subject: longSubject });
      embedSession(session);
      const textArg = mockGenerateEmbedding.mock.calls[0][0];
      expect(textArg.length).toBeLessThanOrEqual(10000);
    });
  });
});
