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
import {
  generateFacilitationReport,
  detectConsensus,
  startPhaseTimer,
  getPhaseTimerState,
  stopPhaseTimer,
  detectGroupthink,
  computeParticipationStats,
} from "@innovator/core/dist/realtime/facilitation-ai.js";
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

const StartTimerSchema = z.object({
  action: z.literal("start-timer"),
  roomId: z.string().max(100),
  phase: z.string().max(50),
  durationMinutes: z.number().int().min(1).max(120).optional(),
});

const StopTimerSchema = z.object({
  action: z.literal("stop-timer"),
  roomId: z.string().max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateSchema,
  JoinSchema,
  AdvanceSchema,
  VoteSchema,
  StartTimerSchema,
  StopTimerSchema,
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
        const roomId =
          data.roomId ?? (data.joinCode ? findWarRoomByCode(data.joinCode)?.id : undefined);
        if (!roomId) {
          return new Response(JSON.stringify({ error: "Room not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
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
      case "start-timer": {
        const timer = startPhaseTimer(data.roomId, data.phase, data.durationMinutes);
        return new Response(JSON.stringify({ timer }), { headers: API_RESPONSE_HEADERS });
      }
      case "stop-timer": {
        const result = stopPhaseTimer(data.roomId);
        if (!result)
          return new Response(JSON.stringify({ error: "No active timer" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        return new Response(JSON.stringify(result), { headers: API_RESPONSE_HEADERS });
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
    const view = url.searchParams.get("view");

    if (roomId && view === "facilitation-report") {
      const room = getWarRoom(roomId);
      if (!room)
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      const report = generateFacilitationReport(room);
      return new Response(JSON.stringify(report), { headers: API_RESPONSE_HEADERS });
    }

    if (roomId && view === "consensus") {
      const room = getWarRoom(roomId);
      if (!room)
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      const threshold = parseFloat(url.searchParams.get("threshold") ?? "0.7");
      const consensus = detectConsensus(room, threshold);
      return new Response(JSON.stringify(consensus), { headers: API_RESPONSE_HEADERS });
    }

    if (roomId && view === "timer") {
      const state = getPhaseTimerState(roomId);
      return new Response(JSON.stringify({ timer: state }), { headers: API_RESPONSE_HEADERS });
    }

    if (roomId && view === "participation") {
      const room = getWarRoom(roomId);
      if (!room)
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      const stats = computeParticipationStats(room);
      const groupthink = detectGroupthink(room);
      return new Response(JSON.stringify({ participation: stats, groupthink }), {
        headers: API_RESPONSE_HEADERS,
      });
    }

    if (roomId) {
      const room = getWarRoom(roomId);
      if (!room)
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      return new Response(JSON.stringify(room), { headers: API_RESPONSE_HEADERS });
    }
    if (joinCode) {
      const room = findWarRoomByCode(joinCode);
      if (!room)
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
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
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
