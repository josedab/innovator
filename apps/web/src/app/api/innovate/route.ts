import {
  generateForAngle,
  generateText,
  extractJson,
  buildSynthesisPrompt,
  InvestigationSchema,
  ANGLE_IDS,
  SynthesisSchema,
} from "@innovator/core";
import type { AngleId, AngleResult } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { KNOWN_MODELS } from "@/lib/env";
import { validateJsonContentType } from "@/lib/validate-request";

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
} as const;

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema,
  angles: z.array(z.enum(ANGLE_IDS)).min(1).max(8),
  model: z.string().optional(),
  synthesize: z.boolean().optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CACHE_HEADERS },
      });
    }

    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn("Invalid request", {
        route: "/api/innovate",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const { subject, investigation, angles, model, synthesize } = parsed.data;

    if (model && !(KNOWN_MODELS as readonly string[]).includes(model)) {
      return new Response(
        JSON.stringify({
          error: `Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });

    const results: AngleResult[] = [];
    const MAX_CONCURRENCY = 2;

    try {
      // Process angles with bounded concurrency
      for (let i = 0; i < angles.length; i += MAX_CONCURRENCY) {
        const batch = angles.slice(i, i + MAX_CONCURRENCY);
        const batchResults = await Promise.all(
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
        results.push(...batchResults);
      }

      // Optionally synthesize results
      let synthesis = undefined;
      if (synthesize && results.length >= 2) {
        const angleResultsJson = JSON.stringify(results, null, 2);
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

      return Response.json({ angleResults: results, synthesis }, { headers: CACHE_HEADERS });
    } finally {
      request.signal.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    logger.error("Innovation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/innovate",
      requestId,
    });
    return new Response(
      JSON.stringify({
        error: "Innovation generation failed. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
    );
  }
}
