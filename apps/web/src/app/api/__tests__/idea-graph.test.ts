import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getSession: vi.fn(),
  indexDocument: vi.fn(),
  findSimilarDocuments: vi.fn(),
  clearEmbeddingsIndex: vi.fn(),
  generateText: vi.fn(),
  extractJson: vi.fn(),
  withRetry: vi.fn(),
}));

import { findSimilarDocuments, getSession, indexDocument } from "@innovator/core";
import { GET as routeGET } from "../idea-graph/[sessionId]/route";

const mockGetSession = vi.mocked(getSession);
const mockFindSimilarDocuments = vi.mocked(findSimilarDocuments);
const mockIndexDocument = vi.mocked(indexDocument);

function invokeGET(request: Request, sessionId: string) {
  return routeGET(request, { params: Promise.resolve({ sessionId }) });
}

const MOCK_SESSION = {
  id: "session-1",
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
};

function makeRequest(): Request {
  return new Request("http://localhost/api/idea-graph/session-1", {
    method: "GET",
  });
}

describe("GET /api/idea-graph/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindSimilarDocuments.mockReturnValue([]);
    mockIndexDocument.mockImplementation(
      () => ({ id: `doc-${mockIndexDocument.mock.calls.length}` }) as never
    );
  });

  it("returns graph with nodes for a valid session", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].title).toBe("Idea A");
    expect(data.nodes[1].title).toBe("Idea B");
    expect(mockGetSession).toHaveBeenCalledWith("session-1");
  });

  it("returns 404 when session is not found", async () => {
    mockGetSession.mockReturnValue(undefined as never);

    const res = await invokeGET(makeRequest(), "unknown-session");
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Session not found");
  });

  it("returns graph with 1 node and no edges for session with 1 idea", async () => {
    const singleIdeaSession = {
      ...MOCK_SESSION,
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Only Idea",
              description: "Solo",
              potentialImpact: "Big",
              implementationHint: "",
            },
          ],
          reasoning: "",
        },
      ],
    };
    mockGetSession.mockReturnValue(singleIdeaSession as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.nodes).toHaveLength(1);
    expect(data.edges).toHaveLength(0);
  });

  it("response includes criticalPath array", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(data).toHaveProperty("criticalPath");
    expect(Array.isArray(data.criticalPath)).toBe(true);
  });

  it("nodes have expected structure", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    const node = data.nodes[0];
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("title");
    expect(node).toHaveProperty("description");
    expect(node).toHaveProperty("angleId");
    expect(node).toHaveProperty("feasibility");
    expect(node.id).toBe("idea-0");
    expect(node.angleId).toBe("scamper");
    expect(node.feasibility).toBe("medium");
  });

  it("returns empty graph for session with 0 ideas", async () => {
    const emptySession = {
      ...MOCK_SESSION,
      angleResults: [],
    };
    mockGetSession.mockReturnValue(emptySession as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.nodes).toHaveLength(0);
    expect(data.edges).toHaveLength(0);
    expect(data.criticalPath).toHaveLength(0);
  });

  it("returns nodes from multiple angle results", async () => {
    const multiAngleSession = {
      ...MOCK_SESSION,
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
        {
          angleId: "first-principles",
          angleName: "First Principles",
          ideas: [
            {
              title: "Idea C",
              description: "Desc C",
              potentialImpact: "Impact C",
              implementationHint: "",
            },
          ],
          reasoning: "",
        },
      ],
    };
    mockGetSession.mockReturnValue(multiAngleSession as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].angleId).toBe("scamper");
    expect(data.nodes[1].angleId).toBe("first-principles");
  });

  it("generates sequential node IDs", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as never);

    const res = await invokeGET(makeRequest(), "session-1");
    const data = await res.json();

    expect(data.nodes[0].id).toBe("idea-0");
    expect(data.nodes[1].id).toBe("idea-1");
  });
});
