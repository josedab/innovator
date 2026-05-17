/**
 * @description Innovation portal — public-facing innovation showcase.
 */
export const runtime = "nodejs";

import {
  createTenant,
  getTenant,
  updateTenantTier,
  addTenantApiKey,
  getDeveloperPortalInfo,
  createDemoKey,
  getOpenApiSpec,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateTenantSchema = z.object({
  action: z.literal("create-tenant"),
  name: z.string().min(1).max(200),
  ownerEmail: z.string().email().max(300),
  tier: z.enum(["free", "pro", "enterprise"]).optional(),
});

const GetPortalSchema = z.object({
  action: z.literal("get-portal"),
  tenantId: z.string().min(1).max(100),
});

const UpgradeTierSchema = z.object({
  action: z.literal("upgrade-tier"),
  tenantId: z.string().min(1).max(100),
  tier: z.enum(["free", "pro", "enterprise"]),
});

const AddKeySchema = z.object({
  action: z.literal("add-key"),
  tenantId: z.string().min(1).max(100),
  keyName: z.string().min(1).max(200),
});

const DemoSchema = z.object({
  action: z.literal("demo"),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateTenantSchema,
  GetPortalSchema,
  UpgradeTierSchema,
  AddKeySchema,
  DemoSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "create-tenant": {
        const tenant = createTenant(parsed.name, parsed.ownerEmail, parsed.tier);
        logger.info(`Created tenant ${tenant.id} for ${parsed.ownerEmail}`, {
          route: "/api/portal",
        });
        return Response.json({ tenant }, { headers: API_RESPONSE_HEADERS });
      }
      case "get-portal": {
        const info = getDeveloperPortalInfo(parsed.tenantId);
        if (!info) {
          return Response.json(
            { error: "Tenant not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json({ portal: info }, { headers: API_RESPONSE_HEADERS });
      }
      case "upgrade-tier": {
        const success = updateTenantTier(parsed.tenantId, parsed.tier);
        if (!success) {
          return Response.json(
            { error: "Tenant not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        const tenant = getTenant(parsed.tenantId);
        return Response.json({ tenant }, { headers: API_RESPONSE_HEADERS });
      }
      case "add-key": {
        const key = addTenantApiKey(parsed.tenantId, parsed.keyName);
        if (!key) {
          return Response.json(
            { error: "Cannot add key — tenant not found, inactive, or at key limit" },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json({ apiKey: key }, { headers: API_RESPONSE_HEADERS });
      }
      case "demo": {
        const demoKey = createDemoKey();
        return Response.json(
          { demoKey, message: "Demo key valid for 1 hour, 5 calls/day" },
          { headers: API_RESPONSE_HEADERS }
        );
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", {
      route: "/api/portal",
    });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function GET() {
  const spec = getOpenApiSpec();
  return Response.json(spec, { headers: API_RESPONSE_HEADERS });
}
