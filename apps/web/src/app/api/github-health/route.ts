export const runtime = "nodejs";

import { analyzeRepoHealth, generateBadgeMarkdown, getRepoHealthScore } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  repositoryUrl: z.string().min(1).max(500),
  repositoryName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  language: z.string().max(100).optional(),
  stars: z.number().int().min(0).optional(),
  openIssues: z.number().int().min(0).optional(),
  contributors: z.number().int().min(0).optional(),
  lastCommitDate: z.string().optional(),
  recentCommitMessages: z.array(z.string().max(500)).max(20).optional(),
  model: z.string().optional(),
});

/**
 * Analyze a repository's innovation health.
 *
 * @route POST /api/github-health
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
      logger.warn("Invalid github-health request", {
        route: "/api/github-health",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { model, ...repoData } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    const healthScore = await analyzeRepoHealth(repoData, model, request.signal);
    const badgeMarkdown = generateBadgeMarkdown(healthScore);

    logger.info("Repo health analyzed", {
      route: "/api/github-health",
      requestId,
      repo: repoData.repositoryName,
      score: healthScore.overallScore,
      durationMs: Date.now() - startTime,
    });

    return Response.json({ ...healthScore, badgeMarkdown }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("GitHub health analysis error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/github-health",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Health analysis failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Get cached health score for a repository.
 *
 * @route GET /api/github-health?url=https://github.com/owner/repo
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const score = getRepoHealthScore(url);
    if (!score) {
      return new Response(JSON.stringify({ error: "No health score found. Run POST first." }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    return Response.json(score, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("GitHub health GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve health score." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
