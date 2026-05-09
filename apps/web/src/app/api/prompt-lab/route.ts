export const runtime = "nodejs";

import {
  createExperiment,
  startExperiment,
  getExperiment,
  listExperiments,
  assignVariant,
  recordExperimentScore,
  analyzeExperiment,
  commitPromptVersion,
  activatePromptVersion,
  getActivePromptVersion,
  getPromptVersionHistory,
  rollbackPromptVersion,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateExperimentAction = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  angleId: z.string().min(1).max(100),
  variants: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(200),
        template: z.string().max(10000),
      })
    )
    .min(2)
    .max(10),
  allocation: z.enum(["random", "round-robin", "epsilon-greedy"]).default("random"),
  successMetric: z
    .enum(["idea-score", "user-rating", "export-rate", "selection-rate"])
    .default("idea-score"),
  minSampleSize: z.number().min(5).max(1000).default(30),
});

const StartAction = z.object({
  action: z.literal("start"),
  experimentId: z.string().min(1),
});

const GetAction = z.object({
  action: z.literal("get"),
  experimentId: z.string().min(1),
});

const ListAction = z.object({
  action: z.literal("list"),
  status: z.enum(["draft", "running", "completed", "promoted"]).optional(),
});

const AssignAction = z.object({
  action: z.literal("assign"),
  experimentId: z.string().min(1),
});

const RecordScoreAction = z.object({
  action: z.literal("record-score"),
  experimentId: z.string().min(1),
  variantId: z.string().min(1),
  score: z.number().min(0).max(100),
});

const AnalyzeAction = z.object({
  action: z.literal("analyze"),
  experimentId: z.string().min(1),
});

const CommitVersionAction = z.object({
  action: z.literal("commit-version"),
  angleId: z.string().min(1),
  template: z.string().min(1).max(10000),
  message: z.string().max(500).default(""),
  author: z.string().max(200).default("anonymous"),
});

const ActivateVersionAction = z.object({
  action: z.literal("activate-version"),
  angleId: z.string().min(1),
  version: z.number().min(1),
});

const VersionHistoryAction = z.object({
  action: z.literal("version-history"),
  angleId: z.string().min(1),
});

const RollbackAction = z.object({
  action: z.literal("rollback"),
  angleId: z.string().min(1),
  version: z.number().min(1),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateExperimentAction,
  StartAction,
  GetAction,
  ListAction,
  AssignAction,
  RecordScoreAction,
  AnalyzeAction,
  CommitVersionAction,
  ActivateVersionAction,
  VersionHistoryAction,
  RollbackAction,
]);

/** POST /api/prompt-lab — manage prompt experiments and versioning. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "create": {
        const { action: _, ...config } = parsed.data;
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const experiment = createExperiment({
          ...config,
          id,
          variants: config.variants.map((v) => ({ ...v, createdAt: now })),
        });
        return Response.json({ experiment }, { headers: API_RESPONSE_HEADERS });
      }
      case "start": {
        const experiment = startExperiment(parsed.data.experimentId);
        if (!experiment) {
          return new Response(JSON.stringify({ error: "Experiment not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ experiment }, { headers: API_RESPONSE_HEADERS });
      }
      case "get": {
        const experiment = getExperiment(parsed.data.experimentId);
        if (!experiment) {
          return new Response(JSON.stringify({ error: "Experiment not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ experiment }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const experiments = listExperiments(parsed.data.status);
        return Response.json({ experiments }, { headers: API_RESPONSE_HEADERS });
      }
      case "assign": {
        const variant = assignVariant(parsed.data.experimentId);
        if (!variant) {
          return new Response(JSON.stringify({ error: "Cannot assign variant" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ variant }, { headers: API_RESPONSE_HEADERS });
      }
      case "record-score": {
        recordExperimentScore(parsed.data.experimentId, parsed.data.variantId, parsed.data.score);
        return Response.json({ success: true }, { headers: API_RESPONSE_HEADERS });
      }
      case "analyze": {
        const analysis = analyzeExperiment(parsed.data.experimentId);
        return Response.json(analysis, { headers: API_RESPONSE_HEADERS });
      }
      case "commit-version": {
        const version = commitPromptVersion(
          parsed.data.angleId,
          parsed.data.template,
          parsed.data.message
        );
        return Response.json({ version }, { headers: API_RESPONSE_HEADERS });
      }
      case "activate-version": {
        const version = activatePromptVersion(parsed.data.angleId, parsed.data.version);
        if (!version) {
          return new Response(JSON.stringify({ error: "Version not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ version }, { headers: API_RESPONSE_HEADERS });
      }
      case "version-history": {
        const history = getPromptVersionHistory(parsed.data.angleId);
        const active = getActivePromptVersion(parsed.data.angleId);
        return Response.json({ history, active }, { headers: API_RESPONSE_HEADERS });
      }
      case "rollback": {
        const version = rollbackPromptVersion(parsed.data.angleId, parsed.data.version);
        if (!version) {
          return new Response(JSON.stringify({ error: "Version not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ version }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Prompt lab error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/prompt-lab",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
