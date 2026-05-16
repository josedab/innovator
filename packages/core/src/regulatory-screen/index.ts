/**
 * @module regulatory-screen
 *
 * Regulatory & Compliance Pre-Screen — built-in knowledge base of major
 * regulatory frameworks, LLM-powered screening engine, and pre-gauntlet
 * compliance gate.
 */

import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type {
  RegulatoryFramework,
  ScreeningResult,
  ScreeningReport,
  RegulatoryScreenConfig,
} from "./types.js";
import {
  RegulatoryFrameworkSchema,
  ScreeningResultSchema,
  ScreeningReportSchema,
  RegulatoryRiskSchema,
} from "./types.js";

export * from "./types.js";

// ---- Built-in Regulatory Knowledge Base ----

const REGULATORY_DATABASE: RegulatoryFramework[] = [
  {
    id: "gdpr",
    name: "General Data Protection Regulation",
    shortCode: "GDPR",
    jurisdiction: "European Union",
    applicableDomains: ["technology", "healthcare", "fintech", "e-commerce", "social-media"],
    provisions: [
      {
        id: "gdpr-art5",
        clause: "Article 5",
        title: "Principles of Processing",
        summary:
          "Data must be processed lawfully, fairly, and transparently with purpose limitation and data minimization.",
        riskAreas: ["data-collection", "analytics", "profiling"],
      },
      {
        id: "gdpr-art6",
        clause: "Article 6",
        title: "Lawful Basis",
        summary:
          "Processing requires a lawful basis: consent, contract, legal obligation, vital interests, public task, or legitimate interests.",
        riskAreas: ["consent", "data-processing"],
      },
      {
        id: "gdpr-art17",
        clause: "Article 17",
        title: "Right to Erasure",
        summary: "Individuals have the right to have their personal data deleted.",
        riskAreas: ["data-retention", "user-accounts"],
      },
      {
        id: "gdpr-art25",
        clause: "Article 25",
        title: "Data Protection by Design",
        summary: "Data protection must be integrated into system design and default settings.",
        riskAreas: ["architecture", "defaults"],
      },
    ],
    penaltyRange: "Up to €20M or 4% of global annual turnover",
    lastUpdated: "2024-01-01",
  },
  {
    id: "hipaa",
    name: "Health Insurance Portability and Accountability Act",
    shortCode: "HIPAA",
    jurisdiction: "United States",
    applicableDomains: ["healthcare", "health-tech", "insurance", "pharma"],
    provisions: [
      {
        id: "hipaa-privacy",
        clause: "Privacy Rule",
        title: "Protected Health Information",
        summary:
          "Establishes standards for protecting individually identifiable health information.",
        riskAreas: ["health-data", "patient-records"],
      },
      {
        id: "hipaa-security",
        clause: "Security Rule",
        title: "Electronic PHI Safeguards",
        summary: "Requires administrative, physical, and technical safeguards for electronic PHI.",
        riskAreas: ["encryption", "access-control", "infrastructure"],
      },
      {
        id: "hipaa-breach",
        clause: "Breach Notification Rule",
        title: "Breach Notification",
        summary: "Requires notification to individuals and HHS of breaches of unsecured PHI.",
        riskAreas: ["incident-response", "monitoring"],
      },
    ],
    penaltyRange: "$100-$50,000 per violation, up to $1.5M annually",
    lastUpdated: "2024-01-01",
  },
  {
    id: "pci-dss",
    name: "Payment Card Industry Data Security Standard",
    shortCode: "PCI-DSS",
    jurisdiction: "Global",
    applicableDomains: ["fintech", "e-commerce", "retail", "payments"],
    provisions: [
      {
        id: "pci-req3",
        clause: "Requirement 3",
        title: "Protect Stored Account Data",
        summary: "Stored cardholder data must be protected with encryption and access controls.",
        riskAreas: ["payments", "data-storage", "encryption"],
      },
      {
        id: "pci-req6",
        clause: "Requirement 6",
        title: "Secure Systems and Software",
        summary: "Develop and maintain secure systems and software.",
        riskAreas: ["software-development", "vulnerabilities"],
      },
    ],
    penaltyRange: "$5,000-$100,000 per month of non-compliance",
    lastUpdated: "2024-01-01",
  },
  {
    id: "sox",
    name: "Sarbanes-Oxley Act",
    shortCode: "SOX",
    jurisdiction: "United States",
    applicableDomains: ["fintech", "enterprise-software", "accounting"],
    provisions: [
      {
        id: "sox-s302",
        clause: "Section 302",
        title: "Corporate Responsibility",
        summary:
          "Officers must certify the accuracy of financial statements and internal controls.",
        riskAreas: ["financial-reporting", "auditing"],
      },
      {
        id: "sox-s404",
        clause: "Section 404",
        title: "Internal Controls",
        summary: "Management must assess and report on internal controls over financial reporting.",
        riskAreas: ["internal-controls", "audit-trails"],
      },
    ],
    penaltyRange: "Up to $5M fine and 20 years imprisonment",
    lastUpdated: "2024-01-01",
  },
  {
    id: "fda",
    name: "Food and Drug Administration Regulations",
    shortCode: "FDA",
    jurisdiction: "United States",
    applicableDomains: ["healthcare", "pharma", "medical-devices", "food-tech", "biotech"],
    provisions: [
      {
        id: "fda-510k",
        clause: "510(k)",
        title: "Premarket Notification",
        summary:
          "Medical devices must demonstrate substantial equivalence to a legally marketed device.",
        riskAreas: ["medical-devices", "product-launch"],
      },
      {
        id: "fda-cgmp",
        clause: "21 CFR Part 820",
        title: "Quality System Regulation",
        summary: "Current Good Manufacturing Practice requirements for medical devices.",
        riskAreas: ["manufacturing", "quality-control"],
      },
    ],
    penaltyRange: "Seizure, injunction, civil/criminal penalties",
    lastUpdated: "2024-01-01",
  },
  {
    id: "fcc",
    name: "Federal Communications Commission Regulations",
    shortCode: "FCC",
    jurisdiction: "United States",
    applicableDomains: ["telecommunications", "iot", "hardware", "wireless"],
    provisions: [
      {
        id: "fcc-part15",
        clause: "Part 15",
        title: "Radio Frequency Devices",
        summary: "Regulates unlicensed radio frequency transmissions from electronic devices.",
        riskAreas: ["wireless", "iot-devices", "hardware"],
      },
      {
        id: "fcc-tcpa",
        clause: "TCPA",
        title: "Telephone Consumer Protection Act",
        summary:
          "Restricts telemarketing calls, auto-dialed calls, prerecorded calls, and unsolicited faxes.",
        riskAreas: ["marketing", "communications"],
      },
    ],
    penaltyRange: "Up to $500-$1,500 per violation",
    lastUpdated: "2024-01-01",
  },
];

