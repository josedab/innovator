import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createRBACTeam: vi.fn(),
  getRBACTeam: vi.fn(),
  updateRBACTeam: vi.fn(),
  addRBACTeamMember: vi.fn(),
  removeRBACTeamMember: vi.fn(),
  getTeamHierarchy: vi.fn(),
  listRBACTeams: vi.fn(),
  getQuota: vi.fn(),
  setQuotaLimits: vi.fn(),
  getAdminDashboard: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/admin/route.js";
import {
  createRBACTeam,
  getRBACTeam,
  addRBACTeamMember as addTeamMember,
  removeRBACTeamMember as removeTeamMember,
  listRBACTeams,
  getQuota,
  setQuotaLimits,
  getAdminDashboard,
  getTeamHierarchy,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/admin");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/admin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- GET ----

  describe("GET", () => {
    it("lists all teams when no params", async () => {
      vi.mocked(listRBACTeams).mockReturnValue([{ id: "team-1" }] as never);
      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.teams).toEqual([{ id: "team-1" }]);
    });

    it("returns dashboard view", async () => {
      vi.mocked(getAdminDashboard).mockReturnValue({ stats: {} } as never);
      const res = await GET(makeGet({ view: "dashboard", orgId: "org-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dashboard).toEqual({ stats: {} });
      expect(getAdminDashboard).toHaveBeenCalledWith("org-1");
    });

    it("returns hierarchy view", async () => {
      vi.mocked(getTeamHierarchy).mockReturnValue({ tree: [] } as never);
      const res = await GET(makeGet({ view: "hierarchy", rootId: "root-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hierarchy).toEqual({ tree: [] });
    });

    it("returns quota for team", async () => {
      vi.mocked(getQuota).mockReturnValue({ sessions: 100 } as never);
      const res = await GET(makeGet({ view: "quota", teamId: "team-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.quota).toEqual({ sessions: 100 });
    });

    it("returns 400 for quota view without teamId", async () => {
      const res = await GET(makeGet({ view: "quota" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("teamId required");
    });

    it("returns single team by teamId", async () => {
      vi.mocked(getRBACTeam).mockReturnValue({ id: "team-1", name: "Dev" } as never);
      const res = await GET(makeGet({ teamId: "team-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.team).toEqual({ id: "team-1", name: "Dev" });
    });

    it("returns 404 for nonexistent team", async () => {
      vi.mocked(getRBACTeam).mockReturnValue(null as never);
      const res = await GET(makeGet({ teamId: "bad" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Team not found");
    });
  });

  // ---- POST: create-team ----

  describe("POST create-team", () => {
    it("creates team and returns 201", async () => {
      vi.mocked(createRBACTeam).mockReturnValue({ id: "new-team", slug: "eng" } as never);
      const res = await POST(
        makePost({
          action: "create-team",
          name: "Engineering",
          slug: "eng",
          ownerId: "user-1",
          description: "Engineering team",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.team).toEqual({ id: "new-team", slug: "eng" });
      expect(createRBACTeam).toHaveBeenCalledWith({
        name: "Engineering",
        slug: "eng",
        ownerId: "user-1",
        parentId: undefined,
        description: "Engineering team",
      });
    });

    it("rejects duplicate slug format (invalid chars)", async () => {
      const res = await POST(
        makePost({ action: "create-team", name: "Test", slug: "Bad Slug!", ownerId: "u1" })
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing name", async () => {
      const res = await POST(
        makePost({ action: "create-team", name: "", slug: "valid", ownerId: "u1" })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: add-member ----

  describe("POST add-member", () => {
    it("adds member and returns updated team", async () => {
      vi.mocked(addTeamMember).mockReturnValue(undefined as never);
      vi.mocked(getRBACTeam).mockReturnValue({ id: "t1", members: ["u1"] } as never);
      const res = await POST(makePost({ action: "add-member", teamId: "t1", userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe("Member added");
      expect(body.team).toEqual({ id: "t1", members: ["u1"] });
      expect(addTeamMember).toHaveBeenCalledWith("t1", "u1");
    });

    it("rejects missing teamId", async () => {
      const res = await POST(makePost({ action: "add-member", userId: "u1" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: remove-member ----

  describe("POST remove-member", () => {
    it("removes member and returns updated team", async () => {
      vi.mocked(removeTeamMember).mockReturnValue(undefined as never);
      vi.mocked(getRBACTeam).mockReturnValue({ id: "t1", members: [] } as never);
      const res = await POST(makePost({ action: "remove-member", teamId: "t1", userId: "u1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe("Member removed");
      expect(removeTeamMember).toHaveBeenCalledWith("t1", "u1");
    });
  });

  // ---- POST: set-quota ----

  describe("POST set-quota", () => {
    it("sets quota limits", async () => {
      vi.mocked(setQuotaLimits).mockReturnValue({ sessionsLimit: 50 } as never);
      const res = await POST(
        makePost({ action: "set-quota", teamId: "t1", sessionsLimit: 50, apiCallsLimit: 1000 })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe("Quota updated");
      expect(body.quota).toEqual({ sessionsLimit: 50 });
    });

    it("rejects non-integer quota values", async () => {
      const res = await POST(makePost({ action: "set-quota", teamId: "t1", sessionsLimit: 1.5 }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: error paths ----

  describe("POST error paths", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "delete-team" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("rejects name exceeding 200 chars", async () => {
      const res = await POST(
        makePost({
          action: "create-team",
          name: "A".repeat(201),
          slug: "valid-slug",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects slug with uppercase letters", async () => {
      const res = await POST(
        makePost({
          action: "create-team",
          name: "Test Team",
          slug: "InvalidSlug",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects slug with spaces", async () => {
      const res = await POST(
        makePost({
          action: "create-team",
          name: "Test Team",
          slug: "has spaces",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing userId for add-member", async () => {
      const res = await POST(makePost({ action: "add-member", teamId: "t1" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing teamId for remove-member", async () => {
      const res = await POST(makePost({ action: "remove-member", userId: "u1" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing teamId for set-quota", async () => {
      const res = await POST(makePost({ action: "set-quota", sessionsLimit: 10 }));
      expect(res.status).toBe(400);
    });
  });
});
