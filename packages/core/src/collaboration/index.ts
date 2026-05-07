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

/**
 * Create a new collaborative session for real-time idea generation.
 *
 * Initializes a session with a unique room code, registers the host as the
 * first participant, and stores it in the in-memory session store.
 *
 * @param subject - The innovation subject to collaborate on
 * @param hostUserId - Unique identifier for the session host
 * @param hostDisplayName - Display name shown to other participants
 * @returns The newly created {@link CollaborativeSession} with status `"waiting"`
 */
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

/**
 * Find a collaborative session by its human-friendly room code.
 *
 * @param roomCode - The 6-character alphanumeric room code (e.g. `"A3K9M2"`)
 * @returns The matching {@link CollaborativeSession}, or `undefined` if not found
 */
export function findSessionByCode(roomCode: string): CollaborativeSession | undefined {
  for (const session of sessions.values()) {
    if (session.roomCode === roomCode) return session;
  }
  return undefined;
}

/**
 * Get a collaborative session by its unique ID.
 *
 * @param id - The UUID of the session
 * @returns The {@link CollaborativeSession}, or `undefined` if not found
 */
export function getCollaborativeSession(id: string): CollaborativeSession | undefined {
  return sessions.get(id);
}

/**
 * Join an existing collaborative session as a participant.
 *
 * If the user has already joined, their status is updated to `"connected"`.
 * Joining a completed session is not allowed.
 *
 * @param sessionId - The UUID of the session to join
 * @param userId - Unique identifier for the joining user
 * @param displayName - Display name shown to other participants
 * @returns The {@link SessionParticipant} record, or `undefined` if the session
 *          does not exist or is completed
 */
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

/**
 * Leave or disconnect from a collaborative session.
 *
 * Sets the participant's status to `"disconnected"` and emits a
 * `participant_left` event.
 *
 * @param sessionId - The UUID of the session
 * @param userId - The user leaving the session
 * @returns `true` if the user was found and disconnected, `false` otherwise
 */
export function leaveSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return false;

  participant.status = "disconnected";
  emitEvent(sessionId, { type: "participant_left", userId });
  return true;
}

/**
 * Assign innovation angles to a participant for focused ideation.
 *
 * @param sessionId - The UUID of the session
 * @param userId - The participant to assign angles to
 * @param angles - Array of {@link AngleId} values to assign
 * @returns `true` if assignment succeeded, `false` if session or user not found
 */
export function assignAngles(sessionId: string, userId: string, angles: AngleId[]): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return false;

  participant.assignedAngles = angles;
  session.angleAssignments[userId] = angles;
  emitEvent(sessionId, { type: "angle_assigned", userId, angles });
  return true;
}

/**
 * Start a collaborative session, transitioning it to the `"active"` state.
 *
 * Only the session host can start the session.
 *
 * @param sessionId - The UUID of the session
 * @param userId - Must match the session's `hostUserId`
 * @returns `true` if the session was started, `false` if not found or not the host
 */
export function startSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.hostUserId !== userId) return false;

  session.status = "active";
  emitEvent(sessionId, { type: "session_started", subject: session.subject });
  return true;
}

/**
 * Submit an idea to an active collaborative session.
 *
 * Ideas can only be submitted when the session status is `"active"`.
 *
 * @param sessionId - The UUID of the session
 * @param authorId - The user submitting the idea
 * @param angleId - The angle this idea was generated under
 * @param title - Short title for the idea
 * @param description - Full description of the idea
 * @param potentialImpact - Description of potential impact
 * @returns The created {@link CollaborativeIdea}, or `undefined` if the session
 *          is not found or not active
 */
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

/**
 * Vote for an idea in a collaborative session.
 *
 * Each user can vote once per idea. Duplicate votes are silently rejected.
 *
 * @param sessionId - The UUID of the session
 * @param ideaId - The UUID of the idea to vote for
 * @param userId - The user casting the vote
 * @returns `true` if the vote was recorded, `false` if already voted or not found
 */
export function voteForIdea(sessionId: string, ideaId: string, userId: string): boolean {
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

/**
 * Add a comment to an idea in a collaborative session.
 *
 * @param sessionId - The UUID of the session
 * @param ideaId - The UUID of the idea to comment on
 * @param authorId - The user adding the comment
 * @param authorName - Display name of the comment author
 * @param content - The comment text
 * @returns The created {@link IdeaComment}, or `undefined` if session or idea not found
 */
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

/**
 * Merge multiple ideas into a single combined idea.
 *
 * Requires at least 2 source ideas. Votes are summed and impact descriptions
 * are concatenated. The merged idea uses `"merged"` as its angle ID.
 *
 * @param sessionId - The UUID of the session
 * @param ideaIds - Array of idea UUIDs to merge (minimum 2)
 * @param mergedTitle - Title for the merged idea
 * @param mergedDescription - Description for the merged idea
 * @param authorId - The user performing the merge
 * @returns The merged {@link CollaborativeIdea}, or `undefined` if fewer than 2
 *          source ideas were found
 */
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

/**
 * Complete a collaborative session, preventing further idea submissions.
 *
 * Only the session host can complete the session.
 *
 * @param sessionId - The UUID of the session
 * @param userId - Must match the session's `hostUserId`
 * @returns `true` if the session was completed, `false` if not found or not the host
 */
export function completeSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.hostUserId !== userId) return false;

  session.status = "completed";
  emitEvent(sessionId, { type: "session_completed" });
  return true;
}

/**
 * Subscribe to real-time events for a collaborative session.
 *
 * @param sessionId - The UUID of the session to watch
 * @param listener - Callback invoked with each {@link CollaborativeEvent}
 * @returns An unsubscribe function — call it to stop receiving events
 */
export function onSessionEvent(sessionId: string, listener: EventListener): () => void {
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

/**
 * Get all ideas from a session ranked by vote count (descending).
 *
 * @param sessionId - The UUID of the session
 * @returns Sorted array of {@link CollaborativeIdea}, or empty array if not found
 */
export function getRankedIdeas(sessionId: string): CollaborativeIdea[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return [...session.ideas].sort((a, b) => b.votes - a.votes);
}

/**
 * Delete a collaborative session and its event listeners.
 *
 * Intended for testing and cleanup purposes.
 *
 * @param id - The UUID of the session to delete
 * @returns `true` if the session existed and was deleted
 */
export function deleteCollaborativeSession(id: string): boolean {
  listeners.delete(id);
  return sessions.delete(id);
}

/**
 * Clear all collaborative sessions and event listeners.
 *
 * Intended for testing teardown.
 */
export function clearAllSessions(): void {
  sessions.clear();
  listeners.clear();
}
