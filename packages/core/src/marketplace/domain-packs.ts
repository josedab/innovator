/**
 * @module marketplace/domain-packs
 *
 * First-party industry packs for domain-specific innovation workflows.
 */

import { z } from "zod";

export const DomainAngleSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  promptTemplate: z.string().max(5000),
  category: z.string().max(100),
  tags: z.array(z.string().max(50)).max(10),
});
export type DomainAngle = z.infer<typeof DomainAngleSchema>;

export const DomainPackSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000),
  domain: z.string().max(100),
  version: z.string().max(20),
  author: z.string().max(200),
  angles: z.array(DomainAngleSchema).min(1).max(20),
  scoringRubric: z
    .object({
      dimensions: z.array(
        z.object({
          name: z.string().max(200),
          weight: z.number().min(0).max(1),
          description: z.string().max(500),
        })
      ),
    })
    .optional(),
  promptTemplates: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(200),
        template: z.string().max(5000),
      })
    )
    .max(10)
    .optional(),
  tags: z.array(z.string().max(50)).max(20),
  createdAt: z.string(),
});
export type DomainPack = z.infer<typeof DomainPackSchema>;

const FIRST_PARTY_AUTHOR = "Innovator Team";
const FIRST_PARTY_CREATED_AT = "2025-01-01T00:00:00.000Z";

function createPack(pack: DomainPack): DomainPack {
  return DomainPackSchema.parse(pack);
}

