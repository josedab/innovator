import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getWorkflowTemplates: vi.fn(),
  getWorkflowTemplate: vi.fn(),
  validateDAG: vi.fn(),
  DAGWorkflowSchema: { parse: vi.fn((v: unknown) => v) },
  listBuiltinDSLs: vi.fn(),
  getBuiltinDSL: vi.fn(),
  dslToDAG: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/workflows/route.js";
import {
  getWorkflowTemplates,
  getWorkflowTemplate,
  validateDAG,
  listBuiltinDSLs,
  getBuiltinDSL,
  dslToDAG,
} from "@innovator/core";

const mockGetTemplates = vi.mocked(getWorkflowTemplates);
const mockGetTemplate = vi.mocked(getWorkflowTemplate);
const mockValidateDAG = vi.mocked(validateDAG);
const mockListDSLs = vi.mocked(listBuiltinDSLs);
const mockGetDSL = vi.mocked(getBuiltinDSL);
const mockDslToDAG = vi.mocked(dslToDAG);

function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/workflows");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplates.mockReturnValue([
      { id: "t1", name: "Template 1", category: "innovation", workflow: {} },
      { id: "t2", name: "Template 2", category: "research", workflow: {} },
    ] as never);
    mockListDSLs.mockReturnValue([{ id: "dsl-1", name: "DSL 1" }] as never);
  });

  it("returns all templates and DSL templates with no params", async () => {
    const res = await GET(makeGetRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.templates).toHaveLength(2);
    expect(data.dslTemplates).toHaveLength(1);
    expect(data.total).toBe(2);
  });

  it("returns a single template by id", async () => {
    mockGetTemplate.mockReturnValue({ id: "t1", name: "Template 1" } as never);
    const res = await GET(makeGetRequest({ id: "t1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe("t1");
  });

  it("returns 404 for non-existent id", async () => {
    mockGetTemplate.mockReturnValue(undefined);
    const res = await GET(makeGetRequest({ id: "nonexistent" }));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("filters by category", async () => {
    const res = await GET(makeGetRequest({ category: "innovation" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].category).toBe("innovation");
  });
});

describe("POST /api/workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateDAG.mockReturnValue({ valid: true, errors: [], warnings: [] } as never);
  });

  it("validates a workflow with action=validate", async () => {
    const res = await POST(
      makePostRequest({
        action: "validate",
        workflow: { name: "test", nodes: [] },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.valid).toBe(true);
  });

  it("returns validation errors for invalid workflow", async () => {
    mockValidateDAG.mockReturnValue({
      valid: false,
      errors: ["Missing nodes"],
      warnings: [],
    } as never);

    const res = await POST(
      makePostRequest({
        action: "validate",
        workflow: { name: "bad" },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.valid).toBe(false);
    expect(data.errors).toContain("Missing nodes");
  });

  it("executes dry-run with workflowId", async () => {
    mockGetTemplate.mockReturnValue({
      id: "t1",
      name: "Template 1",
      workflow: { name: "Template 1", nodes: [{ id: "n1" }] },
    } as never);

    const res = await POST(
      makePostRequest({
        action: "execute",
        workflowId: "t1",
        dryRun: true,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dryRun).toBe(true);
    expect(data.message).toContain("Dry-run");
  });

  it("returns 404 for missing workflow in execute", async () => {
    mockGetTemplate.mockReturnValue(undefined);

    const res = await POST(
      makePostRequest({
        action: "execute",
        workflowId: "nonexistent",
      })
    );

    expect(res.status).toBe(404);
  });

  it("converts DSL by dslTemplateId", async () => {
    const mockDag = { name: "Converted", nodes: [{ id: "n1" }] };
    mockGetDSL.mockReturnValue({ steps: [] } as never);
    mockDslToDAG.mockReturnValue(mockDag as never);

    const res = await POST(
      makePostRequest({
        action: "convert",
        dslTemplateId: "dsl-1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.workflow).toEqual(mockDag);
    expect(data.validation).toBeDefined();
  });

  it("returns 400 when convert has no dslTemplateId or dsl", async () => {
    mockGetDSL.mockReturnValue(undefined);

    const res = await POST(
      makePostRequest({
        action: "convert",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("dslTemplateId");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown action", async () => {
    const res = await POST(
      makePostRequest({ action: "unknown" })
    );
    expect(res.status).toBe(400);
  });
});
