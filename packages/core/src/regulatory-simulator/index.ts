/**
 * @module regulatory-simulator
 *
 * Multi-Jurisdiction Regulatory Simulator: simulates idea viability under
 * different regulatory regimes worldwide. Covers EU AI Act, GDPR, HIPAA,
 * CCPA, SOX, PCI DSS, and more across 15+ jurisdictions. Produces
 * per-jurisdiction green/yellow/red compliance scores.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

/** Schema for a regulatory framework. */
export const RegulatoryFrameworkSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  jurisdiction: z.string().max(100),
  category: z.enum([
    "data-privacy",
    "ai-regulation",
    "healthcare",
    "financial",
    "consumer-protection",
    "environmental",
    "trade",
    "intellectual-property",
  ]),
  description: z.string().max(500),
  keyRequirements: z.array(z.string().max(300)).max(10),
  penaltyRange: z.string().max(200),
  effectiveDate: z.string().max(50),
});

/** Schema for a compliance check result. */
export const ComplianceCheckSchema = z.object({
  frameworkId: z.string().max(100),
  frameworkName: z.string().max(200),
  status: z.enum(["green", "yellow", "red"]),
  score: z.number().min(0).max(1),
  findings: z
    .array(
      z.object({
        requirement: z.string().max(300),
        status: z.enum(["compliant", "partial", "non-compliant", "not-applicable"]),
        detail: z.string().max(500),
        remediation: z.string().max(500).optional(),
      })
    )
    .max(20),
  estimatedComplianceCost: z.string().max(200).optional(),
  timeToCompliance: z.string().max(200).optional(),
});

/** Schema for a jurisdiction result. */
export const JurisdictionResultSchema = z.object({
  jurisdiction: z.string().max(100),
  region: z.string().max(100),
  overallStatus: z.enum(["green", "yellow", "red"]),
  overallScore: z.number().min(0).max(1),
  frameworkChecks: z.array(ComplianceCheckSchema).max(20),
  summary: z.string().max(500),
  recommendation: z.enum([
    "proceed",
    "proceed-with-modifications",
    "significant-changes-needed",
    "not-recommended",
  ]),
});

/** Schema for the full regulatory simulation. */
export const RegulatorySimulationSchema = z.object({
  ideaTitle: z.string().max(500),
  jurisdictions: z.array(JurisdictionResultSchema),
  globalSummary: z.string().max(1000),
  lowestRiskJurisdictions: z.array(z.string().max(100)).max(5),
  highestRiskJurisdictions: z.array(z.string().max(100)).max(5),
  universalRequirements: z.array(z.string().max(300)).max(10),
  simulatedAt: z.string(),
});

// ---- Types ----

export type RegulatoryFramework = z.infer<typeof RegulatoryFrameworkSchema>;
export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>;
export type JurisdictionResult = z.infer<typeof JurisdictionResultSchema>;
export type RegulatorySimulation = z.infer<typeof RegulatorySimulationSchema>;

// ---- In-memory store ----

const simulations: Map<string, RegulatorySimulation> = new Map();

// ---- Regulatory Knowledge Base ----

