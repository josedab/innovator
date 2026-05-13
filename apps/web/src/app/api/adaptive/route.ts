export const runtime = "nodejs";

import {
  classifyComplexityHeuristic,
  getModeConfig,
  listModes,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ClassifySchema = z.object({
  action: z.literal("classify"),
  subject: z.string().min(1).max(5000),
});

const ModeSchema = z.object({
  action: z.literal("mode"),
  mode: z.enum(["quick", "standard", "deep", "auto"]),
  subject: z.string().min(1).max(5000).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [ClassifySchema, ModeSchema]);

export async function GET(): Promise<Response> {
  const modes = listModes();
  return Response.json({ modes }, { headers: API_RESPONSE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  if (parsed.data.action === "classify") {
    const complexity = classifyComplexityHeuristic(parsed.data.subject);
    const autoMode = getModeConfig("auto", parsed.data.subject);
    return Response.json({ complexity, recommendedMode: autoMode }, { headers: API_RESPONSE_HEADERS });
  }

  if (parsed.data.action === "mode") {
    const config = getModeConfig(parsed.data.mode, parsed.data.subject);
    return Response.json({ config }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
