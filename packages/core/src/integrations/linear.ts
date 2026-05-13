/**
 * @module integrations/linear
 *
 * Linear integration — create issues from innovation ideas
 * using the Linear GraphQL API.
 */

import type { IdeaExportPayload, ExportResult } from "./index.js";

export interface LinearConfig {
  apiToken: string;
  teamId: string;
  projectId?: string;
  labelIds?: string[];
  assigneeId?: string;
}

export class LinearIntegration {
  /** Create a Linear issue from an innovation idea. */
  async createIssue(idea: IdeaExportPayload, config: LinearConfig): Promise<ExportResult> {
    const priorityMap: Record<string, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    const input: Record<string, unknown> = {
      teamId: config.teamId,
      title: `💡 ${idea.title}`,
      description: [
        idea.description,
        "",
        `**Potential Impact:** ${idea.potentialImpact}`,
        idea.implementationHint ? `**Implementation:** ${idea.implementationHint}` : "",
        idea.sourceAngle ? `**Source Angle:** ${idea.sourceAngle}` : "",
        "",
        "---",
        "_Created by Innovator AI_",
      ]
        .filter(Boolean)
        .join("\n"),
      ...(config.projectId ? { projectId: config.projectId } : {}),
      ...(config.assigneeId ? { assigneeId: config.assigneeId } : {}),
      ...(config.labelIds?.length ? { labelIds: config.labelIds } : {}),
      ...(idea.priority ? { priority: priorityMap[idea.priority] ?? 3 } : {}),
    };

    try {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: config.apiToken,
        },
        body: JSON.stringify({
          query: `mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier url }
            }
          }`,
          variables: { input },
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Linear API error: ${res.status}`,
          integration: "linear",
        };
      }

      const data = (await res.json()) as {
        data?: { issueCreate?: { issue?: { identifier: string; url: string } } };
      };
      const issue = data.data?.issueCreate?.issue;

      return {
        success: !!issue,
        externalId: issue?.identifier,
        externalUrl: issue?.url,
        integration: "linear",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Linear issue creation failed",
        integration: "linear",
      };
    }
  }

  /** Create multiple Linear issues in batch. */
  async createBulkIssues(
    ideas: IdeaExportPayload[],
    config: LinearConfig
  ): Promise<ExportResult[]> {
    return Promise.all(ideas.map((idea) => this.createIssue(idea, config)));
  }
}
