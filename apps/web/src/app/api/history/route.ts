/**
 * @description Innovation session history CRUD operations.
 */
export const runtime = "nodejs";

import { querySessions, getSession, saveSession, deleteSession, updateSession } from "@innovator/core";
import type { HistoryQuery } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { z } from "zod";

/** GET /api/history — list/search sessions. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const session = getSession(id);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  const query: HistoryQuery = {
    search: searchParams.get("search") ?? undefined,
    tags: searchParams.get("tags")?.split(",") ?? undefined,
    fromDate: searchParams.get("from") ?? undefined,
    toDate: searchParams.get("to") ?? undefined,
    angleId: searchParams.get("angle") ?? undefined,
    limit: searchParams.has("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined,
    offset: searchParams.has("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined,
  };

  const sessions = querySessions(query);
  return new Response(
    JSON.stringify({ data: sessions, total: sessions.length }),
    { headers: API_RESPONSE_HEADERS }
  );
}

const SaveSchema = z.object({
  subject: z.string().min(1),
  investigation: z.any().optional(),
  angleResults: z.array(z.any()),
  synthesis: z.any().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  presetId: z.string().optional(),
});

/** POST /api/history — save a new session. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid session data", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const id = saveSession(parsed.data);
    return new Response(JSON.stringify({ data: { id } }), {
      status: 201,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to save session" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** DELETE /api/history?id=<id> — delete a session. */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing 'id' parameter" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  }
  const deleted = deleteSession(id);
  if (!deleted) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: API_RESPONSE_HEADERS,
    });
  }
  return new Response(JSON.stringify({ success: true }), { headers: API_RESPONSE_HEADERS });
}

/** PATCH /api/history — update session tags/notes. */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, tags, notes } = body as { id: string; tags?: string[]; notes?: string };
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing 'id'" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }
    const updated = updateSession(id, { tags, notes });
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
