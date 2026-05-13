/**
 * @description Share session creation and link generation.
 */
export const runtime = "nodejs";

import {
  shareInvestigation,
  getSharedInvestigation,
  listSharedInvestigations,
  forkInvestigation,
  buildShareUrl,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ShareRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: z.unknown().optional(),
  angleResults: z.array(z.unknown()).optional(),
  synthesis: z.unknown().optional(),
  title: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
  expiresInDays: z.number().min(1).max(365).optional(),
});

/**
 * Create a shareable link for a completed investigation.
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

    const parsed = ShareRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, investigation, angleResults, synthesis, title, isPublic, expiresInDays } = parsed.data;

    const shared = shareInvestigation(
      subject,
      { investigation: investigation as any, angleResults: angleResults as any, synthesis: synthesis as any },
      { title, isPublic, expiresInDays }
    );

    const baseUrl = request.headers.get("origin") ?? "https://innovator.dev";
    const shareUrl = buildShareUrl(shared.slug, baseUrl);

    logger.info("Investigation shared", {
      route: "/api/share",
      requestId,
      slug: shared.slug,
      durationMs: Date.now() - startTime,
    });

    return Response.json({ ...shared, shareUrl }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Share error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/share",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Failed to create share link." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * List all shared investigations.
 */
export async function GET() {
  try {
    const shared = listSharedInvestigations(true);
    return Response.json({ investigations: shared }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to list shared investigations." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
