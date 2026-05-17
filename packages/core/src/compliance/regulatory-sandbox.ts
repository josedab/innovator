/**
 * @module compliance/regulatory-sandbox
 *
 * Regulatory Innovation Sandbox — define regulatory constraint sets
 * (HIPAA, SOX, GDPR, PCI-DSS, etc.), run automated compliance screening
 * on ideas, and manage sandbox environments with whitelisted experiments.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { runRegulatoryPreScreening, detectBias, addAuditEntry } from "./governance.js";

// ---- Constraint Set Schemas ----

export const ConstraintCategorySchema = z.enum([
  "data_privacy",
  "financial",
  "healthcare",
  "safety",
  "environmental",
  "accessibility",
  "ai_ethics",
  "intellectual_property",
]);
export type ConstraintCategory = z.infer<typeof ConstraintCategorySchema>;

export const ConstraintSchema = z.object({
  id: z.string(),
  name: z.string().max(300),
  description: z.string().max(2000),
  category: ConstraintCategorySchema,
  regulation: z.string().max(100),
  severity: z.enum(["advisory", "mandatory", "blocking"]),
  keywords: z.array(z.string().max(100)).max(50),
  exemptions: z.array(z.string().max(500)).max(10),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

export const ConstraintSetSchema = z.object({
  id: z.string(),
  name: z.string().max(300),
  description: z.string().max(2000),
  regulations: z.array(z.string().max(100)),
  constraints: z.array(ConstraintSchema),
  categories: z.array(ConstraintCategorySchema),
  version: z.string().max(20).default("1.0"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConstraintSet = z.infer<typeof ConstraintSetSchema>;

// ---- Screening Results ----

export const ConstraintViolationSchema = z.object({
  constraintId: z.string(),
  constraintName: z.string().max(300),
  regulation: z.string().max(100),
  severity: z.enum(["advisory", "mandatory", "blocking"]),
  description: z.string().max(2000),
  matchedKeywords: z.array(z.string().max(100)),
  recommendation: z.string().max(1000),
});
export type ConstraintViolation = z.infer<typeof ConstraintViolationSchema>;

export const ScreeningResultSchema = z.object({
  id: z.string(),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  constraintSetId: z.string(),
  status: z.enum(["clear", "advisory", "needs_review", "blocked"]),
  violations: z.array(ConstraintViolationSchema),
  regulatoryChecks: z.array(
    z.object({
      regulation: z.string(),
      status: z.string(),
      requirementsMet: z.number(),
      requirementsTotal: z.number(),
    })
  ),
  biasFlags: z.array(
    z.object({
      dimension: z.string(),
      severity: z.string(),
      description: z.string(),
    })
  ),
  overallRiskScore: z.number().min(0).max(100),
  screenedAt: z.string(),
});
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;

// ---- Sandbox Environment ----

export const SandboxExperimentSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  description: z.string().max(2000),
  constraintSetId: z.string(),
  exemptConstraints: z.array(z.string()).max(20),
  status: z.enum(["active", "completed", "revoked"]),
  justification: z.string().max(2000),
  approvedBy: z.string().max(200).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  reviewNotes: z.array(z.string().max(1000)).max(20),
});
export type SandboxExperiment = z.infer<typeof SandboxExperimentSchema>;

// ---- Pre-Built Constraint Sets ----

const HIPAA_CONSTRAINTS: Constraint[] = [
  {
    id: "hipaa-phi",
    name: "Protected Health Information",
    description: "Must not expose, store, or transmit PHI without proper safeguards",
    category: "healthcare",
    regulation: "HIPAA",
    severity: "blocking",
    keywords: [
      "patient data",
      "medical record",
      "health information",
      "diagnosis",
      "treatment",
      "PHI",
    ],
    exemptions: ["de-identified data", "aggregate statistics"],
  },
  {
    id: "hipaa-access",
    name: "Access Controls",
    description: "Must implement role-based access controls for health data",
    category: "healthcare",
    regulation: "HIPAA",
    severity: "mandatory",
    keywords: ["access", "authentication", "authorization", "health data", "clinical"],
    exemptions: [],
  },
  {
    id: "hipaa-audit",
    name: "Audit Trail",
    description: "Must maintain audit trails for all PHI access and modifications",
    category: "healthcare",
    regulation: "HIPAA",
    severity: "mandatory",
    keywords: ["audit", "logging", "tracking", "health record"],
    exemptions: [],
  },
  {
    id: "hipaa-encrypt",
    name: "Encryption Requirements",
    description: "PHI must be encrypted at rest and in transit",
    category: "healthcare",
    regulation: "HIPAA",
    severity: "blocking",
    keywords: ["encryption", "data storage", "transmission", "health"],
    exemptions: [],
  },
];

const SOX_CONSTRAINTS: Constraint[] = [
  {
    id: "sox-controls",
    name: "Internal Controls",
    description: "Must maintain adequate internal controls over financial reporting",
    category: "financial",
    regulation: "SOX",
    severity: "blocking",
    keywords: ["financial", "reporting", "accounting", "audit", "internal controls"],
    exemptions: [],
  },
  {
    id: "sox-retention",
    name: "Record Retention",
    description: "Financial records must be retained for required periods",
    category: "financial",
    regulation: "SOX",
    severity: "mandatory",
    keywords: ["records", "retention", "financial data", "archiving"],
    exemptions: [],
  },
  {
    id: "sox-disclosure",
    name: "Material Disclosure",
    description: "Material changes must be disclosed in a timely manner",
    category: "financial",
    regulation: "SOX",
    severity: "mandatory",
    keywords: ["disclosure", "material", "financial statement", "investor"],
    exemptions: [],
  },
];

const GDPR_CONSTRAINTS: Constraint[] = [
  {
    id: "gdpr-consent",
    name: "Data Subject Consent",
    description: "Must obtain explicit consent before processing personal data",
    category: "data_privacy",
    regulation: "GDPR",
    severity: "blocking",
    keywords: ["personal data", "consent", "user data", "privacy", "data subject"],
    exemptions: ["legitimate interest", "legal obligation"],
  },
  {
    id: "gdpr-right-erasure",
    name: "Right to Erasure",
    description: "Must support data deletion requests from data subjects",
    category: "data_privacy",
    regulation: "GDPR",
    severity: "mandatory",
    keywords: ["delete", "erasure", "forget", "remove data", "personal data"],
    exemptions: ["legal retention requirements"],
  },
  {
    id: "gdpr-dpia",
    name: "Data Protection Impact Assessment",
    description: "Must conduct DPIA for high-risk processing activities",
    category: "data_privacy",
    regulation: "GDPR",
    severity: "mandatory",
    keywords: ["profiling", "automated decision", "large scale", "sensitive data", "surveillance"],
    exemptions: [],
  },
  {
    id: "gdpr-transfer",
    name: "Cross-Border Data Transfer",
    description: "Personal data transfers outside EU require adequate safeguards",
    category: "data_privacy",
    regulation: "GDPR",
    severity: "blocking",
    keywords: ["transfer", "cross-border", "international", "cloud", "third country"],
    exemptions: ["EU-approved country", "standard contractual clauses"],
  },
];

// ---- In-Memory Stores ----

const constraintSets = new Map<string, ConstraintSet>();
const screeningResults = new Map<string, ScreeningResult>();
const experiments = new Map<string, SandboxExperiment>();

// ---- Initialize Pre-Built Sets ----

function initializePreBuiltSets(): void {
  if (constraintSets.size > 0) return;

  const sets: Array<{
    name: string;
    description: string;
    regulations: string[];
    constraints: Constraint[];
  }> = [
    {
      name: "HIPAA Healthcare",
      description: "HIPAA compliance constraints for healthcare innovation",
      regulations: ["HIPAA"],
      constraints: HIPAA_CONSTRAINTS,
    },
    {
      name: "SOX Financial",
      description: "Sarbanes-Oxley compliance for financial innovation",
      regulations: ["SOX"],
      constraints: SOX_CONSTRAINTS,
    },
    {
      name: "GDPR Privacy",
      description: "GDPR compliance for data privacy in innovation",
      regulations: ["GDPR"],
      constraints: GDPR_CONSTRAINTS,
    },
    {
      name: "Full Enterprise",
      description: "Combined HIPAA + SOX + GDPR for enterprise environments",
      regulations: ["HIPAA", "SOX", "GDPR"],
      constraints: [...HIPAA_CONSTRAINTS, ...SOX_CONSTRAINTS, ...GDPR_CONSTRAINTS],
    },
  ];

  for (const set of sets) {
    const cs: ConstraintSet = {
      id: `prebuilt-${set.regulations.join("-").toLowerCase()}`,
      name: set.name,
      description: set.description,
      regulations: set.regulations,
      constraints: set.constraints,
      categories: [...new Set(set.constraints.map((c) => c.category))],
      version: "1.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    constraintSets.set(cs.id, cs);
  }
}

// ---- Constraint Set Management ----

/** List available constraint sets. */
export function listConstraintSets(): ConstraintSet[] {
  initializePreBuiltSets();
  return Array.from(constraintSets.values());
}

