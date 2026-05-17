import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getSharedInvestigation: vi.fn(),
  forkInvestigation: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/share/[slug]/route.js";
import { getSharedInvestigation, forkInvestigation } from "@innovator/core";

function makeRequest(method: string): Request {
  return new Request(`http://localhost/api/share/test-slug`, { method });
}

function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

const fakeShared = {
  slug: "test-slug",
  investigation: {
    summary: "Test investigation",
    keyAspects: [],
    currentState: "Active",
    challenges: [],
    opportunities: [],
  },
  angleResults: [{ angleId: "scamper", angleName: "SCAMPER", ideas: [], reasoning: "test" }],
  createdAt: "2025-01-01T00:00:00Z",
};

describe("API /api/share/[slug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns 200 with investigation data for valid slug", async () => {
      vi.mocked(getSharedInvestigation).mockReturnValue(fakeShared as any);
      const res = await GET(makeRequest("GET"), makeParams("test-slug"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slug).toBe("test-slug");
      expect(body.investigation.summary).toBe("Test investigation");
      expect(Array.isArray(body.angleResults)).toBe(true);
    });

    it("returns 404 for nonexistent slug", async () => {
      vi.mocked(getSharedInvestigation).mockReturnValue(undefined);
      const res = await GET(makeRequest("GET"), makeParams("nonexistent"));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 500 when retrieval throws", async () => {
      vi.mocked(getSharedInvestigation).mockImplementation(() => {
        throw new Error("db error");
      });
      const res = await GET(makeRequest("GET"), makeParams("test-slug"));
      expect(res.status).toBe(500);
    });

    it("handles slug with special characters", async () => {
      vi.mocked(getSharedInvestigation).mockReturnValue(undefined);
      const res = await GET(makeRequest("GET"), makeParams("slug-with-special_chars.123"));
      expect(res.status).toBe(404);
    });
  });

  // ---- POST (fork) ----

  describe("POST", () => {
    it("forks investigation and returns 201", async () => {
      const forkResult = { newSessionId: "session-abc123", forkedFrom: "test-slug" };

      vi.mocked(forkInvestigation).mockReturnValue(forkResult as any);

      const res = await POST(makeRequest("POST"), makeParams("test-slug"));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.newSessionId).toBe("session-abc123");
    });

    it("returns 404 when forking nonexistent slug", async () => {
      vi.mocked(forkInvestigation).mockReturnValue(undefined);
      const res = await POST(makeRequest("POST"), makeParams("nonexistent"));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 500 when fork throws", async () => {
      vi.mocked(forkInvestigation).mockImplementation(() => {
        throw new Error("fork error");
      });
      const res = await POST(makeRequest("POST"), makeParams("test-slug"));
      expect(res.status).toBe(500);
    });
  });
});