export const REGULATORY_FRAMEWORKS: RegulatoryFramework[] = [
  {
    id: "gdpr",
    name: "General Data Protection Regulation",
    jurisdiction: "European Union",
    category: "data-privacy",
    description: "EU data protection and privacy regulation",
    keyRequirements: [
      "Lawful basis for processing",
      "Data minimization",
      "Right to erasure",
      "Data portability",
      "DPO appointment",
      "72-hour breach notification",
    ],
    penaltyRange: "Up to €20M or 4% of global revenue",
    effectiveDate: "2018-05-25",
  },
  {
    id: "eu-ai-act",
    name: "EU AI Act",
    jurisdiction: "European Union",
    category: "ai-regulation",
    description: "EU regulation on artificial intelligence systems",
    keyRequirements: [
      "Risk classification",
      "Transparency obligations",
      "Human oversight",
      "Data quality requirements",
      "Conformity assessment",
      "Registration in EU database",
    ],
    penaltyRange: "Up to €35M or 7% of global revenue",
    effectiveDate: "2024-08-01",
  },
  {
    id: "hipaa",
    name: "Health Insurance Portability and Accountability Act",
    jurisdiction: "United States",
    category: "healthcare",
    description: "US healthcare data protection",
    keyRequirements: [
      "PHI safeguards",
      "Access controls",
      "Audit trails",
      "Business associate agreements",
      "Breach notification",
      "Minimum necessary standard",
    ],
    penaltyRange: "$100-$50,000 per violation, up to $1.5M annually",
    effectiveDate: "1996-08-21",
  },
  {
    id: "ccpa",
    name: "California Consumer Privacy Act",
    jurisdiction: "United States - California",
    category: "data-privacy",
    description: "California consumer data privacy rights",
    keyRequirements: [
      "Right to know",
      "Right to delete",
      "Right to opt-out",
      "Non-discrimination",
      "Privacy policy disclosure",
      "Financial incentive notices",
    ],
    penaltyRange: "$2,500-$7,500 per violation",
    effectiveDate: "2020-01-01",
  },
  {
    id: "sox",
    name: "Sarbanes-Oxley Act",
    jurisdiction: "United States",
    category: "financial",
    description: "US corporate financial reporting and controls",
    keyRequirements: [
      "Internal controls",
      "CEO/CFO certification",
      "Audit committee independence",
      "Whistleblower protection",
      "Document retention",
      "Real-time disclosure",
    ],
    penaltyRange: "Up to $5M fine and 20 years imprisonment",
    effectiveDate: "2002-07-30",
  },
  {
    id: "pci-dss",
    name: "Payment Card Industry Data Security Standard",
    jurisdiction: "Global",
    category: "financial",
    description: "Payment card data security requirements",
    keyRequirements: [
      "Network security",
      "Cardholder data protection",
      "Vulnerability management",
      "Access control",
      "Network monitoring",
      "Security policy",
    ],
    penaltyRange: "$5,000-$100,000 per month",
    effectiveDate: "2004-12-15",
  },
  {
    id: "pipeda",
    name: "Personal Information Protection and Electronic Documents Act",
    jurisdiction: "Canada",
    category: "data-privacy",
    description: "Canadian private-sector privacy law",
    keyRequirements: [
      "Consent",
      "Limited collection",
      "Limited use",
      "Accuracy",
      "Safeguards",
      "Openness",
      "Individual access",
      "Accountability",
    ],
    penaltyRange: "Up to CAD $100,000",
    effectiveDate: "2000-04-13",
  },
  {
    id: "lgpd",
    name: "Lei Geral de Proteção de Dados",
    jurisdiction: "Brazil",
    category: "data-privacy",
    description: "Brazilian general data protection law",
    keyRequirements: [
      "Legal basis",
      "Purpose limitation",
      "Necessity",
      "Free access",
      "Data quality",
      "Transparency",
      "Security",
      "DPO designation",
    ],
    penaltyRange: "Up to 2% of revenue, max R$50M",
    effectiveDate: "2020-09-18",
  },
  {
    id: "pdpa-sg",
    name: "Personal Data Protection Act",
    jurisdiction: "Singapore",
    category: "data-privacy",
    description: "Singapore personal data protection regulation",
    keyRequirements: [
      "Consent",
      "Purpose limitation",
      "Notification",
      "Access and correction",
      "Accuracy",
      "Protection",
      "Retention limitation",
      "Transfer limitation",
    ],
    penaltyRange: "Up to SGD $1M",
    effectiveDate: "2014-07-02",
  },
  {
    id: "appi",
    name: "Act on the Protection of Personal Information",
    jurisdiction: "Japan",
    category: "data-privacy",
    description: "Japanese personal information protection",
    keyRequirements: [
      "Purpose specification",
      "Proper acquisition",
      "Accuracy",
      "Safety management",
      "Third-party restrictions",
      "Cross-border transfer rules",
    ],
    penaltyRange: "Up to ¥100M",
    effectiveDate: "2003-05-30",
  },
  {
    id: "pipl",
    name: "Personal Information Protection Law",
    jurisdiction: "China",
    category: "data-privacy",
    description: "Chinese personal information protection",
    keyRequirements: [
      "Consent and legal basis",
      "Purpose limitation",
      "Minimum necessity",
      "Cross-border transfer assessment",
      "Data localization",
      "DPO appointment",
    ],
    penaltyRange: "Up to ¥50M or 5% of annual revenue",
    effectiveDate: "2021-11-01",
  },
  {
    id: "dpdp",
    name: "Digital Personal Data Protection Act",
    jurisdiction: "India",
    category: "data-privacy",
    description: "Indian digital personal data protection",
    keyRequirements: [
      "Consent-based processing",
      "Purpose limitation",
      "Data minimization",
      "Storage limitation",
      "Data fiduciary obligations",
      "Cross-border transfer rules",
    ],
    penaltyRange: "Up to ₹250 crore (~$30M)",
    effectiveDate: "2023-08-11",
  },
  {
    id: "popia",
    name: "Protection of Personal Information Act",
    jurisdiction: "South Africa",
    category: "data-privacy",
    description: "South African data protection",
    keyRequirements: [
      "Accountability",
      "Processing limitation",
      "Purpose specification",
      "Information quality",
      "Openness",
      "Security safeguards",
    ],
    penaltyRange: "Up to ZAR 10M or imprisonment",
    effectiveDate: "2021-07-01",
  },
  {
    id: "uk-gdpr",
    name: "UK GDPR + Data Protection Act 2018",
    jurisdiction: "United Kingdom",
    category: "data-privacy",
    description: "UK data protection post-Brexit",
    keyRequirements: [
      "Lawful basis",
      "Data minimization",
      "Right to erasure",
      "Data portability",
      "DPO",
      "International transfer mechanisms",
    ],
    penaltyRange: "Up to £17.5M or 4% of global revenue",
    effectiveDate: "2021-01-01",
  },
  {
    id: "kvkk",
    name: "Kişisel Verilerin Korunması Kanunu",
    jurisdiction: "Turkey",
    category: "data-privacy",
    description: "Turkish personal data protection law",
    keyRequirements: [
      "Explicit consent",
      "Data registration",
      "Cross-border transfer approval",
      "Data controller obligations",
      "Retention periods",
    ],
    penaltyRange: "Up to TRY 1.8M",
    effectiveDate: "2016-04-07",
  },
  {
    id: "dora",
    name: "Digital Operational Resilience Act",
    jurisdiction: "European Union",
    category: "financial",
    description: "EU digital operational resilience for financial entities",
    keyRequirements: [
      "ICT risk management",
      "Incident reporting",
      "Digital resilience testing",
      "Third-party risk management",
      "Information sharing",
    ],
    penaltyRange: "Up to 1% of average daily worldwide turnover",
    effectiveDate: "2025-01-17",
  },
];

