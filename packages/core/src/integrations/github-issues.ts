/**
 * @module integrations/github-issues
 *
 * GitHub Issues integration — create and import GitHub issues
 * for innovation workflows using the GitHub REST and GraphQL APIs.
 */

import { z } from "zod";
import type { IdeaExportPayload, ExportResult } from "./index.js";

export const GitHubIssueExportOptionsSchema = z.object({
  owner: z.string().max(100),
  repo: z.string().max(100),
  labels: z.array(z.string().max(50)).max(10).optional(),
  assignees: z.array(z.string().max(100)).max(10).optional(),
  milestone: z.number().int().optional(),
  projectId: z.string().max(100).optional(),
});
export type GitHubIssueExportOptions = z.infer<typeof GitHubIssueExportOptionsSchema>;

export const GitHubIssuePayloadSchema = z.object({
  title: z.string().max(500),
  body: z.string(),
  labels: z.array(z.string()).max(10),
  assignees: z.array(z.string()).max(10),
  milestone: z.number().int().optional(),
});
export type GitHubIssuePayload = z.infer<typeof GitHubIssuePayloadSchema>;

export const GitHubIssueImportOptionsSchema = z.object({
  state: z.enum(["open", "closed", "all"]).optional(),
  labels: z.array(z.string().max(50)).max(10).optional(),
  assignee: z.string().max(100).optional(),
  milestone: z.union([z.string().max(100), z.number().int()]).optional(),
  since: z.string().max(100).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
  integrationId: z.string().max(200).optional(),
});
export type GitHubIssueImportOptions = z.infer<typeof GitHubIssueImportOptionsSchema>;

export const GitHubImportedIssueSubjectSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(5000),
  status: z.string().max(100),
  labels: z.array(z.string().max(100)).max(20),
  assignee: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  source: z.literal("github"),
  rationale: z.string().max(1000),
});
export type GitHubImportedIssueSubject = z.infer<typeof GitHubImportedIssueSubjectSchema>;

export interface GitHubIssuesConfig extends GitHubIssueExportOptions {
  apiToken: string;
  apiUrl?: string;
}

type GitHubIssueApiResponse = {
  number: number;
  html_url?: string;
  node_id?: string;
  title: string;
  body?: string | null;
  state: string;
  labels?: Array<string | { name?: string | null }>;
  assignee?: { login?: string | null } | null;
  pull_request?: unknown;
};

/**
 * Format an innovation idea as a GitHub issue payload.
 */
export function formatGitHubIssue(
  idea: IdeaExportPayload,
  options: GitHubIssueExportOptions
): GitHubIssuePayload {
  const parsedOptions = GitHubIssueExportOptionsSchema.parse(options);
  const labels = Array.from(
    new Set([
      "innovator",
      ...(idea.sourceAngle ? [idea.sourceAngle] : []),
      ...(idea.labels ?? []),
      ...(parsedOptions.labels ?? []),
    ].filter(Boolean).map((label) => label.trim()))
  ).slice(0, 10);

  const payload: GitHubIssuePayload = {
    title: `💡 ${idea.title}`.slice(0, 500),
    body: [
      idea.description,
      "",
      "## Potential Impact",
      idea.potentialImpact,
      ...(idea.implementationHint
        ? ["", "## Implementation", idea.implementationHint]
        : []),
      ...(idea.sourceAngle ? ["", `**Source Angle:** ${idea.sourceAngle}`] : []),
      ...(idea.priority ? [`**Priority:** ${idea.priority}`] : []),
      "",
      "---",
      "_Created by Innovator AI_",
    ].join("\n"),
    labels,
    assignees: (parsedOptions.assignees ?? []).slice(0, 10),
    ...(parsedOptions.milestone !== undefined ? { milestone: parsedOptions.milestone } : {}),
  };

  return GitHubIssuePayloadSchema.parse(payload);
}

/**
 * Export an idea to GitHub Issues (requires configured GitHub integration).
 */
