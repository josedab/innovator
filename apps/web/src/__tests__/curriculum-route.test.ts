import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  generateLearningPath: vi.fn(),
  getLearningPath: vi.fn(),
  getUserLearningPaths: vi.fn(),
  getLearningModule: vi.fn(),
  startModule: vi.fn(),
  completeModule: vi.fn(),
  getLearnerProfile: vi.fn(),
  getWeakestSkills: vi.fn(),
  generateCertificate: vi.fn(),
  getUserCertificates: vi.fn(),
  INNOVATION_SKILLS: [
    "divergent-thinking",
    "convergent-thinking",
    "empathy-mapping",
    "first-principles",
    "cross-domain-transfer",
    "risk-assessment",
    "opportunity-identification",
    "prototyping",
    "stakeholder-management",
    "data-driven-decision",
    "creative-constraint",
    "trend-analysis",
    "competitive-intelligence",
    "synthesis",
    "presentation",
  ] as const,
  DIFFICULTY_LEVELS: ["beginner", "intermediate", "advanced", "expert"] as const,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
  validateModel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/curriculum/route.js";
import {
  generateLearningPath,
  getLearningPath,
  getUserLearningPaths,
  getLearningModule,
  startModule,
  completeModule,
  getLearnerProfile,
  getWeakestSkills,
  generateCertificate,
  getUserCertificates,
} from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/curriculum", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/curriculum");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

describe("API /api/curriculum", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
  });

  // --- POST: generate-path ---

  describe("POST generate-path", () => {
    it("generates a learning path with valid skill and difficulty", async () => {
      vi.mocked(generateLearningPath).mockResolvedValue({
        id: "path-1",
        modules: [{ id: "m1", title: "Module 1" }],
      } as never);
      const res = await POST(
        makePost({
          action: "generate-path",
          userId: "user-1",
          skills: ["divergent-thinking"],
          difficulty: "beginner",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("path-1");
      expect(body.modules).toHaveLength(1);
    });

    it("rejects missing action", async () => {
      const res = await POST(makePost({ userId: "user-1", skills: ["divergent-thinking"] }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid skill", async () => {
      const res = await POST(
        makePost({
          action: "generate-path",
          userId: "user-1",
          skills: ["nonexistent-skill"],
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when validateModel fails", async () => {
      vi.mocked(validateModel).mockReturnValue(
        new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
      );
      const res = await POST(
        makePost({
          action: "generate-path",
          userId: "user-1",
          skills: ["divergent-thinking"],
          model: "bad-model",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // --- POST: start-module / complete-module ---

  describe("POST start-module", () => {
    it("starts a module successfully", async () => {
      vi.mocked(startModule).mockReturnValue({ status: "in-progress" } as never);
      const res = await POST(
        makePost({
          action: "start-module",
          userId: "user-1",
          moduleId: "m1",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("in-progress");
    });
  });

  describe("POST complete-module", () => {
    it("completes a module with quiz score", async () => {
      vi.mocked(completeModule).mockReturnValue({ status: "completed", quizScore: 90 } as never);
      const res = await POST(
        makePost({
          action: "complete-module",
          userId: "user-1",
          moduleId: "m1",
          quizScore: 90,
          timeSpentMinutes: 45,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("completed");
    });

    it("rejects completing module with missing quizScore", async () => {
      const res = await POST(
        makePost({
          action: "complete-module",
          userId: "user-1",
          moduleId: "m1",
          timeSpentMinutes: 30,
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 when completeModule throws (e.g., unstarted module)", async () => {
      vi.mocked(completeModule).mockImplementation(() => {
        throw new Error("Module not started");
      });
      const res = await POST(
        makePost({
          action: "complete-module",
          userId: "user-1",
          moduleId: "m-unstarted",
          quizScore: 80,
          timeSpentMinutes: 10,
        })
      );
      expect(res.status).toBe(500);
    });
  });

  // --- POST: certificate ---

  describe("POST certificate", () => {
    it("generates certificate after path completion", async () => {
      vi.mocked(generateCertificate).mockReturnValue({
        id: "cert-1",
        userId: "user-1",
        pathId: "path-1",
      } as never);
      const res = await POST(
        makePost({
          action: "certificate",
          userId: "user-1",
          pathId: "path-1",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("cert-1");
    });

    it("returns 400 when path incomplete or not found", async () => {
      vi.mocked(generateCertificate).mockReturnValue(null as never);
      const res = await POST(
        makePost({
          action: "certificate",
          userId: "user-1",
          pathId: "path-incomplete",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Cannot generate certificate");
    });
  });

  // --- POST: error paths ---

  describe("POST error paths", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/curriculum", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns content-type error when validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makePost({ action: "generate-path" }));
      expect(res.status).toBe(415);
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(generateLearningPath).mockRejectedValue(new Error("LLM crash"));
      const res = await POST(
        makePost({
          action: "generate-path",
          userId: "user-1",
          skills: ["divergent-thinking"],
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("failed");
    });
  });

  // --- GET endpoints ---

  describe("GET learner profile", () => {
    it("returns learner profile by userId", async () => {
      vi.mocked(getLearnerProfile).mockReturnValue({ userId: "u1", level: 3 } as never);
      const res = await GET(makeGet({ userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("u1");
    });
  });

  describe("GET learning paths", () => {
    it("returns user paths when paths=true", async () => {
      vi.mocked(getUserLearningPaths).mockReturnValue([{ id: "path-1" }] as never);
      const res = await GET(makeGet({ userId: "u1", paths: "true" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  describe("GET module", () => {
    it("returns module by moduleId", async () => {
      vi.mocked(getLearningModule).mockReturnValue({ id: "m1", title: "Module 1" } as never);
      const res = await GET(makeGet({ moduleId: "m1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("m1");
    });

    it("returns 404 for nonexistent module", async () => {
      vi.mocked(getLearningModule).mockReturnValue(null as never);
      const res = await GET(makeGet({ moduleId: "bad" }));
      expect(res.status).toBe(404);
    });
  });

  describe("GET path by pathId", () => {
    it("returns path by pathId", async () => {
      vi.mocked(getLearningPath).mockReturnValue({ id: "path-1" } as never);
      const res = await GET(makeGet({ pathId: "path-1" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent path", async () => {
      vi.mocked(getLearningPath).mockReturnValue(null as never);
      const res = await GET(makeGet({ pathId: "bad" }));
      expect(res.status).toBe(404);
    });
  });

  describe("GET certificates", () => {
    it("returns user certificates", async () => {
      vi.mocked(getUserCertificates).mockReturnValue([{ id: "cert-1" }] as never);
      const res = await GET(makeGet({ userId: "u1", certificates: "true" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  describe("GET weak skills", () => {
    it("returns weakest skills for user", async () => {
      vi.mocked(getWeakestSkills).mockReturnValue(["empathy-mapping", "prototyping"] as never);
      const res = await GET(makeGet({ userId: "u1", weakSkills: "3" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe("GET error paths", () => {
    it("returns 400 when no parameters provided", async () => {
      const res = await GET(makeGet({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Provide");
    });

    it("returns 500 on unexpected GET error", async () => {
      vi.mocked(getLearnerProfile).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await GET(makeGet({ userId: "u1" }));
      expect(res.status).toBe(500);
    });
  });
});
