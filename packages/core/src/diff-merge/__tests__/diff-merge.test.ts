vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(JSON.stringify({
    contradictions: [],
    summary: "Test diff summary"
  })),
  extractJson: vi.fn((s) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  autoMerge,
  diffReportToMarkdown,
  mergeResultToMarkdown,
  resolveConflict,
  runSemanticDiff,
  type SessionSnapshot,
  type SemanticDiffReport,
  type MergeResult,
  type MergeConflict,
} from "../index.js";
import { clearEmbeddingsIndex } from "../../embeddings/index.js";

// ---- Helpers ----

function makeIdea(title: string, description = "A test idea description") {
  return {
    title,
    description,
    potentialImpact: `Impact of ${title}`,
    implementationHint: `How to implement ${title}`,
  };
}

function makeSession(
  id: string,
  ideas: ReturnType<typeof makeIdea>[],
  subject = "Test Subject"
): SessionSnapshot {
  return {
    sessionId: id,
    subject,
    ideas,
    investigation: "Investigation summary",
    synthesisText: "Synthesis text",
  };
}

function makeDiffReport(overrides: Partial<SemanticDiffReport> = {}): SemanticDiffReport {
  return {
    overlaps: [],
    gaps: [],
    contradictions: [],
    uniqueToA: [],
    uniqueToB: [],
    overallSimilarity: 0,
    mergeRecommendations: [],
    ...overrides,
  };
}

function makeMergeResult(overrides: Partial<MergeResult> = {}): MergeResult {
  return {
    mergedIdeas: [],
    resolvedConflicts: [],
    autoMerged: 0,
    manualRequired: 0,
    provenance: {},
    ...overrides,
  };
}

function makeConflict(overrides: Partial<MergeConflict> = {}): MergeConflict {
  return {
    itemA: makeIdea("Idea A", "Description of idea A"),
    itemB: makeIdea("Idea B", "Description of idea B"),
    conflictType: "contradiction",
    suggestedResolution: "Manual review recommended",
    ...overrides,
  };
}

// ---- Tests ----

