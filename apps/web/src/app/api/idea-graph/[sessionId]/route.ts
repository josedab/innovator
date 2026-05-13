/**
 * @description Session-specific idea relationship graph retrieval.
 */
export const runtime = "nodejs";

import {
  getSession,
  indexDocument,
  findSimilarDocuments,
  clearEmbeddingsIndex,
  generateText,
  extractJson,
  withRetry,
} from "@innovator/core";
import type { SessionRecord, InnovationIdea } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { validateModel } from "@/lib/validate-request";

const RelationshipType = z.enum(["builds-on", "conflicts-with", "prerequisite-of", "alternative-to", "complements"]);
type RelationshipType = z.infer<typeof RelationshipType>;

interface GraphNode {
  id: string;
  title: string;
  description: string;
  angleId: string;
  feasibility: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: RelationshipType;
  confidence: number;
}

interface IdeaGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  criticalPath: string[];
}

const ClassifyResponseSchema = z.object({
  relationships: z.array(z.object({
    sourceIndex: z.number(),
    targetIndex: z.number(),
    relationship: RelationshipType,
    confidence: z.number().min(0).max(1),
  })).max(100),
});

async function classifyRelationships(
  ideas: Array<{ title: string; description: string }>,
  similarPairs: Array<[number, number, number]>,
  model?: string,
  signal?: AbortSignal
): Promise<Array<{ sourceIndex: number; targetIndex: number; relationship: RelationshipType; confidence: number }>> {
  if (similarPairs.length === 0) return [];

  const pairsDesc = similarPairs.map(([i, j, sim]) =>
    `Pair ${i}-${j} (similarity: ${sim.toFixed(2)}): "${ideas[i].title}" vs "${ideas[j].title}"`
  ).join("\n");

  const ideaList = ideas.map((idea, i) => `${i}. ${idea.title}: ${idea.description}`).join("\n");

  const prompt = `You are analyzing relationships between innovation ideas.

IDEAS:
${ideaList}

SIMILAR PAIRS TO CLASSIFY:
${pairsDesc}

For each pair, classify the relationship type:
- "builds-on": second idea extends or enhances the first
- "conflicts-with": ideas are mutually exclusive or contradictory
- "prerequisite-of": first idea must be done before the second
- "alternative-to": ideas solve the same problem differently
- "complements": ideas work well together but are independent

Respond with JSON only:
{
  "relationships": [
    { "sourceIndex": 0, "targetIndex": 1, "relationship": "builds-on", "confidence": 0.85 }
  ]
}`;

  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      const jsonStr = extractJson(raw);
      const parsed = ClassifyResponseSchema.parse(JSON.parse(jsonStr));
      return parsed.relationships;
    },
    {
      signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

function findCriticalPath(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  // Find prerequisite chains — longest chain = critical path
  const adjList = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relationship === "prerequisite-of" || edge.relationship === "builds-on") {
      const list = adjList.get(edge.source) ?? [];
      list.push(edge.target);
      adjList.set(edge.source, list);
    }
  }

  let longestPath: string[] = [];
  function dfs(nodeId: string, path: string[], visited: Set<string>) {
    if (path.length > longestPath.length) longestPath = [...path];
    for (const next of adjList.get(nodeId) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        dfs(next, [...path, next], visited);
        visited.delete(next);
      }
    }
  }

  for (const node of nodes) {
    dfs(node.id, [node.id], new Set([node.id]));
  }

  return longestPath;
}

/**
 * Generate an idea dependency graph for a session.
 * Uses embeddings for similarity detection and LLM for relationship classification.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const url = new URL(request.url);
    const model = url.searchParams.get("model") ?? undefined;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    const session = getSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    // Extract all ideas
    const ideas: Array<InnovationIdea & { angleId: string; nodeId: string }> = [];
    let idx = 0;
    for (const ar of session.angleResults) {
      for (const idea of ar.ideas) {
        ideas.push({ ...idea, angleId: ar.angleId, nodeId: `idea-${idx}` });
        idx++;
      }
    }

    if (ideas.length < 2) {
      return Response.json(
        { nodes: ideas.map((i) => ({ id: i.nodeId, title: i.title, description: i.description, angleId: i.angleId, feasibility: "medium" })), edges: [], criticalPath: [] },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    // Index ideas for embedding similarity
    clearEmbeddingsIndex();
    const docIds: string[] = [];
    const docIdToIndex = new Map<string, number>();
    try {
      for (const idea of ideas) {
        const doc = indexDocument({
          type: "idea",
          title: idea.title,
          content: `${idea.title}. ${idea.description}. ${idea.potentialImpact}`,
          sessionId,
        });
        docIdToIndex.set(doc.id, docIds.length);
        docIds.push(doc.id);
      }

      // Find similar pairs
      const similarPairs: Array<[number, number, number]> = [];
      const seen = new Set<string>();
      for (let i = 0; i < docIds.length; i++) {
        const similar = findSimilarDocuments(docIds[i], 5);
        for (const match of similar) {
          const j = docIdToIndex.get(match.document.id);
          if (j === undefined || i === j) continue;
          const key = [Math.min(i, j), Math.max(i, j)].join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          if (match.score >= 0.1) {
            similarPairs.push([i, j, match.score]);
          }
        }
      }

      clearEmbeddingsIndex();

      // Classify relationships via LLM (graceful fallback on failure)
      let relationships: Array<{ sourceIndex: number; targetIndex: number; relationship: RelationshipType; confidence: number }> = [];
      try {
        relationships = await classifyRelationships(
          ideas.map((i) => ({ title: i.title, description: i.description })),
          similarPairs.slice(0, 30),
          model,
          request.signal
        );
      } catch (err) {
        logger.warn("LLM classification failed, returning graph without edge types", {
          route: `/api/idea-graph/${sessionId}`,
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Build graph
      const nodes: GraphNode[] = ideas.map((i) => ({
        id: i.nodeId,
        title: i.title,
        description: i.description,
        angleId: i.angleId,
        feasibility: "medium",
      }));

      const edges: GraphEdge[] = relationships
        .filter((r) => r.sourceIndex < ideas.length && r.targetIndex < ideas.length)
        .map((r) => ({
          source: ideas[r.sourceIndex].nodeId,
          target: ideas[r.targetIndex].nodeId,
          relationship: r.relationship,
          confidence: r.confidence,
        }));

      const criticalPath = findCriticalPath(nodes, edges);

      const graph: IdeaGraph = { nodes, edges, criticalPath };

      logger.info("Idea graph generated", {
        route: `/api/idea-graph/${sessionId}`,
        requestId,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        durationMs: Date.now() - startTime,
      });

      return Response.json(graph, { headers: API_RESPONSE_HEADERS });
    } finally {
      clearEmbeddingsIndex();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Request cancelled" }), {
        status: 499,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.error("Idea graph error", {
      error: err instanceof Error ? err.message : String(err),
      route: `/api/idea-graph/${sessionId}`,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Failed to generate idea graph." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