/** Get a specific constraint set. */
export function getConstraintSet(id: string): ConstraintSet | undefined {
  initializePreBuiltSets();
  return constraintSets.get(id);
}

/** Create a custom constraint set. */
export function createConstraintSet(
  input: Omit<ConstraintSet, "id" | "createdAt" | "updatedAt" | "version"> & { version?: string }
): ConstraintSet {
  const set = ConstraintSetSchema.parse({
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  constraintSets.set(set.id, set);
  return set;
}

// ---- Compliance Screening ----

/**
 * Screen an idea against a constraint set.
 * Checks for keyword matches, runs regulatory pre-screening,
 * and detects potential bias issues.
 */
export function screenIdea(
  ideaTitle: string,
  ideaDescription: string,
  constraintSetId: string,
  exemptConstraints?: string[]
): ScreeningResult {
  initializePreBuiltSets();
  const constraintSet = constraintSets.get(constraintSetId);
  if (!constraintSet) {
    throw new Error(`Constraint set "${constraintSetId}" not found`);
  }

  const exempt = new Set(exemptConstraints ?? []);
  const fullText = `${ideaTitle} ${ideaDescription}`.toLowerCase();
  const violations: ConstraintViolation[] = [];

  // Check each constraint
  for (const constraint of constraintSet.constraints) {
    if (exempt.has(constraint.id)) continue;

    const matchedKeywords = constraint.keywords.filter((kw) => fullText.includes(kw.toLowerCase()));

    if (matchedKeywords.length > 0) {
      // Check if any exemption applies
      const exempted = constraint.exemptions.some((ex) => fullText.includes(ex.toLowerCase()));

      if (!exempted) {
        violations.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          regulation: constraint.regulation,
          severity: constraint.severity,
          description: constraint.description,
          matchedKeywords,
          recommendation: buildRecommendation(constraint, matchedKeywords),
        });
      }
    }
  }

  // Run regulatory pre-screening for each regulation
  const regulatoryChecks = constraintSet.regulations.map((reg) => {
    const check = runRegulatoryPreScreening(reg, ideaDescription);
    const met = check.requirements.filter((r) => r.met).length;
    return {
      regulation: reg,
      status: check.status,
      requirementsMet: met,
      requirementsTotal: check.requirements.length,
    };
  });

  // Run bias detection
  const biasChecks = detectBias(ideaDescription);
  const biasFlags = biasChecks
    .filter((b) => b.level !== "low" && b.level !== "none")
    .map((b) => ({
      dimension: b.dimension,
      severity: b.level,
      description: b.details,
    }));

  // Determine overall status
  const hasBlocker = violations.some((v) => v.severity === "blocking");
  const hasMandatory = violations.some((v) => v.severity === "mandatory");
  const status = hasBlocker
    ? "blocked"
    : hasMandatory
      ? "needs_review"
      : violations.length > 0
        ? "advisory"
        : "clear";

  // Compute risk score
  const riskScore = computeRiskScore(violations, biasFlags);

  const result: ScreeningResult = ScreeningResultSchema.parse({
    id: randomUUID(),
    ideaTitle,
    ideaDescription: ideaDescription.slice(0, 5000),
    constraintSetId,
    status,
    violations,
    regulatoryChecks,
    biasFlags,
    overallRiskScore: riskScore,
    screenedAt: new Date().toISOString(),
  });

  screeningResults.set(result.id, result);

  // Add audit entry
  addAuditEntry({
    action: "sandbox-screening",
    resource: ideaTitle,
    outcome: status === "clear" ? "allowed" : "flagged",
    details: {
      constraintSet: constraintSet.name,
      violations: violations.length,
      status,
      riskScore,
    },
  });

  return result;
}

