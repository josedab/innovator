/**
 * @module multi-modal/visual-output
 *
 * Generates visual artifacts (Mermaid diagrams, idea maps, comparison charts)
 * from innovation results. Supports export to Figma and Miro formats for
 * integration with design tools.
 */

import { z } from "zod";

// ---- Schemas ----

export const VisualArtifactSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["chart", "diagram", "mindmap", "matrix"]),
  format: z.enum(["mermaid", "svg", "json"]),
  content: z.string(),
  title: z.string().max(500),
  metadata: z.record(z.unknown()).optional(),
});

export type VisualArtifact = z.infer<typeof VisualArtifactSchema>;

/** Idea node for spatial idea maps. */
export interface IdeaNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: string;
  score: number;
  connections: string[];
}

/** Spatial idea map structure. */
export interface IdeaMapData {
  nodes: IdeaNode[];
  width: number;
  height: number;
  title: string;
}

/** Bar chart data point. */
export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

/** Timeline entry. */
export interface TimelineEntry {
  id: string;
  label: string;
  timestamp: string;
  angle: string;
  color: string;
}

/** Simplified idea input. */
export interface IdeaInput {
  title: string;
  score?: number;
  angle?: string;
  feasibility?: "low" | "medium" | "high";
  impact?: number;
  createdAt?: string;
  connections?: string[];
}

/** Synthesis input for diagram generation. */
export interface SynthesisInput {
  topIdeas: IdeaInput[];
  themes?: string[];
  recommendation?: string;
}

/** Angle result input for comparison charts. */
export interface AngleResultInput {
  angle: string;
  ideas: IdeaInput[];
  score?: number;
}

// ---- Constants ----

const ANGLE_COLORS: Record<string, string> = {
  biomimicry: "#10b981",
  "first-principles": "#6366f1",
  "constraint-removal": "#f59e0b",
  "cross-industry": "#ec4899",
  "trend-extrapolation": "#8b5cf6",
  "reverse-engineering": "#14b8a6",
  "lateral-thinking": "#f97316",
  provocateur: "#ef4444",
  default: "#6b7280",
};

function getAngleColor(angle: string): string {
  return ANGLE_COLORS[angle] ?? ANGLE_COLORS.default;
}

// ---- Visual Output Generator ----

/**
 * Generates visual artifacts from innovation pipeline results.
 * Supports Mermaid diagrams, spatial idea maps, comparison charts,
 * and export to Figma/Miro formats.
 */
