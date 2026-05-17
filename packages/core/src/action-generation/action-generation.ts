/**
 * @module action-generation
 *
 * Structured Output & Action Generation — transforms innovation results
 * into actionable artifacts: PRDs, user stories, OKRs, pitch decks, ADRs,
 * GitHub issues, and Jira tickets.
 */

import { z } from "zod";
import {
  PRDSchema,
  UserStorySetSchema,
  OKRSetSchema,
  PitchDeckSchema,
  ADRSchema,
  GitHubIssueSchema,
  JiraTicketSchema,
  type PRD,
  type UserStorySet,
  type OKRSet,
  type PitchDeck,
  type ADR,
  type GitHubIssue,
  type JiraTicket,
  type ActionContext,
  type ActionFormat,
} from "./types.js";

// ---- Prompt Templates ----

function buildPRDPrompt(ctx: ActionContext): string {
  return `You are a product manager. Generate a Product Requirements Document (PRD) as JSON.

Subject: ${ctx.subject}
Idea: ${ctx.ideaTitle}
Description: ${ctx.ideaDescription}
${ctx.potentialImpact ? `Impact: ${ctx.potentialImpact}` : ""}
${ctx.implementationHint ? `Implementation hint: ${ctx.implementationHint}` : ""}
${ctx.additionalContext ? `Additional context: ${ctx.additionalContext}` : ""}

Return a JSON object with these fields:
- title (string)
- summary (string)
- problemStatement (string)
- proposedSolution (string)
- goals (string[])
- nonGoals (string[])
- userPersonas (array of {name, description, needs[]})
- requirements (array of {id, priority: "must-have"|"should-have"|"nice-to-have", description, acceptanceCriteria[]})
- successMetrics (array of {metric, target, measurement})
- timeline (string, optional)
- risks (array of {risk, mitigation, severity: "low"|"medium"|"high"})

Return ONLY valid JSON.`;
}

function buildUserStoriesPrompt(ctx: ActionContext): string {
  return `You are an agile coach. Generate user stories as JSON.

Subject: ${ctx.subject}
Idea: ${ctx.ideaTitle}
Description: ${ctx.ideaDescription}
${ctx.potentialImpact ? `Impact: ${ctx.potentialImpact}` : ""}

Return a JSON object with:
- epicTitle (string)
- epicDescription (string)
- stories (array of {id, title, asA, iWant, soThat, acceptanceCriteria[], priority: "critical"|"high"|"medium"|"low", storyPoints?: number, tags?: string[]})

Return ONLY valid JSON.`;
}

function buildOKRsPrompt(ctx: ActionContext): string {
  return `You are a strategy consultant. Generate OKRs as JSON.

Subject: ${ctx.subject}
Idea: ${ctx.ideaTitle}
Description: ${ctx.ideaDescription}
${ctx.potentialImpact ? `Impact: ${ctx.potentialImpact}` : ""}

Return a JSON object with:
- timeframe (string, e.g. "Q1 2025")
- objectives (array of {id, title, description, keyResults: [{id, description, metric, currentValue, targetValue, confidence (0-1)}]})

Return ONLY valid JSON.`;
}

function buildPitchDeckPrompt(ctx: ActionContext, audience: string): string {
  return `You are a pitch deck expert. Generate a pitch deck as JSON for a ${audience} audience.

Subject: ${ctx.subject}
Idea: ${ctx.ideaTitle}
Description: ${ctx.ideaDescription}
${ctx.potentialImpact ? `Impact: ${ctx.potentialImpact}` : ""}

Return a JSON object with:
- title (string)
- subtitle (string, optional)
- audienceType ("investors"|"executives"|"technical"|"general")
- slides (array of {slideNumber, title, content, speakerNotes?, layout: "title"|"content"|"two-column"|"chart"|"quote"|"closing"})
- estimatedDurationMinutes (number)

Return ONLY valid JSON.`;
}

