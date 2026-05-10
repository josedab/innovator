import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---- Mocks ----

const mockGenerateConfig = vi.fn();
const mockSaveTemplate = vi.fn();
const mockGetSessionTemplate = vi.fn();
const mockListTemplates = vi.fn();
const mockDeleteTemplate = vi.fn();

vi.mock("@innovator/core", () => {
  const WizardAnswersSchema = z.object({
    goal: z.string().min(1).max(500),
    domain: z.string().min(1).max(200),
    constraints: z.string().max(500).default(""),
    audience: z.string().min(1).max(200),
    timeBudget: z.enum(["quick", "standard", "thorough", "exhaustive"]),
  });

  const SaveTemplateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(""),
    answers: WizardAnswersSchema,
    config: z.object({
      angles: z.array(z.string()),
      depth: z.enum(["shallow", "medium", "deep"]),
      model: z.string(),
      scoringRubric: z.array(z.string()),
      exportFormat: z.string(),
      maxIdeasPerAngle: z.number().min(1).max(20),
      autoMode: z.boolean(),
    }),
  });

  return {
    WIZARD_QUESTIONS: [
      { id: "goal", label: "Goal" },
      { id: "domain", label: "Domain" },
    ],
    generateConfig: (...args: unknown[]) => mockGenerateConfig(...args),
    saveTemplate: (...args: unknown[]) => mockSaveTemplate(...args),
    getSessionTemplate: (...args: unknown[]) => mockGetSessionTemplate(...args),
    listTemplates: (...args: unknown[]) => mockListTemplates(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
    WizardAnswersSchema,
    SaveTemplateSchema,
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST, GET } from "../../../app/api/session-templates/route";

// ---- Helpers ----

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/session-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ANSWERS = {
  goal: "Improve product UX",
  domain: "SaaS",
  constraints: "Budget limited",
  audience: "Enterprise users",
  timeBudget: "standard" as const,
};

const VALID_CONFIG = {
  angles: ["scamper", "first-principles"],
  depth: "medium" as const,
  model: "gpt-4.1",
  scoringRubric: ["feasibility", "impact"],
  exportFormat: "json",
  maxIdeasPerAngle: 5,
  autoMode: false,
};

// ---- POST tests ----

describe("POST /api/session-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generate-config action", () => {
    it("generates config from wizard answers", async () => {
      mockGenerateConfig.mockReturnValue(VALID_CONFIG);

      const res = await POST(makeRequest({ action: "generate-config", answers: VALID_ANSWERS }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.config).toEqual(VALID_CONFIG);
      expect(data.answers).toEqual(VALID_ANSWERS);
      expect(mockGenerateConfig).toHaveBeenCalledWith(VALID_ANSWERS);
    });

    it("returns 400 for missing answers", async () => {
      const res = await POST(makeRequest({ action: "generate-config" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid answers (missing goal)", async () => {
      const res = await POST(
        makeRequest({
          action: "generate-config",
          answers: { domain: "SaaS", audience: "Users", timeBudget: "quick" },
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("save action", () => {
    it("saves a valid template", async () => {
      mockSaveTemplate.mockReturnValue({
        id: "tpl-1",
        name: "My Template",
        description: "Desc",
        answers: VALID_ANSWERS,
        config: VALID_CONFIG,
        createdAt: new Date().toISOString(),
      });

      const res = await POST(
        makeRequest({
          action: "save",
          name: "My Template",
          description: "Desc",
          answers: VALID_ANSWERS,
          config: VALID_CONFIG,
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.template.id).toBe("tpl-1");
      expect(mockSaveTemplate).toHaveBeenCalledWith(
        "My Template",
        "Desc",
        VALID_ANSWERS,
        VALID_CONFIG
      );
    });

    it("returns 400 for missing name", async () => {
      const res = await POST(
        makeRequest({
          action: "save",
          description: "Desc",
          answers: VALID_ANSWERS,
          config: VALID_CONFIG,
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing config", async () => {
      const res = await POST(
        makeRequest({
          action: "save",
          name: "My Template",
          answers: VALID_ANSWERS,
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("get action", () => {
    it("returns existing template", async () => {
      mockGetSessionTemplate.mockReturnValue({
        id: "tpl-1",
        name: "Template",
        config: VALID_CONFIG,
      });

      const res = await POST(makeRequest({ action: "get", templateId: "tpl-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.template.id).toBe("tpl-1");
    });

    it("returns 404 for non-existent template", async () => {
      mockGetSessionTemplate.mockReturnValue(null);

      const res = await POST(makeRequest({ action: "get", templateId: "missing" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 for missing templateId", async () => {
      const res = await POST(makeRequest({ action: "get" }));
      expect(res.status).toBe(400);
    });
  });

  describe("delete action", () => {
    it("deletes an existing template", async () => {
      mockDeleteTemplate.mockReturnValue(true);

      const res = await POST(makeRequest({ action: "delete", templateId: "tpl-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("returns success: false for already-deleted template", async () => {
      mockDeleteTemplate.mockReturnValue(false);

      const res = await POST(makeRequest({ action: "delete", templateId: "missing" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(false);
    });
  });

  describe("list action", () => {
    it("lists all templates", async () => {
      mockListTemplates.mockReturnValue([
        { id: "tpl-1", name: "Template 1" },
        { id: "tpl-2", name: "Template 2" },
      ]);

      const res = await POST(makeRequest({ action: "list" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.templates).toHaveLength(2);
    });

    it("returns empty list when no templates exist", async () => {
      mockListTemplates.mockReturnValue([]);

      const res = await POST(makeRequest({ action: "list" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.templates).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("returns 400 for invalid action", async () => {
      const res = await POST(makeRequest({ action: "unknown-action" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/session-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 500 on internal error", async () => {
      mockGenerateConfig.mockImplementation(() => {
        throw new Error("Internal error");
      });

      const res = await POST(makeRequest({ action: "generate-config", answers: VALID_ANSWERS }));
      expect(res.status).toBe(500);
    });
  });
});

// ---- GET tests ----

describe("GET /api/session-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns wizard questions and template list", async () => {
    mockListTemplates.mockReturnValue([{ id: "tpl-1", name: "Template" }]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.questions).toBeDefined();
    expect(data.questions).toHaveLength(2);
    expect(data.templates).toHaveLength(1);
  });

  it("returns empty templates when none exist", async () => {
    mockListTemplates.mockReturnValue([]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.templates).toHaveLength(0);
  });

  it("returns 500 on internal error", async () => {
    mockListTemplates.mockImplementation(() => {
      throw new Error("DB error");
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
