import { describe, it, expect } from "vitest";
import {
  createIaCSession,
  sessionFileName,
  diffSessions,
  formatSessionDiff,
  ideaToGitHubIssue,
  listIaCSessions,
  validateIaCSession,
  validateIaCConfig,
  DEFAULT_IAC_CONFIG,
  iacSessionToRecord,
  recordToIaCSession,
} from "../index.js";
import type { IaCSession } from "../index.js";

function makeSession(overrides: Partial<IaCSession> = {}): IaCSession {
  return {
    version: "1.0",
    id: "test-id-1",
    parent: null,
    subject: "test subject",
    timestamp: "2026-05-12T10:00:00.000Z",
    config: { model: "gpt-4.1" },
    investigation: {
      summary: "Test summary",
      keyAspects: [{ title: "Aspect 1", description: "Desc 1" }],
      currentState: "Current state",
      challenges: ["Challenge 1"],
      opportunities: ["Opportunity 1"],
    },
    angleResults: [
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [
          {
            title: "Idea 1",
            description: "Description 1",
            potentialImpact: "High impact",
            implementationHint: "Hint 1",
          },
        ],
        reasoning: "Applied SCAMPER",
      },
    ],
    synthesis: {
      topIdeas: [
        {
          title: "Top Idea",
          description: "Top description",
          sourceAngle: "SCAMPER",
          potentialImpact: "Very high",
          feasibility: "high",
        },
      ],
      themes: ["Theme 1"],
      recommendation: "Recommendation text",
    },
    metadata: { durationMs: 5000, model: "gpt-4.1" },
    tags: ["test"],
    ...overrides,
  };
}

describe("createIaCSession", () => {
  it("creates a session with all fields populated", () => {
    const session = createIaCSession({
      subject: "test topic",
      angleResults: [],
      model: "gpt-4.1",
      tags: ["demo"],
    });
    expect(session.version).toBe("1.0");
    expect(session.id).toBeTruthy();
    expect(session.subject).toBe("test topic");
    expect(session.config.model).toBe("gpt-4.1");
    expect(session.tags).toEqual(["demo"]);
    expect(session.parent).toBeNull();
  });

  it("sets parent when provided", () => {
    const session = createIaCSession({
      subject: "child topic",
      angleResults: [],
      parent: "parent-id",
    });
    expect(session.parent).toBe("parent-id");
  });
});

describe("sessionFileName", () => {
  it("generates a date-slug filename", () => {
    const session = makeSession({ subject: "Solar Energy Innovation" });
    const name = sessionFileName(session);
    expect(name).toBe("2026-05-12-solar-energy-innovation.json");
  });

  it("truncates long subjects", () => {
    const session = makeSession({
      subject: "A very very very very long subject that exceeds the maximum slug length allowed",
    });
    const name = sessionFileName(session);
    expect(name.length).toBeLessThan(80);
    expect(name).toMatch(/^2026-05-12-.+\.json$/);
  });
});

describe("diffSessions", () => {
  it("returns empty diff for identical sessions", () => {
    const a = makeSession();
    const b = makeSession();
    const diff = diffSessions(a, b);
    expect(diff.entries).toHaveLength(0);
    expect(diff.summary).toContain("No differences");
  });

  it("detects subject changes", () => {
    const a = makeSession({ subject: "Old subject" });
    const b = makeSession({ subject: "New subject" });
    const diff = diffSessions(a, b);
    expect(diff.entries.some((e) => e.field === "subject" && e.type === "changed")).toBe(true);
  });

  it("detects added angles", () => {
    const a = makeSession();
    const b = makeSession({
      angleResults: [
        ...a.angleResults,
        {
          angleId: "first-principles",
          angleName: "First Principles",
          ideas: [
            { title: "FP Idea", description: "d", potentialImpact: "p", implementationHint: "h" },
          ],
          reasoning: "Applied FP",
        },
      ],
    });
    const diff = diffSessions(a, b);
    expect(diff.entries.some((e) => e.field === "angleResults" && e.type === "added")).toBe(true);
  });

  it("detects removed synthesis", () => {
    const a = makeSession();
    const b = makeSession({ synthesis: undefined });
    const diff = diffSessions(a, b);
    expect(diff.entries.some((e) => e.field === "synthesis" && e.type === "removed")).toBe(true);
  });

  it("detects new investigation challenges", () => {
    const a = makeSession();
    const b = makeSession({
      investigation: {
        ...a.investigation!,
        challenges: [...a.investigation!.challenges, "New challenge"],
      },
    });
    const diff = diffSessions(a, b);
    expect(
      diff.entries.some((e) => e.field === "investigation.challenges" && e.type === "added")
    ).toBe(true);
  });
});

