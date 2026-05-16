/**
 * @module api-economy/developer-portal
 *
 * Developer portal data — API key management UI data, usage dashboards,
 * webhook configuration, and interactive playground state.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const WebhookConfigSchema = z.object({
  id: z.string(),
  clientId: z.string().max(200),
  url: z.string().max(2000),
  events: z.array(z.string().max(100)).max(20),
  secret: z.string().max(200),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  lastDeliveryAt: z.string().optional(),
  failureCount: z.number().int().min(0).default(0),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const PlaygroundRequestSchema = z.object({
  id: z.string(),
  endpoint: z.string().max(200),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  headers: z.record(z.string().max(500)).default({}),
  body: z.string().max(50000).optional(),
  response: z
    .object({
      statusCode: z.number().int(),
      body: z.string().max(100000),
      latencyMs: z.number().min(0),
      headers: z.record(z.string()),
    })
    .optional(),
  timestamp: z.string(),
});
export type PlaygroundRequest = z.infer<typeof PlaygroundRequestSchema>;

export const DeveloperDashboardSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  tier: z.string(),
  apiKeys: z.array(
    z.object({
      id: z.string(),
      prefix: z.string(),
      status: z.string(),
      lastUsed: z.string().optional(),
      createdAt: z.string(),
    })
  ),
  usageSummary: z.object({
    todayRequests: z.number().int().min(0),
    monthRequests: z.number().int().min(0),
    quotaRemaining: z.number().int().min(0),
    dailyQuota: z.number().int().min(0),
  }),
  webhooks: z.array(WebhookConfigSchema),
  recentActivity: z.array(
    z.object({
      endpoint: z.string(),
      method: z.string(),
      statusCode: z.number().int(),
      timestamp: z.string(),
    })
  ),
});
export type DeveloperDashboard = z.infer<typeof DeveloperDashboardSchema>;

// ---- Webhook Store ----

const webhookConfigs = new Map<string, WebhookConfig>();

/** Register a webhook endpoint for a client. */
export function registerWebhook(params: {
  clientId: string;
  url: string;
  events: string[];
}): WebhookConfig {
  const webhook: WebhookConfig = {
    id: randomUUID(),
    clientId: params.clientId,
    url: params.url,
    events: params.events,
    secret: `whsec_${randomUUID().replace(/-/g, "")}`,
    isActive: true,
    createdAt: new Date().toISOString(),
    failureCount: 0,
  };
  const validated = WebhookConfigSchema.parse(webhook);
  webhookConfigs.set(validated.id, validated);
  return validated;
}

/** List webhooks for a client. */
export function listWebhooks(clientId: string): WebhookConfig[] {
  return Array.from(webhookConfigs.values()).filter((w) => w.clientId === clientId);
}

/** Remove a webhook. */
export function removeWebhook(webhookId: string): boolean {
  return webhookConfigs.delete(webhookId);
}

/** Toggle webhook active status. */
export function toggleWebhook(webhookId: string): WebhookConfig | undefined {
  const webhook = webhookConfigs.get(webhookId);
  if (!webhook) return undefined;
  webhook.isActive = !webhook.isActive;
  webhookConfigs.set(webhookId, webhook);
  return webhook;
}

// ---- Playground Store ----

const playgroundHistory = new Map<string, PlaygroundRequest[]>();

/** Save a playground request for a client. */
export function savePlaygroundRequest(
  clientId: string,
  request: Omit<PlaygroundRequest, "id" | "timestamp">
): PlaygroundRequest {
  const entry: PlaygroundRequest = {
    ...request,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const list = playgroundHistory.get(clientId) ?? [];
  list.push(entry);
  if (list.length > 100) list.splice(0, list.length - 50);
  playgroundHistory.set(clientId, list);
  return entry;
}

/** Get playground request history for a client. */
export function getPlaygroundHistory(clientId: string, limit = 20): PlaygroundRequest[] {
  const list = playgroundHistory.get(clientId) ?? [];
  return list.slice(-limit).reverse();
}

// ---- Developer Dashboard Builder ----

/**
 * Build a developer dashboard data payload.
 * Takes pre-fetched client data to avoid circular imports.
 */
export function buildDeveloperDashboard(params: {
  clientId: string;
  clientName: string;
  tier: string;
  apiKeys: Array<{
    id: string;
    prefix: string;
    status: string;
    lastUsed?: string;
    createdAt: string;
  }>;
  todayRequests: number;
  monthRequests: number;
  quotaRemaining: number;
  dailyQuota: number;
  recentActivity: Array<{
    endpoint: string;
    method: string;
    statusCode: number;
    timestamp: string;
  }>;
}): DeveloperDashboard {
  return {
    clientId: params.clientId,
    clientName: params.clientName,
    tier: params.tier,
    apiKeys: params.apiKeys,
    usageSummary: {
      todayRequests: params.todayRequests,
      monthRequests: params.monthRequests,
      quotaRemaining: params.quotaRemaining,
      dailyQuota: params.dailyQuota,
    },
    webhooks: listWebhooks(params.clientId),
    recentActivity: params.recentActivity,
  };
}

/** Clear developer portal data (for testing). */
export function clearDeveloperPortalData(): void {
  webhookConfigs.clear();
  playgroundHistory.clear();
  oauthClients.clear();
}

// ---- OAuth2 Authorization Flow ----

export const OAuthClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  name: z.string().max(300),
  redirectUris: z.array(z.string().max(2000)).max(10),
  scopes: z.array(z.string().max(100)).max(20),
  createdAt: z.string(),
});
export type OAuthClient = z.infer<typeof OAuthClientSchema>;

