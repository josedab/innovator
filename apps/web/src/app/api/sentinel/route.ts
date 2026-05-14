/**
 * @description Sentinel — Always-On Innovation Agent. Run signal monitoring,
 * view daily briefs, and check agent status.
 */
export const runtime = "nodejs";

import {
  runSentinel,
  loadSentinelState,
  loadSentinelBriefs,
  sentinelBriefToMarkdown,
} from "@innovator/core";
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
  sources: z.array(SignalSourceSchema).min(1),
  topics: z.array(z.string().min(1).max(200)).min(1),
  relevanceThreshold: z.number().min(0).max(1).optional(),
  maxSignalsPerRun: z.number().int().min(1).max(20).optional(),
  dailyCostBudget: z.number().min(0).optional(),
  model: z.string().max(100).optional(),
  angles: z.array(z.string().max(100)).max(8).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") ?? "status";

    if (action === "briefs") {
      const limit = parseInt(searchParams.get("limit") ?? "10", 10);
      const briefs = loadSentinelBriefs(limit);
      return Response.json(
        { briefs, count: briefs.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "brief-markdown") {
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
    const parsed = RunSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid sentinel config", details: parsed.error.issues },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const brief = await runSentinel(parsed.data);
    return Response.json(brief, { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Sentinel run failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
