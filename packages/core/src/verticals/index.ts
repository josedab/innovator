/**
 * @module verticals
 *
 * Industry Vertical Packs: curated bundles for specific industries with
 * domain-specific angles, regulatory context, market data, and validation rules.
 * Supports built-in packs (HealthTech, FinTech, EdTech, CleanTech, GovTech)
 * and community-contributed packs via npm / .innovator.pack.json.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for a regulatory item within a vertical pack. */
export const RegulatoryContextSchema = z.object({
  name: z.string().max(200),
  jurisdiction: z.string().max(200),
  description: z.string().max(2000),
  impactLevel: z.enum(["critical", "high", "medium", "low"]),
  complianceUrl: z.string().max(500).optional(),
});

/** Schema for market data within a vertical pack. */
export const MarketDataSchema = z.object({
  metric: z.string().max(200),
  value: z.string().max(500),
  source: z.string().max(500).optional(),
  year: z.number().optional(),
});

/** Schema for a validation rule applied to ideas in a vertical. */
export const ValidationRuleSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000),
  check: z.string().max(2000).describe("Natural language description of what to validate"),
  severity: z.enum(["error", "warning", "info"]),
});

/** Schema for a domain-specific innovation angle within a vertical. */
export const VerticalAngleSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  description: z.string().max(2000),
  promptContext: z
    .string()
    .max(5000)
    .describe("Domain-specific prompt context injected into angle generation"),
  icon: z.string().max(10).optional(),
});

/** Schema for a complete vertical pack. */
export const VerticalPackSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  description: z.string().max(2000),
  industry: z.string().max(200),
  version: z.string().max(50),
  icon: z.string().max(10).optional(),
  author: z.string().max(200).optional(),
  angles: z.array(VerticalAngleSchema).max(20),
  regulatoryContext: z.array(RegulatoryContextSchema).max(30),
  marketData: z.array(MarketDataSchema).max(50),
  validationRules: z.array(ValidationRuleSchema).max(30),
  keywords: z.array(z.string().max(100)).max(30),
  promptPrefix: z
    .string()
    .max(5000)
    .optional()
    .describe("Injected at the start of all prompts for this vertical"),
});

// ---- Types ----

export type RegulatoryContext = z.infer<typeof RegulatoryContextSchema>;
export type MarketData = z.infer<typeof MarketDataSchema>;
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
export type VerticalAngle = z.infer<typeof VerticalAngleSchema>;
export type VerticalPack = z.infer<typeof VerticalPackSchema>;

// ---- Built-in Packs ----