function buildRecommendation(constraint: Constraint, matchedKeywords: string[]): string {
  const keywordStr = matchedKeywords.join(", ");
  switch (constraint.severity) {
    case "blocking":
      return `CRITICAL: This idea triggers ${constraint.regulation} constraint "${constraint.name}" (keywords: ${keywordStr}). Must be resolved before proceeding.`;
    case "mandatory":
      return `IMPORTANT: Address ${constraint.regulation} requirement "${constraint.name}" (keywords: ${keywordStr}). Include compliance measures in implementation plan.`;
    case "advisory":
      return `ADVISORY: Consider ${constraint.regulation} guideline "${constraint.name}" (keywords: ${keywordStr}). May affect implementation approach.`;
  }
}

function computeRiskScore(
  violations: ConstraintViolation[],
  biasFlags: Array<{ severity: string }>
): number {
  let score = 0;
  for (const v of violations) {
    switch (v.severity) {
      case "blocking":
        score += 30;
        break;
      case "mandatory":
        score += 15;
        break;
      case "advisory":
        score += 5;
        break;
    }
  }
  for (const b of biasFlags) {
    if (b.severity === "high") score += 10;
    else if (b.severity === "medium") score += 5;
  }
  return Math.min(100, score);
}

// ---- Sandbox Experiments ----

