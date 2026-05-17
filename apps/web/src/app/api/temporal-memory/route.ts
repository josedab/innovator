/**
 * @description Temporal Innovation Memory — ingest sessions, query the
 * temporal graph, detect recurrences, and compute innovation velocity.
 */
export const runtime = "nodejs";

import {
  ingestTemporalSession,
  queryTemporalMemory,
  computeInnovationVelocity,
  detectRecurrences,
  loadTemporalGraph,
  searchTemporalNodes,
  temporalMemoryToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IngestSchema = z.object({
  sessionId: z.string().min(1).max(200),
  subject: z.string().min(1).max(2000),
  investigation: z
    .object({
      summary: z.string().max(5000),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })).max(20),
      challenges: z.array(z.string()).max(20),
      opportunities: z.array(z.string()).max(20),
    })
    .optional(),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        angleId: z.string().max(100),
      })
    )
    .max(50),
  themes: z.array(z.string().max(500)).max(30).optional(),
  outcome: z
    .object({
      status: z.enum(["shipped", "abandoned", "in-progress", "evolved"]),
      reasoning: z.string().max(2000).optional(),
    })
    .optional(),
  timestamp: z.string(),
});

const QuerySchema = z.object({
  question: z.string().min(1).max(2000),
  timeRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
  nodeTypes: z
    .array(
      z.enum([
        "concept",
        "idea",
        "outcome",
        "session",
        "angle",
        "theme",
        "challenge",
        "opportunity",
      ])
    )
    .max(10)
    .optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
});

const _SearchSchema = z.object({
  query: z.string().min(1).max(500),
  timeRange: z.object({ from: z.string(), to: z.string() }).optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") ?? "stats";

    const graph = loadTemporalGraph();

    if (action === "velocity") {
      const months = parseInt(searchParams.get("months") ?? "3", 10);
      const velocity = computeInnovationVelocity(graph, months);
      return Response.json(velocity, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "recurrences") {
      const min = parseInt(searchParams.get("min") ?? "2", 10);
      const recurrences = detectRecurrences(graph, min);
      return Response.json({ recurrences }, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "search") {
      const q = searchParams.get("q") ?? "";
      if (!q) {
        return Response.json(
          { error: "Query parameter 'q' is required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const nodes = searchTemporalNodes(graph, q, { maxResults: 20 });
      return Response.json({ nodes }, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "markdown") {
      return new Response(temporalMemoryToMarkdown(graph), {
        status: 200,
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    // Default: stats
    return Response.json(
      {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        created: graph.createdAt,
        updated: graph.updatedAt,
      },
      { status: 200, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Temporal memory query failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Determine action from body
    if (body.action === "query" || body.question) {
      const parsed = QuerySchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid query", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const result = await queryTemporalMemory(parsed.data);
      return Response.json(result, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    // Default: ingest
    const parsed = IngestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid session data", details: parsed.error.issues },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = ingestTemporalSession(parsed.data);
    return Response.json(result, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Temporal memory operation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
