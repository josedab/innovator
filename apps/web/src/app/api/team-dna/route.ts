/**
 * @description Team DNA analysis — innovation style and strength mapping.
 */
export const runtime = "nodejs";

import { analyzeTeamDNA } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  teamId: z.string().min(1).max(200),
  memberIds: z.array(z.string().min(1).max(200)).min(1).max(100),
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

    const result = analyzeTeamDNA(parsed.data.teamId, parsed.data.memberIds);
    logger.info("Team DNA analyzed", {
      route: "/api/team-dna",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Team DNA error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/team-dna",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Team DNA analysis failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
