import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  validateState: vi.fn(),
  exchangeCodeForUser: vi.fn(),
  createSessionToken: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET } from "../app/api/auth/callback/route.js";
import { validateState, exchangeCodeForUser, createSessionToken } from "@innovator/core";

function makeCallbackRequest(params: {
  code?: string;
  state?: string;
  cookieState?: string;
}): Request {
  const url = new URL("http://localhost/api/auth/callback");
  if (params.code) url.searchParams.set("code", params.code);
  if (params.state) url.searchParams.set("state", params.state);

  const headers: Record<string, string> = {};
  if (params.cookieState) {
    headers["cookie"] = `oauth_state=${params.cookieState}`;
  }

  return new Request(url.toString(), { method: "GET", headers });
}

describe("API /api/auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- Missing parameters ----

  describe("missing parameters", () => {
    it("returns 400 when code is missing", async () => {
      const res = await GET(makeCallbackRequest({ state: "s1", cookieState: "s1" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing code or state");
    });

    it("returns 400 when state is missing", async () => {
      const res = await GET(makeCallbackRequest({ code: "c1", cookieState: "s1" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing code or state");
    });

    it("returns 400 when both code and state are missing", async () => {
      const res = await GET(makeCallbackRequest({}));
      expect(res.status).toBe(400);
    });
  });

  // ---- State cookie validation ----

  describe("state cookie validation", () => {
    it("returns 400 when state cookie is missing", async () => {
      const res = await GET(makeCallbackRequest({ code: "c1", state: "s1" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid state");
    });

    it("returns 400 when state cookie does not match state param", async () => {
      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "state-a",
          cookieState: "state-b",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid state");
    });
  });

  // ---- Expired/invalid state ----

  describe("expired or invalid state", () => {
    it("returns 400 when validateState returns null (expired)", async () => {
      vi.mocked(validateState).mockReturnValue(null);

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("expired or invalid");
    });
  });

  // ---- Valid callback flow ----

  describe("valid callback flow", () => {
    it("creates session and redirects on success", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockResolvedValue({
        id: 123,
        login: "testuser",
        name: "Test",
        email: null,
        avatarUrl: "https://avatars.githubusercontent.com/u/123",
        accessToken: "gho_abc",
      });
      vi.mocked(createSessionToken).mockReturnValue("sess_abc123");

      const res = await GET(
        makeCallbackRequest({
          code: "valid-code",
          state: "s1",
          cookieState: "s1",
        })
      );

      // Should redirect (3xx)
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);

      // createSessionToken should have been called with user ID
      expect(createSessionToken).toHaveBeenCalledWith(123);
    });

    it("redirects to returnTo when provided", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        returnTo: "/dashboard",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockResolvedValue({
        id: 1,
        login: "u",
        name: null,
        email: null,
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        accessToken: "tok",
      });
      vi.mocked(createSessionToken).mockReturnValue("sess_x");

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );

      expect(res.status).toBeGreaterThanOrEqual(300);
      // Response should redirect to /dashboard
      const location = res.headers.get("location");
      expect(location).toContain("/dashboard");
    });

    it("redirects to /playground when no returnTo", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockResolvedValue({
        id: 1,
        login: "u",
        name: null,
        email: null,
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        accessToken: "tok",
      });
      vi.mocked(createSessionToken).mockReturnValue("sess_x");

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );

      const location = res.headers.get("location");
      expect(location).toContain("/playground");
    });

    it("sets session_token cookie with secure attributes", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockResolvedValue({
        id: 1,
        login: "u",
        name: null,
        email: null,
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        accessToken: "tok",
      });
      vi.mocked(createSessionToken).mockReturnValue("sess_token");

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );

      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("session_token=sess_token");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie.toLowerCase()).toContain("samesite=lax");
      expect(setCookie).toContain("Path=/");
    });
  });

  // ---- exchangeCodeForUser failure ----

  describe("exchangeCodeForUser failure", () => {
    it("returns 500 when exchange fails", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockRejectedValue(new Error("Token exchange failed: 401"));

      const res = await GET(
        makeCallbackRequest({
          code: "invalid-code",
          state: "s1",
          cookieState: "s1",
        })
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Token exchange failed");
    });

    it("returns generic error message for non-Error exceptions", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockRejectedValue("string error");

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Authentication failed");
    });
  });

  // ---- returnTo URL validation (prevent open redirect) ----

  describe("returnTo URL validation", () => {
    it("returnTo is used as relative URL (same origin)", async () => {
      vi.mocked(validateState).mockReturnValue({
        state: "s1",
        returnTo: "/safe-page",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      vi.mocked(exchangeCodeForUser).mockResolvedValue({
        id: 1,
        login: "u",
        name: null,
        email: null,
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        accessToken: "tok",
      });
      vi.mocked(createSessionToken).mockReturnValue("sess_x");

      const res = await GET(
        makeCallbackRequest({
          code: "c1",
          state: "s1",
          cookieState: "s1",
        })
      );

      const location = res.headers.get("location") ?? "";
      // Should redirect to same origin
      expect(location).toContain("/safe-page");
      expect(new URL(location).hostname).toBe("localhost");
    });
  });
});
