/**
 * @description Innovation taxonomy management and categorization.
 */
export const runtime = "nodejs";

import {
  buildTaxonomy,
  classifyIdeas,
  identifyGaps,
  exportTaxonomyAsMarkdown,
  getTaxonomyStats,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const BuildTaxonomySchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().min(1).max(500),
      description: z.string().min(1).max(5000),
    })
  ),
  subject: z.string().min(1).max(500).optional(),
  model: z.string().optional(),
  config: z
    .object({
      maxDepth: z.number().int().min(1).max(6).optional(),
      minClusterSize: z.number().int().min(1).max(20).optional(),
      similarityThreshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

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

    const parsed = BuildTaxonomySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { ideas, subject, model, config } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taxonomy = await buildTaxonomy(ideas, config as any);
    const stats = getTaxonomyStats(taxonomy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gaps = subject ? await identifyGaps(taxonomy, subject, model as any) : [];
    const markdown = exportTaxonomyAsMarkdown(taxonomy);

    logger.info("Taxonomy built", {
      route: "/api/taxonomy",
      requestId,
      durationMs: Date.now() - startTime,
      ideaCount: ideas.length,
      categoryCount: stats.totalNodes,
    });

    return Response.json({ taxonomy, stats, gaps, markdown }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Taxonomy error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/taxonomy",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Taxonomy build failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
