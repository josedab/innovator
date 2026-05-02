/**
 * @module compliance
 *
 * Compliance & IP guard rails — pre-screens generated ideas against known
 * patents, trademarks, and regulatory constraints. Provides industry-specific
 * regulatory databases, risk indicators, and IP report generation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Zod Schemas ----

/** Risk level classification. */
export const RiskLevelSchema = z.enum(["none", "low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** Schema for a single IP risk indicator. */
export const IPRiskIndicatorSchema = z.object({
  category: z.enum(["patent", "trademark", "copyright", "trade-secret", "regulatory"]),
  riskLevel: RiskLevelSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  references: z.array(z.string().max(500)).max(10).optional(),
  mitigationSuggestion: z.string().max(1000).optional(),
});

/** Schema for an industry-specific regulatory constraint. */
export const RegulatoryConstraintSchema = z.object({
  industry: z.string().max(200),
  regulation: z.string().max(500),
  authority: z.string().max(200),
  description: z.string().max(2000),
  complianceRequirements: z.array(z.string().max(500)).max(10),
  riskLevel: RiskLevelSchema,
});

/** Schema for a complete IP screening result for a single idea. */
export const IPScreeningResultSchema = z.object({
  ideaTitle: z.string().max(500),
  overallRisk: RiskLevelSchema,
  riskScore: z.number().min(0).max(100),
  indicators: z.array(IPRiskIndicatorSchema).max(20),
  regulatoryConstraints: z.array(RegulatoryConstraintSchema).max(10),
  recommendation: z.string().max(2000),
  disclaimer: z.string().max(1000),
  screenedAt: z.string(),
});

/** Schema for a full IP compliance report. */
export const IPComplianceReportSchema = z.object({
  domain: z.string().max(200),
  industry: z.string().max(200),
  results: z.array(IPScreeningResultSchema).max(100),
  overallAssessment: z.string().max(2000),
  highRiskCount: z.number(),
  totalScreened: z.number(),
  generatedAt: z.string(),
});

export type IPRiskIndicator = z.infer<typeof IPRiskIndicatorSchema>;
export type RegulatoryConstraint = z.infer<typeof RegulatoryConstraintSchema>;
export type IPScreeningResult = z.infer<typeof IPScreeningResultSchema>;
export type IPComplianceReport = z.infer<typeof IPComplianceReportSchema>;

// ---- Industry Regulatory Databases ----

/** Known regulatory frameworks by industry. */
export const INDUSTRY_REGULATIONS: Record<string, RegulatoryConstraint[]> = {
  healthcare: [
    {
      industry: "healthcare",
      regulation: "HIPAA",
      authority: "HHS (USA)",
      description: "Health Insurance Portability and Accountability Act — protects patient health information",
      complianceRequirements: [
        "PHI data encryption at rest and in transit",
        "Business Associate Agreements",
        "Access control and audit trails",
        "Breach notification procedures",
      ],
      riskLevel: "high",
    },
    {
      industry: "healthcare",
      regulation: "FDA 21 CFR Part 11",
      authority: "FDA (USA)",
      description: "Electronic records and signatures for FDA-regulated products",
      complianceRequirements: [
        "Electronic signature validation",
        "Audit trails for record changes",
        "System validation documentation",
        "Access controls and authority checks",
      ],
      riskLevel: "high",
    },
    {
      industry: "healthcare",
      regulation: "MDR (EU 2017/745)",
      authority: "European Commission",
      description: "Medical Device Regulation for devices sold in the EU",
      complianceRequirements: [
        "Clinical evaluation and investigation",
        "Unique Device Identification (UDI)",
        "Post-market surveillance",
        "Conformity assessment",
      ],
      riskLevel: "high",
    },
  ],
  fintech: [
    {
      industry: "fintech",
      regulation: "SOX",
      authority: "SEC (USA)",
      description: "Sarbanes-Oxley Act — financial reporting and internal controls",
      complianceRequirements: [
        "Internal control documentation",
        "Financial reporting accuracy",
        "Management assessment of controls",
        "Independent auditor attestation",
      ],
      riskLevel: "high",
    },
    {
      industry: "fintech",
      regulation: "PCI DSS",
      authority: "PCI SSC",
      description: "Payment Card Industry Data Security Standard",
      complianceRequirements: [
        "Secure network architecture",
        "Cardholder data protection",
        "Vulnerability management",
        "Strong access controls",
        "Regular monitoring and testing",
      ],
      riskLevel: "high",
    },
    {
      industry: "fintech",
      regulation: "AML/KYC",
      authority: "FinCEN (USA) / FCA (UK)",
      description: "Anti-Money Laundering and Know Your Customer requirements",
      complianceRequirements: [
        "Customer identity verification",
        "Transaction monitoring",
        "Suspicious activity reporting",
        "Risk-based due diligence",
      ],
      riskLevel: "high",
    },
  ],
  "data-privacy": [
    {
      industry: "data-privacy",
      regulation: "GDPR",
      authority: "European Commission",
      description: "General Data Protection Regulation",
      complianceRequirements: [
        "Lawful basis for data processing",
        "Data subject rights (access, erasure, portability)",
        "Data Protection Impact Assessments",
        "72-hour breach notification",
        "Data Processing Agreements",
      ],
      riskLevel: "high",
    },
    {
      industry: "data-privacy",
      regulation: "CCPA/CPRA",
      authority: "California AG",
      description: "California Consumer Privacy Act / California Privacy Rights Act",
      complianceRequirements: [
        "Consumer right to know, delete, opt-out",
        "Privacy policy disclosures",
        "Do Not Sell My Personal Information link",
        "Data minimization principles",
      ],
      riskLevel: "medium",
    },
  ],
  "artificial-intelligence": [
    {
      industry: "artificial-intelligence",
      regulation: "EU AI Act",
      authority: "European Commission",
      description: "Regulation laying down harmonised rules on artificial intelligence",
      complianceRequirements: [
        "Risk classification of AI systems",
        "High-risk AI system requirements",
        "Transparency obligations",
        "Human oversight provisions",
        "Data governance and documentation",
      ],
      riskLevel: "high",
    },
  ],
};

/** Get regulatory constraints for an industry. */
export function getIndustryRegulations(industry: string): RegulatoryConstraint[] {
  const key = industry.toLowerCase().replace(/\s+/g, "-");
  return INDUSTRY_REGULATIONS[key] ?? [];
}

/** List all known industries with regulations. */
export function listRegulatedIndustries(): string[] {
  return Object.keys(INDUSTRY_REGULATIONS);
}

// ---- IP Screening ----

/** Standard disclaimer for all IP screening results. */
const IP_DISCLAIMER =
  "This IP screening is AI-generated and for informational purposes only. " +
  "It does not constitute legal advice. Consult with a qualified IP attorney " +
  "before making business decisions based on these results.";

/**
 * Screen a single idea for IP and compliance risks.
 *
 * @param idea - The innovation idea to screen
 * @param domain - The domain/industry context
 * @param industry - Optional industry for regulatory checks
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns An IPScreeningResult with risk indicators and recommendations
 */
export async function screenIdea(
  idea: InnovationIdea,
  domain: string,
  industry?: string,
  model?: string,
  signal?: AbortSignal
): Promise<IPScreeningResult> {
  // Get applicable regulatory constraints
  const regulations = industry ? getIndustryRegulations(industry) : [];

  const prompt = `You are an intellectual property and regulatory compliance analyst. Screen the following innovation idea for IP risks and regulatory concerns.

${wrapUserInput("IDEA", `${idea.title}: ${idea.description}`)}
${wrapUserInput("DOMAIN", domain)}
${industry ? wrapUserInput("INDUSTRY", industry) : ""}

${regulations.length > 0 ? `APPLICABLE REGULATIONS:\n${sanitizeLlmOutput(JSON.stringify(regulations.map((r) => `${r.regulation} (${r.authority}): ${r.description}`), null, 2))}` : ""}

Analyze for:
1. **Patent risks**: Likelihood of existing patents, prior art, freedom to operate
2. **Trademark risks**: Potential naming/branding conflicts
3. **Regulatory risks**: Compliance requirements for the target industry
4. **Trade secret considerations**: Risk of inadvertent disclosure
5. **Copyright concerns**: Content/code originality

You MUST respond with valid JSON only:
{
  "riskScore": <0-100, overall IP risk>,
  "indicators": [
    {
      "category": "patent|trademark|copyright|trade-secret|regulatory",
      "riskLevel": "none|low|medium|high|critical",
      "title": "Risk title",
      "description": "Detailed description",
      "references": ["Reference"],
      "mitigationSuggestion": "How to mitigate"
    }
  ],
  "recommendation": "Overall recommendation for proceeding"
}`;

  let riskScore = 0;
  let indicators: IPRiskIndicator[] = [];
  let recommendation = "";

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      riskScore: number;
      indicators: IPRiskIndicator[];
      recommendation: string;
    };

    riskScore = Math.max(0, Math.min(100, parsed.riskScore));
    indicators = parsed.indicators ?? [];
    recommendation = parsed.recommendation ?? "";
  } catch {
    indicators = [{
      category: "patent",
      riskLevel: "medium",
      title: "Screening Incomplete",
      description: "IP screening could not be completed. Manual review recommended.",
    }];
    riskScore = 50;
    recommendation = "Automated screening was incomplete. Consult an IP attorney for thorough review.";
  }

  // Add regulatory constraints as indicators
  for (const reg of regulations) {
    indicators.push({
      category: "regulatory",
      riskLevel: reg.riskLevel,
      title: `${reg.regulation} Compliance`,
      description: `${reg.description}. Requirements: ${reg.complianceRequirements.join("; ")}`,
      references: [`${reg.authority}`],
      mitigationSuggestion: `Ensure compliance with all ${reg.regulation} requirements before launch.`,
    });
  }

  const overallRisk = riskScoreToLevel(riskScore);

  return {
    ideaTitle: idea.title,
    overallRisk,
    riskScore,
    indicators,
    regulatoryConstraints: regulations,
    recommendation,
    disclaimer: IP_DISCLAIMER,
    screenedAt: new Date().toISOString(),
  };
}

