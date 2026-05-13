/**
 * @description V1 API — API key management (create, list, revoke).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUsageSummary,
  BillingTierSchema,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { validateJsonContentType } from "@/lib/validate-request";

const CreateKeySchema = z.object({
  name: z.string().min(1).max(200),
  tier: BillingTierSchema.optional(),
});

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const apiKey = createApiKey(parsed.data.name, parsed.data.tier);
  return new Response(JSON.stringify(apiKey), {
    status: 201,
    headers: API_RESPONSE_HEADERS,
  });
}

export async function GET(_request: NextRequest) {
  const keys = listApiKeys().map((k) => ({
    id: k.id,
    name: k.name,
    tier: k.tier,
    enabled: k.enabled,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    usage: getUsageSummary(k.id, 30),
  }));

  return new Response(JSON.stringify({ keys }), {
    status: 200,
    headers: API_RESPONSE_HEADERS,
  });
}

export async function DELETE(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const parsed = z.object({ id: z.string() }).safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Missing key id" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const revoked = revokeApiKey(parsed.data.id);
  if (!revoked) {
    return new Response(JSON.stringify({ error: "Key not found" }), {
      status: 404,
      headers: API_RESPONSE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: API_RESPONSE_HEADERS,
  });
}
