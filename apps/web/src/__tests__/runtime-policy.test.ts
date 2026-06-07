import { describe, expect, it } from "vitest";
import {
  getConfiguredApiKeys,
  getProductionRouteDecision,
  validateProductionRuntime,
} from "../lib/runtime-policy";

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  INNOVATOR_DEPLOYMENT_PROFILE: "single-tenant",
  INNOVATOR_API_KEYS: "a".repeat(32),
  GH_TOKEN: "github-token",
};

describe("production runtime policy", () => {
  it("requires an explicit profile, strong API key, and Copilot token", () => {
    expect(() => validateProductionRuntime({ NODE_ENV: "production" })).toThrow(
      "INNOVATOR_DEPLOYMENT_PROFILE"
    );
    expect(() =>
      validateProductionRuntime({
        ...validProductionEnv,
        INNOVATOR_API_KEYS: "short",
      })
    ).toThrow("at least 32");
    expect(() =>
      validateProductionRuntime({
        ...validProductionEnv,
        GH_TOKEN: "",
      })
    ).toThrow("GH_TOKEN");
  });

  it("rejects duplicate or conflicting key configuration", () => {
    expect(() =>
      validateProductionRuntime({
        ...validProductionEnv,
        INNOVATOR_API_KEYS: `${"a".repeat(32)},${"a".repeat(32)}`,
      })
    ).toThrow("duplicate");
    expect(() =>
      getConfiguredApiKeys({
        INNOVATOR_API_KEY: "a".repeat(32),
        INNOVATOR_API_KEYS: "b".repeat(32),
      })
    ).toThrow("not both");
    expect(() =>
      validateProductionRuntime({
        ...validProductionEnv,
        INNOVATOR_API_KEYS: "",
        INNOVATOR_API_KEY: "a".repeat(32),
      })
    ).toThrow("legacy");
  });

  it("allows only liveness and the documented API surface", () => {
    expect(getProductionRouteDecision("/healthz", "GET", validProductionEnv)).toEqual({
      action: "allow",
      authenticated: false,
    });

    expect(getProductionRouteDecision("/api/investigate", "POST", validProductionEnv)).toEqual({
      action: "allow",
      authenticated: true,
    });
    expect(getProductionRouteDecision("/api/billing", "POST", validProductionEnv)).toEqual({
      action: "not-found",
    });
    expect(getProductionRouteDecision("/", "GET", validProductionEnv)).toEqual({
      action: "not-found",
    });
  });

  it("keeps liveness available before production configuration is valid", () => {
    expect(
      getProductionRouteDecision("/healthz", "GET", {
        NODE_ENV: "production",
      })
    ).toEqual({
      action: "allow",
      authenticated: false,
    });
  });

  it("returns 405 metadata for unsupported methods", () => {
    expect(getProductionRouteDecision("/api/investigate", "GET", validProductionEnv)).toEqual({
      action: "method-not-allowed",
      allowedMethods: ["POST"],
    });
  });

  it("does not require runtime secrets during the production build phase", () => {
    expect(() =>
      validateProductionRuntime({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      })
    ).not.toThrow();
  });
});
