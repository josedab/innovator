/**
 * @module marketplace/monetization
 *
 * Marketplace monetization: revenue sharing, pricing, creator earnings,
 * and security scanning for published plugins.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Types ----

export const PluginPricingSchema = z.object({
  pluginId: z.string().max(100),
  model: z.enum(["free", "one-time", "subscription", "usage-based"]),
  price: z.number().min(0).max(9999).default(0),
  currency: z.string().max(3).default("USD"),
  trialDays: z.number().int().min(0).max(90).default(0),
  revenueSharePercent: z.number().min(0).max(100).default(70),
});

export type PluginPricing = z.infer<typeof PluginPricingSchema>;

export interface CreatorEarnings {
  creatorId: string;
  totalEarnings: number;
  pendingPayout: number;
  lifetimeDownloads: number;
  activeSubscriptions: number;
  plugins: Array<{
    pluginId: string;
    name: string;
    downloads: number;
    revenue: number;
    rating: number;
  }>;
  payoutHistory: Array<{
    id: string;
    amount: number;
    currency: string;
    status: "pending" | "processing" | "completed" | "failed";
    createdAt: string;
  }>;
}

export interface PluginLicense {
  id: string;
  pluginId: string;
  userId: string;
  type: "free" | "purchased" | "subscription" | "trial";
  validUntil?: string;
  createdAt: string;
}

export interface SecurityScanResult {
  pluginId: string;
  version: string;
  scannedAt: string;
  status: "passed" | "warning" | "failed";
  issues: Array<{
    severity: "info" | "low" | "medium" | "high" | "critical";
    type: string;
    description: string;
    file?: string;
    line?: number;
  }>;
  score: number;
}

// ---- In-Memory Stores ----

const pricingStore = new Map<string, PluginPricing>();
const licensesStore = new Map<string, PluginLicense[]>();
const earningsStore = new Map<string, CreatorEarnings>();
const scanResults = new Map<string, SecurityScanResult>();

// ---- Pricing Management ----

export function setPluginPricing(pricing: PluginPricing): PluginPricing {
  const validated = PluginPricingSchema.parse(pricing);
  pricingStore.set(validated.pluginId, validated);
  return validated;
}

export function getPluginPricing(pluginId: string): PluginPricing | undefined {
  return pricingStore.get(pluginId);
}

// ---- License Management ----

export function grantLicense(
  pluginId: string,
  userId: string,
  type: PluginLicense["type"],
  durationDays?: number
): PluginLicense {
  const license: PluginLicense = {
    id: randomUUID(),
    pluginId,
    userId,
    type,
    validUntil: durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
  };

  const userLicenses = licensesStore.get(userId) ?? [];
  userLicenses.push(license);
  licensesStore.set(userId, userLicenses);

  return license;
}

export function checkLicense(
  pluginId: string,
  userId: string
): {
  valid: boolean;
  license?: PluginLicense;
  reason?: string;
} {
  // Free plugins always accessible
  const pricing = pricingStore.get(pluginId);
  if (!pricing || pricing.model === "free") {
    return { valid: true };
  }

  const userLicenses = licensesStore.get(userId) ?? [];
  const license = userLicenses.find((l) => l.pluginId === pluginId);

  if (!license) {
    return { valid: false, reason: "No license found" };
  }

  if (license.validUntil && new Date(license.validUntil) < new Date()) {
    return { valid: false, license, reason: "License expired" };
  }

  return { valid: true, license };
}

// ---- Creator Earnings ----

export function getCreatorEarnings(creatorId: string): CreatorEarnings {
  return (
    earningsStore.get(creatorId) ?? {
      creatorId,
      totalEarnings: 0,
      pendingPayout: 0,
      lifetimeDownloads: 0,
      activeSubscriptions: 0,
      plugins: [],
      payoutHistory: [],
    }
  );
}

export function recordPurchase(
  pluginId: string,
  pluginName: string,
  creatorId: string,
  amount: number
): void {
  const earnings = getCreatorEarnings(creatorId);
  const pricing = pricingStore.get(pluginId);
  const sharePercent = pricing?.revenueSharePercent ?? 70;
  const creatorShare = amount * (sharePercent / 100);

  earnings.totalEarnings += creatorShare;
  earnings.pendingPayout += creatorShare;
  earnings.lifetimeDownloads++;

  const pluginEntry = earnings.plugins.find((p) => p.pluginId === pluginId);
  if (pluginEntry) {
    pluginEntry.downloads++;
    pluginEntry.revenue += creatorShare;
  } else {
    earnings.plugins.push({
      pluginId,
      name: pluginName,
      downloads: 1,
      revenue: creatorShare,
      rating: 0,
    });
  }

  earningsStore.set(creatorId, earnings);
}

// ---- Security Scanning ----

/**
 * Scan plugin code for security issues (static analysis).
 */
