import { z } from "zod";
import type { CanvasNode, InnovationCanvas } from "./types.js";

/** Priority quadrant assignment for impact/effort matrix. */
export const QuadrantSchema = z.enum(["quick-win", "strategic", "fill-in", "avoid"]);
export type Quadrant = z.infer<typeof QuadrantSchema>;

export const PriorityMatrixNodeSchema = z.object({
  nodeId: z.string().max(200),
  title: z.string().max(500),
  impactScore: z.number().min(0).max(10),
  effortScore: z.number().min(0).max(10),
  quadrant: QuadrantSchema,
  position: z.object({ x: z.number(), y: z.number() }),
});
export type PriorityMatrixNode = z.infer<typeof PriorityMatrixNodeSchema>;

export const PriorityMatrixSchema = z.object({
  nodes: z.array(PriorityMatrixNodeSchema),
  axisLabels: z.object({
    xAxis: z.string().max(100).default("Effort"),
    yAxis: z.string().max(100).default("Impact"),
  }),
  quadrantLabels: z.object({
    topLeft: z.string().max(100).default("Quick Wins"),
    topRight: z.string().max(100).default("Strategic Projects"),
    bottomLeft: z.string().max(100).default("Fill-ins"),
    bottomRight: z.string().max(100).default("Avoid"),
  }),
  width: z.number().default(800),
  height: z.number().default(600),
});
export type PriorityMatrix = z.infer<typeof PriorityMatrixSchema>;

