import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/verticals/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/verticals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/verticals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists all vertical packs", async () => {
    const res = await POST(makePost({ action: "list" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packs).toBeInstanceOf(Array);
    expect(body.packs.length).toBeGreaterThanOrEqual(3);
  });

  it("lists packs filtered by tag", async () => {
    const res = await POST(makePost({ action: "list", tag: "healthcare" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
    expect(body.packs[0].id).toBe("healthcare");
  });

  it("lists packs filtered by search", async () => {
    const res = await POST(makePost({ action: "list", search: "financial" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
  });

  it("gets a specific pack by ID", async () => {
    const res = await POST(makePost({ action: "get", packId: "healthcare" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pack.id).toBe("healthcare");
    expect(body.pack.domainAngles).toBeInstanceOf(Array);
  });

  it("returns 404 for non-existent pack ID", async () => {
    const res = await POST(makePost({ action: "get", packId: "nonexistent" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Pack not found");
  });

  it("evaluates ideas against a rubric", async () => {
    const res = await POST(
      makePost({
        action: "evaluate",
        ideas: ["Improve patient safety with AI monitoring"],
        rubricId: "healthcare-innovation",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluation).toBeDefined();
    expect(body.evaluation.rubricId).toBe("healthcare-innovation");
    expect(body.evaluation.scores).toBeInstanceOf(Array);
  });

  it("returns 404 for non-existent rubric", async () => {
    const res = await POST(
      makePost({
        action: "evaluate",
        ideas: ["Some idea"],
        rubricId: "nonexistent-rubric",
      })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Rubric not found");
  });

  it("runs compliance check on ideas", async () => {
    const res = await POST(
      makePost({
        action: "compliance_check",
        ideas: ["A new healthcare monitoring device"],
        packId: "healthcare",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.compliance).toBeDefined();
    expect(body.compliance.packId).toBe("healthcare");
    expect(body.compliance.results).toBeInstanceOf(Array);
  });

  it("returns 404 for compliance check with invalid pack", async () => {
    const res = await POST(
      makePost({
        action: "compliance_check",
        ideas: ["Some idea"],
        packId: "nonexistent",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "bad_action" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });
});
