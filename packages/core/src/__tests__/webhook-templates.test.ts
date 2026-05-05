import { describe, it, expect } from "vitest";
import {
  getWebhookTemplate,
  listWebhookTemplates,
  SLACK_TEMPLATE,
  GITHUB_ISSUES_TEMPLATE,
  JIRA_TEMPLATE,
  EMAIL_TEMPLATE,
  WEBHOOK_TEMPLATES,
} from "../events/templates.js";

const sampleEvent = {
  type: "idea.scored" as const,
  payload: { ideaTitle: "AI Assistant", score: 95 } as Record<string, unknown>,
  subject: "Innovation brainstorm",
};

describe("webhook templates", () => {
  describe("listWebhookTemplates", () => {
    it("returns all 4 templates", () => {
      const templates = listWebhookTemplates();
      expect(templates).toHaveLength(4);
    });

    it("includes all expected template IDs", () => {
      const ids = listWebhookTemplates().map((t) => t.id);
      expect(ids).toContain("slack");
      expect(ids).toContain("github-issues");
      expect(ids).toContain("jira");
      expect(ids).toContain("email");
    });

    it("returns a copy (not the original array)", () => {
      const list = listWebhookTemplates();
      list.push({} as unknown);
      expect(listWebhookTemplates()).toHaveLength(4);
    });
  });

  describe("getWebhookTemplate", () => {
    it("retrieves template by ID", () => {
      expect(getWebhookTemplate("slack")).toBeDefined();
      expect(getWebhookTemplate("slack")!.name).toBe("Slack Notification");
    });

    it("returns undefined for unknown ID", () => {
      expect(getWebhookTemplate("unknown")).toBeUndefined();
    });
  });

  // ---- Slack ----
  describe("Slack template", () => {
    it("has correct urlPattern", () => {
      expect(SLACK_TEMPLATE.urlPattern).toContain("hooks.slack.com");
    });

    it("filters for pipeline.completed and idea.scored events", () => {
      expect(SLACK_TEMPLATE.events).toContain("pipeline.completed");
      expect(SLACK_TEMPLATE.events).toContain("idea.scored");
    });

    it("produces body with text and blocks", () => {
      const body = SLACK_TEMPLATE.bodyTemplate(sampleEvent);
      expect(body).toHaveProperty("text");
      expect(body).toHaveProperty("blocks");
      expect(typeof body.text).toBe("string");
      expect(body.text as string).toContain("idea.scored");
    });

    it("includes subject in body when present", () => {
      const body = SLACK_TEMPLATE.bodyTemplate(sampleEvent);
      const blocks = body.blocks as unknown[];
      const blockText = blocks[0]?.text?.text as string;
      expect(blockText).toContain("Innovation brainstorm");
    });
  });

  // ---- GitHub Issues ----
  describe("GitHub Issues template", () => {
    it("has URL pattern with {owner}/{repo} substitution", () => {
      expect(GITHUB_ISSUES_TEMPLATE.urlPattern).toContain("{owner}/{repo}");
    });

    it("sets Accept header for GitHub API", () => {
      expect(GITHUB_ISSUES_TEMPLATE.headers?.Accept).toBe("application/vnd.github.v3+json");
    });

    it("produces body with title, body, and labels", () => {
      const body = GITHUB_ISSUES_TEMPLATE.bodyTemplate(sampleEvent);
      expect(body).toHaveProperty("title");
      expect(body).toHaveProperty("body");
      expect(body).toHaveProperty("labels");
      expect(body.title as string).toContain("AI Assistant");
      expect(body.labels as string[]).toContain("innovation");
    });

    it("falls back to event type when no ideaTitle", () => {
      const body = GITHUB_ISSUES_TEMPLATE.bodyTemplate({
        type: "pipeline.completed",
        payload: {},
        subject: "Test",
      });
      expect(body.title as string).toContain("pipeline.completed");
    });
  });

  // ---- Jira ----
  describe("Jira template", () => {
    it("has URL pattern with {domain} substitution", () => {
      expect(JIRA_TEMPLATE.urlPattern).toContain("{domain}");
      expect(JIRA_TEMPLATE.urlPattern).toContain("atlassian.net");
    });

    it("produces Atlassian Document Format body", () => {
      const body = JIRA_TEMPLATE.bodyTemplate(sampleEvent);
      expect(body).toHaveProperty("fields");
      const fields = body.fields as unknown;
      expect(fields.project.key).toBe("INNOV");
      expect(fields.issuetype.name).toBe("Task");
      expect(fields.summary).toContain("AI Assistant");
      expect(fields.description.type).toBe("doc");
    });

    it("filters for idea.scored events only", () => {
      expect(JIRA_TEMPLATE.events).toContain("idea.scored");
      expect(JIRA_TEMPLATE.events).not.toContain("pipeline.failed");
    });
  });

  // ---- Email ----
  describe("Email template", () => {
    it("has SendGrid-compatible URL pattern", () => {
      expect(EMAIL_TEMPLATE.urlPattern).toContain("sendgrid.com");
    });

    it("produces body with personalizations, from, subject, and HTML content", () => {
      const body = EMAIL_TEMPLATE.bodyTemplate(sampleEvent);
      expect(body).toHaveProperty("personalizations");
      expect(body).toHaveProperty("from");
      expect(body).toHaveProperty("subject");
      expect(body).toHaveProperty("content");
      expect(body.subject as string).toContain("idea.scored");
      const content = (body.content as unknown[])[0];
      expect(content.type).toBe("text/html");
      expect(content.value).toContain("<h2>");
    });

    it("filters for pipeline.completed and pipeline.failed events", () => {
      expect(EMAIL_TEMPLATE.events).toContain("pipeline.completed");
      expect(EMAIL_TEMPLATE.events).toContain("pipeline.failed");
      expect(EMAIL_TEMPLATE.events).not.toContain("idea.scored");
    });
  });

  // ---- All templates have required fields ----
  describe("all templates have required fields", () => {
    for (const template of WEBHOOK_TEMPLATES) {
      it(`${template.id} has id, name, description, urlPattern, events, bodyTemplate`, () => {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.urlPattern).toBeTruthy();
        expect(template.events.length).toBeGreaterThan(0);
        expect(typeof template.bodyTemplate).toBe("function");
      });
    }
  });
});
