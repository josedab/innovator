export const runtime = "nodejs";

import { getPresets, getPresetById } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/** GET /api/presets — list all presets, optionally filtered by category. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const id = searchParams.get("id");

  if (id) {
    const preset = getPresetById(id);
    if (!preset) {
      return new Response(JSON.stringify({ error: `Preset "${id}" not found` }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: preset }), { headers: API_RESPONSE_HEADERS });
  }

  let presets = getPresets();
  if (category) {
    presets = presets.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  return new Response(JSON.stringify({ data: presets }), { headers: API_RESPONSE_HEADERS });
}
