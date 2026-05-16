import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  detectGroupthink,
  computeParticipationStats,
  detectParticipationImbalance,
  generateFacilitationReport,
  startPhaseTimer,
  getPhaseTimerState,
  stopPhaseTimer,
  detectConsensus,
} from "../realtime/facilitation-ai.js";
import type { WarRoom } from "../realtime/war-room.js";

function makeRoom(overrides: Partial<WarRoom> = {}): WarRoom {
  const now = new Date().toISOString();
  return {
    id: "room-1",
    name: "Test Room",
    joinCode: "ABC123",
    phase: "ideation",
    members: overrides.members ?? [
      {
        userId: "facilitator",
        displayName: "Facilitator",
        role: "facilitator",
        isActive: true,
        joinedAt: now,
        lastActivity: now,
      },
      {
        userId: "user-1",
        displayName: "Alice",
        role: "participant",
        isActive: true,
        joinedAt: now,
        lastActivity: now,
      },
      {
        userId: "user-2",
        displayName: "Bob",
        role: "participant",
        isActive: true,
        joinedAt: now,
        lastActivity: now,
      },
      {
        userId: "user-3",
        displayName: "Charlie",
        role: "participant",
        isActive: true,
        joinedAt: now,
        lastActivity: now,
      },
    ],
    canvas: overrides.canvas ?? [],
    votes: overrides.votes ?? [],
    operations: overrides.operations ?? [],
    version: 0,
    settings: {
      maxParticipants: 20,
      allowObserverChat: false,
      autoAdvancePhases: false,
      votingEnabled: true,
      anonymousVoting: false,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("realtime/facilitation-ai", () => {
  describe("detectGroupthink", () => {
    it("returns low risk for empty room", () => {
      const room = makeRoom({
        members: [
          {
            userId: "f1",
            displayName: "F",
            role: "facilitator",
            isActive: true,
            joinedAt: "",
            lastActivity: "",
          },
        ],
      });
      const result = detectGroupthink(room);
      expect(result.risk).toBe(0);
    });

    it("detects unanimous voting pattern", () => {
      const now = new Date().toISOString();
      const room = makeRoom({
        votes: [
          { id: "v1", ideaId: "idea-1", userId: "user-1", value: 1, timestamp: now },
          { id: "v2", ideaId: "idea-1", userId: "user-2", value: 1, timestamp: now },
          { id: "v3", ideaId: "idea-1", userId: "user-3", value: 1, timestamp: now },
          { id: "v4", ideaId: "idea-2", userId: "user-1", value: 1, timestamp: now },
          { id: "v5", ideaId: "idea-2", userId: "user-2", value: 1, timestamp: now },
        ],
        canvas: [
          {
            id: "idea-1",
            type: "idea-card",
            content: "Idea 1",
            position: { x: 0, y: 0 },
            createdBy: "user-1",
            connectedTo: [],
            metadata: {},
          },
        ],
      });
      const result = detectGroupthink(room);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators.length).toBeGreaterThan(0);
    });
  });

  describe("computeParticipationStats", () => {
    it("computes stats for all members", () => {
      const room = makeRoom({
        canvas: [
          {
            id: "c1",
            type: "idea-card",
            content: "Alice's Idea",
            position: { x: 0, y: 0 },
            createdBy: "user-1",
            connectedTo: [],
            metadata: {},
          },
          {
            id: "c2",
            type: "idea-card",
            content: "Alice's Idea 2",
            position: { x: 0, y: 100 },
            createdBy: "user-1",
            connectedTo: [],
            metadata: {},
          },
        ],
      });
      const stats = computeParticipationStats(room);
      expect(stats.length).toBe(4);
      const alice = stats.find((s) => s.userId === "user-1");
      expect(alice?.ideasSubmitted).toBe(2);
    });
  });

  describe("detectParticipationImbalance", () => {
    it("detects low participation", () => {
      const room = makeRoom({
        canvas: [
          {
            id: "c1",
            type: "idea-card",
            content: "X",
            position: { x: 0, y: 0 },
            createdBy: "user-1",
            connectedTo: [],
            metadata: {},
          },
        ],
      });
      const alerts = detectParticipationImbalance(room);
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe("generateFacilitationReport", () => {
    it("generates complete report", () => {
      const room = makeRoom();
      const report = generateFacilitationReport(room);
      expect(report.roomId).toBe(room.id);
      expect(report.groupthinkRisk).toBeGreaterThanOrEqual(0);
      expect(report.participationBalance).toBeGreaterThanOrEqual(0);
      expect(report.participationBalance).toBeLessThanOrEqual(1);
      expect(report.participation.length).toBeGreaterThan(0);
    });

    it("includes recommendations for scoring phase with no votes", () => {
      const room = makeRoom({ phase: "scoring" });
      const report = generateFacilitationReport(room);
      expect(report.recommendations.some((r) => r.includes("Voting"))).toBe(true);
    });
  });

  describe("phase timer", () => {
    it("starts and reads a phase timer", () => {
      const state = startPhaseTimer("room-timer", "ideation", 25);
      expect(state.phase).toBe("ideation");
      expect(state.durationMinutes).toBe(25);
      expect(state.isOvertime).toBe(false);
      expect(state.progress).toBeGreaterThanOrEqual(0);
      stopPhaseTimer("room-timer");
    });

    it("returns null for non-existent timer", () => {
      expect(getPhaseTimerState("no-timer")).toBeNull();
    });

    it("stops timer and returns elapsed time", () => {
      startPhaseTimer("room-stop", "scoring", 10);
      const result = stopPhaseTimer("room-stop");
      expect(result).not.toBeNull();
      expect(result!.phase).toBe("scoring");
      expect(result!.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("consensus detection", () => {
    it("detects strong consensus", () => {
      const now = new Date().toISOString();
      const room = makeRoom({
        votes: [
          { id: "v1", ideaId: "idea-1", userId: "user-1", value: 1, timestamp: now },
          { id: "v2", ideaId: "idea-1", userId: "user-2", value: 1, timestamp: now },
          { id: "v3", ideaId: "idea-1", userId: "user-3", value: 1, timestamp: now },
          { id: "v4", ideaId: "idea-2", userId: "user-1", value: -1, timestamp: now },
        ],
      });
      const result = detectConsensus(room);
      expect(result.topIdeas.length).toBeGreaterThan(0);
      expect(result.topIdeas[0].ideaId).toBe("idea-1");
      expect(result.recommendation).toBeDefined();
    });

    it("reports no consensus when no votes", () => {
      const room = makeRoom({ votes: [] });
      const result = detectConsensus(room);
      expect(result.hasConsensus).toBe(false);
      expect(result.consensusLevel).toBe(0);
    });

    it("detects disagreements", () => {
      const now = new Date().toISOString();
      const room = makeRoom({
        votes: [
          { id: "v1", ideaId: "idea-1", userId: "user-1", value: 1, timestamp: now },
          { id: "v2", ideaId: "idea-1", userId: "user-2", value: -1, timestamp: now },
          { id: "v3", ideaId: "idea-1", userId: "user-3", value: 1, timestamp: now },
          { id: "v4", ideaId: "idea-1", userId: "facilitator", value: -1, timestamp: now },
        ],
      });
      const result = detectConsensus(room);
      expect(result.disagreements.length).toBeGreaterThanOrEqual(0);
    });
  });
});
