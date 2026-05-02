/**
 * @module artifacts
 *
 * Idea-to-action pipeline: converts innovation ideas into structured
 * artifacts like PRDs, user stories, technical specs, pitch outlines, and OKRs.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { generateTextStream } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Types ----

export const ARTIFACT_TYPES = [
  "prd",
  "user-story",
  "tech-spec",
  "pitch-outline",
  "okr",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ArtifactSchema = z.object({
  type: z.enum(ARTIFACT_TYPES),
  title: z.string().max(500),
  content: z.string().max(50_000),
  sections: z
    .array(
      z.object({
        heading: z.string().max(200),
        body: z.string().max(10_000),
      })
    )
    .max(30),
  metadata: z
    .object({
      ideaTitle: z.string().max(500),
      generatedAt: z.string(),
      model: z.string().optional(),
    })
    .optional(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

/** Context for artifact generation. */
export interface ArtifactContext {
  subject: string;
  investigation?: Investigation;
  relatedIdeas?: InnovationIdea[];
}

// ---- Prompt Templates ----

const ARTIFACT_PROMPTS: Record<ArtifactType, (idea: InnovationIdea, ctx: ArtifactContext) => string> = {
  prd: (idea, ctx) => `You are a senior product manager. Create a comprehensive Product Requirements Document (PRD) for the following innovation idea.

${wrapUserInput("SUBJECT", ctx.subject)}
${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL IMPACT", idea.potentialImpact)}
${wrapUserInput("IMPLEMENTATION HINT", idea.implementationHint)}
${ctx.investigation ? `\nCONTEXT: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Create a PRD with these sections:
1. Overview & Problem Statement
2. Goals & Success Metrics
3. User Personas
4. Requirements (functional & non-functional)
5. User Stories & Acceptance Criteria
6. Technical Considerations
7. Risks & Mitigations
8. Timeline & Milestones
9. Open Questions

${jsonResponseInstruction("prd")}`,

  "user-story": (idea, ctx) => `You are an agile coach. Create a set of user stories for the following innovation idea.

${wrapUserInput("SUBJECT", ctx.subject)}
${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${ctx.investigation ? `\nCONTEXT: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Create user stories with these sections:
1. Epic Overview
2. User Stories (each with: As a [persona], I want [feature], So that [benefit])
3. Acceptance Criteria for each story
4. Story Map / Dependencies
5. Definition of Done
6. Estimation Notes

${jsonResponseInstruction("user-story")}`,

  "tech-spec": (idea, ctx) => `You are a senior engineer. Create a technical specification for implementing the following innovation idea.

${wrapUserInput("SUBJECT", ctx.subject)}
${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("IMPLEMENTATION HINT", idea.implementationHint)}
${ctx.investigation ? `\nCONTEXT: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Create a tech spec with these sections:
1. Overview & Goals
2. System Architecture
3. Data Model
4. API Design
5. Implementation Plan (phases)
6. Testing Strategy
7. Deployment & Monitoring
8. Security Considerations
9. Performance Requirements
10. Trade-offs & Alternatives

${jsonResponseInstruction("tech-spec")}`,

  "pitch-outline": (idea, ctx) => `You are a startup pitch coach. Create a compelling pitch outline for the following innovation idea.

${wrapUserInput("SUBJECT", ctx.subject)}
${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL IMPACT", idea.potentialImpact)}
${ctx.investigation ? `\nCONTEXT: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Create a pitch outline with these sections:
1. Hook / Opening Statement
2. Problem Statement
3. Solution Overview
4. Market Opportunity
5. Unique Value Proposition
6. Business Model
7. Traction / Validation
8. Team Requirements
9. Ask / Call to Action
10. Key Talking Points

${jsonResponseInstruction("pitch-outline")}`,

  okr: (idea, ctx) => `You are a strategic planning expert. Create OKRs (Objectives and Key Results) for implementing the following innovation idea.

${wrapUserInput("SUBJECT", ctx.subject)}
${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL IMPACT", idea.potentialImpact)}
${ctx.investigation ? `\nCONTEXT: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Create OKRs with these sections:
1. Mission Statement
2. Objective 1 (with 3-4 Key Results)
3. Objective 2 (with 3-4 Key Results)
4. Objective 3 (with 3-4 Key Results)
5. Alignment & Dependencies
6. Success Metrics
7. Review Cadence

${jsonResponseInstruction("okr")}`,
};

function jsonResponseInstruction(type: string): string {
  return `You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "type": "${type}",
  "title": "Title of the artifact",
  "content": "Full formatted text content (use \\n for newlines)",
  "sections": [
    { "heading": "Section Heading", "body": "Section content" }
  ]
}`;
}

// ---- Core Functions ----

/**
 * Generate a structured artifact from an innovation idea.
 *
 * @param idea - The innovation idea to convert
 * @param artifactType - The type of artifact to generate
 * @param context - Additional context (subject, investigation, related ideas)
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Generated artifact with structured sections
 */
export async function generateArtifact(
  idea: InnovationIdea,
  artifactType: ArtifactType,
  context: ArtifactContext,
  model?: string,
  signal?: AbortSignal
): Promise<Artifact> {
  const buildPrompt = ARTIFACT_PROMPTS[artifactType];
  if (!buildPrompt) {
    throw new Error(`Unknown artifact type: ${artifactType}`);
  }

  const prompt = buildPrompt(idea, context);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse artifact response as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const artifact = ArtifactSchema.parse(parsed);
  artifact.metadata = {
    ideaTitle: idea.title,
    generatedAt: new Date().toISOString(),
    model,
  };

  return artifact;
}

/**
 * Generate an artifact with streaming output.
 */
export async function generateArtifactStream(
  idea: InnovationIdea,
  artifactType: ArtifactType,
  context: ArtifactContext,
  onChunk: (chunk: string) => void,
  model?: string,
  signal?: AbortSignal
): Promise<Artifact> {
  const buildPrompt = ARTIFACT_PROMPTS[artifactType];
  if (!buildPrompt) {
    throw new Error(`Unknown artifact type: ${artifactType}`);
  }

  const prompt = buildPrompt(idea, context);

  const raw = await generateTextStream(
    { prompt, model, serverMode: true, signal },
    onChunk
  );

  const jsonStr = extractJson(raw);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse artifact response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  const artifact = ArtifactSchema.parse(parsedJson);
  artifact.metadata = {
    ideaTitle: idea.title,
    generatedAt: new Date().toISOString(),
    model,
  };

  return artifact;
}

/**
 * Export an artifact to Markdown format.
 */
export function artifactToMarkdown(artifact: Artifact): string {
  const lines: string[] = [];
  lines.push(`# ${artifact.title}`);
  lines.push("");
  lines.push(`*Type: ${artifact.type} | Generated: ${artifact.metadata?.generatedAt ?? "unknown"}*`);
  lines.push("");

  for (const section of artifact.sections) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    lines.push(section.body);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export an artifact as a GitHub Issue.
 */
export function artifactToGitHubIssue(artifact: Artifact): {
  title: string;
  body: string;
  labels: string[];
} {
  const labelMap: Record<ArtifactType, string[]> = {
    prd: ["prd", "product"],
    "user-story": ["user-story", "feature"],
    "tech-spec": ["tech-spec", "engineering"],
    "pitch-outline": ["pitch", "business"],
    okr: ["okr", "strategy"],
  };

  return {
    title: `📋 ${artifact.title}`,
    body: artifactToMarkdown(artifact),
    labels: labelMap[artifact.type] ?? [],
  };
}

/** Get a human-readable label for an artifact type. */
export function getArtifactTypeLabel(type: ArtifactType): string {
  const labels: Record<ArtifactType, string> = {
    prd: "Product Requirements Document",
    "user-story": "User Stories",
    "tech-spec": "Technical Specification",
    "pitch-outline": "Pitch Outline",
    okr: "OKRs (Objectives & Key Results)",
  };
  return labels[type] ?? type;
}
