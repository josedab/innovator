/**
 * @module provenance-visualization
 *
 * Sankey diagram visualization of idea provenance chains.
 * Shows the full flow from input subject through investigation findings
 * to generated ideas and quality scores, enabling users to trace how
 * each idea was derived and understand the pipeline's reasoning flow.
 */

import { z } from "zod";
import type { Investigation, AngleResult, Synthesis } from "../types.js";

// ---- Schemas ----

const SankeyNodeTypeEnum = z.enum([
  "subject",
  "investigation",
  "finding",
  "angle",
  "idea",
  "score",
]);

export const SankeyNodeSchema = z.object({
  id: z.string(),
  label: z.string().max(500),
  type: SankeyNodeTypeEnum,
  value: z.number().min(0).describe("Weighting for node size"),
  color: z.string().max(50).optional(),
  metadata: z.record(z.string().max(1000)).optional(),
});

export const SankeyLinkSchema = z.object({
  source: z.string().describe("Source node ID"),
  target: z.string().describe("Target node ID"),
  value: z.number().min(0).describe("Flow weight"),
  label: z.string().max(500).optional(),
  color: z.string().max(50).optional(),
});

export const SankeyDiagramSchema = z.object({
  nodes: z.array(SankeyNodeSchema).max(1000),
  links: z.array(SankeyLinkSchema).max(5000),
  title: z.string().max(500).optional(),
  metadata: z.record(z.string().max(1000)).optional(),
});

export const ProvenanceConnectionSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  relationship: z.enum(["derived_from", "inspired_by", "validated_by", "scored_by"]),
  strength: z.number().min(0).max(1),
  evidence: z.string().max(2000).optional(),
});

export const VisualizationProvenanceChainSchema = z.object({
  subject: z.string().max(2000),
  investigationFindings: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().max(500),
        type: z.enum(["aspect", "challenge", "opportunity"]),
      })
    )
    .max(100),
  angles: z.array(z.object({ id: z.string(), name: z.string().max(200) })).max(50),
  ideas: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(500),
        angleId: z.string(),
        description: z.string().max(5000).optional(),
      })
    )
    .max(500),
  scores: z
    .array(
      z.object({
        ideaId: z.string(),
        feasibility: z.number().min(1).max(10).optional(),
        impact: z.number().min(1).max(10).optional(),
        novelty: z.number().min(1).max(10).optional(),
        overall: z.number().min(0).max(10).optional(),
      })
    )
    .max(500),
  connections: z.array(ProvenanceConnectionSchema).max(5000),
});

export const ProvenanceVisualizationConfigSchema = z.object({
  maxNodes: z.number().int().min(1).max(1000).default(200),
  showScores: z.boolean().default(true),
  showFindings: z.boolean().default(true),
  collapseThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.05)
    .describe("Flows below this fraction of total are collapsed"),
  layout: z.enum(["horizontal", "vertical"]).default("horizontal"),
  colorScheme: z.record(z.string().max(50)).default({
    subject: "#3B82F6",
    investigation: "#6366F1",
    finding: "#8B5CF6",
    angle: "#F59E0B",
    idea: "#10B981",
    score: "#EF4444",
  }),
});

export const ProvenanceQuerySchema = z.object({
  sessionId: z.string().optional(),
  subject: z.string().max(2000).optional(),
  ideaId: z.string().optional(),
  includeScores: z.boolean().default(true),
  depth: z.number().int().min(1).max(10).default(5),
});

export const FlowMetricsSchema = z.object({
  totalFlow: z.number().min(0),
  branchingFactor: z.number().min(0),
  averagePathLength: z.number().min(0),
  bottlenecks: z.array(z.string()),
  highImpactPaths: z.array(z.array(z.string())),
});

// ---- Types ----

export type SankeyNode = z.infer<typeof SankeyNodeSchema>;
export type SankeyLink = z.infer<typeof SankeyLinkSchema>;
export type SankeyDiagram = z.infer<typeof SankeyDiagramSchema>;
export type ProvenanceConnection = z.infer<typeof ProvenanceConnectionSchema>;
export type VisualizationProvenanceChain = z.infer<typeof VisualizationProvenanceChainSchema>;
export type ProvenanceVisualizationConfig = z.infer<typeof ProvenanceVisualizationConfigSchema>;
export type ProvenanceQuery = z.infer<typeof ProvenanceQuerySchema>;
export type FlowMetrics = z.infer<typeof FlowMetricsSchema>;

