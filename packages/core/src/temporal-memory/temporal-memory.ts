/**
 * @module temporal-memory
 *
 * Temporal graph store with ingestion, querying, recurrence detection,
 * and velocity metrics. Persists as JSON in ~/.innovator/temporal-memory/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import {
  TemporalGraphSchema,
  type TemporalGraph,
  type TemporalNode,
  type TemporalEdge,
  type TemporalQuery,
  type TemporalQueryResult,
  type ConceptRecurrence,
  type InnovationVelocity,
  type SessionIngestion,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "temporal-memory");
const GRAPH_FILE = "graph.json";

function graphPath(dir: string): string {
  return join(dir, GRAPH_FILE);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- Graph Persistence ----

export function loadTemporalGraph(dir: string = DEFAULT_DIR): TemporalGraph {
  ensureDir(dir);
  const path = graphPath(dir);
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf-8");
    return TemporalGraphSchema.parse(JSON.parse(raw));
  }
  const now = new Date().toISOString();
  return { version: 1, nodes: [], edges: [], createdAt: now, updatedAt: now };
}

function saveTemporalGraph(graph: TemporalGraph, dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  graph.updatedAt = new Date().toISOString();
  atomicWrite(graphPath(dir), JSON.stringify(graph, null, 2));
}

// ---- Node Operations ----

function findNodeByLabel(
  graph: TemporalGraph,
  label: string,
  type: string
): TemporalNode | undefined {
  const normalized = label.toLowerCase().trim();
  return graph.nodes.find((n) => n.label.toLowerCase().trim() === normalized && n.type === type);
}

function upsertNode(
  graph: TemporalGraph,
  label: string,
  type: TemporalNode["type"],
  sessionId: string,
  metadata?: Record<string, string>
): TemporalNode {
  const existing = findNodeByLabel(graph, label, type);
  const now = new Date().toISOString();

  if (existing) {
    existing.modifiedAt = now;
    existing.occurrenceCount++;
    if (!existing.sessionIds.includes(sessionId)) {
      existing.sessionIds.push(sessionId);
    }
    if (metadata) {
      existing.metadata = { ...existing.metadata, ...metadata };
    }
    return existing;
  }

  const node: TemporalNode = {
    id: `tn-${randomUUID().slice(0, 12)}`,
    label,
    type,
    createdAt: now,
    modifiedAt: now,
    confidence: 0.8,
    sessionIds: [sessionId],
    occurrenceCount: 1,
    metadata,
  };
  graph.nodes.push(node);
  return node;
}

function addEdge(
  graph: TemporalGraph,
  sourceId: string,
  targetId: string,
  type: TemporalEdge["type"],
  strength: number = 0.5,
  sessionId?: string,
  evidence?: string
): TemporalEdge {
  // Avoid duplicate edges
  const existing = graph.edges.find(
    (e) => e.source === sourceId && e.target === targetId && e.type === type
  );
  if (existing) {
    existing.strength = Math.min(1, existing.strength + 0.1);
    existing.timestamp = new Date().toISOString();
    return existing;
  }

  const edge: TemporalEdge = {
    id: `te-${randomUUID().slice(0, 12)}`,
    source: sourceId,
    target: targetId,
    type,
    timestamp: new Date().toISOString(),
    strength,
    evidence,
    sessionId,
  };
  graph.edges.push(edge);
  return edge;
}

// ---- Session Ingestion ----

/**
 * Ingest a completed innovation session into the temporal memory.
 * Extracts entities, creates temporal nodes and edges, detects recurrences.
 */
