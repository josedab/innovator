import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", async () => {
  const { z } = await import("zod");
  return {
    runMonteCarloSimulation: vi.fn(),
    MonteCarloInputSchema: z.object({
      marketSizeMin: z.number().min(0),
      marketSizeMax: z.number().min(0),
      implementationCostMin: z.number().min(0),
      implementationCostMax: z.number().min(0),
      adoptionRateMin: z.number().min(0).max(1),
      adoptionRateMax: z.number().min(0).max(1),
      revenuePerUserMin: z.number().min(0).optional(),
      revenuePerUserMax: z.number().min(0).optional(),
      timeToMarketMonthsMin: z.number().min(1).max(36).optional(),
      timeToMarketMonthsMax: z.number().min(1).max(36).optional(),
    }),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
  CACHE_HEADERS: { "Cache-Control": "no-store" },
}));

import { POST } from "../app/api/monte-carlo/route.js";
import { runMonteCarloSimulation } from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

const validInput = {
  marketSizeMin: 1000,
  marketSizeMax: 10000,
  implementationCostMin: 5000,
  implementationCostMax: 20000,
  adoptionRateMin: 0.1,
  adoptionRateMax: 0.5,
};

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/monte-carlo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/monte-carlo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  describe("POST valid simulation", () => {
    it("returns result with default iterations", async () => {
      vi.mocked(runMonteCarloSimulation).mockReturnValue({
        ideaTitle: "Widget",
        iterations: 10000,
        roiDistribution: { mean: 2.5 },
      } as never);

      const res = await POST(makePost({ ideaTitle: "Widget", input: validInput }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.iterations).toBe(10000);
      expect(data.roiDistribution).toBeDefined();
    });
  });

  describe("POST with iterations=100 (minimum)", () => {
    it("returns valid result", async () => {
      vi.mocked(runMonteCarloSimulation).mockReturnValue({ iterations: 100 } as never);

      const res = await POST(makePost({ ideaTitle: "Widget", input: validInput, iterations: 100 }));
      expect(res.status).toBe(200);
      expect(runMonteCarloSimulation).toHaveBeenCalledWith("Widget", validInput, 100);
    });
  });

  describe("POST with iterations=100001 (exceeds max)", () => {
    it("returns Zod validation error", async () => {
      const res = await POST(
        makePost({ ideaTitle: "Widget", input: validInput, iterations: 100001 })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid request");
    });
  });

  describe("POST missing ideaTitle", () => {
    it("returns 400", async () => {
      const res = await POST(makePost({ input: validInput }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST invalid input shape", () => {
    it("returns 400 with details", async () => {
      const res = await POST(
        makePost({ ideaTitle: "Widget", input: { marketSizeMin: -1, marketSizeMax: 100 } })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.details).toBeDefined();
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/monte-carlo", {
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

      const res = await POST(makePost({ ideaTitle: "Widget", input: validInput }));
      expect(res.status).toBe(415);
    });
  });

  describe("POST internal error", () => {
    it("returns 500", async () => {
      vi.mocked(runMonteCarloSimulation).mockImplementation(() => {
        throw new Error("simulation crash");
      });

      const res = await POST(makePost({ ideaTitle: "Widget", input: validInput }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Monte Carlo simulation failed");
    });
  });
});
