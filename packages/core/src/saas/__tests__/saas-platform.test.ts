import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTenant, updateTenantPlan, clearSaasData } from "../index.js";
import {
  GoogleUserSchema,
  clearGoogleAuthData,
  exchangeGoogleCode,
  getAuthenticatedGoogleUser,
  getGoogleAuthorizationUrl,
  validateGoogleState,
} from "../google-oauth.js";
import {
  DEFAULT_RATE_LIMITS,
  checkRateLimit,
  clearRateLimits,
  getRateLimitStatus,
} from "../rate-limiter.js";
import {
  ONBOARDING_STEPS,
  clearOnboardingData,
  completeStep,
  getOnboardingProgress,
  skipOnboarding,
  startOnboarding,
} from "../onboarding.js";

describe("saas-platform", () => {
  beforeEach(() => {
    clearGoogleAuthData();
    clearRateLimits();
    clearOnboardingData();
    clearSaasData();
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/google/callback");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("google-oauth", () => {
    it("builds a Google authorization URL and validates state", () => {
      const { url, state } = getGoogleAuthorizationUrl("/app");

      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=google-client-id");
      expect(url).toContain(`state=${state}`);
      expect(url).toContain("scope=openid+email+profile");
      expect(validateGoogleState(state)).toMatchObject({
        state,
        returnTo: "/app",
      });
      expect(validateGoogleState(state)).toBeNull();
    });

    it("exchanges a Google code for a user profile and stores it", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: "google-access-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sub: "google-user-1",
              email: "user@example.com",
              name: "Google User",
              picture: "https://example.com/avatar.png",
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const user = await exchangeGoogleCode("valid-code");

      expect(GoogleUserSchema.parse(user)).toMatchObject({
        id: "google-user-1",
        email: "user@example.com",
      });
      expect(getAuthenticatedGoogleUser("google-user-1")).toEqual(user);
    });

    it("throws when GOOGLE_CLIENT_ID is not configured", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      expect(() => getGoogleAuthorizationUrl()).toThrow("GOOGLE_CLIENT_ID not configured");
    });
  });

  describe("rate-limiter", () => {
    it("allows requests until the free-plan bucket is exhausted", () => {
      const tenant = createTenant({ name: "Free Co", slug: "free-co", ownerId: "user-1" });
      const endpoint = "/api/investigations";

      for (let index = 0; index < DEFAULT_RATE_LIMITS.free.maxRequests; index += 1) {
        const result = checkRateLimit(tenant.id, endpoint);
        expect(result.allowed).toBe(true);
      }

      const denied = checkRateLimit(tenant.id, endpoint);
      expect(denied).toMatchObject({ allowed: false, remaining: 0 });

      const status = getRateLimitStatus(tenant.id);
      expect(status.endpoints[endpoint]).toMatchObject({ allowed: false, remaining: 0 });
    });

    it("applies higher limits to upgraded plans", () => {
      const tenant = createTenant({ name: "Upgradeable", slug: "upgradeable", ownerId: "user-2" });
      const endpoint = "/api/investigations";

      updateTenantPlan(tenant.id, "pro");

      for (let index = 0; index < DEFAULT_RATE_LIMITS.free.maxRequests + 1; index += 1) {
        const result = checkRateLimit(tenant.id, endpoint);
        expect(result.allowed).toBe(true);
      }

      const status = getRateLimitStatus(tenant.id);
      expect(status.endpoints[endpoint]?.remaining).toBeGreaterThan(
        DEFAULT_RATE_LIMITS.free.maxRequests
      );
    });

    it("treats enterprise tenants as unlimited", () => {
      const tenant = createTenant({
        name: "Enterprise Co",
        slug: "enterprise-co",
        ownerId: "user-3",
        planId: "enterprise",
      });

      const result = checkRateLimit(tenant.id, "/api/enterprise");
      expect(result).toMatchObject({ allowed: true, remaining: -1 });
    });
  });

  describe("onboarding", () => {
    it("starts onboarding at the first step", () => {
      const progress = startOnboarding("user-1");

      expect(progress.status).toBe("in_progress");
      expect(progress.currentStepId).toBe(ONBOARDING_STEPS[0]?.id);
      expect(progress.completedStepIds).toEqual([]);
      expect(progress.id).toBeTruthy();
    });

    it("completes onboarding steps and marks progress completed", () => {
      const userId = "user-2";
      startOnboarding(userId);

      let progress = getOnboardingProgress(userId);
      expect(progress).not.toBeNull();

      for (const step of ONBOARDING_STEPS) {
        progress = completeStep(userId, step.id);
      }

      expect(progress?.status).toBe("completed");
      expect(progress?.currentStepId).toBeUndefined();
      expect(progress?.completedStepIds).toEqual(ONBOARDING_STEPS.map((step) => step.id));
      expect(progress?.completedAt).toBeTruthy();
    });

    it("skips onboarding and preserves the skipped state", () => {
      const skipped = skipOnboarding("user-3");

      expect(skipped.status).toBe("skipped");
      expect(skipped.currentStepId).toBeUndefined();
      expect(skipped.skippedAt).toBeTruthy();
      expect(getOnboardingProgress("user-3")).toEqual(skipped);
    });
  });
});
