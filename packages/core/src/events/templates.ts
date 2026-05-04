/**
 * @module events/templates
 *
 * Pre-built webhook templates for common integrations.
 */

import type { EventType } from "./types.js";

export interface WebhookTemplate {
  id: string;
  name: string;
  description: string;
  urlPattern: string;
  events: EventType[];
  headers?: Record<string, string>;
  bodyTemplate: (event: { type: string; payload: Record<string, unknown>; subject?: string }) => Record<string, unknown>;
}

export const SLACK_TEMPLATE: WebhookTemplate = {
  id: "slack",
  name: "Slack Notification",
  description: "Post innovation events to a Slack channel via incoming webhook",
  urlPattern: "https://hooks.slack.com/services/T.../B.../...",
  events: ["pipeline.completed", "idea.scored"],
  bodyTemplate: (event) => ({
    text: `🚀 *Innovation Event: ${event.type}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${event.type}*${event.subject ? ` — ${event.subject}` : ""}\n${JSON.stringify(event.payload).slice(0, 500)}`,
        },
      },
    ],
  }),
};

export const GITHUB_ISSUES_TEMPLATE: WebhookTemplate = {
  id: "github-issues",
  name: "GitHub Issue Creator",
  description: "Create GitHub issues from high-scoring ideas",
  urlPattern: "https://api.github.com/repos/{owner}/{repo}/issues",
  events: ["idea.scored", "pipeline.completed"],
  headers: { Accept: "application/vnd.github.v3+json" },
  bodyTemplate: (event) => ({
    title: `[Innovation] ${(event.payload as Record<string, string>).ideaTitle ?? event.type}`,
    body: `## Innovation Pipeline Event\n\n**Type:** ${event.type}\n**Subject:** ${event.subject ?? "N/A"}\n\n### Details\n\n\`\`\`json\n${JSON.stringify(event.payload, null, 2).slice(0, 2000)}\n\`\`\``,
    labels: ["innovation", "auto-generated"],
  }),
};

export const JIRA_TEMPLATE: WebhookTemplate = {
  id: "jira",
  name: "Jira Ticket Creator",
  description: "Create Jira tickets from validated ideas",
  urlPattern: "https://{domain}.atlassian.net/rest/api/3/issue",
  events: ["idea.scored"],
  headers: { Accept: "application/json" },
  bodyTemplate: (event) => ({
    fields: {
      project: { key: "INNOV" },
      summary: `[Innovation] ${(event.payload as Record<string, string>).ideaTitle ?? event.type}`,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Generated from innovation pipeline: ${event.subject ?? ""}\n${JSON.stringify(event.payload).slice(0, 1000)}`,
              },
            ],
          },
        ],
      },
      issuetype: { name: "Task" },
    },
  }),
};

export const EMAIL_TEMPLATE: WebhookTemplate = {
  id: "email",
  name: "Email Notification",
  description: "Send email notifications via a webhook-compatible email service (e.g., SendGrid, Mailgun)",
  urlPattern: "https://api.sendgrid.com/v3/mail/send",
  events: ["pipeline.completed", "pipeline.failed"],
  bodyTemplate: (event) => ({
    personalizations: [{ to: [{ email: "{recipient}" }] }],
    from: { email: "innovation@example.com" },
    subject: `Innovation ${event.type}: ${event.subject ?? "Update"}`,
    content: [
      {
        type: "text/html",
        value: `<h2>Innovation Pipeline Event</h2><p><strong>Type:</strong> ${event.type}</p><p><strong>Subject:</strong> ${event.subject ?? "N/A"}</p><pre>${JSON.stringify(event.payload, null, 2).slice(0, 2000)}</pre>`,
      },
    ],
  }),
};

export const WEBHOOK_TEMPLATES: WebhookTemplate[] = [
  SLACK_TEMPLATE,
  GITHUB_ISSUES_TEMPLATE,
  JIRA_TEMPLATE,
  EMAIL_TEMPLATE,
];

/**
 * Get a webhook template by ID.
 */
export function getWebhookTemplate(templateId: string): WebhookTemplate | undefined {
  return WEBHOOK_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * List all available webhook templates.
 */
export function listWebhookTemplates(): WebhookTemplate[] {
  return [...WEBHOOK_TEMPLATES];
}
