import { describe, it, expect } from "vitest";

import {
  PRDSchema,
  UserStorySetSchema,
  OKRSetSchema,
  PitchDeckSchema,
  ADRSchema,
  GitHubIssueSchema,
  JiraTicketSchema,
  ActionFormatSchema,
  ActionContextSchema,
  prdToMarkdown,
  userStoriesToMarkdown,
  okrsToMarkdown,
  pitchDeckToMarkdown,
  adrToMarkdown,
  contextToGitHubIssue,
  contextToJiraTicket,
  generateAllFormats,
  getPromptForFormat,
  getSchemaForFormat,
  actionToMarkdown,
  listActionFormats,
} from "../action-generation/index.js";

const sampleCtx = {
  subject: "AI-powered code review",
  ideaTitle: "Smart Code Review Bot",
  ideaDescription: "An AI bot that reviews PRs and suggests improvements",
  potentialImpact: "50% faster code reviews",
  implementationHint: "Use GitHub webhooks + LLM",
  sourceAngle: "first-principles",
};

describe("action-generation", () => {
  describe("schemas", () => {
    it("validates ActionFormat enum", () => {
      const formats = [
        "prd",
        "user-stories",
        "okrs",
        "pitch-deck",
        "adr",
        "github-issue",
        "jira-ticket",
      ];
      for (const f of formats) {
        expect(ActionFormatSchema.parse(f)).toBe(f);
      }
      expect(() => ActionFormatSchema.parse("invalid")).toThrow();
    });

    it("validates ActionContext", () => {
      const parsed = ActionContextSchema.parse(sampleCtx);
      expect(parsed.subject).toBe("AI-powered code review");
      expect(parsed.ideaTitle).toBe("Smart Code Review Bot");
    });

    it("validates PRD schema", () => {
      const prd = PRDSchema.parse({
        title: "Test PRD",
        summary: "Summary",
        problemStatement: "Problem",
        proposedSolution: "Solution",
        goals: ["Goal 1"],
        nonGoals: ["Non-goal 1"],
        userPersonas: [{ name: "Dev", description: "A developer", needs: ["Speed"] }],
        requirements: [
          {
            id: "R1",
            priority: "must-have",
            description: "Core feature",
            acceptanceCriteria: ["Works"],
          },
        ],
        successMetrics: [{ metric: "Reviews/day", target: "100", measurement: "Dashboard" }],
        risks: [{ risk: "Complexity", mitigation: "Iterate", severity: "medium" }],
      });
      expect(prd.title).toBe("Test PRD");
      expect(prd.requirements).toHaveLength(1);
    });

    it("validates ADR schema", () => {
      const adr = ADRSchema.parse({
        id: "ADR-001",
        title: "Use TypeScript",
        status: "proposed",
        context: "We need type safety",
        decision: "Use TypeScript",
        consequences: [{ type: "positive", description: "Better DX" }],
        alternatives: [{ title: "JavaScript", description: "Plain JS", reason: "Less safe" }],
        date: "2025-01-01",
      });
      expect(adr.status).toBe("proposed");
    });
  });

  describe("contextToGitHubIssue", () => {
    it("creates a GitHub issue from context", () => {
      const issue = contextToGitHubIssue(sampleCtx);
      expect(issue.title).toBe("Smart Code Review Bot");
      expect(issue.body).toContain("AI bot that reviews PRs");
      expect(issue.body).toContain("Expected Impact");
      expect(issue.labels).toContain("innovation");
      expect(issue.labels).toContain("angle:first-principles");
    });

    it("handles minimal context", () => {
      const issue = contextToGitHubIssue({
        subject: "test",
        ideaTitle: "Minimal Idea",
        ideaDescription: "Desc",
      });
      expect(issue.title).toBe("Minimal Idea");
      expect(issue.body).toContain("Desc");
    });
  });

  describe("contextToJiraTicket", () => {
    it("creates a Jira ticket from context", () => {
      const ticket = contextToJiraTicket(sampleCtx);
      expect(ticket.summary).toBe("Smart Code Review Bot");
      expect(ticket.issueType).toBe("Story");
      expect(ticket.priority).toBe("Medium");
      expect(ticket.description).toContain("AI bot");
    });

    it("accepts custom issue type and priority", () => {
      const ticket = contextToJiraTicket(sampleCtx, {
        issueType: "Epic",
        priority: "High",
      });
      expect(ticket.issueType).toBe("Epic");
      expect(ticket.priority).toBe("High");
    });
  });

  describe("generateAllFormats", () => {
    it("generates both GitHub and Jira formats", () => {
      const all = generateAllFormats(sampleCtx);
      expect(all.githubIssue.title).toBe("Smart Code Review Bot");
      expect(all.jiraTicket.summary).toBe("Smart Code Review Bot");
    });
  });

  describe("Markdown converters", () => {
    it("converts PRD to markdown", () => {
      const prd = PRDSchema.parse({
        title: "Test PRD",
        summary: "A summary",
        problemStatement: "Problem here",
        proposedSolution: "Solution here",
        goals: ["Goal 1"],
        nonGoals: ["Non-goal 1"],
        userPersonas: [{ name: "User", description: "End user", needs: ["Ease"] }],
        requirements: [
          { id: "R1", priority: "must-have", description: "Feature", acceptanceCriteria: ["Done"] },
        ],
        successMetrics: [{ metric: "Speed", target: "2x", measurement: "Benchmark" }],
        risks: [],
      });
      const md = prdToMarkdown(prd);
      expect(md).toContain("# Test PRD");
      expect(md).toContain("## Goals");
      expect(md).toContain("- Goal 1");
    });

    it("converts user stories to markdown", () => {
      const set = UserStorySetSchema.parse({
        epicTitle: "Code Review Epic",
        epicDescription: "Improve code reviews",
        stories: [
          {
            id: "US-1",
            title: "Auto review",
            asA: "developer",
            iWant: "automatic PR reviews",
            soThat: "I save time",
            acceptanceCriteria: ["PR is reviewed within 5 min"],
            priority: "high",
          },
        ],
      });
      const md = userStoriesToMarkdown(set);
      expect(md).toContain("# Epic: Code Review Epic");
      expect(md).toContain("**As a** developer");
    });

    it("converts OKRs to markdown", () => {
      const okrs = OKRSetSchema.parse({
        timeframe: "Q1 2025",
        objectives: [
          {
            id: "O1",
            title: "Improve velocity",
            description: "Ship faster",
            keyResults: [
              {
                id: "KR1",
                description: "Reduce review time",
                metric: "hours",
                currentValue: "4",
                targetValue: "2",
                confidence: 0.8,
              },
            ],
          },
        ],
      });
      const md = okrsToMarkdown(okrs);
      expect(md).toContain("# OKRs — Q1 2025");
      expect(md).toContain("confidence: 80%");
    });

    it("converts pitch deck to markdown", () => {
      const deck = PitchDeckSchema.parse({
        title: "Innovation Pitch",
        audienceType: "executives",
        slides: [
          {
            slideNumber: 1,
            title: "Title Slide",
            content: "Welcome",
            layout: "title",
            speakerNotes: "Greet audience",
          },
        ],
        estimatedDurationMinutes: 10,
      });
      const md = pitchDeckToMarkdown(deck);
      expect(md).toContain("# Innovation Pitch");
      expect(md).toContain("🗣️ Greet audience");
    });

    it("converts ADR to markdown", () => {
      const adr = ADRSchema.parse({
        id: "ADR-001",
        title: "Use TypeScript",
        status: "accepted",
        context: "Need type safety",
        decision: "Adopt TypeScript",
        consequences: [
          { type: "positive", description: "Better DX" },
          { type: "negative", description: "Learning curve" },
        ],
        alternatives: [{ title: "JS", description: "Plain JavaScript", reason: "Less safe" }],
        date: "2025-01-01",
      });
      const md = adrToMarkdown(adr);
      expect(md).toContain("# ADR-001: Use TypeScript");
      expect(md).toContain("✅ Better DX");
      expect(md).toContain("❌ Learning curve");
    });
  });

  describe("actionToMarkdown", () => {
    it("dispatches to correct converter for github-issue", () => {
      const issue = GitHubIssueSchema.parse({
        title: "Test Issue",
        body: "Issue body",
      });
      const md = actionToMarkdown("github-issue", issue);
      expect(md).toContain("# Test Issue");
    });
  });

  describe("getPromptForFormat", () => {
    it("returns non-empty prompt for LLM formats", () => {
      expect(getPromptForFormat("prd", sampleCtx).length).toBeGreaterThan(0);
      expect(getPromptForFormat("user-stories", sampleCtx).length).toBeGreaterThan(0);
      expect(getPromptForFormat("okrs", sampleCtx).length).toBeGreaterThan(0);
      expect(getPromptForFormat("pitch-deck", sampleCtx).length).toBeGreaterThan(0);
      expect(getPromptForFormat("adr", sampleCtx).length).toBeGreaterThan(0);
    });

    it("returns empty for template-based formats", () => {
      expect(getPromptForFormat("github-issue", sampleCtx)).toBe("");
      expect(getPromptForFormat("jira-ticket", sampleCtx)).toBe("");
    });
  });

  describe("getSchemaForFormat", () => {
    it("returns correct schema for each format", () => {
      expect(getSchemaForFormat("prd")).toBe(PRDSchema);
      expect(getSchemaForFormat("adr")).toBe(ADRSchema);
      expect(getSchemaForFormat("github-issue")).toBe(GitHubIssueSchema);
    });
  });

  describe("listActionFormats", () => {
    it("lists all 7 formats", () => {
      const formats = listActionFormats();
      expect(formats).toHaveLength(7);
      expect(formats.find((f) => f.id === "prd")?.requiresLLM).toBe(true);
      expect(formats.find((f) => f.id === "github-issue")?.requiresLLM).toBe(false);
    });
  });
});