const MATRIX_PADDING_X = 80;
const MATRIX_PADDING_Y = 80;
const QUADRANT_ORDER: Quadrant[] = ["quick-win", "strategic", "fill-in", "avoid"];
const QUADRANT_COLORS: Record<Quadrant, string> = {
  "quick-win": "#22c55e",
  strategic: "#3b82f6",
  "fill-in": "#f59e0b",
  avoid: "#ef4444",
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizePriorityMatrix(matrix: PriorityMatrix): PriorityMatrix {
  return PriorityMatrixSchema.parse({
    ...matrix,
    axisLabels: matrix.axisLabels ?? {},
    quadrantLabels: matrix.quadrantLabels ?? {},
  });
}

function quadrantLabel(matrix: PriorityMatrix, quadrant: Quadrant): string {
  switch (quadrant) {
    case "quick-win":
      return matrix.quadrantLabels.topLeft;
    case "strategic":
      return matrix.quadrantLabels.topRight;
    case "fill-in":
      return matrix.quadrantLabels.bottomLeft;
    case "avoid":
      return matrix.quadrantLabels.bottomRight;
  }
}

function cloneNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

function buildMatrixPosition(
  effort: number,
  impact: number,
  width: number,
  height: number,
  offsetIndex: number = 0
): { x: number; y: number } {
  const usableWidth = width - MATRIX_PADDING_X * 2;
  const usableHeight = height - MATRIX_PADDING_Y * 2;
  const baseX = MATRIX_PADDING_X + (effort / 10) * usableWidth;
  const baseY = height - MATRIX_PADDING_Y - (impact / 10) * usableHeight;
  const offsetX = (offsetIndex % 3) * 14;
  const offsetY = Math.floor(offsetIndex / 3) * 14;

  return {
    x: roundPosition(baseX + offsetX),
    y: roundPosition(baseY + offsetY),
  };
}

/** Determine the priority quadrant for a given impact/effort score pair. */
export function classifyQuadrant(impact: number, effort: number): Quadrant {
  const normalizedImpact = clampScore(impact);
  const normalizedEffort = clampScore(effort);

  if (normalizedImpact >= 5) {
    return normalizedEffort < 5 ? "quick-win" : "strategic";
  }

  return normalizedEffort < 5 ? "fill-in" : "avoid";
}

/** Build a priority matrix from raw impact and effort scores. */
export function buildPriorityMatrix(
  nodes: Array<{ id: string; title: string; impact: number; effort: number }>
): PriorityMatrix {
  const width = 800;
  const height = 600;
  const occupancy = new Map<string, number>();

  return PriorityMatrixSchema.parse({
    nodes: nodes.map((node) => {
      const impactScore = clampScore(node.impact);
      const effortScore = clampScore(node.effort);
      const key = `${impactScore.toFixed(1)}:${effortScore.toFixed(1)}`;
      const offsetIndex = occupancy.get(key) ?? 0;
      occupancy.set(key, offsetIndex + 1);

      return {
        nodeId: node.id,
        title: node.title,
        impactScore,
        effortScore,
        quadrant: classifyQuadrant(impactScore, effortScore),
        position: buildMatrixPosition(effortScore, impactScore, width, height, offsetIndex),
      };
    }),
    axisLabels: {},
    quadrantLabels: {},
    width,
    height,
  });
}

/** Rearrange canvas nodes into a 2×2 priority matrix layout. */
export function layoutPriorityMatrix(
  canvas: InnovationCanvas,
  scores: Array<{ nodeId: string; impact: number; effort: number }>
): InnovationCanvas {
  const clonedNodes = canvas.nodes.map(cloneNode);
  const scoreMap = new Map(scores.map((score) => [score.nodeId, score]));
  const grouped = new Map<Quadrant, CanvasNode[]>(
    QUADRANT_ORDER.map((quadrant) => [quadrant, [] as CanvasNode[]])
  );

  for (const node of clonedNodes) {
    const score = scoreMap.get(node.id);
    if (!score) continue;
    grouped.get(classifyQuadrant(score.impact, score.effort))?.push(node);
  }

  const width = 800;
  const height = 600;
  const quadrantRegions: Record<Quadrant, { x: number; y: number; width: number; height: number }> =
    {
      "quick-win": { x: 40, y: 40, width: 320, height: 220 },
      strategic: { x: 440, y: 40, width: 320, height: 220 },
      "fill-in": { x: 40, y: 340, width: 320, height: 220 },
      avoid: { x: 440, y: 340, width: 320, height: 220 },
    };

  for (const quadrant of QUADRANT_ORDER) {
    const nodesInQuadrant = grouped.get(quadrant) ?? [];
    if (nodesInQuadrant.length === 0) continue;

    const region = quadrantRegions[quadrant];
    const maxWidth = Math.max(...nodesInQuadrant.map((node) => node.size.width), 180);
    const maxHeight = Math.max(...nodesInQuadrant.map((node) => node.size.height), 100);
    const cellWidth = maxWidth + 24;
    const cellHeight = maxHeight + 20;
    const columns = Math.max(1, Math.floor(region.width / cellWidth));

    nodesInQuadrant
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((node, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        node.position = {
          x: roundPosition(region.x + col * cellWidth),
          y: roundPosition(region.y + row * cellHeight),
        };

        const score = scoreMap.get(node.id);
        node.metadata = {
          ...(node.metadata ?? {}),
          impactScore: score ? clampScore(score.impact) : undefined,
          effortScore: score ? clampScore(score.effort) : undefined,
          priorityQuadrant: quadrant,
          priorityMatrixSize: { width, height },
        };
      });
  }

  return {
    ...canvas,
    nodes: clonedNodes,
    updatedAt: new Date().toISOString(),
  };
}

/** Render a priority matrix as SVG. */
export function priorityMatrixToSvg(matrix: PriorityMatrix): string {
  const parsed = normalizePriorityMatrix(matrix);
  const midX = parsed.width / 2;
  const midY = parsed.height / 2;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${parsed.width}" height="${parsed.height}" viewBox="0 0 ${parsed.width} ${parsed.height}">`,
    `<style>text { font-family: system-ui, sans-serif; } .axis-label { font-size: 16px; font-weight: 700; fill: #0f172a; } .quadrant-label { font-size: 18px; font-weight: 700; fill: #334155; } .node-title { font-size: 11px; font-weight: 600; fill: #0f172a; } .node-score { font-size: 10px; fill: #475569; }</style>`,
    `<rect x="0" y="0" width="${midX}" height="${midY}" fill="#dcfce7" />`,
    `<rect x="${midX}" y="0" width="${midX}" height="${midY}" fill="#dbeafe" />`,
    `<rect x="0" y="${midY}" width="${midX}" height="${midY}" fill="#fef3c7" />`,
    `<rect x="${midX}" y="${midY}" width="${midX}" height="${midY}" fill="#fee2e2" />`,
    `<line x1="${midX}" y1="40" x2="${midX}" y2="${parsed.height - 40}" stroke="#64748b" stroke-width="2" stroke-dasharray="6,6" />`,
    `<line x1="40" y1="${midY}" x2="${parsed.width - 40}" y2="${midY}" stroke="#64748b" stroke-width="2" stroke-dasharray="6,6" />`,
    `<text x="${parsed.width / 2}" y="${parsed.height - 18}" text-anchor="middle" class="axis-label">${escapeXml(parsed.axisLabels.xAxis)}</text>`,
    `<text x="22" y="${parsed.height / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 22 ${parsed.height / 2})">${escapeXml(parsed.axisLabels.yAxis)}</text>`,
    `<text x="24" y="28" class="quadrant-label">${escapeXml(parsed.quadrantLabels.topLeft)}</text>`,
    `<text x="${midX + 24}" y="28" class="quadrant-label">${escapeXml(parsed.quadrantLabels.topRight)}</text>`,
    `<text x="24" y="${midY + 28}" class="quadrant-label">${escapeXml(parsed.quadrantLabels.bottomLeft)}</text>`,
    `<text x="${midX + 24}" y="${midY + 28}" class="quadrant-label">${escapeXml(parsed.quadrantLabels.bottomRight)}</text>`,
  ];

  for (const node of parsed.nodes) {
    const color = QUADRANT_COLORS[node.quadrant];
    parts.push(
      `<g>`,
      `<circle cx="${node.position.x}" cy="${node.position.y}" r="16" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" />`,
      `<text x="${node.position.x}" y="${node.position.y - 24}" text-anchor="middle" class="node-title">${escapeXml(truncate(node.title, 28))}</text>`,
      `<text x="${node.position.x}" y="${node.position.y + 4}" text-anchor="middle" class="node-score">I:${node.impactScore.toFixed(1)} / E:${node.effortScore.toFixed(1)}</text>`,
      `</g>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/** Export a priority matrix as a markdown table grouped by quadrant. */
export function priorityMatrixToMarkdown(matrix: PriorityMatrix): string {
  const parsed = normalizePriorityMatrix(matrix);
  const rows = parsed.nodes
    .slice()
    .sort((a, b) => {
      const quadrantDelta = QUADRANT_ORDER.indexOf(a.quadrant) - QUADRANT_ORDER.indexOf(b.quadrant);
      return quadrantDelta !== 0 ? quadrantDelta : a.title.localeCompare(b.title);
    })
    .map(
      (node) =>
        `| ${escapeMarkdown(node.title)} | ${node.impactScore.toFixed(1)} | ${node.effortScore.toFixed(1)} | ${escapeMarkdown(quadrantLabel(parsed, node.quadrant))} |`
    );

  return [
    `# Priority Matrix`,
    "",
    `Axes: ${escapeMarkdown(parsed.axisLabels.yAxis)} vs ${escapeMarkdown(parsed.axisLabels.xAxis)}`,
    "",
    "| Idea | Impact | Effort | Quadrant |",
    "| --- | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
