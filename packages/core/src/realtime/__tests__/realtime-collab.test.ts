import { beforeEach, describe, expect, it } from "vitest";
import {
  WORKSHOP_TEMPLATES,
  clearOperationLogs,
  generateSessionSummary,
  getTemplate,
  getTemplatesByCategory,
  listTemplates,
  sessionSummaryToMarkdown,
  transformOperation,
  type Operation,
} from "../index.js";
import type { CollaborativeIdea, CollaborativeSession } from "../../types.js";

describe("realtime collaborative enhancements", () => {
  beforeEach(() => {
    clearOperationLogs();
  });

  describe("transformOperation", () => {
    it("transforms concurrent inserts at the same position deterministically", () => {
      const against: Operation = {
        id: "op-a",
        type: "insert",
        userId: "user-a",
        timestamp: 1,
        position: 1,
        data: { id: "idea-a", title: "Alpha" },
        version: 0,
      };
      const op: Operation = {
        id: "op-b",
        type: "insert",
        userId: "user-b",
        timestamp: 1,
        position: 1,
        data: { id: "idea-b", title: "Beta" },
        version: 0,
      };

      const result = transformOperation(op, against);

      expect(result.transformed.position).toBe(2);
      expect(result.conflicts).toEqual([]);
    });

    it("shifts an insert left when transformed against a prior delete", () => {
      const against: Operation = {
        id: "op-delete",
        type: "delete",
        userId: "user-a",
        timestamp: 2,
        position: 1,
        targetId: "idea-2",
        version: 0,
      };
      const op: Operation = {
        id: "op-insert",
        type: "insert",
        userId: "user-b",
        timestamp: 2,
        position: 3,
        data: { id: "idea-4", title: "Delta" },
        version: 0,
      };

      const result = transformOperation(op, against);

      expect(result.transformed.position).toBe(2);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe("workshop templates", () => {
    it("lists the built-in workshop templates", () => {
      expect(listTemplates()).toHaveLength(5);
      expect(WORKSHOP_TEMPLATES.map((template) => template.id)).toContain("design-sprint");
      expect(WORKSHOP_TEMPLATES.map((template) => template.id)).toContain("lean-canvas");
      expect(getTemplate("lean-canvas")?.name).toBe("Lean Canvas");
    });

    it("filters templates by category", () => {
      const designThinkingTemplates = getTemplatesByCategory("design-thinking");

      expect(designThinkingTemplates.length).toBeGreaterThanOrEqual(2);
      expect(designThinkingTemplates.map((template) => template.id)).toContain("design-sprint");
      expect(designThinkingTemplates.map((template) => template.id)).toContain("crazy-8s");
    });
  });

  describe("session summaries", () => {
    it("generates a structured summary and markdown output", () => {
      const ideas: CollaborativeIdea[] = [
        {
          id: "idea-1",
          authorId: "host-1",
          angleId: "customer",
          title: "Reusable refill hubs",
          description: "Install neighborhood refill stations for household products.",
          potentialImpact: "Lower packaging waste and improve customer loyalty.",
          votes: 4,
          comments: [
            {
              id: "comment-1",
              authorId: "user-2",
              authorName: "Taylor",
              content: "Pilot near dense apartment blocks first.",
              createdAt: "2025-01-01T10:35:00.000Z",
            },
          ],
          createdAt: "2025-01-01T10:10:00.000Z",
        },
        {
          id: "idea-2",
          authorId: "user-2",
          angleId: "operations",
          title: "Smart packaging return bins",
          description: "Use QR-linked bins to simplify returns and tracking.",
          potentialImpact: "Increase return rates and enable traceability.",
          votes: 2,
          comments: [],
          createdAt: "2025-01-01T10:20:00.000Z",
        },
        {
          id: "idea-3",
          authorId: "user-3",
          angleId: "customer",
          title: "Deposit rewards program",
          description: "Offer instant credits for verified packaging returns.",
          potentialImpact: "Drive repeat behavior and better participation.",
          votes: 3,
          comments: [],
          createdAt: "2025-01-01T10:30:00.000Z",
        },
      ];

      const session: CollaborativeSession = {
        id: "session-1",
        roomCode: "ABCD12",
        subject: "Reduce packaging waste in grocery delivery",
        hostUserId: "host-1",
        createdAt: "2025-01-01T10:00:00.000Z",
        status: "completed",
        participants: [
          {
            userId: "host-1",
            displayName: "Alex",
            joinedAt: "2025-01-01T10:00:00.000Z",
            isHost: true,
            assignedAngles: ["scamper"],
            status: "connected",
          },
          {
            userId: "user-2",
            displayName: "Taylor",
            joinedAt: "2025-01-01T10:01:00.000Z",
            isHost: false,
            assignedAngles: ["first-principles"],
            status: "connected",
          },
          {
            userId: "user-3",
            displayName: "Jordan",
            joinedAt: "2025-01-01T10:02:00.000Z",
            isHost: false,
            assignedAngles: ["scamper"],
            status: "connected",
          },
        ],
        angleAssignments: {
          "host-1": ["scamper"],
          "user-2": ["first-principles"],
          "user-3": ["scamper"],
        },
        ideas,
        votes: {
          "idea-1": ["host-1", "user-2", "user-3", "user-4"],
          "idea-2": ["user-2", "user-3"],
          "idea-3": ["host-1", "user-3", "user-4"],
        },
      };

      const summary = generateSessionSummary(session);
      const markdown = sessionSummaryToMarkdown(summary);

      expect(summary.sessionId).toBe("session-1");
      expect(summary.participantCount).toBe(3);
      expect(summary.totalIdeas).toBe(3);
      expect(summary.totalVotes).toBe(9);
      expect(summary.durationMinutes).toBe(35);
      expect(summary.topIdeas[0]).toEqual({
        title: "Reusable refill hubs",
        votes: 4,
        angleId: "customer",
      });
      expect(summary.angleDistribution).toEqual([
        { angleId: "customer", ideaCount: 2 },
        { angleId: "operations", ideaCount: 1 },
      ]);
      expect(summary.highlights.some((highlight) => highlight.includes("Reusable refill hubs"))).toBe(
        true
      );
      expect(markdown).toContain("# Collaborative Innovation Session");
      expect(markdown).toContain("## Top Ideas");
      expect(markdown).toContain("Reusable refill hubs");
      expect(markdown).toContain("customer: 2 ideas");
    });
  });
});
