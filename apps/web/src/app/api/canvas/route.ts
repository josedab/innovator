/**
 * @description Collaborative canvas state management for multi-user brainstorming.
 */
export const runtime = "nodejs";

import {
  createCanvasRoom,
  getCanvasRoom,
  getCanvasRoomBySession,
  applyRoomOperation,
  serializeCollaborativeState,
  generateVotingHeatMap,
  autoClusterNodes,
  suggestConnections,
  synthesizeCanvas,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateRoomSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1).max(500),
  creatorId: z.string().min(1),
  maxParticipants: z.number().int().min(2).max(50).optional(),
});

const OperationSchema = z.object({
  roomId: z.string().min(1),
  type: z.enum([
    "add_node",
    "move_node",
    "remove_node",
    "update_node",
    "add_edge",
    "remove_edge",
    "add_annotation",
    "update_annotation",
    "remove_annotation",
    "add_cluster",
    "vote",
    "unvote",
    "cursor_update",
    "viewport_sync",
  ]),
  userId: z.string().min(1),
  data: z.record(z.unknown()),
});

const AIActionSchema = z.object({
  roomId: z.string().min(1),
  action: z.enum(["cluster", "suggest_connections", "synthesize", "heatmap"]),
});

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const sessionId = searchParams.get("sessionId");
  const action = searchParams.get("action");

  const room = roomId
    ? getCanvasRoom(roomId)
    : sessionId
      ? getCanvasRoomBySession(sessionId)
      : undefined;

  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
  }

  if (action === "heatmap") {
    const heatMap = generateVotingHeatMap(room.state);
    return Response.json({ heatMap }, { headers: API_RESPONSE_HEADERS });
  }

  if (action === "ai-overlay") {
    const clusters = autoClusterNodes(room.state.canvas.nodes);
    const suggestions = suggestConnections(room.state.canvas.nodes, room.state.canvas.edges);
    const synthesis = synthesizeCanvas(room.state.canvas);
    return Response.json({ clusters, suggestions, synthesis }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json(
    {
      room: {
        id: room.id,
        sessionId: room.sessionId,
        maxParticipants: room.maxParticipants,
        createdAt: room.createdAt,
      },
      state: serializeCollaborativeState(room.state),
    },
    { headers: API_RESPONSE_HEADERS }
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const payload = body as Record<string, unknown>;
  const actionType = payload.action as string | undefined;

  // Create room
  if (actionType === "create") {
    const parsed = CreateRoomSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const { sessionId, title, creatorId, maxParticipants } = parsed.data;
    const room = createCanvasRoom(sessionId, title, creatorId, maxParticipants);
    return Response.json(
      { room: { id: room.id, sessionId: room.sessionId, createdAt: room.createdAt } },
      { status: 201, headers: API_RESPONSE_HEADERS }
    );
  }

  // Apply operation
  if (actionType === "operation") {
    const parsed = OperationSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid operation", details: parsed.error.flatten() },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const { roomId, type, userId, data } = parsed.data;
    const operation = applyRoomOperation(roomId, type, userId, data);
    if (!operation) {
      return Response.json(
        { error: "Operation failed — room not found or at capacity" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    return Response.json({ operation }, { headers: API_RESPONSE_HEADERS });
  }

  // AI actions
  if (actionType === "ai") {
    const parsed = AIActionSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid AI action", details: parsed.error.flatten() },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const room = getCanvasRoom(parsed.data.roomId);
    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
    }

    switch (parsed.data.action) {
      case "cluster":
        return Response.json(
          { clusters: autoClusterNodes(room.state.canvas.nodes) },
          { headers: API_RESPONSE_HEADERS }
        );
      case "suggest_connections":
        return Response.json(
          { suggestions: suggestConnections(room.state.canvas.nodes, room.state.canvas.edges) },
          { headers: API_RESPONSE_HEADERS }
        );
      case "synthesize":
        return Response.json(
          { synthesis: synthesizeCanvas(room.state.canvas) },
          { headers: API_RESPONSE_HEADERS }
        );
      case "heatmap":
        return Response.json(
          { heatMap: generateVotingHeatMap(room.state) },
          { headers: API_RESPONSE_HEADERS }
        );
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
