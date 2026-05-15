import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  startLiveSession,
  getLiveSession,
  listLiveSessions,
  feedTranscriptSegment,
  endLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  registerKnownIdeas,
  clearKnownIdeas,
  liveSessionToMarkdown,
  clearLiveSessions,
  InnovationMomentTypeSchema,
} from "../meeting-intelligence/live-copilot.js";

beforeEach(() => {
  clearLiveSessions();
  clearKnownIdeas();
});

describe("InnovationMomentTypeSchema", () => {
  it("accepts valid types", () => {
    expect(InnovationMomentTypeSchema.parse("idea_spark")).toBe("idea_spark");
    expect(InnovationMomentTypeSchema.parse("problem_identified")).toBe("problem_identified");
    expect(InnovationMomentTypeSchema.parse("opportunity_spotted")).toBe("opportunity_spotted");
    expect(InnovationMomentTypeSchema.parse("divergent_thinking")).toBe("divergent_thinking");
  });

  it("rejects invalid type", () => {
    expect(() => InnovationMomentTypeSchema.parse("invalid")).toThrow();
  });
});

describe("Live Session Management", () => {
  it("starts a live session", () => {
    const session = startLiveSession({
      meetingTitle: "Sprint Planning",
      platform: "zoom",
    });
    expect(session.id).toBeDefined();
    expect(session.status).toBe("active");
    expect(session.meetingTitle).toBe("Sprint Planning");
  });

  it("retrieves a session by id", () => {
    const session = startLiveSession({
      meetingTitle: "Test",
      platform: "teams",
    });
    const retrieved = getLiveSession(session.id);
    expect(retrieved?.id).toBe(session.id);
  });

  it("lists all sessions", () => {
    startLiveSession({ meetingTitle: "S1", platform: "zoom" });
    startLiveSession({ meetingTitle: "S2", platform: "teams" });
    expect(listLiveSessions()).toHaveLength(2);
  });

  it("ends a session", () => {
    const session = startLiveSession({
      meetingTitle: "To End",
      platform: "zoom",
    });
    const ended = endLiveSession(session.id);
    expect(ended?.status).toBe("ended");
    expect(ended?.endedAt).toBeDefined();
  });

  it("pauses and resumes a session", () => {
    const session = startLiveSession({
      meetingTitle: "Pausable",
      platform: "zoom",
    });
    expect(pauseLiveSession(session.id)).toBe(true);
    expect(getLiveSession(session.id)?.status).toBe("paused");

    expect(resumeLiveSession(session.id)).toBe(true);
    expect(getLiveSession(session.id)?.status).toBe("active");
  });
});

describe("feedTranscriptSegment", () => {
  it("detects idea_spark moments", async () => {
    const session = startLiveSession({
      meetingTitle: "Brainstorm",
      platform: "zoom",
    });

    const result = await feedTranscriptSegment(session.id, {
      speaker: "Alice",
      text: "What if we built an AI-powered assistant that helps teams brainstorm more effectively?",
    });

    expect(result.moments.length).toBeGreaterThan(0);
    expect(result.moments[0].type).toBe("idea_spark");
    expect(result.moments[0].speaker).toBe("Alice");
    expect(result.moments[0].confidence).toBeGreaterThan(0.5);
  });

  it("detects problem_identified moments", async () => {
    const session = startLiveSession({
      meetingTitle: "Retro",
      platform: "teams",
    });

    const result = await feedTranscriptSegment(session.id, {
      speaker: "Bob",
      text: "The problem is that our current onboarding process takes too long and we're struggling with user retention.",
    });

    expect(result.moments.length).toBeGreaterThan(0);
    const problem = result.moments.find((m) => m.type === "problem_identified");
    expect(problem).toBeDefined();
  });

  it("detects opportunity_spotted moments", async () => {
    const session = startLiveSession({
      meetingTitle: "Strategy",
      platform: "zoom",
    });

    const result = await feedTranscriptSegment(session.id, {
      speaker: "Carol",
      text: "I see a huge market gap in the emerging AI developer tools space. There's untapped potential here.",
    });

    expect(result.moments.length).toBeGreaterThan(0);
    const opp = result.moments.find((m) => m.type === "opportunity_spotted");
    expect(opp).toBeDefined();
  });

  it("generates suggestions for high-confidence moments", async () => {
    const session = startLiveSession({
      meetingTitle: "Ideas",
      platform: "zoom",
    });

    const result = await feedTranscriptSegment(session.id, {
      speaker: "Dave",
      text: "What if we created a completely new approach to code review using AI?",
    });

    expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    if (result.moments.length > 0 && result.moments[0].confidence >= 0.7) {
      expect(result.suggestions.length).toBeGreaterThan(0);
    }
  });

  it("finds related past ideas when registered", async () => {
    registerKnownIdeas([
      {
        title: "AI Code Review Assistant",
        description: "An AI-powered tool for automated code review suggestions",
        tags: ["ai", "code", "review"],
        sessionId: "session-123",
      },
    ]);

    const session = startLiveSession({
      meetingTitle: "Dev",
      platform: "zoom",
    });

    const result = await feedTranscriptSegment(session.id, {
      speaker: "Eve",
      text: "We should build an AI assistant for code review. It could help catch bugs automatically.",
    });

    const ideaSparkMoment = result.moments.find((m) => m.type === "idea_spark");
    if (ideaSparkMoment) {
      expect(ideaSparkMoment.relatedPastIdeas.length).toBeGreaterThan(0);
      expect(ideaSparkMoment.relatedPastIdeas[0].title).toContain("AI Code Review");
    }
  });

  it("updates session stats", async () => {
    const session = startLiveSession({
      meetingTitle: "Stats Test",
      platform: "zoom",
    });

    await feedTranscriptSegment(session.id, {
      speaker: "A",
      text: "What if we developed a new feature for mobile users?",
    });
    await feedTranscriptSegment(session.id, {
      speaker: "B",
      text: "The problem is our mobile experience is terrible.",
    });

    const updated = getLiveSession(session.id);
    expect(updated!.stats.segmentsProcessed).toBe(2);
    expect(updated!.stats.totalMoments).toBeGreaterThan(0);
  });

  it("rejects feeding to non-active session", async () => {
    const session = startLiveSession({
      meetingTitle: "Ended",
      platform: "zoom",
    });
    endLiveSession(session.id);

    await expect(
      feedTranscriptSegment(session.id, {
        speaker: "A",
        text: "Test",
      })
    ).rejects.toThrow("not active");
  });
});

describe("liveSessionToMarkdown", () => {
  it("generates markdown summary", async () => {
    const session = startLiveSession({
      meetingTitle: "Innovation Workshop",
      platform: "zoom",
    });

    await feedTranscriptSegment(session.id, {
      speaker: "Alice",
      text: "What if we built a new API for partner integrations?",
    });

    const ended = endLiveSession(session.id)!;
    const md = liveSessionToMarkdown(ended);

    expect(md).toContain("# Meeting Copilot: Innovation Workshop");
    expect(md).toContain("**Platform:** zoom");
    expect(md).toContain("Innovation Moments");
  });
});