export function ingestSession(
  session: SessionIngestion,
  dir: string = DEFAULT_DIR
): { nodesCreated: number; edgesCreated: number; recurrences: ConceptRecurrence[] } {
  if (!session.sessionId?.trim()) {
    throw new Error("Session ID is required for ingestion");
  }
  if (!session.subject?.trim()) {
    throw new Error("Subject is required for ingestion");
  }
  if (!session.timestamp) {
    throw new Error("Timestamp is required for ingestion");
  }

  const graph = loadTemporalGraph(dir);
  const initialNodes = graph.nodes.length;
  const initialEdges = graph.edges.length;

  // Create session node
  const sessionNode = upsertNode(graph, session.subject, "session", session.sessionId, {
    timestamp: session.timestamp,
  });

  // Create concept nodes from investigation
  if (session.investigation) {
    for (const aspect of session.investigation.keyAspects) {
      const conceptNode = upsertNode(graph, aspect.title, "concept", session.sessionId, {
        description: aspect.description.slice(0, 500),
      });
      addEdge(graph, sessionNode.id, conceptNode.id, "part_of", 0.7, session.sessionId);
    }

    for (const challenge of session.investigation.challenges) {
      const challengeNode = upsertNode(graph, challenge, "challenge", session.sessionId);
      addEdge(graph, sessionNode.id, challengeNode.id, "part_of", 0.6, session.sessionId);
    }

    for (const opportunity of session.investigation.opportunities) {
      const oppNode = upsertNode(graph, opportunity, "opportunity", session.sessionId);
      addEdge(graph, sessionNode.id, oppNode.id, "enables", 0.6, session.sessionId);
    }
  }

  // Create idea nodes
  for (const idea of session.ideas) {
    const ideaNode = upsertNode(graph, idea.title, "idea", session.sessionId, {
      description: idea.description.slice(0, 500),
      angleId: idea.angleId,
    });
    addEdge(graph, sessionNode.id, ideaNode.id, "derived_from", 0.8, session.sessionId);

    // Create angle node
    const angleNode = upsertNode(graph, idea.angleId, "angle", session.sessionId);
    addEdge(graph, angleNode.id, ideaNode.id, "derived_from", 0.7, session.sessionId);
  }

  // Create theme nodes
  if (session.themes) {
    for (const theme of session.themes) {
      const themeNode = upsertNode(graph, theme, "theme", session.sessionId);
      addEdge(graph, sessionNode.id, themeNode.id, "part_of", 0.5, session.sessionId);
    }
  }

  // Record outcome
  if (session.outcome) {
    const outcomeNode = upsertNode(
      graph,
      `${session.subject} → ${session.outcome.status}`,
      "outcome",
      session.sessionId,
      { status: session.outcome.status, reasoning: session.outcome.reasoning ?? "" }
    );
    addEdge(graph, sessionNode.id, outcomeNode.id, "caused", 0.9, session.sessionId);
  }

  // Detect recurrences
  const recurrences = detectRecurrences(graph);

  saveTemporalGraph(graph, dir);

  return {
    nodesCreated: graph.nodes.length - initialNodes,
    edgesCreated: graph.edges.length - initialEdges,
    recurrences,
  };
}

// ---- Recurrence Detection ----

