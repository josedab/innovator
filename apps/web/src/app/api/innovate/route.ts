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

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema,
  angles: z.array(z.enum(ANGLE_IDS)).min(1).max(8),
  model: z.string().optional(),
  synthesize: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { subject, investigation, angles, model, synthesize } = parsed.data;

    const results: AngleResult[] = [];
    const MAX_CONCURRENCY = 2;

    // Process angles with bounded concurrency
    for (let i = 0; i < angles.length; i += MAX_CONCURRENCY) {
      const batch = angles.slice(i, i + MAX_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((angleId) => generateForAngle(subject, investigation, angleId as AngleId, model))
      );
      results.push(...batchResults);
    }

    // Optionally synthesize results
    let synthesis = undefined;
    if (synthesize && results.length >= 2) {
      const angleResultsJson = JSON.stringify(results, null, 2);
      const prompt = buildSynthesisPrompt(subject, investigation, angleResultsJson);
      const raw = await generateText({ prompt, model, serverMode: true });
      const jsonStr = extractJson(raw);
      let parsedJson;
      try {
        parsedJson = JSON.parse(jsonStr);
      } catch {
        throw new Error(`Failed to parse LLM response as JSON: ${jsonStr.slice(0, 200)}`);
      }
      synthesis = SynthesisSchema.parse(parsedJson);
    }

    return Response.json({ angleResults: results, synthesis });
  } catch (err) {
    logger.error("Innovation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/innovate",
    });
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Innovation generation failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
