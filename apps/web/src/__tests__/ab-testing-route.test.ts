import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createABTest: vi.fn(),
  listABTests: vi.fn(),
  getABTest: vi.fn(),
  analyzeResults: vi.fn(),
  getTestSummary: vi.fn(),
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

import { GET, POST } from "../app/api/ab-testing/route.js";
import {
  createABTest,
  listABTests,
  getABTest,
  analyzeResults,
  getTestSummary,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/ab-testing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/ab-testing");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

const validTestBody = {
  name: "Button Color Test",
  hypothesis: "Red buttons convert better than blue",
  variants: [
    { name: "Control", description: "Blue button", config: { color: "blue" } },
    { name: "Treatment", description: "Red button", config: { color: "red" } },
  ],
  metrics: [{ name: "click_rate", type: "binary", primary: true, higherIsBetter: true }],
};

describe("API /api/ab-testing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- POST: create test ----

  describe("POST create test", () => {
    it("creates a test with valid body (201)", async () => {
      vi.mocked(createABTest).mockReturnValue({
        id: "test-1",
        name: "Button Color Test",
        status: "draft",
      } as never);
      const res = await POST(makePost(validTestBody));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("test-1");
      expect(body.name).toBe("Button Color Test");
    });

    it("creates test with optional config", async () => {
      vi.mocked(createABTest).mockReturnValue({ id: "test-2" } as never);
      const res = await POST(
        makePost({
          ...validTestBody,
          config: {
            significanceLevel: 0.05,
            minimumSampleSize: 100,
            powerTarget: 0.8,
          },
        })
      );
      expect(res.status).toBe(201);
    });

    it("returns 400 for missing name", async () => {
      const { name, ...noName } = validTestBody;
      const res = await POST(makePost(noName));
      expect(res.status).toBe(400);
    });

    it("returns 400 for single variant (min 2)", async () => {
      const res = await POST(
        makePost({
          ...validTestBody,
          variants: [{ name: "Only One", config: {} }],
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing metrics", async () => {
      const res = await POST(
        makePost({
          ...validTestBody,
          metrics: [],
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/ab-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns content-type error when validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makePost(validTestBody));
      expect(res.status).toBe(415);
    });

    it("returns 500 on internal error", async () => {
      vi.mocked(createABTest).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await POST(makePost(validTestBody));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("failed");
    });
  });

  // ---- GET ----

  describe("GET list all tests", () => {
    it("lists all tests", async () => {
      vi.mocked(listABTests).mockReturnValue([
        { id: "t1", name: "Test 1" },
        { id: "t2", name: "Test 2" },
      ] as never);
      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe("GET by id", () => {
    it("returns test with summary and analysis", async () => {
      vi.mocked(getABTest).mockReturnValue({ id: "t1", name: "Test" } as never);
      vi.mocked(getTestSummary).mockReturnValue({ totalSamples: 100 } as never);
      vi.mocked(analyzeResults).mockReturnValue({ significant: true } as never);
      const res = await GET(makeGet({ id: "t1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.test.id).toBe("t1");
      expect(body.summary.totalSamples).toBe(100);
      expect(body.analysis.significant).toBe(true);
    });

    it("returns 404 for non-existent test", async () => {
      vi.mocked(getABTest).mockReturnValue(undefined as never);
      const res = await GET(makeGet({ id: "nonexistent" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns test without analysis when not enough data", async () => {
      vi.mocked(getABTest).mockReturnValue({ id: "t1" } as never);
      vi.mocked(getTestSummary).mockReturnValue({} as never);
      vi.mocked(analyzeResults).mockImplementation(() => {
        throw new Error("Not enough data");
      });
      const res = await GET(makeGet({ id: "t1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.test.id).toBe("t1");
      expect(body.analysis).toBeUndefined();
    });
  });

  describe("GET error handling", () => {
    it("returns 500 on internal error", async () => {
      vi.mocked(listABTests).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await GET(makeGet());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Failed to retrieve");
    });
  });
});
