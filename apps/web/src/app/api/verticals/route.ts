/**
 * @description Vertical packs — domain-specific evaluation, compliance, and glossary.
 *
 * POST /api/verticals — List, get, evaluate, compliance check, glossary, install, community submit
 *
 * Uses the core vertical pack service with evaluation rubrics, compliance rules, and glossaries.
 */

import {
  createVerticalPackApiContext,
  VerticalPackApiActionSchema as ActionSchema,
  type VerticalPackApiOutcome,
} from "@innovator/core/verticals";
import { NextRequest, NextResponse } from "next/server";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const verticalPacks = createVerticalPackApiContext();

const STATUS_BY_OUTCOME: Record<VerticalPackApiOutcome, number> = {
  ok: 200,
  created: 201,
  not_found: 404,
  invalid: 400,
};

export async function POST(request: NextRequest) {
  verticalPacks.ensureSeeded();

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const result = verticalPacks.execute(parsed.data);
  return NextResponse.json(result.payload, {
    status: STATUS_BY_OUTCOME[result.outcome],
    headers: API_RESPONSE_HEADERS,
  });
}
