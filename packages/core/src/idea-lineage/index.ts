/**
 * @module idea-lineage
 *
 * Idea Lineage Visualization — builds lineage graphs from session data,
 * supports filtering and export. Graph data is compatible with D3.js
 * force-directed layouts and React Flow.
 */

import { randomUUID } from "node:crypto";
import type { LineageNode, LineageEdge, LineageGraph, LineageConfig } from "./types.js";
import { LineageNodeSchema, LineageEdgeSchema, LineageGraphSchema } from "./types.js";

export * from "./types.js";

// ---- Graph Builder ----

/**
 * Build a lineage graph from session history data.
 *
 * Accepts a simplified session structure and produces a force-directed
 * graph data model.
 */
export function buildLineageGraph(
  subject: string,
  sessions: Array<{
    id: string;
    createdAt: string;
    investigation?: { summary: string };
    angleResults?: Array<{
      angleId: string;
      angleName: string;
      ideas: Array<{
        title: string;
        description?: string;
        survivedGauntlet?: boolean;
        score?: number;
        evolvedFrom?: string;
        mergedWith?: string[];
      }>;
    }>;
    synthesis?: { summary: string };
  }>,
  config: LineageConfig = {}
): LineageGraph {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const now = new Date().toISOString();
  const includeFailures = config.includeFailures ?? true;

  let filteredSessions = sessions;
  if (config.sessionIds?.length) {
    filteredSessions = sessions.filter((s) => config.sessionIds!.includes(s.id));
  }

  const ideaNodeIds = new Map<string, string>();
  let maxDepth = 0;

  for (const session of filteredSessions) {
    // Session node
    const sessionNodeId = `session-${session.id}`;
    nodes.push(
      LineageNodeSchema.parse({
        id: sessionNodeId,
        type: "session",
        label: `Session ${session.id.slice(0, 8)}`,
        sessionId: session.id,
        createdAt: session.createdAt,
      })
    );

    // Investigation node
    if (session.investigation) {
      const invNodeId = `inv-${session.id}`;
      nodes.push(
        LineageNodeSchema.parse({
          id: invNodeId,
          type: "investigation",
          label: session.investigation.summary.slice(0, 200),
          sessionId: session.id,
          createdAt: session.createdAt,
        })
      );
      edges.push(
        LineageEdgeSchema.parse({
          id: randomUUID(),
          source: sessionNodeId,
          target: invNodeId,
          type: "investigated-by",
          createdAt: session.createdAt,
        })
      );

      // Angle results
      let depth = 1;
      for (const ar of session.angleResults ?? []) {
        const angleNodeId = `angle-${session.id}-${ar.angleId}`;
        nodes.push(
          LineageNodeSchema.parse({
            id: angleNodeId,
            type: "angle",
            label: ar.angleName,
            sessionId: session.id,
            createdAt: session.createdAt,
          })
        );
        edges.push(
          LineageEdgeSchema.parse({
            id: randomUUID(),
            source: invNodeId,
            target: angleNodeId,
            type: "generated-from",
            createdAt: session.createdAt,
          })
        );

        for (const idea of ar.ideas) {
          const survived = idea.survivedGauntlet !== false;
          if (!survived && !includeFailures) continue;

          const ideaNodeId = `idea-${session.id}-${idea.title.replace(/\s+/g, "-").slice(0, 50)}`;
          nodes.push(
            LineageNodeSchema.parse({
              id: ideaNodeId,
              type: "idea",
              label: idea.title,
              sessionId: session.id,
              createdAt: session.createdAt,
              score: idea.score,
            })
          );
          ideaNodeIds.set(idea.title, ideaNodeId);

          edges.push(
            LineageEdgeSchema.parse({
              id: randomUUID(),
              source: angleNodeId,
              target: ideaNodeId,
              type: "generated-from",
              createdAt: session.createdAt,
            })
          );

          // Gauntlet result edge
          if (idea.survivedGauntlet !== undefined) {
            edges.push(
              LineageEdgeSchema.parse({
                id: randomUUID(),
                source: ideaNodeId,
                target: ideaNodeId,
                type: survived ? "survived-gauntlet" : "failed-gauntlet",
                createdAt: session.createdAt,
              })
            );
          }

          // Evolution edge
          if (idea.evolvedFrom) {
            const parentId = ideaNodeIds.get(idea.evolvedFrom);
            if (parentId) {
              edges.push(
                LineageEdgeSchema.parse({
                  id: randomUUID(),
                  source: parentId,
                  target: ideaNodeId,
                  type: "evolved-into",
                  createdAt: session.createdAt,
                })
              );
              depth = Math.max(depth, 3);
            }
          }

          // Merge edges
          if (idea.mergedWith) {
            for (const mergeTitle of idea.mergedWith) {
              const mergeId = ideaNodeIds.get(mergeTitle);
              if (mergeId) {
                edges.push(
                  LineageEdgeSchema.parse({
                    id: randomUUID(),
                    source: mergeId,
                    target: ideaNodeId,
                    type: "merged-with",
                    createdAt: session.createdAt,
                  })
                );
              }
            }
          }
        }
      }
      maxDepth = Math.max(maxDepth, depth);

      // Synthesis node
      if (session.synthesis) {
        const synthNodeId = `synth-${session.id}`;
        nodes.push(
          LineageNodeSchema.parse({
            id: synthNodeId,
            type: "synthesis",
            label: session.synthesis.summary.slice(0, 200),
            sessionId: session.id,
            createdAt: session.createdAt,
          })
        );
      }
    }
  }

  // Apply max depth filter
  if (config.maxDepth !== undefined && config.maxDepth < maxDepth) {
    maxDepth = config.maxDepth;
  }

  return LineageGraphSchema.parse({
    id: randomUUID(),
    subject,
    nodes,
    edges,
    depth: maxDepth,
    sessionCount: filteredSessions.length,
    generatedAt: now,
  });
}

