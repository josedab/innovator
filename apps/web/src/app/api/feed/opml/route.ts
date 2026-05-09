export const runtime = "nodejs";

import { SECURITY_HEADERS } from "@/lib/api-headers";

/**
 * Generate an OPML file for subscribing to Innovator feeds.
 * Supports custom base URL via ?baseUrl= query param for team distribution.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const baseUrl = url.searchParams.get("baseUrl") || url.origin;

    const angles = [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision",
    ];

    const outlines = [
      `      <outline text="All Sessions" title="All Sessions" type="rss" xmlUrl="${baseUrl}/api/feed/rss" htmlUrl="${baseUrl}"/>`,
      ...angles.map(
        (a) =>
          `      <outline text="${a}" title="${a}" type="rss" xmlUrl="${baseUrl}/api/feed/rss?angle=${a}" htmlUrl="${baseUrl}"/>`
      ),
    ];

    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Innovator — Innovation Feeds</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
    <ownerName>Innovator</ownerName>
  </head>
  <body>
    <outline text="Innovator Feeds" title="Innovator Feeds">
${outlines.join("\n")}
    </outline>
  </body>
</opml>`;

    return new Response(opml, {
      headers: {
        "Content-Type": "text/x-opml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="innovator-feeds.opml"',
        "Cache-Control": "public, max-age=3600",
        ...SECURITY_HEADERS,
      },
    });
  } catch {
    return new Response("Failed to generate OPML", { status: 500 });
  }
}
