export const runtime = "nodejs";

import {
  recordDecisionPoint,
  getDecisionPoints,
  branchFromDecision,
  getSessionTree,
  adoptBranch,
  compareBranches,
  branchComparisonToMarkdown,
  buildTimelineView,
  timelineViewToMarkdown,
} from "@innovator/core";
import type { ReplayDecisionPoint } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ActionSchema = z.object({
  action: z.enum(["record", "branch", "adopt", "compare"]),
  runId: z.string().max(100).optional(),
  decisionId: z.string().max(100).optional(),
  branchId: z.string().max(100).optional(),
  branchIdA: z.string().max(100).optional(),
  branchIdB: z.string().max(100).optional(),
  alternativeOption: z.string().max(500).optional(),
  point: z.object({
    stage: z.string().max(100),
    type: z.string().max(100),
    description: z.string().max(2000),
    chosenOption: z.string().max(500),
    availableOptions: z.array(z.string().max(500)).max(20),
  }).optional(),
  model: z.string().optional(),
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

    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { action, runId, decisionId, branchId, branchIdA, branchIdB, alternativeOption, point, model } = parsed.data;

    switch (action) {
      case "record": {
        if (!runId || !point) {
          return new Response(JSON.stringify({ error: "runId and point required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const dp = recordDecisionPoint(runId, point as unknown as Omit<ReplayDecisionPoint, "id" | "runId" | "timestamp">);
        return new Response(JSON.stringify(dp), { status: 201, headers: API_RESPONSE_HEADERS });
      }
      case "branch": {
        if (!decisionId || !alternativeOption) {
          return new Response(JSON.stringify({ error: "decisionId and alternativeOption required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const branch = await branchFromDecision(decisionId, alternativeOption, model);
        return new Response(JSON.stringify(branch), { status: 201, headers: API_RESPONSE_HEADERS });
      }
      case "adopt": {
        if (!branchId || !runId) {
          return new Response(JSON.stringify({ error: "branchId and runId required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const adopted = adoptBranch(branchId, runId);
        return new Response(JSON.stringify({ adopted }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "compare": {
        if (!branchIdA || !branchIdB) {
          return new Response(JSON.stringify({ error: "branchIdA and branchIdB required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const comparison = await compareBranches(branchIdA, branchIdB);
        return new Response(JSON.stringify(comparison), { status: 200, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Replay decisions action failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const view = url.searchParams.get("view") ?? "decisions";

    if (!runId) {
      return new Response(JSON.stringify({ error: "runId parameter required" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    switch (view) {
      case "tree": {
        const tree = getSessionTree(runId);
        return new Response(JSON.stringify(tree), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "timeline": {
        const format = url.searchParams.get("format");
        const timeline = buildTimelineView(runId);
        if (format === "markdown") {
          return new Response(timelineViewToMarkdown(timeline), {
            status: 200,
            headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(timeline), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "decisions":
      default: {
        const decisions = getDecisionPoints(runId);
        return new Response(JSON.stringify({ decisions }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