/**
 * Get lineage data for a specific idea by title.
 */
export function getLineageForIdea(
  graph: LineageGraph,
  ideaTitle: string
): { ancestors: LineageNode[]; descendants: LineageNode[]; edges: LineageEdge[] } {
  const ideaNode = graph.nodes.find((n) => n.type === "idea" && n.label === ideaTitle);
  if (!ideaNode) return { ancestors: [], descendants: [], edges: [] };

  // BFS for ancestors
  const ancestors: LineageNode[] = [];
  const ancestorEdges: LineageEdge[] = [];
  const visited = new Set<string>();
  const queue = [ideaNode.id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const incomingEdges = graph.edges.filter((e) => e.target === current && e.source !== current);
    for (const edge of incomingEdges) {
      ancestorEdges.push(edge);
      const sourceNode = graph.nodes.find((n) => n.id === edge.source);
      if (sourceNode) {
        ancestors.push(sourceNode);
        queue.push(sourceNode.id);
      }
    }
  }

  // BFS for descendants
  const descendants: LineageNode[] = [];
  const descendantEdges: LineageEdge[] = [];
  const visited2 = new Set<string>();
  const queue2 = [ideaNode.id];

  while (queue2.length > 0) {
    const current = queue2.shift()!;
    if (visited2.has(current)) continue;
    visited2.add(current);

    const outgoingEdges = graph.edges.filter((e) => e.source === current && e.target !== current);
    for (const edge of outgoingEdges) {
      descendantEdges.push(edge);
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      if (targetNode) {
        descendants.push(targetNode);
        queue2.push(targetNode.id);
      }
    }
  }

  return { ancestors, descendants, edges: [...ancestorEdges, ...descendantEdges] };
}

/**
 * Export lineage graph data as SVG-compatible path data.
 * Returns structured data for SVG rendering (not raw SVG markup).
 */
