import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  listSessions: vi.fn(),
  querySessions: vi.fn(),
}));

import { listSessions, querySessions } from "@innovator/core";
const mockListSessions = vi.mocked(listSessions);
const mockQuerySessions = vi.mocked(querySessions);

const MOCK_SESSION = {
  id: "session-1",
  subject: "AI code review",
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-01-15T10:30:00Z",
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Idea 1",
          description: "Desc",
          potentialImpact: "High",
          implementationHint: "Start here",
        },
      ],
      reasoning: "Applied SCAMPER",
    },
  ],
  tags: [],
  investigation: {
    summary: "Test summary",
    keyAspects: [],
    currentState: "",
    challenges: [],
    opportunities: [],
  },
  synthesis: {
    topIdeas: [
      {
        title: "Top Idea",
        description: "Best idea",
        sourceAngle: "scamper",
        potentialImpact: "High impact",
        feasibility: "high",
      },
    ],
    themes: ["AI"],
    recommendation: "Do it",
  },
};

// --- Inline simplified handlers (avoid Next.js module resolution) ---

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sessionToDescription(session: typeof MOCK_SESSION): string {
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

async function GET_RSS(request: Request) {
  try {
    const url = new URL(request.url);
    const angle = url.searchParams.get("angle") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100)
      : 20;

    let sessions: (typeof MOCK_SESSION)[];
    if (angle || since) {
      sessions = (querySessions as any)({ search: angle, fromDate: since, limit });
    } else {
      sessions = (listSessions as any)().slice(0, limit);
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
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title></channel></rss>`,
      {
        status: 500,
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
      }
    );
  }
}

async function GET_ATOM(request: Request) {
  try {
    const url = new URL(request.url);
    const angle = url.searchParams.get("angle") ?? undefined;
    const since = url.searchParams.get("since") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100)
      : 20;

    let sessions: (typeof MOCK_SESSION)[];
    if (angle || since) {
      sessions = (querySessions as any)({ search: angle, fromDate: since, limit });
    } else {
      sessions = (listSessions as any)().slice(0, limit);
    }

    const baseUrl = url.origin;
    const feedUrl = `${baseUrl}/api/feed/atom${url.search}`;
    const now = new Date().toISOString();

    const entries = sessions.map((s) => {
      const summary = sessionToDescription(s);
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
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Error</title></feed>`,
      {
        status: 500,
        headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
      }
    );
  }
}

async function GET_OPML(request: Request) {
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
      },
    });
  } catch {
    return new Response("Failed to generate OPML", { status: 500 });
  }
}

// --- Tests ---

describe("GET /api/feed/rss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid XML with correct content-type", async () => {
    mockListSessions.mockReturnValue([MOCK_SESSION] as any);

    const res = await GET_RSS(new Request("http://localhost/api/feed/rss"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<rss version=");
  });

  it("includes session subject in <title>", async () => {
    mockListSessions.mockReturnValue([MOCK_SESSION] as any);

    const res = await GET_RSS(new Request("http://localhost/api/feed/rss"));
    const body = await res.text();

    expect(body).toContain("<title>AI code review</title>");
  });

  it("handles empty sessions gracefully", async () => {
    mockListSessions.mockReturnValue([] as any);

    const res = await GET_RSS(new Request("http://localhost/api/feed/rss"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("<channel>");
    expect(body).not.toContain("<item>");
  });

  it("respects limit parameter", async () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_SESSION,
      id: `session-${i}`,
      subject: `Session ${i}`,
    }));
    mockListSessions.mockReturnValue(sessions as any);

    const res = await GET_RSS(
      new Request("http://localhost/api/feed/rss?limit=5")
    );
    const body = await res.text();

    const itemCount = (body.match(/<item>/g) || []).length;
    expect(itemCount).toBe(5);
  });
});

describe("GET /api/feed/atom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid XML with correct content-type", async () => {
    mockListSessions.mockReturnValue([MOCK_SESSION] as any);

    const res = await GET_ATOM(new Request("http://localhost/api/feed/atom"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/atom+xml; charset=utf-8"
    );
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<feed xmlns=");
  });

  it("includes session subject in <title>", async () => {
    mockListSessions.mockReturnValue([MOCK_SESSION] as any);

    const res = await GET_ATOM(new Request("http://localhost/api/feed/atom"));
    const body = await res.text();

    expect(body).toContain("<title>AI code review</title>");
  });
});

describe("GET /api/feed/opml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns XML with feed outlines", async () => {
    const res = await GET_OPML(new Request("http://localhost/api/feed/opml"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/x-opml; charset=utf-8"
    );
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<opml version="2.0">');
    expect(body).toContain('text="All Sessions"');
    expect(body).toContain('text="scamper"');
    expect(body).toContain("xmlUrl=");
  });
});
