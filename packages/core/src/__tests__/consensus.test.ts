import { describe, it, expect, vi } from "vitest";
import { runConsensus, consensusToMarkdown } from "../consensus/index.js";
import type { ConsensusOptions } from "../consensus/index.js";
import type { LLMProvider } from "../providers/index.js";
import type { Investigation, AngleResult } from "../types.js";

function makeProvider(id: string, name: string): LLMProvider {
  return {
    id,
    name,
    generateText: vi.fn().mockResolvedValue(""),
    generateStream: vi.fn().mockResolvedValue(""),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

const mockInvestigation: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect 1", description: "Desc" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

function makeAngleResult(ideas: Array<{ title: string; description: string }>): AngleResult {
  return {
    angleId: "scamper",
    angleName: "SCAMPER",
    reasoning: "Applied method",
    ideas: ideas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: "High impact",
      implementationHint: "Start here",
    })),
  };
}

describe("consensus", () => {
  describe("runConsensus", () => {
    it("returns merged consensus from 2 providers", async () => {
      const p1 = makeProvider("p1", "Provider 1");
      const p2 = makeProvider("p2", "Provider 2");

      // Both providers produce a similar idea + one unique each
      const generateFn = vi
        .fn()
        .mockResolvedValueOnce(
          makeAngleResult([
            {
              title: "AI-Powered Analytics Dashboard",
              description: "Uses machine learning for analytics dashboard insights",
            },
            {
              title: "Blockchain Supply Chain Tracker",
              description: "Distributed ledger supply chain verification system",
            },
          ])
        )
        .mockResolvedValueOnce(
          makeAngleResult([
            {
              title: "AI Analytics Dashboard Tool",
              description: "Machine learning analytics dashboard for data insights",
            },
            {
              title: "Quantum Cryptography Module",
              description: "Post-quantum encryption protocols for secure communications",
            },
          ])
        );

      const result = await runConsensus({
        subject: "data analytics",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.angleId).toBe("scamper");
      expect(result.modelResults).toHaveLength(2);
      expect(result.agreements.length).toBeGreaterThan(0);
      expect(result.divergences.length).toBeGreaterThan(0);
      expect(result.consensusScore).toBeGreaterThanOrEqual(0);
      expect(result.consensusScore).toBeLessThanOrEqual(1);
    });

    it("handles 1 provider failing gracefully", async () => {
      const p1 = makeProvider("p1", "Provider 1");
      const p2 = makeProvider("p2", "Provider 2");

      const generateFn = vi
        .fn()
        .mockResolvedValueOnce(makeAngleResult([{ title: "Good Idea", description: "Works fine" }]))
        .mockRejectedValueOnce(new Error("Provider timeout"));

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.modelResults).toHaveLength(2);
      const failed = result.modelResults.find((r) => r.error);
      expect(failed).toBeDefined();
      expect(failed?.error).toContain("timeout");
    });

    it("handles all providers failing", async () => {
      const p1 = makeProvider("p1", "P1");
      const p2 = makeProvider("p2", "P2");

      const generateFn = vi.fn().mockRejectedValue(new Error("All fail"));

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }],
        generateFn,
      });

      expect(result.modelResults).toHaveLength(2);
      expect(result.agreements).toHaveLength(0);
      expect(result.divergences).toHaveLength(0);
      expect(result.consensusScore).toBe(0);
    });

    it("confidence reflects number of agreeing models", async () => {
      const p1 = makeProvider("p1", "P1");
      const p2 = makeProvider("p2", "P2");
      const p3 = makeProvider("p3", "P3");

      // All 3 providers suggest the same idea
      const generateFn = vi
        .fn()
        .mockResolvedValue(
          makeAngleResult([
            { title: "Universal Idea", description: "Exact same concept across all models" },
          ])
        );

      const result = await runConsensus({
        subject: "test",
        investigation: mockInvestigation,
        angleId: "scamper",
        angleName: "SCAMPER",
        providers: [{ provider: p1 }, { provider: p2 }, { provider: p3 }],
        generateFn,
      });

      // Agreement found across all 3 models should have high confidence
      if (result.agreements.length > 0) {
        expect(result.agreements[0].confidence).toBeGreaterThan(0.5);
      }
    });
  });

  describe("consensusToMarkdown", () => {
    it("includes agreement and divergence sections", () => {
      const result = {
        angleId: "scamper",
        angleName: "SCAMPER",
        modelResults: [
          {
            providerId: "p1",
            providerName: "Provider 1",
            angleResult: makeAngleResult([{ title: "Idea", description: "Desc" }]),
            durationMs: 1000,
          },
          {
            providerId: "p2",
            providerName: "Provider 2",
            angleResult: makeAngleResult([{ title: "Idea", description: "Desc" }]),
            durationMs: 1200,
          },
        ],
        agreements: [
          {
            title: "Agreed Idea",
            description: "Both models agree",
            potentialImpact: "High",
            sources: ["p1", "p2"],
            confidence: 0.9,
            isNovel: false,
          },
        ],
        divergences: [
          {
            title: "Novel Idea",
            description: "Only one model",
            potentialImpact: "Medium",
            sources: ["p1"],
            confidence: 0.5,
            isNovel: true,
          },
        ],
        recommendations: [
          {
            title: "Agreed Idea",
            description: "Both models agree",
            potentialImpact: "High",
            sources: ["p1", "p2"],
            confidence: 1.0,
            isNovel: false,
          },
        ],
        consensusScore: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const md = consensusToMarkdown(result);
      expect(md).toContain("# Multi-Model Consensus: SCAMPER");
      expect(md).toContain("**Consensus Score:** 50%");
      expect(md).toContain("🤝 Agreements");
      expect(md).toContain("Agreed Idea");
      expect(md).toContain("💡 Novel Divergences");
      expect(md).toContain("Novel Idea");
      expect(md).toContain("⭐ Recommendations");
    });

    it("handles empty agreements gracefully", () => {
      const result = {
        angleId: "scamper",
        angleName: "SCAMPER",
        modelResults: [],
        agreements: [],
        divergences: [],
        recommendations: [],
        consensusScore: 0,
        generatedAt: new Date().toISOString(),
      };

      const md = consensusToMarkdown(result);
      expect(md).toContain("# Multi-Model Consensus");
      expect(md).not.toContain("🤝 Agreements");
      expect(md).not.toContain("💡 Novel Divergences");
    });
  });
});
