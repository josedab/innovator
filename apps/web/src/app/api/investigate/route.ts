import { investigate } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { KNOWN_MODELS } from "@/lib/env";
import { validateJsonContentType } from "@/lib/validate-request";

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
} as const;

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

function isKnownModel(model: string): boolean {
  return (KNOWN_MODELS as readonly string[]).includes(model);
}

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
        headers: { "Content-Type": "application/json", ...CACHE_HEADERS },
      });
    }

    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn("Invalid request", {
        route: "/api/investigate",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const { subject, model } = parsed.data;

    if (model && !isKnownModel(model)) {
      return new Response(
        JSON.stringify({
          error: `Unknown model "${model}". Allowed models: ${KNOWN_MODELS.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const investigation = await investigate(subject, model, request.signal);
    return Response.json(investigation, { headers: CACHE_HEADERS });
  } catch (err) {
    logger.error("Investigation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/investigate",
      requestId,
    });
    return new Response(JSON.stringify({ error: "Investigation failed. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CACHE_HEADERS },
    });
  }
}
