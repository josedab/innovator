export const runtime = "nodejs";

import {
  buildIdeaDependencyGraph,
  dependencyGraphToMarkdown,
  dependencyGraphToMermaid,
  AngleResultSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  angleResults: z.array(AngleResultSchema).min(1).max(20),
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
  format: z.enum(["json", "markdown", "mermaid"]).default("json"),
});

/**
 * Build an idea dependency graph from angle results.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

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
        JSON.stringify({ error: "Invalid request. Provide angleResults and subject." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { angleResults, subject, model, format } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const graph = await buildIdeaDependencyGraph(angleResults, subject, model);

    let response: unknown;
    if (format === "markdown") {
      response = { markdown: dependencyGraphToMarkdown(graph) };
    } else if (format === "mermaid") {
      response = { mermaid: dependencyGraphToMermaid(graph) };
    } else {
      response = graph;
    }

    logger.info("Dependency graph built", {
      route: "/api/dependency-graph",
      requestId,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(response, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Dependency graph error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/dependency-graph",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Dependency graph generation failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
