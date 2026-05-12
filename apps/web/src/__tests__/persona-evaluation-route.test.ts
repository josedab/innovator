import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  listPersonas: vi.fn(),
  evaluateWithMultiplePersonas: vi.fn(),
  generateStakeholderAssessment: vi.fn(),
  assessmentToMarkdown: vi.fn(),
  buildAlignmentMatrix: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/persona-evaluation/route.js";
import {
  listPersonas,
  evaluateWithMultiplePersonas,
  generateStakeholderAssessment,
  assessmentToMarkdown,
  buildAlignmentMatrix,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/persona-evaluation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/persona-evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // --- POST ---

  describe("POST list-personas", () => {
    it("returns personas array", async () => {
      vi.mocked(listPersonas).mockReturnValue([{ id: "p1", name: "CTO" }] as never);

      const res = await POST(makePost({ action: "list-personas" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.personas).toHaveLength(1);
    });
  });

  describe("POST evaluate", () => {
    it("returns scorecards", async () => {
      vi.mocked(evaluateWithMultiplePersonas).mockResolvedValue([
        { personaId: "p1", score: 8 },
      ] as never);

      const res = await POST(
        makePost({
          action: "evaluate",
          idea: { title: "AI Dashboard", description: "Analytics tool" },
          personaIds: ["p1", "p2"],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scorecards).toBeDefined();
    });

    it("returns 400 when idea or personaIds missing", async () => {
      const res = await POST(
        makePost({ action: "evaluate", idea: { title: "X", description: "d" } })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("idea and personaIds required");
    });

    it("returns 400 when idea missing", async () => {
      const res = await POST(makePost({ action: "evaluate", personaIds: ["p1"] }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST assess", () => {
    it("returns assessment JSON by default", async () => {
      vi.mocked(generateStakeholderAssessment).mockResolvedValue({ summary: "Good" } as never);

      const res = await POST(
        makePost({
          action: "assess",
          idea: { title: "AI Dashboard", description: "Analytics tool" },
          personaIds: ["p1"],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.summary).toBeDefined();
    });

    it("returns markdown when format=markdown", async () => {
      vi.mocked(generateStakeholderAssessment).mockResolvedValue({ summary: "Good" } as never);
      vi.mocked(assessmentToMarkdown).mockReturnValue("# Assessment");

      const res = await POST(
        makePost({
          action: "assess",
          idea: { title: "AI Dashboard", description: "Analytics tool" },
          personaIds: ["p1"],
          format: "markdown",
        })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      const text = await res.text();
      expect(text).toBe("# Assessment");
    });

    it("returns 400 when idea or personaIds missing", async () => {
      const res = await POST(makePost({ action: "assess" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST alignment", () => {
    it("returns alignment matrix", async () => {
      vi.mocked(buildAlignmentMatrix).mockResolvedValue({ matrix: [] } as never);

      const res = await POST(
        makePost({
          action: "alignment",
          ideas: [
            { title: "Idea A", description: "d" },
            { title: "Idea B", description: "d" },
          ],
          personaIds: ["p1", "p2"],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.matrix).toBeDefined();
    });

    it("returns 400 when ideas or personaIds missing", async () => {
      const res = await POST(makePost({ action: "alignment", personaIds: ["p1"] }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/persona-evaluation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("POST internal error", () => {
    it("returns 500", async () => {
      vi.mocked(evaluateWithMultiplePersonas).mockRejectedValue(new Error("LLM crash"));

      const res = await POST(
        makePost({
          action: "evaluate",
          idea: { title: "X", description: "d" },
          personaIds: ["p1"],
        })
      );
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });

  // --- GET ---

  describe("GET returns personas list", () => {
    it("returns personas", async () => {
      vi.mocked(listPersonas).mockReturnValue([{ id: "p1" }] as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.personas).toHaveLength(1);
    });
  });
});
