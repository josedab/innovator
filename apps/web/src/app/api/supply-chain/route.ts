/**
 * @description Supply chain innovation analysis and optimization.
 */
export const runtime = "nodejs";

import { mapSupplyChain } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  ideaTitle: z.string().min(1).max(500),
  ideaDescription: z.string().min(1).max(5000),
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const modelError = validateModel(parsed.data.model);
    if (modelError) return modelError;

    const result = await mapSupplyChain(
      parsed.data.ideaTitle,
      parsed.data.ideaDescription,
      parsed.data.subject,
      parsed.data.model,
      request.signal
    );

    logger.info("Supply chain mapped", {
      route: "/api/supply-chain",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Supply chain error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/supply-chain",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Supply chain mapping failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
