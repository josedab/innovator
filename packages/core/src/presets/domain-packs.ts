/**
 * @module presets/domain-packs
 *
 * Domain-specific innovation packs with curated angles, presets,
 * context hints, and evaluation rubrics for vertical industries.
 * Includes pack registry and community pack framework.
 */

import type { Preset, CustomAngle, AngleId } from "../types.js";

// ---- Pack Types ----

export interface InnovationPack {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  version: string;
  author: string;
  tags: string[];
  presets: Preset[];
  customAngles: CustomAngle[];
  contextHints: string[];
  evaluationRubric: EvaluationRubric;
}

export interface EvaluationRubric {
  criteria: Array<{
    name: string;
    description: string;
    weight: number;
  }>;
  domainSpecificQuestions: string[];
}

// ---- Built-in Domain Packs ----

export const HEALTHTECH_PACK: InnovationPack = {
  id: "healthtech",
  name: "HealthTech Innovation",
  description:
    "Innovation frameworks for healthcare technology, digital health, and biotech with regulatory awareness",
  icon: "🏥",
  category: "Healthcare",
  version: "1.0.0",
  author: "Innovator Team",
  tags: ["healthcare", "medtech", "digital-health", "biotech", "regulatory"],
  presets: [
    {
      id: "healthtech-patient-journey",
      name: "Patient Journey Innovation",
      description: "Reimagine the patient experience from diagnosis through treatment and recovery",
      icon: "🏥",
      category: "Healthcare",
      suggestedSubject: "e.g., 'Chronic disease management for diabetes patients'",
      selectedAngles: ["perspectives", "scamper", "constraints", "what-if"] as AngleId[],
      contextHints:
        "Focus on patient outcomes, caregiver burden, regulatory compliance (HIPAA/GDPR), clinical evidence requirements, and health equity.",
      tags: ["healthcare", "patient"],
    },
    {
      id: "healthtech-clinical-workflow",
      name: "Clinical Workflow Optimization",
      description: "Streamline clinical processes while maintaining safety and compliance",
      icon: "⚕️",
      category: "Healthcare",
      suggestedSubject: "e.g., 'Emergency department triage and patient flow'",
      selectedAngles: ["first-principles", "inversion", "cross-domain", "constraints"] as AngleId[],
      contextHints:
        "Consider clinical safety, EHR integration, staff burnout, regulatory requirements, and evidence-based medicine.",
      tags: ["healthcare", "clinical"],
    },
  ],
  customAngles: [
    {
      id: "regulatory-innovation",
      name: "Regulatory Innovation Lens",
      description: "Explore innovation opportunities within and around regulatory frameworks",
      promptTemplate: `You are a healthcare innovation expert analyzing {{subject}} through a regulatory lens.

Given this investigation: {{investigation}}

Generate ideas that:
1. Work within existing FDA/CE/regulatory frameworks
2. Exploit regulatory fast-tracks (breakthrough device, 510(k), De Novo)
3. Turn regulatory requirements into competitive advantages
4. Address health equity and access requirements

For each idea, note the regulatory pathway and timeline.
Respond with valid JSON: { "angleId": "regulatory-innovation", "angleName": "Regulatory Innovation", "ideas": [...], "reasoning": "..." }`,
      icon: "📋",
      tags: ["healthcare", "regulatory"],
    },
  ],
  contextHints: [
    "Consider HIPAA/GDPR compliance for any data-touching solutions",
    "Factor in clinical validation requirements and FDA pathways",
    "Address health equity and accessibility across diverse populations",
    "Consider interoperability standards (HL7 FHIR, DICOM)",
  ],
  evaluationRubric: {
    criteria: [
      {
        name: "Clinical Impact",
        description: "Potential to improve patient outcomes",
        weight: 0.3,
      },
      {
        name: "Regulatory Feasibility",
        description: "Likelihood of regulatory approval",
        weight: 0.25,
      },
      {
        name: "Implementation",
        description: "Ease of integration into clinical workflows",
        weight: 0.2,
      },
      { name: "Safety", description: "Risk profile and safety considerations", weight: 0.15 },
      {
        name: "Scalability",
        description: "Ability to scale across healthcare systems",
        weight: 0.1,
      },
    ],
    domainSpecificQuestions: [
      "What clinical evidence would be needed to validate this idea?",
      "How does this address health disparities?",
      "What is the regulatory pathway (510(k), PMA, De Novo)?",
    ],
  },
};

