import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => {
  const { z } = require("zod");
  return {
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    refineConversation: vi.fn(),
    createExplorationTree: vi.fn(),
    getExplorationTree: vi.fn(),
    drillDown: vi.fn(),
    getExplorationPath: vi.fn(),
    getNodeBranches: vi.fn(),
    InvestigationSchema: z.object({
      summary: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      currentState: z.string(),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    }),
    AngleResultSchema: z.object({
      angleId: z.string(),
      angleName: z.string(),
      ideas: z.array(z.any()),
      reasoning: z.string(),
    }),
    SynthesisSchema: z.object({
      topIdeas: z.array(z.any()),
      themes: z.array(z.string()),
      recommendation: z.string(),
    }),
  };
});

import {
  createConversation,
  getConversation,
  refineConversation,
  createExplorationTree,
  getExplorationTree,
  drillDown,
  getExplorationPath,
  getNodeBranches,
} from "@innovator/core";
import { POST } from "../refine/route";

const mockCreateConversation = vi.mocked(createConversation);
const mockGetConversation = vi.mocked(getConversation);
const mockRefineConversation = vi.mocked(refineConversation);
const mockCreateExplorationTree = vi.mocked(createExplorationTree);
const mockGetExplorationTree = vi.mocked(getExplorationTree);
const mockDrillDown = vi.mocked(drillDown);
const mockGetExplorationPath = vi.mocked(getExplorationPath);
const mockGetNodeBranches = vi.mocked(getNodeBranches);

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/refine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with sessionId for action 'start'", async () => {
    mockCreateConversation.mockReturnValue({
      sessionId: "test-uuid-123",
      subject: "Test subject",
    } as any);

    const res = await POST(makeRequest({ action: "start", subject: "Test subject" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessionId).toBe("test-uuid-123");
    expect(data.subject).toBe("Test subject");
  });

  it("handles action 'refine' with valid sessionId", async () => {
    mockGetConversation.mockReturnValue({ sessionId: "valid-id" } as any);
    mockRefineConversation.mockResolvedValue({
      response: "Refined output",
      suggestions: ["Next step"],
    } as any);

    const res = await POST(
      makeRequest({
        action: "refine",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        message: "Tell me more",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.response).toBe("Refined output");
  });

  it("returns 404 for invalid sessionId in refine", async () => {
    mockGetConversation.mockReturnValue(undefined);

    const res = await POST(
      makeRequest({
        action: "refine",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        message: "Test",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ action: "start" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid request");
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/refine", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "start", subject: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 500 on internal error", async () => {
    mockCreateConversation.mockImplementation(() => {
      throw new Error("Internal error");
    });

    const res = await POST(makeRequest({ action: "start", subject: "test" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 400 for non-UUID sessionId in refine", async () => {
    const res = await POST(
      makeRequest({ action: "refine", sessionId: "not-a-uuid", message: "hello" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty message in refine", async () => {
    const res = await POST(
      makeRequest({
        action: "refine",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        message: "",
      })
    );
    expect(res.status).toBe(400);
  });
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/refine — create-tree", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an exploration tree for valid session", async () => {
    mockCreateExplorationTree.mockReturnValue({ id: "tree-1", nodes: [] } as any);

    const res = await POST(makeRequest({ action: "create-tree", sessionId: VALID_UUID }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tree).toBeDefined();
    expect(mockCreateExplorationTree).toHaveBeenCalledWith(VALID_UUID);
  });

  it("returns 404 when session not found", async () => {
    mockCreateExplorationTree.mockReturnValue(null as any);

    const res = await POST(makeRequest({ action: "create-tree", sessionId: VALID_UUID }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/refine — drill-down", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drills down with valid parameters", async () => {
    mockDrillDown.mockResolvedValue({ id: "node-1", content: "drilled" } as any);

    const res = await POST(
      makeRequest({
        action: "drill-down",
        sessionId: VALID_UUID,
        parentNodeId: "root",
        query: "Tell me more about X",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.node).toBeDefined();
    expect(mockDrillDown).toHaveBeenCalledWith(
      VALID_UUID,
      "root",
      "Tell me more about X",
      undefined,
      expect.anything()
    );
  });

  it("returns 400 for missing parentNodeId", async () => {
    const res = await POST(
      makeRequest({
        action: "drill-down",
        sessionId: VALID_UUID,
        query: "Tell me more",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing query", async () => {
    const res = await POST(
      makeRequest({
        action: "drill-down",
        sessionId: VALID_UUID,
        parentNodeId: "root",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/refine — get-tree", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the exploration tree", async () => {
    mockGetExplorationTree.mockReturnValue({ id: "tree-1", nodes: ["n1"] } as any);

    const res = await POST(makeRequest({ action: "get-tree", sessionId: VALID_UUID }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tree).toBeDefined();
  });

  it("returns 404 when tree not found", async () => {
    mockGetExplorationTree.mockReturnValue(null as any);

    const res = await POST(makeRequest({ action: "get-tree", sessionId: VALID_UUID }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/refine — get-path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the path for a node", async () => {
    mockGetExplorationPath.mockReturnValue(["root", "child1"] as any);

    const res = await POST(
      makeRequest({ action: "get-path", sessionId: VALID_UUID, nodeId: "child1" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.path).toBeDefined();
  });

  it("returns 400 for missing nodeId", async () => {
    const res = await POST(makeRequest({ action: "get-path", sessionId: VALID_UUID }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/refine — get-branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns branches for a node", async () => {
    mockGetNodeBranches.mockReturnValue([{ id: "b1" }, { id: "b2" }] as any);

    const res = await POST(
      makeRequest({ action: "get-branches", sessionId: VALID_UUID, nodeId: "root" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.branches).toBeDefined();
  });

  it("returns 400 for missing nodeId", async () => {
    const res = await POST(makeRequest({ action: "get-branches", sessionId: VALID_UUID }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/refine — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for unknown action", async () => {
    const res = await POST(makeRequest({ action: "unknown-action" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for string too long (subject >500)", async () => {
    const res = await POST(makeRequest({ action: "start", subject: "x".repeat(501) }));
    expect(res.status).toBe(400);
  });
});
