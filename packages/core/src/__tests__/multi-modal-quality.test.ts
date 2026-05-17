import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  assessSourceQuality,
  runQualityPipeline,
  getQualityWeights,
  analyzeDiagram,
  processVideoInput,
  assessSourceQualityExtended,
} from "../multi-modal/source-quality.js";
import type { InputSource } from "../multi-modal/context-fusion.js";

function makeSource(overrides: Partial<InputSource> = {}): InputSource {
  return {
    id: overrides.id ?? "src-1",
    type: overrides.type ?? "text",
    label: overrides.label ?? "Test Source",
    content:
      overrides.content ??
      "This is a substantial piece of text that contains enough words to pass the quality check with flying colors and provide meaningful content for analysis and fusion.",
    confidence: overrides.confidence ?? 0.9,
    metadata: overrides.metadata ?? {},
  };
}

describe("multi-modal/source-quality", () => {
  describe("assessSourceQuality", () => {
    it("scores high-quality text input", () => {
      const report = assessSourceQuality(makeSource());
      expect(report.qualityScore).toBeGreaterThan(0.5);
      expect(report.isUsable).toBe(true);
      expect(report.languageDetected).toBe("en");
    });

    it("flags very short content", () => {
      const report = assessSourceQuality(makeSource({ content: "Too short" }));
      expect(report.qualityScore).toBeLessThan(0.5);
      expect(report.issues.some((i) => i.severity === "critical")).toBe(true);
    });

    it("flags empty content", () => {
      const report = assessSourceQuality(makeSource({ content: "" }));
      expect(report.qualityScore).toBe(0);
      expect(report.isUsable).toBe(false);
      expect(report.wordCount).toBe(0);
    });

    it("flags placeholder extraction output", () => {
      const report = assessSourceQuality(
        makeSource({ type: "pdf", content: "[PDF content extraction pending]" })
      );
      expect(report.isUsable).toBe(false);
      expect(report.issues.some((issue) => issue.message.includes("placeholders"))).toBe(true);
    });

    it("flags low audio confidence", () => {
      const report = assessSourceQuality(makeSource({ type: "audio", confidence: 0.4 }));
      expect(report.issues.some((i) => i.message.includes("transcription"))).toBe(true);
    });
  });

  describe("runQualityPipeline", () => {
    it("processes multiple sources", () => {
      const sources = [makeSource({ id: "s1" }), makeSource({ id: "s2", confidence: 0.8 })];
      const result = runQualityPipeline(sources);
      expect(result.inputCount).toBe(2);
      expect(result.processedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.readyForFusion).toBe(true);
    });

    it("warns about single source", () => {
      const result = runQualityPipeline([makeSource()]);
      expect(result.warnings.some((w) => w.includes("one input source"))).toBe(true);
    });

    it("warns about same-type sources", () => {
      const result = runQualityPipeline([makeSource({ id: "s1" }), makeSource({ id: "s2" })]);
      expect(result.warnings.some((w) => w.includes("same type"))).toBe(true);
    });

    it("handles all sources failing", () => {
      const result = runQualityPipeline([
        makeSource({ id: "s1", content: "" }),
        makeSource({ id: "s2", content: "" }),
      ]);
      expect(result.failedCount).toBe(2);
      expect(result.readyForFusion).toBe(false);
    });
  });

  describe("getQualityWeights", () => {
    it("distributes weights proportionally", () => {
      const reports = [
        assessSourceQuality(makeSource({ id: "s1", confidence: 0.9 })),
        assessSourceQuality(makeSource({ id: "s2", confidence: 0.6 })),
      ];
      const weights = getQualityWeights(reports);
      expect(weights.size).toBe(2);
      const w1 = weights.get("s1")!;
      const w2 = weights.get("s2")!;
      expect(w1).toBeGreaterThan(w2);
      expect(w1 + w2).toBeCloseTo(1, 1);
    });
  });

  describe("analyzeDiagram", () => {
    it("detects flowchart diagrams", () => {
      const source = makeSource({
        id: "d1",
        type: "image",
        content: "Start → Process data → Check flow → End",
        label: "diagram",
      });
      const result = analyzeDiagram(source);
      expect(result.diagramType).toBe("flowchart");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("detects architecture diagrams", () => {
      const source = makeSource({
        id: "d2",
        type: "image",
        content: "API Gateway connects to UserService -> Cache -> Database component",
      });
      const result = analyzeDiagram(source);
      expect(result.diagramType).toBe("architecture");
      expect(result.detectedElements).toBeGreaterThan(2);
      expect(result.structureDescription).toContain("connectors");
    });

    it("returns unknown for unrecognized diagrams", () => {
      const source = makeSource({
        id: "d3",
        type: "image",
        content: "Random abstract image with colors",
      });
      const result = analyzeDiagram(source);
      expect(result.diagramType).toBe("unknown");
    });
  });

  describe("processVideoInput", () => {
    it("processes video with transcript", () => {
      const source = makeSource({
        id: "v1",
        type: "video" as InputSource["type"],
        content:
          "This is a meeting transcript discussing the new product strategy and roadmap for Q3 with key stakeholders including design engineering product and marketing teams reviewing quarterly results",
        metadata: { durationSeconds: 300 },
      });
      const result = processVideoInput(source);
      expect(result.transcriptAvailable).toBe(true);
      expect(result.durationSeconds).toBe(300);
    });

    it("flags video without transcript", () => {
      const source = makeSource({
        id: "v2",
        type: "video" as InputSource["type"],
        content: "short",
        metadata: { durationSeconds: 120 },
      });
      const result = processVideoInput(source);
      expect(result.transcriptAvailable).toBe(false);
      expect(result.processingNotes.some((n) => n.includes("Whisper"))).toBe(true);
    });

    it("infers duration and segmentation from transcript timestamps", () => {
      const source = makeSource({
        id: "v3",
        type: "video" as InputSource["type"],
        content:
          "00:00 Intro and goals\n00:45 Discuss prototype decisions\n01:30 Action item assign owner\n02:10 Wrap up next steps",
        metadata: {},
      });
      const result = processVideoInput(source);
      expect(result.durationSeconds).toBe(130);
      expect(result.keyFrameCount).toBeGreaterThan(0);
      expect(result.processingNotes.some((note) => note.includes("timestamp markers"))).toBe(true);
    });
  });

  describe("assessSourceQualityExtended", () => {
    it("includes diagram analysis for diagram sources", () => {
      const source = makeSource({
        id: "ext1",
        type: "image",
        content: "API service component architecture",
        label: "diagram",
      });
      const report = assessSourceQualityExtended(source);
      expect(report.diagramAnalysis).toBeDefined();
      expect(report.diagramAnalysis!.diagramType).toBe("architecture");
    });

    it("includes video analysis for video sources", () => {
      const source = makeSource({
        id: "ext2",
        type: "video" as InputSource["type"],
        content: "Meeting about product strategy",
      });
      const report = assessSourceQualityExtended(source);
      expect(report.videoAnalysis).toBeDefined();
    });
  });
});
