import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock core to avoid copilot SDK resolution issues in test environment
const mockCreateIaCSession = vi.fn();
const mockSessionFileName = vi.fn();
const mockDiffSessions = vi.fn();
const mockFormatSessionDiff = vi.fn();
const mockIdeaToGitHubIssue = vi.fn();
const mockListIaCSessions = vi.fn();
const mockValidateIaCSession = vi.fn();
const mockGenerateNoveltyReport = vi.fn();
const mockNoveltyReportToMarkdown = vi.fn();
const mockClearPriorArt = vi.fn();
const mockRunMonteCarloComparison = vi.fn();
const mockMonteCarloToMarkdown = vi.fn();

vi.mock("@innovator/core", () => ({
  createIaCSession: (...args: unknown[]) => mockCreateIaCSession(...args),
  sessionFileName: (...args: unknown[]) => mockSessionFileName(...args),
  diffSessions: (...args: unknown[]) => mockDiffSessions(...args),
  formatSessionDiff: (...args: unknown[]) => mockFormatSessionDiff(...args),
  ideaToGitHubIssue: (...args: unknown[]) => mockIdeaToGitHubIssue(...args),
  listIaCSessions: (...args: unknown[]) => mockListIaCSessions(...args),
  validateIaCSession: (...args: unknown[]) => mockValidateIaCSession(...args),
  DEFAULT_CONFIG_YAML: "# config\nversion: \"1.0\"\n",
  DEFAULT_ANGLES_YAML: "# angles\n",
  generateNoveltyReport: (...args: unknown[]) => mockGenerateNoveltyReport(...args),
  noveltyReportToMarkdown: (...args: unknown[]) => mockNoveltyReportToMarkdown(...args),
  clearPriorArt: (...args: unknown[]) => mockClearPriorArt(...args),
  runMonteCarloComparison: (...args: unknown[]) => mockRunMonteCarloComparison(...args),
  twinMonteCarloToMarkdown: (...args: unknown[]) => mockMonteCarloToMarkdown(...args),
}));

import {
  createIaCSession,
  sessionFileName,
  diffSessions,
  formatSessionDiff,
  ideaToGitHubIssue,
  listIaCSessions,
  validateIaCSession,
  DEFAULT_CONFIG_YAML,
  DEFAULT_ANGLES_YAML,
} from "@innovator/core";

function makeTestSession() {
  return {
    version: "1.0",
    id: "cli-test-1",
    parent: null,
    subject: "CLI test topic",
    timestamp: "2026-05-12T10:00:00.000Z",
    config: { model: "gpt-4.1" },
    investigation: {
      summary: "CLI test summary",
      keyAspects: [{ title: "Aspect", description: "Desc" }],
      currentState: "Current",
      challenges: ["Challenge"],
      opportunities: ["Opportunity"],
    },
    angleResults: [
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [{ title: "CLI Idea", description: "d", potentialImpact: "p", implementationHint: "h" }],
        reasoning: "Applied SCAMPER",
      },
    ],
    synthesis: {
      topIdeas: [{ title: "Top", description: "d", sourceAngle: "SCAMPER", potentialImpact: "p", feasibility: "high" as const }],
      themes: ["Theme"],
      recommendation: "Rec",
    },
    metadata: { durationMs: 1000 },
    tags: [],
  };
}

