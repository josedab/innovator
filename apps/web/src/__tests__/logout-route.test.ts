import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  revokeSessionToken: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/auth/logout/route.js";
import { revokeSessionToken } from "@innovator/core";

function makeLogoutRequest(cookie?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/auth/logout", { method: "POST", headers });
}

describe("API /api/auth/logout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("revokes token and returns success when session_token cookie is present", async () => {
    const res = await POST(makeLogoutRequest("session_token=abc123; other=val"));
    expect(revokeSessionToken).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("deletes the session_token cookie in response", async () => {
    const res = await POST(makeLogoutRequest("session_token=abc123"));
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("session_token");
  });

  it("returns success without calling revoke when no cookie present", async () => {
    const res = await POST(makeLogoutRequest());
    expect(revokeSessionToken).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns success when cookie header exists but has no session_token", async () => {
    const res = await POST(makeLogoutRequest("other_cookie=value"));
    expect(revokeSessionToken).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("handles double-logout (already revoked) gracefully", async () => {
    // First logout
    await POST(makeLogoutRequest("session_token=abc123"));
    expect(revokeSessionToken).toHaveBeenCalledWith("abc123");

    // Second logout with same token
    vi.mocked(revokeSessionToken).mockClear();
    const res = await POST(makeLogoutRequest("session_token=abc123"));
    expect(revokeSessionToken).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
