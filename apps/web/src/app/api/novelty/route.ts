export const runtime = "nodejs";

import {
  generateNoveltyReport,
  noveltyReportToMarkdown,
  addPriorArt,
  clearPriorArt,
  getPriorArtCount,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const AssessRequestSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        description: z.string().min(1).max(5000),
      })
    )
    .min(1)
    .max(20),
  domain: z.string().max(200).optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

const SeedRequestSchema = z.object({
  action: z.literal("seed"),
  entries: z.array(
    z.object({
      id: z.string(),
      source: z.enum(["patent", "academic", "product", "pattern", "internal"]),
      title: z.string().max(500),
      description: z.string().max(2000),
      url: z.string().max(2000).optional(),
      similarity: z.number().min(0).max(1).default(0),
      patentNumber: z.string().max(100).optional(),
      doi: z.string().max(200).optional(),
    })
  ).min(1).max(1000),
});

const RequestSchema = z.union([AssessRequestSchema, SeedRequestSchema]);

/**
 * POST /api/novelty — Assess novelty of ideas or seed prior art database.
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

    // Check if this is a seed request
    const seedResult = SeedRequestSchema.safeParse(body);
    if (seedResult.success) {
      addPriorArt(seedResult.data.entries);
      const counts = getPriorArtCount();
      logger.info("Prior art seeded", {
        route: "/api/novelty",
        requestId,
        added: seedResult.data.entries.length,
        total: counts.total,
      });
      return Response.json(
        { message: "Prior art seeded", counts },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    // Otherwise treat as assessment request
    const parsed = AssessRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const report = generateNoveltyReport(parsed.data.ideas, {
      domain: parsed.data.domain,
    });

    logger.info("Novelty assessment completed", {
      route: "/api/novelty",
      requestId,
      ideas: report.summary.totalIdeas,
      avgNovelty: report.summary.averageNovelty,
      durationMs: Date.now() - startTime,
    });

    if (parsed.data.format === "markdown") {
      return new Response(noveltyReportToMarkdown(report), {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return Response.json(report, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Novelty assessment error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/novelty",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Novelty assessment failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * GET /api/novelty — Get prior art database stats.
 */
export async function GET() {
  const counts = getPriorArtCount();
  return Response.json({ counts }, { headers: API_RESPONSE_HEADERS });
}
