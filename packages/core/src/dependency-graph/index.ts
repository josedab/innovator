/**
 * @module dependency-graph
 *
 * Idea dependency graph — analyzes relationships between generated ideas to
 * determine which enable others, which conflict, and which are complementary.
 * Produces a directed graph with optimal implementation sequencing via
 * topological sort with impact-weighted prioritization.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, InnovationIdea } from "../types.js";

// ---- Zod Schemas ----

/** Relationship types between ideas. */
export const RelationshipTypeSchema = z.enum([
  "enables",
  "requires",
  "conflicts",
  "complements",
  "extends",
]);

export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

/** Schema for a node in the idea dependency graph. */
export const IdeaDependencyNodeSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  angleId: z.string().max(100),
  impactScore: z.number().min(0).max(10).default(5),
  complexityScore: z.number().min(0).max(10).default(5),
  /** Topological sort order (lower = should implement first). */
  sequenceOrder: z.number().optional(),
  /** Whether this node is on the critical path. */
  isCriticalPath: z.boolean().default(false),
});

/** Schema for a directed edge in the idea dependency graph. */
export const IdeaDependencyEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relationship: RelationshipTypeSchema,
  strength: z.number().min(0).max(1).describe("Relationship strength (0=weak, 1=strong)"),
  reasoning: z.string().max(1000),
});

/** Schema for the full idea dependency graph. */
export const IdeaDependencyGraphSchema = z.object({
  nodes: z.array(IdeaDependencyNodeSchema),
  edges: z.array(IdeaDependencyEdgeSchema),
  criticalPath: z.array(z.string()).describe("Ordered list of node IDs on the critical path"),
  clusters: z.array(
    z.object({
      label: z.string().max(200),
      nodeIds: z.array(z.string()),
    })
  ),
  sequencedPlan: z.array(
    z.object({
      phase: z.number(),
      nodeIds: z.array(z.string()),
      rationale: z.string().max(1000),
    })
  ),
  generatedAt: z.string(),
});

export type IdeaDependencyNode = z.infer<typeof IdeaDependencyNodeSchema>;
export type IdeaDependencyEdge = z.infer<typeof IdeaDependencyEdgeSchema>;
export type IdeaDependencyGraph = z.infer<typeof IdeaDependencyGraphSchema>;

// ---- Graph Building ----

/**
 * Build an idea dependency graph from angle results using LLM-powered
 * relationship extraction and topological sorting.
 *
 * @param angleResults - Array of angle results containing ideas
 * @param subject - The original innovation subject
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns An IdeaDependencyGraph with nodes, edges, critical path, and sequencing
 */
