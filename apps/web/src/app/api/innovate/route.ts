/**
 * @description Single-angle idea generation for a given subject and angle.
 */
export const runtime = "nodejs";

import {
  generateForAngle,
  generateText,
  extractJson,
  buildSynthesisPrompt,
  sanitizeLlmOutput,
  InvestigationSchema,
  ANGLE_IDS,
  SynthesisSchema,
  MAX_CONCURRENCY,
  scoreIdeas,
} from "@innovator/core";
import type { AngleId, AngleResult, ScoringResult } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema,
  angles: z.array(z.enum(ANGLE_IDS)).min(1).max(8),
  model: z.string().optional(),
  synthesize: z.boolean().optional(),
  score: z.boolean().optional(),
});

/**
 * POST /api/innovate — Generate innovations for selected angles.
 *
 * Processes the requested angles with bounded concurrency, optionally
 * synthesizes cross-angle themes, and optionally scores ideas.
 *
 * @requestBody {object} application/json
 *   - `subject` {string} (required, 1–500 chars) — The subject to innovate on
 *   - `investigation` {Investigation} (required) — Prior investigation context
 *   - `angles` {AngleId[]} (required, 1–8 items) — Angle IDs to generate for
 *     Valid IDs: "scamper", "first-principles", "cross-domain", "constraints",
 *     "inversion", "perspectives", "what-if", "trend-collision"
 *   - `model` {string} (optional) — LLM model override
 *   - `synthesize` {boolean} (optional) — Cross-reference results into a Synthesis
 *   - `score` {boolean} (optional) — Score ideas by feasibility/impact
 *
 * @response 200 {object} application/json
 *   ```json
 *   {
 *     "angleResults": [AngleResult, ...],
 *     "synthesis": Synthesis | undefined,
 *     "scoring": ScoringResult | undefined
 *   }
 *   ```
 * @response 400 {{ error: string }} — Invalid JSON or Zod validation failure
 * @response 500 {{ error: string }} — Generation or LLM failure
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/innovate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return contentTypeError;
    }

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
        route: "/api/innovate",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, investigation, angles, model, synthesize, score } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) {
      logger.warn("Invalid model", {
        route: "/api/innovate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return modelError;
    }

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });

    const results: AngleResult[] = [];

    try {
      // Process angles with bounded concurrency
      for (let i = 0; i < angles.length; i += MAX_CONCURRENCY) {
        if (abortController.signal.aborted) break;
        const batch = angles.slice(i, i + MAX_CONCURRENCY);
        const batchSettled = await Promise.allSettled(
          batch.map((angleId) =>
            generateForAngle(
              subject,
              investigation,
              angleId as AngleId,
              model,
              abortController.signal
            )
          )
        );
        for (const result of batchSettled) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            logger.warn("Angle generation failed", {
              route: "/api/innovate",
              requestId,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }
      }

      if (results.length === 0) {
        return new Response(
          JSON.stringify({ error: "All angle generations failed. Please try again." }),
          { status: 500, headers: API_RESPONSE_HEADERS }
        );
      }

      // Optionally synthesize results
      let synthesis = undefined;
      if (synthesize && results.length >= 2) {
        const angleResultsJson = sanitizeLlmOutput(JSON.stringify(results, null, 2));
        const prompt = buildSynthesisPrompt(subject, investigation, angleResultsJson);
        const raw = await generateText({
          prompt,
          model,
          serverMode: true,
          signal: abortController.signal,
        });
        const jsonStr = extractJson(raw);
        let parsedJson;
        try {
          parsedJson = JSON.parse(jsonStr);
        } catch {
          throw new Error(`Failed to parse LLM response as JSON: ${jsonStr.slice(0, 200)}`);
        }
        synthesis = SynthesisSchema.parse(parsedJson);
      }

      // Optionally score ideas
      let scoring: ScoringResult | undefined = undefined;
      if (score && results.length > 0) {
        try {
          scoring = await scoreIdeas(
            subject,
            results,
            investigation,
            model,
            abortController.signal
          );
        } catch (err) {
          logger.warn("Scoring failed", {
            route: "/api/innovate",
            requestId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info("Innovation completed", {
        route: "/api/innovate",
        requestId,
        angles: angles.length,
        synthesized: !!synthesis,
        durationMs: Date.now() - startTime,
      });
      return Response.json(
        { angleResults: results, synthesis, scoring },
        { headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS } }
      );
    } finally {
      request.signal.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    logger.error("Innovation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/innovate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({
        error: "Innovation generation failed. Please try again.",
      }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