describe("formatSessionDiff", () => {
  it("formats an empty diff", () => {
    const diff = diffSessions(makeSession(), makeSession());
    const text = formatSessionDiff(diff);
    expect(text).toContain("No differences");
  });

  it("formats added/removed/changed entries", () => {
    const a = makeSession({ subject: "Old" });
    const b = makeSession({ subject: "New", synthesis: undefined });
    const diff = diffSessions(a, b);
    const text = formatSessionDiff(diff);
    expect(text).toContain("Changed");
    expect(text).toContain("Removed");
  });
});

describe("ideaToGitHubIssue", () => {
  it("generates a valid GitHub Issue", () => {
    const session = makeSession();
    const issue = ideaToGitHubIssue(session, {
      title: "Great Idea",
      description: "It does great things",
      potentialImpact: "Very high",
      sourceAngle: "SCAMPER",
      feasibility: "high",
    });
    expect(issue.title).toBe("💡 Great Idea");
    expect(issue.body).toContain("Great Idea");
    expect(issue.body).toContain("SCAMPER");
    expect(issue.body).toContain("Innovation-as-Code");
    expect(issue.labels).toContain("innovation");
  });
});

describe("listIaCSessions", () => {
  it("handles empty list", () => {
    expect(listIaCSessions([])).toContain("No innovation sessions");
  });

  it("formats session list as table", () => {
    const sessions = [makeSession(), makeSession({ id: "2", subject: "Another topic" })];
    const text = listIaCSessions(sessions);
    expect(text).toContain("test subject");
    expect(text).toContain("Another topic");
    expect(text).toContain("Total: 2");
  });
});

describe("validateIaCSession", () => {
  it("returns null for valid sessions", () => {
    expect(validateIaCSession(makeSession())).toBeNull();
  });

  it("returns error for invalid sessions", () => {
    expect(validateIaCSession({ subject: 123 })).toBeTruthy();
  });
});

describe("validateIaCConfig", () => {
  it("returns null for valid config", () => {
    expect(validateIaCConfig(DEFAULT_IAC_CONFIG)).toBeNull();
  });

  it("returns error for invalid config", () => {
    expect(validateIaCConfig({ version: 123 })).toBeTruthy();
  });
});

describe("iacSessionToRecord", () => {
  it("converts IaCSession to SessionRecord", () => {
    const session = makeSession();
    const record = iacSessionToRecord(session);
    expect(record.id).toBe(session.id);
    expect(record.subject).toBe(session.subject);
    expect(record.createdAt).toBe(session.timestamp);
    expect(record.investigation).toEqual(session.investigation);
    expect(record.angleResults).toEqual(session.angleResults);
    expect(record.synthesis).toEqual(session.synthesis);
    expect(record.tags).toEqual(session.tags);
  });

  it("sets notes for sessions with parents", () => {
    const session = makeSession({ parent: "parent-123" });
    const record = iacSessionToRecord(session);
    expect(record.notes).toContain("parent-123");
  });
});

describe("recordToIaCSession", () => {
  it("converts SessionRecord back to IaCSession", () => {
    const record = {
      id: "rec-1",
      subject: "Test subject",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      angleResults: [],
      tags: ["tag1"],
    };
    const session = recordToIaCSession(record);
    expect(session.id).toBe("rec-1");
    expect(session.subject).toBe("Test subject");
    expect(session.version).toBe("1.0");
    expect(session.parent).toBeNull();
    expect(session.tags).toEqual(["tag1"]);
  });

  it("roundtrips correctly", () => {
    const original = makeSession();
    const record = iacSessionToRecord(original);
    const roundtripped = recordToIaCSession(record);
    expect(roundtripped.id).toBe(original.id);
    expect(roundtripped.subject).toBe(original.subject);
    expect(roundtripped.angleResults).toEqual(original.angleResults);
  });
});
