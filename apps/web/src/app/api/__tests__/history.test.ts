import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  querySessions: vi.fn().mockReturnValue([]),
  getSession: vi.fn(),
  saveSession: vi.fn().mockReturnValue("new-session-id"),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

import {
  querySessions,
  getSession,
  saveSession,
  deleteSession,
  updateSession,
} from "@innovator/core";
import { DELETE, GET, PATCH, POST } from "../history/route";

function makeGetRequest(params: string = ""): Request {
  return new Request(`http://localhost/api/history${params ? "?" + params : ""}`);
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(params: string = ""): Request {
  return new Request(`http://localhost/api/history${params ? "?" + params : ""}`, {
    method: "DELETE",
  });
}

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/history", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_SESSION = {
  id: "sess-1",
  subject: "Solar Energy",
  angleResults: [],
  tags: ["energy"],
  createdAt: "2025-01-01T00:00:00Z",
};

describe("history API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/history", () => {
    it("returns specific session when ?id= is provided", async () => {
      vi.mocked(getSession).mockReturnValue(SAMPLE_SESSION as Record<string, unknown>);
      const res = await GET(makeGetRequest("id=sess-1"));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.subject).toBe("Solar Energy");
      expect(getSession).toHaveBeenCalledWith("sess-1");
    });

    it("returns 404 when session not found by id", async () => {
      vi.mocked(getSession).mockReturnValue(undefined as unknown);
      const res = await GET(makeGetRequest("id=nonexistent"));
      expect(res.status).toBe(404);
    });

    it("passes search parameter to querySessions", async () => {
      vi.mocked(querySessions).mockReturnValue([SAMPLE_SESSION] as Record<string, unknown>[]);
      const res = await GET(makeGetRequest("search=solar"));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ search: "solar" }));
    });

    it("passes tags filter to querySessions", async () => {
      vi.mocked(querySessions).mockReturnValue([]);
      await GET(makeGetRequest("tags=energy,ai"));
      expect(querySessions).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["energy", "ai"] })
      );
    });

    it("passes date range filter to querySessions", async () => {
      vi.mocked(querySessions).mockReturnValue([]);
      await GET(makeGetRequest("from=2025-01-01&to=2025-12-31"));
      expect(querySessions).toHaveBeenCalledWith(
        expect.objectContaining({ fromDate: "2025-01-01", toDate: "2025-12-31" })
      );
    });

    it("returns paginated list by default", async () => {
      vi.mocked(querySessions).mockReturnValue([SAMPLE_SESSION, SAMPLE_SESSION] as Record<
        string,
        unknown
      >[]);
      const res = await GET(makeGetRequest());
      const json = await res.json();
      expect(json.total).toBe(2);
    });

    it("handles empty search results", async () => {
      vi.mocked(querySessions).mockReturnValue([]);
      const res = await GET(makeGetRequest("search=nonexistent"));
      const json = await res.json();
      expect(json.data).toHaveLength(0);
      expect(json.total).toBe(0);
    });
  });

  describe("POST /api/history", () => {
    it("creates session and returns 201", async () => {
      const res = await POST(makePostRequest({ subject: "Solar", angleResults: [] }));
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.id).toBe("new-session-id");
      expect(saveSession).toHaveBeenCalledTimes(1);
    });

    it("returns 400 for invalid body", async () => {
      const res = await POST(makePostRequest({ subject: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing subject", async () => {
      const res = await POST(makePostRequest({ angleResults: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing angleResults", async () => {
      const res = await POST(makePostRequest({ subject: "Test" }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on internal error", async () => {
      vi.mocked(saveSession).mockImplementationOnce(() => {
        throw new Error("disk full");
      });
      const res = await POST(makePostRequest({ subject: "Test", angleResults: [] }));
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /api/history", () => {
    it("deletes session with id parameter", async () => {
      vi.mocked(deleteSession).mockReturnValue(true as unknown);
      const res = await DELETE(makeDeleteRequest("id=sess-1"));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(deleteSession).toHaveBeenCalledWith("sess-1");
    });

    it("returns 400 without id parameter", async () => {
      const res = await DELETE(makeDeleteRequest());
      expect(res.status).toBe(400);
    });

    it("returns 404 when session not found", async () => {
      vi.mocked(deleteSession).mockReturnValue(false as unknown);
      const res = await DELETE(makeDeleteRequest("id=nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/history", () => {
    it("updates fields and returns 200", async () => {
      vi.mocked(updateSession).mockReturnValue(true as unknown);
      const res = await PATCH(
        makePatchRequest({ id: "sess-1", tags: ["updated"], notes: "new notes" })
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(updateSession).toHaveBeenCalledWith("sess-1", {
        tags: ["updated"],
        notes: "new notes",
      });
    });

    it("returns 404 for unknown id", async () => {
      vi.mocked(updateSession).mockReturnValue(false as unknown);
      const res = await PATCH(makePatchRequest({ id: "nonexistent" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 when id is missing", async () => {
      const res = await PATCH(makePatchRequest({ tags: ["test"] }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on malformed JSON", async () => {
      const req = new Request("http://localhost/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not-valid-json{{{",
      });
      const res = await PATCH(req);
      expect(res.status).toBe(500);
    });
  });
});
