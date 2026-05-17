/**
 * @description Innovation impact measurement and ROI tracking.
 */
export const runtime = "nodejs";

import {
  trackImpactIdea,
  updateIdeaStatus,
  linkPR,
  linkIssue,
  listTrackedIdeas,
  getImpactTrackedIdea,
  recordImpactOutcome,
  getImpactOutcomes,
  calculateImpactScore,
  rankByImpact,
  getInnovationFunnel,
  generateImpactDashboard,
  dashboardToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ActionSchema = z.object({
  action: z.enum([
    "track",
    "update-status",
    "link-pr",
    "link-issue",
    "record-outcome",
    "impact-score",
    "rank",
    "funnel",
    "dashboard",
  ]),
  ideaId: z.string().max(200).optional(),
  idea: z
    .object({
      id: z.string().max(200),
      title: z.string().max(500),
      description: z.string().max(5000),
      sourceSessionId: z.string().max(100),
      tags: z.array(z.string().max(100)).max(20).optional(),
    })
    .optional(),
  status: z.enum(["proposed", "in-progress", "shipped", "abandoned"]).optional(),
  prUrl: z.string().max(500).optional(),
  issueUrl: z.string().max(500).optional(),
  outcome: z
    .object({
      id: z.string().max(200),
      ideaId: z.string().max(200),
      type: z.enum(["pr-merged", "feature-shipped", "revenue-impact", "user-adoption", "custom"]),
      title: z.string().max(500),
      value: z.number().optional(),
      unit: z.string().max(50).optional(),
      source: z.enum(["github", "jira", "manual"]),
    })
    .optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/** POST /api/impact-tracker — record idea metrics, milestones, or run ROI analysis. */
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

    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { action, ideaId, idea, status, prUrl, issueUrl, outcome, model, format } = parsed.data;

    switch (action) {
      case "track": {
        if (!idea)
          return new Response(JSON.stringify({ error: "idea required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const tracked = trackImpactIdea({
          ...idea,
          status: "proposed",
          createdAt: new Date().toISOString(),
          linkedPRs: [],
          linkedIssues: [],
          customOutcomes: [],
          tags: idea.tags ?? [],
        });
        return new Response(JSON.stringify(tracked), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "update-status": {
        if (!ideaId || !status)
          return new Response(JSON.stringify({ error: "ideaId and status required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const updated = updateIdeaStatus(ideaId, status);
        return new Response(JSON.stringify(updated), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "link-pr": {
        if (!ideaId || !prUrl)
          return new Response(JSON.stringify({ error: "ideaId and prUrl required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const linked = linkPR(ideaId, prUrl);
        return new Response(JSON.stringify(linked), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "link-issue": {
        if (!ideaId || !issueUrl)
          return new Response(JSON.stringify({ error: "ideaId and issueUrl required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const linked = linkIssue(ideaId, issueUrl);
        return new Response(JSON.stringify(linked), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "record-outcome": {
        if (!outcome)
          return new Response(JSON.stringify({ error: "outcome required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const recorded = recordImpactOutcome({
          ...outcome,
          detectedAt: new Date().toISOString(),
          metadata: {},
        });
        return new Response(JSON.stringify(recorded), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "impact-score": {
        if (!ideaId)
          return new Response(JSON.stringify({ error: "ideaId required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        const score = calculateImpactScore(ideaId);
        return new Response(JSON.stringify(score), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "rank": {
        const ranked = rankByImpact();
        return new Response(JSON.stringify({ ideas: ranked }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "funnel": {
        const funnel = getInnovationFunnel();
        return new Response(JSON.stringify(funnel), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "dashboard": {
        const dashboard = await generateImpactDashboard(model);
        if (format === "markdown") {
          return new Response(dashboardToMarkdown(dashboard), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(dashboard), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
    }
  } catch (err) {
    logger.error("Impact tracker failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/impact-tracker — retrieve tracked ideas, impact scores, or milestone history. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ideaId = url.searchParams.get("ideaId");

    if (ideaId) {
      const idea = getImpactTrackedIdea(ideaId);
      if (!idea) {
        return new Response(JSON.stringify({ error: "Idea not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const outcomes = getImpactOutcomes(ideaId);
      return new Response(JSON.stringify({ idea, outcomes }), {
        status: 200,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const ideas = listTrackedIdeas();
    return new Response(JSON.stringify({ ideas }), { status: 200, headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
