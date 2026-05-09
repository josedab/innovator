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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetMs: 0 }),
  addRateLimitHeaders: vi.fn((h: Record<string, string>) => h),
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
});