export const HEALTHTECH_PACK: VerticalPack = {
  id: "healthtech",
  name: "HealthTech",
  description: "Innovation pack for healthcare technology, digital health, and medical devices",
  industry: "Healthcare & Life Sciences",
  version: "1.0.0",
  icon: "🏥",
  angles: [
    {
      id: "patient-outcomes",
      name: "Patient Outcomes Focus",
      description: "Generate ideas that directly improve patient health outcomes and experience",
      promptContext:
        "Focus on measurable patient outcomes: mortality reduction, readmission rates, patient satisfaction (HCAHPS), treatment adherence, and quality-adjusted life years (QALYs). Consider health equity and access disparities.",
      icon: "❤️",
    },
    {
      id: "clinical-workflow",
      name: "Clinical Workflow Optimization",
      description: "Ideas that reduce clinician burden and improve care delivery efficiency",
      promptContext:
        "Focus on reducing administrative burden, optimizing EHR workflows, minimizing alert fatigue, enabling team-based care, and improving clinical decision support without disrupting existing workflows.",
      icon: "⚕️",
    },
    {
      id: "health-data",
      name: "Health Data Innovation",
      description: "Leverage health data (EHR, claims, genomics, wearables) for new insights",
      promptContext:
        "Consider interoperability standards (FHIR, HL7), data de-identification, real-world evidence generation, predictive analytics, and population health management. Address data silos and consent management.",
      icon: "📊",
    },
  ],
  regulatoryContext: [
    {
      name: "HIPAA",
      jurisdiction: "United States",
      description:
        "Health Insurance Portability and Accountability Act — governs protected health information (PHI)",
      impactLevel: "critical",
    },
    {
      name: "FDA Software as Medical Device",
      jurisdiction: "United States",
      description: "FDA regulation of software intended for medical purposes (SaMD)",
      impactLevel: "critical",
    },
    {
      name: "GDPR Health Data",
      jurisdiction: "European Union",
      description: "GDPR special category protections for health data processing",
      impactLevel: "high",
    },
    {
      name: "21st Century Cures Act",
      jurisdiction: "United States",
      description: "Promotes interoperability and patient access to health information",
      impactLevel: "medium",
    },
  ],
  marketData: [
    {
      metric: "Global Digital Health Market Size",
      value: "$330B (2025)",
      source: "Grand View Research",
      year: 2025,
    },
    { metric: "Telehealth Adoption Rate", value: "38% of visits", source: "McKinsey", year: 2024 },
    {
      metric: "Healthcare AI Market CAGR",
      value: "45.3%",
      source: "Markets and Markets",
      year: 2024,
    },
    { metric: "EHR Market Penetration (US)", value: "96% of hospitals", source: "ONC", year: 2024 },
  ],
  validationRules: [
    {
      id: "hipaa-compliance",
      name: "HIPAA Compliance Check",
      description: "Ensure idea addresses PHI handling requirements",
      check:
        "Does the idea involve protected health information? If so, does it include HIPAA-compliant data handling?",
      severity: "error",
    },
    {
      id: "clinical-evidence",
      name: "Clinical Evidence Requirement",
      description: "Ideas making clinical claims must reference evidence basis",
      check:
        "Does the idea make clinical efficacy claims? If so, is there a plan for clinical validation or evidence generation?",
      severity: "warning",
    },
    {
      id: "health-equity",
      name: "Health Equity Assessment",
      description: "Consider impact on underserved populations",
      check:
        "Does the idea consider access for underserved communities, health literacy levels, and digital divide?",
      severity: "info",
    },
  ],
  keywords: [
    "healthcare",
    "healthtech",
    "medtech",
    "digital-health",
    "telehealth",
    "EHR",
    "clinical",
    "patient",
    "pharma",
  ],
  promptPrefix:
    "You are innovating in the healthcare technology space. All ideas must consider patient safety, clinical validation requirements, regulatory compliance (HIPAA/FDA/GDPR), and health equity. Prioritize ideas with measurable health outcomes.",
};

