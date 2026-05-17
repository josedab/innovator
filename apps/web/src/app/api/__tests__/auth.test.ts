/**
 * Tests for the /api/auth routes (callback, logout, me).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCore = vi.hoisted(() => ({
  validateState: vi.fn(),
  exchangeCodeForUser: vi.fn(),
  createSessionToken: vi.fn(),
  validateSessionToken: vi.fn(),
  revokeSessionToken: vi.fn(),
  getAuthorizationUrl: vi.fn(),
  clearAuthData: vi.fn(),
}));

vi.mock("@innovator/core", () => mockCore);

vi.mock("../../../../lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET as callbackGET } from "../auth/callback/route";
import { POST as logoutPOST } from "../auth/logout/route";
import { GET as meGET } from "../auth/me/route";

// ---- Helpers ----

function createRequest(
  url: string,
  options?: { method?: string; headers?: Record<string, string> }
): Request {
  return new Request(url, {
    method: options?.method ?? "GET",
    headers: options?.headers ?? {},
  });
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/auth", () => {
  describe("GET /api/auth/callback", () => {
    it("returns 400 when code is missing", async () => {
      const req = createRequest("http://localhost:3000/api/auth/callback?state=abc");
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing");
    });

    it("returns 400 when state is missing", async () => {
      const req = createRequest("http://localhost:3000/api/auth/callback?code=abc");
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing");
    });

    it("returns 400 when state does not match cookie", async () => {
      const req = createRequest("http://localhost:3000/api/auth/callback?code=abc&state=xyz", {
        headers: { cookie: "oauth_state=different" },
      });
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid state");
    });

    it("returns 400 when state is expired", async () => {
      mockCore.validateState.mockReturnValue(null);
      const req = createRequest(
        "http://localhost:3000/api/auth/callback?code=abc&state=expired-state",
        { headers: { cookie: "oauth_state=expired-state" } }
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("expired");
    });

    it("sets session cookie on valid code exchange", async () => {
      mockCore.validateState.mockReturnValue({
        state: "valid-state",
        returnTo: "/dashboard",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      mockCore.exchangeCodeForUser.mockResolvedValue({
        id: 12345,
        login: "testuser",
        name: "Test",
        email: "test@test.com",
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        accessToken: "token",
      });
      mockCore.createSessionToken.mockReturnValue("sess_test123");

      const req = createRequest(
        "http://localhost:3000/api/auth/callback?code=valid-code&state=valid-state",
        { headers: { cookie: "oauth_state=valid-state" } }
      );
      const res = await callbackGET(req);

      // Should redirect
      expect(res.status).toBe(307);
      expect(mockCore.exchangeCodeForUser).toHaveBeenCalledWith("valid-code");
      expect(mockCore.createSessionToken).toHaveBeenCalledWith(12345);
    });

    it("returns 500 when exchangeCodeForUser throws", async () => {
      mockCore.validateState.mockReturnValue({
        state: "valid-state",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      mockCore.exchangeCodeForUser.mockRejectedValue(new Error("GitHub API unreachable"));

      const req = createRequest(
        "http://localhost:3000/api/auth/callback?code=bad&state=valid-state",
        { headers: { cookie: "oauth_state=valid-state" } }
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("GitHub API unreachable");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears session and returns success", async () => {
      const req = createRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { cookie: "session_token=sess_abc123" },
      });
      const res = await logoutPOST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockCore.revokeSessionToken).toHaveBeenCalledWith("sess_abc123");
    });

    it("returns success even without session token", async () => {
      const req = createRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
      });
      const res = await logoutPOST(req);

      expect(res.status).toBe(200);
      expect(mockCore.revokeSessionToken).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns authenticated user with valid token", async () => {
      mockCore.validateSessionToken.mockReturnValue({
        id: 42,
        login: "alice",
        name: "Alice",
        email: "alice@test.com",
        avatarUrl: "https://avatars.githubusercontent.com/u/42",
        accessToken: "token",
      });

      const req = createRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: "session_token=sess_valid" },
      });
      const res = await meGET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.user.id).toBe(42);
      expect(body.user.login).toBe("alice");
      expect(body.user.name).toBe("Alice");
      expect(body.user.email).toBe("alice@test.com");
      expect(body.user.avatarUrl).toContain("avatars.githubusercontent.com");
    });

    it("returns unauthenticated when no token", async () => {
      const req = createRequest("http://localhost:3000/api/auth/me");
      const res = await meGET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("returns unauthenticated when token is invalid", async () => {
      mockCore.validateSessionToken.mockReturnValue(null);

      const req = createRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: "session_token=sess_invalid" },
      });
      const res = await meGET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });
  });
});
