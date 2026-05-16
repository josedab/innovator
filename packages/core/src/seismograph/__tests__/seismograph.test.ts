import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { SeismographSignalSchema, TremorSchema, SeismographBriefingSchema } from "../index.js";

describe("seismograph", () => {
  describe("SeismographSignalSchema", () => {
    it("validates a well-formed signal", () => {
      const signal = {
        id: "sig-1",
        sourceType: "patent",
        title: "Novel Battery Technology Patent",
        summary: "A new solid-state battery design with 3x energy density.",
        sourceDatabase: "USPTO",
        topics: ["batteries", "energy-storage"],
        relevanceScore: 0.85,
        noveltyScore: 0.9,
        publishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
      };
      expect(() => SeismographSignalSchema.parse(signal)).not.toThrow();
    });

    it("rejects invalid source types", () => {
      const signal = {
        id: "sig-2",
        sourceType: "invalid",
        title: "Test",
        summary: "Test",
        sourceDatabase: "test",
        topics: [],
        relevanceScore: 0.5,
        noveltyScore: 0.5,
        publishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
      };
      expect(() => SeismographSignalSchema.parse(signal)).toThrow();
    });
  });

  describe("TremorSchema", () => {
    it("validates a well-formed tremor", () => {
      const tremor = {
        id: "tremor-1",
        name: "Solid-State Battery Revolution",
        description: "Multiple signals indicate rapid advances in solid-state batteries.",
        severity: "moderate",
        score: 65,
        signalIds: ["sig-1", "sig-2", "sig-3"],
        signalCount: 3,
        affectedDomains: ["automotive", "consumer-electronics"],
        timeHorizon: "1-2years",
        confidence: 0.75,
        firstDetectedAt: new Date().toISOString(),
        lastSignalAt: new Date().toISOString(),
      };
      expect(() => TremorSchema.parse(tremor)).not.toThrow();
    });

    it("validates a minimal tremor", () => {
      expect(() =>
        TremorSchema.parse({
          id: "t",
          name: "t",
          description: "t",
          severity: "micro",
          score: 10,
          signalIds: ["s1"],
          signalCount: 1,
          affectedDomains: [],
          timeHorizon: "months",
          confidence: 0.5,
          firstDetectedAt: new Date().toISOString(),
          lastSignalAt: new Date().toISOString(),
        })
      ).not.toThrow();
    });
  });

  describe("SeismographBriefingSchema", () => {
    it("validates a well-formed briefing", () => {
      const briefing = {
        id: "brief-1",
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        type: "daily",
        signalsCollected: 15,
        tremors: [],
        topSignals: [],
        executiveSummary: "No significant tremors detected today.",
        watchList: [
          { topic: "quantum computing", reason: "Increasing patent activity", priority: "medium" },
        ],
        generatedAt: new Date().toISOString(),
      };
      expect(() => SeismographBriefingSchema.parse(briefing)).not.toThrow();
    });
  });
});
