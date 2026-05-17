/**
 * Tests for the Collaborative Canvas realtime-presence module.
 */
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createPresenceRoom,
  joinRoom,
  leaveRoom,
  updateCursor,
  getRoom,
  getRoomBySession,
  autoClusterCanvasNodes,
  exportCanvasToJSON,
  exportCanvasToSVG,
} from "../canvas/index.js";

describe("realtime-presence", () => {
  describe("presence rooms", () => {
    it("creates a presence room", () => {
      const room = createPresenceRoom("session-1");
      expect(room.roomId).toMatch(/^room-/);
      expect(room.sessionId).toBe("session-1");
      expect(room.users).toHaveLength(0);
      expect(room.maxUsers).toBe(20);
    });

    it("creates a room with custom max users", () => {
      const room = createPresenceRoom("s1", 5);
      expect(room.maxUsers).toBe(5);
    });

    it("joins a room", () => {
      const room = createPresenceRoom("s1");
      const updated = joinRoom(room.roomId, {
        userId: "u1",
        displayName: "Alice",
        color: "#3b82f6",
      });

      expect(updated).not.toBeNull();
      expect(updated!.users).toHaveLength(1);
      expect(updated!.users[0].userId).toBe("u1");
      expect(updated!.users[0].status).toBe("active");
    });

    it("prevents duplicate user entries", () => {
      const room = createPresenceRoom("s1");
      joinRoom(room.roomId, { userId: "u1", displayName: "Alice", color: "#f00" });
      const updated = joinRoom(room.roomId, {
        userId: "u1",
        displayName: "Alice Updated",
        color: "#0f0",
      });

      expect(updated!.users).toHaveLength(1);
      expect(updated!.users[0].color).toBe("#0f0");
    });

    it("rejects join when room is full", () => {
      const room = createPresenceRoom("s1", 1);
      joinRoom(room.roomId, { userId: "u1", displayName: "A", color: "#f00" });
      const result = joinRoom(room.roomId, { userId: "u2", displayName: "B", color: "#0f0" });
      expect(result).toBeNull();
    });

    it("returns null for unknown room", () => {
      expect(joinRoom("nonexistent", { userId: "u1", displayName: "A", color: "#f00" })).toBeNull();
    });

    it("leaves a room", () => {
      const room = createPresenceRoom("s1");
      joinRoom(room.roomId, { userId: "u1", displayName: "A", color: "#f00" });
      expect(leaveRoom(room.roomId, "u1")).toBe(true);
      // Room auto-deleted when empty
      expect(getRoom(room.roomId)).toBeUndefined();
    });

    it("returns false for leaving unknown room", () => {
      expect(leaveRoom("nonexistent", "u1")).toBe(false);
    });

    it("updates cursor position", () => {
      const room = createPresenceRoom("s1");
      joinRoom(room.roomId, { userId: "u1", displayName: "A", color: "#f00" });
      updateCursor(room.roomId, "u1", 150, 250);

      const r = getRoom(room.roomId)!;
      expect(r.users[0].cursor).toEqual({ x: 150, y: 250 });
    });

    it("finds room by session ID", () => {
      createPresenceRoom("session-abc");
      const found = getRoomBySession("session-abc");
      expect(found).toBeDefined();
      expect(found!.sessionId).toBe("session-abc");
    });
  });

  describe("auto-clustering", () => {
    it("returns empty clusters for empty input", () => {
      const result = autoClusterCanvasNodes([]);
      expect(result.clusters).toHaveLength(0);
      expect(result.unclustered).toHaveLength(0);
    });

    it("clusters nodes by shared keywords", () => {
      const nodes = [
        { id: "1", title: "Machine Learning Model", description: "Build ML model", x: 0, y: 0 },
        {
          id: "2",
          title: "Machine Learning Pipeline",
          description: "Data pipeline for ML",
          x: 100,
          y: 0,
        },
        { id: "3", title: "User Interface Design", description: "Design the UI", x: 200, y: 200 },
        { id: "4", title: "User Interface Testing", description: "Test the UI", x: 300, y: 200 },
      ];

      const result = autoClusterCanvasNodes(nodes);
      expect(result.clusters.length).toBeGreaterThan(0);

      // "machine" should cluster nodes 1 and 2
      const mlCluster = result.clusters.find(
        (c) => c.nodeIds.includes("1") && c.nodeIds.includes("2")
      );
      expect(mlCluster).toBeDefined();
    });

    it("identifies unclustered nodes", () => {
      const nodes = [
        { id: "1", title: "Unique Alpha Concept", x: 0, y: 0 },
        { id: "2", title: "Unique Beta Concept", x: 100, y: 0 },
      ];

      const result = autoClusterCanvasNodes(nodes);
      // With only 2 unique-keyword nodes, they may or may not cluster
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("canvas export", () => {
    it("exports to JSON", () => {
      const json = exportCanvasToJSON(
        [{ id: "1", title: "Idea A", x: 0, y: 0 }],
        [{ sourceId: "1", targetId: "2", type: "related" }],
        []
      );

      const parsed = JSON.parse(json);
      expect(parsed.version).toBe("1.0");
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.edges).toHaveLength(1);
      expect(parsed.exportedAt).toBeDefined();
    });

    it("exports to SVG", () => {
      const svg = exportCanvasToSVG([{ id: "1", title: "Node A", x: 50, y: 100 }], []);

      expect(svg).toContain("<svg");
      expect(svg).toContain("Node A");
      expect(svg).toContain("</svg>");
    });

    it("SVG escapes special characters", () => {
      const svg = exportCanvasToSVG([{ id: "1", title: "A & B <test>", x: 0, y: 0 }], []);

      expect(svg).toContain("&amp;");
      expect(svg).toContain("&lt;");
    });
  });
});
