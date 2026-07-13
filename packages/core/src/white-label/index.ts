/**
 * @module white-label
 *
 * Enables organizations and consultancies to deploy Innovator as
 * their own branded product. Provides tenant configuration (branding,
 * terminology mapping, feature toggles, custom domains, data isolation),
 * white-label runtime with middleware for tenant resolution, and
 * partner portal types for self-service management.
 */

import { z } from "zod";
import { ValidationError } from "../errors.js";

// ---- Branding Configuration ----

export const BrandingConfigSchema = z.object({
  logo: z.string().max(1000).optional().describe("URL or data URI for logo"),
  logoAlt: z.string().max(200).optional(),
  favicon: z.string().max(1000).optional(),
  primaryColor: z.string().max(20).default("#2563eb"),
  secondaryColor: z.string().max(20).default("#7c3aed"),
  accentColor: z.string().max(20).default("#06b6d4"),
  backgroundColor: z.string().max(20).default("#ffffff"),
  textColor: z.string().max(20).default("#1f2937"),
  fontFamily: z.string().max(200).default("Inter, system-ui, sans-serif"),
  borderRadius: z.string().max(20).default("0.5rem"),
  productName: z.string().max(200).default("Innovator"),
  tagline: z.string().max(500).optional(),
  copyrightText: z.string().max(500).optional(),
  customCss: z.string().max(50_000).optional(),
});

export type BrandingConfig = z.infer<typeof BrandingConfigSchema>;

// ---- Terminology Mapping ----

export const TerminologyMapSchema = z.object({
  investigation: z.string().max(100).default("Investigation"),
  angle: z.string().max(100).default("Angle"),
  idea: z.string().max(100).default("Idea"),
  pipeline: z.string().max(100).default("Pipeline"),
  synthesis: z.string().max(100).default("Synthesis"),
  artifact: z.string().max(100).default("Artifact"),
  score: z.string().max(100).default("Score"),
  subject: z.string().max(100).default("Subject"),
  innovation: z.string().max(100).default("Innovation"),
  workspace: z.string().max(100).default("Workspace"),
});

export type TerminologyMap = z.infer<typeof TerminologyMapSchema>;

// ---- Feature Toggles ----

export const FeatureTogglesSchema = z.object({
  enableCollaboration: z.boolean().default(true),
  enableAnalytics: z.boolean().default(true),
  enableExport: z.boolean().default(true),
  enableCustomAngles: z.boolean().default(true),
  enableGamification: z.boolean().default(false),
  enableDebate: z.boolean().default(true),
  enableResearch: z.boolean().default(true),
  enableRag: z.boolean().default(false),
  enableBiasDetection: z.boolean().default(false),
  enableContentPipeline: z.boolean().default(false),
  enableDigitalTwin: z.boolean().default(false),
  enableMeetingIntelligence: z.boolean().default(false),
  maxAnglesPerRun: z.number().int().min(1).max(50).default(8),
  maxIdeasPerAngle: z.number().int().min(1).max(100).default(10),
  maxConcurrentUsers: z.number().int().min(1).max(10_000).default(100),
  customFeatures: z.record(z.string().max(100), z.boolean()).optional(),
});

export type FeatureToggles = z.infer<typeof FeatureTogglesSchema>;

// ---- Tenant Configuration ----

