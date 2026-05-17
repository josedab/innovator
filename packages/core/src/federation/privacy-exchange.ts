import { randomUUID } from "node:crypto";
import { z } from "zod";

const QueryRecordSchema = z.object({
  id: z.string(),
  queryType: z.string().max(200),
  epsilonCost: z.number().min(0),
  timestamp: z.string(),
});
const PatternSchema = z.object({
  name: z.string().max(200),
  frequency: z.number(),
  anonymizedSource: z.string().max(500),
});

// Privacy budget management
export const PrivacyBudgetSchema = z.object({
  organizationId: z.string(),
  totalBudget: z.number().min(0),
  usedBudget: z.number().min(0),
  queries: z.array(QueryRecordSchema).max(10000),
  resetAt: z.string(),
});
export type PrivacyBudget = z.infer<typeof PrivacyBudgetSchema>;

// Anonymized pattern bundle
export const PatternBundleSchema = z.object({
  id: z.string(),
  domain: z.string().max(500),
  patterns: z.array(PatternSchema).max(100),
  noiseLevel: z.number().min(0).max(1),
  generatedAt: z.string(),
});
export type PatternBundle = z.infer<typeof PatternBundleSchema>;

// Licensable playbook
export const PlaybookSchema = z.object({
  id: z.string().max(500),
  title: z.string().max(500),
  description: z.string().max(2000),
  domain: z.string().max(500),
  angles: z.array(z.string().max(200)).max(20),
  methodology: z.string().max(5000),
  price: z.number().min(0),
  currency: z.string().max(10).default("USD"),
  creatorOrgId: z.string(),
  licensedTo: z.array(z.string()).max(1000),
  createdAt: z.string(),
});
export type Playbook = z.infer<typeof PlaybookSchema>;

// Audit log
export const AuditEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  action: z.enum(["query", "export-bundle", "import-bundle", "license-playbook", "budget-reset"]),
  detail: z.string().max(1000),
  epsilonSpent: z.number().min(0).optional(),
  timestamp: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

const budgets = new Map<string, PrivacyBudget>();
const bundles = new Map<string, PatternBundle>();
const playbooks = new Map<string, Playbook>();
const auditLog: AuditEntry[] = [];

function nextResetAt(): string {
  const reset = new Date();
  reset.setUTCDate(reset.getUTCDate() + 30);
  reset.setUTCHours(0, 0, 0, 0);
  return reset.toISOString();
}

function now(): string {
  return new Date().toISOString();
}

function cloneBudget(budget: PrivacyBudget): PrivacyBudget {
  return PrivacyBudgetSchema.parse(budget);
}

function cloneBundle(bundle: PatternBundle): PatternBundle {
  return PatternBundleSchema.parse(bundle);
}

function clonePlaybook(playbook: Playbook): Playbook {
  return PlaybookSchema.parse(playbook);
}

function autoResetBudgetIfNeeded(orgId: string): void {
  const budget = budgets.get(orgId);
  if (!budget) return;
  if (new Date(budget.resetAt).getTime() > Date.now()) return;

  budgets.set(
    orgId,
    PrivacyBudgetSchema.parse({
      ...budget,
      usedBudget: 0,
      queries: [],
      resetAt: nextResetAt(),
    })
  );
}

// Audit
export function logAuditEntry(
  orgId: string,
  action: AuditEntry["action"],
  detail: string,
  epsilon?: number
): AuditEntry {
  const entry = AuditEntrySchema.parse({
    id: randomUUID(),
    organizationId: orgId,
    action,
    detail: detail.trim(),
    epsilonSpent: epsilon,
    timestamp: now(),
  });
  auditLog.push(entry);
  return AuditEntrySchema.parse(entry);
}

export function getAuditLog(orgId?: string): AuditEntry[] {
  return auditLog
    .filter((entry) => !orgId || entry.organizationId === orgId)
    .map((entry) => AuditEntrySchema.parse(entry));
}

// Privacy budget
export function initializePrivacyBudget(orgId: string, totalBudget: number = 10): PrivacyBudget {
  const budget = PrivacyBudgetSchema.parse({
    organizationId: orgId,
    totalBudget,
    usedBudget: 0,
    queries: [],
    resetAt: nextResetAt(),
  });
  budgets.set(orgId, budget);
  return cloneBudget(budget);
}

export function getPrivacyBudget(orgId: string): PrivacyBudget | undefined {
  autoResetBudgetIfNeeded(orgId);
  const budget = budgets.get(orgId);
  return budget ? cloneBudget(budget) : undefined;
}

export function spendPrivacyBudget(
  orgId: string,
  queryType: string,
  epsilon: number
): PrivacyBudget | undefined {
  autoResetBudgetIfNeeded(orgId);
  const existing = budgets.get(orgId) ?? initializePrivacyBudget(orgId);
  if (existing.usedBudget + epsilon > existing.totalBudget) return undefined;

  const updated = PrivacyBudgetSchema.parse({
    ...existing,
    usedBudget: Number((existing.usedBudget + epsilon).toFixed(4)),
    queries: [
      ...existing.queries,
      QueryRecordSchema.parse({
        id: randomUUID(),
        queryType: queryType.trim(),
        epsilonCost: epsilon,
        timestamp: now(),
      }),
    ],
  });
  budgets.set(orgId, updated);
  logAuditEntry(orgId, "query", `Executed ${queryType}`, epsilon);
  return cloneBudget(updated);
}

