import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDiffSessions = vi.fn();
const mockFormatSessionDiff = vi.fn();
const mockValidateIaCSession = vi.fn();
const mockValidateIaCConfig = vi.fn();
const mockIdeaToGitHubIssue = vi.fn();

vi.mock("@innovator/core", () => ({
  createIaCSession: vi.fn(),
  diffSessions: (...args: unknown[]) => mockDiffSessions(...args),
  formatSessionDiff: (...args: unknown[]) => mockFormatSessionDiff(...args),
  validateIaCSession: (...args: unknown[]) => mockValidateIaCSession(...args),
  validateIaCConfig: (...args: unknown[]) => mockValidateIaCConfig(...args),
  ideaToGitHubIssue: (...args: unknown[]) => mockIdeaToGitHubIssue(...args),
}));

import { POST } from "../iac/route";

const MOCK_SESSION = {
  version: "1.0",
  id: "test-1",
  parent: null,
  subject: "test",
  timestamp: "2026-01-01T00:00:00Z",
  config: { model: "gpt-4.1" },
  angleResults: [],
  tags: [],
  synthesis: {
    topIdeas: [
      {
        title: "Idea 1",
        description: "Desc 1",
        sourceAngle: "SCAMPER",
        potentialImpact: "High",
        feasibility: "high",
      },
    ],
    themes: ["Theme 1"],
    recommendation: "Rec 1",
  },
};

const MOCK_DIFF = {
  sessionA: { id: "a", subject: "A", timestamp: "2026-01-01" },
  sessionB: { id: "b", subject: "B", timestamp: "2026-01-02" },
  entries: [{ field: "subject", type: "changed", description: "Subject changed" }],
  summary: "1 change",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/iac", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/iac", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("diffs two sessions", async () => {
    mockValidateIaCSession.mockReturnValue(null);
    mockDiffSessions.mockReturnValue(MOCK_DIFF);
    const res = await POST(
      makeRequest({
        action: "diff",
        sessionA: MOCK_SESSION,
        sessionB: { ...MOCK_SESSION, subject: "other" },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
  });

  it("returns text format diff when requested", async () => {
    mockValidateIaCSession.mockReturnValue(null);
    mockDiffSessions.mockReturnValue(MOCK_DIFF);
    mockFormatSessionDiff.mockReturnValue("Formatted diff");
    const res = await POST(
      makeRequest({
        action: "diff",
        sessionA: MOCK_SESSION,
        sessionB: MOCK_SESSION,
        format: "text",
      })
    );
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("rejects invalid sessions in diff", async () => {
    mockValidateIaCSession.mockReturnValue("id: Required");
    const res = await POST(makeRequest({ action: "diff", sessionA: {}, sessionB: {} }));
    expect(res.status).toBe(400);
  });

  it("validates sessions", async () => {
    mockValidateIaCSession.mockReturnValue(null);
    const res = await POST(
      makeRequest({ action: "validate", type: "session", data: MOCK_SESSION })
    );
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it("validates configs", async () => {
    mockValidateIaCConfig.mockReturnValue(null);
    const res = await POST(
      makeRequest({ action: "validate", type: "config", data: { version: "1.0" } })
    );
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it("reports invalid sessions", async () => {
    mockValidateIaCSession.mockReturnValue("subject: Required");
    const res = await POST(makeRequest({ action: "validate", type: "session", data: {} }));
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it("generates GitHub Issues from session", async () => {
    mockValidateIaCSession.mockReturnValue(null);
    mockIdeaToGitHubIssue.mockReturnValue({
      title: "💡 Idea 1",
      body: "body",
      labels: ["innovation"],
    });
    const res = await POST(makeRequest({ action: "issues", session: MOCK_SESSION, topN: 1 }));
    const data = await res.json();
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].title).toBe("💡 Idea 1");
  });
});
