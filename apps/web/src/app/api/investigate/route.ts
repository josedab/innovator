import { investigate } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { KNOWN_MODELS } from "@/lib/env";
import { validateJsonContentType } from "@/lib/validate-request";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

function isKnownModel(model: string): boolean {
  return (KNOWN_MODELS as readonly string[]).includes(model);
}

export async function POST(request: Request) {
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { subject, model } = parsed.data;

    if (model && !isKnownModel(model)) {
      return new Response(
        JSON.stringify({
          error: `Unknown model "${model}". Allowed models: ${KNOWN_MODELS.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const investigation = await investigate(subject, model);
    return Response.json(investigation);
  } catch (err) {
    logger.error("Investigation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/investigate",
    });
    return new Response(JSON.stringify({ error: "Investigation failed. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