function buildADRPrompt(ctx: ActionContext): string {
  return `You are a software architect. Generate an Architecture Decision Record (ADR) as JSON.

Subject: ${ctx.subject}
Idea: ${ctx.ideaTitle}
Description: ${ctx.ideaDescription}
${ctx.implementationHint ? `Implementation hint: ${ctx.implementationHint}` : ""}

Return a JSON object with:
- id (string like "ADR-001")
- title (string)
- status ("proposed")
- context (string)
- decision (string)
- consequences (array of {type: "positive"|"negative"|"neutral", description})
- alternatives (array of {title, description, reason})
- date (ISO date string)

Return ONLY valid JSON.`;
}

// ---- Format Converters ----

/** Convert a PRD to Markdown format. */
export function prdToMarkdown(prd: PRD): string {
  const lines: string[] = [
    `# ${prd.title}`,
    "",
    `## Summary`,
    prd.summary,
    "",
    `## Problem Statement`,
    prd.problemStatement,
    "",
    `## Proposed Solution`,
    prd.proposedSolution,
    "",
    `## Goals`,
    ...prd.goals.map((g) => `- ${g}`),
    "",
    `## Non-Goals`,
    ...prd.nonGoals.map((g) => `- ${g}`),
    "",
    `## User Personas`,
  ];

  for (const persona of prd.userPersonas) {
    lines.push(`### ${persona.name}`, persona.description, "Needs:");
    for (const need of persona.needs) lines.push(`- ${need}`);
    lines.push("");
  }

  lines.push("## Requirements", "");
  for (const req of prd.requirements) {
    lines.push(`### ${req.id}: ${req.description} [${req.priority}]`);
    lines.push("Acceptance Criteria:");
    for (const ac of req.acceptanceCriteria) lines.push(`- [ ] ${ac}`);
    lines.push("");
  }

  lines.push("## Success Metrics", "");
  lines.push("| Metric | Target | Measurement |", "|--------|--------|-------------|");
  for (const m of prd.successMetrics) {
    lines.push(`| ${m.metric} | ${m.target} | ${m.measurement} |`);
  }

  if (prd.timeline) {
    lines.push("", "## Timeline", prd.timeline);
  }

  if (prd.risks.length > 0) {
    lines.push("", "## Risks", "");
    for (const r of prd.risks) {
      lines.push(`- **${r.risk}** (${r.severity}): ${r.mitigation}`);
    }
  }

  return lines.join("\n");
}

