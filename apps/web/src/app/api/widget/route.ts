/**
 * @description Embeddable widget JavaScript source endpoint.
 */
export const runtime = "nodejs";

import { getWidgetSource } from "@innovator/core";

/**
 * Serve the innovator-widget web component JavaScript.
 *
 * @route GET /api/widget
 * @returns JavaScript source for the `<innovator-widget>` web component.
 *   Response is cached for 1 hour and CORS is open (`*`) for cross-origin embedding.
 * @header Content-Type application/javascript; charset=utf-8
 * @header Cache-Control public, max-age=3600
 */
export async function GET() {
  const source = getWidgetSource();
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
