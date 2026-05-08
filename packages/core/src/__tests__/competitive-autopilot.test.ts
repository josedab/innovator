import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue(
      '{"significanceScore":0.8,"threatLevel":"high","classification":"threat","domains":["AI"]}'
    ),
  extractJson: vi
    .fn()
    .mockReturnValue(
      '{"significanceScore":0.8,"threatLevel":"high","classification":"threat","domains":["AI"]}'
    ),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  registerConnector,
  getConnector,
  listConnectors,
  toggleConnector,
  scoreCompetitiveEvent,
  recordCompetitiveEvent,
  getCompetitiveEvents,
  registerAutoTriggerRule,
  listAutoTriggerRules,
  evaluateTriggerRules,
  getTriggeredSessions,
  generateLandscape,
  generateTimeline,
  clearCompetitiveAutopilotData,
} from "../competitive-autopilot/index.js";
import type { CompetitiveEvent, ConnectorConfig } from "../competitive-autopilot/index.js";

function makeConnector(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: "gh-conn",
    source: "github-repo",
    name: "GitHub Monitor",
    enabled: true,
    pollIntervalMinutes: 60,
    filters: { competitors: ["competitor-org"] },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CompetitiveEvent> = {}): CompetitiveEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    source: "github-repo",
    title: "Competitor launched new AI feature",
    description: "Major release with ML capabilities",
    competitorName: "CompetitorX",
    significanceScore: 0.8,
    threatLevel: "high",
    classification: "threat",
    domains: ["AI/ML"],
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("competitive-autopilot", () => {
  beforeEach(() => {
    clearCompetitiveAutopilotData();
  });

  describe("connectors", () => {
    it("registers and retrieves a connector", () => {
      registerConnector(makeConnector());
      const connector = getConnector("gh-conn");
      expect(connector).toBeDefined();
      expect(connector!.source).toBe("github-repo");
    });

    it("lists all connectors", () => {
      registerConnector(makeConnector({ id: "c1" }));
      registerConnector(makeConnector({ id: "c2", source: "product-hunt" }));
      expect(listConnectors()).toHaveLength(2);
    });

    it("toggles connector enabled state", () => {
      registerConnector(makeConnector());
      toggleConnector("gh-conn", false);
      expect(getConnector("gh-conn")!.enabled).toBe(false);
    });
  });

  describe("events", () => {
    it("scores a competitive event using LLM", async () => {
      const event = await scoreCompetitiveEvent(
        {
          source: "github-repo",
          title: "New AI release",
          description: "Major competitor release",
          competitorName: "CompX",
          domains: ["AI"],
          detectedAt: new Date().toISOString(),
        },
        ["AI", "ML"]
      );

      expect(event.significanceScore).toBe(0.8);
      expect(event.threatLevel).toBe("high");
      expect(event.classification).toBe("threat");
    });

    it("records pre-scored events", () => {
      recordCompetitiveEvent(makeEvent());
      expect(getCompetitiveEvents()).toHaveLength(1);
    });

    it("filters events by source", () => {
      recordCompetitiveEvent(makeEvent({ source: "github-repo" }));
      recordCompetitiveEvent(makeEvent({ source: "product-hunt" }));
      expect(getCompetitiveEvents({ source: "github-repo" })).toHaveLength(1);
    });

    it("filters events by competitor", () => {
      recordCompetitiveEvent(makeEvent({ competitorName: "CompA" }));
      recordCompetitiveEvent(makeEvent({ competitorName: "CompB" }));
      expect(getCompetitiveEvents({ competitorName: "CompA" })).toHaveLength(1);
    });
  });

  describe("auto-triggers", () => {
    it("registers trigger rules", () => {
      registerAutoTriggerRule({
        id: "rule-1",
        name: "High threat alert",
        condition: {
          minSignificance: 0.7,
          threatLevels: ["critical", "high"],
        },
        action: "investigate",
        enabled: true,
        triggerCount: 0,
      });
      expect(listAutoTriggerRules()).toHaveLength(1);
    });

    it("triggers sessions for matching events", () => {
      registerAutoTriggerRule({
        id: "rule-1",
        name: "Alert",
        condition: { minSignificance: 0.7, threatLevels: ["high", "critical"] },
        action: "investigate",
        enabled: true,
        triggerCount: 0,
      });

      const event = makeEvent({ significanceScore: 0.9, threatLevel: "high" });
      const sessions = evaluateTriggerRules([event]);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].action).toBe("investigate");
      expect(sessions[0].subject).toContain("CompetitorX");
    });

    it("skips disabled rules", () => {
      registerAutoTriggerRule({
        id: "rule-2",
        name: "Disabled",
        condition: { minSignificance: 0.5, threatLevels: ["high"] },
        action: "alert-only",
        enabled: false,
        triggerCount: 0,
      });

      const event = makeEvent({ significanceScore: 0.9, threatLevel: "high" });
      const sessions = evaluateTriggerRules([event]);
      expect(sessions).toHaveLength(0);
    });

    it("does not trigger for low-significance events", () => {
      registerAutoTriggerRule({
        id: "rule-3",
        name: "High only",
        condition: { minSignificance: 0.8, threatLevels: ["high"] },
        action: "investigate",
        enabled: true,
        triggerCount: 0,
      });

      const event = makeEvent({ significanceScore: 0.3, threatLevel: "high" });
      const sessions = evaluateTriggerRules([event]);
      expect(sessions).toHaveLength(0);
    });
  });

  describe("landscape", () => {
    it("generates competitive landscape", () => {
      recordCompetitiveEvent(makeEvent({ competitorName: "CompA", significanceScore: 0.9 }));
      recordCompetitiveEvent(makeEvent({ competitorName: "CompA", significanceScore: 0.8 }));
      recordCompetitiveEvent(makeEvent({ competitorName: "CompB", significanceScore: 0.4 }));

      const landscape = generateLandscape();
      expect(landscape).toHaveLength(2);
      expect(landscape[0].competitorName).toBe("CompA");
      expect(landscape[0].eventCount).toBe(2);
    });

    it("classifies threat levels correctly", () => {
      recordCompetitiveEvent(makeEvent({ competitorName: "Danger", significanceScore: 0.95 }));

      const landscape = generateLandscape();
      expect(landscape[0].overallThreatLevel).toBe("critical");
    });
  });

  describe("timeline", () => {
    it("generates event timeline", () => {
      const now = new Date();
      recordCompetitiveEvent(makeEvent({ detectedAt: now.toISOString() }));

      const timeline = generateTimeline(7);
      expect(Array.isArray(timeline)).toBe(true);
    });
  });
});
