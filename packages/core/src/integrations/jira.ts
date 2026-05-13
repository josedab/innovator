/**
 * @module integrations/jira
 *
 * Jira integration — create issues from innovation ideas
 * using the Jira REST API v3 (Atlassian Document Format).
 */

import type { IdeaExportPayload, IntegrationConfig, ExportResult } from "./index.js";

export interface JiraConfig {
  apiUrl: string;
  apiToken: string;
  projectKey: string;
  issueType?: string;
  epicKey?: string;
  assignee?: string;
  labels?: string[];
}

export class JiraIntegration {
  /** Create a Jira issue from an innovation idea. */
  async createIssue(idea: IdeaExportPayload, config: JiraConfig): Promise<ExportResult> {
    const body = this.buildIssuePayload(idea, config);

    try {
      const res = await fetch(`${config.apiUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${config.apiToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Jira API error: ${err}`, integration: "jira" };
      }

      const data = (await res.json()) as { key: string; self: string };
      return {
        success: true,
        externalId: data.key,
        externalUrl: `${config.apiUrl}/browse/${data.key}`,
        integration: "jira",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Jira issue creation failed",
        integration: "jira",
      };
    }
  }

  /** Create multiple Jira issues in batch. */
  async createBulkIssues(
    ideas: IdeaExportPayload[],
    config: JiraConfig
  ): Promise<ExportResult[]> {
    return Promise.all(ideas.map((idea) => this.createIssue(idea, config)));
  }

  /** Build a Jira REST API issue payload (Atlassian Document Format). */
  buildIssuePayload(
    idea: IdeaExportPayload,
    config: JiraConfig
  ): Record<string, unknown> {
    const priorityMap: Record<string, string> = {
      critical: "Highest",
      high: "High",
      medium: "Medium",
      low: "Low",
    };

    return {
      fields: {
        project: { key: config.projectKey },
        summary: `💡 ${idea.title}`,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: idea.description }],
            },
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Potential Impact" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: idea.potentialImpact }],
            },
            ...(idea.implementationHint
              ? [
                  {
                    type: "heading",
                    attrs: { level: 3 },
                    content: [{ type: "text", text: "Implementation" }],
                  },
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: idea.implementationHint }],
                  },
                ]
              : []),
          ],
        },
        issuetype: { name: config.issueType ?? "Task" },
        labels: [
          "innovator",
          ...(idea.sourceAngle ? [idea.sourceAngle] : []),
          ...(idea.labels ?? []),
          ...(config.labels ?? []),
        ],
        ...(config.assignee ? { assignee: { id: config.assignee } } : {}),
        ...(config.epicKey ? { parent: { key: config.epicKey } } : {}),
        ...(idea.priority
          ? { priority: { name: priorityMap[idea.priority] ?? "Medium" } }
          : {}),
      },
    };
  }
}
