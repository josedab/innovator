import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

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

const API_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

const SaveSchema = z.object({
  subject: z.string().min(1),
  investigation: z.any().optional(),
  angleResults: z.array(z.any()),
  synthesis: z.any().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  presetId: z.string().optional(),
});

async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const session = (getSession as (id: string) => Record<string, unknown> | undefined)(id);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  const query: Record<string, unknown> = {
    search: searchParams.get("search") ?? undefined,
    tags: searchParams.get("tags")?.split(",") ?? undefined,
    fromDate: searchParams.get("from") ?? undefined,
    toDate: searchParams.get("to") ?? undefined,
    angleId: searchParams.get("angle") ?? undefined,
    limit: searchParams.has("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined,
    offset: searchParams.has("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined,
  };

  const sessions = (querySessions as (q: Record<string, unknown>) => Record<string, unknown>[])(
    query
  );
  return new Response(JSON.stringify({ data: sessions, total: sessions.length }), {
    headers: API_RESPONSE_HEADERS,
  });
}

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid session data", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const id = (saveSession as (data: Record<string, unknown>) => string)(parsed.data);
    return new Response(JSON.stringify({ data: { id } }), {
      status: 201,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Failed to save session" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id' parameter" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  }
  const deleted = (deleteSession as (id: string) => boolean)(id);
  if (!deleted) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: API_RESPONSE_HEADERS,
    });
  }
  return new Response(JSON.stringify({ success: true }), { headers: API_RESPONSE_HEADERS });
}

async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, tags, notes } = body as { id: string; tags?: string[]; notes?: string };
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing 'id'" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }
    const updated = (updateSession as (id: string, data: Record<string, unknown>) => boolean)(id, {
      tags,
      notes,
    });
    if (!updated) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to update session" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

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
