/**
 * @module knowledge-graph/nl-query
 *
 * Natural language query interface and proactive suggestion engine
 * for the innovation knowledge graph. Enables queries like
 * "What ideas have we explored for sustainability?" and provides
 * context-aware suggestions during new sessions.
 */

import type { EntityNode, RelationshipEdge, KnowledgeGraph } from "./types.js";

// ---- NL Query Types ----

export interface NLQueryResult {
  query: string;
  interpretation: string;
  nodes: EntityNode[];
  edges: RelationshipEdge[];
  answer: string;
  confidence: number;
  relatedQueries: string[];
}

export interface GraphSuggestion {
  type: "related-subject" | "past-idea" | "unexplored-angle" | "trending-concept";
  title: string;
  description: string;
  relevanceScore: number;
  sourceNodeIds: string[];
  sourceSessionIds: string[];
}

export interface SubjectContext {
  subject: string;
  relatedEntities: EntityNode[];
  previousSessions: string[];
  suggestedAngles: string[];
  knowledgeGaps: string[];
}

// ---- NL Query Parser ----

interface ParsedQuery {
  intent: "search" | "list" | "compare" | "timeline" | "connections";
  entityFilter?: string;
  typeFilter?: EntityNode["type"];
  timeFilter?: { from?: string; to?: string };
  limit: number;
}

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: ParsedQuery["intent"] }> = [
  { pattern: /^(what|which|find|search|show)\b/i, intent: "search" },
  { pattern: /^(list|all|every)\b/i, intent: "list" },
  { pattern: /^(compare|versus|vs|difference)\b/i, intent: "compare" },
  { pattern: /^(when|timeline|history|evolution)\b/i, intent: "timeline" },
  { pattern: /^(how|connect|relate|link|between)\b/i, intent: "connections" },
];

const TYPE_KEYWORDS: Record<string, EntityNode["type"]> = {
  tech: "technology",
  technology: "technology",
  technologies: "technology",
  challenge: "challenge",
  challenges: "challenge",
  problem: "challenge",
  problems: "challenge",
  opportunity: "opportunity",
  opportunities: "opportunity",
  concept: "concept",
  concepts: "concept",
  idea: "concept",
  ideas: "concept",
  domain: "domain",
  domains: "domain",
  field: "domain",
  organization: "organization",
  company: "organization",
  person: "person",
  people: "person",
};

export function parseNLQuery(query: string): ParsedQuery {
  const q = query.trim().toLowerCase();
  let intent: ParsedQuery["intent"] = "search";

  for (const { pattern, intent: matchedIntent } of INTENT_PATTERNS) {
    if (pattern.test(q)) {
      intent = matchedIntent;
      break;
    }
  }

  // Extract type filter
  let typeFilter: EntityNode["type"] | undefined;
  for (const [keyword, type] of Object.entries(TYPE_KEYWORDS)) {
    if (q.includes(keyword)) {
      typeFilter = type;
      break;
    }
  }

  // Extract entity terms (remove stop words and intent words)
  const stopWords = new Set([
    "what",
    "which",
    "find",
    "search",
    "show",
    "list",
    "all",
    "every",
    "compare",
    "versus",
    "vs",
    "when",
    "how",
    "connect",
    "relate",
    "have",
    "has",
    "been",
    "the",
    "a",
    "an",
    "of",
    "for",
    "in",
    "on",
    "with",
    "about",
    "related",
    "to",
    "we",
    "our",
    "explored",
    "are",
    "is",
    "were",
    "was",
    "do",
    "does",
    "did",
    "can",
    "could",
    ...Object.keys(TYPE_KEYWORDS),
  ]);

  const entityFilter =
    q
      .replace(/[?!.,;:]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .join(" ")
      .trim() || undefined;

  return { intent, entityFilter, typeFilter, limit: 20 };
}

// ---- Query Execution ----

export function executeNLQuery(graph: KnowledgeGraph, query: string): NLQueryResult {
  const parsed = parseNLQuery(query);
  let matchedNodes: EntityNode[] = [];
  let matchedEdges: RelationshipEdge[] = [];

  // Filter nodes by entity and type
  matchedNodes = graph.nodes.filter((node) => {
    let matches = true;
    if (parsed.typeFilter) {
      matches = node.type === parsed.typeFilter;
    }
    if (parsed.entityFilter && matches) {
      const terms = parsed.entityFilter.split(/\s+/);
      matches = terms.some(
        (term) =>
          node.label.toLowerCase().includes(term) ||
          (node.description?.toLowerCase().includes(term) ?? false)
      );
    }
    return matches;
  });

  // Sort by relevance (occurrence count + recency)
  matchedNodes.sort((a, b) => {
    const scoreA = a.occurrenceCount * 10 + new Date(a.lastSeen).getTime() / 1e12;
    const scoreB = b.occurrenceCount * 10 + new Date(b.lastSeen).getTime() / 1e12;
    return scoreB - scoreA;
  });

  matchedNodes = matchedNodes.slice(0, parsed.limit);

  // Collect related edges
  const nodeIds = new Set(matchedNodes.map((n) => n.id));
  matchedEdges = graph.edges.filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target));

  // Build human-readable answer
  const answer = buildAnswer(parsed, matchedNodes, matchedEdges);
  const confidence = matchedNodes.length > 0 ? Math.min(1, matchedNodes.length / 5) : 0;

  // Generate related queries
  const relatedQueries = generateRelatedQueries(parsed, matchedNodes);

  return {
    query,
    interpretation: describeInterpretation(parsed),
    nodes: matchedNodes,
    edges: matchedEdges,
    answer,
    confidence,
    relatedQueries,
  };
}

