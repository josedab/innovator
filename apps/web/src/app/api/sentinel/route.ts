/**
 * @description Sentinel — Always-On Innovation Agent. Run signal monitoring,
 * view daily briefs, manage automation rules, and check agent status.
 */
export const runtime = "nodejs";

import {
  runSentinel,
  loadSentinelState,
  loadSentinelBriefs,
  sentinelBriefToMarkdown,
} from "@innovator/core";
import {
  createAutomationRule,
  listAutomationRules,
  batchReviewApprovals,
  computeSentinelPerformance,
  getBatchReviewItems,
  getConversionFunnel,
} from "@innovator/core/dist/sentinel/automation.js";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SignalSourceSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["rss", "url", "manual"]),
  name: z.string().min(1).max(200),
  url: z.string().max(2000).optional(),
  topics: z.array(z.string().max(200)).max(20).optional(),
  enabled: z.boolean().default(true),
});

const RunSchema = z.object({
  action: z.literal("run"),
  sources: z.array(SignalSourceSchema).min(1),
  topics: z.array(z.string().min(1).max(200)).min(1),
  relevanceThreshold: z.number().min(0).max(1).optional(),
  maxSignalsPerRun: z.number().int().min(1).max(20).optional(),
  dailyCostBudget: z.number().min(0).optional(),
  model: z.string().max(100).optional(),
  angles: z.array(z.string().max(100)).max(8).optional(),
});

const CreateRuleSchema = z.object({
  action: z.literal("create-rule"),
  name: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  conditions: z
    .array(
      z.object({
        field: z.enum(["relevanceScore", "topic", "sourceId", "title", "signalCount"]),
        operator: z.enum(["gt", "lt", "eq", "contains", "not-contains"]),
        value: z.union([z.string(), z.number()]),
      })
    )
    .min(1)
    .max(10),
  conditionLogic: z.enum(["all", "any"]).default("all"),
  actions: z
    .array(
      z.object({
        type: z.enum([
          "auto-investigate",
          "create-draft-idea",
          "notify-team",
          "add-to-portfolio",
          "schedule-review",
          "tag-signal",
        ]),
        params: z.record(z.unknown()).default({}),
      })
    )
    .min(1)
    .max(5),
  requiresApproval: z.boolean().default(false),
  priority: z.number().int().min(0).max(100).default(50),
});

const BatchReviewSchema = z.object({
  action: z.literal("batch-review"),
  approvalIds: z.array(z.string()).min(1).max(50),
  decision: z.enum(["approved", "rejected"]),
  reviewedBy: z.string().max(200).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  RunSchema,
  CreateRuleSchema,
  BatchReviewSchema,
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("action") ?? searchParams.get("view") ?? "status";

    if (view === "briefs") {
      const limit = parseInt(searchParams.get("limit") ?? "10", 10);
      const briefs = loadSentinelBriefs(limit);
      return Response.json(
        { briefs, count: briefs.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (view === "brief-markdown") {
      const briefs = loadSentinelBriefs(1);
      if (briefs.length === 0) {
        return new Response("No briefs available.", {
          status: 200,
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
        });
      }
      return new Response(sentinelBriefToMarkdown(briefs[0]), {
        status: 200,
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    if (view === "rules") {
      const rules = listAutomationRules();
      return Response.json({ rules }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "pending-approvals") {
      const items = getBatchReviewItems();
      return Response.json({ items, count: items.length }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "performance") {
      const perf = computeSentinelPerformance();
      return Response.json(perf, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "conversion-funnel") {
      const funnel = getConversionFunnel();
      return Response.json({ funnel }, { headers: API_RESPONSE_HEADERS });
    }

    // Default: status
    const state = loadSentinelState();
    return Response.json(state, { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Sentinel query failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;

    if (data.action === "run") {
      const brief = await runSentinel(data);
      return Response.json(brief, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "create-rule") {
      const rule = createAutomationRule({
        name: data.name,
        description: data.description,
        conditions: data.conditions,
        conditionLogic: data.conditionLogic,
        actions: data.actions,
        requiresApproval: data.requiresApproval,
        priority: data.priority,
      });
      return Response.json({ rule }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "batch-review") {
      const count = batchReviewApprovals(data.approvalIds, data.decision, {
        reviewedBy: data.reviewedBy,
      });
      return Response.json({ reviewed: count }, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Sentinel operation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
