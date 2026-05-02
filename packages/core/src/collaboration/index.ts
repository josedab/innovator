/**
 * @module collaboration
 *
 * In-memory collaborative session management.
 * Provides room creation, participant management, idea submission,
 * voting, commenting, and idea merging.
 *
 * In production, this would be backed by a database and WebSocket server
 * (Socket.io or Partykit). This module implements the core logic that
 * can be wired into any real-time transport.
 */

import { randomUUID } from "node:crypto";
import type {
  CollaborativeSession,
  SessionParticipant,
  CollaborativeIdea,
  IdeaComment,
  CollaborativeEvent,
  AngleId,
} from "../types.js";

/** In-memory session store. In production, use Redis/database. */
const sessions = new Map<string, CollaborativeSession>();

/** Event listeners for session updates. */
type EventListener = (event: CollaborativeEvent) => void;
const listeners = new Map<string, Set<EventListener>>();

/** Generate a human-friendly room code. */
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Create a new collaborative session. */
export function createSession(
  subject: string,
  hostUserId: string,
  hostDisplayName: string
): CollaborativeSession {
  const id = randomUUID();
  const roomCode = generateRoomCode();
  const now = new Date().toISOString();

  const host: SessionParticipant = {
    userId: hostUserId,
    displayName: hostDisplayName,
    joinedAt: now,
    isHost: true,
    assignedAngles: [],
    status: "connected",
  };

  const session: CollaborativeSession = {
    id,
    roomCode,
    subject,
    hostUserId,
    createdAt: now,
    status: "waiting",
    participants: [host],
    angleAssignments: {},
    ideas: [],
    votes: {},
  };

  sessions.set(id, session);
  return session;
}

/** Find a session by room code. */
export function findSessionByCode(roomCode: string): CollaborativeSession | undefined {
  for (const session of sessions.values()) {
    if (session.roomCode === roomCode) return session;
  }
  return undefined;
}

/** Get a session by ID. */
export function getCollaborativeSession(id: string): CollaborativeSession | undefined {
  return sessions.get(id);
}

/** Join a session. */
export function joinSession(
  sessionId: string,
  userId: string,
  displayName: string
): SessionParticipant | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.status === "completed") return undefined;

  // Check if already joined
  const existing = session.participants.find((p) => p.userId === userId);
  if (existing) {
    existing.status = "connected";
    return existing;
  }

  const participant: SessionParticipant = {
    userId,
    displayName,
    joinedAt: new Date().toISOString(),
    isHost: false,
    assignedAngles: [],
    status: "connected",
  };

  session.participants.push(participant);
  emitEvent(sessionId, { type: "participant_joined", participant });
  return participant;
}

/** Leave/disconnect from a session. */
export function leaveSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return false;

  participant.status = "disconnected";
  emitEvent(sessionId, { type: "participant_left", userId });
  return true;
}

/** Assign angles to a participant. */
export function assignAngles(
  sessionId: string,
  userId: string,
  angles: AngleId[]
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return false;

  participant.assignedAngles = angles;
  session.angleAssignments[userId] = angles;
  emitEvent(sessionId, { type: "angle_assigned", userId, angles });
  return true;
}

/** Start the session (begin ideation). */
export function startSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.hostUserId !== userId) return false;

  session.status = "active";
  emitEvent(sessionId, { type: "session_started", subject: session.subject });
  return true;
}

/** Submit an idea to the session. */
export function submitIdea(
  sessionId: string,
  authorId: string,
  angleId: string,
  title: string,
  description: string,
  potentialImpact: string
): CollaborativeIdea | undefined {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "active") return undefined;

  const idea: CollaborativeIdea = {
    id: randomUUID(),
    authorId,
    angleId,
    title,
    description,
    potentialImpact,
    votes: 0,
    comments: [],
    createdAt: new Date().toISOString(),
  };

  session.ideas.push(idea);
  emitEvent(sessionId, { type: "idea_submitted", idea });
  return idea;
}

/** Vote for an idea. Each user can vote once per idea. */
export function voteForIdea(
  sessionId: string,
  ideaId: string,
  userId: string
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const idea = session.ideas.find((i) => i.id === ideaId);
  if (!idea) return false;

  // Track who voted
  if (!session.votes[ideaId]) {
    session.votes[ideaId] = [];
  }
  if (session.votes[ideaId].includes(userId)) return false;

  session.votes[ideaId].push(userId);
  idea.votes++;
  emitEvent(sessionId, { type: "idea_voted", ideaId, userId, votes: idea.votes });
  return true;
}

/** Add a comment to an idea. */
export function addComment(
  sessionId: string,
  ideaId: string,
  authorId: string,
  authorName: string,
  content: string
): IdeaComment | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  const idea = session.ideas.find((i) => i.id === ideaId);
  if (!idea) return undefined;

  const comment: IdeaComment = {
    id: randomUUID(),
    authorId,
    authorName,
    content,
    createdAt: new Date().toISOString(),
  };

  idea.comments.push(comment);
  emitEvent(sessionId, { type: "comment_added", ideaId, comment });
  return comment;
}

/** Merge multiple ideas into one. */
export function mergeIdeas(
  sessionId: string,
  ideaIds: string[],
  mergedTitle: string,
  mergedDescription: string,
  authorId: string
): CollaborativeIdea | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  const sourceIdeas = session.ideas.filter((i) => ideaIds.includes(i.id));
  if (sourceIdeas.length < 2) return undefined;

  const mergedIdea: CollaborativeIdea = {
    id: randomUUID(),
    authorId,
    angleId: "merged",
    title: mergedTitle,
    description: mergedDescription,
    potentialImpact: sourceIdeas.map((i) => i.potentialImpact).join("; "),
    votes: sourceIdeas.reduce((sum, i) => sum + i.votes, 0),
    comments: [],
    createdAt: new Date().toISOString(),
  };

  session.ideas.push(mergedIdea);
  emitEvent(sessionId, { type: "ideas_merged", sourceIds: ideaIds, mergedIdea });
  return mergedIdea;
}

/** Complete a session. */
export function completeSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.hostUserId !== userId) return false;

  session.status = "completed";
  emitEvent(sessionId, { type: "session_completed" });
  return true;
}

/** Subscribe to session events. Returns unsubscribe function. */
export function onSessionEvent(
  sessionId: string,
  listener: EventListener
): () => void {
  if (!listeners.has(sessionId)) {
    listeners.set(sessionId, new Set());
  }
  listeners.get(sessionId)!.add(listener);
  return () => {
    listeners.get(sessionId)?.delete(listener);
  };
}

/** Emit an event to all listeners. */
function emitEvent(sessionId: string, event: CollaborativeEvent): void {
  const sessionListeners = listeners.get(sessionId);
  if (!sessionListeners) return;
  for (const listener of sessionListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

/** Get ranked ideas by votes. */
export function getRankedIdeas(sessionId: string): CollaborativeIdea[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return [...session.ideas].sort((a, b) => b.votes - a.votes);
}

/** Delete a session (for testing/cleanup). */
export function deleteCollaborativeSession(id: string): boolean {
  listeners.delete(id);
  return sessions.delete(id);
}

/** Clear all sessions (for testing). */
export function clearAllSessions(): void {
  sessions.clear();
  listeners.clear();
}