export const CLEANTECH_PACK: InnovationPack = {
  id: "cleantech",
  name: "CleanTech & Sustainability",
  description:
    "Innovation frameworks for clean energy, circular economy, and environmental sustainability",
  icon: "🌿",
  category: "Sustainability",
  version: "1.0.0",
  author: "Innovator Team",
  tags: ["cleantech", "sustainability", "energy", "circular-economy", "climate"],
  presets: [
    {
      id: "cleantech-energy-transition",
      name: "Energy Transition Innovation",
      description: "Accelerate the transition to renewable energy sources",
      icon: "⚡",
      category: "Sustainability",
      suggestedSubject: "e.g., 'Grid-scale energy storage solutions'",
      selectedAngles: [
        "first-principles",
        "trend-collision",
        "cross-domain",
        "what-if",
      ] as AngleId[],
      contextHints:
        "Consider grid stability, intermittency, storage economics, policy incentives, and environmental lifecycle impact.",
      tags: ["energy", "renewables"],
    },
    {
      id: "cleantech-circular-economy",
      name: "Circular Economy Design",
      description: "Design products and systems for zero waste and material circularity",
      icon: "♻️",
      category: "Sustainability",
      suggestedSubject: "e.g., 'Textile industry waste reduction and recycling'",
      selectedAngles: ["scamper", "inversion", "constraints", "cross-domain"] as AngleId[],
      contextHints:
        "Focus on material flows, reverse logistics, design for disassembly, extended producer responsibility, and consumer behavior.",
      tags: ["circular", "waste"],
    },
  ],
  customAngles: [
    {
      id: "planetary-boundaries",
      name: "Planetary Boundaries Lens",
      description: "Evaluate ideas against the nine planetary boundaries framework",
      promptTemplate: `You are a sustainability scientist analyzing {{subject}} through planetary boundaries.

Given this investigation: {{investigation}}

Generate ideas that:
1. Operate within planetary boundaries (climate, biodiversity, nitrogen, phosphorus, water, land use, ocean acidification, ozone, aerosols)
2. Create regenerative rather than extractive systems
3. Address systemic leverage points for maximum environmental impact
4. Consider rebound effects and unintended consequences

Respond with valid JSON: { "angleId": "planetary-boundaries", "angleName": "Planetary Boundaries", "ideas": [...], "reasoning": "..." }`,
      icon: "🌍",
      tags: ["sustainability", "planetary"],
    },
  ],
  contextHints: [
    "Consider full lifecycle carbon footprint (Scope 1, 2, and 3)",
    "Factor in environmental justice and community impact",
    "Address scalability from pilot to planetary scale",
    "Consider policy landscape and carbon pricing mechanisms",
  ],
  evaluationRubric: {
    criteria: [
      {
        name: "Environmental Impact",
        description: "CO2 reduction and ecological benefit",
        weight: 0.3,
      },
      {
        name: "Economic Viability",
        description: "Cost-competitiveness without subsidies",
        weight: 0.25,
      },
      { name: "Scalability", description: "Potential for global-scale deployment", weight: 0.2 },
      { name: "Social Impact", description: "Job creation and community benefit", weight: 0.15 },
      { name: "Timeline", description: "Speed to meaningful impact", weight: 0.1 },
    ],
    domainSpecificQuestions: [
      "What is the lifecycle carbon footprint of this solution?",
      "Can this scale to gigaton-level impact?",
      "What policy changes would accelerate adoption?",
    ],
  },
};

