import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  estimateEffort: vi.fn(),
  estimateEffortBatch: vi.fn(),
  formatEstimateMarkdown: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
  validateModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/effort-estimate/route.js";
import { estimateEffort, estimateEffortBatch, formatEstimateMarkdown } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/effort-estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/effort-estimate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
  });

  describe("POST single idea", () => {
    it("calls estimateEffort and returns result", async () => {
      vi.mocked(estimateEffort).mockResolvedValue({ totalPersonWeeks: 4, phases: [] } as never);
      vi.mocked(formatEstimateMarkdown).mockReturnValue("# Estimate" as never);

      const res = await POST(
        makePost({
          ideas: [{ title: "Widget", description: "Build a widget" }],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ideas).toHaveLength(1);
      expect(data.markdowns).toHaveLength(1);
      expect(estimateEffort).toHaveBeenCalled();
    });
  });

  describe("POST multiple ideas (batch)", () => {
    it("calls estimateEffortBatch", async () => {
      vi.mocked(estimateEffortBatch).mockResolvedValue({
        ideas: [{ totalPersonWeeks: 2 }, { totalPersonWeeks: 3 }],
        totalEffort: 5,
      } as never);
      vi.mocked(formatEstimateMarkdown).mockReturnValue("# Estimate" as never);

      const res = await POST(
        makePost({
          ideas: [
            { title: "A", description: "desc A" },
            { title: "B", description: "desc B" },
          ],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ideas).toHaveLength(2);
      expect(estimateEffortBatch).toHaveBeenCalled();
    });
  });

  describe("POST with optional config params", () => {
    it("passes config to estimation", async () => {
      vi.mocked(estimateEffort).mockResolvedValue({ totalPersonWeeks: 6 } as never);
      vi.mocked(formatEstimateMarkdown).mockReturnValue("md" as never);

      const res = await POST(
        makePost({
          ideas: [{ title: "X", description: "desc" }],
          config: { teamSize: 5, existingStack: ["react"], complexityBias: "conservative" },
        })
      );
      expect(res.status).toBe(200);
      expect(estimateEffort).toHaveBeenCalledWith(
        expect.objectContaining({ title: "X" }),
        expect.objectContaining({ teamSize: 5 })
      );
    });
  });

  describe("POST invalid model", () => {
    it("returns validation error", async () => {
      vi.mocked(validateModel).mockReturnValue(
        new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
      );

      const res = await POST(
        makePost({
          ideas: [{ title: "X", description: "desc" }],
          model: "bad-model",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST empty ideas array", () => {
    it("calls estimateEffortBatch with empty array", async () => {
      vi.mocked(estimateEffortBatch).mockResolvedValue({ ideas: [], totalEffort: 0 } as never);
      vi.mocked(formatEstimateMarkdown).mockReturnValue("" as never);

      const res = await POST(makePost({ ideas: [] }));
      // The schema allows empty arrays; batch handles it
      expect(res.status).toBe(200);
    });
  });

  describe("POST idea with title >500 chars", () => {
    it("returns 400", async () => {
      const res = await POST(
        makePost({
          ideas: [{ title: "x".repeat(501), description: "desc" }],
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/effort-estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("POST non-JSON content-type", () => {
    it("returns 415", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );

      const res = await POST(makePost({ ideas: [{ title: "X", description: "d" }] }));
      expect(res.status).toBe(415);
    });
  });

  describe("POST internal error", () => {
    it("returns 500", async () => {
      vi.mocked(estimateEffort).mockRejectedValue(new Error("LLM timeout"));

      const res = await POST(makePost({ ideas: [{ title: "X", description: "d" }] }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Effort estimation failed");
    });
  });
});
