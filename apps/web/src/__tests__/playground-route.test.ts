import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createPlaygroundSession: vi.fn(),
  getPlaygroundSession: vi.fn(),
  getSessionByShareId: vi.fn(),
  updatePlaygroundSession: vi.fn(),
  checkUsageLimit: vi.fn(),
  getUserSessions: vi.fn(),
  getUserUsage: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/playground/route.js";
import {
  createPlaygroundSession,
  getPlaygroundSession,
  getSessionByShareId,
  checkUsageLimit,
  getUserSessions,
  getUserUsage,
} from "@innovator/core";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/playground", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/playground");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

describe("API /api/playground", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkUsageLimit).mockReturnValue({ allowed: true, remaining: 9, limit: 10 } as never);
  });

  // --- POST: create session ---

  describe("POST create", () => {
    it("creates session and returns 201", async () => {
      vi.mocked(createPlaygroundSession).mockReturnValue({
        id: "s1",
        shareId: "share-abc",
        subject: "AI tools",
      } as never);
      const res = await POST(makePost({ action: "create", subject: "AI tools" }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.id).toBe("s1");
      expect(body.shareUrl).toContain("share-abc");
      expect(body.remaining).toBe(8);
    });

    it("returns 429 when usage limit exceeded", async () => {
      vi.mocked(checkUsageLimit).mockReturnValue({
        allowed: false,
        remaining: 0,
        limit: 10,
        reason: "Daily limit reached",
      } as never);
      const res = await POST(makePost({ action: "create", subject: "test" }));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("limit");
    });

    it("returns 400 for missing subject", async () => {
      const res = await POST(makePost({ action: "create" }));
      expect(res.status).toBe(400);
    });
  });

  // --- POST: get session ---

  describe("POST get", () => {
    it("gets session by sessionId", async () => {
      vi.mocked(getPlaygroundSession).mockReturnValue({ id: "s1" } as never);
      const res = await POST(makePost({ action: "get", sessionId: "s1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe("s1");
    });

    it("gets session by shareId", async () => {
      vi.mocked(getSessionByShareId).mockReturnValue({ id: "s1" } as never);
      const res = await POST(makePost({ action: "get", shareId: "share-abc" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent sessionId", async () => {
      vi.mocked(getPlaygroundSession).mockReturnValue(null as never);
      const res = await POST(makePost({ action: "get", sessionId: "bad-id" }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for nonexistent shareId", async () => {
      vi.mocked(getSessionByShareId).mockReturnValue(null as never);
      const res = await POST(makePost({ action: "get", shareId: "bad-share" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 when neither sessionId nor shareId provided", async () => {
      const res = await POST(makePost({ action: "get" }));
      expect(res.status).toBe(400);
    });
  });

  // --- POST: usage ---

  describe("POST usage", () => {
    it("returns usage and limit info", async () => {
      vi.mocked(getUserUsage).mockReturnValue({ total: 5 } as never);
      vi.mocked(checkUsageLimit).mockReturnValue({
        allowed: true,
        remaining: 5,
        limit: 10,
      } as never);
      const res = await POST(makePost({ action: "usage", userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.usage).toEqual({ total: 5 });
      expect(body.limit).toMatchObject({ allowed: true, remaining: 5, limit: 10 });
    });
  });

  // --- POST: error paths ---

  describe("POST error paths", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "delete" }));
      expect(res.status).toBe(400);
    });
  });

  // --- GET endpoints ---

  describe("GET", () => {
    it("retrieves session by share param", async () => {
      vi.mocked(getSessionByShareId).mockReturnValue({ id: "s1" } as never);
      const res = await GET(makeGet({ share: "share-abc" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent share", async () => {
      vi.mocked(getSessionByShareId).mockReturnValue(null as never);
      const res = await GET(makeGet({ share: "bad" }));
      expect(res.status).toBe(404);
    });

    it("retrieves session by id param", async () => {
      vi.mocked(getPlaygroundSession).mockReturnValue({ id: "s1" } as never);
      const res = await GET(makeGet({ id: "s1" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent session id", async () => {
      vi.mocked(getPlaygroundSession).mockReturnValue(null as never);
      const res = await GET(makeGet({ id: "bad" }));
      expect(res.status).toBe(404);
    });

    it("retrieves user sessions and usage", async () => {
      vi.mocked(getUserSessions).mockReturnValue([{ id: "s1" }] as never);
      vi.mocked(getUserUsage).mockReturnValue({ total: 3 } as never);
      vi.mocked(checkUsageLimit).mockReturnValue({
        allowed: true,
        remaining: 7,
        limit: 10,
      } as never);
      const res = await GET(makeGet({ user: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.usage).toEqual({ total: 3 });
      expect(body.limit).toMatchObject({ allowed: true, remaining: 7, limit: 10 });
    });

    it("returns 400 when no params provided", async () => {
      const res = await GET(makeGet({}));
      expect(res.status).toBe(400);
    });
  });
});
