import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTenant,
  updateTenant,
  getTenantConfig,
  listWhiteLabelTenants,
  removeTenant,
  setDefaultTenant,
  resolveTenant,
  isFeatureEnabled,
  applyTerminology,
  generateBrandingCss,
  registerPartner,
  getPartner,
  listPartners,
  clearWhiteLabelData,
  TenantConfigSchema,
  BrandingConfigSchema,
} from "../white-label/index.js";

function makeTenantConfig(id = "acme") {
  return {
    tenantId: id,
    organizationName: "Acme Corp",
    customDomain: "acme.innovator.app",
    branding: BrandingConfigSchema.parse({}),
    features: {
      enableCollaboration: true,
      enableAnalytics: true,
      enableExport: true,
      enableCustomAngles: true,
      enableGamification: false,
      enableDebate: true,
      enableResearch: true,
      enableRag: false,
      enableBiasDetection: false,
      enableContentPipeline: false,
      enableDigitalTwin: false,
      enableMeetingIntelligence: false,
      maxAnglesPerRun: 8,
      maxIdeasPerAngle: 10,
      maxConcurrentUsers: 100,
    },
    dataIsolation: "shared" as const,
    apiKeyPrefix: "acme_",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active" as const,
  };
}

describe("white-label", () => {
  beforeEach(() => {
    clearWhiteLabelData();
  });

  it("registers and retrieves tenant", () => {
    registerTenant(makeTenantConfig());
    const tenant = getTenantConfig("acme");
    expect(tenant).toBeDefined();
    expect(tenant!.tenantId).toBe("acme");
    expect(tenant!.organizationName).toBe("Acme Corp");
  });

  it("listWhiteLabelTenants returns array with registered tenant", () => {
    registerTenant(makeTenantConfig("acme"));
    registerTenant(makeTenantConfig("beta"));
    const list = listWhiteLabelTenants();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(2);
  });

  it("updateTenant updates fields", () => {
    registerTenant(makeTenantConfig());
    const updated = updateTenant("acme", { organizationName: "Acme Inc" });
    expect(updated.organizationName).toBe("Acme Inc");
    expect(getTenantConfig("acme")!.organizationName).toBe("Acme Inc");
  });

  it("removeTenant works and returns false for non-existent", () => {
    registerTenant(makeTenantConfig());
    expect(removeTenant("acme")).toBe(true);
    expect(removeTenant("acme")).toBe(false);
    expect(removeTenant("non-existent")).toBe(false);
  });

  it("resolveTenant by domain", () => {
    registerTenant(makeTenantConfig());
    const result = resolveTenant({ hostname: "acme.innovator.app" });
    expect(result).toBeDefined();
    expect(result!.tenantId).toBe("acme");
    expect(result!.resolvedBy).toBe("domain");
  });

  it("resolveTenant by subdomain", () => {
    registerTenant(makeTenantConfig());
    const result = resolveTenant({ hostname: "acme.example.com" });
    expect(result).toBeDefined();
    expect(result!.resolvedBy).toBe("subdomain");
  });

  it("resolveTenant by header", () => {
    registerTenant(makeTenantConfig());
    const result = resolveTenant({ tenantHeader: "acme" });
    expect(result).toBeDefined();
    expect(result!.tenantId).toBe("acme");
    expect(result!.resolvedBy).toBe("header");
  });

  it("resolveTenant by API key prefix", () => {
    registerTenant(makeTenantConfig());
    const result = resolveTenant({ apiKeyPrefix: "acme_" });
    expect(result).toBeDefined();
    expect(result!.tenantId).toBe("acme");
    expect(result!.resolvedBy).toBe("apiKey");
  });

  it("resolveTenant returns default tenant when set", () => {
    registerTenant(makeTenantConfig("fallback"));
    setDefaultTenant("fallback");
    const result = resolveTenant({ hostname: "unknown.com" });
    expect(result).toBeDefined();
    expect(result!.tenantId).toBe("fallback");
    expect(result!.resolvedBy).toBe("default");
  });

  it("resolveTenant returns undefined when no match", () => {
    expect(resolveTenant({ hostname: "unknown.com" })).toBeUndefined();
  });

  it("isFeatureEnabled checks correctly", () => {
    registerTenant(makeTenantConfig());
    expect(isFeatureEnabled("acme", "enableCollaboration")).toBe(true);
    expect(isFeatureEnabled("acme", "enableGamification")).toBe(false);
  });

  it("applyTerminology replaces default terms with custom", () => {
    const config = makeTenantConfig();
    registerTenant(config);
    const text = applyTerminology("acme", "Some text about innovation");
    expect(typeof text).toBe("string");
  });

  it("generateBrandingCss includes CSS variables", () => {
    const branding = BrandingConfigSchema.parse({});
    const css = generateBrandingCss(branding);
    expect(typeof css).toBe("string");
    expect(css).toContain("--");
  });

  it("registerPartner, getPartner, listPartners work", () => {
    registerPartner({
      partnerId: "partner-1",
      companyName: "Partner Co",
      contactEmail: "contact@partner.co",
      tenants: [],
      plan: {
        id: "basic",
        name: "Basic",
        tier: "starter",
        priceMonthly: 99,
        priceCurrency: "USD",
        includedUsers: 10,
        includedApiCalls: 1000,
        revenueSharePercent: 10,
        features: {
          enableCollaboration: true,
          enableAnalytics: true,
          enableExport: true,
          enableCustomAngles: false,
          enableGamification: false,
          enableDebate: false,
          enableResearch: false,
          enableRag: false,
          enableBiasDetection: false,
          enableContentPipeline: false,
          enableDigitalTwin: false,
          enableMeetingIntelligence: false,
          maxAnglesPerRun: 5,
          maxIdeasPerAngle: 5,
          maxConcurrentUsers: 10,
        },
      },
      totalRevenue: 0,
      revenueShare: 0,
      joinedAt: new Date().toISOString(),
      status: "active",
    });
    expect(getPartner("partner-1")).toBeDefined();
    expect(getPartner("partner-1")!.companyName).toBe("Partner Co");
    expect(listPartners()).toHaveLength(1);
  });

  it("clearWhiteLabelData empties everything", () => {
    registerTenant(makeTenantConfig());
    clearWhiteLabelData();
    expect(listWhiteLabelTenants()).toHaveLength(0);
    expect(getTenantConfig("acme")).toBeUndefined();
  });

  it("setDefaultTenant throws for non-existent tenant", () => {
    expect(() => setDefaultTenant("non-existent")).toThrow();
  });

  it("TenantConfigSchema validates valid config", () => {
    const config = makeTenantConfig();
    const parsed = TenantConfigSchema.parse(config);
    expect(parsed.tenantId).toBe("acme");
  });
});
