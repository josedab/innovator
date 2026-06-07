import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMeter = {
  getUsageSummary: vi.fn(),
  checkQuota: vi.fn(),
  setAlert: vi.fn(),
  checkAlerts: vi.fn(),
  listKeys: vi.fn(),
};

vi.mock("@innovator/core", async () => {
  const { z } = await import("zod");
  return {
    getApiMeter: vi.fn(() => mockMeter),
    getTierForKey: vi.fn(),
    setKeyTier: vi.fn(),
    removeKeyTier: vi.fn(),
    listKeyTiers: vi.fn(),
    AlertConfigSchema: z.object({
      keyId: z.string(),
      thresholdPercent: z.number(),
      enabled: z.boolean(),
    }),
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/proxy", () => ({
  setMeteringKeyTier: vi.fn(),
  getMeteringLog: vi.fn(() => []),
}));

import { POST, GET } from "../app/api/metering/route.js";
import { getTierForKey, setKeyTier, removeKeyTier, listKeyTiers } from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/metering", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/metering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    mockMeter.listKeys.mockReturnValue([]);
    vi.mocked(listKeyTiers).mockReturnValue({} as never);
  });

  // ---- POST: usage ----

  describe("POST usage", () => {
    it("returns usage summary for key", async () => {
      mockMeter.getUsageSummary.mockReturnValue({ total: 42 });
      const res = await POST(makePost({ action: "usage", keyId: "k1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(42);
    });
  });

  // ---- POST: quota ----

  describe("POST quota", () => {
    it("returns quota info for key", async () => {
      mockMeter.checkQuota.mockReturnValue({ allowed: true, remaining: 100 });
      const res = await POST(makePost({ action: "quota", keyId: "k1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.allowed).toBe(true);
      expect(body.remaining).toBe(100);
    });
  });

  // ---- POST: set-tier ----

  describe("POST set-tier", () => {
    it("sets tier for a key", async () => {
      vi.mocked(getTierForKey).mockReturnValue("pro" as never);
      const res = await POST(makePost({ action: "set-tier", keyId: "k1", tier: "pro" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.keyId).toBe("k1");
      expect(setKeyTier).toHaveBeenCalledWith("k1", "pro");
    });

    it("rejects invalid tier name", async () => {
      const res = await POST(makePost({ action: "set-tier", keyId: "k1", tier: "mega" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: remove-tier ----

  describe("POST remove-tier", () => {
    it("removes tier and resets to free", async () => {
      const res = await POST(makePost({ action: "remove-tier", keyId: "k1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tier).toBe("free");
      expect(removeKeyTier).toHaveBeenCalledWith("k1");
    });
  });

  // ---- POST: list-keys ----

  describe("POST list-keys", () => {
    it("lists all keys and tiers", async () => {
      mockMeter.listKeys.mockReturnValue(["k1", "k2"]);
      vi.mocked(listKeyTiers).mockReturnValue({ k1: "pro" } as never);
      const res = await POST(makePost({ action: "list-keys" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keys).toEqual(["k1", "k2"]);
      expect(body.tiers).toEqual({ k1: "pro" });
    });
  });

  // ---- POST: set-alert ----

  describe("POST set-alert", () => {
    it("sets an alert with valid threshold", async () => {
      const res = await POST(
        makePost({ action: "set-alert", keyId: "k1", thresholdPercent: 80, enabled: true })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.alert.thresholdPercent).toBe(80);
      expect(mockMeter.setAlert).toHaveBeenCalled();
    });

    it("rejects threshold below 1", async () => {
      const res = await POST(
        makePost({ action: "set-alert", keyId: "k1", thresholdPercent: 0, enabled: true })
      );
      expect(res.status).toBe(400);
    });

    it("rejects threshold above 100", async () => {
      const res = await POST(
        makePost({ action: "set-alert", keyId: "k1", thresholdPercent: 101, enabled: true })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: check-alerts ----

  describe("POST check-alerts", () => {
    it("checks alerts for a key", async () => {
      mockMeter.checkAlerts.mockReturnValue({ triggered: false });
      const res = await POST(makePost({ action: "check-alerts", keyId: "k1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alert).toEqual({ triggered: false });
    });
  });

  // ---- POST: internal error ----

  describe("POST internal error", () => {
    it("returns 500 on unexpected error", async () => {
      mockMeter.getUsageSummary.mockImplementation(() => {
        throw new Error("DB failure");
      });
      const res = await POST(makePost({ action: "usage", keyId: "k1" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Internal server error");
    });
  });

  // ---- POST: validation errors ----

  describe("POST validation errors", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "delete-key", keyId: "k1" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing keyId", async () => {
      const res = await POST(makePost({ action: "usage" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 415 when content-type validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makePost({ action: "usage", keyId: "k1" }));
      expect(res.status).toBe(415);
    });
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns keys, tiers, summaries, and log size", async () => {
      mockMeter.listKeys.mockReturnValue(["k1"]);
      vi.mocked(listKeyTiers).mockReturnValue({ k1: "free" } as never);
      mockMeter.getUsageSummary.mockReturnValue({ total: 10 });
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keys).toEqual(["k1"]);
      expect(body.summaries).toEqual([{ total: 10 }]);
      expect(body.middlewareLogSize).toBe(0);
    });
  });
});