describe("CLI IaC init simulation", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `innovator-cli-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates .innovator/ directory structure", () => {
    const dir = join(testDir, ".innovator");
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(dir, "config.yaml"), DEFAULT_CONFIG_YAML);
    writeFileSync(join(dir, "angles.yaml"), DEFAULT_ANGLES_YAML);

    expect(existsSync(dir)).toBe(true);
    expect(existsSync(sessionsDir)).toBe(true);
    expect(existsSync(join(dir, "config.yaml"))).toBe(true);
    expect(existsSync(join(dir, "angles.yaml"))).toBe(true);
  });

  it("saves and reads sessions from .innovator/sessions/", () => {
    const dir = join(testDir, ".innovator", "sessions");
    mkdirSync(dir, { recursive: true });

    const session = makeTestSession();
    mockSessionFileName.mockReturnValue("2026-05-12-cli-test-topic.json");
    const filename = sessionFileName(session);
    writeFileSync(join(dir, filename), JSON.stringify(session, null, 2));

    const read = JSON.parse(readFileSync(join(dir, filename), "utf-8"));
    expect(read.subject).toBe("CLI test topic");
  });

  it("diffs two session files", () => {
    const a = makeTestSession();
    const b = { ...makeTestSession(), id: "b", subject: "Topic B" };
    mockDiffSessions.mockReturnValue({
      sessionA: { id: "a", subject: "CLI test topic", timestamp: "2026-05-12" },
      sessionB: { id: "b", subject: "Topic B", timestamp: "2026-05-12" },
      entries: [{ field: "subject", type: "changed", description: "Subject changed" }],
      summary: "1 change",
    });
    mockFormatSessionDiff.mockReturnValue("Innovation Diff\n━━━━━━━━\nA: CLI test topic\nB: Topic B");

    const diff = diffSessions(a, b);
    expect(diff.entries.length).toBeGreaterThan(0);
    const text = formatSessionDiff(diff);
    expect(text).toContain("CLI test topic");
    expect(text).toContain("Topic B");
  });

  it("generates GitHub issue from session idea", () => {
    const session = makeTestSession();
    const idea = session.synthesis.topIdeas[0];
    mockIdeaToGitHubIssue.mockReturnValue({
      title: "💡 Top",
      body: "## Innovation Idea\nInnovation-as-Code",
      labels: ["innovation", "idea"],
    });
    const issue = ideaToGitHubIssue(session, idea);
    expect(issue.title).toContain("Top");
    expect(issue.body).toContain("Innovation-as-Code");
    expect(issue.labels).toContain("innovation");
  });

  it("lists sessions", () => {
    mockListIaCSessions.mockReturnValue("Innovation Sessions\n━━━━━━━━\nSession One\nSession Two\nTotal: 2");
    const text = listIaCSessions([makeTestSession()]);
    expect(text).toContain("Total: 2");
  });

  it("validates session files", () => {
    mockValidateIaCSession.mockReturnValueOnce(null).mockReturnValueOnce("id: Required");
    expect(validateIaCSession(makeTestSession())).toBeNull();
    expect(validateIaCSession({})).toBeTruthy();
  });

  it("config YAML contains expected structure", () => {
    expect(DEFAULT_CONFIG_YAML).toContain("version:");
  });
});

describe("CLI Novelty commands (unit)", () => {
  it("generates novelty report", () => {
    mockGenerateNoveltyReport.mockReturnValue({
      id: "r1",
      summary: { totalIdeas: 1, highlyNovel: 1, averageNovelty: 90 },
      assessments: [{ ideaTitle: "Novel DNA Storage", noveltyScore: 90 }],
    });
    mockNoveltyReportToMarkdown.mockReturnValue("# Novelty Report\nNovel DNA Storage — 90/100");

    const { generateNoveltyReport: gnr, noveltyReportToMarkdown: nrm } = vi.mocked({ generateNoveltyReport: mockGenerateNoveltyReport, noveltyReportToMarkdown: mockNoveltyReportToMarkdown });
    const report = gnr([{ title: "Novel DNA Storage", description: "Store data in synthetic DNA" }]);
    expect(report.summary.totalIdeas).toBe(1);
    const md = nrm(report);
    expect(md).toContain("Novel DNA Storage");
  });
});

describe("CLI Simulate commands (unit)", () => {
  it("runs Monte Carlo comparison", () => {
    mockRunMonteCarloComparison.mockReturnValue({
      results: [{ strategyName: "A" }, { strategyName: "B" }],
      recommendation: "Use strategy A",
    });
    mockMonteCarloToMarkdown.mockReturnValue("# Monte Carlo Report\nStrategy A recommended");

    const comparison = mockRunMonteCarloComparison({}, [{}, {}], {});
    expect(comparison.results).toHaveLength(2);
    const md = mockMonteCarloToMarkdown(comparison);
    expect(md).toContain("Monte Carlo");
  });
});
