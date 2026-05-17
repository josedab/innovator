import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock instances (reset in beforeEach)
const mockComputeForceLayout = vi.fn();
const mockSearchNodes = vi.fn();
const mockGetNodeNeighborhood = vi.fn();
const mockGetInsightSuggestions = vi.fn();
const mockExtractFromInvestigation = vi.fn();
const mockExtractFromIdeas = vi.fn();

vi.mock("@innovator/core", () => ({
  getKnowledgeGraph: vi.fn(),
  queryRelatedSubjects: vi.fn(),
  filterGraphNodes: vi.fn(),
  getGraphStats: vi.fn(),
  getTemporalEvolution: vi.fn(),
  generateKnowledgeInsights: vi.fn(),
  toVisualizationData: vi.fn(),
  EntityExtractor: vi.fn(),
  GraphVisualizer: vi.fn(),
}));

import {
  getKnowledgeGraph,
  filterGraphNodes,
  getGraphStats,
  getTemporalEvolution,
  generateKnowledgeInsights,
  EntityExtractor,
  GraphVisualizer,
} from "@innovator/core";

const mockGetKnowledgeGraph = vi.mocked(getKnowledgeGraph);
const mockFilterGraphNodes = vi.mocked(filterGraphNodes);
const mockGetGraphStats = vi.mocked(getGraphStats);
const mockGetTemporalEvolution = vi.mocked(getTemporalEvolution);
const mockGenerateKnowledgeInsights = vi.mocked(generateKnowledgeInsights);

// ---- Inline route handler (following existing test patterns) ----

import { z } from "zod";

