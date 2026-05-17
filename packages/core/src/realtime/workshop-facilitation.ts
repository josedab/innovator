import { randomUUID } from "node:crypto";
import { z } from "zod";

export const WorkshopRoomSchema = z.object({
  id: z.string(),
  name: z.string().max(500),
  facilitatorId: z.string(),
  participants: z.array(
    z.object({
      userId: z.string(),
      displayName: z.string().max(200),
      role: z.enum(["facilitator", "participant", "observer"]),
      joinedAt: z.string(),
      isOnline: z.boolean(),
    })
  ),
  phase: z.enum(["lobby", "ideation", "voting", "discussion", "summary"]),
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["transcript", "whiteboard", "design", "document"]),
        title: z.string().max(500),
        content: z.string().max(10000),
        addedBy: z.string(),
        addedAt: z.string(),
      })
    )
    .max(50),
  votes: z.record(z.array(z.string())),
  sessionSummary: z.string().max(5000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkshopRoom = z.infer<typeof WorkshopRoomSchema>;

const workshopRooms = new Map<string, WorkshopRoom>();
const PHASE_SEQUENCE: WorkshopRoom["phase"][] = [
  "lobby",
  "ideation",
  "voting",
  "discussion",
  "summary",
];

function persistRoom(room: WorkshopRoom): WorkshopRoom {
  const parsed = WorkshopRoomSchema.parse(room);
  workshopRooms.set(parsed.id, parsed);
  return parsed;
}

function touch(room: WorkshopRoom): WorkshopRoom {
  return persistRoom({
    ...room,
    updatedAt: new Date().toISOString(),
  });
}

export function createWorkshopRoom(name: string, facilitatorId: string): WorkshopRoom {
  const now = new Date().toISOString();
  const room = WorkshopRoomSchema.parse({
    id: randomUUID(),
    name,
    facilitatorId,
    participants: [
      {
        userId: facilitatorId,
        displayName: facilitatorId,
        role: "facilitator",
        joinedAt: now,
        isOnline: true,
      },
    ],
    phase: "lobby",
    artifacts: [],
    votes: {},
    createdAt: now,
    updatedAt: now,
  });

  workshopRooms.set(room.id, room);
  return room;
}

export function getWorkshopRoom(id: string): WorkshopRoom | undefined {
  return workshopRooms.get(id);
}

export function joinWorkshopRoom(
  roomId: string,
  userId: string,
  displayName: string,
  role: "participant" | "observer" = "participant"
): WorkshopRoom | undefined {
  const room = workshopRooms.get(roomId);
  if (!room) return undefined;

  const participants = room.participants.map((participant) =>
    participant.userId === userId
      ? {
          ...participant,
          displayName,
          role: participant.role === "facilitator" ? participant.role : role,
          isOnline: true,
        }
      : participant
  );

  if (!participants.some((participant) => participant.userId === userId)) {
    participants.push({
      userId,
      displayName,
      role,
      joinedAt: new Date().toISOString(),
      isOnline: true,
    });
  }

  return touch({
    ...room,
    participants,
  });
}

export function leaveWorkshopRoom(roomId: string, userId: string): WorkshopRoom | undefined {
  const room = workshopRooms.get(roomId);
  if (!room) return undefined;
  if (!room.participants.some((participant) => participant.userId === userId)) return undefined;

  return touch({
    ...room,
    participants: room.participants.map((participant) =>
      participant.userId === userId ? { ...participant, isOnline: false } : participant
    ),
  });
}

export function advancePhase(roomId: string, facilitatorId: string): WorkshopRoom | undefined {
  const room = workshopRooms.get(roomId);
  if (!room || room.facilitatorId !== facilitatorId) return undefined;

  const currentIndex = PHASE_SEQUENCE.indexOf(room.phase);
  const nextPhase = PHASE_SEQUENCE[Math.min(currentIndex + 1, PHASE_SEQUENCE.length - 1)];

  return touch({
    ...room,
    phase: nextPhase,
  });
}

export function addWorkshopArtifact(
  roomId: string,
  artifact: {
    type: "transcript" | "whiteboard" | "design" | "document";
    title: string;
    content: string;
    addedBy: string;
  }
): WorkshopRoom | undefined {
  const room = workshopRooms.get(roomId);
  if (!room) return undefined;
  if (room.artifacts.length >= 50) return undefined;

  return touch({
    ...room,
    artifacts: [
      ...room.artifacts,
      {
        id: randomUUID(),
        type: artifact.type,
        title: artifact.title,
        content: artifact.content,
        addedBy: artifact.addedBy,
        addedAt: new Date().toISOString(),
      },
    ],
  });
}

export function castWorkshopVote(
  roomId: string,
  ideaId: string,
  userId: string
): WorkshopRoom | undefined {
  const room = workshopRooms.get(roomId);
  if (!room) return undefined;
  if (!room.participants.some((participant) => participant.userId === userId)) return undefined;

  const currentVotes = new Set(room.votes[ideaId] ?? []);
  currentVotes.add(userId);

  return touch({
    ...room,
    votes: {
      ...room.votes,
      [ideaId]: Array.from(currentVotes),
    },
  });
}

export function generateWorkshopSummary(roomId: string): string | undefined {
  const room = workshopRooms.get(roomId);
  if (!room) return undefined;

  const onlineParticipants = room.participants.filter((participant) => participant.isOnline).length;
  const topVotes = Object.entries(room.votes)
    .map(([ideaId, voterIds]) => ({ ideaId, count: voterIds.length }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const artifactBreakdown = room.artifacts.reduce<Record<string, number>>(
    (accumulator, artifact) => {
      accumulator[artifact.type] = (accumulator[artifact.type] ?? 0) + 1;
      return accumulator;
    },
    {}
  );

  const summary = [
    `Workshop \"${room.name}\" is in the ${room.phase} phase.`,
    `Participants: ${room.participants.length} total, ${onlineParticipants} online.`,
    `Artifacts: ${room.artifacts.length} (${
      Object.entries(artifactBreakdown)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ") || "none"
    }).`,
    topVotes.length > 0
      ? `Top votes: ${topVotes.map((entry) => `${entry.ideaId} (${entry.count})`).join(", ")}.`
      : "Top votes: none yet.",
  ].join(" ");

  touch({
    ...room,
    sessionSummary: summary,
  });

  return summary;
}

export function listWorkshopRooms(): WorkshopRoom[] {
  return Array.from(workshopRooms.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function clearWorkshopRooms(): void {
  workshopRooms.clear();
}
