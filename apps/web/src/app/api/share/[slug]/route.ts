export const runtime = "nodejs";

import {
  getSharedInvestigation,
  forkInvestigation,
} from "@innovator/core";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * Get a shared investigation by slug.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const shared = getSharedInvestigation(slug);
    if (!shared) {
      return new Response(JSON.stringify({ error: "Shared investigation not found or expired." }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    return Response.json(shared, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Share retrieval error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/share/[slug]",
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve shared investigation." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Fork a shared investigation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const fork = forkInvestigation(slug);
    if (!fork) {
      return new Response(JSON.stringify({ error: "Shared investigation not found or expired." }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.info("Investigation forked", {
      route: "/api/share/[slug]",
      slug,
      newSessionId: fork.newSessionId,
    });

    return Response.json(fork, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Fork error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/share/[slug]",
    });
    return new Response(JSON.stringify({ error: "Failed to fork investigation." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
