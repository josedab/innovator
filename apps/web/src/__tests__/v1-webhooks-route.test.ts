import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createWebhookSubscription: vi.fn(),
  listWebhookSubscriptions: vi.fn(),
  deleteWebhookSubscription: vi.fn(),
  toggleWebhookSubscription: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/api-auth", () => ({
  validateApiKey: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  scopedRateLimitKey: (scope: string, key: string) => `${scope}:${key}`,
  addRateLimitHeaders: vi.fn((headers: Record<string, string>) => headers),
}));

import { POST, GET, DELETE } from "../app/api/v1/webhooks/route.js";
import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  deleteWebhookSubscription,
} from "@innovator/core";
import { validateApiKey } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/v1/webhooks", init);
}

describe("API /api/v1/webhooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateApiKey).mockReturnValue({ valid: true, keyId: "key-0" });
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetAt: Date.now() + 60000,
    });
  });

  // ---- POST ----

  describe("POST", () => {
    it("creates webhook with valid URL and events (201)", async () => {
      const fakeSub = {
        id: "wh-1",
        url: "https://example.com/hook",
        events: ["pipeline.complete"],
      };
      vi.mocked(createWebhookSubscription).mockReturnValue(
        fakeSub as ReturnType<typeof createWebhookSubscription>
      );

      const res = await POST(
        makeRequest("POST", {
          url: "https://example.com/hook",
          events: ["pipeline.complete"],
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe("wh-1");
      expect(createWebhookSubscription).toHaveBeenCalledWith("key-0", "https://example.com/hook", [
        "pipeline.complete",
      ]);
    });

    it("returns 400 for invalid URL", async () => {
      const res = await POST(
        makeRequest("POST", { url: "not-a-url", events: ["pipeline.complete"] })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty events array", async () => {
      const res = await POST(makeRequest("POST", { url: "https://example.com/hook", events: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid event types", async () => {
      const res = await POST(
        makeRequest("POST", { url: "https://example.com/hook", events: ["unknown.event"] })
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when API key is missing", async () => {
      vi.mocked(validateApiKey).mockReturnValue({
        valid: false,
        error: "Missing API key. Provide via Authorization: Bearer <key> or X-API-Key header.",
      });

      const res = await POST(
        makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("API key");
    });

    it("returns 429 when rate limit exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: false,
        remaining: 0,
        limit: 10,
        resetAt: Date.now() + 60000,
      });

      const res = await POST(
        makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("Rate limit");
    });

    it("accepts all 6 valid event types", async () => {
      const validEvents = [
        "pipeline.complete",
        "investigation.complete",
        "usage.limit.warning",
        "usage.limit.reached",
        "idea.scored",
        "experiment.complete",
      ];
      const fakeSub = { id: "wh-2", url: "https://example.com", events: validEvents };
      vi.mocked(createWebhookSubscription).mockReturnValue(
        fakeSub as ReturnType<typeof createWebhookSubscription>
      );

      const res = await POST(
        makeRequest("POST", { url: "https://example.com", events: validEvents })
      );
      expect(res.status).toBe(201);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("rejects events array exceeding max of 10", async () => {
      const events = Array(11).fill("pipeline.complete");
      const res = await POST(makeRequest("POST", { url: "https://example.com/hook", events }));
      expect(res.status).toBe(400);
    });
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns subscriptions for authenticated key", async () => {
      const subs = [{ id: "wh-1", url: "https://example.com" }];
      vi.mocked(listWebhookSubscriptions).mockReturnValue(
        subs as ReturnType<typeof listWebhookSubscriptions>
      );

      const res = await GET(makeRequest("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(listWebhookSubscriptions).toHaveBeenCalledWith("key-0");
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(validateApiKey).mockReturnValue({ valid: false, error: "Missing API key." });
      const res = await GET(makeRequest("GET"));
      expect(res.status).toBe(401);
    });
  });

  // ---- DELETE ----

  describe("DELETE", () => {
    it("deletes webhook subscription (200)", async () => {
      vi.mocked(deleteWebhookSubscription).mockReturnValue(true);
      const res = await DELETE(makeRequest("DELETE", { id: "wh-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.deleted).toBe(true);
    });

    it("returns 404 for non-existent webhook", async () => {
      vi.mocked(deleteWebhookSubscription).mockReturnValue(false);
      const res = await DELETE(makeRequest("DELETE", { id: "nonexistent" }));
      expect(res.status).toBe(404);
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(validateApiKey).mockReturnValue({ valid: false, error: "Invalid API key" });
      const res = await DELETE(makeRequest("DELETE", { id: "wh-1" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/v1/webhooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing id field", async () => {
      const res = await DELETE(makeRequest("DELETE", {}));
      expect(res.status).toBe(400);
    });
  });
});