const GetGraphSchema = z.object({
  action: z.literal("get_graph"),
  filters: z
    .object({
      type: z
        .enum([
          "concept",
          "technology",
          "challenge",
          "opportunity",
          "person",
          "organization",
          "domain",
        ])
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

const InsightsSchema = z.object({ action: z.literal("insights") });

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
    .array(z.object({ title: z.string(), description: z.string(), potentialImpact: z.string() }))
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

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
        headers: API_RESPONSE_HEADERS,
      });
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
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;

    switch (data.action) {
      case "get_graph": {
        const graph = getKnowledgeGraph();
        let nodes = (graph as any).nodes;

        if (data.filters) {
          nodes = filterGraphNodes(data.filters as any);
        }

        const edges = (graph as any).edges.filter((e: any) => {
          const nodeIds = new Set(nodes.map((n: any) => n.id));
          return nodeIds.has(e.source) && nodeIds.has(e.target);
        });

        const layout = mockComputeForceLayout(nodes, edges);
        const stats = getGraphStats();

        return Response.json({ layout, stats }, { headers: API_RESPONSE_HEADERS });
      }

      case "search": {
        const graph = getKnowledgeGraph();
        const layout = mockComputeForceLayout((graph as any).nodes, (graph as any).edges);
        const results = mockSearchNodes(layout, data.query);
        return Response.json({ results }, { headers: API_RESPONSE_HEADERS });
      }

      case "expand": {
        const graph = getKnowledgeGraph();
        const layout = mockComputeForceLayout((graph as any).nodes, (graph as any).edges);
        const neighborhood = mockGetNodeNeighborhood(layout, data.nodeId, data.depth ?? 1);
        return Response.json({ neighborhood }, { headers: API_RESPONSE_HEADERS });
      }

      case "insights": {
        const graph = getKnowledgeGraph();
        const layout = mockComputeForceLayout((graph as any).nodes, (graph as any).edges);
        const knowledgeInsights = generateKnowledgeInsights(graph as any);
        const structuralInsights = mockGetInsightSuggestions(layout);
        return Response.json(
          { knowledgeInsights, structuralInsights },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "extract": {
        let entities: { entities: unknown[]; relationships: unknown[] } = {
          entities: [],
          relationships: [],
        };

        if (data.investigation) {
          entities = mockExtractFromInvestigation(data.investigation, data.sessionId);
        }

        if (data.ideas) {
          const ideaEntities = mockExtractFromIdeas(data.ideas, data.sessionId);
          entities.entities = [...entities.entities, ...ideaEntities.entities];
          entities.relationships = [...entities.relationships, ...ideaEntities.relationships];
        }

        return Response.json(entities, { headers: API_RESPONSE_HEADERS });
      }

      case "timeline": {
        const graph = getKnowledgeGraph();
        const evolution = getTemporalEvolution(graph as any, data.entityId);

        if (!evolution) {
          return new Response(JSON.stringify({ error: "Entity not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        return Response.json({ evolution }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Knowledge graph operation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/knowledge-graph", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const EMPTY_GRAPH = { nodes: [], edges: [] };
const SAMPLE_GRAPH = {
  nodes: [
    { id: "n1", type: "concept", label: "AI" },
    { id: "n2", type: "technology", label: "ML" },
  ],
  edges: [{ source: "n1", target: "n2", type: "related" }],
};

describe("POST /api/knowledge-graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeForceLayout.mockReturnValue({ nodes: [], edges: [] });
    mockSearchNodes.mockReturnValue([]);
    mockGetNodeNeighborhood.mockReturnValue({ nodes: [], edges: [] });
    mockGetInsightSuggestions.mockReturnValue([]);
    mockExtractFromInvestigation.mockReturnValue({ entities: [], relationships: [] });
    mockExtractFromIdeas.mockReturnValue({ entities: [], relationships: [] });
  });

  // ---- get_graph ----

  describe("action: get_graph", () => {
    it("returns layout and stats for empty graph", async () => {
      mockGetKnowledgeGraph.mockReturnValue(EMPTY_GRAPH as any);
      mockGetGraphStats.mockReturnValue({ totalNodes: 0, totalEdges: 0 } as any);

      const res = await POST(makeRequest({ action: "get_graph" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.layout).toBeDefined();
      expect(data.stats).toEqual({ totalNodes: 0, totalEdges: 0 });
    });

    it("returns filtered nodes with type filter", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockFilterGraphNodes.mockReturnValue([{ id: "n1", type: "concept", label: "AI" }] as any);
      mockGetGraphStats.mockReturnValue({ totalNodes: 1, totalEdges: 0 } as any);

      const res = await POST(makeRequest({ action: "get_graph", filters: { type: "concept" } }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.layout).toBeDefined();
      expect(mockFilterGraphNodes).toHaveBeenCalledWith({ type: "concept" });
    });

    it("applies date and occurrence filters", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockFilterGraphNodes.mockReturnValue(SAMPLE_GRAPH.nodes as any);
      mockGetGraphStats.mockReturnValue({ totalNodes: 2 } as any);

      const res = await POST(
        makeRequest({
          action: "get_graph",
          filters: { fromDate: "2024-01-01", toDate: "2024-12-31", minOccurrences: 3 },
        })
      );

      expect(res.status).toBe(200);
      expect(mockFilterGraphNodes).toHaveBeenCalledWith({
        fromDate: "2024-01-01",
        toDate: "2024-12-31",
        minOccurrences: 3,
      });
    });

    it("returns graph without filters", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockGetGraphStats.mockReturnValue({ totalNodes: 2, totalEdges: 1 } as any);

      const res = await POST(makeRequest({ action: "get_graph" }));

      expect(res.status).toBe(200);
      expect(mockFilterGraphNodes).not.toHaveBeenCalled();
    });
  });

  // ---- search ----

  describe("action: search", () => {
    it("returns search results for valid query", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockComputeForceLayout.mockReturnValue({ nodes: SAMPLE_GRAPH.nodes });
      mockSearchNodes.mockReturnValue([{ id: "n1", label: "AI", score: 0.9 }]);

      const res = await POST(makeRequest({ action: "search", query: "artificial intelligence" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].id).toBe("n1");
    });

    it("returns empty results for unmatched query", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);

      const res = await POST(makeRequest({ action: "search", query: "zzz-no-match" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toEqual([]);
    });

    it("handles special characters in query", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);

      const res = await POST(
        makeRequest({ action: "search", query: "test <script>alert(1)</script>" })
      );
      expect(res.status).toBe(200);
    });

    it("rejects empty query", async () => {
      const res = await POST(makeRequest({ action: "search", query: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- expand ----

  describe("action: expand", () => {
    it("expands a valid node", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockGetNodeNeighborhood.mockReturnValue({
        nodes: [{ id: "n1" }, { id: "n2" }],
        edges: [{ source: "n1", target: "n2" }],
      });

      const res = await POST(makeRequest({ action: "expand", nodeId: "n1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.neighborhood).toBeDefined();
      expect(data.neighborhood.nodes).toHaveLength(2);
    });

    it("expands with custom depth", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);

      const res = await POST(makeRequest({ action: "expand", nodeId: "n1", depth: 3 }));
      expect(res.status).toBe(200);
    });

    it("rejects depth outside boundaries (0)", async () => {
      const res = await POST(makeRequest({ action: "expand", nodeId: "n1", depth: 0 }));
      expect(res.status).toBe(400);
    });

    it("rejects depth outside boundaries (6)", async () => {
      const res = await POST(makeRequest({ action: "expand", nodeId: "n1", depth: 6 }));
      expect(res.status).toBe(400);
    });

    it("returns result for non-existent node", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);

      const res = await POST(makeRequest({ action: "expand", nodeId: "non-existent-node" }));
      expect(res.status).toBe(200);
    });
  });

  // ---- insights ----

  describe("action: insights", () => {
    it("returns knowledge and structural insights", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockGenerateKnowledgeInsights.mockReturnValue({ themes: [], gaps: [] } as any);
      mockGetInsightSuggestions.mockReturnValue([{ type: "cluster", description: "test" }]);

      const res = await POST(makeRequest({ action: "insights" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.knowledgeInsights).toBeDefined();
      expect(data.structuralInsights).toHaveLength(1);
    });
  });

  // ---- extract ----

  describe("action: extract", () => {
    it("extracts entities from investigation", async () => {
      mockExtractFromInvestigation.mockReturnValue({
        entities: [{ id: "e1", type: "concept" }],
        relationships: [{ source: "e1", target: "e2" }],
      });

      const res = await POST(
        makeRequest({
          action: "extract",
          sessionId: "s1",
          investigation: {
            summary: "Test summary",
            currentState: "State",
            keyAspects: [{ title: "Aspect 1", description: "Desc" }],
            challenges: ["Challenge 1"],
            opportunities: ["Opportunity 1"],
          },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.entities).toHaveLength(1);
      expect(data.relationships).toHaveLength(1);
    });

    it("extracts from ideas", async () => {
      mockExtractFromIdeas.mockReturnValue({
        entities: [{ id: "ie1", type: "technology" }],
        relationships: [],
      });

      const res = await POST(
        makeRequest({
          action: "extract",
          sessionId: "s1",
          ideas: [{ title: "Idea 1", description: "Desc", potentialImpact: "High" }],
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.entities).toHaveLength(1);
    });

    it("returns empty for extract with no investigation or ideas", async () => {
      const res = await POST(makeRequest({ action: "extract", sessionId: "s1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.entities).toEqual([]);
      expect(data.relationships).toEqual([]);
    });
  });

  // ---- timeline ----

  describe("action: timeline", () => {
    it("returns timeline for existing entity", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockGetTemporalEvolution.mockReturnValue({
        entityId: "n1",
        events: [{ date: "2024-01-01", type: "created" }],
      } as any);

      const res = await POST(makeRequest({ action: "timeline", entityId: "n1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.evolution.entityId).toBe("n1");
    });

    it("returns 404 for non-existing entity", async () => {
      mockGetKnowledgeGraph.mockReturnValue(SAMPLE_GRAPH as any);
      mockGetTemporalEvolution.mockReturnValue(undefined as any);

      const res = await POST(makeRequest({ action: "timeline", entityId: "non-existent" }));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain("not found");
    });
  });

  // ---- error handling ----

  describe("error handling", () => {
    it("returns 400 for invalid action type", async () => {
      const res = await POST(makeRequest({ action: "invalid_action" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON body", async () => {
      const req = new Request("http://localhost/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });

    it("returns 415 for wrong content-type", async () => {
      const req = new Request("http://localhost/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "get_graph" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(415);
    });

    it("returns 500 on internal error", async () => {
      mockGetKnowledgeGraph.mockImplementation(() => {
        throw new Error("Internal failure");
      });

      const res = await POST(makeRequest({ action: "get_graph" }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("failed");
    });
  });
});
