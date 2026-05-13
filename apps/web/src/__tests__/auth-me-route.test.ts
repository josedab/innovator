import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  validateSessionToken: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET } from "../app/api/auth/me/route.js";
import { validateSessionToken } from "@innovator/core";

function makeMeRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/auth/me", { method: "GET", headers });
}

describe("API /api/auth/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns authenticated: false when no cookie is present", async () => {
    const res = await GET(makeMeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ authenticated: false });
  });

  it("returns authenticated: false when cookie has no session_token", async () => {
    const res = await GET(makeMeRequest("other_cookie=value"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ authenticated: false });
  });

  it("returns authenticated: false when session token is invalid", async () => {
    vi.mocked(validateSessionToken).mockReturnValue(null);

    const res = await GET(makeMeRequest("session_token=invalid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ authenticated: false });
    expect(validateSessionToken).toHaveBeenCalledWith("invalid-token");
  });

  it("returns user data when session token is valid", async () => {
    vi.mocked(validateSessionToken).mockReturnValue({
      id: 42,
      login: "testuser",
      name: "Test User",
      email: "test@example.com",
      avatarUrl: "https://avatars.githubusercontent.com/u/42",
      accessToken: "gho_secret",
    });

    const res = await GET(makeMeRequest("session_token=valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      authenticated: true,
      user: {
        id: 42,
        login: "testuser",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: "https://avatars.githubusercontent.com/u/42",
      },
    });
  });

  it("does not expose accessToken in response", async () => {
    vi.mocked(validateSessionToken).mockReturnValue({
      id: 1,
      login: "u",
      name: null,
      email: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      accessToken: "gho_secret",
    });

    const res = await GET(makeMeRequest("session_token=tok"));
    const body = await res.json();
    expect(body.user.accessToken).toBeUndefined();
  });

  it("handles null name and email in user data", async () => {
    vi.mocked(validateSessionToken).mockReturnValue({
      id: 1,
      login: "u",
      name: null,
      email: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      accessToken: "tok",
    });

    const res = await GET(makeMeRequest("session_token=tok"));
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.name).toBeNull();
    expect(body.user.email).toBeNull();
  });

  it("extracts session_token from multiple cookies", async () => {
    vi.mocked(validateSessionToken).mockReturnValue({
      id: 1,
      login: "u",
      name: null,
      email: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      accessToken: "tok",
    });

    const res = await GET(makeMeRequest("other=val; session_token=my-token; another=x"));
    expect(validateSessionToken).toHaveBeenCalledWith("my-token");
    const body = await res.json();
    expect(body.authenticated).toBe(true);
  });
});
