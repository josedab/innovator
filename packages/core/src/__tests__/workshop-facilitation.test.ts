import { beforeEach, describe, expect, it } from "vitest";

import {
  WorkshopRoomSchema,
  addWorkshopArtifact,
  advancePhase,
  castWorkshopVote,
  clearWorkshopRooms,
  createWorkshopRoom,
  generateWorkshopSummary,
  getWorkshopRoom,
  joinWorkshopRoom,
  leaveWorkshopRoom,
  listWorkshopRooms,
} from "../realtime/workshop-facilitation.js";
import {
  castRealtimeWorkshopVote,
  createWorkshopRoom as createWorkshopRoomFromRealtimeIndex,
} from "../realtime/index.js";

describe("workshop-facilitation", () => {
  beforeEach(() => {
    clearWorkshopRooms();
  });

  it("creates and stores a workshop room", () => {
    const room = createWorkshopRoom("Launch workshop", "facilitator-1");

    expect(WorkshopRoomSchema.parse(room)).toEqual(room);
    expect(getWorkshopRoom(room.id)?.participants[0]).toMatchObject({
      userId: "facilitator-1",
      role: "facilitator",
      isOnline: true,
    });
  });

  it("joins and leaves participants while preserving state", () => {
    const room = createWorkshopRoom("Design sprint", "facilitator-1");

    const joined = joinWorkshopRoom(room.id, "user-2", "Avery")!;
    expect(joined.participants).toHaveLength(2);
    expect(
      joined.participants.find((participant) => participant.userId === "user-2")?.isOnline
    ).toBe(true);

    const left = leaveWorkshopRoom(room.id, "user-2")!;
    expect(left.participants.find((participant) => participant.userId === "user-2")?.isOnline).toBe(
      false
    );
  });

  it("advances phases only for the facilitator", () => {
    const room = createWorkshopRoomFromRealtimeIndex("Realtime workshop", "facilitator-1");

    expect(advancePhase(room.id, "user-2")).toBeUndefined();
    expect(advancePhase(room.id, "facilitator-1")?.phase).toBe("ideation");
    expect(advancePhase(room.id, "facilitator-1")?.phase).toBe("voting");
  });

  it("adds artifacts, casts votes, and generates summaries", () => {
    const room = createWorkshopRoom("Customer discovery", "facilitator-1");
    joinWorkshopRoom(room.id, "user-2", "Morgan");

    const withArtifact = addWorkshopArtifact(room.id, {
      type: "whiteboard",
      title: "Themes",
      content: "Grouped top customer problems and ideas.",
      addedBy: "facilitator-1",
    })!;
    expect(withArtifact.artifacts).toHaveLength(1);

    castWorkshopVote(room.id, "idea-1", "facilitator-1");
    castRealtimeWorkshopVote(room.id, "idea-1", "user-2");
    castWorkshopVote(room.id, "idea-1", "user-2");

    const summary = generateWorkshopSummary(room.id)!;
    expect(summary).toContain("Customer discovery");
    expect(getWorkshopRoom(room.id)?.votes["idea-1"]).toHaveLength(2);
    expect(getWorkshopRoom(room.id)?.sessionSummary).toContain("Top votes");
  });

  it("lists workshop rooms ordered by update time", () => {
    const first = createWorkshopRoom("First", "f-1");
    const second = createWorkshopRoom("Second", "f-2");
    joinWorkshopRoom(first.id, "user-3", "Taylor");

    const rooms = listWorkshopRooms();
    expect(rooms[0].name).toBe("First");
    expect(rooms[1].name).toBe("Second");
  });
});