// ---- Default Config ----

const DEFAULT_CONFIG: ProvenanceVisualizationConfig = ProvenanceVisualizationConfigSchema.parse({});

const DEFAULT_COLORS: Record<string, string> = {
  subject: "#3B82F6",
  investigation: "#6366F1",
  finding: "#8B5CF6",
  angle: "#F59E0B",
  idea: "#10B981",
  score: "#EF4444",
};

// ---- Core Functions ----

/**
 * Build a full provenance chain from pipeline data.
 */
export function buildProvenanceChain(
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis?: Synthesis,
  scores?: Array<{
    ideaTitle: string;
    angleId: string;
    feasibility?: number;
    impact?: number;
    novelty?: number;
  }>
): VisualizationProvenanceChain {
  if (!subject) throw new Error("Subject is required for provenance chain");
  if (!investigation) throw new Error("Investigation is required for provenance chain");

  const findings: VisualizationProvenanceChain["investigationFindings"] = [];
  const connections: ProvenanceConnection[] = [];
  const validAngleResults = (angleResults ?? []).filter(
    (ar) => ar && ar.angleId && ar.angleName && Array.isArray(ar.ideas)
  );

  const subjectId = "subject-root";

  // Extract findings from investigation
  for (let i = 0; i < investigation.keyAspects.length; i++) {
    const aspect = investigation.keyAspects[i];
    const findingId = `finding-aspect-${i}`;
    findings.push({ id: findingId, label: aspect.title, type: "aspect" });
    connections.push({
      fromId: subjectId,
      toId: findingId,
      relationship: "derived_from",
      strength: 1,
    });
  }

  for (let i = 0; i < investigation.challenges.length; i++) {
    const findingId = `finding-challenge-${i}`;
    findings.push({
      id: findingId,
      label: investigation.challenges[i].slice(0, 200),
      type: "challenge",
    });
    connections.push({
      fromId: subjectId,
      toId: findingId,
      relationship: "derived_from",
      strength: 0.8,
    });
  }

  for (let i = 0; i < investigation.opportunities.length; i++) {
    const findingId = `finding-opportunity-${i}`;
    findings.push({
      id: findingId,
      label: investigation.opportunities[i].slice(0, 200),
      type: "opportunity",
    });
    connections.push({
      fromId: subjectId,
      toId: findingId,
      relationship: "derived_from",
      strength: 0.8,
    });
  }

  // Build angles and ideas
  const angles: VisualizationProvenanceChain["angles"] = [];
  const ideas: VisualizationProvenanceChain["ideas"] = [];

  for (const ar of validAngleResults) {
    const angleEntry = { id: `angle-${ar.angleId}`, name: ar.angleName };
    angles.push(angleEntry);

    // Connect findings to angles
    for (const finding of findings) {
      connections.push({
        fromId: finding.id,
        toId: angleEntry.id,
        relationship: "inspired_by",
        strength: 0.6,
      });
    }

    for (let i = 0; i < ar.ideas.length; i++) {
      const idea = ar.ideas[i];
      const ideaId = `idea-${ar.angleId}-${i}`;
      ideas.push({
        id: ideaId,
        title: idea.title,
        angleId: ar.angleId,
        description: idea.description,
      });
      connections.push({
        fromId: angleEntry.id,
        toId: ideaId,
        relationship: "derived_from",
        strength: 1,
      });
    }
  }

  // Build scores
  const scoreEntries: VisualizationProvenanceChain["scores"] = [];
  if (scores) {
    for (const s of scores) {
      const matchingIdea = ideas.find(
        (idea) =>
          idea.title.toLowerCase() === s.ideaTitle.toLowerCase() && idea.angleId === s.angleId
      );
      if (matchingIdea) {
        const overall =
          s.feasibility !== undefined && s.impact !== undefined && s.novelty !== undefined
            ? Math.round(((s.feasibility + s.impact + s.novelty) / 3) * 10) / 10
            : undefined;
        scoreEntries.push({
          ideaId: matchingIdea.id,
          feasibility: s.feasibility,
          impact: s.impact,
          novelty: s.novelty,
          overall,
        });
        connections.push({
          fromId: matchingIdea.id,
          toId: `score-${matchingIdea.id}`,
          relationship: "scored_by",
          strength: 1,
        });
      }
    }
  }

  return {
    subject,
    investigationFindings: findings,
    angles,
    ideas,
    scores: scoreEntries,
    connections,
  };
}

