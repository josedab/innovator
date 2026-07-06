import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@innovator/core";
import { GET } from "../oembed/route";

const mockGetSession = vi.mocked(getSession);

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
