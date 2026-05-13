import { describe, it, expect } from "vitest";
import {
  VisualOutputGenerator,
  VisualArtifactSchema,
  type IdeaInput,
  type SynthesisInput,
  type AngleResultInput,
} from "../multi-modal/visual-output.js";

const sampleIdeas: IdeaInput[] = [
  { title: "AI-powered triage", score: 0.9, angle: "first-principles", feasibility: "high", impact: 0.8 },
  { title: "Gamified learning", score: 0.7, angle: "cross-industry", feasibility: "medium", impact: 0.6 },
  { title: "Decentralized records", score: 0.5, angle: "first-principles", feasibility: "low", impact: 0.9 },
];

describe("visual-output", () => {
  const generator = new VisualOutputGenerator();

  describe("generateMermaidDiagram", () => {
    it("generates a mindmap with valid Mermaid syntax", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "mindmap");
      expect(artifact.format).toBe("mermaid");
      expect(artifact.type).toBe("diagram");
      expect(artifact.content).toContain("mindmap");
      expect(artifact.content).toContain("root((Innovation Ideas))");
      expect(artifact.title).toBe("Innovation Mindmap");
    });

    it("generates a flowchart with node definitions", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "flowchart");
      expect(artifact.content).toContain("flowchart TD");
      expect(artifact.content).toContain("idea0");
      expect(artifact.content).toContain("idea1");
      expect(artifact.format).toBe("mermaid");
    });

    it("generates a quadrant chart with feasibility vs impact", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "quadrant");
      expect(artifact.content).toContain("quadrantChart");
      expect(artifact.content).toContain("Feasibility vs Impact");
      expect(artifact.type).toBe("matrix");
    });

    it("flowchart connects ideas with shared angles", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "flowchart");
      // idea0 and idea2 share "first-principles"
      expect(artifact.content).toContain("idea0 --> idea2");
    });

    it("artifact passes schema validation", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "mindmap");
      const result = VisualArtifactSchema.safeParse(artifact);
      expect(result.success).toBe(true);
    });

    it("metadata contains ideaCount", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "mindmap");
      expect(artifact.metadata?.ideaCount).toBe(3);
    });
  });

  describe("generateIdeaMap", () => {
    it("returns positioned nodes as JSON artifact", () => {
      const synthesis: SynthesisInput = { topIdeas: sampleIdeas, themes: ["AI", "Health"] };
      const artifact = generator.generateIdeaMap(synthesis);
      expect(artifact.format).toBe("json");
      expect(artifact.type).toBe("mindmap");

      const data = JSON.parse(artifact.content);
      expect(data.nodes).toHaveLength(3);
      expect(data.width).toBe(800);
      expect(data.height).toBe(600);
    });

    it("nodes have x, y, size, and color properties", () => {
      const synthesis: SynthesisInput = { topIdeas: sampleIdeas };
      const artifact = generator.generateIdeaMap(synthesis);
      const data = JSON.parse(artifact.content);
      for (const node of data.nodes) {
        expect(node).toHaveProperty("x");
        expect(node).toHaveProperty("y");
        expect(node).toHaveProperty("size");
        expect(node).toHaveProperty("color");
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
      }
    });

    it("metadata contains themes", () => {
      const synthesis: SynthesisInput = { topIdeas: sampleIdeas, themes: ["AI"] };
      const artifact = generator.generateIdeaMap(synthesis);
      expect(artifact.metadata?.themes).toEqual(["AI"]);
    });
  });

  describe("generateComparisonChart", () => {
    it("returns chart data points for each angle", () => {
      const angleResults: AngleResultInput[] = [
        { angle: "biomimicry", ideas: [{ title: "Idea A", score: 0.8 }], score: 0.85 },
        { angle: "first-principles", ideas: [{ title: "Idea B", score: 0.6 }], score: 0.7 },
      ];
      const artifact = generator.generateComparisonChart(angleResults);
      expect(artifact.type).toBe("chart");
      expect(artifact.format).toBe("json");

      const data = JSON.parse(artifact.content);
      expect(data).toHaveLength(2);
      expect(data[0].label).toBe("biomimicry");
      expect(data[0].value).toBe(0.85);
    });

    it("computes average score when score is not provided", () => {
      const angleResults: AngleResultInput[] = [
        { angle: "lateral-thinking", ideas: [{ title: "X", score: 0.6 }, { title: "Y", score: 0.8 }] },
      ];
      const artifact = generator.generateComparisonChart(angleResults);
      const data = JSON.parse(artifact.content);
      expect(data[0].value).toBeCloseTo(0.7, 5);
    });

    it("assigns colors based on angle name", () => {
      const angleResults: AngleResultInput[] = [
        { angle: "biomimicry", ideas: [], score: 0.5 },
      ];
      const artifact = generator.generateComparisonChart(angleResults);
      const data = JSON.parse(artifact.content);
      expect(data[0].color).toBe("#10b981");
    });
  });

  describe("exportToFigmaFormat", () => {
    it("returns Figma-compatible JSON structure", () => {
      const artifact = generator.generateComparisonChart([
        { angle: "biomimicry", ideas: [], score: 0.5 },
      ]);
      const figma = generator.exportToFigmaFormat([artifact]);
      expect(figma).toHaveProperty("schemaVersion", 1);
      expect(figma).toHaveProperty("document");
      const doc = figma.document as { type: string; children: unknown[] };
      expect(doc.type).toBe("DOCUMENT");
      expect(doc.children).toHaveLength(1);
    });
  });

  describe("exportToMiroFormat", () => {
    it("returns Miro-compatible JSON structure", () => {
      const artifact = generator.generateComparisonChart([
        { angle: "biomimicry", ideas: [], score: 0.5 },
      ]);
      const miro = generator.exportToMiroFormat([artifact]);
      expect(miro).toHaveProperty("type", "board_export");
      expect(miro).toHaveProperty("version", "1.0");
      expect(miro).toHaveProperty("widgets");
      expect(Array.isArray(miro.widgets)).toBe(true);
    });

    it("includes title sticky note in widgets", () => {
      const artifact = generator.generateMermaidDiagram(sampleIdeas, "mindmap");
      const miro = generator.exportToMiroFormat([artifact]);
      const widgets = miro.widgets as Array<{ type: string; content: string }>;
      expect(widgets[0].type).toBe("sticky_note");
      expect(widgets[0].content).toBe(artifact.title);
    });
  });
});
