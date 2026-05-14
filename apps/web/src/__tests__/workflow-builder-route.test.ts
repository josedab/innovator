// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  validateDAG: vi.fn(),
  executeDAG: vi.fn(),
  DAGWorkflowSchema: { parse: vi.fn() },
  listBuiltinDSLs: vi.fn(),
  getBuiltinDSL: vi.fn(),
  dslToDAG: vi.fn(),
  getWorkflowTemplates: vi.fn(),
  getWorkflowTemplate: vi.fn(),
  serializeDAGState: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
  SECURITY_HEADERS: {},
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

import { POST } from "../app/api/workflow-builder/route.js";
import {
  validateDAG,
  DAGWorkflowSchema,
  listBuiltinDSLs,
  getBuiltinDSL,
  dslToDAG,
  getWorkflowTemplates,
  getWorkflowTemplate,
} from "@innovator/core";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/workflow-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/workflow-builder", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import("@/lib/validate-request");
    vi.mocked(mod.validateJsonContentType).mockReturnValue(null);
  });

  it("validates a workflow successfully", async () => {
    const dagMock = { name: "test", nodes: [] };
    vi.mocked(DAGWorkflowSchema.parse).mockReturnValue(dagMock);
    vi.mocked(validateDAG).mockReturnValue({ valid: true, errors: [] } as never);

    const res = await POST(
      makePost({ action: "validate", workflow: dagMock })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("returns validation errors for invalid workflow", async () => {
    const { z } = await import("zod");
    vi.mocked(DAGWorkflowSchema.parse).mockImplementation(() => {
      throw new z.ZodError([
        { code: "custom", message: "bad", path: [] },
      ]);
    });

    const res = await POST(
      makePost({ action: "validate", workflow: {} })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("lists all templates", async () => {
    vi.mocked(getWorkflowTemplates).mockReturnValue([
      { id: "t1", name: "Template 1", description: "desc", category: "general", tags: ["tag1"], workflow: {} },
    ] as never);
    vi.mocked(listBuiltinDSLs).mockReturnValue([{ id: "d1", name: "DSL 1" }] as never);

    const res = await POST(makePost({ action: "templates" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(body.dslTemplates).toHaveLength(1);
    expect(body.total).toBe(2);
  });

  it("gets a DAG template by id", async () => {
    vi.mocked(getWorkflowTemplate).mockReturnValue({
      id: "t1",
      name: "Template 1",
      workflow: {},
    } as never);

    const res = await POST(makePost({ action: "get_template", id: "t1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("t1");
  });

  it("gets a DSL template when DAG not found", async () => {
    vi.mocked(getWorkflowTemplate).mockReturnValue(undefined as never);
    vi.mocked(getBuiltinDSL).mockReturnValue({ name: "DSL 1", steps: [] } as never);
    vi.mocked(dslToDAG).mockReturnValue({ name: "DSL 1", nodes: [] } as never);
    vi.mocked(validateDAG).mockReturnValue({ valid: true, errors: [] } as never);

    const res = await POST(makePost({ action: "get_template", id: "d1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("d1");
    expect(body.validation.valid).toBe(true);
  });

  it("returns 404 for non-existent template", async () => {
    vi.mocked(getWorkflowTemplate).mockReturnValue(undefined as never);
    vi.mocked(getBuiltinDSL).mockReturnValue(undefined as never);

    const res = await POST(makePost({ action: "get_template", id: "nope" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
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

  it("returns 400 for missing action field", async () => {
    const res = await POST(makePost({ workflow: {} }));
    expect(res.status).toBe(400);
  });
});
