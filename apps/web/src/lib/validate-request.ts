import { KNOWN_MODELS } from "./env";
import { API_RESPONSE_HEADERS } from "./api-headers";

const MAX_JSON_BODY_BYTES = 100 * 1024;

export class JsonBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413
  ) {
    super(message);
    this.name = "JsonBodyError";
  }
}

/** Read and parse a JSON request body while enforcing the actual streamed byte count. */
export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<unknown> {
  if (!request.body) {
    throw new JsonBodyError("Invalid JSON body", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new JsonBodyError("Request body too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonBodyError("Invalid JSON body", 400);
  }
}

/** Convert a JSON body parsing error into a consistent API response. */
export function jsonBodyErrorResponse(error: unknown): Response {
  const bodyError =
    error instanceof JsonBodyError ? error : new JsonBodyError("Invalid JSON body", 400);
  return new Response(JSON.stringify({ error: bodyError.message }), {
    status: bodyError.status,
    headers: API_RESPONSE_HEADERS,
  });
}

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
