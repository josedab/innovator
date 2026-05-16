/**
 * @module realtime/war-room
 *
 * Real-Time Collaborative War Room — multi-user innovation sessions with
 * role assignments (facilitator/participant/observer), shared canvas,
 * synchronized pipeline execution, and operational transform protocol.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const WarRoomRoleSchema = z.enum(["facilitator", "participant", "observer"]);
export type WarRoomRole = z.infer<typeof WarRoomRoleSchema>;

export const WarRoomMemberSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  role: WarRoomRoleSchema,
  cursor: z.object({ x: z.number(), y: z.number() }).optional(),
  isActive: z.boolean().default(true),
  joinedAt: z.string(),
  lastActivity: z.string(),
});
export type WarRoomMember = z.infer<typeof WarRoomMemberSchema>;

export const WarRoomPhaseSchema = z.enum([
  "lobby",
  "investigation",
  "ideation",
  "scoring",
  "synthesis",
  "review",
  "closed",
]);
export type WarRoomPhase = z.infer<typeof WarRoomPhaseSchema>;

export const WarRoomVoteSchema = z.object({
  id: z.string().max(100),
  ideaId: z.string().max(100),
  userId: z.string().max(200),
  value: z.number().min(-1).max(1),
  comment: z.string().max(500).optional(),
  timestamp: z.string(),
});
export type WarRoomVote = z.infer<typeof WarRoomVoteSchema>;

export const CanvasObjectSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["sticky-note", "idea-card", "connector", "annotation", "group"]),
  content: z.string().max(5000),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  color: z.string().max(20).optional(),
  createdBy: z.string().max(200),
  connectedTo: z.array(z.string().max(100)).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type CanvasObject = z.infer<typeof CanvasObjectSchema>;

export const OperationSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["insert", "update", "delete", "move"]),
  targetId: z.string().max(100),
  userId: z.string().max(200),
  data: z.record(z.unknown()).default({}),
  version: z.number().int().min(0),
  timestamp: z.string(),
});
export type Operation = z.infer<typeof OperationSchema>;

export const PipelineExecutionSchema = z.object({
  id: z.string().max(100),
  phase: WarRoomPhaseSchema,
  status: z.enum(["pending", "running", "completed", "failed"]),
  subject: z.string().max(500),
  progress: z.number().min(0).max(100),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  resultSummary: z.string().max(5000).optional(),
});
export type PipelineExecution = z.infer<typeof PipelineExecutionSchema>;

export const WarRoomSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  joinCode: z.string().max(10),
  phase: WarRoomPhaseSchema,
  members: z.array(WarRoomMemberSchema).max(50),
  canvas: z.array(CanvasObjectSchema).max(500),
  votes: z.array(WarRoomVoteSchema).max(1000),
  operations: z.array(OperationSchema).max(5000),
  pipelineExecution: PipelineExecutionSchema.optional(),
  version: z.number().int().min(0).default(0),
  settings: z
    .object({
      maxParticipants: z.number().int().min(2).max(50).default(20),
      allowObserverChat: z.boolean().default(false),
      autoAdvancePhases: z.boolean().default(false),
      votingEnabled: z.boolean().default(true),
      anonymousVoting: z.boolean().default(false),
    })
    .default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WarRoom = z.infer<typeof WarRoomSchema>;

// ---- In-Memory Store ----

const warRooms = new Map<string, WarRoom>();

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ---- War Room Management ----

/**
 * Create a new war room session.
 */
export function createWarRoom(params: {
  name: string;
  facilitatorId: string;
  facilitatorName: string;
  settings?: Partial<WarRoom["settings"]>;
}): WarRoom {
  const now = new Date().toISOString();
  const room: WarRoom = {
    id: randomUUID(),
    name: params.name,
    joinCode: generateJoinCode(),
    phase: "lobby",
    members: [
      {
        userId: params.facilitatorId,
        displayName: params.facilitatorName,
        role: "facilitator",
        isActive: true,
        joinedAt: now,
        lastActivity: now,
      },
    ],
    canvas: [],
    votes: [],
    operations: [],
    version: 0,
    settings: {
      maxParticipants: 20,
      allowObserverChat: false,
      autoAdvancePhases: false,
      votingEnabled: true,
      anonymousVoting: false,
      ...params.settings,
    },
    createdAt: now,
    updatedAt: now,
  };
  warRooms.set(room.id, room);
  return room;
}

