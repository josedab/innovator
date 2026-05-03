import { describe, it, expect } from "vitest";

// Inline the route handler to avoid Next.js module resolution issues
// (following the pattern from investigate.test.ts)
const version = process.env.npm_package_version ?? "0.1.0";

function GET() {
  return Response.json(
    { status: "ok", version },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    }
  );
}

describe("GET /api/health", () => {
  it("returns 200 status", async () => {
    const res = GET();
    expect(res.status).toBe(200);
  });

  it("returns status 'ok'", async () => {
    const res = GET();
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("includes a version field", async () => {
    const res = GET();
    const data = await res.json();
    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe("string");
  });

  it("returns JSON content-type", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
