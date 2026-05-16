import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  registerWebhook,
  listWebhooks,
  removeWebhook,
  toggleWebhook,
  savePlaygroundRequest,
  getPlaygroundHistory,
  buildDeveloperDashboard,
  registerOAuthClient,
  generateAuthorizationCode,
  exchangeCodeForToken,
  getSDKDownloadUrl,
  getStripeBillingConfig,
  createCheckoutSessionStub,
  clearDeveloperPortalData,
} from "../api-economy/developer-portal.js";

describe("api-economy/developer-portal-ext", () => {
  beforeEach(() => {
    clearDeveloperPortalData();
  });

  it("registers and lists webhooks", () => {
    registerWebhook({ clientId: "c1", url: "https://a.com/hook", events: ["e1"] });
    registerWebhook({ clientId: "c1", url: "https://b.com/hook", events: ["e2"] });
    expect(listWebhooks("c1")).toHaveLength(2);
  });

  it("removes a webhook", () => {
    const wh = registerWebhook({ clientId: "c1", url: "https://a.com", events: [] });
    expect(removeWebhook(wh.id)).toBe(true);
    expect(listWebhooks("c1")).toHaveLength(0);
  });

  it("toggles webhook status", () => {
    const wh = registerWebhook({ clientId: "c1", url: "https://a.com", events: [] });
    const toggled = toggleWebhook(wh.id);
    expect(toggled?.isActive).toBe(false);
  });

  it("saves and retrieves playground requests", () => {
    savePlaygroundRequest("c1", {
      endpoint: "/api/investigate",
      method: "POST",
      headers: {},
      body: '{"subject":"AI"}',
    });
    const history = getPlaygroundHistory("c1");
    expect(history).toHaveLength(1);
  });

  it("builds developer dashboard", () => {
    registerWebhook({ clientId: "c1", url: "https://hook.test", events: ["e1"] });
    const dash = buildDeveloperDashboard({
      clientId: "c1",
      clientName: "Test",
      tier: "free",
      apiKeys: [
        { id: "k1", prefix: "sk-abc", status: "active", createdAt: new Date().toISOString() },
      ],
      todayRequests: 50,
      monthRequests: 500,
      quotaRemaining: 950,
      dailyQuota: 1000,
      recentActivity: [],
    });
    expect(dash.webhooks).toHaveLength(1);
    expect(dash.usageSummary.todayRequests).toBe(50);
  });

  it("registers and uses OAuth2 client", () => {
    const client = registerOAuthClient({
      name: "Test App",
      redirectUris: ["https://app.test/callback"],
      scopes: ["read", "write"],
    });
    expect(client.clientId).toMatch(/^oa_/);
    expect(client.clientSecret).toMatch(/^oas_/);

    const auth = generateAuthorizationCode({
      clientId: client.clientId,
      userId: "user-1",
      scopes: ["read"],
      redirectUri: "https://app.test/callback",
    });
    expect(auth).not.toBeNull();
    expect(auth!.code).toBeDefined();

    const token = exchangeCodeForToken({
      code: auth!.code,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUri: "https://app.test/callback",
    });
    expect("accessToken" in token).toBe(true);
  });

  it("rejects invalid OAuth redirect URI", () => {
    const client = registerOAuthClient({
      name: "App",
      redirectUris: ["https://legit.test/callback"],
      scopes: ["read"],
    });
    const auth = generateAuthorizationCode({
      clientId: client.clientId,
      userId: "user-1",
      scopes: ["read"],
      redirectUri: "https://evil.test/steal",
    });
    expect(auth).toBeNull();
  });

  it("generates SDK download URLs", () => {
    const sdk = getSDKDownloadUrl("typescript");
    expect(sdk.language).toBe("typescript");
    expect(sdk.installCommand).toContain("npm install");
    expect(sdk.downloadUrl).toContain("typescript");
  });

  it("returns Stripe billing config", () => {
    const config = getStripeBillingConfig();
    expect(config.webhookEndpoint).toBe("/api/webhooks/stripe");
    expect(config.priceIds).toBeDefined();
  });

  it("creates checkout session stub", () => {
    const session = createCheckoutSessionStub({
      clientId: "c1",
      tier: "pro",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });
    expect(session.checkoutUrl).toContain("pro");
    expect(session.sessionId).toMatch(/^cs_stub_/);
  });
});
