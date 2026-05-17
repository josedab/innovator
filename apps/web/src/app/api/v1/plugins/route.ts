/**
 * @description V1 API — plugin listing and management.
 */
export const runtime = "nodejs";

import { listPlugins } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { validateApiKey } from "@/lib/api-auth";

/** GET /api/v1/plugins — list all registered plugins. */
export async function GET(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const plugins = listPlugins().map(({ id, name, type, version, description }) => ({
    id,
    name,
    type,
    version,
    description,
  }));

  return new Response(JSON.stringify({ data: plugins }), {
    headers: API_RESPONSE_HEADERS,
  });
}
