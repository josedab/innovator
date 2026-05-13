export const runtime = "nodejs";

import {
  generateTraceableArtifact,
  generateProjectBoard,
  projectBoardToMarkdown,
  artifactToGitHubIssue,
} from "@innovator/core";
import type { InnovationIdea, Investigation } from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IdeaSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().max(2000).default(""),
  implementationHint: z.string().max(2000).default(""),
});

const TraceableArtifactSchema = z.object({
  action: z.literal("artifact"),
  idea: IdeaSchema,
  artifactType: z.enum(["prd", "user-story", "tech-spec", "pitch-outline", "okr"]),
  subject: z.string().min(1).max(5000),
  sessionId: z.string().min(1),
  ideaId: z.string().optional(),
  angleId: z.string().optional(),
  model: z.string().optional(),
});

const ProjectBoardSchema = z.object({
  action: z.literal("project_board"),
  subject: z.string().min(1).max(5000),
  ideas: z.array(IdeaSchema).min(1).max(100),
  sessionId: z.string().optional(),
  format: z.enum(["json", "markdown"]).default("json"),
});

const GitHubIssuesSchema = z.object({
  action: z.literal("github_issues"),
  subject: z.string().min(1).max(5000),
  ideas: z.array(IdeaSchema).min(1).max(50),
  sessionId: z.string().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  TraceableArtifactSchema,
  ProjectBoardSchema,
  GitHubIssuesSchema,
]);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;

  if (data.action === "artifact") {
    try {
      const artifact = await generateTraceableArtifact(
        data.idea as InnovationIdea,
        data.artifactType,
        {
          subject: data.subject,
          sessionId: data.sessionId,
          ideaId: data.ideaId,
          angleId: data.angleId,
        },
        data.model
      );
      const githubIssue = artifactToGitHubIssue(artifact);
      return Response.json({ artifact, githubIssue }, { headers: API_RESPONSE_HEADERS });
    } catch (err) {
      return Response.json(
        { error: "Failed to generate artifact", details: (err as Error).message },
        { status: 500, headers: API_RESPONSE_HEADERS }
      );
    }
  }

  if (data.action === "project_board") {
    const board = generateProjectBoard(
      data.subject,
      data.ideas as InnovationIdea[],
      { sessionId: data.sessionId }
    );

    if (data.format === "markdown") {
      return new Response(projectBoardToMarkdown(board), {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return Response.json({ board }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "github_issues") {
    const issues = (data.ideas as InnovationIdea[]).map((idea, index) => ({
      index,
      title: `💡 ${idea.title}`,
      body: [
        `## Description`,
        idea.description,
        ``,
        `## Potential Impact`,
        idea.potentialImpact,
        ``,
        `## Implementation Notes`,
        idea.implementationHint,
        ``,
        `---`,
        `*Subject: ${data.subject}*`,
        data.sessionId ? `*Session: ${data.sessionId}*` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      labels: ["innovation", "auto-generated"],
      acceptance_criteria: [
        "Implementation matches the described approach",
        "Impact metrics are measurable and tracked",
      ],
    }));

    return Response.json({ issues, count: issues.length }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
