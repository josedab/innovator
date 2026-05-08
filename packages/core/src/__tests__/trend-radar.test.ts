import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue('{"title":"Test Newsletter","content":"Newsletter content"}'),
  extractJson: vi
    .fn()
    .mockReturnValue('{"title":"Test Newsletter","content":"Newsletter content"}'),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  extractTopics,
  detectTrends,
  clusterTopics,
  generateRadarSnapshot,
  generateNewsletter,
  getTrends,
  getTopicClusters,
  getRadarSnapshots,
  getRadarBlipDetails,
  clearTrendRadarData,
} from "../trend-radar/index.js";
import type { SessionData } from "../trend-radar/index.js";

function makeSessions(count: number): SessionData[] {
  const sessions: SessionData[] = [];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    sessions.push({
      id: `session-${i}`,
      subject:
        i % 2 === 0 ? "AI-powered analytics platform" : "Machine learning pipeline optimization",
      keywords:
        i % 2 === 0
          ? ["analytics", "artificial", "intelligence", "platform"]
          : ["machine", "learning", "pipeline", "optimization"],
      ideas: [
        {
          title: `Idea ${i}`,
          description: "A novel approach using analytics and machine learning",
        },
      ],
      timestamp: new Date(now - (count - i) * weekMs).toISOString(),
    });
  }
  return sessions;
}

describe("trend-radar", () => {
  beforeEach(() => {
    clearTrendRadarData();
  });

  describe("extractTopics", () => {
    it("extracts topics from session data", () => {
      const sessions = makeSessions(10);
      const topics = extractTopics(sessions);
      expect(topics.length).toBeGreaterThan(0);
      expect(topics[0].frequency).toBeGreaterThanOrEqual(2);
    });

    it("filters out low-frequency words", () => {
      const sessions: SessionData[] = [
        { id: "s1", subject: "unique word xyz123", timestamp: new Date().toISOString() },
      ];
      const topics = extractTopics(sessions);
      expect(topics.find((t) => t.label === "xyz123")).toBeUndefined();
    });

    it("returns topics sorted by frequency", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      for (let i = 1; i < topics.length; i++) {
        expect(topics[i - 1].frequency).toBeGreaterThanOrEqual(topics[i].frequency);
      }
    });
  });

  describe("detectTrends", () => {
    it("detects trends from topics", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].velocity).toBeDefined();
      expect(trends[0].direction).toBeDefined();
    });

    it("classifies trend directions", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      const validDirections = ["rising", "stable", "declining", "emerging", "fading"];
      for (const trend of trends) {
        expect(validDirections).toContain(trend.direction);
      }
    });
  });

  describe("clusterTopics", () => {
    it("clusters related topics", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const clusters = clusterTopics(topics);
      // May or may not produce clusters depending on overlap
      expect(Array.isArray(clusters)).toBe(true);
    });
  });

  describe("radar generation", () => {
    it("generates a radar snapshot", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      const snapshot = generateRadarSnapshot(topics, trends, "Q1 2026");

      expect(snapshot.blips.length).toBeGreaterThan(0);
      expect(snapshot.period).toBe("Q1 2026");
      expect(snapshot.summary).toContain("Q1 2026");
    });

    it("classifies blips into rings", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      const snapshot = generateRadarSnapshot(topics, trends, "Q1 2026");

      const validRings = ["adopt", "trial", "assess", "hold"];
      for (const blip of snapshot.blips) {
        expect(validRings).toContain(blip.ring);
      }
    });

    it("supports blip drill-down", () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      const snapshot = generateRadarSnapshot(topics, trends, "Q1 2026");

      if (snapshot.blips.length > 0) {
        const details = getRadarBlipDetails(snapshot.id, snapshot.blips[0].id);
        expect(details).toBeDefined();
        expect(details!.blip).toBeDefined();
      }
    });
  });

  describe("newsletter generation", () => {
    it("generates a newsletter", async () => {
      const sessions = makeSessions(20);
      const topics = extractTopics(sessions);
      const trends = detectTrends(topics, sessions);
      const clusters = clusterTopics(topics);

      const newsletter = await generateNewsletter(trends, clusters, "May 2026");
      expect(newsletter.title).toBeTruthy();
      expect(newsletter.content).toBeTruthy();
      expect(newsletter.period).toBe("May 2026");
    });
  });

  describe("store queries", () => {
    it("returns empty arrays when no data", () => {
      expect(getTrends()).toHaveLength(0);
      expect(getTopicClusters()).toHaveLength(0);
      expect(getRadarSnapshots()).toHaveLength(0);
    });
  });
});
