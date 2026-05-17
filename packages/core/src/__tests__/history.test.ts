import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `innovator-history-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  querySessions,
  querySessionsPaginated,
  compareSessions,
  getSessionStats,
  exportSessionAsMarkdown,
  exportSessionAsCsv,
  exportSessionAsJson,
  exportSessionAsHtml,
  duplicateSession,
  clearHistory,
} = await import("../history/index.js");

const sampleAngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    {
      title: "Test Idea",
      description: "A test idea description",
      potentialImpact: "High",
      implementationHint: "Start here",
    },
  ],
  reasoning: "Applied SCAMPER method",
};

describe("history", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "history"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("saves and retrieves a session", () => {
    const id = saveSession({
      subject: "Solar energy",
      angleResults: [sampleAngleResult],
      tags: ["energy"],
    });
    expect(id).toBeTruthy();
    const session = getSession(id);
    expect(session?.subject).toBe("Solar energy");
    expect(session?.tags).toEqual(["energy"]);
  });

  it("lists sessions in reverse chronological order", async () => {
    saveSession({ subject: "First", angleResults: [] });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    saveSession({ subject: "Second", angleResults: [] });
    const sessions = listSessions();
    expect(sessions.length).toBe(2);
    expect(sessions[0].subject).toBe("Second");
  });

  it("updates session tags and notes", () => {
    const id = saveSession({ subject: "Test", angleResults: [], tags: [] });
    updateSession(id, { tags: ["updated"], notes: "Some notes" });
    const session = getSession(id);
    expect(session?.tags).toEqual(["updated"]);
    expect(session?.notes).toBe("Some notes");
  });

  it("deletes a session", () => {
    const id = saveSession({ subject: "Delete me", angleResults: [] });
    expect(deleteSession(id)).toBe(true);
    expect(getSession(id)).toBeUndefined();
  });

  it("returns false when deleting non-existent session", () => {
    expect(deleteSession("nonexistent")).toBe(false);
  });

  it("searches sessions by subject", () => {
    saveSession({ subject: "Solar energy innovations", angleResults: [] });
    saveSession({ subject: "Wind power research", angleResults: [] });
    const results = querySessions({ search: "solar" });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toContain("Solar");
  });

  it("filters sessions by tag", () => {
    saveSession({ subject: "Tagged", angleResults: [], tags: ["energy"] });
    saveSession({ subject: "Untagged", angleResults: [], tags: [] });
    const results = querySessions({ tags: ["energy"] });
    expect(results).toHaveLength(1);
  });

  it("limits results", () => {
    for (let i = 0; i < 5; i++) {
      saveSession({ subject: `Session ${i}`, angleResults: [] });
    }
    const results = querySessions({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("compares two sessions", () => {
    const id1 = saveSession({
      subject: "A",
      angleResults: [sampleAngleResult],
      synthesis: { topIdeas: [], themes: ["AI", "Green"], recommendation: "" },
    });
    const id2 = saveSession({
      subject: "B",
      angleResults: [
        { ...sampleAngleResult, angleId: "first-principles", angleName: "First Principles" },
      ],
      synthesis: { topIdeas: [], themes: ["AI", "Speed"], recommendation: "" },
    });
    const comparison = compareSessions(id1, id2);
    expect(comparison?.sharedThemes).toContain("AI");
    expect(comparison?.sharedAngles).toEqual([]);
    expect(comparison?.uniqueAngles1).toContain("scamper");
    expect(comparison?.uniqueAngles2).toContain("first-principles");
  });

  it("compares sessions with shared angles", () => {
    const id1 = saveSession({
      subject: "A",
      angleResults: [sampleAngleResult],
    });
    const id2 = saveSession({
      subject: "B",
      angleResults: [sampleAngleResult],
    });
    const comparison = compareSessions(id1, id2);
    expect(comparison?.sharedAngles).toContain("scamper");
    expect(comparison?.uniqueAngles1).toEqual([]);
    expect(comparison?.uniqueAngles2).toEqual([]);
  });

  it("returns stats for empty history", () => {
    const stats = getSessionStats();
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalIdeas).toBe(0);
    expect(stats.tagFrequency).toEqual({});
    expect(stats.angleFrequency).toEqual({});
    expect(stats.earliestSession).toBeUndefined();
    expect(stats.latestSession).toBeUndefined();
  });

  it("computes aggregate session stats", () => {
    saveSession({
      subject: "Solar",
      angleResults: [sampleAngleResult],
      tags: ["energy", "green"],
    });
    saveSession({
      subject: "Wind",
      angleResults: [
        sampleAngleResult,
        { ...sampleAngleResult, angleId: "first-principles", angleName: "First Principles" },
      ],
      tags: ["energy"],
    });
    const stats = getSessionStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalIdeas).toBe(3);
    expect(stats.tagFrequency).toEqual({ energy: 2, green: 1 });
    expect(stats.angleFrequency).toEqual({ scamper: 2, "first-principles": 1 });
    expect(stats.earliestSession).toBeDefined();
    expect(stats.latestSession).toBeDefined();
  });

  it("querySessionsPaginated returns totalCount with paginated results", () => {
    for (let i = 0; i < 5; i++) {
      saveSession({ subject: `Session ${i}`, angleResults: [], tags: ["batch"] });
    }
    const result = querySessionsPaginated({ limit: 2 });
    expect(result.sessions).toHaveLength(2);
    expect(result.totalCount).toBe(5);
  });

  it("querySessionsPaginated totalCount reflects filtered count", () => {
    saveSession({ subject: "Match A", angleResults: [], tags: ["target"] });
    saveSession({ subject: "Match B", angleResults: [], tags: ["target"] });
    saveSession({ subject: "No match", angleResults: [], tags: ["other"] });
    const result = querySessionsPaginated({ tags: ["target"], limit: 1 });
    expect(result.sessions).toHaveLength(1);
    expect(result.totalCount).toBe(2);
  });

  // ---- Input validation ----

  it("throws on empty subject in saveSession", () => {
    expect(() => saveSession({ subject: "", angleResults: [] })).toThrow(
      "subject must be a non-empty string"
    );
  });

  it("throws on whitespace-only subject in saveSession", () => {
    expect(() => saveSession({ subject: "   ", angleResults: [] })).toThrow(
      "subject must be a non-empty string"
    );
  });

  // ---- Pagination edge cases ----

  it("clamps negative offset to 0", () => {
    saveSession({ subject: "A", angleResults: [] });
    saveSession({ subject: "B", angleResults: [] });
    const result = querySessionsPaginated({ offset: -5 });
    expect(result.sessions.length).toBe(2);
  });

  it("clamps negative limit to 0", () => {
    saveSession({ subject: "A", angleResults: [] });
    const result = querySessionsPaginated({ limit: -1 });
    expect(result.sessions).toHaveLength(0);
    expect(result.totalCount).toBe(1);
  });

  it("floors fractional offset and limit", () => {
    for (let i = 0; i < 5; i++) {
      saveSession({ subject: `S${i}`, angleResults: [] });
    }
    const result = querySessionsPaginated({ offset: 1.9, limit: 2.7 });
    expect(result.sessions).toHaveLength(2);
  });

  // ---- Corrupt file resilience ----

  it("skips corrupt JSON files when listing sessions", () => {
    saveSession({ subject: "Valid", angleResults: [] });
    const corruptPath = join(testDir, ".innovator", "history", "corrupt.json");
    writeFileSync(corruptPath, "NOT-JSON{{{", "utf-8");
    const sessions = listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].subject).toBe("Valid");
  });

  // ---- Search against nested idea text ----

  it("searches within idea descriptions", () => {
    saveSession({
      subject: "Energy",
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Solar Panel Optimization",
              description: "Use quantum dots to improve photovoltaic efficiency",
              potentialImpact: "High",
              implementationHint: "Start with lab tests",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ],
    });
    saveSession({ subject: "Other", angleResults: [] });
    const results = querySessions({ search: "quantum dots" });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Energy");
  });

  it("searches within investigation challenges and opportunities", () => {
    saveSession({
      subject: "Robotics",
      investigation: {
        summary: "Standard summary",
        keyAspects: [{ title: "Servo motors", description: "Precision actuators" }],
        currentState: "Rapidly evolving field",
        challenges: ["Battery life limitations"],
        opportunities: ["Warehouse automation growth"],
      },
      angleResults: [],
    });
    saveSession({ subject: "Other", angleResults: [] });

    expect(querySessions({ search: "battery life" })).toHaveLength(1);
    expect(querySessions({ search: "warehouse automation" })).toHaveLength(1);
    expect(querySessions({ search: "servo motors" })).toHaveLength(1);
    expect(querySessions({ search: "precision actuators" })).toHaveLength(1);
    expect(querySessions({ search: "rapidly evolving" })).toHaveLength(1);
  });

  it("searches within synthesis themes and recommendation", () => {
    saveSession({
      subject: "Fintech",
      angleResults: [sampleAngleResult],
      synthesis: {
        topIdeas: [
          {
            title: "Idea",
            description: "A fintech idea",
            sourceAngle: "scamper",
            feasibility: "high",
            potentialImpact: "Large",
          },
        ],
        themes: ["decentralized finance"],
        recommendation: "Focus on blockchain interoperability",
      },
    });
    saveSession({ subject: "Other", angleResults: [] });

    expect(querySessions({ search: "decentralized finance" })).toHaveLength(1);
    expect(querySessions({ search: "blockchain interoperability" })).toHaveLength(1);
  });

  // ---- Export as Markdown ----

  it("exports a session as Markdown", () => {
    const id = saveSession({
      subject: "AI Testing",
      angleResults: [sampleAngleResult],
      tags: ["ai", "testing"],
      notes: "Important session",
    });
    const session = getSession(id)!;
    const md = exportSessionAsMarkdown(session);
    expect(md).toContain("# Innovation Session: AI Testing");
    expect(md).toContain("**Tags**: ai, testing");
    expect(md).toContain("**Notes**: Important session");
    expect(md).toContain("### SCAMPER");
    expect(md).toContain("#### Test Idea");
  });

  // ---- Export as CSV ----

  it("exports a session as CSV with proper escaping", () => {
    const id = saveSession({
      subject: "Solar, Wind & More",
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: 'Idea with "quotes"',
              description: "A description with,commas",
              potentialImpact: "High",
              implementationHint: "Step 1",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ],
    });
    const session = getSession(id)!;
    const csv = exportSessionAsCsv(session);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Subject,Angle,Idea Title,Description,Impact,Implementation Hint");
    expect(lines).toHaveLength(2);
    // Verify that commas and quotes are escaped
    expect(lines[1]).toContain('"Solar, Wind & More"');
    expect(lines[1]).toContain('"Idea with ""quotes"""');
  });

  it("guards against CSV formula injection", () => {
    const id = saveSession({
      subject: "=cmd|'/C calc'!A0",
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "+SUM(A1:A10)",
              description: "-1+1",
              potentialImpact: "@import('evil')",
              implementationHint: "Normal text",
            },
          ],
          reasoning: "Applied SCAMPER",
        },
      ],
    });
    const session = getSession(id)!;
    const csv = exportSessionAsCsv(session);
    const lines = csv.split("\n");
    // All dangerous leading characters should be prefixed with a single quote
    expect(lines[1]).toContain("'=cmd");
    expect(lines[1]).toContain("'+SUM");
    expect(lines[1]).toContain("'-1+1");
    expect(lines[1]).toContain("'@import");
  });

  // ---- Security: Path traversal prevention ----

  it("rejects session IDs with path traversal characters", () => {
    expect(() => getSession("../../../etc/passwd")).toThrow("invalid characters");
    expect(() => deleteSession("foo/bar")).toThrow("invalid characters");
    expect(() => updateSession("a..b", { notes: "x" })).toThrow("invalid characters");
  });

  it("rejects empty session IDs", () => {
    expect(() => getSession("")).toThrow("non-empty string");
  });

  it("rejects overly long session IDs", () => {
    const longId = "a".repeat(201);
    expect(() => getSession(longId)).toThrow("must not exceed 200 characters");
  });

  // ---- Export as JSON ----

  it("exports a session as JSON", () => {
    const id = saveSession({
      subject: "JSON Export Test",
      angleResults: [sampleAngleResult],
      tags: ["test"],
    });
    const session = getSession(id)!;
    const json = exportSessionAsJson(session);
    const parsed = JSON.parse(json);
    expect(parsed.subject).toBe("JSON Export Test");
    expect(parsed.tags).toEqual(["test"]);
    expect(parsed.angleResults).toHaveLength(1);
    expect(parsed.id).toBe(id);
  });

  // ---- Export as HTML ----

  it("exports a session as HTML with all sections", () => {
    const id = saveSession({
      subject: "HTML Export Test",
      investigation: {
        summary: "Test summary",
        keyAspects: [{ title: "Aspect 1", description: "Desc 1" }],
        currentState: "Current state",
        challenges: ["Challenge 1"],
        opportunities: ["Opportunity 1"],
      },
      angleResults: [sampleAngleResult],
      synthesis: {
        topIdeas: [
          {
            title: "Top Idea",
            description: "Top description",
            sourceAngle: "SCAMPER",
            potentialImpact: "High",
            feasibility: "high",
          },
        ],
        themes: ["Theme 1", "Theme 2"],
        recommendation: "Strategic recommendation",
      },
      tags: ["html", "test"],
      notes: "Test notes",
    });
    const session = getSession(id)!;
    const html = exportSessionAsHtml(session);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("HTML Export Test");
    expect(html).toContain("Test summary");
    expect(html).toContain("Aspect 1");
    expect(html).toContain("Challenge 1");
    expect(html).toContain("Opportunity 1");
    expect(html).toContain("Test Idea");
    expect(html).toContain("Top Idea");
    expect(html).toContain("Theme 1");
    expect(html).toContain("Strategic recommendation");
    expect(html).toContain("Test notes");
    expect(html).toContain("html");
    expect(html).toContain("</html>");
  });

  it("exports HTML without investigation or synthesis", () => {
    const id = saveSession({
      subject: "Minimal Session",
      angleResults: [],
      tags: [],
    });
    const session = getSession(id)!;
    const html = exportSessionAsHtml(session);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Minimal Session");
    expect(html).not.toContain("Investigation");
    expect(html).not.toContain("Synthesis");
  });

  it("HTML-escapes special characters to prevent XSS", () => {
    const id = saveSession({
      subject: '<script>alert("xss")</script>',
      angleResults: [],
      tags: ["<b>bold</b>"],
    });
    const session = getSession(id)!;
    const html = exportSessionAsHtml(session);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  // ---- Duplicate session ----

  it("duplicates an existing session with a new ID", () => {
    const originalId = saveSession({
      subject: "Original Session",
      angleResults: [sampleAngleResult],
      tags: ["original"],
      notes: "Original notes",
    });
    const newId = duplicateSession(originalId);
    expect(newId).toBeDefined();
    expect(newId).not.toBe(originalId);
    const newSession = getSession(newId!)!;
    expect(newSession.subject).toBe("Original Session");
    expect(newSession.tags).toEqual(["original"]);
    expect(newSession.notes).toBe("Original notes");
    expect(newSession.angleResults).toHaveLength(1);
  });

  it("returns undefined when duplicating non-existent session", () => {
    expect(duplicateSession("nonexistent-id")).toBeUndefined();
  });

  // ---- Clear history ----

  it("clears all sessions", () => {
    saveSession({ subject: "A", angleResults: [] });
    saveSession({ subject: "B", angleResults: [] });
    saveSession({ subject: "C", angleResults: [] });
    const deleted = clearHistory();
    expect(deleted).toBe(3);
    expect(listSessions()).toHaveLength(0);
  });

  it("returns 0 when clearing empty history", () => {
    const deleted = clearHistory();
    expect(deleted).toBe(0);
  });
});
