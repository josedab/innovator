/**
 * @description CRUD operations for innovation angles including custom angle management.
 */
export const runtime = "nodejs";

import {
  loadCustomAngles,
  addCustomAngle,
  removeCustomAngle,
  ANGLES,
} from "@innovator/core/innovation";
import type { CustomAngle } from "@innovator/core/innovation";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateAngleSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  promptTemplate: z.string().min(1).max(10000),
  icon: z.string().max(10).optional(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

/** GET /api/angles — list all angles (built-in + custom) */
export async function GET() {
  const builtIn = ANGLES.map((a) => ({ ...a, type: "built-in" as const }));
  const custom = loadCustomAngles().map((a) => ({ ...a, type: "custom" as const }));
  return new Response(JSON.stringify({ angles: [...builtIn, ...custom] }), {
    headers: API_RESPONSE_HEADERS,
  });
}

/** POST /api/angles — create a custom angle */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateAngleSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid angle definition", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    addCustomAngle(parsed.data as CustomAngle);
    return new Response(JSON.stringify({ success: true, angle: parsed.data }), {
      status: 201,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create angle";
    return new Response(JSON.stringify({ error: message }), {
      status: 409,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** DELETE /api/angles — remove a custom angle by ID */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing 'id' parameter" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }
    const removed = removeCustomAngle(id);
    if (!removed) {
      return new Response(JSON.stringify({ error: `Angle "${id}" not found` }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers: API_RESPONSE_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to delete angle" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