export function exportLineageToSvgData(graph: LineageGraph): {
  nodes: Array<{ id: string; label: string; type: string; x: number; y: number; r: number }>;
  edges: Array<{ source: string; target: string; type: string }>;
  width: number;
  height: number;
} {
  // Simple force-directed layout approximation
  const nodeCount = graph.nodes.length;
  const width = Math.max(800, nodeCount * 100);
  const height = Math.max(600, nodeCount * 80);

  const nodeData = graph.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodeCount;
    const radius = Math.min(width, height) * 0.35;
    return {
      id: n.id,
      label: n.label.slice(0, 50),
      type: n.type,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      r: n.type === "idea" ? 20 : n.type === "session" ? 30 : 15,
    };
  });

  const edgeData = graph.edges
    .filter((e) => e.source !== e.target)
    .map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }));

  return { nodes: nodeData, edges: edgeData, width, height };
}

/**
 * Export lineage graph as JSON for external consumption.
 */
export function exportLineageToJson(graph: LineageGraph): string {
  return JSON.stringify(
    {
      subject: graph.subject,
      generatedAt: graph.generatedAt,
      stats: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        depth: graph.depth,
        sessions: graph.sessionCount,
      },
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        sessionId: n.sessionId,
        score: n.score,
        createdAt: n.createdAt,
      })),
      edges: graph.edges
        .filter((e) => e.source !== e.target)
        .map((e) => ({
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
          weight: e.weight,
        })),
    },
    null,
    2
  );
}

/**
 * Export lineage graph as Markdown report.
 */
export function exportLineageToMarkdown(graph: LineageGraph): string {
  const lines: string[] = [
    `# Idea Lineage: ${graph.subject}`,
    "",
    `> Generated: ${graph.generatedAt} | Sessions: ${graph.sessionCount} | Depth: ${graph.depth}`,
    "",
    `## Summary`,
    "",
    `- **Nodes:** ${graph.nodes.length}`,
    `- **Edges:** ${graph.edges.length}`,
    `- **Sessions:** ${graph.sessionCount}`,
    "",
  ];

  // Group nodes by type
  const nodesByType = new Map<string, typeof graph.nodes>();
  for (const node of graph.nodes) {
    const list = nodesByType.get(node.type) ?? [];
    list.push(node);
    nodesByType.set(node.type, list);
  }

  // Ideas section
  const ideas = nodesByType.get("idea") ?? [];
  if (ideas.length > 0) {
    lines.push("## Ideas", "");
    for (const idea of ideas) {
      const scoreStr = idea.score !== undefined ? ` (score: ${idea.score})` : "";
      lines.push(`- **${idea.label}**${scoreStr}`);

      // Find evolution edges
      const evolvedFrom = graph.edges
        .filter((e) => e.target === idea.id && e.type === "evolved-into")
        .map((e) => graph.nodes.find((n) => n.id === e.source)?.label)
        .filter(Boolean);
      if (evolvedFrom.length > 0) {
        lines.push(`  - Evolved from: ${evolvedFrom.join(", ")}`);
      }

      const gauntletEdge = graph.edges.find(
        (e) =>
          e.target === idea.id && (e.type === "survived-gauntlet" || e.type === "failed-gauntlet")
      );
      if (gauntletEdge) {
        lines.push(
          `  - Gauntlet: ${gauntletEdge.type === "survived-gauntlet" ? "✅ Survived" : "❌ Failed"}`
        );
      }
    }
    lines.push("");
  }

  // Investigations section
  const investigations = nodesByType.get("investigation") ?? [];
  if (investigations.length > 0) {
    lines.push("## Investigations", "");
    for (const inv of investigations) {
      lines.push(`- ${inv.label}`);
    }
    lines.push("");
  }

  // Edge summary
  const edgeTypes = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeTypes.set(edge.type, (edgeTypes.get(edge.type) ?? 0) + 1);
  }
  lines.push("## Relationships", "");
  for (const [type, count] of edgeTypes) {
    lines.push(`- ${type}: ${count}`);
  }

  return lines.join("\n");
}