export const FINTECH_PACK: VerticalPack = {
  id: "fintech",
  name: "FinTech",
  description: "Innovation pack for financial technology, payments, and banking",
  industry: "Financial Services",
  version: "1.0.0",
  icon: "💰",
  angles: [
    {
      id: "financial-inclusion",
      name: "Financial Inclusion",
      description: "Ideas that expand access to financial services for underbanked populations",
      promptContext:
        "Focus on reducing barriers to financial access: identity verification for unbanked, micro-savings, mobile-first financial products, cross-border remittances, and credit scoring for thin-file consumers.",
      icon: "🌍",
    },
    {
      id: "embedded-finance",
      name: "Embedded Finance",
      description: "Integrate financial services into non-financial platforms and workflows",
      promptContext:
        "Consider Banking-as-a-Service (BaaS), embedded payments, point-of-sale lending, insurance integration, and infrastructure APIs. Focus on reducing friction in financial transactions within existing user journeys.",
      icon: "🔗",
    },
    {
      id: "risk-compliance",
      name: "Risk & Compliance Innovation",
      description: "Modernize risk management, fraud detection, and regulatory compliance",
      promptContext:
        "Focus on real-time transaction monitoring, AI-powered fraud detection, RegTech automation, KYC/AML optimization, and explainable AI for credit decisions. Consider model risk management and fairness requirements.",
      icon: "🛡️",
    },
  ],
  regulatoryContext: [
    {
      name: "PSD2/PSD3",
      jurisdiction: "European Union",
      description:
        "Payment Services Directive — open banking, strong customer authentication (SCA)",
      impactLevel: "critical",
    },
    {
      name: "SOX Compliance",
      jurisdiction: "United States",
      description: "Sarbanes-Oxley Act — financial reporting controls and audit requirements",
      impactLevel: "high",
    },
    {
      name: "AML/KYC Regulations",
      jurisdiction: "Global",
      description: "Anti-Money Laundering and Know Your Customer requirements",
      impactLevel: "critical",
    },
    {
      name: "CFPB Regulations",
      jurisdiction: "United States",
      description: "Consumer Financial Protection Bureau — fair lending and consumer protection",
      impactLevel: "high",
    },
  ],
  marketData: [
    { metric: "Global FinTech Market Size", value: "$305B (2025)", source: "Statista", year: 2025 },
    {
      metric: "Digital Payments Volume",
      value: "$11.6T",
      source: "McKinsey Global Payments Report",
      year: 2024,
    },
    {
      metric: "Embedded Finance Revenue",
      value: "$138B (projected 2026)",
      source: "Bain & Company",
      year: 2024,
    },
    { metric: "RegTech Market Size", value: "$19B", source: "Grand View Research", year: 2024 },
  ],
  validationRules: [
    {
      id: "regulatory-compliance",
      name: "Regulatory Compliance Check",
      description: "Ensure idea complies with relevant financial regulations",
      check:
        "Does the idea handle financial data or transactions? If so, does it address relevant regulatory requirements (PSD2, AML/KYC, SOX)?",
      severity: "error",
    },
    {
      id: "consumer-protection",
      name: "Consumer Protection Assessment",
      description: "Evaluate consumer protection implications",
      check:
        "Does the idea involve consumer-facing financial products? If so, does it address fair lending, transparency, and dispute resolution?",
      severity: "warning",
    },
    {
      id: "financial-inclusion-impact",
      name: "Financial Inclusion Impact",
      description: "Consider impact on underserved financial populations",
      check:
        "Could this idea benefit unbanked or underbanked populations? Are there accessibility considerations?",
      severity: "info",
    },
  ],
  keywords: [
    "fintech",
    "payments",
    "banking",
    "lending",
    "insurance",
    "regtech",
    "defi",
    "neobank",
    "embedded-finance",
  ],
  promptPrefix:
    "You are innovating in the financial technology space. All ideas must consider regulatory compliance, consumer protection, data security, and financial inclusion. Prioritize ideas that reduce friction while maintaining trust and safety.",
};

export const EDTECH_PACK: VerticalPack = {
  id: "edtech",
  name: "EdTech",
  description: "Innovation pack for education technology and learning platforms",
  industry: "Education",
  version: "1.0.0",
  icon: "📚",
  angles: [
    {
      id: "adaptive-learning",
      name: "Adaptive Learning",
      description: "Personalized learning paths based on student performance and preferences",
      promptContext:
        "Focus on learning analytics, knowledge graphs, spaced repetition, formative assessment, and mastery-based progression. Consider diverse learning styles and neurodiversity.",
      icon: "🧠",
    },
    {
      id: "educator-empowerment",
      name: "Educator Empowerment",
      description: "Tools that enhance teacher effectiveness without adding burden",
      promptContext:
        "Focus on automated grading, lesson plan generation, student engagement analytics, parent communication, and professional development. Reduce administrative overhead while preserving teacher autonomy.",
      icon: "👩‍🏫",
    },
  ],
  regulatoryContext: [
    {
      name: "FERPA",
      jurisdiction: "United States",
      description: "Family Educational Rights and Privacy Act — student data protection",
      impactLevel: "critical",
    },
    {
      name: "COPPA",
      jurisdiction: "United States",
      description: "Children's Online Privacy Protection Act — applies to users under 13",
      impactLevel: "critical",
    },
  ],
  marketData: [
    { metric: "Global EdTech Market Size", value: "$340B (2025)", source: "HolonIQ", year: 2025 },
    { metric: "K-12 EdTech Spending (US)", value: "$35B", source: "EdSurge", year: 2024 },
  ],
  validationRules: [
    {
      id: "student-privacy",
      name: "Student Data Privacy",
      description: "Ensure compliance with student data protection laws",
      check:
        "Does the idea collect student data? If so, does it address FERPA/COPPA compliance and parental consent?",
      severity: "error",
    },
  ],
  keywords: ["edtech", "education", "learning", "lms", "e-learning", "curriculum", "assessment"],
  promptPrefix:
    "You are innovating in education technology. Prioritize ideas that improve learning outcomes, are evidence-based, consider accessibility (WCAG), and comply with student data privacy regulations.",
};

