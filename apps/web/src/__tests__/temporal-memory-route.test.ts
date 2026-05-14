import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  ingestTemporalSession: vi.fn(),
  queryTemporalMemory: vi.fn(),
  computeInnovationVelocity: vi.fn(),
  detectRecurrences: vi.fn(),
  loadTemporalGraph: vi.fn(),
  searchTemporalNodes: vi.fn(),
  temporalMemoryToMarkdown: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/temporal-memory/route.js";
import {
  ingestTemporalSession,
  loadTemporalGraph,
  computeInnovationVelocity,
  detectRecurrences,
  searchTemporalNodes,
} from "@innovator/core";

const mockLoadGraph = vi.mocked(loadTemporalGraph);
const mockVelocity = vi.mocked(computeInnovationVelocity);
const mockRecurrences = vi.mocked(detectRecurrences);
const mockSearch = vi.mocked(searchTemporalNodes);
const mockIngest = vi.mocked(ingestTemporalSession);

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/temporal-memory");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/temporal-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/temporal-memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadGraph.mockReturnValue({
      version: 1,
      nodes: [],
      edges: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
  });

  it("GET returns graph stats by default", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes).toBe(0);
    expect(data.edges).toBe(0);
  });

  it("GET action=velocity returns velocity metrics", async () => {
    mockVelocity.mockReturnValue({
      period: "3 months",
      ideasPerMonth: 5,
      conceptEvolutionRate: 2,
      outcomeLeadTimeDays: null,
      activeConcepts: 10,
      newConcepts: 3,
      obsoletedConcepts: 0,
    });
    const res = await GET(makeGet({ action: "velocity", months: "6" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ideasPerMonth).toBe(5);
  });

  it("GET action=recurrences returns recurring concepts", async () => {
    mockRecurrences.mockReturnValue([
      {
        concept: "AI",
        nodeId: "n1",
        count: 3,
        firstSeen: "2026-01",
        lastSeen: "2026-05",
        sessions: ["s1", "s2", "s3"],
      },
    ]);
    const res = await GET(makeGet({ action: "recurrences" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recurrences).toHaveLength(1);
  });

  it("GET action=search requires q param", async () => {
    const res = await GET(makeGet({ action: "search" }));
    expect(res.status).toBe(400);
  });

  it("GET action=search returns matching nodes", async () => {
    mockSearch.mockReturnValue([
      {
        id: "n1",
        label: "AI Ethics",
        type: "concept",
        createdAt: "2026-01",
        modifiedAt: "2026-05",
        confidence: 0.8,
        sessionIds: ["s1"],
        occurrenceCount: 2,
      },
    ]);
    const res = await GET(makeGet({ action: "search", q: "AI" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes).toHaveLength(1);
  });

  it("POST ingests a session", async () => {
    mockIngest.mockReturnValue({ nodesCreated: 5, edgesCreated: 3, recurrences: [] });
    const res = await POST(
      makePost({
        sessionId: "s1",
        subject: "AI Ethics",
        ideas: [{ title: "Bias Tool", description: "Detect bias", angleId: "first-principles" }],
        timestamp: "2026-05-13T10:00:00Z",
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.nodesCreated).toBe(5);
  });

  it("POST validates required fields", async () => {
    const res = await POST(makePost({ sessionId: "" }));
    expect(res.status).toBe(400);
  });

  it("POST with question runs NL query", async () => {
    const { queryTemporalMemory } = await import("@innovator/core");
    vi.mocked(queryTemporalMemory).mockResolvedValue({
      narrative: "AI ethics evolved...",
      matchingNodes: [],
      matchingEdges: [],
      timeline: [],
      recurrences: [],
    });
    const res = await POST(makePost({ question: "How has AI ethics evolved?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.narrative).toContain("AI ethics");
  });
});
