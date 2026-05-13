/**
 * @description A/B testing configuration and results tracking for innovation experiments.
 */
export const runtime = "nodejs";

import {
  createABTest,
  listABTests,
  getABTest,
  analyzeResults,
  getTestSummary,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateTestSchema = z.object({
  name: z.string().min(1).max(200),
  hypothesis: z.string().min(1).max(2000),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        config: z.record(z.unknown()),
      })
    )
    .min(2)
    .max(10),
  metrics: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(["continuous", "binary", "ordinal"]).optional(),
        primary: z.boolean().optional(),
        higherIsBetter: z.boolean().optional(),
      })
    )
    .min(1),
  config: z
    .object({
      significanceLevel: z.number().min(0.001).max(0.1).optional(),
      minimumSampleSize: z.number().int().min(5).max(1000).optional(),
      powerTarget: z.number().min(0.5).max(0.99).optional(),
    })
    .optional(),
});

/** GET /api/ab-testing — list or retrieve A/B prompt experiments. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const test = getABTest(id);
      if (!test) {
        return new Response(JSON.stringify({ error: "Test not found." }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const summary = getTestSummary(id);
      let analysis = undefined;
      try {
        analysis = analyzeResults(id);
      } catch {
        // Not enough data for analysis yet
      }
      return Response.json({ test, analysis, summary }, { headers: API_RESPONSE_HEADERS });
    }

    const tests = listABTests();
    return Response.json(tests, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("A/B test list error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/ab-testing",
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve tests." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** POST /api/ab-testing — create, run, or conclude A/B prompt experiments. */
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

    const parsed = CreateTestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { name, hypothesis, variants, metrics, config } = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const test = createABTest(name, hypothesis, variants as any, metrics as any, config);

    logger.info("A/B test created", {
      route: "/api/ab-testing",
      requestId,
      durationMs: Date.now() - startTime,
      testId: test.id,
    });

    return Response.json(test, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("A/B test creation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/ab-testing",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "A/B test creation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