/**
 * Convert a provenance chain to Sankey diagram data.
 */
export function generateSankeyDiagram(
  chain: VisualizationProvenanceChain,
  config?: Partial<ProvenanceVisualizationConfig>
): SankeyDiagram {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const colors = { ...DEFAULT_COLORS, ...(cfg.colorScheme ?? {}) };
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Subject node
  nodes.push({
    id: "subject-root",
    label: chain.subject.slice(0, 100),
    type: "subject",
    value: chain.ideas.length || 1,
    color: colors.subject,
  });

  // Investigation node
  if (cfg.showFindings && chain.investigationFindings.length > 0) {
    nodes.push({
      id: "investigation",
      label: "Investigation",
      type: "investigation",
      value: chain.investigationFindings.length,
      color: colors.investigation,
    });
    links.push({
      source: "subject-root",
      target: "investigation",
      value: chain.investigationFindings.length,
    });

    for (const finding of chain.investigationFindings) {
      nodes.push({
        id: finding.id,
        label: finding.label,
        type: "finding",
        value: 1,
        color: colors.finding,
        metadata: { findingType: finding.type },
      });
      links.push({
        source: "investigation",
        target: finding.id,
        value: 1,
      });
    }
  }

  // Angle nodes
  for (const angle of chain.angles) {
    const angleIdeas = chain.ideas.filter((i) => i.angleId === angle.id.replace("angle-", ""));
    const ideaCount = angleIdeas.length || 1;
    nodes.push({
      id: angle.id,
      label: angle.name,
      type: "angle",
      value: ideaCount,
      color: colors.angle,
    });

    if (cfg.showFindings && chain.investigationFindings.length > 0) {
      // Link findings to angles (aggregate flow)
      links.push({
        source: "investigation",
        target: angle.id,
        value: ideaCount,
      });
    } else {
      links.push({
        source: "subject-root",
        target: angle.id,
        value: ideaCount,
      });
    }
  }

  // Idea nodes
  for (const idea of chain.ideas) {
    const angleNodeId = `angle-${idea.angleId}`;
    nodes.push({
      id: idea.id,
      label: idea.title,
      type: "idea",
      value: 1,
      color: colors.idea,
      metadata: idea.description ? { description: idea.description.slice(0, 200) } : undefined,
    });
    links.push({
      source: angleNodeId,
      target: idea.id,
      value: 1,
    });
  }

  // Score nodes
  if (cfg.showScores) {
    for (const score of chain.scores) {
      const scoreValue = score.overall ?? 5;
      const scoreNodeId = `score-${score.ideaId}`;
      nodes.push({
        id: scoreNodeId,
        label: `Score: ${scoreValue.toFixed(1)}`,
        type: "score",
        value: scoreValue,
        color: colors.score,
        metadata: {
          ...(score.feasibility !== undefined ? { feasibility: String(score.feasibility) } : {}),
          ...(score.impact !== undefined ? { impact: String(score.impact) } : {}),
          ...(score.novelty !== undefined ? { novelty: String(score.novelty) } : {}),
        },
      });
      links.push({
        source: score.ideaId,
        target: scoreNodeId,
        value: scoreValue,
      });
    }
  }

  // Enforce maxNodes by trimming lowest-value nodes
  if (nodes.length > cfg.maxNodes) {
    const sorted = [...nodes].sort((a, b) => b.value - a.value);
    const kept = new Set(sorted.slice(0, cfg.maxNodes).map((n) => n.id));
    const filteredNodes = nodes.filter((n) => kept.has(n.id));
    const filteredLinks = links.filter((l) => kept.has(l.source) && kept.has(l.target));
    return {
      nodes: filteredNodes,
      links: filteredLinks,
      title: `Provenance: ${chain.subject.slice(0, 80)}`,
      metadata: { nodeCount: String(filteredNodes.length) },
    };
  }

  return {
    nodes,
    links,
    title: `Provenance: ${chain.subject.slice(0, 80)}`,
    metadata: { nodeCount: String(nodes.length) },
  };
}

/**
 * Trace a specific idea back to its sources in the provenance chain.
 */