export function scanPlugin(pluginId: string, version: string, code: string): SecurityScanResult {
  const issues: SecurityScanResult["issues"] = [];

  // Check for dangerous patterns
  const dangerousPatterns: Array<{
    pattern: RegExp;
    type: string;
    severity: SecurityScanResult["issues"][0]["severity"];
    description: string;
  }> = [
    {
      pattern: /eval\s*\(/g,
      type: "code-injection",
      severity: "critical",
      description: "Use of eval() detected — potential code injection vulnerability",
    },
    {
      pattern: /Function\s*\(/g,
      type: "code-injection",
      severity: "high",
      description: "Dynamic Function constructor detected",
    },
    {
      pattern: /child_process/g,
      type: "command-injection",
      severity: "high",
      description: "child_process import detected — verify command injection safety",
    },
    {
      pattern: /process\.env\[/g,
      type: "env-access",
      severity: "medium",
      description: "Dynamic environment variable access detected",
    },
    {
      pattern: /require\s*\(\s*[^'"]/g,
      type: "dynamic-require",
      severity: "medium",
      description: "Dynamic require detected — could load unexpected modules",
    },
    {
      pattern: /fs\.(write|unlink|rmdir|rm)/g,
      type: "fs-write",
      severity: "medium",
      description: "File system write/delete operation detected",
    },
    {
      pattern: /https?:\/\/[^\s'"]+/g,
      type: "network-access",
      severity: "low",
      description: "Hardcoded URL detected — verify it's not calling home",
    },
    {
      pattern: /password|secret|api.?key|token/gi,
      type: "credential-leak",
      severity: "high",
      description: "Potential credential reference detected",
    },
  ];

  const lines = code.split("\n");
  for (const { pattern, type, severity, description } of dangerousPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split("\n").length;
      issues.push({ severity, type, description, line: lineNum });
    }
  }

  // Check code size
  if (code.length > 500_000) {
    issues.push({
      severity: "medium",
      type: "code-size",
      description: `Plugin code is very large (${Math.round(code.length / 1024)}KB) — review for bundled dependencies`,
    });
  }

  // Check for minified code (potential obfuscation)
  const avgLineLength = code.length / lines.length;
  if (avgLineLength > 500) {
    issues.push({
      severity: "medium",
      type: "obfuscation",
      description: "Code appears minified/obfuscated — source may be hard to review",
    });
  }

  const criticalCount = issues.filter(
    (i) => i.severity === "critical" || i.severity === "high"
  ).length;
  const score = Math.max(0, 100 - criticalCount * 25 - issues.length * 5);
  const status: SecurityScanResult["status"] =
    criticalCount > 0 ? "failed" : issues.length > 3 ? "warning" : "passed";

  const result: SecurityScanResult = {
    pluginId,
    version,
    scannedAt: new Date().toISOString(),
    status,
    issues,
    score,
  };

  scanResults.set(pluginId, result);
  return result;
}

export function getScanResult(pluginId: string): SecurityScanResult | undefined {
  return scanResults.get(pluginId);
}

export function clearMonetizationData(): void {
  pricingStore.clear();
  licensesStore.clear();
  earningsStore.clear();
  scanResults.clear();
}
