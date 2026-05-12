import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  searchProjects: vi.fn(),
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

import { GET, POST } from "../app/api/projects/route.js";
import {
  createProject,
  getProject,
  listProjects,
  searchProjects,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

const mockCreateProject = vi.mocked(createProject);
const mockGetProject = vi.mocked(getProject);
const mockListProjects = vi.mocked(listProjects);
const mockSearchProjects = vi.mocked(searchProjects);

function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/projects");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all projects with no params", async () => {
    mockListProjects.mockResolvedValue([
      { id: "p1", name: "Project 1" },
      { id: "p2", name: "Project 2" },
    ] as never);

    const res = await GET(makeGetRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
  });

  it("returns a project by valid id", async () => {
    mockGetProject.mockResolvedValue({ id: "p1", name: "Project 1" } as never);

    const res = await GET(makeGetRequest({ id: "p1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe("p1");
  });

  it("returns 404 for nonexistent id", async () => {
    mockGetProject.mockResolvedValue(undefined as never);

    const res = await GET(makeGetRequest({ id: "nonexistent" }));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("searches with query param", async () => {
    mockSearchProjects.mockResolvedValue([
      { id: "p1", name: "AI Project" },
    ] as never);

    const res = await GET(makeGetRequest({ q: "AI" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(mockSearchProjects).toHaveBeenCalledWith({ query: "AI" });
  });

  it("returns 500 on internal error", async () => {
    mockListProjects.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Failed to retrieve");
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  it("creates a project with valid body (201)", async () => {
    mockCreateProject.mockResolvedValue({
      id: "new-1",
      name: "New Project",
      description: "Desc",
      ownerId: "user-1",
    } as never);

    const res = await POST(
      makePostRequest({
        name: "New Project",
        description: "Desc",
        ownerId: "user-1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.name).toBe("New Project");
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(
      makePostRequest({
        description: "No name",
        ownerId: "user-1",
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for name exceeding 200 chars", async () => {
    const res = await POST(
      makePostRequest({
        name: "x".repeat(201),
        ownerId: "user-1",
      })
    );

    expect(res.status).toBe(400);
  });

  it("creates project with special characters in name", async () => {
    mockCreateProject.mockResolvedValue({
      id: "p-special",
      name: "Project: Alpha & Beta (v2.0) — Test!",
      ownerId: "user-1",
    } as never);

    const res = await POST(
      makePostRequest({
        name: "Project: Alpha & Beta (v2.0) — Test!",
        ownerId: "user-1",
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Project: Alpha & Beta (v2.0) — Test!");
  });

  it("creates project with optional settings", async () => {
    mockCreateProject.mockResolvedValue({
      id: "p-settings",
      name: "Configured",
      ownerId: "user-1",
    } as never);

    const res = await POST(
      makePostRequest({
        name: "Configured",
        ownerId: "user-1",
        settings: {
          defaultModel: "gpt-4",
          defaultAngles: ["scamper"],
          autoScore: true,
          autoValidate: false,
        },
      })
    );
    expect(res.status).toBe(201);
    expect(mockCreateProject).toHaveBeenCalledWith(
      "Configured", "", "user-1",
      expect.objectContaining({ defaultModel: "gpt-4", autoScore: true })
    );
  });

  it("returns 400 for missing ownerId", async () => {
    const res = await POST(
      makePostRequest({ name: "No Owner" })
    );
    expect(res.status).toBe(400);
  });

  it("returns error for non-JSON content type", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(
      new Response(JSON.stringify({ error: "Unsupported Media Type" }), { status: 415 })
    );

    const res = await POST(
      makePostRequest({ name: "Test", ownerId: "user-1" })
    );

    expect(res.status).toBe(415);
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(validateJsonContentType).mockReturnValue(null);

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 500 on internal error", async () => {
    mockCreateProject.mockRejectedValue(new Error("DB error"));

    const res = await POST(
      makePostRequest({
        name: "Test",
        ownerId: "user-1",
      })
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("creation failed");
  });
});