export async function exportToGitHub(
  idea: IdeaExportPayload,
  options: GitHubIssueExportOptions,
  integrationId?: string
): Promise<ExportResult> {
  const integration = await resolveGitHubIntegration(integrationId);

  if (!integration?.apiToken) {
    return { success: false, error: "GitHub integration not configured", integration: "github" };
  }

  const payload = formatGitHubIssue(idea, options);
  const apiUrl = normalizeGitHubApiUrl(integration.apiUrl);

  try {
    const res = await fetch(`${apiUrl}/repos/${options.owner}/${options.repo}/issues`, {
      method: "POST",
      headers: gitHubHeaders(integration.apiToken),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `GitHub API error: ${err}`, integration: "github" };
    }

    const data = (await res.json()) as GitHubIssueApiResponse;

    if (options.projectId && data.node_id) {
      const projectResult = await addIssueToProject({
        apiUrl,
        apiToken: integration.apiToken,
        issueNodeId: data.node_id,
        projectId: options.projectId,
      });
      if (!projectResult.success) return projectResult;
    }

    return {
      success: true,
      externalId: String(data.number),
      externalUrl: data.html_url,
      integration: "github",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "GitHub export failed",
      integration: "github",
    };
  }
}

/**
 * Import GitHub issues and normalize them into innovation subjects.
 */
export async function importGitHubIssues(
  owner: string,
  repo: string,
  options?: GitHubIssueImportOptions
): Promise<GitHubImportedIssueSubject[]> {
  const parsedOptions = GitHubIssueImportOptionsSchema.parse(options ?? {});
  const integration = await resolveGitHubIntegration(parsedOptions.integrationId);
  if (!integration?.apiToken) return [];

  const apiUrl = normalizeGitHubApiUrl(integration.apiUrl);
  const query = new URLSearchParams({
    state: parsedOptions.state ?? "open",
    per_page: String(parsedOptions.perPage ?? 30),
    page: String(parsedOptions.page ?? 1),
  });

  if (parsedOptions.labels?.length) query.set("labels", parsedOptions.labels.join(","));
  if (parsedOptions.assignee) query.set("assignee", parsedOptions.assignee);
  if (parsedOptions.milestone !== undefined) query.set("milestone", String(parsedOptions.milestone));
  if (parsedOptions.since) query.set("since", parsedOptions.since);

  try {
    const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues?${query.toString()}`, {
      headers: gitHubHeaders(integration.apiToken),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as GitHubIssueApiResponse[];
    return data
      .filter((issue) => !issue.pull_request)
      .map((issue) =>
        GitHubImportedIssueSubjectSchema.parse({
          id: String(issue.number),
          title: issue.title.slice(0, 500),
          description: truncate(issue.body?.trim() || "Imported from GitHub Issues.", 5000),
          status: normalizeOptionalText(issue.state, "open", 100),
          labels: normalizeLabels(issue.labels).slice(0, 20),
          assignee: normalizeOptionalText(issue.assignee?.login, undefined, 200),
          url: issue.html_url,
          source: "github",
          rationale: truncate(
            `Imported from ${owner}/${repo} issue #${issue.number} for innovation analysis.`,
            1000
          ),
        })
      );
  } catch {
    return [];
  }
}

export class GitHubIssuesIntegration {
  /** Create a GitHub issue from an innovation idea. */
  async createIssue(idea: IdeaExportPayload, config: GitHubIssuesConfig): Promise<ExportResult> {
    const payload = this.buildIssuePayload(idea, config);
    const apiUrl = normalizeGitHubApiUrl(config.apiUrl);

    try {
      const res = await fetch(`${apiUrl}/repos/${config.owner}/${config.repo}/issues`, {
        method: "POST",
        headers: gitHubHeaders(config.apiToken),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `GitHub API error: ${err}`, integration: "github" };
      }

      const data = (await res.json()) as GitHubIssueApiResponse;
      if (config.projectId && data.node_id) {
        const projectResult = await addIssueToProject({
          apiUrl,
          apiToken: config.apiToken,
          issueNodeId: data.node_id,
          projectId: config.projectId,
        });
        if (!projectResult.success) return projectResult;
      }

      return {
        success: true,
        externalId: String(data.number),
        externalUrl: data.html_url,
        integration: "github",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "GitHub issue creation failed",
        integration: "github",
      };
    }
  }

  /** Create multiple GitHub issues in batch. */
  async createBulkIssues(
    ideas: IdeaExportPayload[],
    config: GitHubIssuesConfig
  ): Promise<ExportResult[]> {
    return Promise.all(ideas.map((idea) => this.createIssue(idea, config)));
  }

