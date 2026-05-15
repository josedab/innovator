import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue('{"insights":["Great sprint"],"recommendations":["Try more ideas"]}'),
  extractJson: vi
    .fn()
    .mockReturnValue('{"insights":["Great sprint"],"recommendations":["Try more ideas"]}'),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  getSprintTemplates,
  getSprintTemplate,
  createAutomatedSprint,
  startAutomatedSprint,
  joinAutomatedSprint,
  submitSprintIdea,
  openVotingRound,
  castVote,
  closeVotingRound,
  advanceSprintPhase,
  isPhaseExpired,
  getAutomatedSprint,
  listAutomatedSprints,
  generateFacilitatorMessage,
  generateRetrospective,
  getRetrospective,
  clearSprintAutomationData,
  SPRINT_TEMPLATES,
} from "../sprint-automation/index.js";

describe("sprint-automation", () => {
  beforeEach(() => {
    clearSprintAutomationData();
  });

  describe("templates", () => {
    it("provides built-in templates", () => {
      const templates = getSprintTemplates();
      expect(templates.length).toBe(3);
      expect(templates.map((t) => t.id)).toContain("quick-sprint");
      expect(templates.map((t) => t.id)).toContain("deep-dive");
      expect(templates.map((t) => t.id)).toContain("innovation-week");
    });

    it("retrieves template by ID", () => {
      const template = getSprintTemplate("quick-sprint");
      expect(template).toBeDefined();
      expect(template!.totalDurationMinutes).toBe(30);
      expect(template!.phases).toHaveLength(4);
    });
  });

  describe("sprint creation", () => {
    it("creates a sprint from template", () => {
      const sprint = createAutomatedSprint("quick-sprint", "AI in healthcare", "user-1", "Alice");
      expect(sprint.status).toBe("draft");
      expect(sprint.subject).toBe("AI in healthcare");
      expect(sprint.participants).toHaveLength(1);
      expect(sprint.currentPhase).toBe("diverge");
    });

    it("rejects unknown template", () => {
      expect(() => createAutomatedSprint("nonexistent", "Test", "u1", "Alice")).toThrow(
        "not found"
      );
    });

    it("rejects empty subject", () => {
      expect(() => createAutomatedSprint("quick-sprint", "", "u1", "Alice")).toThrow("required");
    });
  });

  describe("sprint lifecycle", () => {
    it("starts a sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      const started = startAutomatedSprint(sprint.id);
      expect(started.status).toBe("active");
      expect(started.facilitatorMessages.length).toBeGreaterThan(0);
    });

    it("allows participants to join", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      joinAutomatedSprint(sprint.id, "u2", "Bob");
      expect(sprint.participants).toHaveLength(2);
    });

    it("rejects duplicate join", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      expect(() => joinAutomatedSprint(sprint.id, "u1", "Alice")).toThrow("already joined");
    });

    it("advances through all phases", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);

      advanceSprintPhase(sprint.id);
      expect(sprint.currentPhase).toBe("converge");

      advanceSprintPhase(sprint.id);
      expect(sprint.currentPhase).toBe("iterate");

      advanceSprintPhase(sprint.id);
      expect(sprint.currentPhase).toBe("decide");

      advanceSprintPhase(sprint.id);
      expect(sprint.status).toBe("completed");
    });
  });

  describe("idea submission", () => {
    it("submits ideas during active sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);

      const idea = submitSprintIdea(sprint.id, "u1", "Smart Widget", "An AI-powered widget");
      expect(idea.title).toBe("Smart Widget");
      expect(idea.phase).toBe("diverge");
      expect(sprint.ideas).toHaveLength(1);
    });

    it("rejects ideas from non-participants", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      expect(() => submitSprintIdea(sprint.id, "unknown", "Idea", "Desc")).toThrow("join");
    });

    it("rejects ideas in non-active sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      expect(() => submitSprintIdea(sprint.id, "u1", "Idea", "Desc")).toThrow("not active");
    });
  });

  describe("voting", () => {
    it("opens voting round and collects votes", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      joinAutomatedSprint(sprint.id, "u2", "Bob");

      submitSprintIdea(sprint.id, "u1", "Idea A", "Desc A");
      submitSprintIdea(sprint.id, "u2", "Idea B", "Desc B");

      const round = openVotingRound(sprint.id);
      expect(round.ideaIds).toHaveLength(2);
      expect(round.status).toBe("open");

      const ideaA = sprint.ideas[0].id;
      const ideaB = sprint.ideas[1].id;

      castVote(sprint.id, round.id, "u1", ideaB, 8);
      castVote(sprint.id, round.id, "u2", ideaA, 9);

      expect(round.votes).toHaveLength(2);
    });

    it("prevents duplicate voting", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      submitSprintIdea(sprint.id, "u1", "Idea A", "Desc A");

      const round = openVotingRound(sprint.id);
      castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 7);
      expect(() => castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 8)).toThrow(
        "Already voted"
      );
    });

    it("closes voting and ranks ideas", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      joinAutomatedSprint(sprint.id, "u2", "Bob");

      submitSprintIdea(sprint.id, "u1", "High", "Desc");
      submitSprintIdea(sprint.id, "u2", "Low", "Desc");

      const round = openVotingRound(sprint.id);
      castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 9);
      castVote(sprint.id, round.id, "u1", sprint.ideas[1].id, 3);
      castVote(sprint.id, round.id, "u2", sprint.ideas[0].id, 8);
      castVote(sprint.id, round.id, "u2", sprint.ideas[1].id, 4);

      closeVotingRound(sprint.id, round.id, 1);
      expect(sprint.ideas[0].status).toBe("shortlisted");
      expect(sprint.ideas[1].status).toBe("eliminated");
    });
  });

  describe("phase timing", () => {
    it("detects expired phase", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      // Set deadline to past
      sprint.phaseDeadline = new Date(Date.now() - 1000).toISOString();
      expect(isPhaseExpired(sprint.id)).toBe(true);
    });
  });

  describe("queries", () => {
    it("lists sprints by status", () => {
      createAutomatedSprint("quick-sprint", "Test 1", "u1", "Alice");
      const s2 = createAutomatedSprint("quick-sprint", "Test 2", "u1", "Alice");
      startAutomatedSprint(s2.id);

      expect(listAutomatedSprints({ status: "draft" })).toHaveLength(1);
      expect(listAutomatedSprints({ status: "active" })).toHaveLength(1);
    });
  });

  describe("facilitator", () => {
    it("generates facilitator message", async () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);

      const message = await generateFacilitatorMessage(sprint.id);
      expect(message).toBeTruthy();
    });
  });

  describe("retrospective", () => {
    it("generates retrospective for completed sprint", async () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      submitSprintIdea(sprint.id, "u1", "Idea", "Desc");

      // Complete all phases
      for (let i = 0; i < 4; i++) advanceSprintPhase(sprint.id);

      const report = await generateRetrospective(sprint.id);
      expect(report.sprintId).toBe(sprint.id);
      expect(report.totalIdeas).toBe(1);
      expect(report.phaseMetrics).toHaveLength(4);
      expect(report.insights.length).toBeGreaterThan(0);
    });
  });

  // ---- Error paths ----

  describe("error paths", () => {
    it("advanceSprintPhase throws on non-active sprint (draft)", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      expect(() => advanceSprintPhase(sprint.id)).toThrow("not active");
    });

    it("advanceSprintPhase past final phase completes sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);

      // Advance through all 4 phases — last advance completes
      for (let i = 0; i < 4; i++) advanceSprintPhase(sprint.id);
      expect(sprint.status).toBe("completed");
      expect(sprint.completedAt).toBeDefined();
    });

    it("advanceSprintPhase marks shortlisted ideas as selected on completion", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      joinAutomatedSprint(sprint.id, "u2", "Bob");

      submitSprintIdea(sprint.id, "u1", "Idea A", "Desc A");
      const round = openVotingRound(sprint.id);
      castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 9);
      castVote(sprint.id, round.id, "u2", sprint.ideas[0].id, 8);
      closeVotingRound(sprint.id, round.id, 1);
      expect(sprint.ideas[0].status).toBe("shortlisted");

      for (let i = 0; i < 4; i++) advanceSprintPhase(sprint.id);
      expect(sprint.ideas[0].status).toBe("selected");
    });

    it("advanceSprintPhase throws for non-existent sprint", () => {
      expect(() => advanceSprintPhase("nonexistent")).toThrow("not found");
    });

    it("closeVotingRound throws for non-existent round", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      expect(() => closeVotingRound(sprint.id, "nonexistent")).toThrow("not found");
    });

    it("closeVotingRound with topN > total ideas shortlists all", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      submitSprintIdea(sprint.id, "u1", "A", "D");
      submitSprintIdea(sprint.id, "u1", "B", "D");

      const round = openVotingRound(sprint.id);
      castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 8);
      castVote(sprint.id, round.id, "u1", sprint.ideas[1].id, 6);
      closeVotingRound(sprint.id, round.id, 100);
      expect(sprint.ideas.every((i) => i.status === "shortlisted")).toBe(true);
    });

    it("castVote throws for non-existent sprint", () => {
      expect(() => castVote("nonexistent", "round", "u1", "idea", 5)).toThrow("not found");
    });

    it("castVote throws for non-existent round", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      expect(() => castVote(sprint.id, "nonexistent", "u1", "idea", 5)).toThrow("not found");
    });

    it("castVote throws on closed round", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      submitSprintIdea(sprint.id, "u1", "A", "D");

      const round = openVotingRound(sprint.id);
      closeVotingRound(sprint.id, round.id);
      expect(() => castVote(sprint.id, round.id, "u1", sprint.ideas[0].id, 5)).toThrow("closed");
    });

    it("castVote throws for idea not in round", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      submitSprintIdea(sprint.id, "u1", "A", "D");

      const round = openVotingRound(sprint.id, [sprint.ideas[0].id]);
      expect(() => castVote(sprint.id, round.id, "u1", "not-in-round", 5)).toThrow(
        "not in this voting round"
      );
    });

    it("isPhaseExpired returns false for non-existent sprint", () => {
      expect(isPhaseExpired("nonexistent")).toBe(false);
    });

    it("isPhaseExpired returns false for future deadline", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      // Deadline is in the future by default
      expect(isPhaseExpired(sprint.id)).toBe(false);
    });

    it("getRetrospective returns undefined for non-completed sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      expect(getRetrospective(sprint.id)).toBeUndefined();
    });

    it("startAutomatedSprint throws for non-existent sprint", () => {
      expect(() => startAutomatedSprint("nonexistent")).toThrow("not found");
    });

    it("startAutomatedSprint throws for non-draft sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      expect(() => startAutomatedSprint(sprint.id)).toThrow("draft");
    });

    it("joinAutomatedSprint throws for non-existent sprint", () => {
      expect(() => joinAutomatedSprint("nonexistent", "u1", "Alice")).toThrow("not found");
    });

    it("submitSprintIdea throws for non-existent sprint", () => {
      expect(() => submitSprintIdea("nonexistent", "u1", "A", "D")).toThrow("not found");
    });

    it("openVotingRound throws for non-existent sprint", () => {
      expect(() => openVotingRound("nonexistent")).toThrow("not found");
    });

    it("openVotingRound throws for non-active sprint", () => {
      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      expect(() => openVotingRound(sprint.id)).toThrow("not active");
    });

    it("closeVotingRound throws for non-existent sprint", () => {
      expect(() => closeVotingRound("nonexistent", "round")).toThrow("not found");
    });

    it("generateFacilitatorMessage throws for non-existent sprint", async () => {
      await expect(generateFacilitatorMessage("nonexistent")).rejects.toThrow("not found");
    });

    it("generateRetrospective throws for non-existent sprint", async () => {
      await expect(generateRetrospective("nonexistent")).rejects.toThrow("not found");
    });
  });

  // ---- LLM failure in retrospective ----

  describe("retrospective LLM failure", () => {
    it("falls back to default insights on LLM failure", async () => {
      const { generateText: mockGenText } = await import("../copilot/client.js");
      (mockGenText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM unavailable"));

      const sprint = createAutomatedSprint("quick-sprint", "Test", "u1", "Alice");
      startAutomatedSprint(sprint.id);
      for (let i = 0; i < 4; i++) advanceSprintPhase(sprint.id);

      const report = await generateRetrospective(sprint.id);
      expect(report.insights).toContain("Sprint completed successfully");
      expect(report.recommendations).toContain("Consider longer diverge phases for more ideas");
    });
  });
});