/**
 * Screen multiple ideas and produce a compliance report.
 *
 * @param ideas - Array of innovation ideas to screen
 * @param domain - The domain/industry context
 * @param industry - Optional industry for regulatory checks
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns An IPComplianceReport with results for each idea
 */
export async function screenIdeas(
  ideas: InnovationIdea[],
  domain: string,
  industry?: string,
  model?: string,
  signal?: AbortSignal
): Promise<IPComplianceReport> {
  const results: IPScreeningResult[] = [];

  for (const idea of ideas) {
    if (signal?.aborted) break;
    const result = await screenIdea(idea, domain, industry, model, signal);
    results.push(result);
  }

  const highRiskCount = results.filter(
    (r) => r.overallRisk === "high" || r.overallRisk === "critical"
  ).length;

  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.riskScore, 0) / results.length)
    : 0;

  return {
    domain,
    industry: industry ?? "general",
    results,
    overallAssessment: buildOverallAssessment(results, highRiskCount),
    highRiskCount,
    totalScreened: results.length,
    generatedAt: new Date().toISOString(),
  };
}

function riskScoreToLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "none";
}

function buildOverallAssessment(results: IPScreeningResult[], highRiskCount: number): string {
  if (results.length === 0) return "No ideas screened.";
  if (highRiskCount === 0) {
    return `All ${results.length} ideas screened with no high-risk indicators. Proceed with standard IP due diligence.`;
  }
  return `${highRiskCount} of ${results.length} ideas have high or critical IP risk. Review flagged ideas carefully before proceeding. ${IP_DISCLAIMER}`;
}

