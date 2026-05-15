/**
 * @module rbac/soc2-tracker
 *
 * SOC 2 readiness tracker with control mapping, data residency controls,
 * retention policies, IP allow/deny lists, DLP policies, and custom branding.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- SOC 2 Controls ----

export const SOC2CategorySchema = z.enum([
  "security",
  "availability",
  "processing-integrity",
  "confidentiality",
  "privacy",
]);
export type SOC2Category = z.infer<typeof SOC2CategorySchema>;

export const SOC2ControlStatusSchema = z.enum([
  "not-started",
  "in-progress",
  "implemented",
  "tested",
  "verified",
  "non-compliant",
]);
export type SOC2ControlStatus = z.infer<typeof SOC2ControlStatusSchema>;

export const SOC2ControlSchema = z.object({
  id: z.string().max(100),
  category: SOC2CategorySchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  status: SOC2ControlStatusSchema,
  evidence: z.array(z.string().max(500)).max(20),
  owner: z.string().max(200).optional(),
  dueDate: z.string().optional(),
  lastReviewedAt: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
export type SOC2Control = z.infer<typeof SOC2ControlSchema>;

export const SOC2ReadinessSchema = z.object({
  id: z.string().max(200),
  tenantId: z.string().max(200),
  controls: z.array(SOC2ControlSchema).max(100),
  overallReadiness: z.number().min(0).max(100),
  categoryScores: z.record(SOC2CategorySchema, z.number().min(0).max(100)),
  lastUpdatedAt: z.string(),
  targetDate: z.string().optional(),
});
export type SOC2Readiness = z.infer<typeof SOC2ReadinessSchema>;

// ---- Data Residency ----

export const DataResidencyRegionSchema = z.enum(["us", "eu", "apac", "custom"]);
export type DataResidencyRegion = z.infer<typeof DataResidencyRegionSchema>;

export const DataResidencyPolicySchema = z.object({
  tenantId: z.string().max(200),
  primaryRegion: DataResidencyRegionSchema,
  allowedRegions: z.array(DataResidencyRegionSchema).max(10),
  encryptionKeyRegion: DataResidencyRegionSchema,
  crossBorderTransferEnabled: z.boolean().default(false),
  dataProcessingAgreement: z.boolean().default(false),
  updatedAt: z.string(),
});
export type DataResidencyPolicy = z.infer<typeof DataResidencyPolicySchema>;

// ---- Retention Policies ----

export const RetentionPolicySchema = z.object({
  tenantId: z.string().max(200),
  sessionRetentionDays: z.number().int().min(1).max(3650).default(365),
  auditLogRetentionDays: z.number().int().min(30).max(3650).default(730),
  analyticsRetentionDays: z.number().int().min(30).max(3650).default(365),
  deletedDataPurgeDays: z.number().int().min(1).max(90).default(30),
  autoArchiveAfterDays: z.number().int().min(30).max(3650).optional(),
  updatedAt: z.string(),
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

// ---- IP Allow/Deny Lists ----

export const IPRuleSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["allow", "deny"]),
  cidr: z.string().max(100),
  description: z.string().max(500).optional(),
  createdAt: z.string(),
});
export type IPRule = z.infer<typeof IPRuleSchema>;

export const IPPolicySchema = z.object({
  tenantId: z.string().max(200),
  enabled: z.boolean().default(false),
  defaultAction: z.enum(["allow", "deny"]).default("allow"),
  rules: z.array(IPRuleSchema).max(100),
  updatedAt: z.string(),
});
export type IPPolicy = z.infer<typeof IPPolicySchema>;

// ---- DLP Policies ----

export const DLPRuleTypeSchema = z.enum([
  "pii-detection",
  "credit-card",
  "api-key",
  "custom-pattern",
  "keyword-block",
]);
export type DLPRuleType = z.infer<typeof DLPRuleTypeSchema>;

export const DLPRuleSchema = z.object({
  id: z.string().max(200),
  type: DLPRuleTypeSchema,
  name: z.string().max(200),
  pattern: z.string().max(2000).optional(),
  action: z.enum(["block", "redact", "warn", "log"]),
  enabled: z.boolean().default(true),
});
export type DLPRule = z.infer<typeof DLPRuleSchema>;

export const DLPPolicySchema = z.object({
  tenantId: z.string().max(200),
  enabled: z.boolean().default(false),
  rules: z.array(DLPRuleSchema).max(50),
  scanInputs: z.boolean().default(true),
  scanOutputs: z.boolean().default(true),
  updatedAt: z.string(),
});
export type DLPPolicy = z.infer<typeof DLPPolicySchema>;

// ---- Custom Branding ----

export const BrandingConfigSchema = z.object({
  tenantId: z.string().max(200),
  companyName: z.string().max(200).optional(),
  logoUrl: z.string().max(2000).optional(),
  faviconUrl: z.string().max(2000).optional(),
  primaryColor: z.string().max(50).optional(),
  accentColor: z.string().max(50).optional(),
  customCSS: z.string().max(10000).optional(),
  emailFromName: z.string().max(200).optional(),
  emailFromAddress: z.string().max(200).optional(),
  supportUrl: z.string().max(2000).optional(),
  updatedAt: z.string(),
});
export type BrandingConfig = z.infer<typeof BrandingConfigSchema>;

// ---- In-Memory Stores ----

const soc2Readiness = new Map<string, SOC2Readiness>();
const residencyPolicies = new Map<string, DataResidencyPolicy>();
const retentionPolicies = new Map<string, RetentionPolicy>();
const ipPolicies = new Map<string, IPPolicy>();
const dlpPolicies = new Map<string, DLPPolicy>();
const brandingConfigs = new Map<string, BrandingConfig>();

// ---- SOC 2 Functions ----

const DEFAULT_CONTROLS: Omit<SOC2Control, "status" | "evidence">[] = [
  {
    id: "CC1.1",
    category: "security",
    title: "Security Policy",
    description: "Organization has defined and communicated security policies.",
  },
  {
    id: "CC1.2",
    category: "security",
    title: "Access Controls",
    description: "Logical access is restricted to authorized users.",
  },
  {
    id: "CC1.3",
    category: "security",
    title: "MFA Enforcement",
    description: "Multi-factor authentication is required for all users.",
  },
  {
    id: "CC2.1",
    category: "availability",
    title: "Uptime SLA",
    description: "System availability meets defined SLA targets.",
  },
  {
    id: "CC2.2",
    category: "availability",
    title: "Disaster Recovery",
    description: "Disaster recovery plan is documented and tested.",
  },
  {
    id: "CC3.1",
    category: "processing-integrity",
    title: "Data Validation",
    description: "Input data is validated before processing.",
  },
  {
    id: "CC3.2",
    category: "processing-integrity",
    title: "Error Handling",
    description: "Processing errors are detected and corrected.",
  },
  {
    id: "CC4.1",
    category: "confidentiality",
    title: "Encryption at Rest",
    description: "Sensitive data is encrypted at rest.",
  },
  {
    id: "CC4.2",
    category: "confidentiality",
    title: "Encryption in Transit",
    description: "Data is encrypted in transit using TLS.",
  },
  {
    id: "CC5.1",
    category: "privacy",
    title: "Privacy Notice",
    description: "Privacy notice is published and accessible.",
  },
  {
    id: "CC5.2",
    category: "privacy",
    title: "Data Retention",
    description: "Data retention policies are defined and enforced.",
  },
  {
    id: "CC5.3",
    category: "privacy",
    title: "Right to Delete",
    description: "Users can request deletion of their data.",
  },
];

export function initSOC2Tracker(tenantId: string): SOC2Readiness {
  const controls: SOC2Control[] = DEFAULT_CONTROLS.map((c) => ({
    ...c,
    status: "not-started",
    evidence: [],
  }));

  const readiness: SOC2Readiness = {
    id: `soc2-${randomUUID().slice(0, 12)}`,
    tenantId,
    controls,
    overallReadiness: 0,
    categoryScores: {
      security: 0,
      availability: 0,
      "processing-integrity": 0,
      confidentiality: 0,
      privacy: 0,
    },
    lastUpdatedAt: new Date().toISOString(),
  };

  soc2Readiness.set(tenantId, readiness);
  return readiness;
}

export function getSOC2Readiness(tenantId: string): SOC2Readiness | undefined {
  return soc2Readiness.get(tenantId);
}

export function updateSOC2Control(
  tenantId: string,
  controlId: string,
  updates: Partial<Pick<SOC2Control, "status" | "evidence" | "owner" | "notes">>
): SOC2Readiness | undefined {
  const readiness = soc2Readiness.get(tenantId);
  if (!readiness) return undefined;

  const control = readiness.controls.find((c) => c.id === controlId);
  if (!control) return undefined;

  if (updates.status) control.status = updates.status;
  if (updates.evidence) control.evidence = updates.evidence;
  if (updates.owner) control.owner = updates.owner;
  if (updates.notes) control.notes = updates.notes;
  control.lastReviewedAt = new Date().toISOString();

  // Recalculate scores
  const statusScores: Record<SOC2ControlStatus, number> = {
    "not-started": 0,
    "in-progress": 20,
    implemented: 50,
    tested: 75,
    verified: 100,
    "non-compliant": 0,
  };

  const categories = [
    "security",
    "availability",
    "processing-integrity",
    "confidentiality",
    "privacy",
  ] as const;
  for (const cat of categories) {
    const catControls = readiness.controls.filter((c) => c.category === cat);
    if (catControls.length === 0) continue;
    const catScore =
      catControls.reduce((sum, c) => sum + statusScores[c.status], 0) / catControls.length;
    readiness.categoryScores[cat] = Math.round(catScore);
  }

  readiness.overallReadiness = Math.round(
    readiness.controls.reduce((sum, c) => sum + statusScores[c.status], 0) /
      readiness.controls.length
  );
  readiness.lastUpdatedAt = new Date().toISOString();

  return readiness;
}

// ---- Policy Management ----

export function setDataResidencyPolicy(policy: DataResidencyPolicy): void {
  residencyPolicies.set(policy.tenantId, DataResidencyPolicySchema.parse(policy));
}

export function getDataResidencyPolicy(tenantId: string): DataResidencyPolicy | undefined {
  return residencyPolicies.get(tenantId);
}

export function setRetentionPolicy(policy: RetentionPolicy): void {
  retentionPolicies.set(policy.tenantId, RetentionPolicySchema.parse(policy));
}

export function getRetentionPolicy(tenantId: string): RetentionPolicy | undefined {
  return retentionPolicies.get(tenantId);
}

export function setIPPolicy(policy: IPPolicy): void {
  ipPolicies.set(policy.tenantId, IPPolicySchema.parse(policy));
}

export function getIPPolicy(tenantId: string): IPPolicy | undefined {
  return ipPolicies.get(tenantId);
}

export function checkIPAccess(tenantId: string, ipAddress: string): boolean {
  const policy = ipPolicies.get(tenantId);
  if (!policy || !policy.enabled) return true;

  for (const rule of policy.rules) {
    const [cidrBase, maskStr] = rule.cidr.split("/");
    const mask = maskStr ? parseInt(maskStr, 10) : 32;
    // Simplified CIDR matching by prefix octets
    const octetsToMatch = Math.max(1, Math.floor(mask / 8));
    const ruleOctets = cidrBase.split(".").slice(0, octetsToMatch).join(".");
    const ipOctets = ipAddress.split(".").slice(0, octetsToMatch).join(".");
    if (ipOctets === ruleOctets) {
      return rule.type === "allow";
    }
  }

  return policy.defaultAction === "allow";
}

export function setDLPPolicy(policy: DLPPolicy): void {
  dlpPolicies.set(policy.tenantId, DLPPolicySchema.parse(policy));
}

export function getDLPPolicy(tenantId: string): DLPPolicy | undefined {
  return dlpPolicies.get(tenantId);
}

export function scanForDLPViolations(
  tenantId: string,
  text: string
): Array<{ ruleId: string; ruleName: string; action: string; match: string }> {
  const policy = dlpPolicies.get(tenantId);
  if (!policy || !policy.enabled) return [];

  const violations: Array<{
    ruleId: string;
    ruleName: string;
    action: string;
    match: string;
  }> = [];

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;

    let found = false;
    let match = "";

    switch (rule.type) {
      case "credit-card": {
        const ccRegex = /\b(?:\d[ -]*?){13,16}\b/;
        const ccMatch = ccRegex.exec(text);
        if (ccMatch) {
          found = true;
          match = ccMatch[0];
        }
        break;
      }
      case "api-key": {
        const keyRegex = /(?:sk|pk|api|key|token|secret)[_-]?[a-zA-Z0-9]{20,}/i;
        const keyMatch = keyRegex.exec(text);
        if (keyMatch) {
          found = true;
          match = keyMatch[0];
        }
        break;
      }
      case "pii-detection": {
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
        const emailMatch = emailRegex.exec(text);
        const ssnMatch = ssnRegex.exec(text);
        if (emailMatch || ssnMatch) {
          found = true;
          match = emailMatch?.[0] ?? ssnMatch?.[0] ?? "";
        }
        break;
      }
      case "custom-pattern": {
        if (rule.pattern) {
          try {
            const regex = new RegExp(rule.pattern);
            const customMatch = regex.exec(text);
            if (customMatch) {
              found = true;
              match = customMatch[0];
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
        break;
      }
      case "keyword-block": {
        if (rule.pattern) {
          const keywords = rule.pattern.split(",").map((k) => k.trim().toLowerCase());
          const textLower = text.toLowerCase();
          for (const kw of keywords) {
            if (textLower.includes(kw)) {
              found = true;
              match = kw;
              break;
            }
          }
        }
        break;
      }
    }

    if (found) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        match: match.slice(0, 100),
      });
    }
  }

  return violations;
}

// ---- Branding ----

export function setBrandingConfig(config: BrandingConfig): void {
  brandingConfigs.set(config.tenantId, BrandingConfigSchema.parse(config));
}

export function getBrandingConfig(tenantId: string): BrandingConfig | undefined {
  return brandingConfigs.get(tenantId);
}

// ---- Cleanup ----

export function clearEnterpriseData(): void {
  soc2Readiness.clear();
  residencyPolicies.clear();
  retentionPolicies.clear();
  ipPolicies.clear();
  dlpPolicies.clear();
  brandingConfigs.clear();
}