/**
 * Get a war room by ID.
 */
export function getWarRoom(roomId: string): WarRoom | undefined {
  return warRooms.get(roomId);
}

/**
 * Find a war room by join code.
 */
export function findWarRoomByCode(code: string): WarRoom | undefined {
  for (const room of warRooms.values()) {
    if (room.joinCode === code.toUpperCase()) return room;
  }
  return undefined;
}

/**
 * Join a war room.
 */
export function joinWarRoom(
  roomId: string,
  userId: string,
  displayName: string,
  role: WarRoomRole = "participant"
): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);
  if (room.phase === "closed") throw new Error("War room is closed");

  const existing = room.members.find((m) => m.userId === userId);
  if (existing) {
    existing.isActive = true;
    existing.lastActivity = new Date().toISOString();
    room.updatedAt = new Date().toISOString();
    return room;
  }

  const activeCount = room.members.filter((m) => m.isActive).length;
  if (activeCount >= room.settings.maxParticipants) {
    throw new Error("War room is at capacity");
  }

  const now = new Date().toISOString();
  room.members.push({
    userId,
    displayName,
    role,
    isActive: true,
    joinedAt: now,
    lastActivity: now,
  });
  room.updatedAt = now;
  return room;
}

/**
 * Leave a war room.
 */
export function leaveWarRoom(roomId: string, userId: string): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);

  const member = room.members.find((m) => m.userId === userId);
  if (member) {
    member.isActive = false;
    member.lastActivity = new Date().toISOString();
  }
  room.updatedAt = new Date().toISOString();
  return room;
}

/**
 * Update a member's role (facilitator-only).
 */
export function setMemberRole(
  roomId: string,
  requesterId: string,
  targetUserId: string,
  newRole: WarRoomRole
): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);

  const requester = room.members.find((m) => m.userId === requesterId);
  if (!requester || requester.role !== "facilitator") {
    throw new Error("Only facilitators can change roles");
  }

  const target = room.members.find((m) => m.userId === targetUserId);
  if (!target) throw new Error(`Member "${targetUserId}" not found`);

  target.role = newRole;
  room.updatedAt = new Date().toISOString();
  return room;
}

// ---- Phase Management ----

const PHASE_ORDER: WarRoomPhase[] = [
  "lobby",
  "investigation",
  "ideation",
  "scoring",
  "synthesis",
  "review",
  "closed",
];

/**
 * Advance the war room to the next phase (facilitator-only).
 */
export function advanceWarRoomPhase(roomId: string, facilitatorId: string): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);

  const facilitator = room.members.find((m) => m.userId === facilitatorId);
  if (!facilitator || facilitator.role !== "facilitator") {
    throw new Error("Only facilitators can advance phases");
  }

  const currentIdx = PHASE_ORDER.indexOf(room.phase);
  if (currentIdx >= PHASE_ORDER.length - 1) {
    throw new Error("War room is already in final phase");
  }

  room.phase = PHASE_ORDER[currentIdx + 1];
  room.updatedAt = new Date().toISOString();
  room.version++;
  return room;
}

// ---- Canvas Operations (Operational Transform) ----

/**
 * Apply an operation to the canvas with version checking.
 */