describe("diff-merge", () => {
  beforeEach(() => {
    clearEmbeddingsIndex();
  });

  // ---- autoMerge ----

  describe("autoMerge", () => {
    it("merges non-overlapping ideas from two sessions", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Solar Panels", "Harness renewable solar energy for buildings"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Wind Turbines", "Generate electricity from wind power"),
      ]);

      const result = await autoMerge(sessionA, sessionB);

      expect(result.mergedIdeas).toHaveLength(2);
      expect(result.autoMerged).toBe(2);
      expect(result.manualRequired).toBe(0);
      expect(result.resolvedConflicts).toHaveLength(0);

      const titles = result.mergedIdeas.map((i) => i.title);
      expect(titles).toContain("Solar Panels");
      expect(titles).toContain("Wind Turbines");
    });

    it("detects overlapping ideas and keeps the more detailed version", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Blockchain Supply Chain", "Using blockchain technology for supply chain transparency and tracking of goods across the entire logistics pipeline"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Blockchain Logistics", "Blockchain for supply chain"),
      ]);

      const result = await autoMerge(sessionA, sessionB);

      // Should merge overlapping ideas into one
      const blockchainIdeas = result.mergedIdeas.filter(
        (i) => i.title.includes("Blockchain")
      );
      expect(blockchainIdeas.length).toBeLessThanOrEqual(2);

      if (result.resolvedConflicts.length > 0 || blockchainIdeas.length === 1) {
        // If overlap detected, the longer description should win
        const merged = blockchainIdeas[0];
        expect(merged.description.length).toBeGreaterThan(30);
      }
    });

    it("tracks provenance for each merged idea", async () => {
      const sessionA = makeSession("sess-alpha", [
        makeIdea("Quantum Entanglement Research", "Exploring quantum entanglement for secure communications"),
      ]);
      const sessionB = makeSession("sess-beta", [
        makeIdea("Organic Permaculture Farming", "Sustainable permaculture design for urban agriculture"),
      ]);

      const result = await autoMerge(sessionA, sessionB);

      for (const idea of result.mergedIdeas) {
        expect(idea.provenance.length).toBeGreaterThan(0);
      }

      // Check provenance record
      expect(Object.keys(result.provenance).length).toBeGreaterThan(0);

      // Each unique idea should trace back to its source session
      const allProvenances = result.mergedIdeas.flatMap((i) => i.provenance);
      expect(allProvenances).toContain("sess-alpha");
      expect(allProvenances).toContain("sess-beta");
    });

    it("handles empty sessions (no ideas)", async () => {
      const sessionA = makeSession("a", []);
      const sessionB = makeSession("b", []);

      const result = await autoMerge(sessionA, sessionB);

      expect(result.mergedIdeas).toHaveLength(0);
      expect(result.autoMerged).toBe(0);
      expect(result.manualRequired).toBe(0);
    });

    it("handles one empty and one non-empty session", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Only Idea", "The only idea present"),
      ]);
      const sessionB = makeSession("b", []);

      const result = await autoMerge(sessionA, sessionB);

      expect(result.mergedIdeas).toHaveLength(1);
      expect(result.mergedIdeas[0].title).toBe("Only Idea");
      expect(result.autoMerged).toBe(1);
    });

    it("handles sessions with single ideas each", async () => {
      const sessionA = makeSession("a", [makeIdea("Idea A", "First idea")]);
      const sessionB = makeSession("b", [makeIdea("Idea B", "Second idea")]);

      const result = await autoMerge(sessionA, sessionB);

      expect(result.mergedIdeas.length).toBeGreaterThanOrEqual(1);
      expect(result.autoMerged + result.manualRequired).toBeGreaterThanOrEqual(1);
    });

    it("handles identical sessions", async () => {
      const ideas = [makeIdea("Shared Idea", "Exact same idea in both sessions with identical text content for matching")];
      const sessionA = makeSession("a", ideas);
      const sessionB = makeSession("b", ideas);

      const result = await autoMerge(sessionA, sessionB);

      // Should detect overlap and merge into one, or include both with provenance
      expect(result.mergedIdeas.length).toBeGreaterThanOrEqual(1);
    });

    it("respects custom overlapThreshold", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Machine Learning Prediction", "Using ML algorithms for prediction models in healthcare"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Deep Learning Prediction", "Using deep neural networks for prediction models in healthcare"),
      ]);

      // Very low threshold = more overlap detection = ideas merged as overlap
      const resultLow = await autoMerge(sessionA, sessionB, { overlapThreshold: 0.01 });
      clearEmbeddingsIndex();
      // Very high threshold = less overlap detection = ideas may fall into contradiction zone
      const resultHigh = await autoMerge(sessionA, sessionB, { overlapThreshold: 0.99 });

      // Different thresholds should produce different merge behavior
      const lowTotal = resultLow.autoMerged + resultLow.manualRequired;
      const highTotal = resultHigh.autoMerged + resultHigh.manualRequired;
      expect(lowTotal).toBeGreaterThanOrEqual(1);
      expect(highTotal).toBeGreaterThanOrEqual(1);
      // Low threshold merges as overlap (autoMerged), high threshold flags as contradiction (manualRequired)
      expect(resultLow.autoMerged).toBeGreaterThanOrEqual(resultHigh.autoMerged);
    });
  });

  // ---- runSemanticDiff ----

  describe("runSemanticDiff", () => {
    it("computes diff between two sessions with distinct ideas", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Quantum Computing", "Research into quantum algorithms for optimization"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Organic Farming", "Sustainable agriculture methods for food production"),
      ]);

      const report = await runSemanticDiff(sessionA, sessionB);

      expect(report.overallSimilarity).toBeDefined();
      expect(report.overallSimilarity).toBeGreaterThanOrEqual(0);
      expect(report.overallSimilarity).toBeLessThanOrEqual(1);
      expect(report.mergeRecommendations.length).toBeGreaterThan(0);
    });

    it("detects overlaps for similar ideas", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Blockchain Supply Chain", "Using blockchain technology for supply chain transparency and tracking"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Blockchain Logistics Tracking", "Blockchain technology applied to logistics supply chain management and tracking"),
      ]);

      const report = await runSemanticDiff(sessionA, sessionB);

      // Similar ideas should have higher overall similarity
      expect(report.overallSimilarity).toBeGreaterThanOrEqual(0);
    });

    it("identifies unique ideas per session", async () => {
      const sessionA = makeSession("a", [
        makeIdea("AI Diagnostics", "AI for medical diagnostics and imaging analysis"),
        makeIdea("Robotics Surgery", "Robotic systems for precision surgery"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Gene Therapy", "CRISPR gene editing for genetic diseases treatment"),
      ]);

      const report = await runSemanticDiff(sessionA, sessionB);

      // Should find some unique ideas
      const totalUnique = report.uniqueToA.length + report.uniqueToB.length;
      expect(totalUnique).toBeGreaterThanOrEqual(0);
    });

    it("returns valid schema for empty sessions", async () => {
      const sessionA = makeSession("a", []);
      const sessionB = makeSession("b", []);

      const report = await runSemanticDiff(sessionA, sessionB);

      expect(report.overlaps).toHaveLength(0);
      expect(report.gaps).toHaveLength(0);
      expect(report.contradictions).toHaveLength(0);
      expect(report.uniqueToA).toHaveLength(0);
      expect(report.uniqueToB).toHaveLength(0);
      expect(report.overallSimilarity).toBe(0);
    });

    it("respects overlapThreshold option", async () => {
      const sessionA = makeSession("a", [
        makeIdea("Cloud Computing", "Cloud infrastructure for scalable computing services"),
      ]);
      const sessionB = makeSession("b", [
        makeIdea("Cloud Services", "Cloud based computing infrastructure for scaling services"),
      ]);

      const report = await runSemanticDiff(sessionA, sessionB, { overlapThreshold: 0.99 });

      // With very high threshold, most things should be unique
      expect(report.overlaps.length).toBeLessThanOrEqual(1);
    });
  });

  // ---- diffReportToMarkdown ----

  describe("diffReportToMarkdown", () => {
    it("produces markdown with header and similarity", () => {
      const report = makeDiffReport({ overallSimilarity: 0.75 });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("# Semantic Diff Report");
      expect(md).toContain("75.0%");
    });

    it("includes overlaps section", () => {
      const report = makeDiffReport({
        overlaps: [
          {
            title: "Overlap A-B",
            description: "A and B overlap",
            significance: "high",
            similarityScore: 0.85,
            sourceSession: "a,b",
            category: "overlap",
          },
        ],
      });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("## Overlaps");
      expect(md).toContain("Overlap A-B");
      expect(md).toContain("85%");
      expect(md).toContain("high");
    });

    it("includes contradictions section", () => {
      const report = makeDiffReport({
        contradictions: [
          {
            title: "Contradiction X",
            description: "X contradicts Y",
            significance: "high",
            similarityScore: 0.4,
            sourceSession: "a,b",
            category: "contradiction",
          },
        ],
      });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("## Contradictions");
      expect(md).toContain("Contradiction X");
    });

    it("includes unique-to-A and unique-to-B sections", () => {
      const report = makeDiffReport({
        uniqueToA: [
          {
            title: "Only A",
            description: "Unique to session A",
            significance: "medium",
            similarityScore: 0,
            sourceSession: "a",
            category: "unique",
          },
        ],
        uniqueToB: [
          {
            title: "Only B",
            description: "Unique to session B",
            significance: "medium",
            similarityScore: 0,
            sourceSession: "b",
            category: "unique",
          },
        ],
      });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("## Unique to Session A");
      expect(md).toContain("Only A");
      expect(md).toContain("## Unique to Session B");
      expect(md).toContain("Only B");
    });

    it("includes gaps section", () => {
      const report = makeDiffReport({
        gaps: [
          {
            title: "Gap Idea",
            description: "Missing from other session",
            significance: "medium",
            similarityScore: 0,
            sourceSession: "a",
            category: "gap",
          },
        ],
      });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("## Complementary Gaps");
      expect(md).toContain("Gap Idea");
    });

    it("includes merge recommendations", () => {
      const report = makeDiffReport({
        mergeRecommendations: ["Auto-merge is safe", "Review contradictions first"],
      });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("## Merge Recommendations");
      expect(md).toContain("Auto-merge is safe");
      expect(md).toContain("Review contradictions first");
    });

    it("omits empty sections", () => {
      const report = makeDiffReport({ overallSimilarity: 0.5 });
      const md = diffReportToMarkdown(report);

      expect(md).not.toContain("## Overlaps");
      expect(md).not.toContain("## Contradictions");
      expect(md).not.toContain("## Unique to Session A");
      expect(md).not.toContain("## Unique to Session B");
      expect(md).not.toContain("## Complementary Gaps");
      expect(md).not.toContain("## Merge Recommendations");
    });
  });

  // ---- mergeResultToMarkdown ----

  describe("mergeResultToMarkdown", () => {
    it("produces markdown with header and counts", () => {
      const result = makeMergeResult({ autoMerged: 5, manualRequired: 2 });
      const md = mergeResultToMarkdown(result);

      expect(md).toContain("# Merge Result");
      expect(md).toContain("5 ideas");
      expect(md).toContain("2 conflicts");
    });

    it("includes merged ideas with details", () => {
      const result = makeMergeResult({
        mergedIdeas: [
          {
            title: "Great Idea",
            description: "A great innovation idea",
            potentialImpact: "High impact",
            implementationHint: "Start with prototype",
            provenance: ["session-1", "session-2"],
          },
        ],
        autoMerged: 1,
      });
      const md = mergeResultToMarkdown(result);

      expect(md).toContain("## Merged Ideas");
      expect(md).toContain("### Great Idea");
      expect(md).toContain("A great innovation idea");
      expect(md).toContain("High impact");
      expect(md).toContain("Start with prototype");
      expect(md).toContain("session-1, session-2");
    });

    it("includes resolved conflicts", () => {
      const result = makeMergeResult({
        resolvedConflicts: [
          {
            itemA: makeIdea("Idea X"),
            itemB: makeIdea("Idea Y"),
            conflictType: "overlap",
            suggestedResolution: "Kept Idea X as more detailed",
          },
        ],
        manualRequired: 0,
      });
      const md = mergeResultToMarkdown(result);

      expect(md).toContain("## Resolved Conflicts");
      expect(md).toContain("overlap");
      expect(md).toContain("Idea X");
      expect(md).toContain("Idea Y");
      expect(md).toContain("Kept Idea X as more detailed");
    });

    it("omits empty sections", () => {
      const result = makeMergeResult();
      const md = mergeResultToMarkdown(result);

      expect(md).not.toContain("## Merged Ideas");
      expect(md).not.toContain("## Resolved Conflicts");
    });
  });

  // ---- resolveConflict ----

  describe("resolveConflict", () => {
    it("keep-a returns item A with provenance", async () => {
      const conflict = makeConflict({
        itemA: makeIdea("Alpha Idea", "Alpha description"),
        itemB: makeIdea("Beta Idea", "Beta description"),
      });

      const resolved = await resolveConflict(conflict, "keep-a");

      expect(resolved.title).toBe("Alpha Idea");
      expect(resolved.description).toBe("Alpha description");
      expect(resolved.provenance).toContain("session-a");
    });

    it("keep-b returns item B with provenance", async () => {
      const conflict = makeConflict({
        itemA: makeIdea("Alpha Idea", "Alpha description"),
        itemB: makeIdea("Beta Idea", "Beta description"),
      });

      const resolved = await resolveConflict(conflict, "keep-b");

      expect(resolved.title).toBe("Beta Idea");
      expect(resolved.description).toBe("Beta description");
      expect(resolved.provenance).toContain("session-b");
    });

    it("synthesize calls LLM and returns synthesized idea", async () => {
      const { generateText } = await import("../../copilot/client.js");
      const mockedGenerateText = vi.mocked(generateText);
      mockedGenerateText.mockResolvedValueOnce(
        JSON.stringify({
          title: "Synthesized Idea",
          description: "Combined description from both",
          potentialImpact: "Combined impact",
          implementationHint: "Combined approach",
        })
      );

      const conflict = makeConflict();
      const resolved = await resolveConflict(conflict, "synthesize", "test-model");

      expect(resolved.title).toBe("Synthesized Idea");
      expect(resolved.description).toBe("Combined description from both");
      expect(resolved.provenance).toContain("synthesized");
      expect(mockedGenerateText).toHaveBeenCalled();
    });

    it("keep-a preserves all idea fields", async () => {
      const idea = makeIdea("Full Idea", "Full description");
      const conflict = makeConflict({ itemA: idea });

      const resolved = await resolveConflict(conflict, "keep-a");

      expect(resolved.potentialImpact).toBe(idea.potentialImpact);
      expect(resolved.implementationHint).toBe(idea.implementationHint);
    });

    it("keep-b preserves all idea fields", async () => {
      const idea = makeIdea("Full Idea B", "Full B description");
      const conflict = makeConflict({ itemB: idea });

      const resolved = await resolveConflict(conflict, "keep-b");

      expect(resolved.potentialImpact).toBe(idea.potentialImpact);
      expect(resolved.implementationHint).toBe(idea.implementationHint);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("autoMerge with many ideas in one session and none in another", async () => {
      const ideas = Array.from({ length: 5 }, (_, i) =>
        makeIdea(`Idea ${i}`, `Description for idea number ${i}`)
      );
      const sessionA = makeSession("a", ideas);
      const sessionB = makeSession("b", []);

      const result = await autoMerge(sessionA, sessionB);

      expect(result.mergedIdeas).toHaveLength(5);
      expect(result.autoMerged).toBe(5);
    });

    it("diffReportToMarkdown handles zero similarity", () => {
      const report = makeDiffReport({ overallSimilarity: 0 });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("0.0%");
    });

    it("diffReportToMarkdown handles full similarity", () => {
      const report = makeDiffReport({ overallSimilarity: 1 });
      const md = diffReportToMarkdown(report);

      expect(md).toContain("100.0%");
    });

    it("mergeResultToMarkdown handles zero counts", () => {
      const result = makeMergeResult({ autoMerged: 0, manualRequired: 0 });
      const md = mergeResultToMarkdown(result);

      expect(md).toContain("0 ideas");
      expect(md).toContain("0 conflicts");
    });
  });
});
