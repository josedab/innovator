/**
 * @description Atom feed for innovation session history.
 */
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

function sessionToSummary(session: SessionRecord): string {
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
 * Generate an Atom 1.0 feed of completed innovation sessions.
 * Supports filtering: ?angle=scamper&since=2024-01-01&limit=20
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
      sessions = querySessions({ search: angle, fromDate: since, limit });
    } else {
      sessions = listSessions().slice(0, limit);
    }

    const baseUrl = url.origin;
    const feedUrl = `${baseUrl}/api/feed/atom${url.search}`;
    const now = new Date().toISOString();

    const entries = sessions.map((s) => {
      const summary = sessionToSummary(s);
      const link = `${baseUrl}/share/${s.id}`;
      return `  <entry>
    <title>${escapeXml(s.subject)}</title>
    <link href="${escapeXml(link)}" rel="alternate"/>
    <id>urn:innovator:session:${escapeXml(s.id)}</id>
    <updated>${s.updatedAt || s.createdAt}</updated>
    <published>${s.createdAt}</published>
    <summary type="text">${escapeXml(summary)}</summary>
    <author><name>Innovator</name></author>
${s.angleResults.map((a) => `    <category term="${escapeXml(a.angleId)}"/>`).join("\n")}
  </entry>`;
    });

    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Innovator — Innovation Feed</title>
  <subtitle>AI-powered innovation sessions and ideas</subtitle>
  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(baseUrl)}" rel="alternate"/>
  <id>urn:innovator:feed</id>
  <updated>${now}</updated>
  <generator uri="${escapeXml(baseUrl)}" version="0.2.0">Innovator</generator>
${entries.join("\n")}
</feed>`;

    return new Response(atom, {
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    logger.error("Atom feed error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/feed/atom",
    });
    return new Response(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Error</title></feed>`,
      {
        status: 500,
        headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
      }
    );
  }
}