export const DOMAIN_PACKS: DomainPack[] = [
  createPack({
    id: "healthcare",
    name: "Healthcare Innovation Pack",
    description:
      "A first-party pack for care delivery, clinical operations, digital health, and equitable patient outcomes.",
    domain: "healthcare",
    version: "1.0.0",
    author: FIRST_PARTY_AUTHOR,
    angles: [
      {
        id: "patient-outcome",
        name: "Patient Outcome Lens",
        description:
          "Evaluates whether an idea measurably improves outcomes, adherence, recovery, or quality of life.",
        promptTemplate:
          "You are a healthcare innovation strategist evaluating {subject}. Focus on measurable patient outcomes: morbidity, recovery time, adherence, quality of life, and preventable complications. Identify which patient segments benefit most, what evidence would validate the improvement, and where outcome gains could be offset by workflow, cost, or safety tradeoffs. Produce concrete innovation opportunities, success metrics, and assumptions to test.",
        category: "care-delivery",
        tags: ["outcomes", "patient-care", "evidence", "quality"],
      },
      {
        id: "clinical-workflow",
        name: "Clinical Workflow Optimization",
        description:
          "Examines how a concept reduces friction for clinicians, staff, and care coordination teams.",
        promptTemplate:
          "Assess {subject} through the lens of clinical workflow redesign. Map how clinicians, nurses, admins, and care coordinators interact with the current process. Look for steps that create delays, rework, handoff failures, documentation burden, or alert fatigue. Generate ideas that improve throughput, reduce burnout, and maintain quality without adding hidden operational complexity.",
        category: "operations",
        tags: ["workflow", "operations", "clinician", "burnout"],
      },
      {
        id: "regulatory-compliance",
        name: "Regulatory Compliance Lens",
        description:
          "Surfaces HIPAA, reimbursement, auditability, and safety implications early in ideation.",
        promptTemplate:
          "Analyze {subject} as a regulated healthcare offering. Consider HIPAA/privacy exposure, device or software-as-medical-device implications, reimbursement pathways, documentation needs, auditability, and patient safety governance. Propose innovations that create defensible value while staying realistic about approvals, compliance controls, and implementation sequence.",
        category: "compliance",
        tags: ["regulation", "hipaa", "audit", "safety"],
      },
      {
        id: "telehealth-innovation",
        name: "Telehealth Expansion",
        description:
          "Explores remote-first delivery models, digital triage, and hybrid care experiences.",
        promptTemplate:
          "Explore {subject} as a telehealth and hybrid-care opportunity. Identify which interactions can move safely to remote channels, what should stay in person, and how digital triage, async care, remote monitoring, or home-based services could improve access and continuity. Generate ideas that increase convenience and reach without degrading trust, safety, or handoff quality.",
        category: "digital-health",
        tags: ["telehealth", "remote-care", "monitoring", "access"],
      },
      {
        id: "health-equity",
        name: "Health Equity Lens",
        description:
          "Tests whether an idea closes or widens disparities across populations and care settings.",
        promptTemplate:
          "Evaluate {subject} through a health-equity lens. Consider underserved populations, disability access, language needs, digital divide constraints, insurance coverage gaps, rural access, and social determinants of health. Identify ways to design for trust, affordability, and culturally competent adoption so the innovation improves outcomes broadly instead of serving only already-advantaged patients.",
        category: "equity",
        tags: ["equity", "accessibility", "underserved", "trust"],
      },
    ],
    scoringRubric: {
      dimensions: [
        {
          name: "Clinical impact",
          weight: 0.35,
          description: "Degree to which the idea can improve diagnosis, treatment, outcomes, or care quality.",
        },
        {
          name: "Patient safety",
          weight: 0.25,
          description: "Likelihood that the concept preserves safety, reduces harm, and supports reliable care delivery.",
        },
        {
          name: "Regulatory fit",
          weight: 0.2,
          description: "How realistic the concept is given privacy, reimbursement, and compliance requirements.",
        },
        {
          name: "Scalability",
          weight: 0.2,
          description: "Ability to deploy across sites, populations, or care pathways without excessive complexity.",
        },
      ],
    },
    promptTemplates: [
      {
        id: "care-pathway-redesign",
        name: "Care Pathway Redesign",
        template:
          "Redesign the end-to-end care pathway for {subject}. Highlight the current state, the biggest delays or failure modes, and 3 innovations that improve patient outcomes, staff efficiency, and safety simultaneously.",
      },
      {
        id: "pilot-readiness",
        name: "Healthcare Pilot Readiness",
        template:
          "Design a 90-day pilot for {subject} in a healthcare setting. Include target patient population, clinical workflow changes, evidence to collect, safety guardrails, compliance considerations, and adoption metrics.",
      },
    ],
    tags: ["healthcare", "clinical", "patient-care", "telehealth", "regulation", "equity"],
    createdAt: FIRST_PARTY_CREATED_AT,
  }),
  createPack({
    id: "fintech",
    name: "FinTech Innovation Pack",
    description:
      "A first-party pack for financial services innovation spanning payments, compliance, inclusion, and trust.",
    domain: "fintech",
    version: "1.0.0",
    author: FIRST_PARTY_AUTHOR,
    angles: [
      {
        id: "defi-opportunity",
        name: "DeFi Opportunity Scan",
        description:
          "Looks for decentralized finance primitives that unlock new product or market structures.",
        promptTemplate:
          "Analyze {subject} for decentralized-finance opportunity. Consider custody models, settlement speed, composability, yield mechanics, tokenized incentives, on-chain transparency, and where decentralization creates a clear user or market advantage over incumbents. Generate opportunities with realistic liquidity, compliance, and education constraints in mind.",
        category: "decentralized-finance",
        tags: ["defi", "web3", "settlement", "liquidity"],
      },
      {
        id: "regulatory-arbitrage",
        name: "Regulatory Arbitrage Lens",
        description:
          "Identifies legal structure, geography, and product-design options that create defensible advantage.",
        promptTemplate:
          "Evaluate {subject} through a regulatory-arbitrage lens without proposing unlawful behavior. Compare jurisdictions, licensing models, disclosures, data rules, and product structures to find compliant ways to move faster than competitors. Surface where regulation is a moat, a launch constraint, or a trust-building feature that can differentiate the offering.",
        category: "compliance-strategy",
        tags: ["regulation", "licensing", "jurisdiction", "moat"],
      },
      {
        id: "financial-inclusion",
        name: "Financial Inclusion Lens",
        description:
          "Focuses on underserved segments, affordability, and access to trustworthy financial tools.",
        promptTemplate:
          "Assess {subject} for its ability to expand financial inclusion. Look at underbanked users, thin-file customers, micro-merchants, migrant workers, and cash-dependent populations. Identify product changes, pricing models, onboarding flows, and trust mechanisms that lower barriers to entry while still supporting sustainable unit economics.",
        category: "inclusive-finance",
        tags: ["inclusion", "underbanked", "affordability", "trust"],
      },
      {
        id: "risk-modeling",
        name: "Risk Modeling Lens",
        description:
          "Explores better ways to price, predict, and mitigate fraud, credit, or operational risk.",
        promptTemplate:
          "Interrogate {subject} as a risk-modeling problem. Consider fraud vectors, creditworthiness signals, liquidity risk, operational failure modes, and explainability requirements. Generate innovation ideas that improve pricing or loss prevention using better signals, adaptive controls, and user experience patterns that maintain fairness and transparency.",
        category: "risk",
        tags: ["risk", "fraud", "credit", "controls"],
      },
      {
        id: "payments-innovation",
        name: "Payments Innovation Lens",
        description:
          "Targets checkout, settlement, treasury, and cross-border payment opportunities.",
        promptTemplate:
          "Explore {subject} as a payments innovation opportunity. Examine checkout friction, conversion loss, authorization failures, settlement delays, FX pain points, chargebacks, and treasury visibility. Propose new payment flows, rails, orchestration layers, or embedded-finance features that create faster, safer, and more trusted transactions.",
        category: "payments",
        tags: ["payments", "checkout", "cross-border", "embedded-finance"],
      },
    ],
    scoringRubric: {
      dimensions: [
        {
          name: "Market potential",
          weight: 0.35,
          description: "Strength of the addressable demand, willingness to pay, and competitive whitespace.",
        },
        {
          name: "Regulatory risk",
          weight: 0.2,
          description: "Expected licensing, compliance, enforcement, and governance complexity.",
        },
        {
          name: "Technical feasibility",
          weight: 0.2,
          description: "Likelihood the concept can be built securely with current infrastructure and data availability.",
        },
        {
          name: "User trust",
          weight: 0.25,
          description: "Ability to win confidence around money movement, security, transparency, and dispute handling.",
        },
      ],
    },
    promptTemplates: [
      {
        id: "trust-led-fintech-concept",
        name: "Trust-Led Concept Development",
        template:
          "Generate 3 fintech concepts for {subject} that maximize user trust. For each concept, explain the target user, financial workflow, risk controls, compliance posture, and why the product can win against incumbent alternatives.",
      },
      {
        id: "payments-pilot",
        name: "Payments Pilot Plan",
        template:
          "Design a first pilot for {subject} in payments or financial services. Include user segment, transaction volume assumptions, core risk controls, partner dependencies, compliance checkpoints, and trust-building onboarding steps.",
      },
    ],
    tags: ["fintech", "payments", "banking", "risk", "compliance", "trust"],
    createdAt: FIRST_PARTY_CREATED_AT,
  }),
  createPack({
    id: "saas",
    name: "SaaS Innovation Pack",
    description:
      "A first-party pack for B2B and product-led growth teams looking to unlock durable SaaS expansion.",
    domain: "saas",
    version: "1.0.0",
    author: FIRST_PARTY_AUTHOR,
    angles: [
      {
        id: "product-led-growth",
        name: "Product-Led Growth Lens",
        description:
          "Finds self-serve, activation, and expansion mechanisms driven by product experience.",
        promptTemplate:
          "Evaluate {subject} through a product-led-growth lens. Map user activation, aha moments, habit loops, collaboration triggers, upgrade paths, and referrals. Identify ways the product itself can create acquisition, shorten time-to-value, and expand accounts without depending entirely on high-touch sales motion.",
        category: "growth",
        tags: ["plg", "activation", "self-serve", "expansion"],
      },
      {
        id: "churn-reduction",
        name: "Churn Reduction Lens",
        description:
          "Searches for interventions that improve retention, adoption depth, and long-term account health.",
        promptTemplate:
          "Analyze {subject} as a retention problem. Consider failed onboarding, weak workflows, low switching costs, poor stakeholder alignment, missing outcomes visibility, and support debt. Propose product, pricing, service, or analytics innovations that reduce churn risk and help customers realize value faster and more consistently.",
        category: "retention",
        tags: ["churn", "retention", "adoption", "customer-success"],
      },
      {
        id: "platform-strategy",
        name: "Platform Strategy Lens",
        description:
          "Looks for ecosystem, marketplace, and extensibility moves that compound product value.",
        promptTemplate:
          "Assess {subject} through a platform-strategy lens. Explore where third-party extensions, partner workflows, data network effects, developer tooling, or embedded marketplaces could make the product more valuable over time. Generate ideas that create ecosystem leverage while keeping governance, quality, and monetization manageable.",
        category: "platform",
        tags: ["platform", "ecosystem", "extensions", "network-effects"],
      },
      {
        id: "api-first",
        name: "API-First Lens",
        description:
          "Examines whether APIs, automation, and composability can unlock distribution or defensibility.",
        promptTemplate:
          "Explore {subject} from an API-first perspective. Identify the workflows customers want to automate, the integrations that matter most, the data models that should be exposed, and how APIs could expand usage into new teams or products. Recommend innovations that improve composability, reliability, and developer adoption.",
        category: "developer-platform",
        tags: ["api", "automation", "integration", "developer"],
      },
      {
        id: "vertical-expansion",
        name: "Vertical Expansion Lens",
        description:
          "Tests whether the core product can be specialized for high-value industries or segments.",
        promptTemplate:
          "Evaluate {subject} for vertical SaaS expansion. Look for industries with acute pain, unique workflows, regulatory nuance, or higher willingness to pay. Suggest how the product, packaging, onboarding, analytics, and partner model could be adapted to win a specific vertical without fragmenting the core platform.",
        category: "segmentation",
        tags: ["vertical-saas", "segmentation", "pricing", "specialization"],
      },
    ],
    scoringRubric: {
      dimensions: [
        {
          name: "Revenue impact",
          weight: 0.35,
          description: "Potential to grow ARR through acquisition, expansion, pricing, or new product revenue.",
        },
        {
          name: "User acquisition",
          weight: 0.2,
          description: "Ability to attract more users or shorten the path from awareness to activation.",
        },
        {
          name: "Retention",
          weight: 0.25,
          description: "Expected improvement in usage depth, renewal likelihood, and long-term account value.",
        },
        {
          name: "Implementation effort",
          weight: 0.2,
          description: "Relative complexity to deliver the concept with existing product and go-to-market capabilities.",
        },
      ],
    },
    promptTemplates: [
      {
        id: "growth-loop-design",
        name: "Growth Loop Design",
        template:
          "Design 3 compounding growth loops for {subject}. For each loop, explain the user trigger, in-product action, expansion outcome, measurement approach, and what could break the loop at scale.",
      },
      {
        id: "retention-recovery-plan",
        name: "Retention Recovery Plan",
        template:
          "Create a churn-reduction plan for {subject}. Prioritize the top product, lifecycle, support, and analytics interventions that could improve activation, adoption depth, and renewal confidence within one quarter.",
      },
    ],
    tags: ["saas", "b2b", "plg", "retention", "platform", "api"],
    createdAt: FIRST_PARTY_CREATED_AT,
  }),
  createPack({
    id: "climate",
    name: "Climate Innovation Pack",
    description:
      "A first-party pack for climate solutions, sustainability strategy, and high-impact environmental innovation.",
    domain: "climate",
    version: "1.0.0",
    author: FIRST_PARTY_AUTHOR,
    angles: [
      {
        id: "carbon-reduction",
        name: "Carbon Reduction Lens",
        description:
          "Assesses how an idea materially lowers emissions across operations, supply chain, or user behavior.",
        promptTemplate:
          "Evaluate {subject} for carbon-reduction potential. Identify direct and indirect emissions sources, behavior changes required, likely rebound effects, and what measurement approach would prove real impact. Generate innovations that reduce emissions credibly while staying grounded in operational, technical, and adoption realities.",
        category: "decarbonization",
        tags: ["carbon", "emissions", "measurement", "decarbonization"],
      },
      {
        id: "circular-economy",
        name: "Circular Economy Lens",
        description:
          "Looks for reuse, repair, recovery, and lifecycle redesign opportunities.",
        promptTemplate:
          "Analyze {subject} through a circular-economy lens. Consider waste streams, product longevity, refurbishment, material recovery, reverse logistics, and incentives for reuse or repair. Propose business-model and product innovations that keep valuable materials in circulation and reduce landfill or virgin-resource dependence.",
        category: "circularity",
        tags: ["circular-economy", "reuse", "repair", "materials"],
      },
      {
        id: "climate-adaptation",
        name: "Climate Adaptation Lens",
        description:
          "Explores resilience strategies for heat, water, infrastructure, and extreme-weather risks.",
        promptTemplate:
          "Assess {subject} as a climate-adaptation opportunity. Examine how heat, flooding, drought, wildfire, supply volatility, or insurance pressure could reshape demand and risk. Generate ideas that improve resilience, business continuity, and community preparedness while remaining economically practical.",
        category: "resilience",
        tags: ["adaptation", "resilience", "infrastructure", "risk"],
      },
      {
        id: "green-technology",
        name: "Green Technology Lens",
        description:
          "Focuses on breakthrough technologies that accelerate sustainable operations or energy transition.",
        promptTemplate:
          "Explore {subject} as a green-technology bet. Look for enabling technologies, hardware-software combinations, financing models, and ecosystem dependencies that could unlock step-change sustainability performance. Recommend innovations that balance technological ambition with deployment timelines, supply constraints, and customer adoption barriers.",
        category: "technology",
        tags: ["green-tech", "energy", "deployment", "transition"],
      },
      {
        id: "sustainability-metrics",
        name: "Sustainability Metrics Lens",
        description:
          "Ensures ideas are measurable, auditable, and aligned to meaningful sustainability indicators.",
        promptTemplate:
          "Evaluate {subject} from a sustainability-metrics perspective. Determine which KPIs matter most, how data would be collected, what can be audited, and how to avoid vanity metrics or greenwashing. Generate innovations that make environmental performance transparent, decision-useful, and credible to customers, regulators, and investors.",
        category: "measurement",
        tags: ["metrics", "audit", "reporting", "greenwashing"],
      },
    ],
    scoringRubric: {
      dimensions: [
        {
          name: "Environmental impact",
          weight: 0.4,
          description: "Expected magnitude and credibility of emissions, waste, or resource-use improvement.",
        },
        {
          name: "Economic viability",
          weight: 0.2,
          description: "Ability for the concept to sustain itself through savings, revenue, or financing support.",
        },
        {
          name: "Scalability",
          weight: 0.2,
          description: "Likelihood the concept can expand across sites, sectors, or markets with practical execution.",
        },
        {
          name: "Urgency",
          weight: 0.2,
          description: "How strongly the problem demands immediate action due to climate, regulatory, or market pressure.",
        },
      ],
    },
    promptTemplates: [
      {
        id: "climate-solution-portfolio",
        name: "Climate Solution Portfolio",
        template:
          "Create a portfolio of climate innovations for {subject}. Include one near-term operational win, one medium-term business-model shift, and one long-term breakthrough bet, with impact metrics and adoption risks for each.",
      },
      {
        id: "resilience-pilot",
        name: "Resilience Pilot Plan",
        template:
          "Design a pilot that tests {subject} as a climate adaptation or sustainability initiative. Specify the target risk, baseline metrics, required partners, implementation timeline, and how success will be audited.",
      },
    ],
    tags: ["climate", "sustainability", "carbon", "circular-economy", "adaptation", "green-tech"],
    createdAt: FIRST_PARTY_CREATED_AT,
  }),
  createPack({
    id: "education",
    name: "Education Innovation Pack",
    description:
      "A first-party pack for learning design, educator enablement, accessibility, and lifelong learning experiences.",
    domain: "education",
    version: "1.0.0",
    author: FIRST_PARTY_AUTHOR,
    angles: [
      {
        id: "personalized-learning",
        name: "Personalized Learning Lens",
        description:
          "Looks for adaptive pathways, differentiated instruction, and learner-specific support.",
        promptTemplate:
          "Evaluate {subject} as a personalized-learning opportunity. Consider learner goals, prior knowledge, pacing differences, feedback loops, adaptive content, and motivation patterns. Generate innovations that tailor learning without overwhelming instructors or obscuring progress for students and caregivers.",
        category: "learning-design",
        tags: ["personalization", "adaptive-learning", "feedback", "pathways"],
      },
      {
        id: "assessment-innovation",
        name: "Assessment Innovation Lens",
        description:
          "Explores more authentic, continuous, and actionable ways to measure learning.",
        promptTemplate:
          "Analyze {subject} through the lens of assessment innovation. Move beyond one-time tests to consider formative feedback, authentic performance evidence, skill mastery, portfolio models, and teacher workload. Propose assessment approaches that improve learning quality, trust, and actionability for students and educators.",
        category: "assessment",
        tags: ["assessment", "mastery", "formative", "evidence"],
      },
      {
        id: "accessibility",
        name: "Accessibility Lens",
        description:
          "Checks whether ideas are inclusive for learners with varied abilities, contexts, and resources.",
        promptTemplate:
          "Assess {subject} for accessibility and inclusive design. Consider assistive technology compatibility, reading level, language support, multimodal delivery, bandwidth constraints, neurodiversity, and offline access. Identify innovations that remove barriers and make high-quality learning reachable for more students in more contexts.",
        category: "inclusion",
        tags: ["accessibility", "inclusive-design", "assistive-tech", "equity"],
      },
      {
        id: "educator-empowerment",
        name: "Educator Empowerment Lens",
        description:
          "Focuses on reducing teacher workload while improving instruction quality and confidence.",
        promptTemplate:
          "Explore {subject} from an educator-empowerment perspective. Map where teachers lose time to planning, grading, administration, communication, or fragmented tools. Generate innovations that amplify teacher judgment, reduce repetitive tasks, and improve visibility into learner progress without creating new cognitive overload.",
        category: "educator-workflow",
        tags: ["teachers", "workflow", "planning", "automation"],
      },
      {
        id: "lifelong-learning",
        name: "Lifelong Learning Lens",
        description:
          "Examines reskilling, adult learning, and modular pathways beyond formal education.",
        promptTemplate:
          "Evaluate {subject} as a lifelong-learning opportunity. Consider career transitions, adult learner constraints, credential portability, employer alignment, community-based learning, and motivation over long time horizons. Suggest models that make continuous learning more flexible, valuable, and connected to real-world outcomes.",
        category: "continuous-learning",
        tags: ["lifelong-learning", "reskilling", "credentials", "adult-learning"],
      },
    ],
    scoringRubric: {
      dimensions: [
        {
          name: "Learning outcomes",
          weight: 0.35,
          description: "How strongly the concept can improve mastery, understanding, or learner progress.",
        },
        {
          name: "Accessibility",
          weight: 0.2,
          description: "Degree to which the idea serves diverse learners and reduces barriers to participation.",
        },
        {
          name: "Scalability",
          weight: 0.2,
          description: "Ability to deliver the concept across classrooms, institutions, or learner populations.",
        },
        {
          name: "Engagement",
          weight: 0.25,
          description: "Likelihood that learners and educators will find the experience motivating and sticky.",
        },
      ],
    },
    promptTemplates: [
      {
        id: "learning-experience-design",
        name: "Learning Experience Design",
        template:
          "Design a learning experience for {subject}. Include learner segments, desired outcomes, instructional model, assessment approach, accessibility needs, and how educators will know the experience is working.",
      },
      {
        id: "educator-adoption-plan",
        name: "Educator Adoption Plan",
        template:
          "Create an educator adoption plan for {subject}. Address teacher workflow impact, training needs, accessibility considerations, engagement strategies, and the evidence required to prove improved learning outcomes.",
      },
    ],
    tags: ["education", "learning", "accessibility", "assessment", "teachers", "lifelong-learning"],
    createdAt: FIRST_PARTY_CREATED_AT,
  }),
];