export function traceIdeaProvenance(
  ideaTitle: string,
  chain: VisualizationProvenanceChain
): { path: string[]; connections: ProvenanceConnection[] } {
  const idea = chain.ideas.find((i) => i.title.toLowerCase() === ideaTitle.toLowerCase());
  if (!idea) return { path: [], connections: [] };

  const path: string[] = [idea.id];
  const traced: ProvenanceConnection[] = [];
  const visited = new Set<string>();

  function walkBack(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    for (const conn of chain.connections) {
      if (conn.toId === nodeId) {
        traced.push(conn);
        path.push(conn.fromId);
        walkBack(conn.fromId);
      }
    }
  }

  walkBack(idea.id);
  path.push(chain.subject);
  return { path: path.reverse(), connections: traced };
}

/**
 * Compute flow statistics for a Sankey diagram.
 */
export function getFlowMetrics(diagram: SankeyDiagram): FlowMetrics {
  const totalFlow = diagram.links.reduce((sum, l) => sum + l.value, 0);

  // Branching factor: average outgoing links per non-leaf node
  const outgoing = new Map<string, number>();
  for (const link of diagram.links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + 1);
  }
  const nonLeaf = [...outgoing.values()];
  const branchingFactor =
    nonLeaf.length > 0 ? nonLeaf.reduce((a, b) => a + b, 0) / nonLeaf.length : 0;

  // Average path length via BFS from subject
  const adjacency = new Map<string, string[]>();
  for (const link of diagram.links) {
    const children = adjacency.get(link.source) ?? [];
    children.push(link.target);
    adjacency.set(link.source, children);
  }

  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: "subject-root", depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depths.has(id)) continue;
    depths.set(id, depth);
    for (const child of adjacency.get(id) ?? []) {
      queue.push({ id: child, depth: depth + 1 });
    }
  }
  const allDepths = [...depths.values()];
  const averagePathLength =
    allDepths.length > 0 ? allDepths.reduce((a, b) => a + b, 0) / allDepths.length : 0;

  // Bottlenecks: nodes where outgoing flow is much less than incoming
  const inFlow = new Map<string, number>();
  const outFlow = new Map<string, number>();
  for (const link of diagram.links) {
    inFlow.set(link.target, (inFlow.get(link.target) ?? 0) + link.value);
    outFlow.set(link.source, (outFlow.get(link.source) ?? 0) + link.value);
  }
  const bottlenecks: string[] = [];
  for (const node of diagram.nodes) {
    const inVal = inFlow.get(node.id) ?? 0;
    const outVal = outFlow.get(node.id) ?? 0;
    if (inVal > 0 && outVal > 0 && outVal < inVal * 0.5) {
      bottlenecks.push(node.id);
    }
  }

  // High impact paths: paths ending at highest-value score nodes
  const scoreNodes = diagram.nodes
    .filter((n) => n.type === "score")
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const highImpactPaths: string[][] = [];
  for (const scoreNode of scoreNodes) {
    const path = traceBackInDiagram(scoreNode.id, diagram);
    if (path.length > 1) highImpactPaths.push(path);
  }

  return {
    totalFlow,
    branchingFactor: Math.round(branchingFactor * 100) / 100,
    averagePathLength: Math.round(averagePathLength * 100) / 100,
    bottlenecks,
    highImpactPaths,
  };
}

/** Trace back from a node to the root in a diagram. */
function traceBackInDiagram(nodeId: string, diagram: SankeyDiagram): string[] {
  const path: string[] = [nodeId];
  const visited = new Set<string>();
  let current = nodeId;

  while (!visited.has(current)) {
    visited.add(current);
    const incoming = diagram.links.find((l) => l.target === current);
    if (!incoming) break;
    path.unshift(incoming.source);
    current = incoming.source;
  }

  return path;
}

/**
 * Identify paths that produced the highest-scoring ideas.
 */
export function findHighImpactPaths(
  diagram: SankeyDiagram
): Array<{ path: string[]; score: number }> {
  const scoreNodes = diagram.nodes
    .filter((n) => n.type === "score")
    .sort((a, b) => b.value - a.value);

  return scoreNodes.map((scoreNode) => ({
    path: traceBackInDiagram(scoreNode.id, diagram),
    score: scoreNode.value,
  }));
}

