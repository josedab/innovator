/**
 * @module integrations
 *
 * External service integrations — export innovation results
 * to project management and knowledge tools like Jira, Linear,
 * Notion, and GitHub Issues. Each integration follows a standard interface
 * for mapping innovation outputs to tool-specific formats.
 */

import { z } from "zod";

// ---- Common Types ----

export const IntegrationStatusSchema = z.enum(["connected", "disconnected", "error"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export interface IntegrationConfig {
  id: string;
  type: "jira" | "linear" | "notion" | "github" | "slack";
  name: string;
  status: IntegrationStatus;
  apiUrl?: string;
  apiToken?: string;
  projectId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface ExportResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  integration: string;
}

export interface IdeaExportPayload {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint?: string;
  sourceAngle?: string;
  labels?: string[];
  priority?: "low" | "medium" | "high" | "critical";
}

// ---- Integration Registry ----

const integrations = new Map<string, IntegrationConfig>();

/** Register an integration connection. */
export function registerIntegration(
  config: Omit<IntegrationConfig, "createdAt">
): IntegrationConfig {
  const integration: IntegrationConfig = {
    ...config,
    createdAt: new Date().toISOString(),
  };
  integrations.set(integration.id, integration);
  return integration;
}

/** Get an integration by ID. */
export function getIntegration(id: string): IntegrationConfig | undefined {
  return integrations.get(id);
}

/** List all integrations. */
export function listIntegrations(): IntegrationConfig[] {
  return Array.from(integrations.values());
}

/** Remove an integration. */
export function removeIntegration(id: string): boolean {
  return integrations.delete(id);
}

// ---- Jira Integration ----

export interface JiraExportOptions {
  projectKey: string;
  issueType?: string;
  epicKey?: string;
  assignee?: string;
  labels?: string[];
}

/**
 * Format an innovation idea as a Jira issue payload.
 * Returns the JSON body for POST /rest/api/3/issue.
 */
export function formatJiraIssue(
  idea: IdeaExportPayload,
  options: JiraExportOptions
): Record<string, unknown> {
  const priorityMap: Record<string, string> = {
    critical: "Highest",
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return {
    fields: {
      project: { key: options.projectKey },
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
      issuetype: { name: options.issueType ?? "Task" },
      labels: [
        "innovator",
        ...(idea.sourceAngle ? [idea.sourceAngle] : []),
        ...(idea.labels ?? []),
        ...(options.labels ?? []),
      ],
      ...(options.assignee ? { assignee: { id: options.assignee } } : {}),
      ...(options.epicKey ? { parent: { key: options.epicKey } } : {}),
      ...(idea.priority ? { priority: { name: priorityMap[idea.priority] ?? "Medium" } } : {}),
    },
  };
}

/**
 * Export an idea to Jira (requires configured Jira integration).
 */
export async function exportToJira(
  idea: IdeaExportPayload,
  options: JiraExportOptions,
  integrationId?: string
): Promise<ExportResult> {
  const integration = integrationId
    ? integrations.get(integrationId)
    : Array.from(integrations.values()).find((i) => i.type === "jira");

  if (!integration || !integration.apiUrl || !integration.apiToken) {
    return {
      success: false,
      error:
        "Jira integration not configured. Set apiUrl and apiToken (base64-encoded email:api-token).",
      integration: "jira",
    };
  }

  const body = formatJiraIssue(idea, options);

  try {
    const res = await fetch(`${integration.apiUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${integration.apiToken}`,
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
      externalUrl: `${integration.apiUrl}/browse/${data.key}`,
      integration: "jira",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Jira export failed",
      integration: "jira",
    };
  }
}

// ---- Linear Integration ----

export interface LinearExportOptions {
  teamId: string;
  projectId?: string;
  labelIds?: string[];
  assigneeId?: string;
}

/**
 * Format an innovation idea as a Linear issue payload (GraphQL mutation input).
 */
export function formatLinearIssue(
  idea: IdeaExportPayload,
  options: LinearExportOptions
): Record<string, unknown> {
  const priorityMap: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  return {
    teamId: options.teamId,
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
    ...(options.projectId ? { projectId: options.projectId } : {}),
    ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
    ...(options.labelIds?.length ? { labelIds: options.labelIds } : {}),
    ...(idea.priority ? { priority: priorityMap[idea.priority] ?? 3 } : {}),
  };
}

/**
 * Export an idea to Linear (requires configured Linear integration).
 */
export async function exportToLinear(
  idea: IdeaExportPayload,
  options: LinearExportOptions,
  integrationId?: string
): Promise<ExportResult> {
  const integration = integrationId
    ? integrations.get(integrationId)
    : Array.from(integrations.values()).find((i) => i.type === "linear");

  if (!integration || !integration.apiToken) {
    return { success: false, error: "Linear integration not configured", integration: "linear" };
  }

  const input = formatLinearIssue(idea, options);

  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: integration.apiToken,
      },
      body: JSON.stringify({
        query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
        variables: { input },
      }),
    });

    if (!res.ok) {
      return { success: false, error: `Linear API error: ${res.status}`, integration: "linear" };
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
      error: err instanceof Error ? err.message : "Linear export failed",
      integration: "linear",
    };
  }
}

