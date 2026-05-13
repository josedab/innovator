/**
 * @description System monitoring and health check dashboard data.
 */
export const runtime = "nodejs";

import {
  addMonitorSource,
  removeMonitorSource,
  listMonitorSources,
  generateMonitorDigest,
  monitorDigestToMarkdown,
  getMonitorState,
  startMonitor,
  stopMonitor,
  getRecentSignals,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SourceSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["codebase", "market", "competitor", "metrics", "custom"]),
  name: z.string().max(200),
  config: z.record(z.string().max(500)),
  enabled: z.boolean().optional(),
  pollIntervalMs: z.number().min(60000).optional(),
});

const ActionSchema = z.object({
  action: z.enum(["add-source", "remove-source", "start", "stop", "generate-digest"]),
  source: SourceSchema.optional(),
  sourceId: z.string().max(100).optional(),
  period: z.enum(["daily", "weekly"]).optional(),
  model: z.string().optional(),
});

/**
 * Manage innovation monitor sources and generate digests.
 *
 * @route POST /api/monitor
 * @param request - JSON body: `{ action: "add-source"|"remove-source"|"start"|"stop"|"generate-digest", ... }`
 * @returns JSON result on success (200), or `{ error: string }` on failure (400/500).
 */
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

    const { action, source, sourceId, period, model } = parsed.data;

    switch (action) {
      case "add-source": {
        if (!source) {
          return new Response(JSON.stringify({ error: "source required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        const added = addMonitorSource({ ...source, enabled: source.enabled ?? true, pollIntervalMs: source.pollIntervalMs ?? 300000 });
        return new Response(JSON.stringify(added), { status: 201, headers: API_RESPONSE_HEADERS });
      }
      case "remove-source": {
        if (!sourceId) {
          return new Response(JSON.stringify({ error: "sourceId required" }), { status: 400, headers: API_RESPONSE_HEADERS });
        }
        removeMonitorSource(sourceId);
        return new Response(JSON.stringify({ removed: sourceId }), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "start": {
        const state = startMonitor({
          sources: listMonitorSources(),
          digestSchedule: period ?? "daily",
          opportunityThreshold: 0.5,
          maxSignalsPerDigest: 20,
        });
        return new Response(JSON.stringify(state), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "stop": {
        const state = stopMonitor();
        return new Response(JSON.stringify(state), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      case "generate-digest": {
        const digest = await generateMonitorDigest(period ?? "daily", model);
        return new Response(JSON.stringify(digest), { status: 200, headers: API_RESPONSE_HEADERS });
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }
  } catch (err) {
    logger.error("Monitor action failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/monitor — retrieve monitor state, sources, or recent signals. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "state";

    switch (view) {
      case "sources":
        return new Response(JSON.stringify({ sources: listMonitorSources() }), { status: 200, headers: API_RESPONSE_HEADERS });
      case "signals":
        return new Response(JSON.stringify({ signals: getRecentSignals() }), { status: 200, headers: API_RESPONSE_HEADERS });
      case "state":
      default:
        return new Response(JSON.stringify(getMonitorState()), { status: 200, headers: API_RESPONSE_HEADERS });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