/**
 * Simplify a diagram by collapsing flows below the given threshold.
 * Threshold is a fraction of total flow (0-1).
 */
export function collapseSmallFlows(diagram: SankeyDiagram, threshold: number): SankeyDiagram {
  const totalFlow = diagram.links.reduce((sum, l) => sum + l.value, 0);
  const minValue = totalFlow * threshold;

  const keptLinks = diagram.links.filter((l) => l.value >= minValue);
  const referencedIds = new Set<string>();
  for (const link of keptLinks) {
    referencedIds.add(link.source);
    referencedIds.add(link.target);
  }

  const keptNodes = diagram.nodes.filter((n) => referencedIds.has(n.id));

  return {
    nodes: keptNodes,
    links: keptLinks,
    title: diagram.title,
    metadata: {
      ...diagram.metadata,
      collapsed: "true",
      threshold: String(threshold),
      nodeCount: String(keptNodes.length),
    },
  };
}

/**
 * Export Sankey diagram data as JSON suitable for D3.js/Plotly rendering.
 */
export function exportSankeyAsJSON(diagram: SankeyDiagram): string {
  return JSON.stringify(diagram, null, 2);
}

/**
 * Generate an SVG representation of the Sankey diagram.
 */
export function exportSankeyAsSVG(diagram: SankeyDiagram): string {
  const width = 1200;
  const height = Math.max(600, diagram.nodes.length * 30);
  const padding = 40;
  const nodeWidth = 20;

  // Assign column positions by node type
  const columnOrder: Record<string, number> = {
    subject: 0,
    investigation: 1,
    finding: 2,
    angle: 3,
    idea: 4,
    score: 5,
  };
  const maxCol = 5;

  // Group nodes by column
  const columns = new Map<number, SankeyNode[]>();
  for (const node of diagram.nodes) {
    const col = columnOrder[node.type] ?? 3;
    const group = columns.get(col) ?? [];
    group.push(node);
    columns.set(col, group);
  }

  // Compute positions
  const nodePositions = new Map<string, { x: number; y: number; h: number }>();
  const colWidth = (width - padding * 2 - nodeWidth) / maxCol;

  for (const [col, colNodes] of columns) {
    const x = padding + col * colWidth;
    const totalValue = colNodes.reduce((s, n) => s + n.value, 0);
    const availableHeight = height - padding * 2;
    const gap = 8;
    const totalGap = gap * (colNodes.length - 1);
    const scale = totalValue > 0 ? (availableHeight - totalGap) / totalValue : 1;

    let y = padding;
    for (const node of colNodes) {
      const h = Math.max(12, node.value * scale);
      nodePositions.set(node.id, { x, y, h });
      y += h + gap;
    }
  }

  // Build SVG
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
  );
  parts.push(`<style>text { font-family: sans-serif; font-size: 11px; fill: #333; }</style>`);

  // Title
  if (diagram.title) {
    parts.push(
      `<text x="${width / 2}" y="20" text-anchor="middle" font-size="14" font-weight="bold">${escapeXml(diagram.title)}</text>`
    );
  }

  // Links
  for (const link of diagram.links) {
    const src = nodePositions.get(link.source);
    const tgt = nodePositions.get(link.target);
    if (!src || !tgt) continue;

    const srcX = src.x + nodeWidth;
    const srcY = src.y + src.h / 2;
    const tgtX = tgt.x;
    const tgtY = tgt.y + tgt.h / 2;
    const midX = (srcX + tgtX) / 2;
    const totalFlow = diagram.links.reduce((s, l) => s + l.value, 0);
    const opacity = Math.max(0.1, Math.min(0.8, link.value / (totalFlow || 1)));
    const strokeWidth = Math.max(1, Math.min(20, link.value * 2));
    const color = link.color ?? "#9CA3AF";

    parts.push(
      `<path d="M${srcX},${srcY} C${midX},${srcY} ${midX},${tgtY} ${tgtX},${tgtY}" ` +
        `fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity.toFixed(2)}"/>`
    );
  }

  // Nodes
  for (const node of diagram.nodes) {
    const pos = nodePositions.get(node.id);
    if (!pos) continue;
    const color = node.color ?? DEFAULT_COLORS[node.type] ?? "#6B7280";

    parts.push(
      `<rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${pos.h}" fill="${color}" rx="2"/>`
    );

    const labelX = pos.x + nodeWidth + 4;
    const labelY = pos.y + pos.h / 2 + 4;
    const truncatedLabel = node.label.length > 40 ? node.label.slice(0, 37) + "..." : node.label;
    parts.push(`<text x="${labelX}" y="${labelY}">${escapeXml(truncatedLabel)}</text>`);
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * Generate a full HTML page with embedded D3.js Sankey visualization.
 */
export function exportSankeyAsHTML(diagram: SankeyDiagram): string {
  const jsonData = JSON.stringify(diagram);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(diagram.title ?? "Provenance Sankey Diagram")}</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/d3-sankey@0.12/dist/d3-sankey.min.js"><\/script>
<style>
  body { font-family: sans-serif; margin: 20px; background: #fafafa; }
  h1 { color: #1e293b; font-size: 1.5rem; }
  .node rect { cursor: pointer; }
  .node text { font-size: 12px; fill: #333; }
  .link { fill: none; stroke-opacity: 0.4; }
  .link:hover { stroke-opacity: 0.7; }
</style>
</head>
<body>
<h1>${escapeHtml(diagram.title ?? "Provenance Sankey Diagram")}</h1>
<div id="chart"></div>
<script>
(function() {
  const data = ${jsonData};
  const width = 1200;
  const height = Math.max(600, data.nodes.length * 30);

  const svg = d3.select("#chart").append("svg")
    .attr("width", width).attr("height", height);

  const nodeMap = new Map(data.nodes.map((n, i) => [n.id, i]));
  const sankeyNodes = data.nodes.map(n => ({ ...n }));
  const sankeyLinks = data.links
    .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target))
    .map(l => ({
      source: nodeMap.get(l.source),
      target: nodeMap.get(l.target),
      value: l.value || 1,
      color: l.color
    }));

  const sankey = d3.sankey()
    .nodeId(d => d.id)
    .nodeWidth(20)
    .nodePadding(10)
    .extent([[20, 20], [width - 20, height - 20]]);

  const graph = sankey({
    nodes: sankeyNodes,
    links: sankeyLinks
  });

  svg.append("g").selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("class", "link")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", d => d.color || "#9CA3AF")
    .attr("stroke-width", d => Math.max(1, d.width));

  const node = svg.append("g").selectAll("g")
    .data(graph.nodes)
    .join("g").attr("class", "node");

  node.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => Math.max(1, d.y1 - d.y0))
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => d.color || "#6B7280")
    .append("title").text(d => d.label + " (" + d.value + ")");

  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.label.length > 40 ? d.label.slice(0, 37) + "..." : d.label);
})();
<\/script>
</body>
</html>`;
}

/**
 * Format a provenance chain as Markdown for text-based display.
 */
export function formatProvenanceMarkdown(chain: VisualizationProvenanceChain): string {
  const lines: string[] = ["# Idea Provenance", "", `**Subject:** ${chain.subject}`, ""];

  if (chain.investigationFindings.length > 0) {
    lines.push("## Investigation Findings");
    lines.push("");
    for (const f of chain.investigationFindings) {
      lines.push(`- **[${f.type}]** ${f.label}`);
    }
    lines.push("");
  }

  if (chain.angles.length > 0) {
    lines.push("## Angles Applied");
    lines.push("");
    for (const angle of chain.angles) {
      const angleIdeas = chain.ideas.filter((i) => i.angleId === angle.id.replace("angle-", ""));
      lines.push(`### ${angle.name} (${angleIdeas.length} ideas)`);
      for (const idea of angleIdeas) {
        const score = chain.scores.find((s) => s.ideaId === idea.id);
        const scoreSuffix = score?.overall ? ` — Score: ${score.overall.toFixed(1)}` : "";
        lines.push(`- **${idea.title}**${scoreSuffix}`);
        if (idea.description) {
          lines.push(`  ${idea.description.slice(0, 150)}...`);
        }
      }
      lines.push("");
    }
  }

  if (chain.scores.length > 0) {
    lines.push("## Score Summary");
    lines.push("");
    const sorted = [...chain.scores].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    for (const score of sorted) {
      const idea = chain.ideas.find((i) => i.id === score.ideaId);
      if (!idea) continue;
      const dims = [
        score.feasibility !== undefined ? `F:${score.feasibility}` : null,
        score.impact !== undefined ? `I:${score.impact}` : null,
        score.novelty !== undefined ? `N:${score.novelty}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`- **${idea.title}**: ${score.overall?.toFixed(1) ?? "N/A"} (${dims})`);
    }
    lines.push("");
  }

  lines.push(
    `*${chain.ideas.length} ideas from ${chain.angles.length} angles, ${chain.investigationFindings.length} findings*`
  );

  return lines.join("\n");
}

/**
 * Compare provenance chains across multiple sessions.
 */
export function compareProvenanceChains(chains: VisualizationProvenanceChain[]): {
  commonAngles: string[];
  uniqueAngles: Record<string, string[]>;
  ideaCounts: Record<string, number>;
  averageScores: Record<string, number>;
  sharedThemes: string[];
} {
  if (chains.length === 0) {
    return {
      commonAngles: [],
      uniqueAngles: {},
      ideaCounts: {},
      averageScores: {},
      sharedThemes: [],
    };
  }

  // Find common and unique angles
  const angleSets = chains.map((c) => new Set(c.angles.map((a) => a.name)));
  const allAngles = new Set(angleSets.flatMap((s) => [...s]));
  const commonAngles = [...allAngles].filter((a) => angleSets.every((s) => s.has(a)));

  const uniqueAngles: Record<string, string[]> = {};
  for (let i = 0; i < chains.length; i++) {
    const key = chains[i].subject.slice(0, 60);
    uniqueAngles[key] = [...angleSets[i]].filter((a) => !commonAngles.includes(a));
  }

  // Idea counts and average scores per chain
  const ideaCounts: Record<string, number> = {};
  const averageScores: Record<string, number> = {};
  for (const chain of chains) {
    const key = chain.subject.slice(0, 60);
    ideaCounts[key] = chain.ideas.length;
    if (chain.scores.length > 0) {
      const total = chain.scores.reduce((s, sc) => s + (sc.overall ?? 0), 0);
      averageScores[key] = Math.round((total / chain.scores.length) * 100) / 100;
    }
  }

  // Shared themes: words appearing in idea titles across multiple chains
  const wordSets = chains.map((c) => {
    const words = new Set<string>();
    for (const idea of c.ideas) {
      for (const word of idea.title.toLowerCase().split(/\s+/)) {
        if (word.length > 4) words.add(word);
      }
    }
    return words;
  });

  const sharedThemes =
    wordSets.length > 1
      ? [...wordSets[0]].filter((w) => wordSets.slice(1).some((s) => s.has(w)))
      : [];

  return {
    commonAngles,
    uniqueAngles,
    ideaCounts,
    averageScores,
    sharedThemes,
  };
}

/**
 * Merge multiple Sankey diagrams into a single combined diagram.
 * Node IDs are prefixed to avoid collisions.
 */
export function mergeProvenanceDiagrams(diagrams: SankeyDiagram[]): SankeyDiagram {
  if (diagrams.length === 0) {
    return { nodes: [], links: [], title: "Merged Provenance" };
  }
  if (diagrams.length === 1) return diagrams[0];

  const mergedNodes: SankeyNode[] = [];
  const mergedLinks: SankeyLink[] = [];

  // Add a root node connecting all sessions
  mergedNodes.push({
    id: "merged-root",
    label: "All Sessions",
    type: "subject",
    value: diagrams.length,
    color: DEFAULT_COLORS.subject,
  });

  for (let i = 0; i < diagrams.length; i++) {
    const prefix = `s${i}-`;
    const diagram = diagrams[i];

    for (const node of diagram.nodes) {
      mergedNodes.push({ ...node, id: `${prefix}${node.id}` });
    }
    for (const link of diagram.links) {
      mergedLinks.push({
        ...link,
        source: `${prefix}${link.source}`,
        target: `${prefix}${link.target}`,
      });
    }

    // Connect merged root to each session's subject
    const subjectNode = diagram.nodes.find((n) => n.type === "subject");
    if (subjectNode) {
      mergedLinks.push({
        source: "merged-root",
        target: `${prefix}${subjectNode.id}`,
        value: subjectNode.value,
      });
    }
  }

  return {
    nodes: mergedNodes,
    links: mergedLinks,
    title: "Merged Provenance Diagram",
    metadata: { sessionCount: String(diagrams.length) },
  };
}

// ---- Helpers ----

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtml(text: string): string {
  return escapeXml(text);
}
