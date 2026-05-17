/**
 * @description SaaS billing management — plans, subscriptions, and invoices.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTenant,
  getUsage,
  listPlans,
  updateTenantPlan,
  createSaasTenant as createTenant,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const BillingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plans"),
  }),
  z.object({
    action: z.literal("usage"),
    tenantId: z.string(),
  }),
  z.object({
    action: z.literal("subscribe"),
    tenantId: z.string(),
    planId: z.enum(["free", "pro", "team", "enterprise"]),
  }),
  z.object({
    action: z.literal("create_tenant"),
    name: z.string().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/),
    ownerId: z.string(),
    planId: z.enum(["free", "pro", "team", "enterprise"]).optional(),
    billingEmail: z.string().email().optional(),
  }),
]);

/** GET /api/billing — retrieve tenant info or list available plans. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (tenantId) {
      const tenant = getTenant(tenantId);
      if (!tenant) {
        return NextResponse.json(
          { error: "Tenant not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      const usage = getUsage(tenantId);
      return NextResponse.json({ tenant, usage }, { headers: API_RESPONSE_HEADERS });
    }

    const plans = listPlans();
    return NextResponse.json({ plans }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

/** POST /api/billing — subscribe to a plan, create a tenant, or query usage. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = BillingActionSchema.parse(body);

    switch (parsed.action) {
      case "plans": {
        const plans = listPlans();
        return NextResponse.json({ plans }, { headers: API_RESPONSE_HEADERS });
      }

      case "usage": {
        const tenant = getTenant(parsed.tenantId);
        if (!tenant) {
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        const usage = getUsage(parsed.tenantId);
        return NextResponse.json({ tenant, usage }, { headers: API_RESPONSE_HEADERS });
      }

      case "subscribe": {
        const tenant = updateTenantPlan(parsed.tenantId, parsed.planId);
        if (!tenant) {
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return NextResponse.json(
          { tenant, message: `Plan updated to ${parsed.planId}` },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "create_tenant": {
        const tenant = createTenant({
          name: parsed.name,
          slug: parsed.slug,
          ownerId: parsed.ownerId,
          planId: parsed.planId,
          billingEmail: parsed.billingEmail,
        });
        return NextResponse.json({ tenant }, { status: 201, headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