export const TenantConfigSchema = z.object({
  tenantId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Tenant ID must be lowercase alphanumeric with hyphens"),
  organizationName: z.string().max(300),
  customDomain: z.string().max(300).optional(),
  branding: BrandingConfigSchema,
  terminology: TerminologyMapSchema.optional(),
  features: FeatureTogglesSchema,
  dataIsolation: z.enum(["shared", "isolated", "dedicated"]).default("shared"),
  defaultModel: z.string().max(100).optional(),
  allowedModels: z.array(z.string().max(100)).max(20).optional(),
  apiKeyPrefix: z.string().max(20).optional(),
  webhookUrl: z.string().max(1000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["active", "suspended", "trial", "cancelled"]).default("active"),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

// ---- Billing / Revenue Sharing ----

export const BillingPlanSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  tier: z.enum(["free", "starter", "professional", "enterprise"]),
  priceMonthly: z.number().min(0),
  priceCurrency: z.string().max(10).default("USD"),
  includedUsers: z.number().int().min(0),
  includedApiCalls: z.number().int().min(0),
  revenueSharePercent: z.number().min(0).max(100).default(0),
  features: FeatureTogglesSchema,
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const PartnerProfileSchema = z.object({
  partnerId: z.string().max(100),
  companyName: z.string().max(300),
  contactEmail: z.string().max(300),
  tenants: z.array(z.string().max(100)).max(100),
  plan: BillingPlanSchema,
  totalRevenue: z.number().min(0).default(0),
  revenueShare: z.number().min(0).default(0),
  joinedAt: z.string(),
  status: z.enum(["active", "pending", "suspended"]).default("pending"),
});

export type PartnerProfile = z.infer<typeof PartnerProfileSchema>;

// ---- Tenant Resolution ----

export interface TenantResolutionResult {
  tenantId: string;
  config: TenantConfig;
  resolvedBy: "domain" | "header" | "apiKey" | "subdomain" | "default";
}

// ---- In-Memory Store ----

/** Instance-owned white-label tenant, domain, and partner state. */
export class WhiteLabelContext {
  private readonly tenants = new Map<string, TenantConfig>();
  private readonly partners = new Map<string, PartnerProfile>();
  private readonly domainIndex = new Map<string, string>();
  private defaultTenantId: string | undefined;

  registerTenant(config: TenantConfig): void {
    TenantConfigSchema.parse(config);

    if (config.customDomain) {
      const existingTenant = this.domainIndex.get(config.customDomain);
      if (existingTenant && existingTenant !== config.tenantId) {
        throw new ValidationError(
          `Domain "${config.customDomain}" is already registered to tenant "${existingTenant}"`
        );
      }
    }

    this.tenants.set(config.tenantId, config);
    if (config.customDomain) {
      this.domainIndex.set(config.customDomain, config.tenantId);
    }
  }

  updateTenant(tenantId: string, updates: Partial<TenantConfig>): TenantConfig {
    const existing = this.tenants.get(tenantId);
    if (!existing) throw new ValidationError(`Tenant not found: ${tenantId}`);

    if (updates.customDomain && updates.customDomain !== existing.customDomain) {
      const existingOwner = this.domainIndex.get(updates.customDomain);
      if (existingOwner && existingOwner !== tenantId) {
        throw new ValidationError(
          `Domain "${updates.customDomain}" is already registered to tenant "${existingOwner}"`
        );
      }
    }

    if (existing.customDomain) this.domainIndex.delete(existing.customDomain);

    const updated = { ...existing, ...updates, tenantId, updatedAt: new Date().toISOString() };
    TenantConfigSchema.parse(updated);
    this.tenants.set(tenantId, updated);

    if (updated.customDomain) {
      this.domainIndex.set(updated.customDomain, tenantId);
    }

    return updated;
  }

  getTenantConfig(tenantId: string): TenantConfig | undefined {
    return this.tenants.get(tenantId);
  }

  listWhiteLabelTenants(): TenantConfig[] {
    return Array.from(this.tenants.values());
  }

  removeTenant(tenantId: string): boolean {
    const config = this.tenants.get(tenantId);
    if (config?.customDomain) this.domainIndex.delete(config.customDomain);
    return this.tenants.delete(tenantId);
  }

  setDefaultTenant(tenantId: string): void {
    if (!this.tenants.has(tenantId)) throw new ValidationError(`Tenant not found: ${tenantId}`);
    this.defaultTenantId = tenantId;
  }

  resolveTenant(context: {
    hostname?: string;
    tenantHeader?: string;
    apiKeyPrefix?: string;
  }): TenantResolutionResult | undefined {
    if (context.hostname) {
      const tenantId = this.domainIndex.get(context.hostname);
      if (tenantId) {
        const config = this.tenants.get(tenantId);
        if (config && config.status === "active") {
          return { tenantId, config, resolvedBy: "domain" };
        }
      }
      const subdomain = context.hostname.split(".")[0];
      if (subdomain && this.tenants.has(subdomain)) {
        const config = this.tenants.get(subdomain)!;
        if (config.status === "active") {
          return { tenantId: subdomain, config, resolvedBy: "subdomain" };
        }
      }
    }

    if (context.tenantHeader) {
      const config = this.tenants.get(context.tenantHeader);
      if (config && config.status === "active") {
        return { tenantId: context.tenantHeader, config, resolvedBy: "header" };
      }
    }

    if (context.apiKeyPrefix) {
      for (const [id, config] of this.tenants) {
        if (
          config.apiKeyPrefix &&
          context.apiKeyPrefix.startsWith(config.apiKeyPrefix) &&
          config.status === "active"
        ) {
          return { tenantId: id, config, resolvedBy: "apiKey" };
        }
      }
    }

    if (this.defaultTenantId) {
      const config = this.tenants.get(this.defaultTenantId);
      if (config && config.status === "active") {
        return { tenantId: this.defaultTenantId, config, resolvedBy: "default" };
      }
    }

    return undefined;
  }

  isFeatureEnabled(tenantId: string, feature: keyof FeatureToggles): boolean {
    const config = this.tenants.get(tenantId);
    if (!config) return false;
    const value = config.features[feature];
    return typeof value === "boolean" ? value : false;
  }

  applyTerminology(tenantId: string, text: string): string {
    const config = this.tenants.get(tenantId);
    if (!config?.terminology) return text;

    let result = text;
    const map = config.terminology;
    const defaultTerms: TerminologyMap = {
      investigation: "Investigation",
      angle: "Angle",
      idea: "Idea",
      pipeline: "Pipeline",
      synthesis: "Synthesis",
      artifact: "Artifact",
      score: "Score",
      subject: "Subject",
      innovation: "Innovation",
      workspace: "Workspace",
    };

    const entries = Object.entries(defaultTerms).sort(([, a], [, b]) => b.length - a.length);

    for (const [key, defaultTerm] of entries) {
      const customTerm = map[key as keyof TerminologyMap];
      if (customTerm && customTerm !== defaultTerm) {
        const escaped = defaultTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escaped}\\b`, "g");
        const patternLower = new RegExp(`\\b${escaped.toLowerCase()}\\b`, "g");
        result = result.replace(pattern, customTerm);
        result = result.replace(patternLower, customTerm.toLowerCase());
      }
    }

    return result;
  }

  registerPartner(profile: PartnerProfile): void {
    PartnerProfileSchema.parse(profile);
    this.partners.set(profile.partnerId, profile);
  }

  getPartner(partnerId: string): PartnerProfile | undefined {
    return this.partners.get(partnerId);
  }

  listPartners(): PartnerProfile[] {
    return Array.from(this.partners.values());
  }

  clearWhiteLabelData(): void {
    this.tenants.clear();
    this.partners.clear();
    this.domainIndex.clear();
    this.defaultTenantId = undefined;
  }
}

export const defaultWhiteLabelContext = new WhiteLabelContext();

// ---- Functions ----

/** Register a new tenant configuration. */
export function registerTenant(config: TenantConfig): void {
  defaultWhiteLabelContext.registerTenant(config);
}

/** Update an existing tenant configuration. */
export function updateTenant(tenantId: string, updates: Partial<TenantConfig>): TenantConfig {
  return defaultWhiteLabelContext.updateTenant(tenantId, updates);
}

/** Get a tenant configuration. */
export function getTenantConfig(tenantId: string): TenantConfig | undefined {
  return defaultWhiteLabelContext.getTenantConfig(tenantId);
}

/** List all tenants. */
export function listWhiteLabelTenants(): TenantConfig[] {
  return defaultWhiteLabelContext.listWhiteLabelTenants();
}

/** Remove a tenant. */
export function removeTenant(tenantId: string): boolean {
  return defaultWhiteLabelContext.removeTenant(tenantId);
}

/** Set the default tenant for requests that don't match any specific tenant. */
export function setDefaultTenant(tenantId: string): void {
  defaultWhiteLabelContext.setDefaultTenant(tenantId);
}

/** Resolve a tenant from request context. Priority: domain → header → apiKey → default. */
export function resolveTenant(context: {
  hostname?: string;
  tenantHeader?: string;
  apiKeyPrefix?: string;
}): TenantResolutionResult | undefined {
  return defaultWhiteLabelContext.resolveTenant(context);
}

/** Check if a feature is enabled for a tenant. */
export function isFeatureEnabled(tenantId: string, feature: keyof FeatureToggles): boolean {
  return defaultWhiteLabelContext.isFeatureEnabled(tenantId, feature);
}

/** Apply terminology mapping to a string using word-boundary matching. */
export function applyTerminology(tenantId: string, text: string): string {
  return defaultWhiteLabelContext.applyTerminology(tenantId, text);
}

/** Generate CSS variables from branding config. */
export function generateBrandingCss(branding: BrandingConfig): string {
  return `:root {
  --brand-primary: ${branding.primaryColor};
  --brand-secondary: ${branding.secondaryColor};
  --brand-accent: ${branding.accentColor};
  --brand-bg: ${branding.backgroundColor};
  --brand-text: ${branding.textColor};
  --brand-font: ${branding.fontFamily};
  --brand-radius: ${branding.borderRadius};
}
${branding.customCss ?? ""}`;
}

// ---- Partner Functions ----

/** Register a partner profile. */
export function registerPartner(profile: PartnerProfile): void {
  defaultWhiteLabelContext.registerPartner(profile);
}

/** Get a partner profile. */
export function getPartner(partnerId: string): PartnerProfile | undefined {
  return defaultWhiteLabelContext.getPartner(partnerId);
}

/** List all partners. */
export function listPartners(): PartnerProfile[] {
  return defaultWhiteLabelContext.listPartners();
}

/** Clear all white-label data. */
export function clearWhiteLabelData(): void {
  defaultWhiteLabelContext.clearWhiteLabelData();
}
