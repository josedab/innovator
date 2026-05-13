/**
 * @description Interactive API playground for testing innovation endpoints.
 */
export const runtime = "nodejs";

import { generateOpenAPISpec, getSwaggerUIHTML, exportAsSwaggerJSON } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { logger } from "@/lib/logger";

/**
 * Interactive API playground with Swagger UI and OpenAPI spec.
 *
 * - GET /api/api-playground → Swagger UI HTML page
 * - GET /api/api-playground?format=json → OpenAPI 3.0 JSON spec
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
      const spec = exportAsSwaggerJSON({
        baseUrl: url.origin,
        title: "Innovator API",
        version: "0.2.0",
        description: "Innovation engine API for AI-powered idea generation, scoring, and analysis",
      });
      return new Response(spec, {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "application/json" },
      });
    }

    const html = getSwaggerUIHTML(`${url.origin}/api/api-playground?format=json`);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    logger.error("API playground error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/api-playground",
    });
    return new Response(JSON.stringify({ error: "API playground generation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
