export const runtime = "nodejs";

import { getWidgetSource } from "@innovator/core";

/**
 * Serve the innovator-widget web component JavaScript.
 * GET /api/widget → returns the widget JS for embedding.
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
