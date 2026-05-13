/**
 * @module knowledge-graph/entity-extractor
 *
 * Extracts entities and relationships from investigation results and ideas.
 * Uses regex patterns and heuristics to identify technologies, concepts,
 * organizations, trends, and their relationships.
 */

import { randomUUID } from "node:crypto";
import type { EntityNode, RelationshipEdge, KnowledgeGraph } from "./index.js";

// ---- Types ----

export interface ExtractedEntity {
  id: string;
  name: string;
  type: "concept" | "technology" | "person" | "organization" | "domain" | "trend";
  mentions: number;
  sessions: string[];
  firstSeen: string;
  lastSeen: string;
  embedding: number[];
}

export interface ExtractedRelationship {
  sourceId: string;
  targetId: string;
  type:
    | "related_to"
    | "builds_on"
    | "competes_with"
    | "enables"
    | "inspired_by"
    | "contradicts";
  weight: number;
  sessions: string[];
  firstSeen: string;
}

// ---- Internal Helpers ----

const TECH_PATTERNS = [
  /\b(AI|ML|NLP|LLM|GPT|BERT|CNN|RNN|GAN)\b/g,
  /\b\w+(?:\.js|\.ts|\.py|\.rs|\.go)\b/gi,
  /\b(?:React|Vue|Angular|Svelte|Next\.?js|Node\.?js|Deno|Bun)\b/gi,
  /\b(?:Kubernetes|Docker|AWS|Azure|GCP|Terraform|Kafka|Redis|PostgreSQL|MongoDB)\b/gi,
  /\b(?:GraphQL|REST|gRPC|WebSocket|HTTP\/[23])\b/gi,
  /\b(?:blockchain|smart contract|web3|NFT|DeFi|DAO)\b/gi,
  /\b(?:quantum computing|edge computing|serverless|microservices)\b/gi,
];

const ORG_PATTERNS = [
  /\b(?:Google|Microsoft|Apple|Amazon|Meta|OpenAI|Anthropic|Tesla|SpaceX)\b/g,
  /\b(?:IBM|Oracle|Salesforce|SAP|Nvidia|Intel|AMD|Uber|Airbnb|Stripe)\b/g,
  /\b[A-Z][a-z]+(?:\s(?:Inc|Corp|Ltd|LLC|Co|Labs|AI|Technologies))\b/g,
];

const TREND_KEYWORDS = [
  "emerging",
  "rising",
  "growing",
  "trending",
  "next-generation",
  "future",
  "disrupting",
  "breakthrough",
  "paradigm shift",
  "transformation",
];

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "to", "of",
  "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "under",
  "again", "further", "then", "once", "here", "there", "when", "where",
  "why", "how", "all", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so",
  "than", "too", "very", "and", "but", "or", "if", "while", "this",
  "that", "these", "those", "it", "its", "they", "them", "their", "we",
  "our", "us",
]);

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleStem(word: string): string {
  return word
    .replace(/(?:ing|tion|sion|ment|ness|able|ible|ful|less|ous|ive|ity)$/i, "")
    .replace(/(?:ies)$/i, "y")
    .replace(/(?:es|s)$/i, "");
}

function simpleEmbedding(text: string): number[] {
  const hash: number[] = new Array(32).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const idx = i % 32;
    hash[idx] = (hash[idx] + normalized.charCodeAt(i) * (i + 1)) % 256;
  }
  const magnitude = Math.sqrt(hash.reduce((sum, v) => sum + v * v, 0)) || 1;
  return hash.map((v) => v / magnitude);
}

function extractTermsFromText(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Extract bigrams
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      freq.set(bigram, (freq.get(bigram) ?? 0) + 2);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([term]) => term);
}

function classifyEntity(
  term: string,
  context: string
): ExtractedEntity["type"] {
  const lower = term.toLowerCase();

  // Check technology patterns
  for (const pattern of TECH_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(term)) return "technology";
  }

  // Check organization patterns
  for (const pattern of ORG_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(term)) return "organization";
  }

  // Check trend keywords in surrounding context
  const contextLower = context.toLowerCase();
  const termIdx = contextLower.indexOf(lower);
  if (termIdx >= 0) {
    const surrounding = contextLower.slice(
      Math.max(0, termIdx - 100),
      termIdx + lower.length + 100
    );
    if (TREND_KEYWORDS.some((kw) => surrounding.includes(kw))) return "trend";
  }

  // Heuristics for capitalized proper nouns (potential person/org)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(term)) return "person";

  return "concept";
}

function extractPatternMatches(text: string): Array<{ name: string; type: ExtractedEntity["type"] }> {
  const matches: Array<{ name: string; type: ExtractedEntity["type"] }> = [];
  const seen = new Set<string>();

  for (const pattern of TECH_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const name = m[0].trim();
      const key = name.toLowerCase();
      if (!seen.has(key) && name.length > 1) {
        seen.add(key);
        matches.push({ name, type: "technology" });
      }
    }
  }

  for (const pattern of ORG_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const name = m[0].trim();
      const key = name.toLowerCase();
      if (!seen.has(key) && name.length > 1) {
        seen.add(key);
        matches.push({ name, type: "organization" });
      }
    }
  }

  return matches;
}

