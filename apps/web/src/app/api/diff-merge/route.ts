export const runtime = "nodejs";

import {
  runSemanticDiff,
  autoMerge,
  resolveConflict,
  diffReportToMarkdown,
  mergeResultToMarkdown,
} from "@innovator/core";
import type { SessionSnapshot, MergeConflict } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const DiffRequestSchema = z.object({
  action: z.enum(["diff", "merge", "resolve"]),
  sessionA: z.object({
    sessionId: z.string().max(100),
    subject: z.string().max(500),
    ideas: z.array(z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
    })).max(50),
    investigationSummary: z.string().max(5000).optional(),
    synthesisText: z.string().max(10000).optional(),
  }).optional(),
  sessionB: z.object({
    sessionId: z.string().max(100),
    subject: z.string().max(500),
    ideas: z.array(z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
    })).max(50),
    investigationSummary: z.string().max(5000).optional(),
    synthesisText: z.string().max(10000).optional(),
  }).optional(),
  conflict: z.object({
    itemA: z.string().max(2000),
    itemB: z.string().max(2000),
    conflictType: z.enum(["contradiction", "overlap", "redundancy"]),
    suggestedResolution: z.string().max(2000).optional(),
  }).optional(),
  resolution: z.enum(["keep-a", "keep-b", "synthesize"]).optional(),
  model: z.string().optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/**
 * Diff, merge, or resolve innovation sessions.
 *
 * @route POST /api/diff-merge
 * @param request - JSON body: `{ action: "diff"|"merge"|"resolve", sessionA?, sessionB?, conflict?, resolution?, model?, format? }`
 * @returns JSON diff report, merge result, or conflict resolution on success (200),
 *          or `{ error: string }` on failure (400/500).
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

    const parsed = DiffRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { action, sessionA, sessionB, conflict, resolution, model, format } = parsed.data;

    if (action === "diff") {
      if (!sessionA || !sessionB) {
        return new Response(JSON.stringify({ error: "Both sessionA and sessionB required for diff" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const report = await runSemanticDiff(sessionA as SessionSnapshot, sessionB as SessionSnapshot, { model });
      if (format === "markdown") {
        return new Response(diffReportToMarkdown(report), {
          status: 200,
          headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
        });
      }
      return new Response(JSON.stringify(report), { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "merge") {
      if (!sessionA || !sessionB) {
        return new Response(JSON.stringify({ error: "Both sessionA and sessionB required for merge" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const result = await autoMerge(sessionA as SessionSnapshot, sessionB as SessionSnapshot, { model });
      if (format === "markdown") {
        return new Response(mergeResultToMarkdown(result), {
          status: 200,
          headers: { ...API_RESPONSE_HEADERS, "content-type": "text/markdown; charset=utf-8" },
        });
      }
      return new Response(JSON.stringify(result), { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "resolve") {
      if (!conflict || !resolution) {
        return new Response(JSON.stringify({ error: "conflict and resolution required for resolve" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const resolved = await resolveConflict(conflict as unknown as MergeConflict, resolution, model);
      return new Response(JSON.stringify(resolved), { status: 200, headers: API_RESPONSE_HEADERS });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Diff-merge failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