export const CLEANTECH_PACK: VerticalPack = {
  id: "cleantech",
  name: "CleanTech",
  description: "Innovation pack for clean energy, sustainability, and environmental technology",
  industry: "Clean Energy & Environment",
  version: "1.0.0",
  icon: "🌱",
  angles: [
    {
      id: "decarbonization",
      name: "Decarbonization Pathways",
      description: "Ideas to reduce carbon emissions across industries",
      promptContext:
        "Focus on renewable energy integration, energy efficiency, carbon capture, electrification of transport and heating, and Scope 1/2/3 emission reduction strategies.",
      icon: "🌍",
    },
    {
      id: "circular-economy",
      name: "Circular Economy",
      description: "Reduce waste through reuse, recycling, and sustainable materials",
      promptContext:
        "Focus on product lifecycle extension, material recovery, industrial symbiosis, biodegradable alternatives, and reverse logistics optimization.",
      icon: "♻️",
    },
  ],
  regulatoryContext: [
    {
      name: "EU Green Deal / CSRD",
      jurisdiction: "European Union",
      description:
        "Corporate Sustainability Reporting Directive and EU taxonomy for sustainable activities",
      impactLevel: "high",
    },
    {
      name: "EPA Regulations",
      jurisdiction: "United States",
      description: "Environmental Protection Agency standards for emissions and waste",
      impactLevel: "high",
    },
  ],
  marketData: [
    {
      metric: "Global CleanTech Investment",
      value: "$500B (2024)",
      source: "BloombergNEF",
      year: 2024,
    },
    { metric: "Renewable Energy Share of Global Power", value: "30%", source: "IEA", year: 2024 },
  ],
  validationRules: [
    {
      id: "environmental-impact",
      name: "Net Environmental Impact",
      description: "Ensure idea has net positive environmental impact",
      check:
        "Does this idea result in net positive environmental outcomes? Consider lifecycle analysis and potential rebound effects.",
      severity: "warning",
    },
  ],
  keywords: [
    "cleantech",
    "sustainability",
    "renewable",
    "solar",
    "wind",
    "carbon",
    "circular-economy",
    "ESG",
  ],
  promptPrefix:
    "You are innovating in clean technology and sustainability. Prioritize ideas with measurable environmental impact, scalability potential, and alignment with global climate goals.",
};

export const GOVTECH_PACK: VerticalPack = {
  id: "govtech",
  name: "GovTech",
  description: "Innovation pack for government technology and civic tech",
  industry: "Government & Public Sector",
  version: "1.0.0",
  icon: "🏛️",
  angles: [
    {
      id: "citizen-experience",
      name: "Citizen Experience",
      description: "Improve government service delivery and citizen interactions",
      promptContext:
        "Focus on digital government services, one-stop portals, proactive service delivery, accessibility compliance (Section 508), and reducing bureaucratic friction for citizens.",
      icon: "👥",
    },
    {
      id: "public-data",
      name: "Public Data Innovation",
      description: "Leverage open data and government datasets for public good",
      promptContext:
        "Focus on open data platforms, transparency dashboards, data-driven policy making, and cross-agency data sharing while maintaining privacy and security standards (FedRAMP).",
      icon: "📊",
    },
  ],
  regulatoryContext: [
    {
      name: "FedRAMP",
      jurisdiction: "United States",
      description: "Federal Risk and Authorization Management Program for cloud services",
      impactLevel: "critical",
    },
    {
      name: "Section 508",
      jurisdiction: "United States",
      description: "Accessibility standards for federal electronic and information technology",
      impactLevel: "high",
    },
  ],
  marketData: [
    {
      metric: "Global GovTech Market Size",
      value: "$32B (2025)",
      source: "GovTech Summit",
      year: 2025,
    },
    { metric: "US Federal IT Spending", value: "$103B", source: "US Government", year: 2024 },
  ],
  validationRules: [
    {
      id: "security-clearance",
      name: "Security & Compliance Requirements",
      description: "Ensure idea meets government security standards",
      check:
        "Does this idea involve government data or systems? If so, does it consider FedRAMP, FISMA, or equivalent security frameworks?",
      severity: "error",
    },
  ],
  keywords: ["govtech", "civic-tech", "government", "public-sector", "smart-city", "open-data"],
  promptPrefix:
    "You are innovating in government technology. Prioritize ideas that improve public service delivery, maintain strict security/compliance standards, ensure accessibility, and demonstrate measurable public value.",
};

