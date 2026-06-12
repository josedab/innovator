import { describe, it, expect } from "vitest";
import { CACHE_HEADERS, SECURITY_HEADERS, API_RESPONSE_HEADERS } from "../api-headers";

describe("CACHE_HEADERS", () => {
  it("includes Cache-Control with no-store", () => {
    expect(CACHE_HEADERS["Cache-Control"]).toContain("no-store");
  });

  it("includes Vary header", () => {
    expect(CACHE_HEADERS.Vary).toBe("Accept-Encoding");
  });

  it("includes X-Robots-Tag", () => {
    expect(CACHE_HEADERS["X-Robots-Tag"]).toContain("noindex");
  });
});

describe("SECURITY_HEADERS", () => {
  it("includes X-Content-Type-Options", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("includes Content-Security-Policy", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("default-src");
  });

  it("includes Strict-Transport-Security", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age");
  });

  it("includes X-Frame-Options", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("includes Referrer-Policy", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toContain("strict-origin");
  });

  it("includes Permissions-Policy", () => {
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("API_RESPONSE_HEADERS", () => {
  it("includes Content-Type application/json", () => {
    expect(API_RESPONSE_HEADERS["Content-Type"]).toBe("application/json");
  });

  it("merges cache and security headers", () => {
    expect(API_RESPONSE_HEADERS["Cache-Control"]).toBeDefined();
    expect(API_RESPONSE_HEADERS["X-Content-Type-Options"]).toBeDefined();
  });
});