// ---- Interface for investigation/ideas ----

interface InvestigationLike {
  summary: string;
  currentState: string;
  keyAspects: Array<{ title: string; description: string }>;
  challenges: string[];
  opportunities: string[];
}

interface IdeaLike {
  title: string;
  description: string;
  potentialImpact: string;
}

// ---- EntityExtractor Class ----

export class EntityExtractor {
  /**
   * Extract entities and relationships from investigation results.
   */
  extractFromInvestigation(
    investigation: InvestigationLike,
    sessionId: string
  ): { entities: ExtractedEntity[]; relationships: ExtractedRelationship[] } {
    const now = new Date().toISOString();
    const entities: ExtractedEntity[] = [];
    const entityMap = new Map<string, ExtractedEntity>();

    const corpus = [
      investigation.summary,
      investigation.currentState,
      ...investigation.keyAspects.map((a) => `${a.title} ${a.description}`),
      ...investigation.challenges,
      ...investigation.opportunities,
    ].join(" ");

    // Extract via patterns
    const patternMatches = extractPatternMatches(corpus);
    for (const match of patternMatches) {
      const key = normalizeLabel(match.name);
      if (!entityMap.has(key)) {
        const entity: ExtractedEntity = {
          id: randomUUID(),
          name: match.name,
          type: match.type,
          mentions: 1,
          sessions: [sessionId],
          firstSeen: now,
          lastSeen: now,
          embedding: simpleEmbedding(match.name),
        };
        entityMap.set(key, entity);
      } else {
        entityMap.get(key)!.mentions++;
      }
    }

    // Extract via term frequency
    const terms = extractTermsFromText(corpus);
    for (const term of terms) {
      const key = normalizeLabel(term);
      if (!entityMap.has(key)) {
        const type = classifyEntity(term, corpus);
        const entity: ExtractedEntity = {
          id: randomUUID(),
          name: term,
          type,
          mentions: 1,
          sessions: [sessionId],
          firstSeen: now,
          lastSeen: now,
          embedding: simpleEmbedding(term),
        };
        entityMap.set(key, entity);
      } else {
        entityMap.get(key)!.mentions++;
      }
    }

    // Add key aspects as domain entities
    for (const aspect of investigation.keyAspects) {
      const key = normalizeLabel(aspect.title);
      if (!entityMap.has(key)) {
        entityMap.set(key, {
          id: randomUUID(),
          name: aspect.title,
          type: "domain",
          mentions: 1,
          sessions: [sessionId],
          firstSeen: now,
          lastSeen: now,
          embedding: simpleEmbedding(aspect.title),
        });
      }
    }

    entities.push(...Array.from(entityMap.values()));

    // Build relationships from co-occurrence
    const relationships: ExtractedRelationship[] = [];
    const entityList = Array.from(entityMap.values());

    for (let i = 0; i < entityList.length; i++) {
      for (let j = i + 1; j < entityList.length && j < i + 6; j++) {
        const weight = 1 / (j - i + 1);
        const relType = this.inferRelationshipType(entityList[i], entityList[j], corpus);
        relationships.push({
          sourceId: entityList[i].id,
          targetId: entityList[j].id,
          type: relType,
          weight: Math.min(1, weight),
          sessions: [sessionId],
          firstSeen: now,
        });
      }
    }

    return { entities, relationships };
  }