export async function buildIdeaDependencyGraph(
  angleResults: AngleResult[],
  subject: string,
  model?: string,
  signal?: AbortSignal
): Promise<IdeaDependencyGraph> {
  // Build nodes from all ideas
  const nodes: IdeaDependencyNode[] = [];
  const ideaMap = new Map<string, InnovationIdea>();

  for (const ar of angleResults) {
    for (let i = 0; i < ar.ideas.length; i++) {
      const idea = ar.ideas[i];
      const id = `${ar.angleId}-${i}`;
      nodes.push({
        id,
        title: idea.title,
        description: idea.description,
        angleId: ar.angleId,
        impactScore: 5,
        complexityScore: 5,
        isCriticalPath: false,
      });
      ideaMap.set(id, idea);
    }
  }

  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      criticalPath: [],
      clusters: [],
      sequencedPlan: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Use LLM to extract relationships between ideas
  const ideasSummary = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    description: n.description.slice(0, 200),
  }));

  const prompt = `You are an innovation strategist analyzing relationships between ideas.

${wrapUserInput("SUBJECT", subject)}

IDEAS:
"""
${sanitizeLlmOutput(JSON.stringify(ideasSummary, null, 2))}
"""

Analyze ALL relationships between these ideas. For each pair of related ideas, determine:
- enables: Idea A makes Idea B possible or easier
- requires: Idea A needs Idea B to be implemented first
- conflicts: Ideas cannot coexist or compete for same resources
- complements: Ideas work better together than alone
- extends: Idea A builds upon Idea B

Also score each idea for impact (1-10) and complexity (1-10), and group related ideas into clusters.

You MUST respond with valid JSON only:
{
  "edges": [
    { "source": "idea-id-1", "target": "idea-id-2", "relationship": "enables", "strength": 0.8, "reasoning": "Brief reason" }
  ],
  "ideaScores": [
    { "id": "idea-id", "impactScore": 8, "complexityScore": 5 }
  ],
  "clusters": [
    { "label": "Cluster theme", "nodeIds": ["id1", "id2"] }
  ]
}

Only include meaningful relationships (strength > 0.3). Identify 2-5 clusters.`;

  let edges: IdeaDependencyEdge[] = [];
  let clusters: IdeaDependencyGraph["clusters"] = [];

  try {
    const parsed = await withRetry(
      async () => {
        const raw = await generateText({ prompt, model, serverMode: true, signal });
        const jsonStr = extractJson(raw);
        try {
          return JSON.parse(jsonStr) as {
            edges: Array<{
              source: string;
              target: string;
              relationship: string;
              strength: number;
              reasoning: string;
            }>;
            ideaScores?: Array<{ id: string; impactScore: number; complexityScore: number }>;
            clusters?: Array<{ label: string; nodeIds: string[] }>;
          };
        } catch {
          throw new Error(`Failed to parse dependency graph response as JSON`);
        }
      },
      {
        signal,
        isRetryable: (err) =>
          err instanceof Error &&
          (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
      }
    );

    // Validate edges against known node IDs
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = parsed.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationship: RelationshipTypeSchema.parse(e.relationship),
        strength: Math.max(0, Math.min(1, e.strength)),
        reasoning: e.reasoning,
      }));

    // Apply impact/complexity scores
    if (parsed.ideaScores) {
      for (const score of parsed.ideaScores) {
        const node = nodes.find((n) => n.id === score.id);
        if (node) {
          node.impactScore = Math.max(0, Math.min(10, score.impactScore));
          node.complexityScore = Math.max(0, Math.min(10, score.complexityScore));
        }
      }
    }

    if (parsed.clusters) {
      clusters = parsed.clusters.filter((c) => c.nodeIds.every((id) => nodeIds.has(id)));
    }
  } catch {
    // Fall back to empty relationships if LLM fails
  }

  // Topological sort with impact-weighted prioritization
  const { sortedIds, criticalPath } = topologicalSort(nodes, edges);

  // Assign sequence orders
  for (let i = 0; i < sortedIds.length; i++) {
    const node = nodes.find((n) => n.id === sortedIds[i]);
    if (node) {
      node.sequenceOrder = i;
      node.isCriticalPath = criticalPath.includes(node.id);
    }
  }

  // Build phased implementation plan
  const sequencedPlan = buildSequencedPlan(nodes, edges, sortedIds);

  return {
    nodes,
    edges,
    criticalPath,
    clusters,
    sequencedPlan,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Topological sort with impact-weighted prioritization.
 * Returns sorted node IDs and the critical path.
 */
function topologicalSort(
  nodes: IdeaDependencyNode[],
  edges: IdeaDependencyEdge[]
): { sortedIds: string[]; criticalPath: string[] } {
  // Build adjacency list for "requires" and "enables" relationships
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (edge.relationship === "requires" || edge.relationship === "enables") {
      const source = edge.relationship === "requires" ? edge.target : edge.source;
      const target = edge.relationship === "requires" ? edge.source : edge.target;
      adjacency.get(source)?.push(target);
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  // Kahn's algorithm with impact-weighted tie-breaking
  const sorted: string[] = [];
  const queue = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => b.impactScore - a.impactScore)
    .map((n) => n.id);

  while (queue.length > 0) {
    // Pop highest-impact node
    queue.sort((a, b) => {
      const nodeA = nodes.find((n) => n.id === a);
      const nodeB = nodes.find((n) => n.id === b);
      return (nodeB?.impactScore ?? 0) - (nodeA?.impactScore ?? 0);
    });
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Add any remaining nodes (cycles) at the end
  for (const node of nodes) {
    if (!sorted.includes(node.id)) {
      sorted.push(node.id);
    }
  }

  // Critical path: longest chain with highest cumulative impact
  const criticalPath = findCriticalPath(nodes, edges, sorted);

  return { sortedIds: sorted, criticalPath };
}

function findCriticalPath(
  nodes: IdeaDependencyNode[],
  edges: IdeaDependencyEdge[],
  sorted: string[]
): string[] {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();

  for (const id of sorted) {
    const node = nodes.find((n) => n.id === id);
    dist.set(id, node?.impactScore ?? 0);
  }

  for (const id of sorted) {
    const currentDist = dist.get(id) ?? 0;
    for (const edge of edges) {
      if (
        edge.source === id &&
        (edge.relationship === "enables" || edge.relationship === "requires")
      ) {
        const target = edge.relationship === "enables" ? edge.target : edge.source;
        const targetNode = nodes.find((n) => n.id === target);
        const newDist = currentDist + (targetNode?.impactScore ?? 0);
        if (newDist > (dist.get(target) ?? 0)) {
          dist.set(target, newDist);
          prev.set(target, id);
        }
      }
    }
  }

  // Find the endpoint with maximum distance
  let maxDist = 0;
  let endNode = sorted[0] ?? "";
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Trace back the critical path
  const path: string[] = [];
  let current: string | undefined = endNode;
  while (current) {
    path.unshift(current);
    current = prev.get(current);
  }

  return path;
}

function buildSequencedPlan(
  nodes: IdeaDependencyNode[],
  edges: IdeaDependencyEdge[],
  sorted: string[]
): IdeaDependencyGraph["sequencedPlan"] {
  if (sorted.length === 0) return [];

  // Group into phases based on dependency layers
  const phases: Array<{ phase: number; nodeIds: string[]; rationale: string }> = [];
  const assigned = new Set<string>();
  let phase = 1;

  while (assigned.size < sorted.length) {
    const phaseNodes: string[] = [];

    for (const id of sorted) {
      if (assigned.has(id)) continue;

      // Check if all dependencies are in previous phases
      const deps = edges
        .filter((e) => e.target === id && e.relationship === "requires")
        .map((e) => e.source);

      const allDepsResolved = deps.every((d) => assigned.has(d));
      if (allDepsResolved) {
        phaseNodes.push(id);
      }
    }

    if (phaseNodes.length === 0) {
      // Break cycles by adding remaining nodes
      for (const id of sorted) {
        if (!assigned.has(id)) {
          phaseNodes.push(id);
          break;
        }
      }
    }

    for (const id of phaseNodes) {
      assigned.add(id);
    }

    const titles = phaseNodes
      .map((id) => nodes.find((n) => n.id === id)?.title)
      .filter(Boolean)
      .join(", ");

    phases.push({
      phase,
      nodeIds: phaseNodes,
      rationale: `Phase ${phase}: ${titles}`,
    });

    phase++;
  }

  return phases;
}

/**
 * Export the dependency graph as a markdown report.
 */
export function dependencyGraphToMarkdown(graph: IdeaDependencyGraph): string {
  const lines: string[] = [
    "# Idea Dependency Graph",
    "",
    `Generated: ${graph.generatedAt}`,
    "",
    "## Implementation Sequence",
    "",
  ];

  for (const phase of graph.sequencedPlan) {
    lines.push(`### Phase ${phase.phase}`);
    for (const nodeId of phase.nodeIds) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) {
        const cp = node.isCriticalPath ? " ⚡ CRITICAL PATH" : "";
        lines.push(
          `- **${node.title}** (Impact: ${node.impactScore}/10, Complexity: ${node.complexityScore}/10)${cp}`
        );
      }
    }
    lines.push("");
  }

  if (graph.clusters.length > 0) {
    lines.push("## Idea Clusters", "");
    for (const cluster of graph.clusters) {
      lines.push(`### ${cluster.label}`);
      for (const nodeId of cluster.nodeIds) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node) lines.push(`- ${node.title}`);
      }
      lines.push("");
    }
  }

  if (graph.edges.length > 0) {
    lines.push("## Relationships", "");
    lines.push("| Source | → | Target | Type | Strength |");
    lines.push("|--------|---|--------|------|----------|");
    for (const edge of graph.edges) {
      const source = graph.nodes.find((n) => n.id === edge.source)?.title ?? edge.source;
      const target = graph.nodes.find((n) => n.id === edge.target)?.title ?? edge.target;
      lines.push(
        `| ${source} | → | ${target} | ${edge.relationship} | ${(edge.strength * 100).toFixed(0)}% |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export the dependency graph as a Mermaid diagram.
 */
export function dependencyGraphToMermaid(graph: IdeaDependencyGraph): string {
  const lines: string[] = ["graph TD"];

  // Add node definitions
  for (const node of graph.nodes) {
    const label = node.title.replace(/"/g, "'").slice(0, 60);
    const shape = node.isCriticalPath ? `${node.id}[["${label}"]]` : `${node.id}["${label}"]`;
    lines.push(`  ${shape}`);
  }

  lines.push("");

  // Relationship type to Mermaid arrow style
  const arrowStyles: Record<string, string> = {
    enables: "-->",
    requires: "-.->",
    conflicts: "--x",
    complements: "<-->",
    extends: "==>",
  };

  for (const edge of graph.edges) {
    const arrow = arrowStyles[edge.relationship] ?? "-->";
    const label = edge.relationship;
    lines.push(`  ${edge.source} ${arrow}|${label}| ${edge.target}`);
  }

  // Style critical path nodes
  const criticalNodes = graph.nodes.filter((n) => n.isCriticalPath);
  if (criticalNodes.length > 0) {
    lines.push("");
    lines.push(`  classDef critical fill:#ff6b6b,stroke:#c0392b,color:#fff`);
    lines.push(`  class ${criticalNodes.map((n) => n.id).join(",")} critical`);
  }

  // Style clusters with colors
  const clusterColors = ["#74b9ff", "#a29bfe", "#55efc4", "#ffeaa7", "#fab1a0"];
  graph.clusters.forEach((cluster, idx) => {
    if (cluster.nodeIds.length > 0) {
      const color = clusterColors[idx % clusterColors.length];
      lines.push(`  classDef cluster${idx} fill:${color},stroke:#636e72`);
      lines.push(`  class ${cluster.nodeIds.join(",")} cluster${idx}`);
    }
  });

  return lines.join("\n");
}
