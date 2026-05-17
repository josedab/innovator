import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  generateVisualization: vi.fn(),
  extractInnovationData: vi.fn(),
  buildEmbeddingSpace: vi.fn(),
}));

import { generateVisualization, extractInnovationData, buildEmbeddingSpace } from "@innovator/core";

const mockGenerateVisualization = vi.mocked(generateVisualization);
const mockExtractInnovationData = vi.mocked(extractInnovationData);
const mockBuildEmbeddingSpace = vi.mocked(buildEmbeddingSpace);

// ---- Inline schemas and handlers ----

import { z } from "zod";

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

// NL Visualization

const NLVizRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  data: z.record(z.string(), z.unknown()).optional(),
  angleResults: z
    .array(
      z.object({
        angleId: z.string(),
        angleName: z.string(),
        ideas: z.array(z.object({ title: z.string() })),
      })
    )
    .optional(),
  scores: z
    .array(
      z.object({
        ideaTitle: z.string(),
        feasibility: z.number(),
        impact: z.number(),
        novelty: z.number(),
      })
    )
    .optional(),
  model: z.string().optional(),
  preferredChartType: z
    .enum(["bar", "line", "scatter", "pie", "radar", "treemap", "bubble", "heatmap", "sankey"])
    .optional(),
});

async function NLVizPOST(request: Request) {
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

    const parsed = NLVizRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { query, data, angleResults, scores, model, preferredChartType } = parsed.data;

    let vizData = data ?? {};
    if (angleResults) {
      vizData = { ...vizData, ...extractInnovationData(angleResults as any, scores as any) };
    }

    const result = await generateVisualization(
      query,
      vizData as any,
      {
        model,
        preferredChartType,
        signal: request.signal,
      } as any
    );

    return new Response(JSON.stringify(result), { status: 200, headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(
      JSON.stringify({ error: "Visualization generation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

// Embedding Explorer

const EmbedRequestSchema = z.object({
  ideas: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().min(1).max(500),
        description: z.string().min(1).max(2000),
        tags: z.array(z.string().max(100)).max(10).optional(),
        score: z.number().min(0).max(1).optional(),
      })
    )
    .min(1)
    .max(500),
  model: z.string().max(100).optional(),
  clusterCount: z.number().min(2).max(20).optional(),
});

async function EmbedPOST(request: Request) {
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

    const parsed = EmbedRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const space = await buildEmbeddingSpace(
      parsed.data.ideas as any,
      {
        model: parsed.data.model,
        clusterCount: parsed.data.clusterCount,
      } as any
    );

    return Response.json(space, { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Embedding space construction failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

function makeNLVizRequest(body: unknown): Request {
  return new Request("http://localhost/api/nl-visualization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEmbedRequest(body: unknown): Request {
  return new Request("http://localhost/api/embedding-explorer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---- NL Visualization Tests ----

describe("POST /api/nl-visualization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates visualization from natural language query", async () => {
    mockGenerateVisualization.mockResolvedValue({
      chartConfig: { chartType: "bar", title: "Innovation Scores" },
      d3Code: "svg.selectAll('rect')...",
      data: [{ label: "A", value: 80 }],
    } as any);

    const res = await NLVizPOST(
      makeNLVizRequest({
        query: "Show me a bar chart of idea scores",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.chartConfig.chartType).toBe("bar");
    expect(data.d3Code).toBeDefined();
  });

  it("extracts data from angle results", async () => {
    mockExtractInnovationData.mockReturnValue({ ideas: [{ title: "Idea 1" }] } as any);
    mockGenerateVisualization.mockResolvedValue({
      chartConfig: { chartType: "radar" },
    } as any);

    const res = await NLVizPOST(
      makeNLVizRequest({
        query: "Create a radar chart",
        angleResults: [{ angleId: "bio", angleName: "Biomimicry", ideas: [{ title: "Bio idea" }] }],
        preferredChartType: "radar",
      })
    );

    expect(res.status).toBe(200);
    expect(mockExtractInnovationData).toHaveBeenCalled();
  });

  it("returns 400 for empty query", async () => {
    const res = await NLVizPOST(makeNLVizRequest({ query: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing query", async () => {
    const res = await NLVizPOST(makeNLVizRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported chart type", async () => {
    const res = await NLVizPOST(
      makeNLVizRequest({
        query: "Show chart",
        preferredChartType: "3d-globe",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when generation fails", async () => {
    mockGenerateVisualization.mockRejectedValue(new Error("LLM timeout"));

    const res = await NLVizPOST(makeNLVizRequest({ query: "Show scores" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/nl-visualization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad{json",
    });
    const res = await NLVizPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/nl-visualization", {
      method: "POST",
      headers: { "Content-Type": "text/html" },
      body: JSON.stringify({ query: "test" }),
    });
    const res = await NLVizPOST(req);
    expect(res.status).toBe(415);
  });
});

// ---- Embedding Explorer Tests ----

describe("POST /api/embedding-explorer", () => {
  beforeEach(() => vi.clearAllMocks());

  const SAMPLE_IDEAS = [
    { id: "i1", title: "AI Assistant", description: "An AI-powered coding assistant" },
    { id: "i2", title: "Green Energy", description: "Solar panel optimization" },
  ];

  it("builds embedding space from ideas", async () => {
    mockBuildEmbeddingSpace.mockResolvedValue({
      totalIdeas: 2,
      clusters: [
        { id: "c1", label: "Technology", ideas: ["i1"] },
        { id: "c2", label: "Sustainability", ideas: ["i2"] },
      ],
      whiteSpaces: [{ description: "Underexplored: AI + sustainability" }],
      points: [
        { id: "i1", x: 0.1, y: 0.2, z: 0.3 },
        { id: "i2", x: 0.8, y: 0.9, z: 0.1 },
      ],
    } as any);

    const res = await EmbedPOST(makeEmbedRequest({ ideas: SAMPLE_IDEAS }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalIdeas).toBe(2);
    expect(data.clusters).toHaveLength(2);
    expect(data.whiteSpaces).toHaveLength(1);
  });

  it("applies custom cluster count", async () => {
    mockBuildEmbeddingSpace.mockResolvedValue({
      totalIdeas: 2,
      clusters: [],
      whiteSpaces: [],
    } as any);

    const res = await EmbedPOST(
      makeEmbedRequest({
        ideas: SAMPLE_IDEAS,
        clusterCount: 5,
      })
    );

    expect(res.status).toBe(200);
    expect(mockBuildEmbeddingSpace).toHaveBeenCalledWith(
      SAMPLE_IDEAS,
      expect.objectContaining({ clusterCount: 5 })
    );
  });

  it("returns 400 for empty ideas array", async () => {
    const res = await EmbedPOST(makeEmbedRequest({ ideas: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for idea missing title", async () => {
    const res = await EmbedPOST(
      makeEmbedRequest({
        ideas: [{ id: "i1", description: "No title" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for idea missing description", async () => {
    const res = await EmbedPOST(
      makeEmbedRequest({
        ideas: [{ id: "i1", title: "Has title" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when embedding space construction fails", async () => {
    mockBuildEmbeddingSpace.mockRejectedValue(new Error("Embedding model error"));

    const res = await EmbedPOST(makeEmbedRequest({ ideas: SAMPLE_IDEAS }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/embedding-explorer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not{json",
    });
    const res = await EmbedPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/embedding-explorer", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ideas: SAMPLE_IDEAS }),
    });
    const res = await EmbedPOST(req);
    expect(res.status).toBe(415);
  });

  it("accepts ideas with optional tags and score", async () => {
    mockBuildEmbeddingSpace.mockResolvedValue({
      totalIdeas: 1,
      clusters: [],
      whiteSpaces: [],
    } as any);

    const res = await EmbedPOST(
      makeEmbedRequest({
        ideas: [
          {
            id: "i1",
            title: "Tagged Idea",
            description: "A test idea",
            tags: ["innovation", "ai"],
            score: 0.85,
          },
        ],
      })
    );

    expect(res.status).toBe(200);
  });
});