  /** Import GitHub issues as innovation subjects. */
  async importIssues(
    owner: string,
    repo: string,
    config: Pick<GitHubIssuesConfig, "apiToken" | "apiUrl">,
    options?: Omit<GitHubIssueImportOptions, "integrationId">
  ): Promise<GitHubImportedIssueSubject[]> {
    const apiUrl = normalizeGitHubApiUrl(config.apiUrl);
    const parsedOptions = GitHubIssueImportOptionsSchema.parse(options ?? {});
    const query = new URLSearchParams({
      state: parsedOptions.state ?? "open",
      per_page: String(parsedOptions.perPage ?? 30),
      page: String(parsedOptions.page ?? 1),
    });

    if (parsedOptions.labels?.length) query.set("labels", parsedOptions.labels.join(","));
    if (parsedOptions.assignee) query.set("assignee", parsedOptions.assignee);
    if (parsedOptions.milestone !== undefined) query.set("milestone", String(parsedOptions.milestone));
    if (parsedOptions.since) query.set("since", parsedOptions.since);

    try {
      const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues?${query.toString()}`, {
        headers: gitHubHeaders(config.apiToken),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as GitHubIssueApiResponse[];
      return data
        .filter((issue) => !issue.pull_request)
        .map((issue) =>
          GitHubImportedIssueSubjectSchema.parse({
            id: String(issue.number),
            title: issue.title.slice(0, 500),
            description: truncate(issue.body?.trim() || "Imported from GitHub Issues.", 5000),
            status: normalizeOptionalText(issue.state, "open", 100),
            labels: normalizeLabels(issue.labels).slice(0, 20),
            assignee: normalizeOptionalText(issue.assignee?.login, undefined, 200),
            url: issue.html_url,
            source: "github",
            rationale: truncate(
              `Imported from ${owner}/${repo} issue #${issue.number} for innovation analysis.`,
              1000
            ),
          })
        );
    } catch {
      return [];
    }
  }

  /** Build a GitHub issue API payload. */
  buildIssuePayload(
    idea: IdeaExportPayload,
    config: GitHubIssueExportOptions
  ): GitHubIssuePayload {
    return formatGitHubIssue(idea, config);
  }
}

async function resolveGitHubIntegration(integrationId?: string): Promise<{
  apiToken?: string;
  apiUrl?: string;
} | undefined> {
  const { getIntegration, listIntegrations } = await import("./index.js");
  if (integrationId) {
    const integration = getIntegration(integrationId);
    return integration?.type === "github" ? integration : undefined;
  }
  return listIntegrations().find((integration) => integration.type === "github");
}

function normalizeGitHubApiUrl(apiUrl?: string): string {
  return (apiUrl || "https://api.github.com").replace(/\/$/, "");
}

function gitHubHeaders(apiToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${apiToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function graphQlUrl(apiUrl: string): string {
  if (apiUrl.endsWith("/api/v3")) return apiUrl.replace(/\/api\/v3$/, "/api/graphql");
  return `${apiUrl}/graphql`;
}

async function addIssueToProject(input: {
  apiUrl: string;
  apiToken: string;
  issueNodeId: string;
  projectId: string;
}): Promise<ExportResult> {
  try {
    const res = await fetch(graphQlUrl(input.apiUrl), {
      method: "POST",
      headers: gitHubHeaders(input.apiToken),
      body: JSON.stringify({
        query: `mutation AddProjectV2Item($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }`,
        variables: { projectId: input.projectId, contentId: input.issueNodeId },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `GitHub project API error: ${err}`, integration: "github" };
    }

    const data = (await res.json()) as {
      errors?: Array<{ message?: string }>;
      data?: { addProjectV2ItemById?: { item?: { id: string } } };
    };

    if (data.errors?.length) {
      return {
        success: false,
        error: `GitHub project API error: ${data.errors.map((error) => error.message ?? "unknown").join(", ")}`,
        integration: "github",
      };
    }

    return { success: true, integration: "github" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "GitHub project update failed",
      integration: "github",
    };
  }
}

function normalizeLabels(labels: GitHubIssueApiResponse["labels"]): string[] {
  return (labels ?? [])
    .map((label) => (typeof label === "string" ? label : label.name ?? ""))
    .map((label) => label.trim())
    .filter(Boolean);
}

function normalizeOptionalText(
  value: string | null | undefined,
  fallback?: string,
  maxLength = 200
): string | undefined {
  const normalized = value?.trim() || fallback;
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
