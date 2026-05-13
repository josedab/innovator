import { describe, it, expect } from "vitest";
import { JiraIntegration } from "../integrations/jira.js";
import { LinearIntegration } from "../integrations/linear.js";
import { SlackIntegration } from "../integrations/slack.js";
import { ConfluenceIntegration } from "../integrations/confluence.js";
import { NotionIntegration } from "../integrations/notion.js";
import type { IdeaExportPayload } from "../integrations/index.js";

const sampleIdea: IdeaExportPayload = {
  title: "AI-Powered Code Review",
  description: "Use ML models to auto-review pull requests",
  potentialImpact: "Reduce review time by 50%",
  implementationHint: "Start with linting rules, then add ML",
  sourceAngle: "automation",
  labels: ["ai", "devtools"],
  priority: "high",
};

const minimalIdea: IdeaExportPayload = {
  title: "Simple Idea",
  description: "A basic idea",
  potentialImpact: "Some impact",
};

describe("JiraIntegration", () => {
  const jira = new JiraIntegration();
  const config = { apiUrl: "https://test.atlassian.net", apiToken: "tok", projectKey: "INN" };

  it("buildIssuePayload creates valid Jira payload with all fields", () => {
    const payload = jira.buildIssuePayload(sampleIdea, config) as any;
    expect(payload.fields.project.key).toBe("INN");
    expect(payload.fields.summary).toBe("💡 AI-Powered Code Review");
    expect(payload.fields.description.type).toBe("doc");
    expect(payload.fields.description.version).toBe(1);
    expect(payload.fields.issuetype.name).toBe("Task");
    expect(payload.fields.labels).toContain("innovator");
    expect(payload.fields.labels).toContain("automation");
    expect(payload.fields.labels).toContain("ai");
    expect(payload.fields.priority.name).toBe("High");
  });

  it("buildIssuePayload includes implementation hint in description content", () => {
    const payload = jira.buildIssuePayload(sampleIdea, config) as any;
    const content = payload.fields.description.content;
    const implHeading = content.find(
      (c: any) => c.type === "heading" && c.content?.[0]?.text === "Implementation"
    );
    expect(implHeading).toBeDefined();
  });

  it("buildIssuePayload omits implementation when not provided", () => {
    const payload = jira.buildIssuePayload(minimalIdea, config) as any;
    const content = payload.fields.description.content;
    const implHeading = content.find(
      (c: any) => c.type === "heading" && c.content?.[0]?.text === "Implementation"
    );
    expect(implHeading).toBeUndefined();
  });

  it("buildIssuePayload applies epic and assignee from config", () => {
    const payload = jira.buildIssuePayload(sampleIdea, {
      ...config,
      epicKey: "INN-100",
      assignee: "user-abc",
    }) as any;
    expect(payload.fields.parent.key).toBe("INN-100");
    expect(payload.fields.assignee.id).toBe("user-abc");
  });
});

describe("LinearIntegration", () => {
  const linear = new LinearIntegration();

  it("createIssue handles network errors gracefully", async () => {
    const config = { apiToken: "invalid", teamId: "team-1" };
    const result = await linear.createIssue(sampleIdea, config);
    // fetch to linear API will fail in test env
    expect(result.integration).toBe("linear");
    expect(typeof result.success).toBe("boolean");
  });
});

