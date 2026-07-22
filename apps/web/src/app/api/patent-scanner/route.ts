/**
 * @description Patent landscape scanning for innovation clearance.
 */
export const runtime = "nodejs";

import { runPatentScan } from "@innovator/core";
import type { InnovationIdea } from "@innovator/core/innovation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  ideas: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        potentialImpact: z.string(),
        implementationHint: z.string(),
      })
    )
    .min(1)
    .max(50),
  model: z.string().optional(),
  databases: z.array(z.enum(["USPTO", "EPO", "WIPO"])).optional(),
});

/**
 * Scan ideas for prior art and patent conflicts.
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

    const { subject, ideas, model, databases } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const result = await runPatentScan(subject, ideas as InnovationIdea[], undefined, {
      databases,
      model,
      signal: request.signal,
    });

    logger.info("Patent scan completed", {
      route: "/api/patent-scanner",
      requestId,
      durationMs: Date.now() - startTime,
      patentsFound: result.totalPatentsAnalyzed,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Patent scan error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/patent-scanner",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Patent scan failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
