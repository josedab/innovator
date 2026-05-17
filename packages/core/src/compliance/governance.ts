/**
 * @module compliance/governance
 *
 * Innovation Governance & Compliance Engine — configurable guardrails:
 * ethical review gates, IP conflict scanning, regulatory pre-screening
 * (GDPR, HIPAA, SOX), bias detection, and audit trails.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const GuardrailTypeSchema = z.enum([
  "ethical-review",
  "ip-scan",
  "regulatory",
  "bias-detection",
  "content-safety",
  "data-privacy",
  "custom",
]);

export const GuardrailSeveritySchema = z.enum(["info", "warning", "critical", "blocker"]);

export const GuardrailSchema = z.object({
  id: z.string(),
  type: GuardrailTypeSchema,
  name: z.string().max(500),
  description: z.string().max(2000),
  severity: GuardrailSeveritySchema,
  enabled: z.boolean().default(true),
  rules: z
    .array(
      z.object({
        id: z.string().max(200),
        pattern: z.string().max(1000),
        message: z.string().max(1000),
      })
    )
    .max(50),
  jurisdictions: z.array(z.string().max(100)).max(20).optional(),
  createdAt: z.string(),
});

export const GuardrailResultSchema = z.object({
  guardrailId: z.string(),
  guardrailName: z.string(),
  passed: z.boolean(),
  severity: GuardrailSeveritySchema,
  findings: z
    .array(
      z.object({
        ruleId: z.string(),
        message: z.string().max(2000),
        context: z.string().max(1000).optional(),
      })
    )
    .max(50),
  evaluatedAt: z.string(),
});

export const RegulatoryCheckSchema = z.object({
  regulation: z.string().max(200),
  jurisdiction: z.string().max(200),
  status: z.enum(["compliant", "non-compliant", "needs-review", "not-applicable"]),
  requirements: z
    .array(
      z.object({
        id: z.string().max(200),
        name: z.string().max(500),
        met: z.boolean(),
        notes: z.string().max(1000).optional(),
      })
    )
    .max(30),
  checkedAt: z.string(),
});

export const BiasCheckSchema = z.object({
  dimension: z.string().max(200),
  score: z.number().min(0).max(1),
  level: z.enum(["none", "low", "medium", "high"]),
  details: z.string().max(2000),
  suggestions: z.array(z.string().max(500)).max(10),
});

export const ComplianceAuditEntrySchema = z.object({
  id: z.string(),
  action: z.string().max(200),
  resource: z.string().max(500),
  userId: z.string().max(200).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
  outcome: z.enum(["allowed", "denied", "flagged"]),
});

// ---- Types ----

export type GuardrailType = z.infer<typeof GuardrailTypeSchema>;
export type GuardrailSeverity = z.infer<typeof GuardrailSeveritySchema>;
export type Guardrail = z.infer<typeof GuardrailSchema>;
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;
export type RegulatoryCheck = z.infer<typeof RegulatoryCheckSchema>;
export type BiasCheck = z.infer<typeof BiasCheckSchema>;
export type ComplianceAuditEntry = z.infer<typeof ComplianceAuditEntrySchema>;

export interface ComplianceDashboard {
  totalGuardrails: number;
  enabledGuardrails: number;
  recentAuditEntries: ComplianceAuditEntry[];
  complianceScore: number;
  blockersCount: number;
  warningsCount: number;
}

// ---- In-Memory Stores ----

const guardrails = new Map<string, Guardrail>();
const auditTrail: ComplianceAuditEntry[] = [];

// ---- Regulatory Knowledge Base ----

const REGULATORY_REQUIREMENTS: Record<
  string,
  Array<{ id: string; name: string; description: string }>
> = {
  GDPR: [
    {
      id: "gdpr-consent",
      name: "Explicit Consent",
      description: "Obtain explicit consent before processing personal data.",
    },
    {
      id: "gdpr-minimization",
      name: "Data Minimization",
      description: "Collect only data necessary for the stated purpose.",
    },
    {
      id: "gdpr-portability",
      name: "Data Portability",
      description: "Allow users to export their personal data.",
    },
    {
      id: "gdpr-erasure",
      name: "Right to Erasure",
      description: "Allow users to request deletion of their data.",
    },
    {
      id: "gdpr-dpia",
      name: "Data Protection Impact Assessment",
      description: "Conduct DPIA for high-risk processing activities.",
    },
    {
      id: "gdpr-dpo",
      name: "Data Protection Officer",
      description: "Appoint a DPO if required by processing activities.",
    },
  ],
  HIPAA: [
    {
      id: "hipaa-phi",
      name: "PHI Protection",
      description: "Protect all Protected Health Information with appropriate safeguards.",
    },
    {
      id: "hipaa-minimum",
      name: "Minimum Necessary",
      description: "Access only the minimum PHI necessary for the intended purpose.",
    },
    {
      id: "hipaa-baa",
      name: "Business Associate Agreement",
      description: "Execute BAAs with all entities accessing PHI.",
    },
    {
      id: "hipaa-breach",
      name: "Breach Notification",
      description: "Report breaches of unsecured PHI within 60 days.",
    },
    {
      id: "hipaa-audit",
      name: "Audit Controls",
      description: "Implement mechanisms to record and examine system activity.",
    },
  ],
  SOX: [
    {
      id: "sox-controls",
      name: "Internal Controls",
      description: "Maintain internal controls over financial reporting.",
    },
    {
      id: "sox-retention",
      name: "Document Retention",
      description: "Retain all audit/review work papers for 7 years.",
    },
    {
      id: "sox-certification",
      name: "Management Certification",
      description: "CEO/CFO must certify financial report accuracy.",
    },
    {
      id: "sox-whistleblower",
      name: "Whistleblower Protection",
      description: "Establish confidential mechanisms for reporting concerns.",
    },
  ],
  "PCI-DSS": [
    {
      id: "pci-encryption",
      name: "Data Encryption",
      description: "Encrypt cardholder data in transit and at rest.",
    },
    {
      id: "pci-access",
      name: "Access Control",
      description: "Restrict access to cardholder data on a need-to-know basis.",
    },
    {
      id: "pci-testing",
      name: "Regular Testing",
      description: "Conduct regular security testing and vulnerability scans.",
    },
    {
      id: "pci-logging",
      name: "Logging & Monitoring",
      description: "Track and monitor all access to network resources and cardholder data.",
    },
  ],
};

// ---- Bias Detection Patterns ----

const BIAS_DIMENSIONS = [
  {
    dimension: "demographic",
    keywords: [
      "only for",
      "not suitable for",
      "targeted at men",
      "targeted at women",
      "young people",
      "elderly",
    ],
  },
  {
    dimension: "geographic",
    keywords: ["western", "developed countries", "first world", "english-speaking only"],
  },
  {
    dimension: "economic",
    keywords: ["premium users", "wealthy", "affluent", "luxury only", "high-income"],
  },
  {
    dimension: "technological",
    keywords: ["smartphone required", "high-bandwidth only", "latest devices", "tech-savvy only"],
  },
  {
    dimension: "accessibility",
    keywords: ["requires vision", "hearing required", "physically able", "neurotypical"],
  },
];

// ---- Core Functions ----

/** Create a new guardrail. */
export function createGuardrail(params: {
  type: GuardrailType;
  name: string;
  description: string;
  severity: GuardrailSeverity;
  rules: Array<{ id: string; pattern: string; message: string }>;
  jurisdictions?: string[];
}): Guardrail {
  const id = randomUUID();
  const guardrail: Guardrail = {
    id,
    type: params.type,
    name: params.name,
    description: params.description,
    severity: params.severity,
    enabled: true,
    rules: params.rules,
    jurisdictions: params.jurisdictions,
    createdAt: new Date().toISOString(),
  };
  guardrails.set(id, guardrail);
  return guardrail;
}

