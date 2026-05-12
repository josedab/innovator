import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getVersionLog: vi.fn(),
  listBranches: vi.fn(),
  semanticDiff: vi.fn(),
  createVersion: vi.fn(),
  commitVersion: vi.fn(),
  createBranch: vi.fn(),
  mergeVersions: vi.fn(),
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

import { POST } from "../app/api/idea-version/route.js";
import { getVersionLog, listBranches, semanticDiff, createVersion } from "@innovator/core";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";

function makePost(body: unknown, action?: string): Request {
  const url = new URL("http://localhost/api/idea-version");
  if (action) url.searchParams.set("action", action);
  return new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/idea-version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
    vi.mocked(validateModel).mockReturnValue(null);
  });

  describe("POST action=log", () => {
    it("returns versions and branches for ideaId", async () => {
      vi.mocked(getVersionLog).mockReturnValue([{ id: "v1" }] as never);
      vi.mocked(listBranches).mockReturnValue(["main"] as never);

      const res = await POST(makePost({ ideaId: "idea-1" }, "log"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.versions).toBeDefined();
      expect(data.branches).toBeDefined();
    });

    it("supports optional branch filter", async () => {
      vi.mocked(getVersionLog).mockReturnValue([] as never);
      vi.mocked(listBranches).mockReturnValue([] as never);

      const res = await POST(makePost({ ideaId: "idea-1", branch: "dev" }, "log"));
      expect(res.status).toBe(200);
      expect(getVersionLog).toHaveBeenCalledWith("idea-1", "dev");
    });
  });

  describe("POST default (no action) defaults to log", () => {
    it("defaults to log action", async () => {
      vi.mocked(getVersionLog).mockReturnValue([] as never);
      vi.mocked(listBranches).mockReturnValue([] as never);

      const res = await POST(makePost({ ideaId: "idea-1" }));
      expect(res.status).toBe(200);
      expect(getVersionLog).toHaveBeenCalled();
    });
  });

  describe("POST action=diff", () => {
    it("returns semantic diff", async () => {
      vi.mocked(semanticDiff).mockResolvedValue({ changes: ["title changed"] } as never);

      const res = await POST(makePost({ fromVersionId: "v1", toVersionId: "v2" }, "diff"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.changes).toBeDefined();
    });

    it("returns validation error for invalid model", async () => {
      vi.mocked(validateModel).mockReturnValue(
        new Response(JSON.stringify({ error: "Unknown model" }), { status: 400 })
      );

      const res = await POST(
        makePost({ fromVersionId: "v1", toVersionId: "v2", model: "bad" }, "diff")
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST action=create", () => {
    it("creates version and returns 201", async () => {
      vi.mocked(createVersion).mockReturnValue({ id: "v-new" } as never);

      const res = await POST(
        makePost(
          {
            ideaId: "idea-1",
            idea: {
              title: "My Idea",
              description: "Description",
              potentialImpact: "High",
              implementationHint: "Use React",
            },
            author: "user-1",
            message: "Initial version",
          },
          "create"
        )
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("v-new");
    });
  });

  describe("POST action=unknown", () => {
    it("returns 400", async () => {
      const res = await POST(makePost({ ideaId: "idea-1" }, "unknown"));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Unknown action");
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const url = new URL("http://localhost/api/idea-version");
      url.searchParams.set("action", "log");
      const req = new Request(url.toString(), {
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
      vi.mocked(getVersionLog).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await POST(makePost({ ideaId: "idea-1" }, "log"));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("failed");
    });
  });
});