/** Returns the built-in regulatory database. */
export function getRegulatoryDatabase(): RegulatoryFramework[] {
  return REGULATORY_DATABASE.map((f) => RegulatoryFrameworkSchema.parse(f));
}

// ---- Screening Engine ----

/**
 * Screen a single idea against applicable regulatory frameworks.
 */
export async function screenIdea(
  ideaTitle: string,
  ideaDescription: string,
  config: RegulatoryScreenConfig = {}
): Promise<ScreeningResult> {
  let frameworks = REGULATORY_DATABASE;

  if (config.frameworkIds?.length) {
    frameworks = frameworks.filter((f) => config.frameworkIds!.includes(f.id));
  }

  if (config.domains?.length) {
    frameworks = frameworks.filter((f) =>
      f.applicableDomains.some((d) => config.domains!.includes(d))
    );
  }

  if (frameworks.length === 0) {
    return ScreeningResultSchema.parse({
      ideaTitle,
      ideaDescription,
      overallRisk: "none",
      risks: [],
      clearance: "cleared",
      conditions: [],
      summary: "No applicable regulatory frameworks found for this idea.",
      screenedAt: new Date().toISOString(),
    });
  }

  const frameworkSummary = frameworks.map((f) => ({
    id: f.id,
    shortCode: f.shortCode,
    provisions: f.provisions.map((p) => ({
      clause: p.clause,
      title: p.title,
      summary: p.summary,
      riskAreas: p.riskAreas,
    })),
  }));

  const prompt = `You are a regulatory compliance expert. Screen this innovation idea against applicable regulations.

${wrapUserInput("IDEA", `${ideaTitle}: ${ideaDescription}`)}

APPLICABLE REGULATIONS:
${JSON.stringify(frameworkSummary, null, 2)}

For each regulation, assess:
1. Which specific clauses/provisions are relevant
2. Risk level (none, low, medium, high, critical)
3. Specific compliance risks
4. Mitigation suggestions
5. Estimated compliance effort

Respond in JSON:
{
  "risks": [
    {
      "frameworkId": "<id>",
      "frameworkName": "<name>",
      "clause": "<clause reference>",
      "clauseTitle": "<title>",
      "riskLevel": "<none|low|medium|high|critical>",
      "description": "<specific risk>",
      "mitigations": ["<suggestion1>"],
      "complianceEffort": "<minimal|moderate|significant|extensive>"
    }
  ],
  "overallRisk": "<none|low|medium|high|critical>",
  "clearance": "<cleared|conditional|blocked>",
  "conditions": ["<condition if conditional>"],
  "summary": "<brief summary>"
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal: config.signal }
  );

  const risks = (result.risks ?? [])
    .slice(0, 50)
    .map((r: Record<string, unknown>) => {
      try {
        return RegulatoryRiskSchema.parse({
          frameworkId: String(r.frameworkId ?? "").slice(0, 100),
          frameworkName: String(r.frameworkName ?? "").slice(0, 300),
          clause: String(r.clause ?? "").slice(0, 200),
          clauseTitle: String(r.clauseTitle ?? "").slice(0, 500),
          riskLevel: r.riskLevel ?? "low",
          description: String(r.description ?? "").slice(0, 3000),
          mitigations: (Array.isArray(r.mitigations) ? r.mitigations : [])
            .slice(0, 10)
            .map((m: unknown) => String(m).slice(0, 1000)),
          complianceEffort: r.complianceEffort ?? "moderate",
        });
      } catch {
        return null;
      }
    })
    .filter((r: unknown): r is NonNullable<typeof r> => r !== null);

  return ScreeningResultSchema.parse({
    ideaTitle,
    ideaDescription,
    overallRisk: result.overallRisk ?? "low",
    risks,
    clearance: result.clearance ?? "conditional",
    conditions: (result.conditions ?? [])
      .slice(0, 20)
      .map((c: unknown) => String(c).slice(0, 1000)),
    summary: String(result.summary ?? "Screening complete.").slice(0, 5000),
    screenedAt: new Date().toISOString(),
  });
}

/**
 * Screen a batch of ideas and produce a screening report.
 */
export async function screenBatch(
  ideas: Array<{ title: string; description: string }>,
  config: RegulatoryScreenConfig = {}
): Promise<ScreeningReport> {
  const results: ScreeningResult[] = [];

  for (const idea of ideas) {
    if (config.signal?.aborted) break;
    try {
      const result = await screenIdea(idea.title, idea.description, config);
      results.push(result);
    } catch {
      results.push({
        ideaTitle: idea.title,
        ideaDescription: idea.description,
        overallRisk: "medium",
        risks: [],
        clearance: "conditional",
        conditions: ["Screening failed — manual review required."],
        summary: "Automated screening failed. Manual compliance review needed.",
        screenedAt: new Date().toISOString(),
      });
    }
  }

  // Aggregate framework hits
  const frameworkHits = new Map<string, { name: string; count: number }>();
  for (const result of results) {
    for (const risk of result.risks) {
      const existing = frameworkHits.get(risk.frameworkId) ?? {
        name: risk.frameworkName,
        count: 0,
      };
      existing.count++;
      frameworkHits.set(risk.frameworkId, existing);
    }
  }

  return ScreeningReportSchema.parse({
    id: randomUUID(),
    results,
    totalScreened: results.length,
    cleared: results.filter((r) => r.clearance === "cleared").length,
    conditional: results.filter((r) => r.clearance === "conditional").length,
    blocked: results.filter((r) => r.clearance === "blocked").length,
    topFrameworks: Array.from(frameworkHits.entries())
      .map(([id, data]) => ({ frameworkId: id, frameworkName: data.name, hitCount: data.count }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20),
    generatedAt: new Date().toISOString(),
  });
}