/** List all guardrails. */
export function listGuardrails(filter?: { type?: GuardrailType; enabled?: boolean }): Guardrail[] {
  let list = Array.from(guardrails.values());
  if (filter?.type) list = list.filter((g) => g.type === filter.type);
  if (filter?.enabled !== undefined) list = list.filter((g) => g.enabled === filter.enabled);
  return list;
}

/** Evaluate all enabled guardrails against idea text. */
export function evaluateGuardrails(text: string): GuardrailResult[] {
  const results: GuardrailResult[] = [];
  const lower = text.toLowerCase();

  for (const guardrail of guardrails.values()) {
    if (!guardrail.enabled) continue;

    const findings: Array<{ ruleId: string; message: string; context?: string }> = [];
    for (const rule of guardrail.rules) {
      if (lower.includes(rule.pattern.toLowerCase())) {
        findings.push({
          ruleId: rule.id,
          message: rule.message,
          context: text.slice(0, 200),
        });
      }
    }

    results.push({
      guardrailId: guardrail.id,
      guardrailName: guardrail.name,
      passed: findings.length === 0,
      severity: guardrail.severity,
      findings,
      evaluatedAt: new Date().toISOString(),
    });
  }

  // Log audit entry
  addAuditEntry({
    action: "guardrail-evaluation",
    resource: text.slice(0, 200),
    outcome: results.some((r) => !r.passed && r.severity === "blocker")
      ? "denied"
      : results.some((r) => !r.passed)
        ? "flagged"
        : "allowed",
  });

  return results;
}

