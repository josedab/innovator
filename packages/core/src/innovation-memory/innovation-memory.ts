/**
 * @module innovation-memory
 *
 * Persistent cross-session memory that tracks angle effectiveness per domain,
 * detects recurring patterns, and surfaces serendipitous connections.
 * Delivers context-aware pre-session recommendations and mid-session nudges.
 *
 * Builds on existing learning-loop, temporal-memory, serendipity, and
 * knowledge-graph modules.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MemoryGraphSchema,
  MemoryRecommendationSchema,
  InnovationEventSchema,
  DomainProfileSchema,
  type MemoryGraph,
  type MemoryNode,
  type MemoryEdge,
  type MemoryRecommendation,
  type InnovationEvent,
  type DomainProfile,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "innovation-memory");
const GRAPH_FILE = "memory-graph.json";
const EVENTS_FILE = "events.jsonl";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- Memory Graph ----

export function loadMemoryGraph(dir: string = DEFAULT_DIR): MemoryGraph {
  ensureDir(dir);
  const path = join(dir, GRAPH_FILE);
  if (existsSync(path)) {
    return MemoryGraphSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }
  return {
    nodes: [],
    edges: [],
    lastUpdatedAt: new Date().toISOString(),
    totalSessions: 0,
  };
}

function saveMemoryGraph(graph: MemoryGraph, dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  atomicWrite(join(dir, GRAPH_FILE), JSON.stringify(graph, null, 2));
}

// ---- Concept Ingestion ----

export function ingestConcepts(
  sessionId: string,
  concepts: Array<{
    label: string;
    type?: MemoryNode["type"];
    description?: string;
  }>,
  connections: Array<{
    sourceLabel: string;
    targetLabel: string;
    type?: MemoryEdge["type"];
    weight?: number;
    evidence?: string;
  }> = [],
  dir: string = DEFAULT_DIR
): MemoryGraph {
  const graph = loadMemoryGraph(dir);
  const now = new Date().toISOString();
  const nodeMap = new Map(graph.nodes.map((n) => [n.label.toLowerCase(), n]));

  // Upsert nodes
  for (const concept of concepts) {
    const key = concept.label.toLowerCase();
    const existing = nodeMap.get(key);

    if (existing) {
      existing.occurrenceCount++;
      existing.lastSeenAt = now;
      if (!existing.sessionIds.includes(sessionId)) {
        existing.sessionIds.push(sessionId);
      }
    } else {
      const node: MemoryNode = {
        id: `mem-${randomUUID().slice(0, 12)}`,
        type: concept.type ?? "concept",
        label: concept.label,
        description: concept.description,
        sessionIds: [sessionId],
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
      };
      graph.nodes.push(node);
      nodeMap.set(key, node);
    }
  }

  // Upsert edges
  for (const conn of connections) {
    const source = nodeMap.get(conn.sourceLabel.toLowerCase());
    const target = nodeMap.get(conn.targetLabel.toLowerCase());
    if (!source || !target) continue;

    const existingEdge = graph.edges.find(
      (e) => e.source === source.id && e.target === target.id && e.type === (conn.type ?? "related")
    );

    if (existingEdge) {
      existingEdge.weight = Math.min(1, existingEdge.weight + 0.1);
      if (!existingEdge.sessionIds.includes(sessionId)) {
        existingEdge.sessionIds.push(sessionId);
      }
    } else {
      graph.edges.push({
        source: source.id,
        target: target.id,
        type: conn.type ?? "related",
        weight: conn.weight ?? 0.5,
        evidence: conn.evidence,
        sessionIds: [sessionId],
        createdAt: now,
      });
    }
  }

  graph.totalSessions = new Set(graph.nodes.flatMap((n) => n.sessionIds)).size;
  graph.lastUpdatedAt = now;

  // Bound graph size
  if (graph.nodes.length > 10000) {
    graph.nodes.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
    graph.nodes = graph.nodes.slice(0, 10000);
    const validIds = new Set(graph.nodes.map((n) => n.id));
    graph.edges = graph.edges.filter((e) => validIds.has(e.source) && validIds.has(e.target));
  }

  saveMemoryGraph(graph, dir);
  return graph;
}

// ---- Event Tracking ----

export function trackEvent(
  event: Omit<InnovationEvent, "id" | "timestamp">,
  dir: string = DEFAULT_DIR
): InnovationEvent {
  ensureDir(dir);
  const fullEvent: InnovationEvent = {
    ...event,
    id: `evt-${randomUUID().slice(0, 12)}`,
    timestamp: new Date().toISOString(),
  };

  const validated = InnovationEventSchema.parse(fullEvent);
  appendFileSync(join(dir, EVENTS_FILE), JSON.stringify(validated) + "\n", "utf-8");
  return validated;
}

export function loadEvents(limit: number = 1000, dir: string = DEFAULT_DIR): InnovationEvent[] {
  const path = join(dir, EVENTS_FILE);
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((line) => InnovationEventSchema.parse(JSON.parse(line)));
}

// ---- Domain Profiles ----

export function computeDomainProfile(domain: string, dir: string = DEFAULT_DIR): DomainProfile {
  const events = loadEvents(5000, dir);
  const domainEvents = events.filter(
    (e) => e.metadata?.domain?.toLowerCase() === domain.toLowerCase()
  );

  const sessions = new Set(domainEvents.map((e) => e.sessionId).filter(Boolean));
  const angleStats = new Map<string, { total: number; quality: number; count: number }>();

  for (const event of domainEvents) {
    if (event.type === "angle.generated" && event.metadata?.angleId) {
      const angleId = event.metadata.angleId;
      const stats = angleStats.get(angleId) ?? { total: 0, quality: 0, count: 0 };
      stats.total++;
      if (event.metadata.qualityScore) {
        stats.quality += event.metadata.qualityScore;
        stats.count++;
      }
      angleStats.set(angleId, stats);
    }
  }

  const topAngles = Array.from(angleStats.entries())
    .map(([angleId, stats]) => ({
      angleId,
      effectivenessScore: stats.count > 0 ? stats.quality / stats.count / 100 : 0.5,
      usageCount: stats.total,
    }))
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    .slice(0, 10);

  const totalQuality = domainEvents
    .filter((e) => e.metadata?.qualityScore)
    .map((e) => e.metadata!.qualityScore!);
  const avgQuality =
    totalQuality.length > 0 ? totalQuality.reduce((a, b) => a + b, 0) / totalQuality.length : 0;

  const lastEvent = domainEvents.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];

  return DomainProfileSchema.parse({
    domain,
    sessionCount: sessions.size,
    topAngles,
    commonPatterns: [],
    averageQuality: Math.round(avgQuality),
    lastActiveAt: lastEvent?.timestamp ?? new Date().toISOString(),
  });
}

// ---- Recommendations ----

export function generatePreSessionRecommendations(
  subject: string,
  dir: string = DEFAULT_DIR
): MemoryRecommendation[] {
  const graph = loadMemoryGraph(dir);
  const recommendations: MemoryRecommendation[] = [];
  const now = new Date().toISOString();
  const subjectLower = subject.toLowerCase();
  const subjectWords = subjectLower.split(/\s+/).filter((w) => w.length > 3);

  // Find related nodes from memory
  const relatedNodes = graph.nodes.filter((n) =>
    subjectWords.some(
      (w) =>
        n.label.toLowerCase().includes(w) || (n.description?.toLowerCase().includes(w) ?? false)
    )
  );

  if (relatedNodes.length > 0) {
    // Prior exploration recommendation
    const topNode = relatedNodes.sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];

    recommendations.push(
      MemoryRecommendationSchema.parse({
        id: `rec-${randomUUID().slice(0, 12)}`,
        type: "pre-session",
        title: `Prior exploration: ${topNode.label}`,
        description: `You've explored "${topNode.label}" in ${topNode.occurrenceCount} previous session(s). Consider building on prior insights.`,
        confidence: Math.min(1, topNode.occurrenceCount * 0.2),
        relatedNodes: relatedNodes.slice(0, 5).map((n) => n.id),
        relatedSessions: topNode.sessionIds.slice(0, 5),
        actionable: true,
        createdAt: now,
      })
    );

    // Find connected concepts for serendipitous suggestions
    const relatedIds = new Set(relatedNodes.map((n) => n.id));
    const connectedEdges = graph.edges.filter(
      (e) => (relatedIds.has(e.source) || relatedIds.has(e.target)) && e.weight >= 0.4
    );

    const connectedNodeIds = new Set(connectedEdges.flatMap((e) => [e.source, e.target]));
    const serendipitousNodes = graph.nodes.filter(
      (n) => connectedNodeIds.has(n.id) && !relatedIds.has(n.id)
    );

    if (serendipitousNodes.length > 0) {
      const topConn = serendipitousNodes[0];
      recommendations.push(
        MemoryRecommendationSchema.parse({
          id: `rec-${randomUUID().slice(0, 12)}`,
          type: "connection-alert",
          title: `Unexpected connection: ${topConn.label}`,
          description: `"${topConn.label}" is connected to concepts in your subject. This cross-domain link might yield novel insights.`,
          confidence: 0.6,
          relatedNodes: [topConn.id],
          relatedSessions: topConn.sessionIds.slice(0, 3),
          actionable: true,
          suggestedSubject: `${subject} × ${topConn.label}`,
          createdAt: now,
        })
      );
    }
  }

  // Angle effectiveness recommendation
  const events = loadEvents(2000, dir);
  const angleScores = new Map<string, { total: number; count: number }>();
  for (const event of events) {
    if (event.type === "angle.rated" && event.metadata?.angleId) {
      const stats = angleScores.get(event.metadata.angleId) ?? {
        total: 0,
        count: 0,
      };
      stats.total += event.metadata.qualityScore ?? 50;
      stats.count++;
      angleScores.set(event.metadata.angleId, stats);
    }
  }

  if (angleScores.size > 0) {
    const bestAngle = Array.from(angleScores.entries())
      .map(([id, s]) => ({ id, avg: s.total / s.count }))
      .sort((a, b) => b.avg - a.avg)[0];

    recommendations.push(
      MemoryRecommendationSchema.parse({
        id: `rec-${randomUUID().slice(0, 12)}`,
        type: "angle-suggestion",
        title: `Top-performing angle: ${bestAngle.id}`,
        description: `Based on your history, "${bestAngle.id}" has the highest average quality score (${Math.round(bestAngle.avg)}/100). Consider prioritizing it.`,
        confidence: 0.7,
        relatedNodes: [],
        relatedSessions: [],
        actionable: true,
        suggestedAngle: bestAngle.id,
        createdAt: now,
      })
    );
  }

  return recommendations;
}

export function generateMidSessionNudges(
  sessionId: string,
  currentConcepts: string[],
  dir: string = DEFAULT_DIR
): MemoryRecommendation[] {
  const graph = loadMemoryGraph(dir);
  const nudges: MemoryRecommendation[] = [];
  const now = new Date().toISOString();

  // Find concepts in memory that connect to current session concepts
  const currentLower = new Set(currentConcepts.map((c) => c.toLowerCase()));
  const matchedNodes = graph.nodes.filter((n) => currentLower.has(n.label.toLowerCase()));

  if (matchedNodes.length === 0) return nudges;

  const matchedIds = new Set(matchedNodes.map((n) => n.id));

  // Find patterns: recurring concept pairs
  const recurrentEdges = graph.edges
    .filter(
      (e) =>
        (matchedIds.has(e.source) || matchedIds.has(e.target)) &&
        e.type === "recurrent" &&
        e.sessionIds.length >= 2
    )
    .sort((a, b) => b.weight - a.weight);

  for (const edge of recurrentEdges.slice(0, 2)) {
    const otherNodeId = matchedIds.has(edge.source) ? edge.target : edge.source;
    const otherNode = graph.nodes.find((n) => n.id === otherNodeId);
    if (!otherNode) continue;

    nudges.push(
      MemoryRecommendationSchema.parse({
        id: `nudge-${randomUUID().slice(0, 12)}`,
        type: "mid-session-nudge",
        title: `Recurring pattern detected`,
        description: `"${otherNode.label}" has appeared alongside your current concepts in ${edge.sessionIds.length} previous sessions. It may be worth exploring this connection.`,
        confidence: edge.weight,
        relatedNodes: [otherNodeId],
        relatedSessions: edge.sessionIds.slice(0, 5),
        actionable: true,
        createdAt: now,
      })
    );
  }

  return nudges;
}

// ---- Graph Queries ----

export function findRelatedConcepts(
  label: string,
  maxDepth: number = 2,
  dir: string = DEFAULT_DIR
): MemoryNode[] {
  const graph = loadMemoryGraph(dir);
  const rootNode = graph.nodes.find((n) => n.label.toLowerCase() === label.toLowerCase());
  if (!rootNode) return [];

  const visited = new Set<string>([rootNode.id]);
  const result: MemoryNode[] = [];
  let frontier = [rootNode.id];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const connected = graph.edges
        .filter((e) => e.source === nodeId || e.target === nodeId)
        .map((e) => (e.source === nodeId ? e.target : e.source))
        .filter((id) => !visited.has(id));

      for (const id of connected) {
        visited.add(id);
        nextFrontier.push(id);
        const node = graph.nodes.find((n) => n.id === id);
        if (node) result.push(node);
      }
    }
    frontier = nextFrontier;
  }

  return result;
}

export function getMemoryStats(dir: string = DEFAULT_DIR): {
  totalNodes: number;
  totalEdges: number;
  totalSessions: number;
  topConcepts: Array<{ label: string; occurrences: number }>;
  recentSessions: number;
} {
  const graph = loadMemoryGraph(dir);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    totalSessions: graph.totalSessions,
    topConcepts: graph.nodes
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 10)
      .map((n) => ({ label: n.label, occurrences: n.occurrenceCount })),
    recentSessions: new Set(
      graph.nodes.filter((n) => n.lastSeenAt >= thirtyDaysAgo).flatMap((n) => n.sessionIds)
    ).size,
  };
}
