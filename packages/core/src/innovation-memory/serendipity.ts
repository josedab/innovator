import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { InnovationEvent, MemoryEdge, MemoryGraph, MemoryNode } from "./types.js";

export const SerendipitousConnectionSchema = z.object({
  id: z.string().max(200),
  sourceConceptId: z.string().max(200),
  targetConceptId: z.string().max(200),
  sourceSessionId: z.string().max(200),
  targetSessionId: z.string().max(200),
  connectionType: z.enum([
    "analogy",
    "complementary",
    "contrarian",
    "emergent",
    "cross-domain",
  ]),
  explanation: z.string().max(1000),
  confidenceScore: z.number().min(0).max(1),
  discoveredAt: z.string(),
});
export type SerendipitousConnection = z.infer<typeof SerendipitousConnectionSchema>;

export const WeeklyDigestSchema = z.object({
  id: z.string().max(200),
  weekStart: z.string(),
  weekEnd: z.string(),
  totalSessions: z.number().int().min(0),
  totalIdeas: z.number().int().min(0),
  topConnections: z.array(SerendipitousConnectionSchema).max(10),
  trendingTopics: z
    .array(
      z.object({
        topic: z.string().max(200),
        frequency: z.number().int().min(1),
        growth: z.number(),
      })
    )
    .max(10),
  recommendations: z.array(z.string().max(500)).max(5),
  generatedAt: z.string(),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

export const InnovationProfileSchema = z.object({
  userId: z.string().max(200),
  totalSessions: z.number().int().min(0),
  totalIdeas: z.number().int().min(0),
  topDomains: z
    .array(z.object({ domain: z.string().max(200), count: z.number().int() }))
    .max(10),
  preferredAngles: z
    .array(
      z.object({
        angleId: z.string().max(100),
        usage: z.number().int(),
        effectiveness: z.number().min(0).max(1),
      })
    )
    .max(10),
  innovationStyle: z.enum(["explorer", "specialist", "synthesizer", "challenger", "builder"]),
  strengths: z.array(z.string().max(200)).max(5),
  growthAreas: z.array(z.string().max(200)).max(5),
  lastUpdated: z.string(),
});
export type InnovationProfile = z.infer<typeof InnovationProfileSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "among",
  "because",
  "been",
  "before",
  "being",
  "between",
  "could",
  "from",
  "have",
  "into",
  "more",
  "that",
  "their",
  "them",
  "they",
  "this",
  "using",
  "with",
]);
const ANGLE_LABELS: Record<string, string> = {
  scamper: "SCAMPER",
  "first-principles": "First Principles",
  "cross-domain": "Cross-Domain",
  constraints: "Constraints",
  inversion: "Inversion",
  perspectives: "Perspectives",
  "what-if": "What-If",
  "trend-collision": "Trend Collision",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tokenize(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function buildNodeContext(node: MemoryNode): Set<string> {
  return new Set([...tokenize(node.label), ...tokenize(node.description)]);
}

function calculateOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

function distinctSessions(source: MemoryNode, target: MemoryNode): [string, string] | null {
  for (const sourceSessionId of source.sessionIds) {
    const targetSessionId = target.sessionIds.find((sessionId) => sessionId !== sourceSessionId);
    if (targetSessionId) return [sourceSessionId, targetSessionId];
  }
  return null;
}

function buildAdjacency(edges: MemoryEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    adjacency.set(edge.source, adjacency.get(edge.source) ?? new Set<string>());
    adjacency.set(edge.target, adjacency.get(edge.target) ?? new Set<string>());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

function getSharedNeighborCount(
  sourceId: string,
  targetId: string,
  adjacency: Map<string, Set<string>>
): number {
  const sourceNeighbors = adjacency.get(sourceId) ?? new Set<string>();
  const targetNeighbors = adjacency.get(targetId) ?? new Set<string>();
  let shared = 0;
  for (const neighbor of sourceNeighbors) {
    if (targetNeighbors.has(neighbor)) shared++;
  }
  return shared;
}

function inferConnectionType(
  source: MemoryNode,
  target: MemoryNode,
  edge: MemoryEdge | undefined,
  overlap: number,
  sharedNeighborCount: number
): SerendipitousConnection["connectionType"] {
  if (edge?.type === "contradicts") return "contrarian";
  if (edge?.type === "synergy" || edge?.type === "enables") return "complementary";
  if (overlap >= 0.3) return "analogy";
  if (sharedNeighborCount >= 2) return "emergent";
  if (source.type !== target.type || overlap === 0) return "cross-domain";
  return "complementary";
}

function buildExplanation(
  source: MemoryNode,
  target: MemoryNode,
  type: SerendipitousConnection["connectionType"],
  sharedNeighborCount: number,
  overlap: number,
  edge: MemoryEdge | undefined
): string {
  const reasons: string[] = [];
  if (edge?.evidence) reasons.push(edge.evidence);
  if (sharedNeighborCount > 0) {
    reasons.push(`they share ${sharedNeighborCount} neighboring concept${sharedNeighborCount === 1 ? "" : "s"}`);
  }
  if (overlap > 0) {
    reasons.push(`their language overlaps by ${Math.round(overlap * 100)}%`);
  }
  if (source.type !== target.type) {
    reasons.push(`they span ${source.type} and ${target.type} memory nodes`);
  }

  const reasonText = reasons.length > 0 ? reasons.join("; ") : "they repeatedly appear in adjacent parts of the memory graph";
  return `${source.label} and ${target.label} form a ${type.replace(/-/g, " ")} connection because ${reasonText}.`.slice(0, 1000);
}

function createConnection(
  source: MemoryNode,
  target: MemoryNode,
  edge: MemoryEdge | undefined,
  adjacency: Map<string, Set<string>>,
  now: string
): SerendipitousConnection | null {
  const sessions = distinctSessions(source, target);
  if (!sessions) return null;

  const sourceContext = buildNodeContext(source);
  const targetContext = buildNodeContext(target);
  const overlap = calculateOverlap(sourceContext, targetContext);
  const sharedNeighborCount = getSharedNeighborCount(source.id, target.id, adjacency);
  const connectionType = inferConnectionType(source, target, edge, overlap, sharedNeighborCount);
  const baseWeight = edge?.weight ?? 0.35;
  const crossSessionBoost = Math.min(0.2, (source.sessionIds.length + target.sessionIds.length) * 0.03);
  const confidenceScore = clamp(
    0.2 + baseWeight * 0.45 + overlap * 0.2 + Math.min(sharedNeighborCount, 3) * 0.08 + crossSessionBoost,
    0,
    1
  );

  if (!edge && overlap < 0.15 && sharedNeighborCount === 0) return null;

  return SerendipitousConnectionSchema.parse({
    id: `ser-${randomUUID().slice(0, 12)}`,
    sourceConceptId: source.id,
    targetConceptId: target.id,
    sourceSessionId: sessions[0],
    targetSessionId: sessions[1],
    connectionType,
    explanation: buildExplanation(source, target, connectionType, sharedNeighborCount, overlap, edge),
    confidenceScore,
    discoveredAt: now,
  });
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(start: Date): Date {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function isWithinRange(timestamp: string, start: Date, end: Date): boolean {
  const time = new Date(timestamp).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function extractTopics(events: InnovationEvent[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const event of events) {
    const topics = new Set<string>();
    if (event.metadata?.domain) topics.add(event.metadata.domain);
    for (const token of tokenize(event.metadata?.subject)) {
      topics.add(token);
    }
    for (const topic of topics) {
      frequencies.set(topic, (frequencies.get(topic) ?? 0) + 1);
    }
  }
  return frequencies;
}

function formatAngle(angleId: string): string {
  return ANGLE_LABELS[angleId] ?? angleId;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function pickInnovationStyle(
  topDomains: InnovationProfile["topDomains"],
  preferredAngles: InnovationProfile["preferredAngles"],
  events: InnovationEvent[]
): InnovationProfile["innovationStyle"] {
  const dominantDomainShare =
    topDomains.length > 0
      ? topDomains[0].count / Math.max(1, topDomains.reduce((sum, item) => sum + item.count, 0))
      : 0;
  const challengerSignals =
    preferredAngles
      .filter((angle) => angle.angleId === "inversion")
      .reduce((sum, angle) => sum + angle.usage, 0) +
    events.filter((event) => event.type === "redteam.completed" || event.type === "debate.completed").length;
  const builderSignals = events.filter(
    (event) =>
      event.type === "idea.accepted" ||
      event.type === "pipeline.completed" ||
      event.type === "session.exported"
  ).length;
  const synthesizerSignals = preferredAngles
    .filter((angle) => angle.angleId === "cross-domain" || angle.angleId === "perspectives")
    .reduce((sum, angle) => sum + angle.usage, 0);

  if (challengerSignals >= 3) return "challenger";
  if (builderSignals >= 3) return "builder";
  if (synthesizerSignals >= 3 || topDomains.length >= 3) return "synthesizer";
  if (dominantDomainShare >= 0.65) return "specialist";
  return "explorer";
}

export function findSerendipitousConnections(
  graph: MemoryGraph,
  limit: number = 10
): SerendipitousConnection[] {
  const now = new Date().toISOString();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(graph.edges);
  const candidates = new Map<string, SerendipitousConnection>();

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    const connection = createConnection(source, target, edge, adjacency, now);
    if (!connection) continue;
    candidates.set([source.id, target.id].sort().join("::"), connection);
  }

  for (let index = 0; index < graph.nodes.length; index++) {
    const source = graph.nodes[index];
    for (let offset = index + 1; offset < graph.nodes.length; offset++) {
      const target = graph.nodes[offset];
      const key = [source.id, target.id].sort().join("::");
      if (candidates.has(key)) continue;
      const connection = createConnection(source, target, undefined, adjacency, now);
      if (!connection) continue;
      candidates.set(key, connection);
    }
  }

  return Array.from(candidates.values())
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, limit);
}

export function generateWeeklyDigest(events: InnovationEvent[], graph: MemoryGraph): WeeklyDigest {
  const referenceDate =
    events.length > 0
      ? events.reduce(
          (latest, event) =>
            new Date(event.timestamp).getTime() > latest.getTime() ? new Date(event.timestamp) : latest,
          new Date(events[0].timestamp)
        )
      : new Date();
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = endOfWeek(weekStart);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const previousWeekEnd = new Date(weekStart.getTime() - 1);
  const currentEvents = events.filter((event) => isWithinRange(event.timestamp, weekStart, weekEnd));
  const previousEvents = events.filter((event) => isWithinRange(event.timestamp, previousWeekStart, previousWeekEnd));
  const currentTopics = extractTopics(currentEvents);
  const previousTopics = extractTopics(previousEvents);
  const topConnections = findSerendipitousConnections(graph, 10);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const trendingTopics = Array.from(currentTopics.entries())
    .map(([topic, frequency]) => {
      const previousFrequency = previousTopics.get(topic) ?? 0;
      const growth = previousFrequency === 0 ? frequency : (frequency - previousFrequency) / previousFrequency;
      return {
        topic,
        frequency,
        growth: Number(growth.toFixed(2)),
      };
    })
    .sort((left, right) => {
      if (right.frequency === left.frequency) return right.growth - left.growth;
      return right.frequency - left.frequency;
    })
    .slice(0, 10);

  const totalSessions = new Set(currentEvents.map((event) => event.sessionId).filter(Boolean)).size;
  const totalIdeas = currentEvents.reduce((sum, event) => {
    if (typeof event.metadata?.ideaCount === "number") {
      return sum + event.metadata.ideaCount;
    }
    if (event.type === "idea.created" || event.type === "idea.accepted") {
      return sum + 1;
    }
    return sum;
  }, 0);

  const recommendations = uniqueStrings([
    topConnections[0]
      ? `Revisit the link between ${nodeById.get(topConnections[0].sourceConceptId) ?? topConnections[0].sourceConceptId} and ${nodeById.get(topConnections[0].targetConceptId) ?? topConnections[0].targetConceptId} to turn it into a concrete experiment.`
      : "Seed the graph with more connected concepts to unlock stronger serendipitous recommendations.",
    trendingTopics[0]
      ? `Double down on ${trendingTopics[0].topic} while momentum is high and capture what changed this week.`
      : "Capture clearer domains and subjects in events so topic trends become more actionable.",
    topConnections.some((connection) => connection.connectionType === "contrarian")
      ? "Stress-test a contrarian connection this week to surface risks earlier."
      : "Pair one familiar theme with one adjacent topic to encourage useful surprise.",
    totalSessions >= 3
      ? "Bundle the strongest recurring themes into a reusable playbook before next week starts."
      : "Increase session cadence to improve the signal quality of memory-based recommendations.",
    totalIdeas > 0
      ? `Promote one of this week's ${totalIdeas} ideas into a validation sprint while context is still fresh.`
      : "Capture idea counts on completed sessions so future digests can highlight output quality.",
  ]).slice(0, 5);

  return WeeklyDigestSchema.parse({
    id: `digest-${randomUUID().slice(0, 12)}`,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalSessions,
    totalIdeas,
    topConnections,
    trendingTopics,
    recommendations,
    generatedAt: new Date().toISOString(),
  });
}

export function buildInnovationProfile(
  events: InnovationEvent[],
  graph: MemoryGraph,
  userId: string
): InnovationProfile {
  const matchingEvents = events.filter((event) => event.userId === userId);
  const userEvents = matchingEvents.length > 0 ? matchingEvents : events.filter((event) => !event.userId);

  const totalSessions = new Set(userEvents.map((event) => event.sessionId).filter(Boolean)).size;
  const totalIdeas = userEvents.reduce((sum, event) => {
    if (typeof event.metadata?.ideaCount === "number") return sum + event.metadata.ideaCount;
    if (event.type === "idea.created" || event.type === "idea.accepted") return sum + 1;
    return sum;
  }, 0);

  const domainCounts = new Map<string, number>();
  for (const event of userEvents) {
    if (!event.metadata?.domain) continue;
    domainCounts.set(event.metadata.domain, (domainCounts.get(event.metadata.domain) ?? 0) + 1);
  }
  const topDomains = Array.from(domainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  const angleStats = new Map<string, { usage: number; quality: number; qualityCount: number }>();
  for (const event of userEvents) {
    const angleId = event.metadata?.angleId;
    if (!angleId) continue;
    const stats = angleStats.get(angleId) ?? { usage: 0, quality: 0, qualityCount: 0 };
    stats.usage += event.type === "angle.generated" || event.type === "angle.rated" ? 1 : 0;
    if (typeof event.metadata?.qualityScore === "number") {
      stats.quality += event.metadata.qualityScore;
      stats.qualityCount += 1;
    }
    angleStats.set(angleId, stats);
  }

  const preferredAngles = Array.from(angleStats.entries())
    .map(([angleId, stats]) => ({
      angleId,
      usage: stats.usage,
      effectiveness:
        stats.qualityCount > 0 ? clamp(stats.quality / stats.qualityCount / 100, 0, 1) : 0.5,
    }))
    .sort((left, right) => {
      if (right.effectiveness === left.effectiveness) return right.usage - left.usage;
      return right.effectiveness - left.effectiveness;
    })
    .slice(0, 10);

  const innovationStyle = pickInnovationStyle(topDomains, preferredAngles, userEvents);
  const strengths = uniqueStrings([
    topDomains[0] ? `Strong domain memory in ${topDomains[0].domain}` : "Consistent session logging",
    preferredAngles[0]
      ? `High leverage with ${formatAngle(preferredAngles[0].angleId)} thinking`
      : "Willingness to explore multiple idea pathways",
    graph.totalSessions >= 5 ? "Builds on prior insights across sessions" : "Keeps a lightweight but growing innovation memory",
    innovationStyle === "synthesizer" ? "Connects patterns across adjacent domains" : "Maintains forward momentum in ideation",
    userEvents.filter((event) => event.type === "idea.accepted").length > 0
      ? "Moves promising ideas toward commitment"
      : "Captures ideas before they fade",
  ]).slice(0, 5);

  const growthAreas = uniqueStrings([
    topDomains.length <= 1 ? "Expand into one adjacent domain to improve cross-pollination" : "Keep balancing breadth with depth across domains",
    preferredAngles.some((angle) => angle.angleId === "cross-domain")
      ? "Increase validation after cross-domain exploration"
      : "Use Cross-Domain prompts more often to unlock novel combinations",
    preferredAngles.some((angle) => angle.angleId === "inversion")
      ? "Turn contrarian insights into concrete experiments"
      : "Use Inversion more often to pressure-test assumptions",
    userEvents.filter((event) => event.type === "idea.accepted").length === 0
      ? "Promote more generated ideas into explicit accept or reject decisions"
      : "Record more quality scores to sharpen weighting decisions",
    graph.edges.length < graph.nodes.length ? "Capture more explicit concept connections between sessions" : "Review older graph edges and prune weak links",
  ]).slice(0, 5);

  const lastUpdated = userEvents.length > 0
    ? userEvents.reduce((latest, event) => (event.timestamp > latest ? event.timestamp : latest), userEvents[0].timestamp)
    : new Date().toISOString();

  return InnovationProfileSchema.parse({
    userId,
    totalSessions,
    totalIdeas,
    topDomains,
    preferredAngles,
    innovationStyle,
    strengths,
    growthAreas,
    lastUpdated,
  });
}

export function digestToMarkdown(digest: WeeklyDigest): string {
  const lines: string[] = [
    `# Weekly Innovation Digest`,
    "",
    `**Week:** ${digest.weekStart} → ${digest.weekEnd}`,
    `**Sessions:** ${digest.totalSessions}`,
    `**Ideas Captured:** ${digest.totalIdeas}`,
    "",
    "## Top Connections",
    "",
  ];

  if (digest.topConnections.length === 0) {
    lines.push("- No serendipitous connections detected yet.", "");
  } else {
    for (const connection of digest.topConnections) {
      lines.push(
        `- **${connection.connectionType}** — ${connection.explanation} (confidence ${(connection.confidenceScore * 100).toFixed(0)}%)`
      );
    }
    lines.push("");
  }

  lines.push("## Trending Topics", "");
  if (digest.trendingTopics.length === 0) {
    lines.push("- No trending topics available.", "");
  } else {
    for (const topic of digest.trendingTopics) {
      lines.push(`- ${topic.topic} — ${topic.frequency} mentions (${topic.growth >= 0 ? "+" : ""}${(topic.growth * 100).toFixed(0)}% growth)`);
    }
    lines.push("");
  }

  lines.push("## Recommendations", "");
  for (const recommendation of digest.recommendations) {
    lines.push(`- ${recommendation}`);
  }

  return lines.join("\n");
}

export function profileToMarkdown(profile: InnovationProfile): string {
  const lines: string[] = [
    `# Innovation Profile: ${profile.userId}`,
    "",
    `**Style:** ${profile.innovationStyle}`,
    `**Sessions:** ${profile.totalSessions}`,
    `**Ideas:** ${profile.totalIdeas}`,
    `**Last Updated:** ${profile.lastUpdated}`,
    "",
    "## Top Domains",
    "",
  ];

  if (profile.topDomains.length === 0) {
    lines.push("- No domain history yet.", "");
  } else {
    for (const domain of profile.topDomains) {
      lines.push(`- ${domain.domain} (${domain.count})`);
    }
    lines.push("");
  }

  lines.push("## Preferred Angles", "");
  if (profile.preferredAngles.length === 0) {
    lines.push("- No angle usage recorded yet.", "");
  } else {
    for (const angle of profile.preferredAngles) {
      lines.push(`- ${formatAngle(angle.angleId)} — usage ${angle.usage}, effectiveness ${(angle.effectiveness * 100).toFixed(0)}%`);
    }
    lines.push("");
  }

  lines.push("## Strengths", "");
  for (const strength of profile.strengths) {
    lines.push(`- ${strength}`);
  }
  lines.push("", "## Growth Areas", "");
  for (const growthArea of profile.growthAreas) {
    lines.push(`- ${growthArea}`);
  }

  return lines.join("\n");
}
