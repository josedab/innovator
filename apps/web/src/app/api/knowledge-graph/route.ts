/**
 * @description Knowledge Graph Explorer API — query, search, expand, and extract graph data.
 */
export const runtime = "nodejs";

import {
  getKnowledgeGraph,
  queryRelatedSubjects,
  filterGraphNodes,
  getGraphStats,
  getTemporalEvolution,
  generateKnowledgeInsights,
  toVisualizationData,
  EntityExtractor,
  GraphVisualizer,
} from "@innovator/core";
import type { EntityNode } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

// ---- Request Schemas (discriminated union) ----

const GetGraphSchema = z.object({
  action: z.literal("get_graph"),
  filters: z
    .object({
      type: z
        .enum(["concept", "technology", "challenge", "opportunity", "person", "organization", "domain"])
        .optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      minOccurrences: z.number().optional(),
    })
    .optional(),
});

const SearchSchema = z.object({
  action: z.literal("search"),
  query: z.string().min(1).max(500),
});

const ExpandSchema = z.object({
  action: z.literal("expand"),
  nodeId: z.string().min(1),
  depth: z.number().min(1).max(5).optional(),
});

const InsightsSchema = z.object({
  action: z.literal("insights"),
});

const ExtractSchema = z.object({
  action: z.literal("extract"),
  sessionId: z.string().min(1),
  investigation: z
    .object({
      summary: z.string(),
      currentState: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    })
    .optional(),
  ideas: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        potentialImpact: z.string(),
      })
    )
    .optional(),
});

const TimelineSchema = z.object({
  action: z.literal("timeline"),
  entityId: z.string().min(1),
});

const RequestSchema = z.discriminatedUnion("action", [
  GetGraphSchema,
  SearchSchema,
  ExpandSchema,
  InsightsSchema,
  ExtractSchema,
  TimelineSchema,
]);

/**
 * Knowledge Graph Explorer API endpoint.
 *
 * @param request - JSON body with discriminated union on `action`:
 *   - `get_graph`: returns full graph layout with optional filters
 *   - `search`: searches nodes by query string
 *   - `expand`: expands neighborhood from a node
 *   - `insights`: returns graph-derived insights
 *   - `extract`: triggers entity extraction from session data
 *   - `timeline`: returns temporal evolution of an entity
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/knowledge-graph",
        requestId,
        status: 415,
        durationMs: Date.now() - startTime,
      });
      return contentTypeError;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid request", {
        route: "/api/knowledge-graph",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;
    const visualizer = new GraphVisualizer();

    switch (data.action) {
      case "get_graph": {
        const graph = getKnowledgeGraph();
        let nodes: EntityNode[] = graph.nodes;

        if (data.filters) {
          nodes = filterGraphNodes(data.filters);
        }

        const edges = graph.edges.filter((e) => {
          const nodeIds = new Set(nodes.map((n) => n.id));
          return nodeIds.has(e.source) && nodeIds.has(e.target);
        });

        const layout = visualizer.computeForceLayout(nodes, edges);
        const stats = getGraphStats();

        logger.info("Graph retrieved", {
          route: "/api/knowledge-graph",
          requestId,
          action: "get_graph",
          nodeCount: layout.nodes.length,
          durationMs: Date.now() - startTime,
        });

        return Response.json({ layout, stats }, { headers: API_RESPONSE_HEADERS });
      }

      case "search": {
        const graph = getKnowledgeGraph();
        const layout = visualizer.computeForceLayout(graph.nodes, graph.edges);
        const results = visualizer.searchNodes(layout, data.query);

        logger.info("Graph search", {
          route: "/api/knowledge-graph",
          requestId,
          action: "search",
          query: data.query,
          resultCount: results.length,
          durationMs: Date.now() - startTime,
        });

        return Response.json({ results }, { headers: API_RESPONSE_HEADERS });
      }

      case "expand": {
        const graph = getKnowledgeGraph();
        const layout = visualizer.computeForceLayout(graph.nodes, graph.edges);
        const neighborhood = visualizer.getNodeNeighborhood(layout, data.nodeId, data.depth ?? 1);

        logger.info("Graph expand", {
          route: "/api/knowledge-graph",
          requestId,
          action: "expand",
          nodeId: data.nodeId,
          durationMs: Date.now() - startTime,
        });

        return Response.json({ neighborhood }, { headers: API_RESPONSE_HEADERS });
      }

      case "insights": {
        const graph = getKnowledgeGraph();
        const layout = visualizer.computeForceLayout(graph.nodes, graph.edges);
        const knowledgeInsights = generateKnowledgeInsights(graph);
        const structuralInsights = visualizer.getInsightSuggestions(layout);

        logger.info("Graph insights", {
          route: "/api/knowledge-graph",
          requestId,
          action: "insights",
          durationMs: Date.now() - startTime,
        });

        return Response.json(
          { knowledgeInsights, structuralInsights },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "extract": {
        const extractor = new EntityExtractor();
        let entities: { entities: unknown[]; relationships: unknown[] } = {
          entities: [],
          relationships: [],
        };

        if (data.investigation) {
          entities = extractor.extractFromInvestigation(data.investigation, data.sessionId);
        }

        if (data.ideas) {
          const ideaEntities = extractor.extractFromIdeas(data.ideas, data.sessionId);
          entities.entities = [...entities.entities, ...ideaEntities.entities];
          entities.relationships = [...entities.relationships, ...ideaEntities.relationships];
        }

        logger.info("Entity extraction", {
          route: "/api/knowledge-graph",
          requestId,
          action: "extract",
          sessionId: data.sessionId,
          entityCount: entities.entities.length,
          durationMs: Date.now() - startTime,
        });

        return Response.json(entities, { headers: API_RESPONSE_HEADERS });
      }

      case "timeline": {
        const graph = getKnowledgeGraph();
        const evolution = getTemporalEvolution(graph, data.entityId);

        if (!evolution) {
          return new Response(
            JSON.stringify({ error: "Entity not found" }),
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }

        logger.info("Timeline query", {
          route: "/api/knowledge-graph",
          requestId,
          action: "timeline",
          entityId: data.entityId,
          durationMs: Date.now() - startTime,
        });

        return Response.json({ evolution }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Knowledge graph error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/knowledge-graph",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Knowledge graph operation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
