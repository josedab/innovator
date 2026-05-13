/**
 * @description Innovation genome — DNA-like trait mapping for ideas.
 */
export const runtime = "nodejs";

import {
  createFederationNode,
  listNodes,
  getNetworkDashboard,
  extractPatterns,
  generateGenomeInsights,
  enrichAngleSelection,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  gossipSync,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/** Lazily create a default node for the web server. */
function getOrCreateDefaultNode() {
  const nodes = listNodes();
  if (nodes.length > 0) return nodes[0];
  return createFederationNode({
    name: "innovator-web",
    description: "Innovator web app federation node",
    isPublic: false,
  });
}

const ContributeSchema = z.object({
  action: z.literal("contribute"),
  domain: z.string().max(200),
  angleResults: z.array(
    z.object({
      angleId: z.string().max(100),
      angleName: z.string().max(200),
      ideasCount: z.number().int().min(0),
      successRate: z.number().min(0).max(1).optional(),
    })
  ).min(1).max(20),
});

const EnrichSchema = z.object({
  action: z.literal("enrich"),
  angles: z.array(z.string()).min(1).max(20),
  domainHint: z.string().max(200).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [ContributeSchema, EnrichSchema]);

/**
 * GET /api/genome — Get network dashboard or analytics.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const node = getOrCreateDefaultNode();

    if (view === "analytics") {
      const analytics = computeGenomeAnalytics(node.id);
      const format = searchParams.get("format");
      if (format === "markdown") {
        return new Response(genomeAnalyticsToMarkdown(analytics), {
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
        });
      }
      return Response.json(analytics, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "insights") {
      const domain = searchParams.get("domain") ?? undefined;
      const insights = generateGenomeInsights(node.id, domain);
      return Response.json({ insights }, { headers: API_RESPONSE_HEADERS });
    }

    const dashboard = getNetworkDashboard(node.id);
    return Response.json(dashboard, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Genome GET error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/genome",
    });
    return new Response(
      JSON.stringify({ error: "Failed to retrieve genome data." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * POST /api/genome — Contribute patterns or enrich angle selection.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
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
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const node = getOrCreateDefaultNode();

    switch (parsed.data.action) {
      case "contribute": {
        const patterns = extractPatterns({
          nodeId: node.id,
          domain: parsed.data.domain,
          angleResults: parsed.data.angleResults,
        });
        logger.info("Genome patterns contributed", {
          route: "/api/genome",
          requestId,
          patterns: patterns.length,
        });
        return Response.json(
          { message: "Patterns contributed", count: patterns.length },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "enrich": {
        const result = enrichAngleSelection(
          node.id,
          parsed.data.angles,
          parsed.data.domainHint
        );
        return Response.json(result, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Genome POST error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/genome",
      requestId,
    });
    return new Response(
      JSON.stringify({ error: "Genome operation failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
