import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getSession: vi.fn(),
  indexDocument: vi.fn(),
  findSimilarDocuments: vi.fn(),
  clearEmbeddingsIndex: vi.fn(),
}));

import { findSimilarDocuments, getSession, indexDocument } from "@innovator/core";
import { POST } from "../session-compare/route";

const mockGetSession = vi.mocked(getSession);
const mockFindSimilarDocuments = vi.mocked(findSimilarDocuments);
const mockIndexDocument = vi.mocked(indexDocument);

const MOCK_SESSION_1 = {
  id: "s1",
  subject: "AI code review",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Idea A",
          description: "Desc A",
          potentialImpact: "Impact A",
          implementationHint: "",
        },
      ],
      reasoning: "",
    },
  ],
  tags: [],
  synthesis: {
    topIdeas: [
      {
        title: "Top 1",
        description: "Desc",
        sourceAngle: "scamper",
        potentialImpact: "High",
        feasibility: "high",
      },
    ],
    themes: ["AI", "DevTools"],
    recommendation: "Do it",
  },
};

const MOCK_SESSION_2 = {
  id: "s2",
  subject: "Testing automation",
  createdAt: "2024-02-01T00:00:00Z",
  updatedAt: "2024-02-01T00:00:00Z",
  angleResults: [
    {
      angleId: "first-principles",
      angleName: "First Principles",
      ideas: [
        {
          title: "Idea B",
          description: "Desc B",
          potentialImpact: "Impact B",
          implementationHint: "",
        },
      ],
      reasoning: "",
    },
  ],
  tags: [],
  synthesis: {
    topIdeas: [
      {
        title: "Top 2",
        description: "Desc",
        sourceAngle: "first-principles",
        potentialImpact: "Medium",
        feasibility: "medium",
      },
    ],
    themes: ["AI", "Testing"],
    recommendation: "Test",
  },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/session-compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session-compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindSimilarDocuments.mockReturnValue([]);
    mockIndexDocument.mockImplementation(
      () => ({ id: `doc-${mockIndexDocument.mock.calls.length}` }) as never
    );
  });

  it("returns expected structure for valid 2-session comparison", async () => {
    mockGetSession.mockImplementation((id: string) => {
      if (id === "s1") return MOCK_SESSION_1 as never;
      if (id === "s2") return MOCK_SESSION_2 as never;
      return null as never;
    });

    const res = await POST(makeRequest({ sessionIds: ["s1", "s2"] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessions).toHaveLength(2);
    expect(data.sharedThemes).toEqual(["AI"]);
    expect(data.uniqueThemes).toEqual({ s1: ["DevTools"], s2: ["Testing"] });
    expect(data.ideaOverlaps).toEqual([]);
    expect(data.angleComparison).toEqual({ scamper: ["s1"], "first-principles": ["s2"] });
    expect(data.scoreDelta).toHaveLength(2);
    expect(data.timeline).toHaveLength(2);
  });

  it("returns 400 for missing sessionIds", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-5 session IDs to compare.");
  });

  it("returns 400 for only 1 session ID", async () => {
    const res = await POST(makeRequest({ sessionIds: ["s1"] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for more than 5 session IDs", async () => {
    const res = await POST(makeRequest({ sessionIds: ["a", "b", "c", "d", "e", "f"] }));

    expect(res.status).toBe(400);
  });

  it("returns 404 when a session is not found", async () => {
    mockGetSession.mockReturnValue(null as never);

    const res = await POST(makeRequest({ sessionIds: ["s1", "s2"] }));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("Session not found");
  });

  it("includes shared themes across sessions", async () => {
    mockGetSession.mockImplementation((id: string) => {
      if (id === "s1") return MOCK_SESSION_1 as never;
      if (id === "s2") return MOCK_SESSION_2 as never;
      return null as never;
    });

    const res = await POST(makeRequest({ sessionIds: ["s1", "s2"] }));
    const data = await res.json();

    expect(data.sharedThemes).toContain("AI");
    expect(data.sharedThemes).not.toContain("DevTools");
    expect(data.sharedThemes).not.toContain("Testing");
  });

  it("returns timeline sorted chronologically", async () => {
    mockGetSession.mockImplementation((id: string) => {
      if (id === "s1") return MOCK_SESSION_1 as never;
      if (id === "s2") return MOCK_SESSION_2 as never;
      return null as never;
    });

    const res = await POST(makeRequest({ sessionIds: ["s2", "s1"] }));
    const data = await res.json();

    expect(data.timeline[0].sessionId).toBe("s1");
    expect(data.timeline[1].sessionId).toBe("s2");
    expect(new Date(data.timeline[0].createdAt).getTime()).toBeLessThan(
      new Date(data.timeline[1].createdAt).getTime()
    );
  });
});
