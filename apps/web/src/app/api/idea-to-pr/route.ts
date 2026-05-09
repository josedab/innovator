export const runtime = "nodejs";

import {
  selectTopIdea,
  buildPRWorkflow,
  innovationToPR,
  workflowToScript,
  generateText,
  extractJson,
  withRetry,
} from "@innovator/core";
import type { Synthesis, InnovationIdea, PRConfig } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const MAX_SUBJECT_LENGTH = 500;

const RequestSchema = z.object({
  synthesis: z.object({
    topIdeas: z.array(z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
      potentialImpact: z.string().max(2000),
      sourceAngle: z.string().max(200).optional(),
      feasibility: z.string().max(50).optional(),
      implementationHint: z.string().max(2000).optional(),
    })).min(1).max(50),
    themes: z.array(z.string().max(500)).max(20),
    recommendation: z.string().max(5000),
    connections: z.array(z.unknown()).optional(),
  }),
  config: z.object({
    owner: z.string().min(1).max(200),
    repo: z.string().min(1).max(200),
    baseBranch: z.string().max(200).default("main"),
    branchPrefix: z.string().max(100).default("innovation/"),
    reviewers: z.array(z.string().max(200)).max(20).optional(),
    labels: z.array(z.string().max(100)).max(20).default(["innovation", "auto-generated"]),
    draft: z.boolean().default(true),
    stack: z.enum(["typescript", "python", "go", "rust"]).default("typescript"),
    license: z.enum(["MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "ISC"]).default("MIT"),
  }),
  ideaIndex: z.number().int().min(0).max(49).optional(),
  generatePlan: z.boolean().default(true),
  model: z.string().optional(),
});

const ImplementationPlanSchema = z.object({
  overview: z.string().max(3000),
  phases: z.array(z.object({
    name: z.string().max(200),
    description: z.string().max(1000),
    tasks: z.array(z.string().max(500)).max(20),
    deliverables: z.array(z.string().max(500)).max(10),
  })).max(10),
  risks: z.array(z.object({
    risk: z.string().max(500),
    mitigation: z.string().max(500),
  })).max(10),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;

async function generateImplementationPlan(
  idea: InnovationIdea,
  model?: string,
  signal?: AbortSignal
): Promise<ImplementationPlan> {
  const prompt = `You are a senior software architect creating an implementation plan for an innovation idea.

IDEA: ${idea.title}
DESCRIPTION: ${idea.description}
IMPACT: ${idea.potentialImpact}
${idea.implementationHint ? `HINT: ${idea.implementationHint}` : ""}

Create a detailed implementation plan with phased delivery.

Respond with JSON only:
{
  "overview": "High-level approach summary",
  "phases": [
    {
      "name": "Phase name",
      "description": "What this phase accomplishes",
      "tasks": ["Specific task 1", "Specific task 2"],
      "deliverables": ["What is produced"]
    }
  ],
  "risks": [
    { "risk": "Potential risk", "mitigation": "How to mitigate" }
  ],
  "estimatedComplexity": "low" | "medium" | "high"
}`;

  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      const jsonStr = extractJson(raw);
      return ImplementationPlanSchema.parse(JSON.parse(jsonStr));
    },
    {
      signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

/**
 * End-to-end idea-to-PR pipeline: select idea → generate implementation plan →
 * create scaffold → build PR workflow plan with gh CLI commands.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid request", {
        route: "/api/idea-to-pr",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { synthesis, config, ideaIndex, generatePlan, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    // Phase 1: Select idea
    let idea: InnovationIdea | undefined;
    if (ideaIndex !== undefined && ideaIndex < synthesis.topIdeas.length) {
      const selected = synthesis.topIdeas[ideaIndex];
      idea = {
        title: selected.title,
        description: selected.description,
        potentialImpact: selected.potentialImpact,
        implementationHint: selected.implementationHint ?? "",
      };
    } else {
      idea = selectTopIdea(synthesis as Synthesis);
    }

    if (!idea) {
      return new Response(
        JSON.stringify({ error: "No ideas found in synthesis to create PR from." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    logger.info("Idea-to-PR started", {
      route: "/api/idea-to-pr",
      requestId,
      ideaTitle: idea.title,
      generatePlan,
    });

    // Phase 2: Generate implementation plan (optional, LLM-powered)
    let implementationPlan: ImplementationPlan | undefined;
    if (generatePlan) {
      try {
        implementationPlan = await generateImplementationPlan(idea, model, request.signal);
      } catch (err) {
        logger.warn("Implementation plan generation failed, continuing without", {
          route: "/api/idea-to-pr",
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Phase 3: Build PR workflow (scaffold + commands)
    const prResult = innovationToPR(synthesis as Synthesis, config as PRConfig);

    // Generate executable script
    const script = prResult.status !== "failed" ? workflowToScript(prResult.workflowPlan) : undefined;

    logger.info("Idea-to-PR completed", {
      route: "/api/idea-to-pr",
      requestId,
      status: prResult.status,
      filesCreated: prResult.filesCreated,
      durationMs: Date.now() - startTime,
    });

    return Response.json(
      {
        ...prResult,
        implementationPlan,
        script,
      },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Request cancelled" }), {
        status: 499,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.error("Idea-to-PR error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/idea-to-pr",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "PR pipeline failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