/** Find concepts that appear across multiple sessions. */
export function detectRecurrences(
  graph: TemporalGraph,
  minOccurrences: number = 2
): ConceptRecurrence[] {
  return graph.nodes
    .filter((n) => n.occurrenceCount >= minOccurrences && n.sessionIds.length >= minOccurrences)
    .map((n) => ({
      concept: n.label,
      nodeId: n.id,
      count: n.occurrenceCount,
      firstSeen: n.createdAt,
      lastSeen: n.modifiedAt,
      sessions: n.sessionIds,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---- Querying ----

/** Find nodes matching a text search, optionally filtered by time range and type. */
export function searchNodes(
  graph: TemporalGraph,
  query: string,
  options: {
    timeRange?: { from: string; to: string };
    nodeTypes?: TemporalNode["type"][];
    maxResults?: number;
  } = {}
): TemporalNode[] {
  const normalized = query.toLowerCase();

  let results = graph.nodes.filter((n) => {
    const matchesText =
      n.label.toLowerCase().includes(normalized) ||
      (n.metadata?.description ?? "").toLowerCase().includes(normalized);

    const matchesTime =
      !options.timeRange ||
      (n.createdAt >= options.timeRange.from && n.createdAt <= options.timeRange.to);

    const matchesType = !options.nodeTypes || options.nodeTypes.includes(n.type);

    return matchesText && matchesTime && matchesType;
  });

  results.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  if (options.maxResults) {
    results = results.slice(0, options.maxResults);
  }

  return results;
}

/** Get the evolution timeline for a concept — all connected nodes ordered by time. */
export function getConceptTimeline(
  graph: TemporalGraph,
  conceptLabel: string
): Array<{ timestamp: string; event: string; nodeId: string }> {
  const node =
    findNodeByLabel(graph, conceptLabel, "concept") ??
    findNodeByLabel(graph, conceptLabel, "idea") ??
    findNodeByLabel(graph, conceptLabel, "theme");

  if (!node) return [];

  // Find all connected nodes
  const connectedIds = new Set<string>([node.id]);
  for (const edge of graph.edges) {
    if (edge.source === node.id) connectedIds.add(edge.target);
    if (edge.target === node.id) connectedIds.add(edge.source);
  }

  const timeline = graph.nodes
    .filter((n) => connectedIds.has(n.id))
    .map((n) => ({
      timestamp: n.createdAt,
      event: `${n.type}: ${n.label}`,
      nodeId: n.id,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return timeline;
}

/** Get neighbors of a node within N hops. */
export function getNeighbors(
  graph: TemporalGraph,
  nodeId: string,
  maxHops: number = 2
): { nodes: TemporalNode[]; edges: TemporalEdge[] } {
  const visitedIds = new Set<string>([nodeId]);
  const resultEdges: TemporalEdge[] = [];
  let frontier = [nodeId];

  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier: string[] = [];
    for (const edge of graph.edges) {
      if (frontier.includes(edge.source) && !visitedIds.has(edge.target)) {
        visitedIds.add(edge.target);
        nextFrontier.push(edge.target);
        resultEdges.push(edge);
      }
      if (frontier.includes(edge.target) && !visitedIds.has(edge.source)) {
        visitedIds.add(edge.source);
        nextFrontier.push(edge.source);
        resultEdges.push(edge);
      }
    }
    frontier = nextFrontier;
  }

  const resultNodes = graph.nodes.filter((n) => visitedIds.has(n.id));
  return { nodes: resultNodes, edges: resultEdges };
}

// ---- NL Query (LLM-powered) ----

/**
 * Answer a natural-language temporal query using the graph context.
 */
export async function queryTemporalMemory(
  query: TemporalQuery,
  options: { model?: string; signal?: AbortSignal; dir?: string } = {}
): Promise<TemporalQueryResult> {
  const graph = loadTemporalGraph(options.dir ?? DEFAULT_DIR);

  // Find relevant nodes
  const matchingNodes = searchNodes(graph, query.question, {
    timeRange: query.timeRange,
    nodeTypes: query.nodeTypes,
    maxResults: query.maxResults ?? 20,
  });

  // Build context for LLM
  const nodeContext = matchingNodes
    .map(
      (n) =>
        `- [${n.type}] "${n.label}" (seen ${n.occurrenceCount}x, first: ${n.createdAt.split("T")[0]}, sessions: ${n.sessionIds.length})`
    )
    .join("\n");

  // Find related edges
  const nodeIds = new Set(matchingNodes.map((n) => n.id));
  const matchingEdges = graph.edges.filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target));

  const edgeContext = matchingEdges
    .slice(0, 30)
    .map((e) => {
      const sourceLabel = graph.nodes.find((n) => n.id === e.source)?.label ?? e.source;
      const targetLabel = graph.nodes.find((n) => n.id === e.target)?.label ?? e.target;
      return `- "${sourceLabel}" --[${e.type}]--> "${targetLabel}" (strength: ${e.strength})`;
    })
    .join("\n");

  const prompt = `You are an innovation memory analyst. Answer the following temporal query using the knowledge graph context below.

${wrapUserInput("QUERY", query.question)}
${query.timeRange ? `Time range: ${query.timeRange.from} to ${query.timeRange.to}` : ""}

Relevant concepts and ideas:
${nodeContext || "No matching nodes found."}

Relationships:
${edgeContext || "No relationships found."}

Respond with a clear narrative answering the query, referencing specific concepts and their evolution over time.
Respond in JSON:
{
  "narrative": "your answer as a coherent paragraph"
}`;

  let narrative = "No matching data found for this query.";

  if (matchingNodes.length > 0) {
    try {
      const result = await withRetry(
        async () => {
          const raw = await generateText({
            prompt,
            model: options.model,
            signal: options.signal,
          });
          const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
          return parsed.narrative as string;
        },
        { signal: options.signal }
      );
      narrative = result;
    } catch (err) {
      console.warn(
        "[temporal-memory] NL query failed, using fallback:",
        err instanceof Error ? err.message : err
      );
      // Fallback to a simple summary
      narrative =
        `Found ${matchingNodes.length} concepts related to "${query.question}". ` +
        `Most frequent: ${matchingNodes
          .slice(0, 3)
          .map((n) => `"${n.label}" (${n.occurrenceCount}x)`)
          .join(", ")}.`;
    }
  }

  // Build timeline
  const timeline = matchingNodes
    .map((n) => ({
      timestamp: n.createdAt,
      event: `${n.type}: ${n.label}`,
      nodeId: n.id,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Detect recurrences among matches
  const recurrences = matchingNodes
    .filter((n) => n.occurrenceCount >= 2)
    .map((n) => ({
      concept: n.label,
      count: n.occurrenceCount,
      firstSeen: n.createdAt,
      lastSeen: n.modifiedAt,
      sessions: n.sessionIds,
    }));

  return {
    narrative,
    matchingNodes,
    matchingEdges,
    timeline,
    recurrences,
  };
}

// ---- Innovation Velocity ----

/** Compute innovation velocity metrics for a given time period. */
export function computeVelocity(
  graph: TemporalGraph,
  periodMonths: number = 3
): InnovationVelocity {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - periodMonths);
  const cutoffStr = cutoff.toISOString();

  const recentNodes = graph.nodes.filter((n) => n.createdAt >= cutoffStr);
  const ideaNodes = recentNodes.filter((n) => n.type === "idea");
  const conceptNodes = recentNodes.filter((n) => n.type === "concept");
  const obsoletedNodes = graph.nodes.filter((n) => n.obsoletedAt && n.obsoletedAt >= cutoffStr);

  // Evolution edges as a proxy for concept evolution rate
  const recentEdges = graph.edges.filter(
    (e) => e.timestamp >= cutoffStr && e.type === "evolved_into"
  );

  // Outcome lead time: time from idea creation to outcome
  const outcomeNodes = recentNodes.filter((n) => n.type === "outcome");
  let totalLeadDays = 0;
  let outcomeCount = 0;
  for (const outcome of outcomeNodes) {
    const sessionEdge = graph.edges.find((e) => e.target === outcome.id && e.type === "caused");
    if (sessionEdge) {
      const sessionNode = graph.nodes.find((n) => n.id === sessionEdge.source);
      if (sessionNode) {
        const diff =
          new Date(outcome.createdAt).getTime() - new Date(sessionNode.createdAt).getTime();
        totalLeadDays += diff / (1000 * 60 * 60 * 24);
        outcomeCount++;
      }
    }
  }

  return {
    period: `${periodMonths} months`,
    ideasPerMonth: periodMonths > 0 ? Math.round(ideaNodes.length / periodMonths) : 0,
    conceptEvolutionRate: recentEdges.length,
    outcomeLeadTimeDays: outcomeCount > 0 ? Math.round(totalLeadDays / outcomeCount) : null,
    activeConcepts: conceptNodes.length,
    newConcepts: conceptNodes.filter((n) => n.occurrenceCount === 1).length,
    obsoletedConcepts: obsoletedNodes.length,
  };
}

// ---- Export / Delete ----

/** Export the full temporal graph. */
export function exportGraph(dir: string = DEFAULT_DIR): TemporalGraph {
  return loadTemporalGraph(dir);
}

/** Delete all temporal data for a specific session. */
export function deleteSessionData(sessionId: string, dir: string = DEFAULT_DIR): number {
  const graph = loadTemporalGraph(dir);
  const initial = graph.nodes.length + graph.edges.length;

  // Remove session from node session lists
  for (const node of graph.nodes) {
    node.sessionIds = node.sessionIds.filter((s) => s !== sessionId);
  }

  // Remove nodes that have no remaining sessions
  graph.nodes = graph.nodes.filter((n) => n.sessionIds.length > 0);

  // Remove edges referencing removed nodes
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  graph.edges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const removed = initial - (graph.nodes.length + graph.edges.length);
  saveTemporalGraph(graph, dir);
  return removed;
}

/**
 * Prune the graph by removing low-strength edges and single-occurrence
 * nodes older than the retention period. Prevents unbounded growth.
 */
export function pruneGraph(
  options: {
    maxNodes?: number;
    maxEdges?: number;
    minEdgeStrength?: number;
    retentionDays?: number;
    dir?: string;
  } = {}
): { nodesRemoved: number; edgesRemoved: number } {
  const dir = options.dir ?? DEFAULT_DIR;
  const graph = loadTemporalGraph(dir);
  const maxNodes = options.maxNodes ?? 10000;
  const maxEdges = options.maxEdges ?? 50000;
  const minStrength = options.minEdgeStrength ?? 0.1;
  const retentionDays = options.retentionDays ?? 365;
  const initialNodes = graph.nodes.length;
  const initialEdges = graph.edges.length;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  // Remove weak edges
  graph.edges = graph.edges.filter((e) => e.strength >= minStrength);

  // Remove old single-occurrence nodes
  graph.nodes = graph.nodes.filter((n) => n.occurrenceCount > 1 || n.modifiedAt >= cutoffStr);

  // Enforce hard caps (remove oldest nodes/edges if over limit)
  if (graph.nodes.length > maxNodes) {
    graph.nodes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    graph.nodes = graph.nodes.slice(0, maxNodes);
  }
  if (graph.edges.length > maxEdges) {
    graph.edges.sort((a, b) => b.strength - a.strength);
    graph.edges = graph.edges.slice(0, maxEdges);
  }

  // Remove orphan edges
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  graph.edges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  saveTemporalGraph(graph, dir);
  return {
    nodesRemoved: initialNodes - graph.nodes.length,
    edgesRemoved: initialEdges - graph.edges.length,
  };
}

// ---- Formatting ----

/** Format temporal graph stats as Markdown. */
export function temporalMemoryToMarkdown(graph: TemporalGraph): string {
  const recurrences = detectRecurrences(graph, 2);

  const lines: string[] = [
    "# 🧠 Temporal Innovation Memory",
    "",
    `**Nodes:** ${graph.nodes.length} | **Edges:** ${graph.edges.length}`,
    `**Created:** ${graph.createdAt.split("T")[0]} | **Updated:** ${graph.updatedAt.split("T")[0]}`,
    "",
  ];

  // Node type breakdown
  const typeCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }
  lines.push("## Node Types");
  lines.push("| Type | Count |");
  lines.push("|------|-------|");
  for (const [type, count] of typeCounts) {
    lines.push(`| ${type} | ${count} |`);
  }
  lines.push("");

  // Recurrences
  if (recurrences.length > 0) {
    lines.push("## Recurring Concepts");
    lines.push("| Concept | Occurrences | First Seen | Last Seen | Sessions |");
    lines.push("|---------|-------------|------------|-----------|----------|");
    for (const r of recurrences.slice(0, 20)) {
      lines.push(
        `| ${r.concept} | ${r.count} | ${r.firstSeen.split("T")[0]} | ${r.lastSeen.split("T")[0]} | ${r.sessions.length} |`
      );
    }
  }

  return lines.join("\n");
}
