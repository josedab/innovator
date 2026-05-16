/**
 * GET /api/api-economy — Pricing tiers, usage summary.
 * POST /api/api-economy — Register clients, generate keys, record usage, webhooks.
 */
export const runtime = "nodejs";

import {
  getApiPricing,
  createApiClient,
  generateApiKey,
  getUsageSummary,
  recordUsage,
} from "@innovator/core";
import {
  registerWebhook,
  listWebhooks,
  removeWebhook,
  registerOAuthClient,
  generateAuthorizationCode,
  exchangeCodeForToken,
  getSDKDownloadUrl,
  getStripeBillingConfig,
  createCheckoutSessionStub,
  SDK_LANGUAGES,
} from "@innovator/core/dist/api-economy/developer-portal.js";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

/**
 * GET /api/api-economy — Returns pricing tiers or usage summary.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "pricing";

    if (view === "pricing") {
      const tiers = getApiPricing();
      return Response.json({ tiers }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "usage") {
      const clientId = searchParams.get("clientId");
      if (!clientId) {
        return Response.json(
          { error: "clientId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const period = searchParams.get("period") ?? undefined;
      const summary = getUsageSummary(clientId, period);
      return Response.json(summary, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "webhooks") {
      const clientId = searchParams.get("clientId");
      if (!clientId) {
        return Response.json(
          { error: "clientId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const webhooks = listWebhooks(clientId);
      return Response.json({ webhooks }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "sdks") {
      const language = searchParams.get("language");
      if (language) {
        const sdk = getSDKDownloadUrl(language as (typeof SDK_LANGUAGES)[number]);
        return Response.json(sdk, { headers: API_RESPONSE_HEADERS });
      }
      const sdks = SDK_LANGUAGES.map((lang) => getSDKDownloadUrl(lang));
      return Response.json({ sdks }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "billing") {
      const config = getStripeBillingConfig();
      return Response.json(config, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json({ error: "Invalid view" }, { status: 400, headers: API_RESPONSE_HEADERS });
  } catch (error) {
    logger.error("API economy GET failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

const RegisterClientSchema = z.object({
  action: z.literal("register"),
  name: z.string().min(1).max(300),
  email: z.string().email().max(500),
  organization: z.string().max(300).optional(),
  tier: z.enum(["free", "starter", "pro", "enterprise"]).default("free"),
});

const GenerateKeySchema = z.object({
  action: z.literal("generate-key"),
  clientId: z.string().min(1),
});

const WebhookSchema = z.object({
  action: z.literal("register-webhook"),
  clientId: z.string().min(1),
  url: z.string().url().max(2000),
  events: z.array(z.string().max(100)).max(20),
});

const RemoveWebhookSchema = z.object({
  action: z.literal("remove-webhook"),
  webhookId: z.string().min(1),
});

const OAuthRegisterSchema = z.object({
  action: z.literal("oauth-register"),
  name: z.string().min(1).max(300),
  redirectUris: z.array(z.string().url().max(2000)).min(1).max(10),
  scopes: z.array(z.string().max(100)).max(20),
});

const OAuthAuthorizeSchema = z.object({
  action: z.literal("oauth-authorize"),
  clientId: z.string().min(1),
  userId: z.string().min(1).max(200),
  scopes: z.array(z.string().max(100)),
  redirectUri: z.string().url().max(2000),
});

const OAuthTokenExchangeSchema = z.object({
  action: z.literal("oauth-token-exchange"),
  code: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url().max(2000),
});

const CheckoutSchema = z.object({
  action: z.literal("create-checkout"),
  clientId: z.string().min(1),
  tier: z.enum(["starter", "pro", "enterprise"]),
  successUrl: z.string().url().max(2000),
  cancelUrl: z.string().url().max(2000),
});

const PostBodySchema = z.discriminatedUnion("action", [
  RegisterClientSchema,
  GenerateKeySchema,
  WebhookSchema,
  RemoveWebhookSchema,
  OAuthRegisterSchema,
  OAuthAuthorizeSchema,
  OAuthTokenExchangeSchema,
  CheckoutSchema,
]);

/**
 * POST /api/api-economy — Register clients, generate keys, manage webhooks.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "register") {
      const client = createApiClient({
        name: parsed.name,
        email: parsed.email,
        organization: parsed.organization,
        tier: parsed.tier,
      });
      return Response.json({ client }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "generate-key") {
      const result = generateApiKey(parsed.clientId);
      return Response.json(
        { key: result.key, rawKey: result.rawKey },
        { status: 201, headers: API_RESPONSE_HEADERS }
      );
    }

    if (parsed.action === "register-webhook") {
      const webhook = registerWebhook({
        clientId: parsed.clientId,
        url: parsed.url,
        events: parsed.events,
      });
      return Response.json({ webhook }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "remove-webhook") {
      const removed = removeWebhook(parsed.webhookId);
      return Response.json({ removed }, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "oauth-register") {
      const client = registerOAuthClient({
        name: parsed.name,
        redirectUris: parsed.redirectUris,
        scopes: parsed.scopes,
      });
      return Response.json({ client }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "oauth-authorize") {
      const auth = generateAuthorizationCode({
        clientId: parsed.clientId,
        userId: parsed.userId,
        scopes: parsed.scopes,
        redirectUri: parsed.redirectUri,
      });
      if (!auth) {
        return Response.json(
          { error: "Invalid client or redirect URI" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      return Response.json({ authorization: auth }, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "oauth-token-exchange") {
      const result = exchangeCodeForToken({
        code: parsed.code,
        clientId: parsed.clientId,
        clientSecret: parsed.clientSecret,
        redirectUri: parsed.redirectUri,
      });
      if ("error" in result) {
        return Response.json(
          { error: result.error },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      return Response.json({ token: result }, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "create-checkout") {
      const session = createCheckoutSessionStub({
        clientId: parsed.clientId,
        tier: parsed.tier,
        successUrl: parsed.successUrl,
        cancelUrl: parsed.cancelUrl,
      });
      return Response.json(session, { headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error("API economy POST failed", { error, requestId });
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