export function applyCanvasOperation(roomId: string, operation: Operation): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);

  const member = room.members.find((m) => m.userId === operation.userId);
  if (!member) throw new Error("Not a member of this war room");
  if (member.role === "observer") throw new Error("Observers cannot modify the canvas");

  // Version conflict detection
  if (operation.version < room.version) {
    // Transform the operation against concurrent operations
    const conflicting = room.operations.filter(
      (op) => op.version >= operation.version && op.id !== operation.id
    );
    if (conflicting.some((op) => op.targetId === operation.targetId && op.type === "delete")) {
      throw new Error("Target object was deleted by a concurrent operation");
    }
  }

  switch (operation.type) {
    case "insert": {
      const obj = CanvasObjectSchema.parse({
        id: operation.targetId,
        type: (operation.data.type as string) ?? "sticky-note",
        content: (operation.data.content as string) ?? "",
        position: (operation.data.position as { x: number; y: number }) ?? { x: 0, y: 0 },
        size: operation.data.size,
        color: operation.data.color,
        createdBy: operation.userId,
      });
      room.canvas.push(obj);
      break;
    }
    case "update": {
      const idx = room.canvas.findIndex((o) => o.id === operation.targetId);
      if (idx === -1) throw new Error(`Canvas object "${operation.targetId}" not found`);
      Object.assign(room.canvas[idx], operation.data);
      break;
    }
    case "delete": {
      const dIdx = room.canvas.findIndex((o) => o.id === operation.targetId);
      if (dIdx !== -1) room.canvas.splice(dIdx, 1);
      break;
    }
    case "move": {
      const mIdx = room.canvas.findIndex((o) => o.id === operation.targetId);
      if (mIdx === -1) throw new Error(`Canvas object "${operation.targetId}" not found`);
      if (operation.data.position) {
        room.canvas[mIdx].position = operation.data.position as { x: number; y: number };
      }
      break;
    }
  }

  room.operations.push(operation);
  // Keep operations bounded
  if (room.operations.length > 5000) {
    room.operations = room.operations.slice(-2500);
  }
  room.version++;
  room.updatedAt = new Date().toISOString();
  return room;
}

// ---- Voting ----

/**
 * Cast a vote on an idea in the war room.
 */
export function castWarRoomVote(
  roomId: string,
  userId: string,
  ideaId: string,
  value: number,
  comment?: string
): WarRoom {
  const room = warRooms.get(roomId);
  if (!room) throw new Error(`War room "${roomId}" not found`);
  if (!room.settings.votingEnabled) throw new Error("Voting is not enabled");

  const member = room.members.find((m) => m.userId === userId);
  if (!member || member.role === "observer") throw new Error("Cannot vote as observer");

  // Remove existing vote from this user on this idea
  room.votes = room.votes.filter((v) => !(v.userId === userId && v.ideaId === ideaId));

  room.votes.push({
    id: randomUUID(),
    ideaId,
    userId: room.settings.anonymousVoting ? "anonymous" : userId,
    value: Math.max(-1, Math.min(1, value)),
    comment,
    timestamp: new Date().toISOString(),
  });

  room.updatedAt = new Date().toISOString();
  return room;
}

/**
 * Get vote tallies for all ideas in the war room.
 */
export function getWarRoomVoteTallies(roomId: string): Array<{
  ideaId: string;
  totalVotes: number;
  score: number;
  comments: string[];
}> {
  const room = warRooms.get(roomId);
  if (!room) return [];

  const tallies = new Map<string, { total: number; score: number; comments: string[] }>();
  for (const vote of room.votes) {
    const existing = tallies.get(vote.ideaId) ?? { total: 0, score: 0, comments: [] };
    existing.total++;
    existing.score += vote.value;
    if (vote.comment) existing.comments.push(vote.comment);
    tallies.set(vote.ideaId, existing);
  }

  return Array.from(tallies.entries())
    .map(([ideaId, data]) => ({
      ideaId,
      totalVotes: data.total,
      score: data.score,
      comments: data.comments,
    }))
    .sort((a, b) => b.score - a.score);
}

// ---- Cleanup ----

/**
 * Delete a war room.
 */
export function deleteWarRoom(roomId: string): boolean {
  return warRooms.delete(roomId);
}

/**
 * List all war rooms.
 */
export function listWarRooms(): WarRoom[] {
  return Array.from(warRooms.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Clear all war rooms (for testing).
 */
export function clearWarRooms(): void {
  warRooms.clear();
}
