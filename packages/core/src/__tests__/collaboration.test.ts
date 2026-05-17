import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  findSessionByCode,
  getCollaborativeSession,
  joinSession,
  leaveSession,
  assignAngles,
  startSession,
  submitIdea,
  voteForIdea,
  addComment,
  mergeIdeas,
  completeSession,
  onSessionEvent,
  getRankedIdeas,
  clearAllSessions,
} from "../collaboration/index.js";
import type { CollaborativeEvent } from "../types.js";

describe("collaboration", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it("creates a session with room code", () => {
    const session = createSession("Solar energy", "host-1", "Alice");
    expect(session.id).toBeTruthy();
    expect(session.roomCode).toHaveLength(6);
    expect(session.subject).toBe("Solar energy");
    expect(session.status).toBe("waiting");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].isHost).toBe(true);
  });

  it("finds session by room code", () => {
    const session = createSession("Test", "host-1", "Alice");
    const found = findSessionByCode(session.roomCode);
    expect(found?.id).toBe(session.id);
  });

  it("gets session by ID", () => {
    const session = createSession("Test", "host-1", "Alice");
    const found = getCollaborativeSession(session.id);
    expect(found?.id).toBe(session.id);
  });

  it("allows participants to join", () => {
    const session = createSession("Test", "host-1", "Alice");
    const participant = joinSession(session.id, "user-2", "Bob");
    expect(participant?.displayName).toBe("Bob");
    expect(participant?.isHost).toBe(false);

    const updated = getCollaborativeSession(session.id);
    expect(updated?.participants).toHaveLength(2);
  });

  it("reconnects existing participants", () => {
    const session = createSession("Test", "host-1", "Alice");
    joinSession(session.id, "user-2", "Bob");
    leaveSession(session.id, "user-2");

    const reconnected = joinSession(session.id, "user-2", "Bob");
    expect(reconnected?.status).toBe("connected");
  });

  it("assigns angles to participants", () => {
    const session = createSession("Test", "host-1", "Alice");
    const result = assignAngles(session.id, "host-1", ["scamper", "inversion"]);
    expect(result).toBe(true);

    const updated = getCollaborativeSession(session.id);
    expect(updated?.participants[0].assignedAngles).toEqual(["scamper", "inversion"]);
  });

  it("starts and completes sessions", () => {
    const session = createSession("Test", "host-1", "Alice");
    expect(startSession(session.id, "host-1")).toBe(true);
    expect(getCollaborativeSession(session.id)?.status).toBe("active");

    expect(completeSession(session.id, "host-1")).toBe(true);
    expect(getCollaborativeSession(session.id)?.status).toBe("completed");
  });

  it("only host can start/complete sessions", () => {
    const session = createSession("Test", "host-1", "Alice");
    joinSession(session.id, "user-2", "Bob");
    expect(startSession(session.id, "user-2")).toBe(false);
  });

  it("submits ideas in active sessions", () => {
    const session = createSession("Test", "host-1", "Alice");
    startSession(session.id, "host-1");

    const idea = submitIdea(
      session.id,
      "host-1",
      "scamper",
      "Great Idea",
      "Description",
      "High impact"
    );
    expect(idea?.title).toBe("Great Idea");
    expect(idea?.votes).toBe(0);
  });

  it("rejects ideas in non-active sessions", () => {
    const session = createSession("Test", "host-1", "Alice");
    // Session is in "waiting" status
    const idea = submitIdea(session.id, "host-1", "scamper", "Idea", "Desc", "Impact");
    expect(idea).toBeUndefined();
  });

  it("handles voting", () => {
    const session = createSession("Test", "host-1", "Alice");
    startSession(session.id, "host-1");
    joinSession(session.id, "user-2", "Bob");

    const idea = submitIdea(session.id, "host-1", "scamper", "Idea", "Desc", "Impact")!;
    expect(voteForIdea(session.id, idea.id, "user-2")).toBe(true);
    expect(voteForIdea(session.id, idea.id, "user-2")).toBe(false); // duplicate vote

    const updated = getCollaborativeSession(session.id);
    const updatedIdea = updated?.ideas.find((i) => i.id === idea.id);
    expect(updatedIdea?.votes).toBe(1);
  });

  it("adds comments to ideas", () => {
    const session = createSession("Test", "host-1", "Alice");
    startSession(session.id, "host-1");

    const idea = submitIdea(session.id, "host-1", "scamper", "Idea", "Desc", "Impact")!;
    const comment = addComment(session.id, idea.id, "host-1", "Alice", "Great point!");
    expect(comment?.content).toBe("Great point!");
  });

  it("merges ideas", () => {
    const session = createSession("Test", "host-1", "Alice");
    startSession(session.id, "host-1");

    const idea1 = submitIdea(session.id, "host-1", "scamper", "Idea 1", "Desc 1", "Impact 1")!;
    const idea2 = submitIdea(session.id, "host-1", "inversion", "Idea 2", "Desc 2", "Impact 2")!;

    const merged = mergeIdeas(
      session.id,
      [idea1.id, idea2.id],
      "Merged Idea",
      "Combined description",
      "host-1"
    );
    expect(merged?.title).toBe("Merged Idea");
    expect(merged?.angleId).toBe("merged");
  });

  it("ranks ideas by votes", () => {
    const session = createSession("Test", "host-1", "Alice");
    startSession(session.id, "host-1");
    joinSession(session.id, "user-2", "Bob");
    joinSession(session.id, "user-3", "Charlie");

    const idea1 = submitIdea(session.id, "host-1", "scamper", "Low votes", "Desc", "Impact")!;
    const idea2 = submitIdea(session.id, "host-1", "inversion", "High votes", "Desc", "Impact")!;

    voteForIdea(session.id, idea2.id, "user-2");
    voteForIdea(session.id, idea2.id, "user-3");
    voteForIdea(session.id, idea1.id, "user-2");

    const ranked = getRankedIdeas(session.id);
    expect(ranked[0].title).toBe("High votes");
    expect(ranked[0].votes).toBe(2);
  });

  it("emits events to listeners", () => {
    const session = createSession("Test", "host-1", "Alice");
    const events: CollaborativeEvent[] = [];
    onSessionEvent(session.id, (e) => events.push(e));

    joinSession(session.id, "user-2", "Bob");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("participant_joined");
  });

  it("unsubscribes from events", () => {
    const session = createSession("Test", "host-1", "Alice");
    const events: CollaborativeEvent[] = [];
    const unsub = onSessionEvent(session.id, (e) => events.push(e));

    joinSession(session.id, "user-2", "Bob");
    unsub();
    joinSession(session.id, "user-3", "Charlie");

    expect(events).toHaveLength(1);
  });
});