/** Convert user stories to Markdown format. */
export function userStoriesToMarkdown(set: UserStorySet): string {
  const lines: string[] = [
    `# Epic: ${set.epicTitle}`,
    "",
    set.epicDescription,
    "",
    "## Stories",
    "",
  ];

  for (const story of set.stories) {
    lines.push(
      `### ${story.id}: ${story.title} [${story.priority}]${story.storyPoints ? ` (${story.storyPoints} pts)` : ""}`,
      "",
      `**As a** ${story.asA}, **I want** ${story.iWant}, **so that** ${story.soThat}.`,
      "",
      "Acceptance Criteria:"
    );
    for (const ac of story.acceptanceCriteria) lines.push(`- [ ] ${ac}`);
    if (story.tags?.length) lines.push("", `Tags: ${story.tags.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

/** Convert OKRs to Markdown format. */
export function okrsToMarkdown(okrs: OKRSet): string {
  const lines: string[] = [`# OKRs — ${okrs.timeframe}`, ""];

  for (const obj of okrs.objectives) {
    lines.push(`## ${obj.id}: ${obj.title}`, "", obj.description, "", "Key Results:", "");
    for (const kr of obj.keyResults) {
      lines.push(
        `- **${kr.description}**: ${kr.currentValue} → ${kr.targetValue} (${kr.metric}, confidence: ${Math.round(kr.confidence * 100)}%)`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Convert a pitch deck to Markdown format. */
export function pitchDeckToMarkdown(deck: PitchDeck): string {
  const lines: string[] = [
    `# ${deck.title}`,
    deck.subtitle ? `*${deck.subtitle}*` : "",
    "",
    `Audience: ${deck.audienceType} | Duration: ~${deck.estimatedDurationMinutes} min`,
    "",
    "---",
    "",
  ];

  for (const slide of deck.slides) {
    lines.push(`## Slide ${slide.slideNumber}: ${slide.title}`, "");
    lines.push(slide.content, "");
    if (slide.speakerNotes) {
      lines.push(`> 🗣️ ${slide.speakerNotes}`, "");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

/** Convert an ADR to Markdown format. */
export function adrToMarkdown(adr: ADR): string {
  const lines: string[] = [
    `# ${adr.id}: ${adr.title}`,
    "",
    `- **Status**: ${adr.status}`,
    `- **Date**: ${adr.date}`,
    "",
    "## Context",
    adr.context,
    "",
    "## Decision",
    adr.decision,
    "",
    "## Consequences",
    "",
  ];

  for (const c of adr.consequences) {
    const icon = c.type === "positive" ? "✅" : c.type === "negative" ? "❌" : "➖";
    lines.push(`- ${icon} ${c.description}`);
  }

  if (adr.alternatives.length > 0) {
    lines.push("", "## Alternatives Considered", "");
    for (const alt of adr.alternatives) {
      lines.push(`### ${alt.title}`, alt.description, `*Reason not chosen: ${alt.reason}*`, "");
    }
  }

  return lines.join("\n");
}

/** Convert an idea context to a GitHub Issue. */
export function contextToGitHubIssue(ctx: ActionContext): GitHubIssue {
  const body = [
    `## 💡 ${ctx.ideaTitle}`,
    "",
    ctx.ideaDescription,
    "",
    ctx.potentialImpact ? `### Expected Impact\n${ctx.potentialImpact}\n` : "",
    ctx.implementationHint ? `### Implementation Hints\n${ctx.implementationHint}\n` : "",
    ctx.sourceAngle
      ? `### Source\nGenerated via **${ctx.sourceAngle}** angle on: *${ctx.subject}*`
      : "",
    "",
    "---",
    "*Generated by [Innovator](https://github.com/josedab/innovator)*",
  ]
    .filter(Boolean)
    .join("\n");

  return GitHubIssueSchema.parse({
    title: ctx.ideaTitle,
    body,
    labels: ["innovation", ctx.sourceAngle ? `angle:${ctx.sourceAngle}` : "idea"].filter(Boolean),
  });
}

/** Convert an idea context to a Jira ticket. */
export function contextToJiraTicket(
  ctx: ActionContext,
  opts?: {
    issueType?: "Story" | "Task" | "Bug" | "Epic";
    priority?: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  }
): JiraTicket {
  const description = [
    `h2. ${ctx.ideaTitle}`,
    "",
    ctx.ideaDescription,
    "",
    ctx.potentialImpact ? `h3. Expected Impact\n${ctx.potentialImpact}\n` : "",
    ctx.implementationHint ? `h3. Implementation Hints\n${ctx.implementationHint}\n` : "",
    ctx.sourceAngle
      ? `h3. Source\nGenerated via *${ctx.sourceAngle}* angle on: _${ctx.subject}_`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return JiraTicketSchema.parse({
    summary: ctx.ideaTitle,
    description,
    issueType: opts?.issueType ?? "Story",
    priority: opts?.priority ?? "Medium",
    labels: ["innovation"],
  });
}

// ---- GitHub Issues API Integration ----

/** Options for creating a GitHub issue via the API. */
export interface CreateGitHubIssueOptions {
  owner: string;
  repo: string;
  token: string;
  issue: GitHubIssue;
}

/** Result of creating a GitHub issue. */
export interface CreateGitHubIssueResult {
  id: number;
  number: number;
  url: string;
  title: string;
}

/** Create a GitHub issue via the GitHub REST API. */
export async function createGitHubIssue(
  opts: CreateGitHubIssueOptions,
  signal?: AbortSignal
): Promise<CreateGitHubIssueResult> {
  const { owner, repo, token, issue } = opts;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
      milestone: issue.milestone ? Number(issue.milestone) : undefined,
      assignees: issue.assignees,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    id: number;
    number: number;
    html_url: string;
    title: string;
  };
  return {
    id: data.id,
    number: data.number,
    url: data.html_url,
    title: data.title,
  };
}

// ---- Batch Generation (non-LLM, template-based) ----

/** Generate all supported action outputs from a synthesis result. */
export function generateAllFormats(ctx: ActionContext): {
  githubIssue: GitHubIssue;
  jiraTicket: JiraTicket;
} {
  return {
    githubIssue: contextToGitHubIssue(ctx),
    jiraTicket: contextToJiraTicket(ctx),
  };
}

/** Get the prompt template for an LLM-based action format. */
export function getPromptForFormat(
  format: ActionFormat,
  ctx: ActionContext,
  opts?: { audience?: string }
): string {
  switch (format) {
    case "prd":
      return buildPRDPrompt(ctx);
    case "user-stories":
      return buildUserStoriesPrompt(ctx);
    case "okrs":
      return buildOKRsPrompt(ctx);
    case "pitch-deck":
      return buildPitchDeckPrompt(ctx, opts?.audience ?? "general");
    case "adr":
      return buildADRPrompt(ctx);
    case "github-issue":
      return ""; // Template-based, no LLM needed
    case "jira-ticket":
      return ""; // Template-based, no LLM needed
  }
}

/** Get the Zod schema for validating an action format's output. */
export function getSchemaForFormat(format: ActionFormat): z.ZodType {
  switch (format) {
    case "prd":
      return PRDSchema;
    case "user-stories":
      return UserStorySetSchema;
    case "okrs":
      return OKRSetSchema;
    case "pitch-deck":
      return PitchDeckSchema;
    case "adr":
      return ADRSchema;
    case "github-issue":
      return GitHubIssueSchema;
    case "jira-ticket":
      return JiraTicketSchema;
  }
}

/** Convert any action output to Markdown. */
export function actionToMarkdown(format: ActionFormat, data: unknown): string {
  switch (format) {
    case "prd":
      return prdToMarkdown(PRDSchema.parse(data));
    case "user-stories":
      return userStoriesToMarkdown(UserStorySetSchema.parse(data));
    case "okrs":
      return okrsToMarkdown(OKRSetSchema.parse(data));
    case "pitch-deck":
      return pitchDeckToMarkdown(PitchDeckSchema.parse(data));
    case "adr":
      return adrToMarkdown(ADRSchema.parse(data));
    case "github-issue": {
      const issue = GitHubIssueSchema.parse(data);
      return `# ${issue.title}\n\n${issue.body}`;
    }
    case "jira-ticket": {
      const ticket = JiraTicketSchema.parse(data);
      return `# ${ticket.summary}\n\n${ticket.description}`;
    }
  }
}

/** List all available action formats with metadata. */
export function listActionFormats(): Array<{
  id: ActionFormat;
  name: string;
  requiresLLM: boolean;
  description: string;
}> {
  return [
    {
      id: "prd",
      name: "Product Requirements Document",
      requiresLLM: true,
      description: "Full PRD with personas, requirements, and success metrics",
    },
    {
      id: "user-stories",
      name: "User Stories",
      requiresLLM: true,
      description: "Agile user stories with acceptance criteria",
    },
    { id: "okrs", name: "OKRs", requiresLLM: true, description: "Objectives and Key Results" },
    {
      id: "pitch-deck",
      name: "Pitch Deck",
      requiresLLM: true,
      description: "Slide-by-slide presentation with speaker notes",
    },
    {
      id: "adr",
      name: "Architecture Decision Record",
      requiresLLM: true,
      description: "ADR documenting the technical decision",
    },
    {
      id: "github-issue",
      name: "GitHub Issue",
      requiresLLM: false,
      description: "Ready-to-create GitHub issue",
    },
    {
      id: "jira-ticket",
      name: "Jira Ticket",
      requiresLLM: false,
      description: "Ready-to-create Jira ticket",
    },
  ];
}