  /**
   * Extract entities and relationships from generated ideas.
   */
  extractFromIdeas(
    ideas: IdeaLike[],
    sessionId: string
  ): { entities: ExtractedEntity[]; relationships: ExtractedRelationship[] } {
    const now = new Date().toISOString();
    const entityMap = new Map<string, ExtractedEntity>();
    const relationships: ExtractedRelationship[] = [];

    for (const idea of ideas) {
      const text = `${idea.title} ${idea.description} ${idea.potentialImpact}`;

      // Pattern extraction
      const patternMatches = extractPatternMatches(text);
      for (const match of patternMatches) {
        const key = normalizeLabel(match.name);
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            id: randomUUID(),
            name: match.name,
            type: match.type,
            mentions: 1,
            sessions: [sessionId],
            firstSeen: now,
            lastSeen: now,
            embedding: simpleEmbedding(match.name),
          });
        } else {
          entityMap.get(key)!.mentions++;
        }
      }

      // Term extraction
      const terms = extractTermsFromText(text);
      for (const term of terms.slice(0, 10)) {
        const key = normalizeLabel(term);
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            id: randomUUID(),
            name: term,
            type: classifyEntity(term, text),
            mentions: 1,
            sessions: [sessionId],
            firstSeen: now,
            lastSeen: now,
            embedding: simpleEmbedding(term),
          });
        } else {
          entityMap.get(key)!.mentions++;
        }
      }
    }

    // Create relationships between entities from the same ideas
    const entityList = Array.from(entityMap.values());
    for (let i = 0; i < entityList.length; i++) {
      for (let j = i + 1; j < entityList.length && j < i + 4; j++) {
        relationships.push({
          sourceId: entityList[i].id,
          targetId: entityList[j].id,
          type: "related_to",
          weight: 0.5 / (j - i),
          sessions: [sessionId],
          firstSeen: now,
        });
      }
    }

    return { entities: Array.from(entityMap.values()), relationships };
  }

  /**
   * Merge similar entities using case-insensitive matching and simple stemming.
   */
  deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const merged = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const stem = simpleStem(normalizeLabel(entity.name));
      const existing = merged.get(stem);

      if (existing) {
        existing.mentions += entity.mentions;
        existing.sessions = [...new Set([...existing.sessions, ...entity.sessions])];
        existing.lastSeen =
          entity.lastSeen > existing.lastSeen ? entity.lastSeen : existing.lastSeen;
        existing.firstSeen =
          entity.firstSeen < existing.firstSeen ? entity.firstSeen : existing.firstSeen;
      } else {
        merged.set(stem, { ...entity });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Track how an entity's connections changed over time.
   */
  trackTemporalEvolution(
    entityId: string,
    graph: KnowledgeGraph
  ): {
    entityId: string;
    label: string;
    snapshots: Array<{
      sessionId: string;
      connectionCount: number;
      connectedLabels: string[];
    }>;
    trend: "growing" | "stable" | "declining";
  } | undefined {
    const entity = graph.nodes.find((n) => n.id === entityId);
    if (!entity) return undefined;

    const snapshots = entity.sourceSessionIds.map((sessionId) => {
      const sessionEdges = graph.edges.filter(
        (e) =>
          (e.source === entityId || e.target === entityId) &&
          e.sourceSessionIds.includes(sessionId)
      );
      const connectedIds = sessionEdges.map((e) =>
        e.source === entityId ? e.target : e.source
      );
      const connectedLabels = connectedIds
        .map((id) => graph.nodes.find((n) => n.id === id)?.label ?? id)
        .slice(0, 5);

      return { sessionId, connectionCount: sessionEdges.length, connectedLabels };
    });

    // Determine trend from connection growth
    let trend: "growing" | "stable" | "declining" = "stable";
    if (snapshots.length >= 2) {
      const first = snapshots[0].connectionCount;
      const last = snapshots[snapshots.length - 1].connectionCount;
      if (last > first * 1.5) trend = "growing";
      else if (last < first * 0.5) trend = "declining";
    }

    return { entityId, label: entity.label, snapshots, trend };
  }

  /**
   * Build a local neighborhood subgraph starting from an entity.
   */
  buildSubgraph(
    entityId: string,
    depth: number,
    graph: KnowledgeGraph
  ): { nodes: EntityNode[]; edges: RelationshipEdge[] } {
    const visited = new Set<string>([entityId]);
    const resultNodes: EntityNode[] = [];
    const resultEdges: RelationshipEdge[] = [];
    let frontier = [entityId];

    const seedNode = graph.nodes.find((n) => n.id === entityId);
    if (seedNode) resultNodes.push(seedNode);

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const edges = graph.edges.filter(
          (e) => e.source === nodeId || e.target === nodeId
        );
        for (const edge of edges) {
          const neighborId = edge.source === nodeId ? edge.target : edge.source;
          resultEdges.push(edge);
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const neighbor = graph.nodes.find((n) => n.id === neighborId);
            if (neighbor) {
              resultNodes.push(neighbor);
              nextFrontier.push(neighborId);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    // Deduplicate edges
    const edgeSet = new Set<string>();
    const uniqueEdges = resultEdges.filter((e) => {
      const key = [e.source, e.target].sort().join("-");
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    });

    return { nodes: resultNodes, edges: uniqueEdges };
  }

  /** Infer relationship type from entity types and context. */
  private inferRelationshipType(
    a: ExtractedEntity,
    b: ExtractedEntity,
    context: string
  ): ExtractedRelationship["type"] {
    const contextLower = context.toLowerCase();
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();

    // Check for enabling patterns
    const enablePatterns = ["enables", "supports", "powers", "facilitates"];
    for (const pattern of enablePatterns) {
      if (contextLower.includes(`${aLower} ${pattern}`) || contextLower.includes(`${pattern} ${bLower}`)) {
        return "enables";
      }
    }

    // Check for competition patterns
    const competePatterns = ["vs", "versus", "competes", "rival", "alternative"];
    for (const pattern of competePatterns) {
      if (contextLower.includes(`${aLower} ${pattern} ${bLower}`)) {
        return "competes_with";
      }
    }

    // Check for contradiction patterns
    const contradictPatterns = ["contradicts", "opposes", "conflicts"];
    for (const pattern of contradictPatterns) {
      if (contextLower.includes(pattern)) return "contradicts";
    }

    // Check for builds-on patterns
    if (a.type === "technology" && b.type === "technology") {
      return "builds_on";
    }

    return "related_to";
  }
}
