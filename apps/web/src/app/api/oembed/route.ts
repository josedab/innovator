export const runtime = "nodejs";

import { getSession } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * oEmbed endpoint for Slack/Twitter/Discord unfurling of shared sessions.
 * Follows the oEmbed 1.0 spec: https://oembed.com/
 *
 * Usage: GET /api/oembed?url=https://...innovator.dev/share/{sessionId}&format=json
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    const format = url.searchParams.get("format") ?? "json";
    const maxWidth = parseInt(url.searchParams.get("maxwidth") ?? "600", 10);
    const maxHeight = parseInt(url.searchParams.get("maxheight") ?? "400", 10);

    if (format !== "json") {
      return new Response(JSON.stringify({ error: "Only JSON format is supported" }), {
        status: 501,
        headers: API_RESPONSE_HEADERS,
      });
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    // Extract session ID from URL pattern: /share/{sessionId}
    const shareMatch = targetUrl.match(/\/share\/([a-zA-Z0-9_-]+)/);
    if (!shareMatch) {
      return new Response(JSON.stringify({ error: "Invalid share URL format" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const sessionId = shareMatch[1];
    const session = getSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const ideaCount = session.angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0);
    const baseUrl = url.origin;
    const embedUrl = `${baseUrl}/embed/${sessionId}`;
    const width = Math.min(maxWidth, 600);
    const height = Math.min(maxHeight, 400);

    const oembedResponse = {
      version: "1.0",
      type: "rich",
      provider_name: "Innovator",
      provider_url: baseUrl,
      title: `💡 ${session.subject}`,
      author_name: "Innovator AI",
      author_url: baseUrl,
      html: `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" style="border:1px solid #e5e5e5;border-radius:8px;" allowfullscreen></iframe>`,
      width,
      height,
      thumbnail_url: undefined,
      description: `${ideaCount} innovation ideas from ${session.angleResults.length} creativity angles`,
    };

    return Response.json(oembedResponse, {
      headers: {
        ...API_RESPONSE_HEADERS,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "oEmbed lookup failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