export class VisualOutputGenerator {
  /**
   * Generate a Mermaid diagram from ideas.
   * @param ideas - List of ideas to visualize
   * @param type - Diagram type: mindmap, flowchart, or quadrant
   */
  generateMermaidDiagram(
    ideas: IdeaInput[],
    type: "mindmap" | "flowchart" | "quadrant"
  ): VisualArtifact {
    let content: string;

    switch (type) {
      case "mindmap":
        content = this.buildMindmap(ideas);
        break;
      case "flowchart":
        content = this.buildFlowchart(ideas);
        break;
      case "quadrant":
        content = this.buildQuadrant(ideas);
        break;
      default:
        content = this.buildMindmap(ideas);
    }

    return {
      id: `diagram-${type}-${Date.now().toString(36)}`,
      type: type === "quadrant" ? "matrix" : "diagram",
      format: "mermaid",
      content,
      title: `Innovation ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      metadata: { diagramType: type, ideaCount: ideas.length },
    };
  }

  /** Generate a spatial idea map as a JSON structure. */
  generateIdeaMap(synthesis: SynthesisInput): VisualArtifact {
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const nodes: IdeaNode[] = synthesis.topIdeas.map((idea, i) => {
      const angle = (2 * Math.PI * i) / Math.max(synthesis.topIdeas.length, 1);
      const score = idea.score ?? 0.5;
      const radius = 150 + (1 - score) * 100;

      return {
        id: `node-${i}`,
        label: idea.title,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        size: 20 + score * 40,
        color: getAngleColor(idea.angle ?? "default"),
        angle: idea.angle ?? "unknown",
        score,
        connections: idea.connections ?? [],
      };
    });

    const mapData: IdeaMapData = { nodes, width, height, title: "Innovation Idea Map" };

    return {
      id: `ideamap-${Date.now().toString(36)}`,
      type: "mindmap",
      format: "json",
      content: JSON.stringify(mapData),
      title: "Innovation Idea Map",
      metadata: {
        nodeCount: nodes.length,
        themes: synthesis.themes ?? [],
      },
    };
  }

  /** Generate comparison chart data for angle results. */
  generateComparisonChart(angleResults: AngleResultInput[]): VisualArtifact {
    const chartData: ChartDataPoint[] = angleResults.map((ar) => ({
      label: ar.angle,
      value: ar.score ?? ar.ideas.reduce((sum, i) => sum + (i.score ?? 0), 0) / Math.max(ar.ideas.length, 1),
      color: getAngleColor(ar.angle),
    }));

    return {
      id: `comparison-${Date.now().toString(36)}`,
      type: "chart",
      format: "json",
      content: JSON.stringify(chartData),
      title: "Angle Comparison",
      metadata: { angleCount: angleResults.length },
    };
  }

  /** Generate a timeline of idea generation. */
  generateTimeline(ideas: IdeaInput[]): VisualArtifact {
    const entries: TimelineEntry[] = ideas.map((idea, i) => ({
      id: `tl-${i}`,
      label: idea.title,
      timestamp: idea.createdAt ?? new Date().toISOString(),
      angle: idea.angle ?? "unknown",
      color: getAngleColor(idea.angle ?? "default"),
    }));

    return {
      id: `timeline-${Date.now().toString(36)}`,
      type: "chart",
      format: "json",
      content: JSON.stringify(entries),
      title: "Idea Generation Timeline",
      metadata: { entryCount: entries.length },
    };
  }

  /** Export visual artifacts to Figma-compatible JSON. */
  exportToFigmaFormat(artifacts: VisualArtifact[]): Record<string, unknown> {
    return {
      schemaVersion: 1,
      name: "Innovation Visualization Export",
      lastModified: new Date().toISOString(),
      document: {
        type: "DOCUMENT",
        children: artifacts.map((artifact, i) => ({
          type: "FRAME",
          name: artifact.title,
          x: i * 900,
          y: 0,
          width: 800,
          height: 600,
          children: this.artifactToFigmaNodes(artifact),
        })),
      },
    };
  }

  /** Export visual artifacts to Miro-compatible JSON. */
  exportToMiroFormat(artifacts: VisualArtifact[]): Record<string, unknown> {
    return {
      type: "board_export",
      version: "1.0",
      title: "Innovation Visualization",
      exportedAt: new Date().toISOString(),
      widgets: artifacts.flatMap((artifact, i) =>
        this.artifactToMiroWidgets(artifact, i * 1200)
      ),
    };
  }

  // ---- Private helpers ----

  private buildMindmap(ideas: IdeaInput[]): string {
    const grouped = new Map<string, IdeaInput[]>();
    for (const idea of ideas) {
      const angle = idea.angle ?? "General";
      if (!grouped.has(angle)) grouped.set(angle, []);
      grouped.get(angle)!.push(idea);
    }

    const lines = ["mindmap", "  root((Innovation Ideas))"];
    for (const [angle, angleIdeas] of grouped) {
      const sanitized = sanitizeMermaid(angle);
      lines.push(`    ${sanitized}`);
      for (const idea of angleIdeas.slice(0, 8)) {
        lines.push(`      ${sanitizeMermaid(idea.title)}`);
      }
    }

    return lines.join("\n");
  }

  private buildFlowchart(ideas: IdeaInput[]): string {
    const lines = ["flowchart TD"];
    const nodeIds = ideas.map((_, i) => `idea${i}`);

    for (let i = 0; i < ideas.length; i++) {
      const label = sanitizeMermaid(ideas[i].title);
      lines.push(`    ${nodeIds[i]}["${label}"]`);
    }

    // Connect ideas with shared angles
    for (let i = 0; i < ideas.length; i++) {
      for (let j = i + 1; j < ideas.length; j++) {
        if (ideas[i].angle && ideas[i].angle === ideas[j].angle) {
          lines.push(`    ${nodeIds[i]} --> ${nodeIds[j]}`);
        }
      }
    }

    return lines.join("\n");
  }

  private buildQuadrant(ideas: IdeaInput[]): string {
    const lines = [
      "quadrantChart",
      '    title Feasibility vs Impact',
      '    x-axis "Low Feasibility" --> "High Feasibility"',
      '    y-axis "Low Impact" --> "High Impact"',
    ];

    for (const idea of ideas.slice(0, 20)) {
      const feasibilityScore =
        idea.feasibility === "high" ? 0.8 :
        idea.feasibility === "medium" ? 0.5 : 0.2;
      const impactScore = idea.impact ?? idea.score ?? 0.5;
      const label = sanitizeMermaid(idea.title).slice(0, 30);
      lines.push(`    "${label}": [${feasibilityScore.toFixed(2)}, ${impactScore.toFixed(2)}]`);
    }

    return lines.join("\n");
  }

  private artifactToFigmaNodes(artifact: VisualArtifact): Record<string, unknown>[] {
    if (artifact.format === "json") {
      try {
        const data = JSON.parse(artifact.content) as unknown;
        if (Array.isArray(data)) {
          return data.map((item: Record<string, unknown>, i: number) => ({
            type: "RECTANGLE",
            name: (item.label as string) ?? `Item ${i}`,
            x: 50,
            y: 50 + i * 80,
            width: 700,
            height: 60,
            fills: [{ type: "SOLID", color: hexToRgb((item.color as string) ?? "#6b7280") }],
            children: [
              {
                type: "TEXT",
                characters: (item.label as string) ?? "",
                x: 16,
                y: 16,
                fontSize: 14,
              },
            ],
          }));
        }
        if (data && typeof data === "object" && "nodes" in (data as Record<string, unknown>)) {
          const mapData = data as IdeaMapData;
          return mapData.nodes.map((node) => ({
            type: "ELLIPSE",
            name: node.label,
            x: node.x,
            y: node.y,
            width: node.size * 2,
            height: node.size * 2,
            fills: [{ type: "SOLID", color: hexToRgb(node.color) }],
            children: [
              {
                type: "TEXT",
                characters: node.label,
                x: 8,
                y: node.size - 8,
                fontSize: 12,
              },
            ],
          }));
        }
      } catch {
        // Fall through to text representation
      }
    }

    return [
      {
        type: "TEXT",
        characters: artifact.content,
        x: 50,
        y: 50,
        fontSize: 12,
      },
    ];
  }

  private artifactToMiroWidgets(
    artifact: VisualArtifact,
    offsetX: number
  ): Record<string, unknown>[] {
    const widgets: Record<string, unknown>[] = [];

    // Title sticky note
    widgets.push({
      type: "sticky_note",
      content: artifact.title,
      x: offsetX,
      y: 0,
      width: 200,
      style: { backgroundColor: "#fff9b1" },
    });

    if (artifact.format === "json") {
      try {
        const data = JSON.parse(artifact.content) as unknown;
        if (Array.isArray(data)) {
          data.forEach((item: Record<string, unknown>, i: number) => {
            widgets.push({
              type: "shape",
              content: (item.label as string) ?? `Item ${i}`,
              x: offsetX,
              y: 120 + i * 100,
              width: 250,
              height: 70,
              style: { backgroundColor: (item.color as string) ?? "#e0e0e0" },
            });
          });
        } else if (data && typeof data === "object" && "nodes" in (data as Record<string, unknown>)) {
          const mapData = data as IdeaMapData;
          for (const node of mapData.nodes) {
            widgets.push({
              type: "sticky_note",
              content: node.label,
              x: offsetX + node.x,
              y: node.y,
              width: node.size * 3,
              style: { backgroundColor: node.color },
            });
          }
        }
      } catch {
        widgets.push({
          type: "text",
          content: artifact.content,
          x: offsetX,
          y: 120,
        });
      }
    } else {
      widgets.push({
        type: "text",
        content: artifact.content,
        x: offsetX,
        y: 120,
        width: 800,
      });
    }

    return widgets;
  }
}

// ---- Utilities ----

/** Sanitize text for Mermaid syntax (remove characters that break rendering). */
function sanitizeMermaid(text: string): string {
  return text.replace(/[[\]{}()#&;"`]/g, "").replace(/\n/g, " ").trim().slice(0, 60);
}

/** Convert hex color to RGB object for Figma. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}
