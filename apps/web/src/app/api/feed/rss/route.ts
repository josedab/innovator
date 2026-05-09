export const runtime = "nodejs";

import { listSessions, querySessions } from "@innovator/core";
import type { SessionRecord } from "@innovator/core";
import { SECURITY_HEADERS } from "@/lib/api-headers";
import { logger } from "@/lib/logger";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sessionToDescription(session: SessionRecord): string {
  const parts: string[] = [];
  if (session.investigation?.summary) {
    parts.push(session.investigation.summary);
  }
  if (session.synthesis?.topIdeas && session.synthesis.topIdeas.length > 0) {
    parts.push("\n\nTop Ideas:");
    for (const idea of session.synthesis.topIdeas.slice(0, 3)) {
      parts.push(`• ${idea.title}: ${idea.description}`);
    }
  }
  return parts.join("\n") || `Innovation session on "${session.subject}"`;
}

/**
 * Generate an RSS 2.0 feed of completed innovation sessions.
 * Supports filtering via query params: ?angle=scamper&minScore=7&since=2024-01-01&limit=20
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const angle = url.searchParams.get("angle") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

    let sessions: SessionRecord[];
    if (angle || since) {
      sessions = querySessions({
        search: angle,
        fromDate: since,
        limit,
      });
    } else {
      sessions = listSessions().slice(0, limit);
    }

    const baseUrl = url.origin;
    const feedUrl = `${baseUrl}/api/feed/rss${url.search}`;
    const now = new Date().toUTCString();

    const items = sessions.map((s) => {
      const desc = sessionToDescription(s);
      const link = `${baseUrl}/share/${s.id}`;
      const angles = s.angleResults.map((a) => a.angleId).join(", ");
      return `    <item>
      <title>${escapeXml(s.subject)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(s.id)}</guid>
      <pubDate>${new Date(s.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(desc)}</description>
      <category>${escapeXml(angles || "general")}</category>
    </item>`;
    });

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Innovator — Innovation Feed</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>AI-powered innovation sessions and ideas</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <generator>Innovator</generator>
${items.join("\n")}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    logger.error("RSS feed error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/feed/rss",
    });
    return new Response(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title></channel></rss>`,
      {
        status: 500,
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
      }
    );
  }
}