export const FINTECH_PACK: InnovationPack = {
  id: "fintech",
  name: "FinTech Innovation",
  description: "Innovation frameworks for financial technology with compliance and risk awareness",
  icon: "💳",
  category: "Finance",
  version: "1.0.0",
  author: "Innovator Team",
  tags: ["fintech", "banking", "payments", "defi", "compliance"],
  presets: [
    {
      id: "fintech-payments",
      name: "Next-Gen Payments",
      description: "Reinvent payment experiences for consumers and businesses",
      icon: "💳",
      category: "Finance",
      suggestedSubject: "e.g., 'Cross-border B2B payments for SMEs'",
      selectedAngles: [
        "first-principles",
        "cross-domain",
        "trend-collision",
        "constraints",
      ] as AngleId[],
      contextHints:
        "Consider regulatory requirements (PSD2, PCI-DSS), settlement times, FX risk, KYC/AML, and financial inclusion.",
      tags: ["fintech", "payments"],
    },
    {
      id: "fintech-financial-inclusion",
      name: "Financial Inclusion",
      description: "Expand access to financial services for underserved populations",
      icon: "🌐",
      category: "Finance",
      suggestedSubject: "e.g., 'Microfinance and savings products for rural communities'",
      selectedAngles: ["perspectives", "inversion", "what-if", "constraints"] as AngleId[],
      contextHints:
        "Focus on low-cost delivery, offline capability, financial literacy, trust building, and local regulatory compliance.",
      tags: ["fintech", "inclusion"],
    },
  ],
  customAngles: [
    {
      id: "compliance-first",
      name: "Compliance-First Innovation",
      description:
        "Design financial products with regulatory compliance as a feature, not a constraint",
      promptTemplate: `You are a fintech innovation expert analyzing {{subject}} with a compliance-first mindset.

Given this investigation: {{investigation}}

Generate ideas that:
1. Build compliance into the product architecture (not bolt-on)
2. Turn regulatory requirements into user trust signals
3. Anticipate upcoming regulations and build ahead of them
4. Address KYC/AML, data privacy, and consumer protection

Respond with valid JSON: { "angleId": "compliance-first", "angleName": "Compliance-First Innovation", "ideas": [...], "reasoning": "..." }`,
      icon: "🔐",
      tags: ["fintech", "compliance"],
    },
  ],
  contextHints: [
    "Consider multi-jurisdiction regulatory requirements",
    "Factor in KYC/AML compliance costs and user friction",
    "Address cybersecurity and fraud prevention",
    "Consider embedded finance and Banking-as-a-Service models",
  ],
  evaluationRubric: {
    criteria: [
      {
        name: "Regulatory Feasibility",
        description: "Compliance with financial regulations",
        weight: 0.25,
      },
      { name: "Market Size", description: "Total addressable market", weight: 0.25 },
      { name: "User Experience", description: "Simplicity and trust", weight: 0.2 },
      { name: "Security", description: "Fraud prevention and data protection", weight: 0.2 },
      { name: "Unit Economics", description: "Revenue model and margin", weight: 0.1 },
    ],
    domainSpecificQuestions: [
      "What licenses/approvals are needed in target markets?",
      "How does this handle multi-currency and cross-border compliance?",
      "What is the fraud and risk exposure?",
    ],
  },
};

export const EDTECH_PACK: InnovationPack = {
  id: "edtech",
  name: "EdTech Innovation",
  description:
    "Innovation frameworks for education technology with pedagogy and accessibility awareness",
  icon: "📚",
  category: "Education",
  version: "1.0.0",
  author: "Innovator Team",
  tags: ["edtech", "education", "learning", "pedagogy", "accessibility"],
  presets: [
    {
      id: "edtech-personalized-learning",
      name: "Personalized Learning",
      description: "Create adaptive learning experiences tailored to individual students",
      icon: "🎯",
      category: "Education",
      suggestedSubject: "e.g., 'Adaptive math learning for K-12 students'",
      selectedAngles: ["perspectives", "first-principles", "cross-domain", "what-if"] as AngleId[],
      contextHints:
        "Consider learning science (spaced repetition, mastery learning), accessibility (WCAG), data privacy (COPPA/FERPA), and teacher workload.",
      tags: ["edtech", "personalization"],
    },
  ],
  customAngles: [
    {
      id: "pedagogy-lens",
      name: "Pedagogy-First Design",
      description: "Ground technology innovations in evidence-based learning science",
      promptTemplate: `You are an educational innovation expert analyzing {{subject}} through a pedagogy-first lens.

Given this investigation: {{investigation}}

Generate ideas grounded in learning science:
1. Apply evidence-based pedagogical frameworks (Bloom's taxonomy, constructivism, UDL)
2. Design for intrinsic motivation and engagement
3. Address diverse learning needs and accessibility
4. Consider teacher empowerment alongside student outcomes

Respond with valid JSON: { "angleId": "pedagogy-lens", "angleName": "Pedagogy-First Design", "ideas": [...], "reasoning": "..." }`,
      icon: "🧠",
      tags: ["edtech", "pedagogy"],
    },
  ],
  contextHints: [
    "Ground all ideas in evidence-based learning science",
    "Consider COPPA/FERPA data privacy for minors",
    "Design for accessibility (WCAG 2.1 AA) and diverse learners",
    "Balance technology with human connection and teacher agency",
  ],
  evaluationRubric: {
    criteria: [
      { name: "Learning Outcomes", description: "Evidence of improved learning", weight: 0.3 },
      { name: "Engagement", description: "Student motivation and retention", weight: 0.2 },
      {
        name: "Accessibility",
        description: "Inclusivity and diverse learner support",
        weight: 0.2,
      },
      { name: "Teacher Impact", description: "Workload reduction and empowerment", weight: 0.15 },
      { name: "Scalability", description: "Cost-effective deployment at scale", weight: 0.15 },
    ],
    domainSpecificQuestions: [
      "What learning science evidence supports this approach?",
      "How does this serve students with different learning needs?",
      "What is the impact on teacher workload?",
    ],
  },
};