export function hasPrivacyBudget(orgId: string, requiredEpsilon: number): boolean {
  autoResetBudgetIfNeeded(orgId);
  const budget = budgets.get(orgId);
  return !!budget && budget.usedBudget + requiredEpsilon <= budget.totalBudget;
}

export function resetPrivacyBudget(orgId: string): PrivacyBudget | undefined {
  const budget = budgets.get(orgId);
  if (!budget) return undefined;

  const reset = PrivacyBudgetSchema.parse({
    ...budget,
    usedBudget: 0,
    queries: [],
    resetAt: nextResetAt(),
  });
  budgets.set(orgId, reset);
  logAuditEntry(orgId, "budget-reset", "Privacy budget reset");
  return cloneBudget(reset);
}

// Pattern bundles
export function extractAnonymizedBundle(
  orgId: string,
  domain: string,
  patterns: Array<{ name: string; frequency: number }>,
  noiseLevel: number = 0.1
): PatternBundle {
  const normalizedNoise = Math.max(0, Math.min(1, noiseLevel));
  const bundle = PatternBundleSchema.parse({
    id: randomUUID(),
    domain: domain.trim(),
    patterns: patterns.slice(0, 100).map((pattern, index) =>
      PatternSchema.parse({
        name: pattern.name,
        frequency: Number(Math.max(0, pattern.frequency * (1 - normalizedNoise / 2)).toFixed(2)),
        anonymizedSource: `anon-source-${index + 1}`,
      })
    ),
    noiseLevel: normalizedNoise,
    generatedAt: now(),
  });
  bundles.set(bundle.id, bundle);
  logAuditEntry(orgId, "export-bundle", `Exported bundle for ${domain}`);
  return cloneBundle(bundle);
}

export function getPatternBundle(id: string): PatternBundle | undefined {
  const bundle = bundles.get(id);
  return bundle ? cloneBundle(bundle) : undefined;
}

export function listPatternBundles(domain?: string): PatternBundle[] {
  return Array.from(bundles.values())
    .filter((bundle) => !domain || bundle.domain === domain)
    .map((bundle) => cloneBundle(bundle));
}

// Playbooks
export function createPlaybook(params: {
  title: string;
  description: string;
  domain: string;
  angles: string[];
  methodology: string;
  price: number;
  currency?: string;
  creatorOrgId: string;
}): Playbook {
  const playbook = PlaybookSchema.parse({
    id: randomUUID(),
    title: params.title.trim(),
    description: params.description.trim(),
    domain: params.domain.trim(),
    angles: params.angles,
    methodology: params.methodology.trim(),
    price: params.price,
    currency: params.currency ?? "USD",
    creatorOrgId: params.creatorOrgId,
    licensedTo: [],
    createdAt: now(),
  });
  playbooks.set(playbook.id, playbook);
  return clonePlaybook(playbook);
}

export function licensePlaybook(playbookId: string, licenseeOrgId: string): Playbook | undefined {
  const playbook = playbooks.get(playbookId);
  if (!playbook) return undefined;

  const updated = PlaybookSchema.parse({
    ...playbook,
    licensedTo: playbook.licensedTo.includes(licenseeOrgId)
      ? playbook.licensedTo
      : [...playbook.licensedTo, licenseeOrgId],
  });
  playbooks.set(playbookId, updated);
  logAuditEntry(licenseeOrgId, "license-playbook", `Licensed playbook ${playbookId}`);
  return clonePlaybook(updated);
}

export function getPlaybook(id: string): Playbook | undefined {
  const playbook = playbooks.get(id);
  return playbook ? clonePlaybook(playbook) : undefined;
}

export function listPlaybooks(domain?: string): Playbook[] {
  return Array.from(playbooks.values())
    .filter((playbook) => !domain || playbook.domain === domain)
    .map((playbook) => clonePlaybook(playbook));
}

// Anomaly detection (simple threshold-based)
export function detectAnomalies(orgId: string): Array<{
  type: string;
  detail: string;
  severity: "low" | "medium" | "high";
}> {
  autoResetBudgetIfNeeded(orgId);
  const anomalies: Array<{ type: string; detail: string; severity: "low" | "medium" | "high" }> =
    [];
  const budget = budgets.get(orgId);
  const orgAudit = auditLog.filter((entry) => entry.organizationId === orgId);

  if (budget && budget.totalBudget > 0) {
    const usageRatio = budget.usedBudget / budget.totalBudget;
    if (usageRatio >= 0.9) {
      anomalies.push({
        type: "privacy-budget",
        detail: `Privacy budget usage is at ${(usageRatio * 100).toFixed(0)}%.`,
        severity: "high",
      });
    } else if (usageRatio >= 0.75) {
      anomalies.push({
        type: "privacy-budget",
        detail: `Privacy budget usage is at ${(usageRatio * 100).toFixed(0)}%.`,
        severity: "medium",
      });
    }
  }

  if (orgAudit.filter((entry) => entry.action === "query").length >= 20) {
    anomalies.push({
      type: "query-volume",
      detail: "Query volume is unusually high for the current privacy window.",
      severity: "medium",
    });
  }

  if (orgAudit.filter((entry) => entry.action === "export-bundle").length >= 10) {
    anomalies.push({
      type: "bundle-export",
      detail: "Bundle export activity is unusually high and may require review.",
      severity: "low",
    });
  }

  return anomalies;
}

export function clearFederationExchangeData(): void {
  budgets.clear();
  bundles.clear();
  playbooks.clear();
  auditLog.length = 0;
}
