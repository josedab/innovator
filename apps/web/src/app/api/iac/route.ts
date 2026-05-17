/**
 * @description Infrastructure-as-code generation from technical innovations.
 */
export const runtime = "nodejs";

import {
  diffSessions,
  formatSessionDiff,
  validateIaCSession,
  validateIaCConfig,
  ideaToGitHubIssue,
} from "@innovator/core";
import type { IaCSession } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const DiffRequestSchema = z.object({
  action: z.literal("diff"),
  sessionA: z.record(z.unknown()),
  sessionB: z.record(z.unknown()),
  format: z.enum(["json", "text"]).optional(),
});

const ValidateRequestSchema = z.object({
  action: z.literal("validate"),
  type: z.enum(["session", "config"]),
  data: z.record(z.unknown()),
});

const IssuesRequestSchema = z.object({
  action: z.literal("issues"),
  session: z.record(z.unknown()),
  topN: z.number().int().min(1).max(20).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  DiffRequestSchema,
  ValidateRequestSchema,
  IssuesRequestSchema,
]);

/**
 * POST /api/iac — Innovation-as-Code operations: diff, validate, issue generation.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "diff": {
        const errA = validateIaCSession(parsed.data.sessionA);
        const errB = validateIaCSession(parsed.data.sessionB);
        if (errA || errB) {
          return new Response(
            JSON.stringify({
              error: "Invalid session data",
              details: { sessionA: errA, sessionB: errB },
            }),
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        const diff = diffSessions(
          parsed.data.sessionA as unknown as IaCSession,
          parsed.data.sessionB as unknown as IaCSession
        );
        if (parsed.data.format === "text") {
          return new Response(formatSessionDiff(diff), {
            headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/plain" },
          });
        }
        return Response.json(diff, { headers: API_RESPONSE_HEADERS });
      }

      case "validate": {
        const err =
          parsed.data.type === "session"
            ? validateIaCSession(parsed.data.data)
            : validateIaCConfig(parsed.data.data);
        return Response.json(
          { valid: err === null, error: err },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "issues": {
        const sessionErr = validateIaCSession(parsed.data.session);
        if (sessionErr) {
          return new Response(JSON.stringify({ error: "Invalid session", details: sessionErr }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const session = parsed.data.session as unknown as IaCSession;
        const topN = parsed.data.topN ?? 3;
        const ideas = session.synthesis?.topIdeas.slice(0, topN) ?? [];
        const issues = ideas.map((idea) => ideaToGitHubIssue(session, idea));
        return Response.json({ issues }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("IaC route error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/iac",
      requestId,
    });
    return new Response(JSON.stringify({ error: "IaC operation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
