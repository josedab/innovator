import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/verticals/route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/verticals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/verticals", () => {
  // ---- action: list ----

  describe("POST action: list", () => {
    it("returns 200 with array of packs", async () => {
      const res = await POST(makeRequest({ action: "list" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.packs).toBeInstanceOf(Array);
      expect(data.packs.length).toBeGreaterThan(0);
      // Verify pack summary shape
      const pack = data.packs[0];
      expect(pack.id).toBeTruthy();
      expect(pack.name).toBeTruthy();
      expect(typeof pack.angleCount).toBe("number");
    });

    it("filters by tag", async () => {
      const res = await POST(makeRequest({ action: "list", tag: "healthcare" }));
      const data = await res.json();
      expect(data.packs.length).toBeGreaterThan(0);
      expect(
        data.packs.every((p: { metadata: { tags: string[] } }) =>
          p.metadata.tags.some((t: string) => t.toLowerCase().includes("healthcare"))
        )
      ).toBe(true);
    });

    it("filters by search query", async () => {
      const res = await POST(makeRequest({ action: "list", search: "fintech" }));
      const data = await res.json();
      expect(data.packs.length).toBeGreaterThan(0);
    });
  });

  // ---- action: get ----

  describe("POST action: get", () => {
    it("returns 200 for valid pack ID", async () => {
      const res = await POST(makeRequest({ action: "get", packId: "healthcare" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pack).toBeDefined();
      expect(data.pack.id).toBe("healthcare");
      expect(data.pack.domainAngles).toBeInstanceOf(Array);
    });

    it("returns 404 for invalid pack ID", async () => {
      const res = await POST(makeRequest({ action: "get", packId: "nonexistent" }));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Pack not found");
    });
  });

  // ---- action: evaluate ----

  describe("POST action: evaluate", () => {
    it("evaluates ideas against a rubric", async () => {
      const res = await POST(
        makeRequest({
          action: "evaluate",
          ideas: ["AI-powered patient safety monitoring system with HIPAA compliance"],
          rubricId: "healthcare-innovation",
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.evaluation).toBeDefined();
      expect(typeof data.evaluation.totalScore).toBe("number");
    });

    it("returns 404 for non-existent rubric", async () => {
      const res = await POST(
        makeRequest({
          action: "evaluate",
          ideas: ["test"],
          rubricId: "missing-rubric",
        })
      );
      expect(res.status).toBe(404);
    });
  });

  // ---- action: compliance_check ----

  describe("POST action: compliance_check", () => {
    it("returns structured compliance result", async () => {
      const res = await POST(
        makeRequest({
          action: "compliance_check",
          ideas: ["A digital health app handling patient data"],
          packId: "healthcare",
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.compliance).toBeDefined();
      expect(data.compliance.packId).toBe("healthcare");
      expect(data.compliance.results).toBeInstanceOf(Array);
      expect(typeof data.compliance.overallPassed).toBe("boolean");
    });

    it("returns 404 for non-existent pack", async () => {
      const res = await POST(
        makeRequest({
          action: "compliance_check",
          ideas: ["test"],
          packId: "missing",
        })
      );
      expect(res.status).toBe(404);
    });
  });

  // ---- Unknown / missing actions ----

  describe("invalid requests", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makeRequest({ action: "unknown_action" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing body", async () => {
      const req = new NextRequest("http://localhost:3000/api/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty object", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });
  });

  // ---- action: glossary ----

  describe("POST action: glossary", () => {
    it("returns glossary for valid pack", async () => {
      const res = await POST(makeRequest({ action: "glossary", packId: "healthcare" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.glossary).toBeDefined();
      expect(data.termCount).toBeGreaterThan(0);
    });
  });

  // ---- action: install ----

  describe("POST action: install", () => {
    it("installs a pack successfully", async () => {
      const res = await POST(makeRequest({ action: "install", packId: "healthcare" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.installed).toBe(true);
    });
  });

  // ---- action: community_submit ----

  describe("POST action: community_submit", () => {
    it("accepts valid community pack submission", async () => {
      const res = await POST(
        makeRequest({
          action: "community_submit",
          pack: {
            id: "custom-pack",
            name: "Custom Pack",
            domainAngles: [{ id: "a1", name: "Angle 1" }],
            glossary: { term: "definition" },
          },
          authorName: "Test Author",
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.submitted).toBe(true);
    });

    it("rejects pack without required fields", async () => {
      const res = await POST(
        makeRequest({
          action: "community_submit",
          pack: { domainAngles: [], glossary: {} },
          authorName: "Author",
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("validation failed");
    });
  });
});
