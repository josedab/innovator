import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockManager } = vi.hoisted(() => ({
  mockManager: {
    registerWebhook: vi.fn(),
    unregisterWebhook: vi.fn(),
    listWebhooks: vi.fn(),
    getDeliveryLog: vi.fn(),
    getDeadLetters: vi.fn(),
  },
}));

vi.mock("@innovator/core", async () => {
  const { z } = await import("zod");
  const EventTypeSchema = z.enum([
    "investigation.started",
    "investigation.completed",
    "innovation.started",
    "innovation.completed",
    "pipeline.started",
    "pipeline.completed",
    "idea.created",
  ]);
  class MockWebhookManager {
    registerWebhook = mockManager.registerWebhook;
    unregisterWebhook = mockManager.unregisterWebhook;
    listWebhooks = mockManager.listWebhooks;
    getDeliveryLog = mockManager.getDeliveryLog;
    getDeadLetters = mockManager.getDeadLetters;
  }
  return {
    WebhookManager: MockWebhookManager,
    EventTypeSchema,
    listWebhookTemplates: vi.fn(() => [{ name: "default" }]),
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

import { POST } from "../app/api/webhooks/route.js";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/webhooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- register ----

  describe("POST register", () => {
    it("registers a webhook with secret and returns it", async () => {
      mockManager.registerWebhook.mockReturnValue({ id: "wh-1", url: "https://example.com/hook" });
      const res = await POST(
        makePost({
          action: "register",
          url: "https://example.com/hook",
          events: ["investigation.completed"],
          secret: "a-very-long-secret-16",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.webhook).toEqual({ id: "wh-1", url: "https://example.com/hook" });
      expect(mockManager.registerWebhook).toHaveBeenCalledWith({
        url: "https://example.com/hook",
        events: ["investigation.completed"],
        secret: "a-very-long-secret-16",
        active: true,
        description: undefined,
      });
    });

    it("rejects invalid URL", async () => {
      const res = await POST(
        makePost({
          action: "register",
          url: "not-a-url",
          events: ["investigation.completed"],
          secret: "a-very-long-secret-16",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects short secret (less than 16 chars)", async () => {
      const res = await POST(
        makePost({
          action: "register",
          url: "https://example.com/hook",
          events: ["investigation.completed"],
          secret: "short",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty events array", async () => {
      const res = await POST(
        makePost({
          action: "register",
          url: "https://example.com/hook",
          events: [],
          secret: "a-very-long-secret-16",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- unregister ----

  describe("POST unregister", () => {
    it("unregisters a webhook", async () => {
      mockManager.unregisterWebhook.mockReturnValue(true);
      const res = await POST(makePost({ action: "unregister", id: "wh-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe(true);
    });

    it("returns false for nonexistent webhook", async () => {
      mockManager.unregisterWebhook.mockReturnValue(false);
      const res = await POST(makePost({ action: "unregister", id: "bad-id" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.removed).toBe(false);
    });
  });

  // ---- list ----

  describe("POST list", () => {
    it("lists all webhooks", async () => {
      mockManager.listWebhooks.mockReturnValue([{ id: "wh-1" }]);
      const res = await POST(makePost({ action: "list" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.webhooks).toEqual([{ id: "wh-1" }]);
    });
  });

  // ---- templates ----

  describe("POST templates", () => {
    it("returns webhook templates", async () => {
      const res = await POST(makePost({ action: "templates" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates).toEqual([{ name: "default" }]);
    });
  });

  // ---- delivery-log ----

  describe("POST delivery-log", () => {
    it("returns delivery log and dead letters", async () => {
      mockManager.getDeliveryLog.mockReturnValue([{ id: "d1" }]);
      mockManager.getDeadLetters.mockReturnValue([]);
      const res = await POST(makePost({ action: "delivery-log" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.log).toEqual([{ id: "d1" }]);
      expect(body.deadLetters).toEqual([]);
    });
  });

  // ---- error paths ----

  describe("POST error paths", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "delete" }));
      expect(res.status).toBe(400);
    });

    it("returns 415 when content-type validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makePost({ action: "list" }));
      expect(res.status).toBe(415);
    });
  });
});
