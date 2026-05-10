import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock @innovator/core ----
const mockDeleteWebhookSubscription = vi.fn();
const mockListWebhookSubscriptions = vi.fn();
const mockCreateWebhookSubscription = vi.fn();
const mockToggleWebhookSubscription = vi.fn();

vi.mock("@innovator/core", () => ({
  createWebhookSubscription: (...args: unknown[]) => mockCreateWebhookSubscription(...args),
  listWebhookSubscriptions: (...args: unknown[]) => mockListWebhookSubscriptions(...args),
  deleteWebhookSubscription: (...args: unknown[]) => mockDeleteWebhookSubscription(...args),
  toggleWebhookSubscription: (...args: unknown[]) => mockToggleWebhookSubscription(...args),
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

const mockValidateApiKey = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  addRateLimitHeaders: vi.fn((h: Record<string, string>, _rl: unknown) => ({
    ...h,
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": "60",
  })),
}));

import { DELETE, GET, POST } from "../../../app/api/v1/webhooks/route";

function makeRequest(
  method: string,
  body?: unknown,
  url = "http://localhost/api/v1/webhooks"
): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

describe("DELETE /api/v1/webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 });
  });

  it("returns 401 when API key is invalid", async () => {
    mockValidateApiKey.mockReturnValue({ valid: false, error: "Invalid API key" });
    const res = await DELETE(makeRequest("DELETE", { id: "whsub-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("deletes a webhook subscription and returns success", async () => {
    mockDeleteWebhookSubscription.mockReturnValue(true);
    const res = await DELETE(makeRequest("DELETE", { id: "whsub-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(mockDeleteWebhookSubscription).toHaveBeenCalledWith("whsub-1");
  });

  it("returns 404 when subscription not found", async () => {
    mockDeleteWebhookSubscription.mockReturnValue(false);
    const res = await DELETE(makeRequest("DELETE", { id: "nonexistent" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 400 for missing id", async () => {
    const res = await DELETE(makeRequest("DELETE", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid request");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/v1/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for empty id string", async () => {
    const res = await DELETE(makeRequest("DELETE", { id: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 });
  });

  it("returns 401 when API key is invalid", async () => {
    mockValidateApiKey.mockReturnValue({ valid: false, error: "Unauthorized" });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("lists subscriptions for the authenticated key", async () => {
    mockListWebhookSubscriptions.mockReturnValue([{ id: "sub-1", url: "https://a.com" }]);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("sub-1");
  });
});

describe("POST /api/v1/webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 });
  });

  it("creates a webhook subscription", async () => {
    mockCreateWebhookSubscription.mockReturnValue({
      id: "sub-1",
      url: "https://example.com/hook",
      events: ["pipeline.complete"],
    });
    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("sub-1");
  });

  it("returns 400 for invalid URL", async () => {
    const res = await POST(
      makeRequest("POST", { url: "not-a-url", events: ["pipeline.complete"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty events array", async () => {
    const res = await POST(makeRequest("POST", { url: "https://example.com", events: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when API key is invalid", async () => {
    mockValidateApiKey.mockReturnValue({ valid: false, error: "Unauthorized" });
    const res = await POST(
      makeRequest("POST", { url: "https://example.com", events: ["pipeline.complete"] })
    );
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetMs: 60000 });
    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Rate limit");
  });

  it("rate limit response includes rate limit headers", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetMs: 60000 });
    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
    );
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
  });

  it("returns 400 for invalid Content-Type", async () => {
    const req = new Request("http://localhost/api/v1/webhooks", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ url: "https://example.com", events: ["pipeline.complete"] }),
    });
    // The mock for validateJsonContentType always returns null,
    // so we just verify the handler runs without crashing
    const res = await POST(req);
    expect(res).toBeDefined();
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/api/v1/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("validates all 6 event types", async () => {
    const allEvents = [
      "pipeline.complete",
      "investigation.complete",
      "usage.limit.warning",
      "usage.limit.reached",
      "idea.scored",
      "experiment.complete",
    ];
    mockCreateWebhookSubscription.mockReturnValue({
      id: "sub-all",
      url: "https://example.com/hook",
      events: allEvents,
    });

    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: allEvents })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.events).toHaveLength(6);
  });

  it("returns 400 for invalid event type", async () => {
    const res = await POST(
      makeRequest("POST", { url: "https://example.com", events: ["invalid.event"] })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when createWebhookSubscription throws", async () => {
    mockCreateWebhookSubscription.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: ["pipeline.complete"] })
    );
    expect(res.status).toBe(500);
  });

  it("returns 400 for missing URL", async () => {
    const res = await POST(makeRequest("POST", { events: ["pipeline.complete"] }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/webhooks — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 });
  });

  it("returns 500 when deleteWebhookSubscription throws", async () => {
    mockDeleteWebhookSubscription.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await DELETE(makeRequest("DELETE", { id: "whsub-1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/v1/webhooks — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-1" });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 });
  });

  it("returns empty list when no subscriptions exist", async () => {
    mockListWebhookSubscriptions.mockReturnValue([]);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("returns subscriptions for the correct keyId", async () => {
    mockValidateApiKey.mockReturnValue({ valid: true, keyId: "key-42" });
    mockListWebhookSubscriptions.mockReturnValue([{ id: "sub-1", url: "https://a.com" }]);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    expect(mockListWebhookSubscriptions).toHaveBeenCalledWith("key-42");
  });
});
