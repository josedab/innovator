/**
 * @description Stripe Checkout session creation for plan upgrades.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripeBilling } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../../lib/api-headers";

const CheckoutSchema = z.object({
  planId: z.enum(["pro", "team", "enterprise"]),
  tenantId: z.string().min(1).max(200),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/** POST /api/billing/checkout — create a Stripe Checkout session for a plan. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { planId, tenantId, successUrl, cancelUrl } = parsed.data;

    const billing = getStripeBilling();
    const subscriptionId = await billing.createSubscription(tenantId, planId);

    const checkoutUrl =
      successUrl ??
      `${request.headers.get("origin") ?? ""}/billing/success?session=${subscriptionId}`;

    return NextResponse.json(
      {
        checkoutUrl,
        subscriptionId,
        planId,
        cancelUrl: cancelUrl ?? `${request.headers.get("origin") ?? ""}/billing/cancel`,
      },
      { status: 201, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
