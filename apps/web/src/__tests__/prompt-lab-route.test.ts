import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createExperiment: vi.fn(),
  startExperiment: vi.fn(),
  getExperiment: vi.fn(),
  listExperiments: vi.fn(),
  assignVariant: vi.fn(),
  recordExperimentScore: vi.fn(),
  analyzeExperiment: vi.fn(),
  commitPromptVersion: vi.fn(),
  activatePromptVersion: vi.fn(),
  getActivePromptVersion: vi.fn(),
  getPromptVersionHistory: vi.fn(),
  rollbackPromptVersion: vi.fn(),
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

import { POST } from "../app/api/prompt-lab/route.js";
import {
  createExperiment,
  startExperiment,
  getExperiment,
  listExperiments,
  assignVariant,
  recordExperimentScore,
  analyzeExperiment,
  commitPromptVersion,
  activatePromptVersion,
  getActivePromptVersion,
  getPromptVersionHistory,
  rollbackPromptVersion,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/prompt-lab", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validVariants = [
  { id: "v1", name: "Variant A", template: "Prompt template A: {{subject}}" },
  { id: "v2", name: "Variant B", template: "Prompt template B: {{subject}}" },
];

describe("API /api/prompt-lab POST", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // --- create-experiment ---

  describe("create-experiment", () => {
    it("creates experiment with 2 valid variants", async () => {
      vi.mocked(createExperiment).mockReturnValue({ id: "exp-1", status: "draft" } as never);
      const res = await POST(
        makeRequest({
          action: "create",
          name: "AB Test",
          angleId: "angle-1",
          variants: validVariants,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiment).toBeDefined();
      expect(createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AB Test", angleId: "angle-1" })
      );
    });

    it("creates experiment with 10 variants (max)", async () => {
      vi.mocked(createExperiment).mockReturnValue({ id: "exp-2" } as never);
      const tenVariants = Array.from({ length: 10 }, (_, i) => ({
        id: `v${i}`,
        name: `Variant ${i}`,
        template: `Template ${i}`,
      }));
      const res = await POST(
        makeRequest({
          action: "create",
          name: "Multi Test",
          angleId: "angle-2",
          variants: tenVariants,
        })
      );
      expect(res.status).toBe(200);
    });

    it("rejects with 1 variant (min is 2)", async () => {
      const res = await POST(
        makeRequest({
          action: "create",
          name: "Single",
          angleId: "angle-1",
          variants: [{ id: "v1", name: "Only", template: "T" }],
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects with 11 variants (max is 10)", async () => {
      const elevenVariants = Array.from({ length: 11 }, (_, i) => ({
        id: `v${i}`,
        name: `V ${i}`,
        template: `T ${i}`,
      }));
      const res = await POST(
        makeRequest({
          action: "create",
          name: "Too Many",
          angleId: "angle-1",
          variants: elevenVariants,
        })
      );
      expect(res.status).toBe(400);
    });

    it("supports all allocation strategies", async () => {
      for (const allocation of ["random", "round-robin", "epsilon-greedy"] as const) {
        vi.mocked(createExperiment).mockReturnValue({ id: "exp-x" } as never);
        const res = await POST(
          makeRequest({
            action: "create",
            name: `Test ${allocation}`,
            angleId: "angle-1",
            variants: validVariants,
            allocation,
          })
        );
        expect(res.status).toBe(200);
      }
    });

    it("supports all success metric types", async () => {
      for (const metric of [
        "idea-score",
        "user-rating",
        "export-rate",
        "selection-rate",
      ] as const) {
        vi.mocked(createExperiment).mockReturnValue({ id: "exp-y" } as never);
        const res = await POST(
          makeRequest({
            action: "create",
            name: `Test ${metric}`,
            angleId: "angle-1",
            variants: validVariants,
            successMetric: metric,
          })
        );
        expect(res.status).toBe(200);
      }
    });
  });

  // --- run-experiment (assign) ---

  describe("assign variant", () => {
    it("assigns variant from experiment", async () => {
      vi.mocked(assignVariant).mockReturnValue({ id: "v1", name: "Variant A" } as never);
      const res = await POST(makeRequest({ action: "assign", experimentId: "exp-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.variant).toBeDefined();
    });

    it("returns 404 when experiment not found", async () => {
      vi.mocked(assignVariant).mockReturnValue(null as never);
      const res = await POST(makeRequest({ action: "assign", experimentId: "bad-id" }));
      expect(res.status).toBe(404);
    });
  });

  // --- record-score ---

  describe("record-score", () => {
    it("records score successfully", async () => {
      vi.mocked(recordExperimentScore).mockReturnValue(undefined as never);
      const res = await POST(
        makeRequest({
          action: "record-score",
          experimentId: "exp-1",
          variantId: "v1",
          score: 85,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(recordExperimentScore).toHaveBeenCalledWith("exp-1", "v1", 85);
    });

    it("rejects score below 0", async () => {
      const res = await POST(
        makeRequest({
          action: "record-score",
          experimentId: "exp-1",
          variantId: "v1",
          score: -1,
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects score above 100", async () => {
      const res = await POST(
        makeRequest({
          action: "record-score",
          experimentId: "exp-1",
          variantId: "v1",
          score: 101,
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // --- version lifecycle ---

  describe("version lifecycle", () => {
    it("commits a prompt version", async () => {
      vi.mocked(commitPromptVersion).mockReturnValue({ version: 1 } as never);
      const res = await POST(
        makeRequest({
          action: "commit-version",
          angleId: "angle-1",
          template: "New prompt: {{input}}",
          message: "Initial commit",
          author: "user-1",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.version).toBeDefined();
    });

    it("activates a prompt version", async () => {
      vi.mocked(activatePromptVersion).mockReturnValue({ version: 1, active: true } as never);
      const res = await POST(
        makeRequest({
          action: "activate-version",
          angleId: "angle-1",
          version: 1,
        })
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 when activating non-existent version", async () => {
      vi.mocked(activatePromptVersion).mockReturnValue(null as never);
      const res = await POST(
        makeRequest({
          action: "activate-version",
          angleId: "angle-1",
          version: 999,
        })
      );
      expect(res.status).toBe(404);
    });

    it("rollbacks a prompt version", async () => {
      vi.mocked(rollbackPromptVersion).mockReturnValue({ version: 1 } as never);
      const res = await POST(
        makeRequest({
          action: "rollback",
          angleId: "angle-1",
          version: 1,
        })
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 when rolling back non-existent version", async () => {
      vi.mocked(rollbackPromptVersion).mockReturnValue(null as never);
      const res = await POST(
        makeRequest({
          action: "rollback",
          angleId: "angle-1",
          version: 999,
        })
      );
      expect(res.status).toBe(404);
    });

    it("retrieves version history", async () => {
      vi.mocked(getPromptVersionHistory).mockReturnValue([{ version: 1 }] as never);
      vi.mocked(getActivePromptVersion).mockReturnValue({ version: 1 } as never);
      const res = await POST(
        makeRequest({
          action: "version-history",
          angleId: "angle-1",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.history).toBeDefined();
      expect(body.active).toBeDefined();
    });
  });

  // --- analyze ---

  describe("analyze", () => {
    it("returns analysis with winning variant", async () => {
      vi.mocked(analyzeExperiment).mockReturnValue({
        winner: "v1",
        confidence: 0.95,
        scores: { v1: 82, v2: 71 },
      } as never);
      const res = await POST(makeRequest({ action: "analyze", experimentId: "exp-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.winner).toBe("v1");
    });
  });

  // --- error paths ---

  describe("error paths", () => {
    it("returns 400 for invalid Content-Type", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
          status: 415,
        })
      );
      const res = await POST(makeRequest({ action: "create" }));
      expect(res.status).toBe(415);
    });

    it("returns 400 for malformed JSON", async () => {
      const req = new Request("http://localhost/api/prompt-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not valid json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 400 for invalid action", async () => {
      const res = await POST(makeRequest({ action: "unknown-action" }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on unexpected LLM failure", async () => {
      vi.mocked(createExperiment).mockImplementation(() => {
        throw new Error("LLM timeout");
      });
      const res = await POST(
        makeRequest({
          action: "create",
          name: "Fail Test",
          angleId: "angle-1",
          variants: validVariants,
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Internal server error");
    });
  });

  // --- start / get / list ---

  describe("start, get, list", () => {
    it("starts an experiment", async () => {
      vi.mocked(startExperiment).mockReturnValue({ id: "exp-1", status: "running" } as never);
      const res = await POST(makeRequest({ action: "start", experimentId: "exp-1" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for starting nonexistent experiment", async () => {
      vi.mocked(startExperiment).mockReturnValue(null as never);
      const res = await POST(makeRequest({ action: "start", experimentId: "bad" }));
      expect(res.status).toBe(404);
    });

    it("gets an experiment", async () => {
      vi.mocked(getExperiment).mockReturnValue({ id: "exp-1" } as never);
      const res = await POST(makeRequest({ action: "get", experimentId: "exp-1" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent experiment", async () => {
      vi.mocked(getExperiment).mockReturnValue(null as never);
      const res = await POST(makeRequest({ action: "get", experimentId: "bad" }));
      expect(res.status).toBe(404);
    });

    it("lists experiments", async () => {
      vi.mocked(listExperiments).mockReturnValue([{ id: "exp-1" }] as never);
      const res = await POST(makeRequest({ action: "list" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.experiments).toHaveLength(1);
    });

    it("lists experiments filtered by status", async () => {
      vi.mocked(listExperiments).mockReturnValue([] as never);
      const res = await POST(makeRequest({ action: "list", status: "running" }));
      expect(res.status).toBe(200);
      expect(listExperiments).toHaveBeenCalledWith("running");
    });
  });
});
