/**
 * @description Persona-based evaluation — AI personas score and critique ideas.
 */
export const runtime = "nodejs";

import {
  listPersonas,
  evaluateWithMultiplePersonas,
  generateStakeholderAssessment,
  assessmentToMarkdown,
  buildAlignmentMatrix,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const EvaluateSchema = z.object({
  action: z.enum(["evaluate", "assess", "alignment", "list-personas"]),
  idea: z
    .object({
      title: z.string().max(500),
      description: z.string().max(5000),
    })
    .optional(),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
      })
    )
    .max(20)
    .optional(),
  personaIds: z.array(z.string().max(100)).max(12).optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = EvaluateSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { action, idea, ideas, personaIds, model, format } = parsed.data;

    switch (action) {
      case "list-personas": {
        return new Response(JSON.stringify({ personas: listPersonas() }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "evaluate": {
        if (!idea || !personaIds?.length) {
          return new Response(JSON.stringify({ error: "idea and personaIds required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const scorecards = await evaluateWithMultiplePersonas(idea.title, personaIds, { model });
        return new Response(JSON.stringify({ scorecards }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "assess": {
        if (!idea || !personaIds?.length) {
          return new Response(JSON.stringify({ error: "idea and personaIds required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const assessment = await generateStakeholderAssessment(idea.title, personaIds, { model });
        if (format === "markdown") {
          return new Response(assessmentToMarkdown(assessment), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(assessment), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "alignment": {
        if (!ideas?.length || !personaIds?.length) {
          return new Response(JSON.stringify({ error: "ideas and personaIds required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const matrix = await buildAlignmentMatrix(
          ideas.map((i) => i.title),
          personaIds,
          { model }
        );
        return new Response(JSON.stringify(matrix), { status: 200, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Persona evaluation failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ personas: listPersonas() }), {
    status: 200,
    headers: API_RESPONSE_HEADERS,
  });
}