export const OAuthAuthorizationSchema = z.object({
  code: z.string(),
  clientId: z.string(),
  userId: z.string(),
  scopes: z.array(z.string()),
  redirectUri: z.string(),
  expiresAt: z.string(),
  used: z.boolean().default(false),
});
export type OAuthAuthorization = z.infer<typeof OAuthAuthorizationSchema>;

export const OAuthTokenSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
  refreshToken: z.string(),
  scope: z.string(),
  issuedAt: z.string(),
});
export type OAuthToken = z.infer<typeof OAuthTokenSchema>;

const oauthClients = new Map<string, OAuthClient>();
const authCodes = new Map<string, OAuthAuthorization>();

/** Register an OAuth2 client application. */
export function registerOAuthClient(params: {
  name: string;
  redirectUris: string[];
  scopes: string[];
}): OAuthClient {
  const client: OAuthClient = {
    clientId: `oa_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    clientSecret: `oas_${randomUUID().replace(/-/g, "")}`,
    name: params.name,
    redirectUris: params.redirectUris,
    scopes: params.scopes,
    createdAt: new Date().toISOString(),
  };
  oauthClients.set(client.clientId, client);
  return client;
}

/** Generate an authorization code (step 1 of OAuth2 code flow). */
export function generateAuthorizationCode(params: {
  clientId: string;
  userId: string;
  scopes: string[];
  redirectUri: string;
}): OAuthAuthorization | null {
  const client = oauthClients.get(params.clientId);
  if (!client) return null;
  if (!client.redirectUris.includes(params.redirectUri)) return null;

  const auth: OAuthAuthorization = {
    code: randomUUID().replace(/-/g, ""),
    clientId: params.clientId,
    userId: params.userId,
    scopes: params.scopes.filter((s) => client.scopes.includes(s)),
    redirectUri: params.redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    used: false,
  };
  authCodes.set(auth.code, auth);
  return auth;
}

/** Exchange authorization code for access token (step 2 of OAuth2 code flow). */
export function exchangeCodeForToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): OAuthToken | { error: string } {
  const auth = authCodes.get(params.code);
  if (!auth) return { error: "invalid_grant" };
  if (auth.used) return { error: "invalid_grant" };
  if (auth.clientId !== params.clientId) return { error: "invalid_client" };
  if (auth.redirectUri !== params.redirectUri) return { error: "invalid_grant" };

  const client = oauthClients.get(params.clientId);
  if (!client || client.clientSecret !== params.clientSecret) return { error: "invalid_client" };

  if (new Date(auth.expiresAt) < new Date()) return { error: "invalid_grant" };

  auth.used = true;

  return {
    accessToken: `at_${randomUUID().replace(/-/g, "")}`,
    tokenType: "Bearer",
    expiresIn: 3600,
    refreshToken: `rt_${randomUUID().replace(/-/g, "")}`,
    scope: auth.scopes.join(" "),
    issuedAt: new Date().toISOString(),
  };
}

// ---- Stripe Billing Stubs ----

export interface StripeBillingConfig {
  publishableKey: string;
  secretKeySet: boolean;
  webhookEndpoint: string;
  priceIds: Record<string, string>;
}

/** Stub: Get Stripe billing configuration. */
export function getStripeBillingConfig(): StripeBillingConfig {
  return {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "pk_test_placeholder",
    secretKeySet: !!process.env.STRIPE_SECRET_KEY,
    webhookEndpoint: "/api/webhooks/stripe",
    priceIds: {
      free: "",
      starter: process.env.STRIPE_PRICE_STARTER ?? "price_starter_placeholder",
      pro: process.env.STRIPE_PRICE_PRO ?? "price_pro_placeholder",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "price_enterprise_placeholder",
    },
  };
}

/** Stub: Create a checkout session URL. */
export function createCheckoutSessionStub(params: {
  clientId: string;
  tier: "starter" | "pro" | "enterprise";
  successUrl: string;
  cancelUrl: string;
}): { checkoutUrl: string; sessionId: string } {
  return {
    checkoutUrl: `https://checkout.stripe.com/stub/${params.tier}?client=${params.clientId}`,
    sessionId: `cs_stub_${randomUUID().slice(0, 8)}`,
  };
}

// ---- SDK Generation Stubs ----

/** Available SDK languages. */
export const SDK_LANGUAGES = ["typescript", "python", "go", "ruby", "java"] as const;
export type SDKLanguage = (typeof SDK_LANGUAGES)[number];

/** Stub: Generate SDK download URL. */
export function getSDKDownloadUrl(
  language: SDKLanguage,
  version: string = "latest"
): {
  language: SDKLanguage;
  version: string;
  downloadUrl: string;
  installCommand: string;
} {
  const installCommands: Record<SDKLanguage, string> = {
    typescript: "npm install @innovator/sdk",
    python: "pip install innovator-sdk",
    go: "go get github.com/innovator/sdk-go",
    ruby: "gem install innovator-sdk",
    java: "implementation 'com.innovator:sdk:latest'",
  };

  return {
    language,
    version,
    downloadUrl: `https://sdk.innovator.dev/${language}/${version}`,
    installCommand: installCommands[language],
  };
}
