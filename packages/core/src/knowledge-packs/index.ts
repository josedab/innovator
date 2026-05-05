/**
 * @module knowledge-packs
 *
 * Domain Knowledge Packs — curated, pre-built knowledge bases for specific
 * verticals (Healthcare, FinTech, Climate Tech). Each pack includes domain
 * ontologies, regulatory context, trend databases, expert persona prompts,
 * and industry-specific scoring rubrics.
 */

import { z } from "zod";

// ---- Schemas ----

export const KnowledgeEntitySchema = z.object({
  id: z.string().max(200),
  name: z.string().max(500),
  type: z.enum(["concept", "technology", "regulation", "organization", "process", "metric", "trend"]),
  description: z.string().max(2000),
  relationships: z.array(z.object({
    targetId: z.string().max(200),
    type: z.enum(["related-to", "depends-on", "competes-with", "enables", "regulates", "part-of"]),
  })).max(20).optional(),
  tags: z.array(z.string().max(100)).max(10).optional(),
});

export const RegulatoryItemSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(500),
  jurisdiction: z.string().max(200),
  description: z.string().max(2000),
  requirements: z.array(z.string().max(1000)).max(20),
  penalties: z.string().max(1000).optional(),
  applicableTo: z.array(z.string().max(200)).max(10),
});

export const TrendItemSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(500),
  description: z.string().max(2000),
  maturity: z.enum(["emerging", "growing", "mature", "declining"]),
  timeHorizon: z.enum(["0-1y", "1-3y", "3-5y", "5y+"]),
  impact: z.enum(["low", "medium", "high", "transformative"]),
  relatedEntities: z.array(z.string().max(200)).max(10).optional(),
});

export const ScoringRubricSchema = z.object({
  dimension: z.string().max(200),
  description: z.string().max(1000),
  weight: z.number().min(0).max(1),
  criteria: z.array(z.object({
    score: z.number().min(1).max(5),
    description: z.string().max(500),
  })).max(5),
});

export const PersonaPromptSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  role: z.string().max(200),
  expertise: z.string().max(1000),
  promptTemplate: z.string().max(5000),
  evaluationFocus: z.array(z.string().max(200)).max(10),
});

