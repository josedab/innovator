/**
 * @description Innovation rooms API — create, join, presence, ideas, voting, consensus.
 */
export const runtime = "nodejs";

import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { PresenceManager, ConsensusManager } from "@innovator/core";

// ---- Singletons ----

const presence = new PresenceManager();
const consensus = new ConsensusManager();

/** In-memory room registry: roomId → { name, code, consensusSessionId } */
const rooms = new Map<
  string,
  { id: string; name: string; code: string; consensusSessionId: string; createdAt: string }
>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function findRoomByCode(code: string) {
  for (const room of rooms.values()) {
    if (room.code === code) return room;
  }
  return undefined;
}

// ---- Zod Schemas ----

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_room"),
    name: z.string().min(1).max(200),
    userId: z.string().min(1),
    displayName: z.string().min(1).max(100),
    consensusThreshold: z.number().min(0).max(1).optional(),
  }),
  z.object({
    action: z.literal("join_room"),
    code: z.string().min(1).max(10),
    userId: z.string().min(1),
    displayName: z.string().min(1).max(100),
    avatarUrl: z.string().url().optional(),
  }),
  z.object({
    action: z.literal("presence"),
    roomId: z.string().min(1),
    userId: z.string().min(1),
    cursor: z.object({ x: z.number(), y: z.number() }).optional(),
    section: z.string().optional(),
  }),
  z.object({
    action: z.literal("add_idea"),
    roomId: z.string().min(1),
    content: z.string().min(1).max(2000),
    author: z.string().min(1),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("vote"),
    roomId: z.string().min(1),
    ideaId: z.string().min(1),
    userId: z.string().min(1),
    value: z.union([z.literal(1), z.literal(-1)]),
  }),
  z.object({
    action: z.literal("comment"),
    roomId: z.string().min(1),
    ideaId: z.string().min(1),
    userId: z.string().min(1),
    text: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("consensus"),
    roomId: z.string().min(1),
  }),
  z.object({
    action: z.literal("synthesize"),
    roomId: z.string().min(1),
  }),
]);

// ---- Route Handlers ----

/**
 * POST /api/rooms — Discriminated union of room actions.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ActionSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;

    switch (data.action) {
      case "create_room": {
        const code = generateRoomCode();
        const session = consensus.createSession("room", data.consensusThreshold ?? 0.6);
        const roomId = session.id;

        const room = {
          id: roomId,
          name: data.name,
          code,
          consensusSessionId: session.id,
          createdAt: new Date().toISOString(),
        };
        rooms.set(roomId, room);

        // Auto-join creator
        presence.joinRoom(roomId, {
          userId: data.userId,
          displayName: data.displayName,
        });

        return new Response(
          JSON.stringify({
            data: {
              roomId,
              code,
              name: data.name,
              createdAt: room.createdAt,
            },
          }),
          { status: 201, headers: API_RESPONSE_HEADERS }
        );
      }

      case "join_room": {
        const room = findRoomByCode(data.code);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        presence.joinRoom(room.id, {
          userId: data.userId,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        });

        const activeUsers = presence.getActiveUsers(room.id);
        const ideas = consensus.getTopIdeas(room.consensusSessionId, 100);
        const consensusStatus = consensus.checkConsensus(room.consensusSessionId);

        return new Response(
          JSON.stringify({
            data: {
              roomId: room.id,
              name: room.name,
              code: room.code,
              participants: activeUsers.map(
                (u: { userId: string; displayName: string; status: string }) => ({
                  userId: u.userId,
                  displayName: u.displayName,
                  status: u.status,
                })
              ),
              ideas,
              consensus: consensusStatus,
            },
          }),
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "presence": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        if (data.cursor) {
          presence.updateCursor(data.roomId, data.userId, data.cursor);
        }
        if (data.section) {
          presence.updateSection(data.roomId, data.userId, data.section);
        }
        if (!data.cursor && !data.section) {
          presence.heartbeat(data.roomId, data.userId);
        }

        const state = presence.getPresence(data.roomId) as
          | {
              users: Map<
                string,
                {
                  userId: string;
                  displayName: string;
                  cursorPosition?: { x: number; y: number };
                  activeSection?: string;
                  status: string;
                }
              >;
            }
          | undefined;
        const users = state
          ? Array.from(state.users.values()).map((u) => ({
              userId: u.userId,
              displayName: u.displayName,
              cursor: u.cursorPosition,
              activeSection: u.activeSection,
              status: u.status,
            }))
          : [];

        return new Response(JSON.stringify({ data: { users } }), { headers: API_RESPONSE_HEADERS });
      }

      case "add_idea": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        const idea = consensus.addIdea(room.consensusSessionId, {
          content: data.content,
          author: data.author,
          tags: data.tags,
        });

        if (!idea) {
          return new Response(JSON.stringify({ error: "Cannot add idea" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }

        return new Response(JSON.stringify({ data: idea }), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }

      case "vote": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        const success = consensus.vote(
          room.consensusSessionId,
          data.ideaId,
          data.userId,
          data.value
        );

        return new Response(JSON.stringify({ success }), { headers: API_RESPONSE_HEADERS });
      }

      case "comment": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        const comment = consensus.comment(
          room.consensusSessionId,
          data.ideaId,
          data.userId,
          data.text
        );

        if (!comment) {
          return new Response(JSON.stringify({ error: "Cannot add comment" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }

        return new Response(JSON.stringify({ data: comment }), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }

      case "consensus": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        const status = consensus.checkConsensus(room.consensusSessionId);
        const topIdeas = consensus.getTopIdeas(room.consensusSessionId, 10);

        return new Response(
          JSON.stringify({
            data: {
              ...status,
              topIdeas,
            },
          }),
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "synthesize": {
        const room = rooms.get(data.roomId);
        if (!room) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }

        const result = consensus.synthesize(room.consensusSessionId);
        if (!result) {
          return new Response(JSON.stringify({ error: "No ideas to synthesize" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }

        return new Response(JSON.stringify({ data: { synthesis: result } }), {
          headers: API_RESPONSE_HEADERS,
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
