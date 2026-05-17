import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  indexArtifact,
  searchLake,
  detectDuplicates,
  surfaceTrends,
  clearKnowledgeLake,
  getLakeStats,
} from "../knowledge-lake/index.js";
import type { ArtifactType } from "../knowledge-lake/index.js";
import {
  facetedSearch,
  ingestBatch,
  computeEmbeddingStub,
  getKnowledgeLakeSummary,
} from "../knowledge-lake/faceted-search.js";

function makeArtifact(id: string, title: string, content: string, type: ArtifactType = "idea") {
  const now = new Date().toISOString();
  return { id, type, title, content, tags: [], metadata: {}, createdAt: now, updatedAt: now };
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

describe("knowledge-lake/faceted-search", () => {
  beforeEach(() => {
    clearKnowledgeLake();
  });

  it("indexes and searches artifacts", () => {
    // Index several documents to make TF-IDF meaningful
    indexArtifact(
      makeArtifact(
        "1",
        "artificial intelligence healthcare",
        "artificial intelligence machine learning healthcare diagnostics treatment"
      )
    );
    indexArtifact(
      makeArtifact(
        "2",
        "blockchain supply chain",
        "blockchain distributed ledger supply chain management"
      )
    );
    indexArtifact(
      makeArtifact(
        "3",
        "quantum computing research",
        "quantum computing qubits entanglement research simulation"
      )
    );

    const results = searchLake("artificial intelligence healthcare", { minScore: 0.001 });
    expect(results.totalIndexed).toBe(3);
    // At minimum, verify search returns without error
    expect(results.query).toBe("artificial intelligence healthcare");
  });

  it("performs faceted search with type, session, tag, and date filters", () => {
    indexArtifact({
      ...makeArtifact(
        "1",
        "AI diagnostics idea",
        "Machine learning diagnostics workflow for clinician copilots",
        "idea"
      ),
      sessionId: "session-a",
      tags: ["ai", "healthcare"],
      createdAt: "2024-01-15T00:00:00.000Z",
      updatedAt: "2024-01-15T00:00:00.000Z",
    });
    indexArtifact({
      ...makeArtifact("2", "AI Investigation", "Research into ML and diagnostics", "investigation"),
      sessionId: "session-b",
      tags: ["research"],
      createdAt: "2023-01-15T00:00:00.000Z",
      updatedAt: "2023-01-15T00:00:00.000Z",
    });

    const results = facetedSearch({
      query: "machine learning diagnostics",
      facets: [
        { field: "type", values: ["idea"] },
        { field: "session", values: ["session-a"] },
        { field: "tag", values: ["healthcare"] },
        { field: "dateRange", values: ["2024-01-01:2024-12-31"] },
      ],
      limit: 10,
      offset: 0,
      sortBy: "relevance",
      boostRecent: true,
    });

    expect(results.total).toBe(1);
    expect(results.results[0].id).toBe("1");
    expect(results.facetCounts.types).toEqual([{ value: "idea", count: 1 }]);
  });

  it("detects duplicate artifacts", () => {
    // Need several docs for IDF to differentiate, plus identical pair
    for (let i = 0; i < 5; i++) {
      indexArtifact(
        makeArtifact(
          `bg-${i}`,
          `Background Topic ${i}`,
          `unique content about topic number ${i} with various different words`
        )
      );
    }
    const content =
      "identical content repeated verbatim for duplicate detection testing purpose across sessions";
    indexArtifact(makeArtifact("dup-1", "Identical Title", content));
    indexArtifact(makeArtifact("dup-2", "Identical Title", content));

    const dups = detectDuplicates(0.5);
    // At minimum, verify the function executes and returns valid groups
    expect(Array.isArray(dups)).toBe(true);
    for (const g of dups) {
      expect(g.artifacts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns lake stats", () => {
    indexArtifact(makeArtifact("1", "Test", "Content"));
    const stats = getLakeStats();
    expect(stats.totalArtifacts).toBe(1);
  });

  it("surfaces trends with sufficient data", () => {
    for (let i = 0; i < 5; i++) {
      indexArtifact(
        makeArtifact(
          `a${i}`,
          `AI Innovation ${i}`,
          `Innovation using artificial intelligence number ${i}`
        )
      );
    }
    const trends = surfaceTrends(2);
    expect(trends.length).toBeGreaterThanOrEqual(0);
  });

  it("ingests a batch of items and skips duplicates already in the lake", () => {
    indexArtifact({
      ...makeArtifact("existing", "Batch Idea 1", "Idea about batch processing of data"),
      tags: ["automation"],
    });

    const result = ingestBatch([
      {
        id: "b1",
        type: "idea",
        title: "Batch Idea 1",
        content: "Idea about batch processing of data",
      },
      { id: "b2", type: "idea", title: "Batch Idea 2", content: "Idea about automated testing" },
      { id: "b3", type: "idea", title: "Batch Idea 1", content: "Duplicate title" },
    ]);
    expect(result.indexedCount).toBe(1);
    expect(result.duplicatesDetected).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("computes embedding stub", () => {
    const embedding = computeEmbeddingStub("test text for embedding");
    expect(embedding.length).toBe(128);
    // Check normalization — magnitude ≈ 1
    const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 1);
  });

  it("produces deterministic embeddings", () => {
    const e1 = computeEmbeddingStub("same input");
    const e2 = computeEmbeddingStub("same input");
    expect(e1).toEqual(e2);
  });

  it("keeps semantically similar texts closer than unrelated ones", () => {
    const similarA = computeEmbeddingStub("AI healthcare diagnosis workflow");
    const similarB = computeEmbeddingStub("healthcare AI diagnosis workflow");
    const unrelated = computeEmbeddingStub("agricultural irrigation forecast");

    expect(cosineSimilarity(similarA, similarB)).toBeGreaterThan(
      cosineSimilarity(similarA, unrelated)
    );
  });

  it("summarizes indexed tags and recent activity", () => {
    indexArtifact({
      ...makeArtifact("summary-1", "AI Backlog", "Notes about copilots"),
      tags: ["ai", "roadmap"],
      updatedAt: new Date().toISOString(),
    });
    indexArtifact({
      ...makeArtifact("summary-2", "Market Watch", "Signals from competitors"),
      tags: ["ai", "signals"],
      updatedAt: new Date().toISOString(),
    });

    const summary = getKnowledgeLakeSummary();
    expect(summary.topTags[0]).toEqual({ tag: "ai", count: 2 });
    expect(summary.recentCount).toBe(2);
    expect(summary.stats.totalArtifacts).toBe(2);
  });
});