function buildAnswer(parsed: ParsedQuery, nodes: EntityNode[], edges: RelationshipEdge[]): string {
  if (nodes.length === 0) {
    return "No matching entities found in the knowledge graph. Try broadening your search terms.";
  }

  const typeLabel = parsed.typeFilter ?? "entities";
  const lines: string[] = [`Found ${nodes.length} ${typeLabel}:`];

  for (const node of nodes.slice(0, 10)) {
    const sessions = node.sourceSessionIds.length;
    lines.push(
      `• **${node.label}** (${node.type}) — seen ${node.occurrenceCount} time(s) across ${sessions} session(s)`
    );
    if (node.description) {
      lines.push(`  ${node.description.slice(0, 150)}`);
    }
  }

  if (edges.length > 0) {
    lines.push("", `${edges.length} relationship(s) found between these entities.`);
  }

  return lines.join("\n");
}

function describeInterpretation(parsed: ParsedQuery): string {
  const parts: string[] = [`Intent: ${parsed.intent}`];
  if (parsed.typeFilter) parts.push(`Type: ${parsed.typeFilter}`);
  if (parsed.entityFilter) parts.push(`Terms: "${parsed.entityFilter}"`);
  return parts.join(" | ");
}

function generateRelatedQueries(parsed: ParsedQuery, nodes: EntityNode[]): string[] {
  const queries: string[] = [];

  if (nodes.length > 0) {
    const topNode = nodes[0];
    queries.push(`What challenges are related to ${topNode.label}?`);
    queries.push(`Show opportunities connected to ${topNode.label}`);
    if (topNode.type !== "technology") {
      queries.push(`What technologies relate to ${topNode.label}?`);
    }
  }

  if (parsed.typeFilter) {
    const otherTypes = ["concept", "technology", "challenge", "opportunity"].filter(
      (t) => t !== parsed.typeFilter
    );
    if (otherTypes.length > 0 && parsed.entityFilter) {
      queries.push(`Find ${otherTypes[0]}s related to ${parsed.entityFilter}`);
    }
  }

  return queries.slice(0, 5);
}

// ---- Proactive Suggestions ----