// ---- Simulation engine ----

function buildSimulationPrompt(
  idea: InnovationIdea,
  jurisdictions: string[],
  frameworks: RegulatoryFramework[]
): string {
  return `You are a regulatory compliance expert. Assess this innovation idea against regulatory frameworks.

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}

Jurisdictions to assess: ${jurisdictions.join(", ")}
Frameworks: ${frameworks.map((f) => `${f.name} (${f.jurisdiction})`).join(", ")}

For each jurisdiction, respond with JSON:
{
  "jurisdictions": [
    {
      "jurisdiction": "jurisdiction name",
      "region": "region (e.g., Europe, North America, Asia-Pacific)",
      "overallStatus": "green|yellow|red",
      "overallScore": <0-1>,
      "frameworkChecks": [
        {
          "frameworkId": "framework-id",
          "frameworkName": "framework name",
          "status": "green|yellow|red",
          "score": <0-1>,
          "findings": [
            {
              "requirement": "specific requirement",
              "status": "compliant|partial|non-compliant|not-applicable",
              "detail": "assessment detail",
              "remediation": "how to fix if needed"
            }
          ]
        }
      ],
      "summary": "brief compliance summary",
      "recommendation": "proceed|proceed-with-modifications|significant-changes-needed|not-recommended"
    }
  ],
  "globalSummary": "overall assessment across all jurisdictions",
  "universalRequirements": ["requirements that apply everywhere"]
}

Be specific about which requirements apply. Rate green for >80% compliant, yellow for 50-80%, red for <50%.`;
}

/** Options for regulatory simulation. */
export interface RegulatorySimulationOptions {
  model?: string;
  signal?: AbortSignal;
  jurisdictions?: string[];
}

/**
 * Simulate idea viability across regulatory jurisdictions.
 */
