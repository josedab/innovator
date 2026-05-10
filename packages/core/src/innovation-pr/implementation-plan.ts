/**
 * @module innovation-pr/implementation-plan
 *
 * Generates detailed file-level implementation plans from validated ideas.
 * Uses codebase context to produce step-by-step changes with rationale.
 * Includes feedback loop for PR review → idea refinement.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

export const ImplementationStepSchema = z.object({
  order: z.number().int().min(1),
  file: z.string().max(500),
  action: z.enum(["create", "modify", "delete", "rename"]),
  description: z.string().max(1000),
  rationale: z.string().max(500),
  dependencies: z.array(z.string().max(500)).max(10).default([]),
  estimatedComplexity: z.enum(["trivial", "simple", "moderate", "complex"]),
  codeSnippet: z.string().max(5000).optional(),
});

export type ImplementationStep = z.infer<typeof ImplementationStepSchema>;

export const ImplementationPlanSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  summary: z.string().max(2000),
  architecture: z.string().max(3000),
  steps: z.array(ImplementationStepSchema).min(1).max(50),
  testPlan: z
    .array(
      z.object({
        description: z.string().max(500),
        type: z.enum(["unit", "integration", "e2e"]),
        file: z.string().max(500),
      })
    )
    .max(20),
  risks: z
    .array(
      z.object({
        description: z.string().max(500),
        severity: z.enum(["low", "medium", "high"]),
        mitigation: z.string().max(500),
      })
    )
    .max(10),
  estimatedEffort: z.enum(["hours", "days", "weeks"]),
  createdAt: z.string(),
});

export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;

export const FeedbackItemSchema = z.object({
  type: z.enum(["comment", "change-request", "approval", "rejection"]),
  file: z.string().max(500).optional(),
  line: z.number().int().optional(),
  message: z.string().max(2000),
  author: z.string().max(200),
  createdAt: z.string(),
});

export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const RefinedIdeaSchema = z.object({
  originalTitle: z.string().max(500),
  refinedTitle: z.string().max(500),
  refinedDescription: z.string().max(5000),
  changesFromFeedback: z.array(z.string().max(500)),
  droppedAspects: z.array(z.string().max(500)),
  addedAspects: z.array(z.string().max(500)),
  confidenceScore: z.number().min(0).max(1),
});

export type RefinedIdea = z.infer<typeof RefinedIdeaSchema>;

// ---- Implementation Plan Generator ----

/**
 * Generate a detailed implementation plan from an idea and codebase context.
 */
export async function generateImplementationPlan(
  idea: InnovationIdea,
  codebaseContext?: string,
  model?: string,
  signal?: AbortSignal
): Promise<ImplementationPlan> {
  const contextSection = codebaseContext
    ? `\nCODEBASE CONTEXT:\n${sanitizeLlmOutput(codebaseContext.slice(0, 5000))}`
    : "";

  const prompt = `You are a senior software architect. Generate a detailed implementation plan for this innovation idea.

${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("IMPACT", idea.potentialImpact)}
${wrapUserInput("HINTS", idea.implementationHint)}
${contextSection}

Create a step-by-step implementation plan with file-level changes. For each step, specify:
- Which file to create/modify/delete
- What changes to make and why
- Dependencies on other steps
- Complexity estimate

Also include a test plan and risk assessment.

Return valid JSON only:
{
  "summary": "High-level plan summary",
  "architecture": "Architecture description with component relationships",
  "steps": [
    {
      "order": 1,
      "file": "src/feature/index.ts",
      "action": "create",
      "description": "What to do",
      "rationale": "Why this step is needed",
      "dependencies": [],
      "estimatedComplexity": "simple|moderate|complex",
      "codeSnippet": "// optional code snippet"
    }
  ],
  "testPlan": [
    { "description": "Test description", "type": "unit|integration|e2e", "file": "src/__tests__/..." }
  ],
  "risks": [
    { "description": "Risk description", "severity": "low|medium|high", "mitigation": "How to mitigate" }
  ],
  "estimatedEffort": "hours|days|weeks"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as Record<string, unknown>;
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  return ImplementationPlanSchema.parse({
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    ...parsed,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Process PR review feedback and refine the original idea.
 * Creates a feedback loop where review comments improve the idea.
 */
export async function refineIdeaFromFeedback(
  idea: InnovationIdea,
  feedback: FeedbackItem[],
  model?: string,
  signal?: AbortSignal
): Promise<RefinedIdea> {
  const feedbackSummary = feedback
    .map((f) => `[${f.type}] ${f.author}: ${f.message}${f.file ? ` (${f.file})` : ""}`)
    .join("\n");

  const prompt = `You are an innovation advisor. A PR was created from an innovation idea and received review feedback. Refine the original idea based on the feedback.

${wrapUserInput("ORIGINAL IDEA", `${idea.title}\n${idea.description}`)}

PR REVIEW FEEDBACK:
${sanitizeLlmOutput(feedbackSummary)}

Analyze the feedback and produce a refined version of the idea that:
1. Addresses valid criticisms
2. Incorporates suggested improvements
3. Drops aspects that reviewers found infeasible
4. Adds new aspects suggested by reviewers

Return valid JSON only:
{
  "originalTitle": "${idea.title}",
  "refinedTitle": "Updated title",
  "refinedDescription": "Updated description incorporating feedback",
  "changesFromFeedback": ["Change 1", "Change 2"],
  "droppedAspects": ["Dropped aspect"],
  "addedAspects": ["Added aspect"],
  "confidenceScore": 0.8
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as Record<string, unknown>;
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  return RefinedIdeaSchema.parse(parsed);
}

/**
 * Convert an implementation plan to GitHub Issues.
 */
export function planToGitHubIssues(
  plan: ImplementationPlan,
  config: { owner: string; repo: string; labels?: string[] }
): Array<{
  title: string;
  body: string;
  labels: string[];
  milestone?: string;
}> {
  const issues: Array<{
    title: string;
    body: string;
    labels: string[];
    milestone?: string;
  }> = [];

  // Main tracking issue
  issues.push({
    title: `💡 Implementation: ${plan.ideaTitle}`,
    body: [
      `## Summary\n${plan.summary}`,
      `## Architecture\n${plan.architecture}`,
      `## Steps`,
      ...plan.steps.map(
        (s) => `- [ ] ${s.order}. ${s.description} (\`${s.file}\`, ${s.estimatedComplexity})`
      ),
      `## Risks`,
      ...plan.risks.map((r) => `- **${r.severity}**: ${r.description} → ${r.mitigation}`),
      `\n*Estimated effort: ${plan.estimatedEffort}*`,
    ].join("\n"),
    labels: [...(config.labels ?? ["innovation"]), "tracking"],
  });

  // Individual step issues for complex steps
  for (const step of plan.steps.filter(
    (s) => s.estimatedComplexity === "complex" || s.estimatedComplexity === "moderate"
  )) {
    issues.push({
      title: `Step ${step.order}: ${step.description.slice(0, 80)}`,
      body: [
        `## File: \`${step.file}\``,
        `**Action:** ${step.action}`,
        `**Rationale:** ${step.rationale}`,
        step.dependencies.length > 0 ? `**Depends on:** ${step.dependencies.join(", ")}` : "",
        step.codeSnippet ? `\`\`\`\n${step.codeSnippet}\n\`\`\`` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      labels: [...(config.labels ?? ["innovation"]), step.estimatedComplexity],
    });
  }

  return issues;
}