export const KnowledgePackSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(500),
  version: z.string().max(50),
  domain: z.string().max(200),
  description: z.string().max(2000),
  entities: z.array(KnowledgeEntitySchema).max(200),
  regulations: z.array(RegulatoryItemSchema).max(50),
  trends: z.array(TrendItemSchema).max(50),
  scoringRubrics: z.array(ScoringRubricSchema).max(20),
  personas: z.array(PersonaPromptSchema).max(10),
  suggestedAngles: z.array(z.string().max(100)).max(8),
  contextPrompt: z.string().max(5000).optional(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

// ---- Types ----

export type KnowledgeEntity = z.infer<typeof KnowledgeEntitySchema>;
export type RegulatoryItem = z.infer<typeof RegulatoryItemSchema>;
export type TrendItem = z.infer<typeof TrendItemSchema>;
export type ScoringRubric = z.infer<typeof ScoringRubricSchema>;
export type PersonaPrompt = z.infer<typeof PersonaPromptSchema>;
export type KnowledgePack = z.infer<typeof KnowledgePackSchema>;

// ---- In-Memory Store ----

const packs = new Map<string, KnowledgePack>();

// ---- Built-in Packs ----

const HEALTHCARE_PACK: KnowledgePack = {
  id: "healthcare",
  name: "Healthcare Innovation Pack",
  version: "1.0.0",
  domain: "Healthcare",
  description: "Comprehensive knowledge base for healthcare innovation including clinical workflows, regulations, and emerging technologies.",
  entities: [
    { id: "ehr", name: "Electronic Health Records (EHR)", type: "technology", description: "Digital systems for managing patient health information across care settings." },
    { id: "telehealth", name: "Telehealth", type: "technology", description: "Remote healthcare delivery using telecommunications technology." },
    { id: "precision-medicine", name: "Precision Medicine", type: "concept", description: "Tailoring medical treatment to individual patient characteristics." },
    { id: "clinical-trials", name: "Clinical Trials", type: "process", description: "Systematic studies to evaluate medical interventions in humans." },
    { id: "hipaa", name: "HIPAA", type: "regulation", description: "US federal law protecting patient health information privacy and security." },
    { id: "fda-approval", name: "FDA Approval Process", type: "process", description: "Regulatory pathway for new drugs and medical devices in the US." },
    { id: "patient-engagement", name: "Patient Engagement", type: "concept", description: "Strategies to involve patients in their own healthcare decisions." },
    { id: "interoperability", name: "Healthcare Interoperability", type: "concept", description: "Ability of different healthcare systems to exchange and use data." },
    { id: "digital-therapeutics", name: "Digital Therapeutics", type: "technology", description: "Evidence-based therapeutic interventions driven by software." },
    { id: "remote-monitoring", name: "Remote Patient Monitoring", type: "technology", description: "Technology for monitoring patients outside conventional clinical settings." },
    { id: "ai-diagnostics", name: "AI-Powered Diagnostics", type: "technology", description: "Machine learning systems for medical diagnosis and imaging analysis." },
    { id: "value-based-care", name: "Value-Based Care", type: "concept", description: "Payment models that reward quality outcomes over volume of services." },
  ],
  regulations: [
    { id: "hipaa-reg", name: "HIPAA Privacy Rule", jurisdiction: "United States", description: "Protects individually identifiable health information.", requirements: ["Minimum necessary standard", "Patient authorization for disclosures", "Notice of privacy practices", "Business associate agreements"], penalties: "Up to $1.5M per violation category per year", applicableTo: ["healthcare providers", "health plans", "healthcare clearinghouses"] },
    { id: "fda-510k", name: "FDA 510(k) Clearance", jurisdiction: "United States", description: "Premarket notification for medical devices substantially equivalent to existing devices.", requirements: ["Substantial equivalence demonstration", "Performance testing", "Labeling review"], applicableTo: ["medical devices", "digital health tools"] },
    { id: "gdpr-health", name: "GDPR Health Data", jurisdiction: "European Union", description: "Special protections for health data under GDPR Article 9.", requirements: ["Explicit consent for processing", "Data Protection Impact Assessment", "Data minimization", "Right to erasure"], penalties: "Up to 4% of global annual revenue", applicableTo: ["health data processors", "digital health platforms"] },
  ],
  trends: [
    { id: "ai-diagnostics-trend", name: "AI-Powered Diagnostics", description: "Machine learning for medical imaging, pathology, and clinical decision support.", maturity: "growing", timeHorizon: "1-3y", impact: "transformative", relatedEntities: ["ai-diagnostics"] },
    { id: "remote-care", name: "Remote & Virtual Care", description: "Shift to distributed care models with home-based monitoring.", maturity: "growing", timeHorizon: "0-1y", impact: "high", relatedEntities: ["telehealth", "remote-monitoring"] },
    { id: "genomics", name: "Genomic Medicine", description: "Integration of genomic data into clinical practice for personalized treatment.", maturity: "emerging", timeHorizon: "3-5y", impact: "transformative", relatedEntities: ["precision-medicine"] },
    { id: "mental-health-tech", name: "Mental Health Technology", description: "Digital platforms for mental health screening, therapy, and monitoring.", maturity: "growing", timeHorizon: "0-1y", impact: "high" },
  ],
  scoringRubrics: [
    { dimension: "Clinical Impact", description: "Potential to improve patient outcomes", weight: 0.3, criteria: [{ score: 1, description: "Minimal clinical impact" }, { score: 3, description: "Moderate improvement in care delivery" }, { score: 5, description: "Transformative impact on patient outcomes" }] },
    { dimension: "Regulatory Feasibility", description: "Likelihood of regulatory approval", weight: 0.25, criteria: [{ score: 1, description: "Major regulatory barriers" }, { score: 3, description: "Standard regulatory pathway" }, { score: 5, description: "Clear regulatory path or exempt" }] },
    { dimension: "Adoption Potential", description: "Likelihood of adoption by providers and patients", weight: 0.25, criteria: [{ score: 1, description: "Significant workflow disruption" }, { score: 3, description: "Moderate workflow integration needed" }, { score: 5, description: "Fits seamlessly into existing workflows" }] },
    { dimension: "Data Privacy", description: "Compliance with data protection requirements", weight: 0.2, criteria: [{ score: 1, description: "Significant privacy concerns" }, { score: 3, description: "Standard data protection measures" }, { score: 5, description: "Privacy-by-design with minimal data collection" }] },
  ],
  personas: [
    { id: "clinician", name: "Dr. Clinical Expert", role: "Chief Medical Officer", expertise: "Clinical workflows, patient safety, evidence-based medicine", promptTemplate: "Evaluate this idea from a clinical perspective. Consider patient safety, evidence requirements, workflow integration, and clinical outcomes. Would this pass a clinical advisory board review?", evaluationFocus: ["patient safety", "clinical evidence", "workflow integration"] },
    { id: "health-it", name: "Health IT Specialist", role: "Chief Information Officer", expertise: "Healthcare IT systems, interoperability, data security", promptTemplate: "Evaluate this idea from a health IT perspective. Consider EHR integration, data standards (HL7 FHIR), security requirements, and scalability.", evaluationFocus: ["interoperability", "security", "scalability"] },
  ],
  suggestedAngles: ["first-principles", "constraints", "perspectives", "what-if"],
  contextPrompt: "When evaluating healthcare innovations, always consider: patient safety first, regulatory pathway, clinical evidence requirements, reimbursement model, and provider workflow impact.",
  author: "Innovator Team",
  tags: ["healthcare", "medtech", "digital-health"],
};

const FINTECH_PACK: KnowledgePack = {
  id: "fintech",
  name: "FinTech Innovation Pack",
  version: "1.0.0",
  domain: "Financial Technology",
  description: "Knowledge base for financial technology innovation including regulatory frameworks, emerging technologies, and market trends.",
  entities: [
    { id: "open-banking", name: "Open Banking", type: "technology", description: "Banking practice allowing third-party access to financial data via APIs." },
    { id: "defi", name: "Decentralized Finance (DeFi)", type: "concept", description: "Financial services built on blockchain without traditional intermediaries." },
    { id: "embedded-finance", name: "Embedded Finance", type: "concept", description: "Integration of financial services into non-financial platforms and products." },
    { id: "regtech", name: "RegTech", type: "technology", description: "Technology solutions for regulatory compliance in financial services." },
    { id: "aml-kyc", name: "AML/KYC", type: "process", description: "Anti-money laundering and know-your-customer compliance processes." },
    { id: "instant-payments", name: "Instant Payments", type: "technology", description: "Real-time payment systems enabling immediate fund transfers." },
    { id: "neobanking", name: "Neobanking", type: "concept", description: "Digital-only banking without traditional physical branch networks." },
    { id: "insurtech", name: "InsurTech", type: "concept", description: "Technology-driven innovation in the insurance industry." },
    { id: "wealthtech", name: "WealthTech", type: "technology", description: "Technology solutions for wealth management and investment advisory." },
    { id: "bnpl", name: "Buy Now Pay Later", type: "concept", description: "Short-term financing allowing consumers to defer payments." },
    { id: "cbdc", name: "Central Bank Digital Currency", type: "concept", description: "Digital form of fiat currency issued by central banks." },
    { id: "ai-underwriting", name: "AI Underwriting", type: "technology", description: "Machine learning for automated risk assessment and underwriting decisions." },
  ],
  regulations: [
    { id: "psd2", name: "PSD2 (Payment Services Directive 2)", jurisdiction: "European Union", description: "EU directive promoting open banking and stronger customer authentication.", requirements: ["Strong Customer Authentication (SCA)", "Third-party provider access", "Regulatory Technical Standards compliance"], applicableTo: ["payment services", "banking APIs"] },
    { id: "pci-dss", name: "PCI DSS", jurisdiction: "Global", description: "Payment Card Industry Data Security Standard for handling cardholder data.", requirements: ["Encryption of cardholder data", "Regular security testing", "Access control measures", "Network security"], penalties: "Fines of $5,000 to $100,000 per month", applicableTo: ["payment processors", "merchants", "financial platforms"] },
    { id: "sox", name: "Sarbanes-Oxley Act", jurisdiction: "United States", description: "Protects investors through accurate financial disclosures.", requirements: ["Internal controls over financial reporting", "CEO/CFO certification", "Independent audit committee"], applicableTo: ["public companies", "fintech platforms handling securities"] },
  ],
  trends: [
    { id: "embedded-finance-trend", name: "Embedded Finance", description: "Financial services integrated into everyday non-financial apps.", maturity: "growing", timeHorizon: "0-1y", impact: "transformative", relatedEntities: ["embedded-finance"] },
    { id: "ai-risk", name: "AI-Powered Risk Assessment", description: "Machine learning models for credit scoring, fraud detection, and compliance.", maturity: "growing", timeHorizon: "0-1y", impact: "high", relatedEntities: ["ai-underwriting", "regtech"] },
    { id: "defi-institutions", name: "Institutional DeFi", description: "Traditional financial institutions adopting DeFi protocols.", maturity: "emerging", timeHorizon: "1-3y", impact: "high", relatedEntities: ["defi"] },
    { id: "green-finance", name: "Green & Sustainable Finance", description: "ESG-focused financial products and carbon credit markets.", maturity: "growing", timeHorizon: "1-3y", impact: "high" },
  ],
  scoringRubrics: [
    { dimension: "Regulatory Compliance", description: "Alignment with financial regulations", weight: 0.3, criteria: [{ score: 1, description: "Major regulatory risks" }, { score: 3, description: "Achievable with standard compliance" }, { score: 5, description: "Regulatory-friendly or regulated-first approach" }] },
    { dimension: "Market Size", description: "Addressable market opportunity", weight: 0.25, criteria: [{ score: 1, description: "Niche market" }, { score: 3, description: "Growing segment" }, { score: 5, description: "Large addressable market with growth potential" }] },
    { dimension: "Trust & Security", description: "User trust and data security posture", weight: 0.25, criteria: [{ score: 1, description: "Significant trust concerns" }, { score: 3, description: "Standard security measures" }, { score: 5, description: "Bank-grade security with transparency" }] },
    { dimension: "Scalability", description: "Ability to scale transaction volume and users", weight: 0.2, criteria: [{ score: 1, description: "Limited scalability" }, { score: 3, description: "Scalable with investment" }, { score: 5, description: "Cloud-native, infinitely scalable" }] },
  ],
  personas: [
    { id: "compliance-officer", name: "Compliance Officer", role: "Chief Compliance Officer", expertise: "Financial regulations, AML/KYC, risk management", promptTemplate: "Evaluate this fintech idea from a compliance perspective. Consider regulatory requirements, licensing needs, and risk exposure.", evaluationFocus: ["regulatory risk", "licensing", "AML/KYC"] },
    { id: "fintech-investor", name: "FinTech Investor", role: "Venture Capital Partner", expertise: "Fintech market dynamics, unit economics, competitive landscape", promptTemplate: "Evaluate this fintech idea from an investment perspective. Consider market size, competitive moat, unit economics, and exit potential.", evaluationFocus: ["market size", "unit economics", "competitive advantage"] },
  ],
  suggestedAngles: ["first-principles", "inversion", "trend-collision", "cross-domain"],
  contextPrompt: "When evaluating fintech innovations, consider: regulatory compliance first, trust and security, unit economics viability, and distribution strategy.",
  author: "Innovator Team",
  tags: ["fintech", "banking", "payments", "insurance"],
};

const CLIMATE_PACK: KnowledgePack = {
  id: "climate",
  name: "Climate Tech Innovation Pack",
  version: "1.0.0",
  domain: "Climate Technology",
  description: "Knowledge base for climate and sustainability innovation including clean energy, carbon markets, and circular economy.",
  entities: [
    { id: "carbon-capture", name: "Carbon Capture & Storage", type: "technology", description: "Technologies that capture CO2 from the atmosphere or point sources for storage or utilization." },
    { id: "green-hydrogen", name: "Green Hydrogen", type: "technology", description: "Hydrogen produced using renewable energy via electrolysis." },
    { id: "circular-economy", name: "Circular Economy", type: "concept", description: "Economic model eliminating waste through reuse, repair, and recycling." },
    { id: "carbon-credits", name: "Carbon Credits", type: "metric", description: "Tradeable certificates representing the right to emit one tonne of CO2." },
    { id: "esg", name: "ESG Reporting", type: "process", description: "Environmental, Social, and Governance metrics for corporate sustainability." },
    { id: "ev-infrastructure", name: "EV Charging Infrastructure", type: "technology", description: "Network of electric vehicle charging stations and grid integration." },
    { id: "agritech", name: "Climate-Smart Agriculture", type: "concept", description: "Agricultural practices that increase productivity while reducing climate impact." },
    { id: "battery-storage", name: "Grid-Scale Battery Storage", type: "technology", description: "Large-scale energy storage systems for renewable energy grid integration." },
    { id: "scope3", name: "Scope 3 Emissions", type: "metric", description: "Indirect emissions from a company's value chain (upstream and downstream)." },
    { id: "climate-fintech", name: "Climate FinTech", type: "concept", description: "Financial technology solutions addressing climate change challenges." },
    { id: "biodiversity-credits", name: "Biodiversity Credits", type: "concept", description: "Market-based mechanism for protecting and restoring biodiversity." },
    { id: "sustainable-aviation", name: "Sustainable Aviation Fuel", type: "technology", description: "Low-carbon fuels for aviation produced from sustainable feedstocks." },
  ],
  regulations: [
    { id: "eu-taxonomy", name: "EU Taxonomy", jurisdiction: "European Union", description: "Classification system for environmentally sustainable economic activities.", requirements: ["Climate change mitigation contribution", "Do no significant harm assessment", "Minimum social safeguards"], applicableTo: ["financial products", "corporate reporting"] },
    { id: "sec-climate", name: "SEC Climate Disclosure", jurisdiction: "United States", description: "Requirements for public companies to disclose climate-related risks.", requirements: ["GHG emissions disclosure", "Climate risk assessment", "Transition plan disclosure"], applicableTo: ["public companies", "investment funds"] },
    { id: "cbam", name: "Carbon Border Adjustment Mechanism", jurisdiction: "European Union", description: "Tariff on imported goods based on carbon emissions.", requirements: ["Carbon content reporting", "Certificate purchases for embedded emissions"], applicableTo: ["importers", "manufacturers"] },
  ],
  trends: [
    { id: "carbon-removal", name: "Carbon Removal Technologies", description: "Direct air capture and nature-based solutions for CO2 removal.", maturity: "emerging", timeHorizon: "3-5y", impact: "transformative", relatedEntities: ["carbon-capture"] },
    { id: "climate-ai", name: "AI for Climate", description: "Machine learning for climate modeling, energy optimization, and emissions tracking.", maturity: "growing", timeHorizon: "0-1y", impact: "high" },
    { id: "green-hydrogen-trend", name: "Green Hydrogen Economy", description: "Scaling hydrogen production and infrastructure for industrial decarbonization.", maturity: "emerging", timeHorizon: "3-5y", impact: "transformative", relatedEntities: ["green-hydrogen"] },
    { id: "voluntary-carbon", name: "Voluntary Carbon Markets", description: "Rapidly growing market for corporate carbon offset purchases.", maturity: "growing", timeHorizon: "0-1y", impact: "high", relatedEntities: ["carbon-credits"] },
  ],
  scoringRubrics: [
    { dimension: "Carbon Impact", description: "Potential CO2 reduction or removal", weight: 0.3, criteria: [{ score: 1, description: "Minimal carbon impact" }, { score: 3, description: "Measurable emissions reduction" }, { score: 5, description: "Gigatonne-scale potential" }] },
    { dimension: "Scalability", description: "Ability to scale globally", weight: 0.25, criteria: [{ score: 1, description: "Location-specific, hard to replicate" }, { score: 3, description: "Regionally scalable" }, { score: 5, description: "Globally deployable technology" }] },
    { dimension: "Economic Viability", description: "Financial sustainability without subsidies", weight: 0.25, criteria: [{ score: 1, description: "Depends on heavy subsidies" }, { score: 3, description: "Approaching cost parity" }, { score: 5, description: "Economically competitive today" }] },
    { dimension: "Co-Benefits", description: "Additional social and environmental benefits", weight: 0.2, criteria: [{ score: 1, description: "Single-benefit solution" }, { score: 3, description: "Some co-benefits" }, { score: 5, description: "Multiple co-benefits (jobs, health, biodiversity)" }] },
  ],
  personas: [
    { id: "climate-scientist", name: "Climate Scientist", role: "Research Lead", expertise: "Climate science, emissions modeling, impact assessment", promptTemplate: "Evaluate this climate tech idea from a scientific perspective. Consider the carbon impact, measurement methodology, and scalability of the solution.", evaluationFocus: ["carbon impact", "scientific rigor", "scalability"] },
    { id: "impact-investor", name: "Impact Investor", role: "Climate Fund Partner", expertise: "Climate finance, impact measurement, carbon markets", promptTemplate: "Evaluate this climate tech idea from an investment perspective. Consider unit economics, carbon credit potential, and policy tailwinds.", evaluationFocus: ["unit economics", "policy alignment", "impact measurement"] },
  ],
  suggestedAngles: ["first-principles", "constraints", "what-if", "trend-collision"],
  contextPrompt: "When evaluating climate innovations, prioritize: measurable carbon impact, scalability potential, economic viability without perpetual subsidies, and systemic change potential.",
  author: "Innovator Team",
  tags: ["climate", "sustainability", "cleantech", "energy"],
};

export const BUILT_IN_PACKS: KnowledgePack[] = [HEALTHCARE_PACK, FINTECH_PACK, CLIMATE_PACK];

// Initialize with built-in packs
for (const pack of BUILT_IN_PACKS) {
  packs.set(pack.id, pack);
}

// ---- Core Functions ----

/** Register a knowledge pack. */
export function registerKnowledgePack(pack: KnowledgePack): void {
  const validated = KnowledgePackSchema.parse(pack);
  packs.set(validated.id, validated);
}

/** Get a knowledge pack by ID. */
export function getKnowledgePack(id: string): KnowledgePack | undefined {
  return packs.get(id);
}

/** List all registered knowledge packs. */
export function listKnowledgePacks(): KnowledgePack[] {
  return Array.from(packs.values());
}

/** Search entities across all packs. */
export function searchEntities(query: string, packId?: string): KnowledgeEntity[] {
  const lower = query.toLowerCase();
  const searchPacks = packId ? [packs.get(packId)].filter(Boolean) as KnowledgePack[] : Array.from(packs.values());

  const results: KnowledgeEntity[] = [];
  for (const pack of searchPacks) {
    for (const entity of pack.entities) {
      if (
        entity.name.toLowerCase().includes(lower) ||
        entity.description.toLowerCase().includes(lower) ||
        entity.tags?.some((t) => t.toLowerCase().includes(lower))
      ) {
        results.push(entity);
      }
    }
  }
  return results;
}

/** Validate a knowledge pack against the schema. */
export function validatePackSchema(data: unknown): { valid: boolean; errors?: string[] } {
  const result = KnowledgePackSchema.safeParse(data);
  if (result.success) return { valid: true };
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

/** Get enrichment context for an investigation prompt based on a knowledge pack. */
export function getPackEnrichmentContext(packId: string): string | undefined {
  const pack = packs.get(packId);
  if (!pack) return undefined;

  const entityNames = pack.entities.map((e) => e.name).join(", ");
  const trendNames = pack.trends.map((t) => `${t.name} (${t.maturity})`).join(", ");
  const regNames = pack.regulations.map((r) => r.name).join(", ");

  return `Domain: ${pack.domain}
Key Concepts: ${entityNames}
Current Trends: ${trendNames}
Regulatory Context: ${regNames}
${pack.contextPrompt ?? ""}`;
}

/** Remove a knowledge pack by ID. */
export function removeKnowledgePack(id: string): boolean {
  return packs.delete(id);
}

/** Clear all knowledge packs (for testing). */
export function clearKnowledgePacks(): void {
  packs.clear();
}