describe("SlackIntegration", () => {
  const slack = new SlackIntegration();

  it("buildIdeaBlocks creates Block Kit structure with header and dividers", () => {
    const blocks = slack.buildIdeaBlocks([sampleIdea]);
    expect(blocks[0]).toEqual({
      type: "header",
      text: { type: "plain_text", text: "💡 Innovation Ideas", emoji: true },
    });
    expect(blocks[1]).toEqual({ type: "divider" });
    // Has sections for the idea
    const sections = blocks.filter((b: any) => b.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it("buildIdeaBlocks includes implementation context block", () => {
    const blocks = slack.buildIdeaBlocks([sampleIdea]);
    const contexts = blocks.filter((b: any) => b.type === "context");
    // One for implementation hint, one for footer
    expect(contexts.length).toBe(2);
  });

  it("buildIdeaBlocks omits implementation context for minimal idea", () => {
    const blocks = slack.buildIdeaBlocks([minimalIdea]);
    const contexts = blocks.filter((b: any) => b.type === "context");
    // Only the footer context
    expect(contexts.length).toBe(1);
  });

  it("handleSlashCommand returns usage when text is empty", () => {
    const response = slack.handleSlashCommand({
      command: "/innovate",
      text: "",
      response_url: "https://hooks.slack.com/xxx",
      user_id: "U123",
      channel_id: "C123",
      team_id: "T123",
    });
    expect(response.response_type).toBe("ephemeral");
    expect(response.text).toContain("Usage");
  });

  it("handleSlashCommand returns in_channel response with subject", () => {
    const response = slack.handleSlashCommand({
      command: "/innovate",
      text: "AI in healthcare",
      response_url: "https://hooks.slack.com/xxx",
      user_id: "U123",
      channel_id: "C123",
      team_id: "T123",
    });
    expect(response.response_type).toBe("in_channel");
    expect(response.text).toContain("AI in healthcare");
    expect(response.blocks).toBeDefined();
  });
});

describe("ConfluenceIntegration", () => {
  const confluence = new ConfluenceIntegration();

  it("buildPageContent creates Confluence HTML with table", () => {
    const synthesis = {
      topIdeas: [
        {
          title: "Idea One",
          description: "Description one",
          sourceAngle: "angle-a",
          potentialImpact: "High impact",
          feasibility: "high",
        },
      ],
      themes: ["Theme A", "Theme B"],
      recommendation: "Go for it",
    };
    const html = confluence.buildPageContent(synthesis);
    expect(html).toContain("<h2>Top Ideas</h2>");
    expect(html).toContain("<h2>Themes</h2>");
    expect(html).toContain("<h2>Recommendation</h2>");
    expect(html).toContain("Idea One");
    expect(html).toContain("Theme A");
    expect(html).toContain("Go for it");
  });

  it("buildPageContent escapes HTML in content", () => {
    const synthesis = {
      topIdeas: [
        {
          title: "<script>alert('xss')</script>",
          description: "safe",
          sourceAngle: "angle",
          potentialImpact: "impact",
          feasibility: "medium",
        },
      ],
      themes: [],
      recommendation: "safe",
    };
    const html = confluence.buildPageContent(synthesis);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("buildPageContent uses color macro for feasibility", () => {
    const synthesis = {
      topIdeas: [
        {
          title: "Test",
          description: "Desc",
          sourceAngle: "angle",
          potentialImpact: "impact",
          feasibility: "high",
        },
      ],
      themes: [],
      recommendation: "rec",
    };
    const html = confluence.buildPageContent(synthesis);
    expect(html).toContain('ac:name="status"');
    expect(html).toContain("Green");
  });
});

describe("NotionIntegration", () => {
  const notion = new NotionIntegration();
  const config = { apiToken: "tok", databaseId: "db-123" };

  it("buildDatabaseEntry creates valid Notion properties", () => {
    const entry = notion.buildDatabaseEntry(sampleIdea, config) as any;
    expect(entry.parent.database_id).toBe("db-123");
    expect(entry.properties.Name.title[0].text.content).toBe("💡 AI-Powered Code Review");
    expect(entry.properties["Source Angle"].select.name).toBe("automation");
    expect(entry.properties.Priority.select.name).toBe("high");
  });

  it("buildDatabaseEntry includes children blocks with description and impact", () => {
    const entry = notion.buildDatabaseEntry(sampleIdea, config) as any;
    const headings = entry.children.filter((b: any) => b.type === "heading_2");
    expect(headings.length).toBeGreaterThanOrEqual(3); // Description, Impact, Implementation
  });

  it("buildDatabaseEntry omits optional fields for minimal idea", () => {
    const entry = notion.buildDatabaseEntry(minimalIdea, config) as any;
    expect(entry.properties["Source Angle"]).toBeUndefined();
    expect(entry.properties.Priority).toBeUndefined();
    const headings = entry.children.filter((b: any) => b.type === "heading_2");
    expect(headings.length).toBe(2); // Only Description and Impact
  });

  it("buildDatabaseEntry includes status property when configured", () => {
    const entry = notion.buildDatabaseEntry(sampleIdea, {
      ...config,
      statusProperty: "Status",
    }) as any;
    expect(entry.properties.Status.select.name).toBe("New");
  });
});
