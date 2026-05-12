import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  indexDocument: vi.fn(),
  semanticSearch: vi.fn(),
  findSimilarDocuments: vi.fn(),
  clusterDocuments: vi.fn(),
  discoverConnections: vi.fn(),
  getIndexSize: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "../app/api/search/route.js";
import {
  indexDocument,
  semanticSearch,
  findSimilarDocuments,
  clusterDocuments,
  discoverConnections,
  getIndexSize,
} from "@innovator/core";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- action=search ----

  describe("POST action=search", () => {
    it("returns search results with scores", async () => {
      vi.mocked(semanticSearch).mockReturnValue([
        { id: "doc-1", title: "Test", score: 0.95, content: "Hello" },
      ] as never);

      const res = await POST(makePost({ action: "search", query: "test query" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: "doc-1", title: "Test", score: 0.95, content: "Hello" }]);
      expect(semanticSearch).toHaveBeenCalledWith("test query", undefined);
    });

    it("passes limit to semanticSearch", async () => {
      vi.mocked(semanticSearch).mockReturnValue([] as never);

      await POST(makePost({ action: "search", query: "test", limit: 5 }));
      expect(semanticSearch).toHaveBeenCalledWith("test", 5);
    });

    it("rejects query exceeding 2000 chars", async () => {
      const res = await POST(makePost({ action: "search", query: "A".repeat(2001) }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("rejects empty query", async () => {
      const res = await POST(makePost({ action: "search", query: "" }));
      expect(res.status).toBe(400);
    });

    it("rejects limit exceeding 50", async () => {
      const res = await POST(makePost({ action: "search", query: "test", limit: 51 }));
      expect(res.status).toBe(400);
    });

    it("handles special characters in query", async () => {
      vi.mocked(semanticSearch).mockReturnValue([] as never);

      const res = await POST(makePost({ action: "search", query: "test <script> & 'quotes'" }));
      expect(res.status).toBe(200);
      expect(semanticSearch).toHaveBeenCalledWith("test <script> & 'quotes'", undefined);
    });
  });

  // ---- action=index ----

  describe("POST action=index", () => {
    it("indexes a document and returns it with index size", async () => {
      vi.mocked(indexDocument).mockReturnValue({ id: "doc-1", title: "My Doc" } as never);
      vi.mocked(getIndexSize).mockReturnValue(42 as never);

      const res = await POST(
        makePost({
          action: "index",
          type: "investigation",
          title: "My Doc",
          content: "Some content",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.document).toEqual({ id: "doc-1", title: "My Doc" });
      expect(body.indexSize).toBe(42);
    });

    it("passes metadata and sessionId", async () => {
      vi.mocked(indexDocument).mockReturnValue({ id: "doc-2" } as never);
      vi.mocked(getIndexSize).mockReturnValue(1 as never);

      await POST(
        makePost({
          action: "index",
          type: "idea",
          title: "Idea",
          content: "Content",
          metadata: { source: "test" },
          sessionId: "s-123",
        })
      );
      expect(indexDocument).toHaveBeenCalledWith({
        type: "idea",
        title: "Idea",
        content: "Content",
        metadata: { source: "test" },
        sessionId: "s-123",
      });
    });
  });

  // ---- action=similar ----

  describe("POST action=similar", () => {
    it("returns similar documents", async () => {
      vi.mocked(findSimilarDocuments).mockReturnValue([{ id: "sim-1", score: 0.8 }] as never);

      const res = await POST(makePost({ action: "similar", documentId: "doc-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toEqual([{ id: "sim-1", score: 0.8 }]);
      expect(findSimilarDocuments).toHaveBeenCalledWith("doc-1", undefined);
    });

    it("passes limit parameter", async () => {
      vi.mocked(findSimilarDocuments).mockReturnValue([] as never);

      await POST(makePost({ action: "similar", documentId: "doc-1", limit: 10 }));
      expect(findSimilarDocuments).toHaveBeenCalledWith("doc-1", 10);
    });
  });

  // ---- action=cluster ----

  describe("POST action=cluster", () => {
    it("returns clusters with default numClusters", async () => {
      vi.mocked(clusterDocuments).mockReturnValue([{ id: "c-1", docs: [] }] as never);

      const res = await POST(makePost({ action: "cluster" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.clusters).toEqual([{ id: "c-1", docs: [] }]);
    });

    it("passes numClusters parameter", async () => {
      vi.mocked(clusterDocuments).mockReturnValue([] as never);

      await POST(makePost({ action: "cluster", numClusters: 5 }));
      expect(clusterDocuments).toHaveBeenCalledWith(5);
    });

    it("rejects numClusters < 2", async () => {
      const res = await POST(makePost({ action: "cluster", numClusters: 1 }));
      expect(res.status).toBe(400);
    });

    it("rejects numClusters > 20", async () => {
      const res = await POST(makePost({ action: "cluster", numClusters: 21 }));
      expect(res.status).toBe(400);
    });
  });

  // ---- action=discover ----

  describe("POST action=discover", () => {
    it("returns connections for a document", async () => {
      vi.mocked(discoverConnections).mockReturnValue({
        connections: [{ id: "conn-1" }],
      } as never);

      const res = await POST(makePost({ action: "discover", documentId: "doc-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connections).toEqual([{ id: "conn-1" }]);
    });
  });

  // ---- Error paths ----

  describe("POST error paths", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });

    it("returns 400 for missing action", async () => {
      const res = await POST(makePost({ query: "test" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "unknown-action" }));
      expect(res.status).toBe(400);
    });

    it("returns 500 when core function throws", async () => {
      vi.mocked(semanticSearch).mockImplementation(() => {
        throw new Error("Internal failure");
      });

      const res = await POST(makePost({ action: "search", query: "test" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});