/** Run regulatory pre-screening for a given regulation. */
export function runRegulatoryPreScreening(
  regulation: string,
  ideaDescription: string
): RegulatoryCheck {
  const reqs = REGULATORY_REQUIREMENTS[regulation.toUpperCase()];
  if (!reqs) {
    return {
      regulation,
      jurisdiction: "Unknown",
      status: "not-applicable",
      requirements: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const lower = ideaDescription.toLowerCase();
  const requirements = reqs.map((req) => {
    // Simple heuristic: check if the idea mentions anything related to the requirement
    const relatedTerms = req.description
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 4);
    const mentioned = relatedTerms.some((term) => lower.includes(term));
    return {
      id: req.id,
      name: req.name,
      met: mentioned,
      notes: mentioned ? "Addressed in idea description" : `Consider: ${req.description}`,
    };
  });

  const metCount = requirements.filter((r) => r.met).length;
  const status =
    metCount === requirements.length
      ? "compliant"
      : metCount > requirements.length / 2
        ? "needs-review"
        : "non-compliant";

  const jurisdictionMap: Record<string, string> = {
    GDPR: "European Union",
    HIPAA: "United States",
    SOX: "United States",
    "PCI-DSS": "Global",
  };

  addAuditEntry({
    action: "regulatory-screening",
    resource: regulation,
    outcome: status === "compliant" ? "allowed" : "flagged",
    details: { regulation, status, metCount, totalReqs: requirements.length },
  });

  return {
    regulation,
    jurisdiction: jurisdictionMap[regulation.toUpperCase()] ?? "Unknown",
    status: status as "compliant" | "non-compliant" | "needs-review",
    requirements,
    checkedAt: new Date().toISOString(),
  };
}

/** Detect bias in idea descriptions. */
export function detectBias(text: string): BiasCheck[] {
  const lower = text.toLowerCase();
  const checks: BiasCheck[] = [];

  for (const dim of BIAS_DIMENSIONS) {
    const matched = dim.keywords.filter((k) => lower.includes(k.toLowerCase()));
    const score =
      matched.length > 0 ? Math.min(matched.length / dim.keywords.length + 0.2, 1.0) : 0;
    const level = score === 0 ? "none" : score < 0.3 ? "low" : score < 0.6 ? "medium" : "high";

    checks.push({
      dimension: dim.dimension,
      score,
      level,
      details:
        matched.length > 0
          ? `Detected ${dim.dimension} bias indicators: ${matched.join(", ")}`
          : `No ${dim.dimension} bias detected.`,
      suggestions:
        matched.length > 0
          ? [
              `Consider broadening the target audience beyond ${matched[0]}`,
              `Add inclusive alternatives for ${dim.dimension} accessibility`,
            ]
          : [],
    });
  }

  if (checks.some((c) => c.level !== "none")) {
    addAuditEntry({
      action: "bias-detection",
      resource: text.slice(0, 200),
      outcome: "flagged",
      details: { biasFound: checks.filter((c) => c.level !== "none").map((c) => c.dimension) },
    });
  }

  return checks;
}

/** Get the full compliance audit trail. */
export function getComplianceAuditTrail(limit: number = 100): ComplianceAuditEntry[] {
  return auditTrail.slice(-limit);
}

/** Add an entry to the audit trail. */
export function addAuditEntry(params: {
  action: string;
  resource: string;
  userId?: string;
  details?: Record<string, unknown>;
  outcome: "allowed" | "denied" | "flagged";
}): ComplianceAuditEntry {
  const entry: ComplianceAuditEntry = {
    id: randomUUID(),
    action: params.action,
    resource: params.resource,
    userId: params.userId,
    details: params.details,
    timestamp: new Date().toISOString(),
    outcome: params.outcome,
  };
  auditTrail.push(entry);
  return entry;
}

/** Get compliance dashboard summary. */
export function getComplianceDashboard(): ComplianceDashboard {
  const all = Array.from(guardrails.values());
  const recent = auditTrail.slice(-50);
  const denied = recent.filter((e) => e.outcome === "denied").length;
  const flagged = recent.filter((e) => e.outcome === "flagged").length;
  const total = recent.length;

  return {
    totalGuardrails: all.length,
    enabledGuardrails: all.filter((g) => g.enabled).length,
    recentAuditEntries: recent.slice(-20),
    complianceScore:
      total > 0 ? Math.round(((total - denied - flagged * 0.5) / total) * 100) / 100 : 1.0,
    blockersCount: denied,
    warningsCount: flagged,
  };
}

/** Clear all governance data (for testing). */
export function clearGovernance(): void {
  guardrails.clear();
  auditTrail.length = 0;
}
