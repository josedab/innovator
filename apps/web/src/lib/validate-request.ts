import { KNOWN_MODELS } from "./env";
import { API_RESPONSE_HEADERS } from "./api-headers";

/**
 * Validate that the request Content-Type is application/json.
 * @param request - The incoming HTTP request to validate.
 * @returns A 415 Response if Content-Type is missing or not JSON, or `null` if the check passes.
 */
export function validateJsonContentType(request: Request): Response | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: API_RESPONSE_HEADERS,
    });
  }
  return null;
}

/**
 * Validate that a model name is in the known models list.
 * @param model - The model identifier to validate (may be `undefined` to skip validation).
 * @returns A 400 Response if the model is unknown, or `null` if the check passes.
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
