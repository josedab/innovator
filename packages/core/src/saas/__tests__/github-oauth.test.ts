import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getAuthorizationUrl,
  validateState,
  exchangeCodeForUser,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  getAuthenticatedUser,
  clearAuthData,
} from "../github-oauth.js";

describe("github-oauth", () => {
  beforeEach(() => {
    clearAuthData();
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GITHUB_REDIRECT_URI", "http://localhost:3000/api/auth/callback");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ---- getAuthorizationUrl ----

  describe("getAuthorizationUrl", () => {
    it("returns a valid authorization URL with state", () => {
      const { url, state } = getAuthorizationUrl();
      expect(url).toContain("https://github.com/login/oauth/authorize");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain(`state=${state}`);
      expect(state).toBeTruthy();
    });

    it("includes redirect_uri in URL", () => {
      const { url } = getAuthorizationUrl();
      expect(url).toContain("redirect_uri=");
    });

    it("includes scopes in URL", () => {
      const { url } = getAuthorizationUrl();
      expect(url).toContain("scope=read%3Auser+user%3Aemail");
    });

    it("generates unique states on each call", () => {
      const a = getAuthorizationUrl();
      const b = getAuthorizationUrl();
      expect(a.state).not.toBe(b.state);
    });

    it("stores returnTo in state when provided", () => {
      const { state } = getAuthorizationUrl("/dashboard");
      const oauthState = validateState(state);
      expect(oauthState).not.toBeNull();
      expect(oauthState!.returnTo).toBe("/dashboard");
    });

    it("throws when GITHUB_CLIENT_ID is not configured", () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "");
      expect(() => getAuthorizationUrl()).toThrow("GITHUB_CLIENT_ID not configured");
    });

    it("creates state with TTL (expiresAt is ~10 minutes in the future)", () => {
      const before = Date.now();
      const { state } = getAuthorizationUrl();
      const oauthState = validateState(state);
      expect(oauthState).not.toBeNull();
      const expiresAt = new Date(oauthState!.expiresAt).getTime();
      // Should expire roughly 10 minutes from now
      expect(expiresAt).toBeGreaterThan(before + 9 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(before + 11 * 60 * 1000);
    });
  });

  // ---- validateState ----

  describe("validateState", () => {
    it("validates a pending state and returns it", () => {
      const { state } = getAuthorizationUrl();
      const result = validateState(state);
      expect(result).not.toBeNull();
      expect(result!.state).toBe(state);
    });

    it("rejects missing/unknown state", () => {
      expect(validateState("nonexistent-state")).toBeNull();
    });

    it("rejects reused state (CSRF: single-use)", () => {
      const { state } = getAuthorizationUrl();
      validateState(state); // first use
      expect(validateState(state)).toBeNull(); // second use rejected
    });

    it("rejects expired state", () => {
      const { state } = getAuthorizationUrl();
      // Manually expire the state by mocking Date
      const future = new Date(Date.now() + 15 * 60 * 1000);
      vi.setSystemTime(future);
      expect(validateState(state)).toBeNull();
      vi.useRealTimers();
    });

    it("accepts state just before expiry", () => {
      vi.useFakeTimers();
      const now = new Date("2025-01-01T00:00:00Z");
      vi.setSystemTime(now);
      const { state } = getAuthorizationUrl();
      // Advance to 9 minutes (within 10-min TTL)
      vi.setSystemTime(new Date(now.getTime() + 9 * 60 * 1000));
      expect(validateState(state)).not.toBeNull();
      vi.useRealTimers();
    });

    it("returns null for empty string state", () => {
      expect(validateState("")).toBeNull();
    });
  });

  // ---- exchangeCodeForUser ----

  describe("exchangeCodeForUser", () => {
    it("exchanges code for user profile on success", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "gho_test123" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 12345,
              login: "testuser",
              name: "Test User",
              email: "test@example.com",
              avatar_url: "https://avatars.githubusercontent.com/u/12345",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const user = await exchangeCodeForUser("valid-code");
      expect(user.id).toBe(12345);
      expect(user.login).toBe("testuser");
      expect(user.name).toBe("Test User");
      expect(user.email).toBe("test@example.com");
      expect(user.avatarUrl).toBe("https://avatars.githubusercontent.com/u/12345");
      expect(user.accessToken).toBe("gho_test123");

      vi.unstubAllGlobals();
    });

    it("throws on token exchange HTTP failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await expect(exchangeCodeForUser("bad-code")).rejects.toThrow("Token exchange failed: 500");
      vi.unstubAllGlobals();
    });

    it("throws when GitHub returns an OAuth error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ error: "bad_verification_code" }),
        })
      );
      await expect(exchangeCodeForUser("invalid-code")).rejects.toThrow(
        "OAuth error: bad_verification_code"
      );
      vi.unstubAllGlobals();
    });

    it("throws when no access_token returned", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })
      );
      await expect(exchangeCodeForUser("code")).rejects.toThrow("OAuth error: no access token");
      vi.unstubAllGlobals();
    });

    it("throws on user fetch HTTP failure", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "token" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 403 });
      vi.stubGlobal("fetch", mockFetch);
      await expect(exchangeCodeForUser("code")).rejects.toThrow("User fetch failed: 403");
      vi.unstubAllGlobals();
    });

    it("throws on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await expect(exchangeCodeForUser("code")).rejects.toThrow("Network error");
      vi.unstubAllGlobals();
    });

    it("stores authenticated user for later retrieval", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 999,
              login: "stored",
              name: null,
              email: null,
              avatar_url: "https://avatars.githubusercontent.com/u/999",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);
      await exchangeCodeForUser("code");
      const user = getAuthenticatedUser(999);
      expect(user).not.toBeNull();
      expect(user!.login).toBe("stored");
      vi.unstubAllGlobals();
    });
  });

  // ---- Session token lifecycle ----

  describe("session token lifecycle", () => {
    it("creates a token with sess_ prefix", () => {
      const token = createSessionToken(123);
      expect(token).toMatch(/^sess_/);
    });

    it("creates unique tokens for same user", () => {
      const a = createSessionToken(123);
      const b = createSessionToken(123);
      expect(a).not.toBe(b);
    });

    it("validates token returns the associated user", async () => {
      // Register user first
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "tok" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 42,
              login: "user42",
              name: "User 42",
              email: null,
              avatar_url: "https://avatars.githubusercontent.com/u/42",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);
      await exchangeCodeForUser("code");

      const token = createSessionToken(42);
      const user = validateSessionToken(token);
      expect(user).not.toBeNull();
      expect(user!.login).toBe("user42");
      vi.unstubAllGlobals();
    });

    it("returns null for invalid token", () => {
      expect(validateSessionToken("sess_nonexistent")).toBeNull();
    });

    it("returns null for empty string token", () => {
      expect(validateSessionToken("")).toBeNull();
    });

    it("revokes a session token", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "tok" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 1,
              login: "u",
              name: null,
              email: null,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);
      await exchangeCodeForUser("code");

      const token = createSessionToken(1);
      expect(revokeSessionToken(token)).toBe(true);
      expect(validateSessionToken(token)).toBeNull();
      vi.unstubAllGlobals();
    });

    it("revokeSessionToken returns false for unknown token", () => {
      expect(revokeSessionToken("sess_unknown")).toBe(false);
    });
  });

  // ---- getAuthenticatedUser ----

  describe("getAuthenticatedUser", () => {
    it("returns null for unknown user ID", () => {
      expect(getAuthenticatedUser(99999)).toBeNull();
    });

    it("returns user after exchange", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "tok" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 777,
              login: "lucky",
              name: "Lucky",
              email: "lucky@example.com",
              avatar_url: "https://avatars.githubusercontent.com/u/777",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);
      await exchangeCodeForUser("code");
      const user = getAuthenticatedUser(777);
      expect(user).toMatchObject({ id: 777, login: "lucky" });
      vi.unstubAllGlobals();
    });
  });

  // ---- clearAuthData ----

  describe("clearAuthData", () => {
    it("clears all pending states", () => {
      const { state } = getAuthorizationUrl();
      clearAuthData();
      expect(validateState(state)).toBeNull();
    });

    it("clears all session tokens", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "tok" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 1,
              login: "u",
              name: null,
              email: null,
              avatar_url: "https://avatars.githubusercontent.com/u/1",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);
      await exchangeCodeForUser("code");
      const token = createSessionToken(1);
      clearAuthData();
      expect(validateSessionToken(token)).toBeNull();
      expect(getAuthenticatedUser(1)).toBeNull();
      vi.unstubAllGlobals();
    });
  });

  // ---- In-memory Map overflow ----

  describe("many pending states", () => {
    it("handles many concurrent pending states without error", () => {
      const states: string[] = [];
      for (let i = 0; i < 100; i++) {
        const { state } = getAuthorizationUrl();
        states.push(state);
      }
      // All states should be individually validatable
      for (const s of states) {
        expect(validateState(s)).not.toBeNull();
      }
      // After validation, all should be consumed
      for (const s of states) {
        expect(validateState(s)).toBeNull();
      }
    });
  });
});
