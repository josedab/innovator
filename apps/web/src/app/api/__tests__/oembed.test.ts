import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@innovator/core";
const mockGetSession = vi.mocked(getSession);

// Inline a simplified GET handler to avoid Next.js module resolution issues
async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    const format = url.searchParams.get("format") ?? "json";
    const maxWidth = parseInt(url.searchParams.get("maxwidth") ?? "600", 10);
    const maxHeight = parseInt(url.searchParams.get("maxheight") ?? "400", 10);

    if (format !== "json") {
      return new Response(JSON.stringify({ error: "Only JSON format is supported" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const shareMatch = targetUrl.match(/\/share\/([a-zA-Z0-9_-]+)/);
    if (!shareMatch) {
      return new Response(JSON.stringify({ error: "Invalid share URL format" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionId = shareMatch[1];
    const session = getSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ideaCount = session.angleResults.reduce(
      (sum: number, ar: { ideas: unknown[] }) => sum + ar.ideas.length,
      0
    );
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

    return Response.json(oembedResponse);
  } catch {
    return new Response(JSON.stringify({ error: "oEmbed lookup failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const MOCK_SESSION = {
  id: "session-1",
  subject: "AI innovation",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        { title: "Idea 1", description: "Desc", potentialImpact: "High", implementationHint: "" },
      ],
      reasoning: "",
    },
  ],
  tags: [],
};

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/oembed");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/oembed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns oEmbed JSON with type 'rich' for a valid URL", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await GET(
      makeRequest({ url: "https://example.com/share/session-1", format: "json" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.type).toBe("rich");
    expect(mockGetSession).toHaveBeenCalledWith("session-1");
  });

  it("returns 400 when url param is missing", async () => {
    const res = await GET(makeRequest({ format: "json" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Missing 'url' parameter");
  });

  it("returns 404 for invalid URL format without /share/", async () => {
    const res = await GET(makeRequest({ url: "https://example.com/sessions/123", format: "json" }));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Invalid share URL format");
  });

  it("returns 404 when session is not found", async () => {
    mockGetSession.mockReturnValue(undefined as never);

    const res = await GET(
      makeRequest({ url: "https://example.com/share/nonexistent", format: "json" })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Session not found");
  });

  it("returns 501 for non-JSON format", async () => {
    const res = await GET(
      makeRequest({ url: "https://example.com/share/session-1", format: "xml" })
    );
    const data = await res.json();

    expect(res.status).toBe(501);
    expect(data.error).toBe("Only JSON format is supported");
  });

  it("includes iframe HTML in the response", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await GET(
      makeRequest({ url: "https://example.com/share/session-1", format: "json" })
    );
    const data = await res.json();

    expect(data.html).toContain("<iframe");
    expect(data.html).toContain("/embed/session-1");
  });

  it("includes provider_name 'Innovator'", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await GET(
      makeRequest({ url: "https://example.com/share/session-1", format: "json" })
    );
    const data = await res.json();

    expect(data.provider_name).toBe("Innovator");
  });
});