export function generateSuggestions(
  graph: KnowledgeGraph,
  subject: string,
  maxSuggestions: number = 5
): GraphSuggestion[] {
  const suggestions: GraphSuggestion[] = [];
  const subjectLower = subject.toLowerCase();
  const subjectTerms = subjectLower.split(/\s+/).filter((t) => t.length > 3);

  // Find nodes related to the subject
  const relatedNodes = graph.nodes.filter((n) =>
    subjectTerms.some(
      (term) =>
        n.label.toLowerCase().includes(term) ||
        (n.description?.toLowerCase().includes(term) ?? false)
    )
  );

  // Suggestion: Past related subjects
  const relatedDomains = relatedNodes
    .filter((n) => n.type === "domain")
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  for (const domain of relatedDomains.slice(0, 2)) {
    suggestions.push({
      type: "related-subject",
      title: `Previously explored: ${domain.label}`,
      description: `This subject was investigated ${domain.occurrenceCount} time(s). Consider reviewing past findings.`,
      relevanceScore: Math.min(1, domain.occurrenceCount / 5),
      sourceNodeIds: [domain.id],
      sourceSessionIds: domain.sourceSessionIds,
    });
  }

  // Suggestion: Related concepts that could inform the investigation
  const relatedConcepts = relatedNodes
    .filter((n) => n.type === "concept" && !subjectTerms.includes(n.label.toLowerCase()))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  for (const concept of relatedConcepts.slice(0, 2)) {
    suggestions.push({
      type: "past-idea",
      title: `Related concept: ${concept.label}`,
      description:
        concept.description ?? `Concept seen across ${concept.sourceSessionIds.length} sessions`,
      relevanceScore: Math.min(1, concept.occurrenceCount / 3),
      sourceNodeIds: [concept.id],
      sourceSessionIds: concept.sourceSessionIds,
    });
  }

  // Suggestion: Trending concepts (high occurrence, recent)
  const trending = graph.nodes
    .filter(
      (n) =>
        n.occurrenceCount >= 3 &&
        !relatedNodes.includes(n) &&
        Date.now() - new Date(n.lastSeen).getTime() < 30 * 24 * 60 * 60 * 1000
    )
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  for (const trend of trending.slice(0, 2)) {
    suggestions.push({
      type: "trending-concept",
      title: `Trending: ${trend.label}`,
      description: `Appears in ${trend.occurrenceCount} investigations recently. May offer cross-pollination insights.`,
      relevanceScore: 0.5,
      sourceNodeIds: [trend.id],
      sourceSessionIds: trend.sourceSessionIds,
    });
  }

  // Suggestion: Knowledge gaps (angles not yet explored for related subjects)
  const exploredAngles = new Set(
    relatedNodes.flatMap((n) => (n.metadata?.angles as string[]) ?? [])
  );

  const allAngles = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];
  const unexploredAngles = allAngles.filter((a) => !exploredAngles.has(a));

  if (unexploredAngles.length > 0 && relatedNodes.length > 0) {
    suggestions.push({
      type: "unexplored-angle",
      title: `Try unexplored angles: ${unexploredAngles.slice(0, 3).join(", ")}`,
      description: `These angles haven't been applied to related subjects yet.`,
      relevanceScore: 0.6,
      sourceNodeIds: relatedNodes.slice(0, 3).map((n) => n.id),
      sourceSessionIds: [],
    });
  }

  return suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, maxSuggestions);
}

// ---- Subject Context ----

export function buildSubjectContext(graph: KnowledgeGraph, subject: string): SubjectContext {
  const subjectTerms = subject
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  const relatedEntities = graph.nodes
    .filter((n) =>
      subjectTerms.some(
        (term) =>
          n.label.toLowerCase().includes(term) ||
          (n.description?.toLowerCase().includes(term) ?? false)
      )
    )
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 20);

  const previousSessions = [...new Set(relatedEntities.flatMap((n) => n.sourceSessionIds))];

  const challenges = relatedEntities.filter((n) => n.type === "challenge");
  const opportunities = relatedEntities.filter((n) => n.type === "opportunity");

  const suggestedAngles: string[] = [];
  if (challenges.length > opportunities.length) {
    suggestedAngles.push("inversion", "constraints", "first-principles");
  } else {
    suggestedAngles.push("trend-collision", "cross-domain", "what-if");
  }

  const knowledgeGaps: string[] = [];
  if (challenges.length === 0)
    knowledgeGaps.push("No challenges identified yet for related topics");
  if (opportunities.length === 0) knowledgeGaps.push("No opportunities mapped for related topics");
  if (relatedEntities.filter((n) => n.type === "technology").length === 0) {
    knowledgeGaps.push("No technologies linked to this subject area");
  }

  return {
    subject,
    relatedEntities,
    previousSessions,
    suggestedAngles,
    knowledgeGaps,
  };
}

// ---- Graph Visualization Data ----

export interface GraphVisualizationData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    size: number;
    color: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    label?: string;
  }>;
}

const TYPE_COLORS: Record<string, string> = {
  concept: "#3b82f6",
  technology: "#22c55e",
  challenge: "#ef4444",
  opportunity: "#f59e0b",
  domain: "#8b5cf6",
  person: "#ec4899",
  organization: "#06b6d4",
};

export function toVisualizationData(
  nodes: EntityNode[],
  edges: RelationshipEdge[]
): GraphVisualizationData {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      size: Math.max(10, Math.min(50, n.occurrenceCount * 5)),
      color: TYPE_COLORS[n.type] ?? "#6b7280",
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      label: e.label,
    })),
  };
}
