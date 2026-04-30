import { KNOWN_MODELS } from "./env";
import { API_RESPONSE_HEADERS } from "./api-headers";

/**
 * Validate that the request Content-Type is application/json.
 * Returns a 415 Response if invalid, or null if the check passes.
 */
export function validateJsonContentType(request: Request): Response | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return null;
}

/**
 * Validate that a model name is in the known models list.
 * Returns a 400 Response if invalid, or null if the check passes.
 */
export function validateModel(model: string | undefined): Response | null {
  if (model && !(KNOWN_MODELS as readonly string[]).includes(model)) {
    return new Response(
      JSON.stringify({
        error: `Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`,
      }),
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
  return null;
}