export async function simulateRegulatory(
  idea: InnovationIdea,
  options: RegulatorySimulationOptions = {}
): Promise<RegulatorySimulation> {
  if (!idea.title || idea.title.trim().length === 0) {
    throw new Error("Idea title is required");
  }

  const targetJurisdictions = options.jurisdictions ?? [
    ...new Set(REGULATORY_FRAMEWORKS.map((f) => f.jurisdiction)),
  ];

  const relevantFrameworks = REGULATORY_FRAMEWORKS.filter((f) =>
    targetJurisdictions.some((j) => f.jurisdiction.toLowerCase().includes(j.toLowerCase()))
  );

  // Use all frameworks if none matched
  const frameworksToUse =
    relevantFrameworks.length > 0 ? relevantFrameworks : REGULATORY_FRAMEWORKS;

  const prompt = buildSimulationPrompt(idea, targetJurisdictions, frameworksToUse);
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse regulatory simulation: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const jurisdictions = z.array(JurisdictionResultSchema).parse(parsed.jurisdictions ?? []);

  const sortedByScore = [...jurisdictions].sort((a, b) => b.overallScore - a.overallScore);
  const lowestRisk = sortedByScore
    .filter((j) => j.overallStatus === "green")
    .map((j) => j.jurisdiction)
    .slice(0, 5);
  const highestRisk = sortedByScore
    .filter((j) => j.overallStatus === "red")
    .map((j) => j.jurisdiction)
    .slice(0, 5);

  const simulation: RegulatorySimulation = {
    ideaTitle: idea.title,
    jurisdictions,
    globalSummary: (parsed.globalSummary as string) ?? "Regulatory assessment complete.",
    lowestRiskJurisdictions: lowestRisk,
    highestRiskJurisdictions: highestRisk,
    universalRequirements: (parsed.universalRequirements as string[]) ?? [],
    simulatedAt: new Date().toISOString(),
  };

  const id = `reg-sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  simulations.set(id, simulation);

  return simulation;
}

/**
 * Get available regulatory frameworks.
 */
export function getRegulatoryFrameworks(jurisdiction?: string): RegulatoryFramework[] {
  if (!jurisdiction) return [...REGULATORY_FRAMEWORKS];
  return REGULATORY_FRAMEWORKS.filter((f) =>
    f.jurisdiction.toLowerCase().includes(jurisdiction.toLowerCase())
  );
}

/**
 * Get a stored simulation by ID.
 */
export function getRegulatorySimulation(id: string): RegulatorySimulation | undefined {
  return simulations.get(id);
}

/**
 * List all stored simulations.
 */
export function listRegulatorySimulations(): Array<{
  id: string;
  ideaTitle: string;
  simulatedAt: string;
}> {
  return Array.from(simulations.entries()).map(([id, s]) => ({
    id,
    ideaTitle: s.ideaTitle,
    simulatedAt: s.simulatedAt,
  }));
}

/**
 * Clear all stored simulations.
 */
export function clearRegulatorySimulations(): void {
  simulations.clear();
}

/**
 * Convert regulatory simulation to Markdown.
 */
export function regulatoryToMarkdown(simulation: RegulatorySimulation): string {
  const lines: string[] = [];
  const statusEmoji = { green: "🟢", yellow: "🟡", red: "🔴" };

  lines.push(`# Regulatory Simulation: ${simulation.ideaTitle}\n`);
  lines.push(`*Simulated: ${simulation.simulatedAt}*\n`);

  lines.push(`## Global Summary\n`);
  lines.push(simulation.globalSummary);

  if (simulation.lowestRiskJurisdictions.length > 0) {
    lines.push(`\n**Lowest Risk:** ${simulation.lowestRiskJurisdictions.join(", ")}`);
  }
  if (simulation.highestRiskJurisdictions.length > 0) {
    lines.push(`**Highest Risk:** ${simulation.highestRiskJurisdictions.join(", ")}`);
  }

  lines.push(`\n## Jurisdiction Details\n`);
  lines.push(`| Jurisdiction | Status | Score | Recommendation |`);
  lines.push(`|-------------|--------|-------|----------------|`);
  for (const j of simulation.jurisdictions) {
    lines.push(
      `| ${j.jurisdiction} | ${statusEmoji[j.overallStatus]} ${j.overallStatus} | ${(j.overallScore * 100).toFixed(0)}% | ${j.recommendation} |`
    );
  }

  for (const j of simulation.jurisdictions) {
    lines.push(`\n### ${j.jurisdiction} (${j.region})\n`);
    lines.push(
      `**Status:** ${statusEmoji[j.overallStatus]} ${j.overallStatus} (${(j.overallScore * 100).toFixed(0)}%)`
    );
    lines.push(`**Recommendation:** ${j.recommendation}\n`);
    lines.push(j.summary);

    for (const fc of j.frameworkChecks) {
      lines.push(
        `\n#### ${fc.frameworkName} — ${statusEmoji[fc.status]} ${(fc.score * 100).toFixed(0)}%\n`
      );
      for (const f of fc.findings) {
        const statusIcon =
          f.status === "compliant"
            ? "✅"
            : f.status === "partial"
              ? "⚠️"
              : f.status === "non-compliant"
                ? "❌"
                : "➖";
        lines.push(`- ${statusIcon} **${f.requirement}**: ${f.detail}`);
        if (f.remediation) lines.push(`  - *Remediation:* ${f.remediation}`);
      }
    }
  }

  if (simulation.universalRequirements.length > 0) {
    lines.push(`\n## Universal Requirements\n`);
    for (const req of simulation.universalRequirements) lines.push(`- ${req}`);
  }

  return lines.join("\n");
}
