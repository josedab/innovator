export const runtime = "nodejs";

import {
  validateIdeaMarket,
  validateIdeasMarket,
  generateValidationReport,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ValidateSchema = z.object({
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
      maxResults: z.number().int().min(1).max(50).optional(),
      includeAcademic: z.boolean().optional(),
      includePatents: z.boolean().optional(),
      timeout: z.number().int().min(1000).max(60000).optional(),
    })
    .optional(),
});

/** POST /api/market-validation — validate ideas with TAM/SAM/SOM analysis and market sizing. */
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

    const parsed = ValidateSchema.safeParse(body);
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
    const results = await validateIdeasMarket(ideas as any, config);
    const report =
      subject && results.length > 0
        ? await generateValidationReport(subject, results, model as any)
        : undefined;

    logger.info("Market validation completed", {
      route: "/api/market-validation",
      requestId,
      durationMs: Date.now() - startTime,
      ideaCount: ideas.length,
    });

    return Response.json({ results, report }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Market validation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/market-validation",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Market validation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
