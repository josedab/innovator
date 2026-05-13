import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getAuthorizationUrl: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET } from "../app/api/auth/login/route.js";
import { getAuthorizationUrl } from "@innovator/core";

function makeLoginRequest(returnTo?: string): Request {
  const url = new URL("http://localhost/api/auth/login");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return new Request(url.toString(), { method: "GET" });
}

describe("API /api/auth/login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects to OAuth authorization URL", async () => {
    vi.mocked(getAuthorizationUrl).mockReturnValue({
      url: "https://github.com/login/oauth/authorize?client_id=xxx",
      state: "random-state-123",
    });

    const res = await GET(makeLoginRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location");
    expect(location).toContain("github.com/login/oauth");
  });

  it("sets oauth_state cookie with httpOnly and short maxAge", async () => {
    vi.mocked(getAuthorizationUrl).mockReturnValue({
      url: "https://github.com/login/oauth/authorize",
      state: "state-abc",
    });

    const res = await GET(makeLoginRequest());
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oauth_state");
    expect(setCookie).toContain("state-abc");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("passes returnTo parameter to getAuthorizationUrl", async () => {
    vi.mocked(getAuthorizationUrl).mockReturnValue({
      url: "https://github.com/login/oauth/authorize",
      state: "s1",
    });

    await GET(makeLoginRequest("/dashboard"));
    expect(getAuthorizationUrl).toHaveBeenCalledWith("/dashboard");
  });

  it("defaults returnTo to /playground when not provided", async () => {
    vi.mocked(getAuthorizationUrl).mockReturnValue({
      url: "https://github.com/login/oauth/authorize",
      state: "s1",
    });

    await GET(makeLoginRequest());
    expect(getAuthorizationUrl).toHaveBeenCalledWith("/playground");
  });

  it("returns 500 when getAuthorizationUrl throws", async () => {
    vi.mocked(getAuthorizationUrl).mockImplementation(() => {
      throw new Error("Missing CLIENT_ID");
    });

    const res = await GET(makeLoginRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Missing CLIENT_ID");
  });

  it("returns generic error for non-Error exceptions", async () => {
    vi.mocked(getAuthorizationUrl).mockImplementation(() => {
      throw "unexpected";
    });

    const res = await GET(makeLoginRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Auth configuration error");
  });
});
