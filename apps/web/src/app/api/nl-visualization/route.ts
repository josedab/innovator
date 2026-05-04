export const runtime = "nodejs";

import { generateVisualization, extractInnovationData } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
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

/**
 * Generate a D3.js visualization from a natural language description.
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
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { query, data, angleResults, scores, model, preferredChartType } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    // Build data from innovation results or use provided data
    let vizData = data ?? {};
    if (angleResults) {
      vizData = {
        ...vizData,
        ...extractInnovationData(angleResults, scores as never),
      };
    }

    const result = await generateVisualization(query, vizData, {
      model,
      preferredChartType,
      signal: request.signal,
    });

    logger.info("Visualization generated", {
      route: "/api/nl-visualization",
      requestId,
      durationMs: Date.now() - startTime,
      chartType: result.chartConfig.chartType,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Visualization error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/nl-visualization",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Visualization generation failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
