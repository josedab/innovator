import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  listSessions: vi.fn(),
  querySessions: vi.fn(),
}));

import { listSessions, querySessions } from "@innovator/core";
import { GET as GET_ATOM } from "../feed/atom/route";
import { GET as GET_OPML } from "../feed/opml/route";
import { GET as GET_RSS } from "../feed/rss/route";

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

describe("GET /api/feed/rss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid XML with correct content-type", async () => {
    mockListSessions.mockReturnValue([MOCK_SESSION] as any);

    const res = await GET_RSS(new Request("http://localhost/api/feed/rss"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
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

    const res = await GET_RSS(new Request("http://localhost/api/feed/rss?limit=5"));
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
    expect(res.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
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
    expect(res.headers.get("Content-Type")).toBe("text/x-opml; charset=utf-8");
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<opml version="2.0">');
    expect(body).toContain('text="All Sessions"');
    expect(body).toContain('text="scamper"');
    expect(body).toContain("xmlUrl=");
  });
});
