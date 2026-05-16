import { z } from "zod";
import {
  createWarRoom,
  getWarRoom,
  findWarRoomByCode,
  joinWarRoom,
  advanceWarRoomPhase,
  castWarRoomVote,
  getWarRoomVoteTallies,
  listWarRooms,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers.js";

const CreateSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(300),
  facilitatorId: z.string().max(200),
  facilitatorName: z.string().max(200),
});

const JoinSchema = z.object({
  action: z.literal("join"),
  roomId: z.string().max(100).optional(),
  joinCode: z.string().max(10).optional(),
  userId: z.string().max(200),
  displayName: z.string().max(200),
  role: z.enum(["participant", "observer"]).default("participant"),
});

const AdvanceSchema = z.object({
  action: z.literal("advance-phase"),
  roomId: z.string().max(100),
  facilitatorId: z.string().max(200),
});

const VoteSchema = z.object({
  action: z.literal("vote"),
  roomId: z.string().max(100),
  userId: z.string().max(200),
  ideaId: z.string().max(100),
  value: z.number().min(-1).max(1),
  comment: z.string().max(500).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateSchema,
  JoinSchema,
  AdvanceSchema,
  VoteSchema,
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;

    switch (data.action) {
      case "create": {
        const room = createWarRoom({
          name: data.name,
          facilitatorId: data.facilitatorId,
          facilitatorName: data.facilitatorName,
        });
        return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
      }
      case "join": {
        const roomId = data.roomId ?? (data.joinCode ? findWarRoomByCode(data.joinCode)?.id : undefined);
        if (!roomId) {
          return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: API_RESPONSE_HEADERS });
        }
        const room = joinWarRoom(roomId, data.userId, data.displayName, data.role);
        return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
      }
      case "advance-phase": {
        const room = advanceWarRoomPhase(data.roomId, data.facilitatorId);
        return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
      }
      case "vote": {
        castWarRoomVote(data.roomId, data.userId, data.ideaId, data.value, data.comment);
        const tallies = getWarRoomVoteTallies(data.roomId);
        return new Response(JSON.stringify({ tallies }), { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    const status = msg.includes("not found") ? 404 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: API_RESPONSE_HEADERS });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");
    const joinCode = url.searchParams.get("joinCode");

    if (roomId) {
      const room = getWarRoom(roomId);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: API_RESPONSE_HEADERS });
      return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
    }
    if (joinCode) {
      const room = findWarRoomByCode(joinCode);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: API_RESPONSE_HEADERS });
      return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
    }

    const rooms = listWarRooms().map((r) => ({
      id: r.id,
      name: r.name,
      joinCode: r.joinCode,
      phase: r.phase,
      memberCount: r.members.filter((m) => m.isActive).length,
      createdAt: r.createdAt,
    }));
    return new Response(JSON.stringify({ rooms }), { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