/** Create a sandbox experiment with specific constraint exemptions. */
export function createExperiment(input: {
  title: string;
  description: string;
  constraintSetId: string;
  exemptConstraints: string[];
  justification: string;
  approvedBy?: string;
  endDate?: string;
}): SandboxExperiment {
  initializePreBuiltSets();
  if (!constraintSets.has(input.constraintSetId)) {
    throw new Error(`Constraint set "${input.constraintSetId}" not found`);
  }

  const experiment = SandboxExperimentSchema.parse({
    ...input,
    id: randomUUID(),
    status: "active",
    startDate: new Date().toISOString(),
    reviewNotes: [],
  });
  experiments.set(experiment.id, experiment);

  addAuditEntry({
    action: "sandbox-experiment-created",
    resource: input.title,
    outcome: "allowed",
    details: {
      exemptConstraints: input.exemptConstraints,
      justification: input.justification,
    },
  });

  return experiment;
}

/** Get an experiment. */
export function getExperiment(id: string): SandboxExperiment | undefined {
  return experiments.get(id);
}

/** List all experiments. */
export function listExperiments(filter?: {
  status?: "active" | "completed" | "revoked";
}): SandboxExperiment[] {
  let results = Array.from(experiments.values());
  if (filter?.status) {
    results = results.filter((e) => e.status === filter.status);
  }
  return results;
}

/** Screen an idea within a sandbox experiment (using experiment exemptions). */
export function screenIdeaInSandbox(
  experimentId: string,
  ideaTitle: string,
  ideaDescription: string
): ScreeningResult {
  const experiment = experiments.get(experimentId);
  if (!experiment) throw new Error(`Experiment "${experimentId}" not found`);
  if (experiment.status !== "active") throw new Error("Experiment is not active");

  return screenIdea(
    ideaTitle,
    ideaDescription,
    experiment.constraintSetId,
    experiment.exemptConstraints
  );
}

/** Revoke a sandbox experiment. */
export function revokeExperiment(id: string, reason: string): boolean {
  const experiment = experiments.get(id);
  if (!experiment) return false;
  experiment.status = "revoked";
  experiment.reviewNotes.push(`Revoked: ${reason}`);
  experiment.endDate = new Date().toISOString();
  return true;
}

// ---- Screening Result Access ----

/** Get a stored screening result. */
export function getScreeningResult(id: string): ScreeningResult | undefined {
  return screeningResults.get(id);
}

/** List all screening results. */
export function listScreeningResults(filter?: {
  status?: ScreeningResult["status"];
  constraintSetId?: string;
}): ScreeningResult[] {
  let results = Array.from(screeningResults.values());
  if (filter?.status) {
    results = results.filter((r) => r.status === filter.status);
  }
  if (filter?.constraintSetId) {
    results = results.filter((r) => r.constraintSetId === filter.constraintSetId);
  }
  return results.sort((a, b) => b.screenedAt.localeCompare(a.screenedAt));
}

// ---- Markdown Export ----

/** Export screening result as markdown. */
export function screeningResultToMarkdown(result: ScreeningResult): string {
  const lines: string[] = [
    `# Compliance Screening: ${result.ideaTitle}`,
    "",
    `**Status:** ${result.status.toUpperCase()}`,
    `**Risk Score:** ${result.overallRiskScore}/100`,
    `**Screened:** ${result.screenedAt}`,
    "",
  ];

  if (result.violations.length > 0) {
    lines.push("## Violations");
    lines.push("");
    for (const v of result.violations) {
      lines.push(`### [${v.severity.toUpperCase()}] ${v.constraintName} (${v.regulation})`);
      lines.push("");
      lines.push(v.description);
      lines.push(`*Keywords matched: ${v.matchedKeywords.join(", ")}*`);
      lines.push(`**Recommendation:** ${v.recommendation}`);
      lines.push("");
    }
  }

  if (result.regulatoryChecks.length > 0) {
    lines.push("## Regulatory Checks");
    lines.push("");
    lines.push("| Regulation | Status | Requirements Met |");
    lines.push("|------------|--------|-----------------|");
    for (const c of result.regulatoryChecks) {
      lines.push(`| ${c.regulation} | ${c.status} | ${c.requirementsMet}/${c.requirementsTotal} |`);
    }
    lines.push("");
  }

  if (result.biasFlags.length > 0) {
    lines.push("## Bias Flags");
    lines.push("");
    for (const b of result.biasFlags) {
      lines.push(`- **[${b.severity}] ${b.dimension}**: ${b.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Clear all sandbox data (for testing). */
export function clearSandboxData(): void {
  constraintSets.clear();
  screeningResults.clear();
  experiments.clear();
}