export const DEVTOOLS_PACK: InnovationPack = {
  id: "devtools",
  name: "Developer Tools Innovation",
  description: "Innovation frameworks for developer tools, platforms, and DevEx improvement",
  icon: "🛠️",
  category: "Technology",
  version: "1.0.0",
  author: "Innovator Team",
  tags: ["devtools", "developer-experience", "platform", "sdk", "infrastructure"],
  presets: [
    {
      id: "devtools-dx-improvement",
      name: "Developer Experience (DX)",
      description: "Improve developer productivity, satisfaction, and tool adoption",
      icon: "⚡",
      category: "Technology",
      suggestedSubject: "e.g., 'CI/CD pipeline experience for monorepo projects'",
      selectedAngles: ["scamper", "perspectives", "inversion", "first-principles"] as AngleId[],
      contextHints:
        "Focus on cognitive load reduction, error messages, documentation, onboarding, and integration ecosystem.",
      tags: ["devtools", "dx"],
    },
  ],
  customAngles: [
    {
      id: "10x-developer",
      name: "10x Developer Multiplier",
      description: "Find innovations that multiply developer productivity, not just add to it",
      promptTemplate: `You are a developer tools visionary analyzing {{subject}} to find 10x productivity multipliers.

Given this investigation: {{investigation}}

Generate ideas that provide 10x improvements by:
1. Eliminating entire categories of work (not just speeding them up)
2. Shifting left: catching issues before they become problems
3. Creating self-service platforms that scale without human gatekeepers
4. Leveraging AI to automate repetitive cognitive tasks

Respond with valid JSON: { "angleId": "10x-developer", "angleName": "10x Developer Multiplier", "ideas": [...], "reasoning": "..." }`,
      icon: "🚀",
      tags: ["devtools", "productivity"],
    },
  ],
  contextHints: [
    "Prioritize developer cognitive load reduction over feature count",
    "Consider the entire developer workflow, not just point solutions",
    "Focus on composability and integration with existing toolchains",
    "Measure impact in time-to-value, not just features shipped",
  ],
  evaluationRubric: {
    criteria: [
      { name: "Productivity Impact", description: "Time saved per developer per day", weight: 0.3 },
      { name: "Adoption Friction", description: "How easy to start using", weight: 0.25 },
      { name: "Integration", description: "Works with existing toolchains", weight: 0.2 },
      { name: "Community", description: "Open-source and ecosystem fit", weight: 0.15 },
      {
        name: "Differentiation",
        description: "What makes this better than alternatives",
        weight: 0.1,
      },
    ],
    domainSpecificQuestions: [
      "How does this reduce cognitive load for developers?",
      "Can a developer start using this in under 5 minutes?",
      "What existing tools does this replace or complement?",
    ],
  },
};

// ---- Pack Registry ----

const packRegistry = new Map<string, InnovationPack>();

// Register built-in packs
[HEALTHTECH_PACK, CLEANTECH_PACK, FINTECH_PACK, EDTECH_PACK, DEVTOOLS_PACK].forEach((pack) =>
  packRegistry.set(pack.id, pack)
);

export function registerPack(pack: InnovationPack): void {
  packRegistry.set(pack.id, pack);
}

export function getPack(id: string): InnovationPack | undefined {
  return packRegistry.get(id);
}

export function listPacks(): InnovationPack[] {
  return Array.from(packRegistry.values());
}

export function getPacksByCategory(category: string): InnovationPack[] {
  return Array.from(packRegistry.values()).filter(
    (p) => p.category.toLowerCase() === category.toLowerCase()
  );
}

export function searchPacks(query: string): InnovationPack[] {
  const q = query.toLowerCase();
  return Array.from(packRegistry.values()).filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q))
  );
}

export function unregisterPack(id: string): boolean {
  return packRegistry.delete(id);
}

export function clearPacks(): void {
  packRegistry.clear();
}
