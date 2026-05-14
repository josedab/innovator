import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  sequenceIdea: vi.fn(),
  findSimilarGenomes: vi.fn(),
  recombineGenomes: vi.fn(),
  getAllGenomes: vi.fn(),
  getGenome: vi.fn(),
  searchGenomes: vi.fn(),
  genomeToMarkdown: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/genome-sequencer/route.js";
import {
  sequenceIdea,
  getAllGenomes,
  getGenome,
  findSimilarGenomes,
  recombineGenomes,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/genome-sequencer");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/genome-sequencer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/genome-sequencer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET lists all genomes", async () => {
    vi.mocked(getAllGenomes).mockReturnValue([
      {
        id: "g1",
        ideaTitle: "Idea A",
        sequencedAt: "2026-01-01",
        traits: [{ type: "problem-space" }],
      },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.genomes[0].title).toBe("Idea A");
  });

  it("GET by id returns genome", async () => {
    vi.mocked(getGenome).mockReturnValue({ id: "g1", ideaTitle: "Test", traits: [] });
    const res = await GET(makeGet({ id: "g1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("g1");
  });

  it("GET returns 404 for unknown id", async () => {
    vi.mocked(getGenome).mockReturnValue(undefined);
    const res = await GET(makeGet({ id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("POST sequences an idea", async () => {
    vi.mocked(sequenceIdea).mockResolvedValue({
      id: "g1",
      ideaTitle: "Test",
      ideaDescription: "Desc",
      traits: [
        { type: "problem-space", value: "logistics", confidence: 0.8, keywords: ["shipping"] },
      ],
      sequencedAt: "2026-01-01",
    });
    const res = await POST(
      makePost({
        idea: { title: "Test", description: "A logistics optimization tool" },
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.traits).toHaveLength(1);
  });

  it("POST validates required idea fields", async () => {
    const res = await POST(makePost({ idea: { title: "" } }));
    expect(res.status).toBe(400);
  });

  it("POST finds similar genomes", async () => {
    vi.mocked(getGenome).mockReturnValue({ id: "g1", traits: [] });
    vi.mocked(findSimilarGenomes).mockReturnValue([
      {
        genomeA: "g1",
        genomeB: "g2",
        overallSimilarity: 0.7,
        traitSimilarities: [],
        ideaTitle: "Similar",
      },
    ]);
    const res = await POST(makePost({ action: "similar", genomeId: "g1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.similar).toHaveLength(1);
  });

  it("POST recombines two genomes", async () => {
    vi.mocked(getGenome)
      .mockReturnValueOnce({ id: "g1", traits: [{ type: "problem-space" }] })
      .mockReturnValueOnce({ id: "g2", traits: [{ type: "solution-mechanism" }] });
    vi.mocked(recombineGenomes).mockResolvedValue({
      title: "Recombinant",
      description: "New idea",
      sourceGenomes: ["g1", "g2"],
      traitSources: [],
      noveltyScore: 0.8,
    });
    const res = await POST(makePost({ action: "recombine", genomeIdA: "g1", genomeIdB: "g2" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Recombinant");
  });

  it("POST recombine returns 404 for missing genome", async () => {
    vi.mocked(getGenome).mockReturnValue(undefined);
    const res = await POST(makePost({ action: "recombine", genomeIdA: "g1", genomeIdB: "g2" }));
    expect(res.status).toBe(404);
  });
});