// ---- Pack Registry ----

const packRegistry: Map<string, VerticalPack> = new Map();

// Initialize with built-in packs
const BUILT_IN_PACKS = [HEALTHTECH_PACK, FINTECH_PACK, EDTECH_PACK, CLEANTECH_PACK, GOVTECH_PACK];
for (const pack of BUILT_IN_PACKS) {
  packRegistry.set(pack.id, pack);
}

/**
 * Get a vertical pack by ID.
 */
export function getVerticalPack(id: string): VerticalPack | undefined {
  return packRegistry.get(id);
}

/**
 * List all registered vertical packs.
 */
export function listVerticalPacks(): VerticalPack[] {
  return Array.from(packRegistry.values());
}

/**
 * Register a custom or community-contributed vertical pack.
 */
export function registerVerticalPack(pack: VerticalPack): void {
  const validated = VerticalPackSchema.parse(pack);
  packRegistry.set(validated.id, validated);
}

/**
 * Unregister a vertical pack by ID.
 */
export function unregisterVerticalPack(id: string): boolean {
  return packRegistry.delete(id);
}

/**
 * Load a vertical pack from a JSON object (e.g., from .innovator.pack.json).
 */
export function loadVerticalPackFromJson(json: unknown): VerticalPack {
  return VerticalPackSchema.parse(json);
}

/**
 * Get the prompt prefix for a vertical, combining pack context with regulatory summary.
 */
export function getVerticalPromptContext(packId: string): string | undefined {
  const pack = packRegistry.get(packId);
  if (!pack) return undefined;

  const regulatoryNotes = pack.regulatoryContext
    .filter((r) => r.impactLevel === "critical" || r.impactLevel === "high")
    .map((r) => `- ${r.name} (${r.jurisdiction}): ${r.description}`)
    .join("\n");

  const marketNotes = pack.marketData.map((m) => `- ${m.metric}: ${m.value}`).join("\n");

  return `${pack.promptPrefix ?? ""}

KEY REGULATORY REQUIREMENTS:
${regulatoryNotes}

MARKET CONTEXT:
${marketNotes}`;
}

/**
 * Validate an idea description against a vertical pack's validation rules.
 */
export function validateIdeaForVertical(
  ideaDescription: string,
  packId: string
): { valid: boolean; violations: Array<{ rule: ValidationRule; message: string }> } {
  const pack = packRegistry.get(packId);
  if (!pack) return { valid: true, violations: [] };

  const violations: Array<{ rule: ValidationRule; message: string }> = [];
  const lowerDesc = ideaDescription.toLowerCase();

  for (const rule of pack.validationRules) {
    // Simple keyword-based checks for common patterns
    if (rule.severity === "error") {
      const keywords = pack.keywords.filter((k) => lowerDesc.includes(k.toLowerCase()));
      if (
        keywords.length > 0 &&
        !lowerDesc.includes("compliance") &&
        !lowerDesc.includes("regulation")
      ) {
        violations.push({
          rule,
          message: `Industry-specific validation required: ${rule.name} — ${rule.check}`,
        });
      }
    }
  }

  return {
    valid: violations.filter((v) => v.rule.severity === "error").length === 0,
    violations,
  };
}

/**
 * Search packs by keyword or industry.
 */
export function searchVerticalPacks(query: {
  keyword?: string;
  industry?: string;
}): VerticalPack[] {
  const results: VerticalPack[] = [];
  for (const pack of packRegistry.values()) {
    if (query.industry && !pack.industry.toLowerCase().includes(query.industry.toLowerCase()))
      continue;
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      if (
        !pack.keywords.some((k) => k.toLowerCase().includes(kw)) &&
        !pack.name.toLowerCase().includes(kw) &&
        !pack.description.toLowerCase().includes(kw)
      ) {
        continue;
      }
    }
    results.push(pack);
  }
  return results;
}

/**
 * Reset the registry to only built-in packs.
 */
export function resetVerticalPacks(): void {
  packRegistry.clear();
  for (const pack of BUILT_IN_PACKS) {
    packRegistry.set(pack.id, pack);
  }
}
