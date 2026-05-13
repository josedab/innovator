/**
 * @description Idea version tracking and comparison.
 */
export const runtime = "nodejs";

import { getVersionLog, listBranches, semanticDiff, createVersion, commitVersion, createBranch, mergeVersions } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const LogSchema = z.object({ ideaId: z.string().min(1).max(200), branch: z.string().max(200).optional() });
const DiffSchema = z.object({ fromVersionId: z.string().min(1).max(200), toVersionId: z.string().min(1).max(200), model: z.string().optional() });
const CreateVersionSchema = z.object({
  ideaId: z.string().min(1).max(200),
  idea: z.object({ title: z.string().max(500), description: z.string().max(5000), potentialImpact: z.string().max(2000), implementationHint: z.string().max(2000) }),
  author: z.string().max(200).optional(),
  message: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "log";

    if (action === "log") {
      const parsed = LogSchema.safeParse(body);
      if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400, headers: API_RESPONSE_HEADERS });
      const versions = getVersionLog(parsed.data.ideaId, parsed.data.branch);
      const branches = listBranches(parsed.data.ideaId);
      return Response.json({ versions, branches }, { headers: API_RESPONSE_HEADERS });
    }

    if (action === "diff") {
      const parsed = DiffSchema.safeParse(body);
      if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400, headers: API_RESPONSE_HEADERS });
      const modelError = validateModel(parsed.data.model);
      if (modelError) return modelError;
      const diff = await semanticDiff(parsed.data.fromVersionId, parsed.data.toVersionId, parsed.data.model, request.signal);
      return Response.json(diff, { headers: API_RESPONSE_HEADERS });
    }

    if (action === "create") {
      const parsed = CreateVersionSchema.safeParse(body);
      if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid request." }), { status: 400, headers: API_RESPONSE_HEADERS });
      const version = createVersion(parsed.data.ideaId, parsed.data.idea, parsed.data.author, parsed.data.message);
      return Response.json(version, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Idea version error", { error: err instanceof Error ? err.message : String(err), route: "/api/idea-version", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: "Idea version operation failed." }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
