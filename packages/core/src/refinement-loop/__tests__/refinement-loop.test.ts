import { describe, it, expect, beforeEach } from "vitest";
import {
  startRefinementSession,
  refineIdea,
  getRefinementSession,
  listRefinementSessions,
  deleteRefinementSession,
  getIdeaHistory,
} from "../engine.js";

describe("refinement-loop", () => {
  const testIdeas = [
    {
      id: "idea-1",
      title: "AI Assistant",
      description: "Build an AI-powered coding assistant that helps developers write better code.",
    },
    {
      id: "idea-2",
      title: "Code Review Bot",
      description: "Automated code review that catches bugs and suggests improvements.",
    },
  ];

  describe("session management", () => {
    it("starts a session with ideas at concept tier", () => {
      const session = startRefinementSession(testIdeas);
      expect(session.id).toBeDefined();
      expect(session.ideas).toHaveLength(2);
      expect(session.ideas[0].currentTier).toBe("concept");
      expect(session.ideas[0].selected).toBe(true);
      expect(session.convergenceScore).toBe(0);
      expect(session.suggestStop).toBe(false);
    });

    it("retrieves session by ID", () => {
      const session = startRefinementSession(testIdeas);
      const retrieved = getRefinementSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
    });

    it("returns null for non-existent session", () => {
      expect(getRefinementSession("fake")).toBeNull();
    });

    it("lists sessions sorted by update time", () => {
      startRefinementSession(testIdeas);
      startRefinementSession(testIdeas);
      const list = listRefinementSessions();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it("deletes a session", () => {
      const session = startRefinementSession(testIdeas);
      expect(deleteRefinementSession(session.id)).toBe(true);
      expect(getRefinementSession(session.id)).toBeNull();
    });
  });

  describe("refinement", () => {
    it("refines an idea from concept to plan", () => {
      const session = startRefinementSession(testIdeas);
      const iteration = refineIdea(session.id, "idea-1", "plan");
      expect(iteration).not.toBeNull();
      expect(iteration!.tier).toBe("plan");
      expect(iteration!.output.implementationSteps).toBeDefined();
      expect(iteration!.output.timeline).toBeDefined();
      expect(iteration!.output.teamSize).toBeDefined();

      const updated = getRefinementSession(session.id);
      expect(updated!.ideas[0].currentTier).toBe("plan");
    });

    it("refines from plan to specification", () => {
      const session = startRefinementSession(testIdeas);
      refineIdea(session.id, "idea-1", "plan");
      const iteration = refineIdea(session.id, "idea-1", "specification");
      expect(iteration).not.toBeNull();
      expect(iteration!.tier).toBe("specification");
      expect(iteration!.output.acceptanceCriteria).toBeDefined();
      expect(iteration!.output.risks).toBeDefined();
      expect(iteration!.output.milestones).toBeDefined();
    });

    it("auto-generates plan when jumping to specification from concept", () => {
      const session = startRefinementSession(testIdeas);
      const iteration = refineIdea(session.id, "idea-1", "specification");
      expect(iteration).not.toBeNull();
      // Should have auto-generated a plan iteration too
      const history = getIdeaHistory(session.id, "idea-1");
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.tier === "plan")).toBe(true);
      expect(history.some((h) => h.tier === "specification")).toBe(true);
    });

    it("includes feedback in refinement", () => {
      const session = startRefinementSession(testIdeas);
      const iteration = refineIdea(session.id, "idea-1", "plan", "Focus on React ecosystem");
      expect(iteration).not.toBeNull();
      expect(iteration!.feedback).toBe("Focus on React ecosystem");
    });

    it("returns null for non-existent session", () => {
      expect(refineIdea("fake", "idea-1", "plan")).toBeNull();
    });

    it("returns null for non-existent idea", () => {
      const session = startRefinementSession(testIdeas);
      expect(refineIdea(session.id, "fake-idea", "plan")).toBeNull();
    });
  });

  describe("convergence detection", () => {
    it("suggests stopping when all ideas reach specification", () => {
      const session = startRefinementSession([testIdeas[0]]);
      refineIdea(session.id, "idea-1", "plan");
      refineIdea(session.id, "idea-1", "specification");
      const updated = getRefinementSession(session.id);
      expect(updated!.suggestStop).toBe(true);
    });

    it("tracks quality delta across iterations", () => {
      const session = startRefinementSession(testIdeas);
      const iteration = refineIdea(session.id, "idea-1", "plan");
      expect(iteration!.qualityDelta).toBeDefined();
      expect(typeof iteration!.qualityDelta).toBe("number");
    });
  });

  describe("idea history", () => {
    it("returns iteration history for an idea", () => {
      const session = startRefinementSession(testIdeas);
      refineIdea(session.id, "idea-1", "plan");
      refineIdea(session.id, "idea-1", "specification");

      const history = getIdeaHistory(session.id, "idea-1");
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].createdAt).toBeDefined();
    });

    it("returns empty history for non-existent session", () => {
      expect(getIdeaHistory("fake", "idea-1")).toHaveLength(0);
    });
  });
});