/**
 * Export an IP compliance report as markdown.
 */
export function complianceReportToMarkdown(report: IPComplianceReport): string {
  const lines: string[] = [
    "# IP Compliance Report",
    "",
    `**Domain:** ${report.domain}`,
    `**Industry:** ${report.industry}`,
    `**Generated:** ${report.generatedAt}`,
    `**Total Screened:** ${report.totalScreened}`,
    `**High Risk:** ${report.highRiskCount}`,
    "",
    `> ⚠️ ${IP_DISCLAIMER}`,
    "",
    "## Overall Assessment",
    "",
    report.overallAssessment,
    "",
    "## Results",
    "",
  ];

  for (const result of report.results) {
    const riskIcon =
      result.overallRisk === "critical" ? "🔴" :
      result.overallRisk === "high" ? "🟠" :
      result.overallRisk === "medium" ? "🟡" :
      result.overallRisk === "low" ? "🟢" : "⚪";

    lines.push(`### ${riskIcon} ${result.ideaTitle}`);
    lines.push("");
    lines.push(`**Risk Level:** ${result.overallRisk} (Score: ${result.riskScore}/100)`);
    lines.push(`**Recommendation:** ${result.recommendation}`);
    lines.push("");

    if (result.indicators.length > 0) {
      lines.push("| Category | Risk | Finding |");
      lines.push("|----------|------|---------|");
      for (const ind of result.indicators) {
        lines.push(`| ${ind.category} | ${ind.riskLevel} | ${ind.title}: ${ind.description.slice(0, 100)} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