const installedPackIds = new Set<string>();
const installCounts = new Map<string, number>();

export function getDomainPack(id: string): DomainPack | undefined {
  return DOMAIN_PACKS.find((pack) => pack.id === id);
}

export function listDomainPacks(): DomainPack[] {
  return [...DOMAIN_PACKS];
}

export function getDomainPacksByTag(tag: string): DomainPack[] {
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) return [];

  return DOMAIN_PACKS.filter(
    (pack) =>
      pack.tags.some((value) => value.toLowerCase() === normalizedTag) ||
      pack.angles.some((angle) => angle.tags.some((value) => value.toLowerCase() === normalizedTag))
  );
}

export function installDomainPack(packId: string): string[] {
  const pack = getDomainPack(packId);
  if (!pack) return getInstalledPacks();

  if (!installedPackIds.has(packId)) {
    installedPackIds.add(packId);
    installCounts.set(packId, (installCounts.get(packId) ?? 0) + 1);
  }

  return getInstalledPacks();
}

export function getInstalledPacks(): string[] {
  return Array.from(installedPackIds);
}

export function getDomainPackInstallCount(packId: string): number {
  return installCounts.get(packId) ?? 0;
}

export function uninstallDomainPack(packId: string): boolean {
  return installedPackIds.delete(packId);
}

export function clearInstalledPacks(): void {
  installedPackIds.clear();
  installCounts.clear();
}