// ---- Notion Integration ----

export interface NotionExportOptions {
  databaseId: string;
  statusProperty?: string;
}

/**
 * Format an innovation idea as a Notion page payload.
 */
export function formatNotionPage(
  idea: IdeaExportPayload,
  options: NotionExportOptions
): Record<string, unknown> {
  return {
    parent: { database_id: options.databaseId },
    properties: {
      Name: { title: [{ text: { content: `💡 ${idea.title}` } }] },
      ...(idea.sourceAngle ? { "Source Angle": { select: { name: idea.sourceAngle } } } : {}),
      ...(idea.priority ? { Priority: { select: { name: idea.priority } } } : {}),
      ...(options.statusProperty ? { [options.statusProperty]: { select: { name: "New" } } } : {}),
    },
    children: [
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "Description" } }] },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: idea.description } }] },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "Potential Impact" } }] },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: idea.potentialImpact } }] },
      },
      ...(idea.implementationHint
        ? [
            {
              object: "block",
              type: "heading_2",
              heading_2: { rich_text: [{ text: { content: "Implementation" } }] },
            },
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ text: { content: idea.implementationHint } }] },
            },
          ]
        : []),
    ],
  };
}

/**
 * Export an idea to Notion (requires configured Notion integration).
 */
export async function exportToNotion(
  idea: IdeaExportPayload,
  options: NotionExportOptions,
  integrationId?: string
): Promise<ExportResult> {
  const integration = integrationId
    ? integrations.get(integrationId)
    : Array.from(integrations.values()).find((i) => i.type === "notion");

  if (!integration || !integration.apiToken) {
    return { success: false, error: "Notion integration not configured", integration: "notion" };
  }

  const body = formatNotionPage(idea, options);

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${integration.apiToken}`,
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Notion API error: ${err}`, integration: "notion" };
    }

    const data = (await res.json()) as { id: string; url: string };
    return {
      success: true,
      externalId: data.id,
      externalUrl: data.url,
      integration: "notion",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notion export failed",
      integration: "notion",
    };
  }
}

/** Clear all integrations (for testing). */
export function clearIntegrations(): void {
  integrations.clear();
}

// ---- Class-based Integration Re-exports ----

export { JiraIntegration } from "./jira.js";
export type { JiraConfig } from "./jira.js";
export { LinearIntegration } from "./linear.js";
export type { LinearConfig } from "./linear.js";
export { SlackIntegration } from "./slack.js";
export type { SlackConfig } from "./slack.js";
export { ConfluenceIntegration } from "./confluence.js";
export type { ConfluenceConfig } from "./confluence.js";
export { NotionIntegration } from "./notion.js";
export type { NotionConfig } from "./notion.js";
export {
  GitHubIssueExportOptionsSchema,
  GitHubIssuePayloadSchema,
  GitHubIssueImportOptionsSchema,
  GitHubImportedIssueSubjectSchema,
  formatGitHubIssue,
  exportToGitHub,
  importGitHubIssues,
  GitHubIssuesIntegration,
} from "./github-issues.js";
export type {
  GitHubIssueExportOptions,
  GitHubIssuePayload,
  GitHubIssueImportOptions,
  GitHubImportedIssueSubject,
  GitHubIssuesConfig,
} from "./github-issues.js";
export {
  BacklogItemSchema,
  BacklogAnalysisSchema,
  BacklogImportInputSchema,
  importBacklog,
  getImportedBacklog,
  analyzeBacklog,
  backlogToInnovationSubjects,
  clearImportedBacklog,
} from "./backlog-import.js";
export type { BacklogItem, BacklogAnalysis, BacklogImportInput } from "./backlog-import.js";
export {
  SyncRecordSchema,
  SyncEventSchema,
  createSyncRecord,
  getSyncRecord,
  getSyncRecordByExternalId,
  listSyncRecords,
  updateSyncStatus,
  recordSyncEvent,
  getSyncEvents,
  clearSyncData,
} from "./sync-tracker.js";
export type { SyncRecord, SyncEvent, CreateSyncRecordInput } from "./sync-tracker.js";
