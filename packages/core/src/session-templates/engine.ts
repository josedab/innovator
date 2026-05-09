/**
 * Auto-configuration engine that maps wizard answers to pipeline configuration.
 * Uses a decision tree approach to determine optimal settings.
 */
import type { WizardAnswers, GeneratedConfig, WizardQuestion } from "./types.js";

/** The 5 wizard questions with their options. */
export const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    id: "goal",
    step: 1,
    label: "What's your innovation goal?",
    description: "Describe what you want to innovate on or improve.",
    type: "text",
    placeholder: "e.g., 'Reimagine the onboarding experience for our SaaS product'",
    required: true,
  },
  {
    id: "domain",
    step: 2,
    label: "What domain or industry?",
    description: "Select the domain to tailor innovation angles.",
    type: "select",
    options: [
      {
        value: "technology",
        label: "Technology & Software",
        description: "Software, APIs, developer tools",
      },
      {
        value: "healthcare",
        label: "Healthcare & Biotech",
        description: "Medical, pharma, health tech",
      },
      {
        value: "finance",
        label: "Finance & Fintech",
        description: "Banking, payments, investment",
      },
      {
        value: "education",
        label: "Education & EdTech",
        description: "Learning, training, academic",
      },
      {
        value: "ecommerce",
        label: "E-Commerce & Retail",
        description: "Shopping, marketplace, logistics",
      },
      {
        value: "sustainability",
        label: "Sustainability & Climate",
        description: "Green tech, energy, environment",
      },
      {
        value: "creative",
        label: "Creative & Media",
        description: "Content, design, entertainment",
      },
      { value: "other", label: "Other", description: "General-purpose innovation" },
    ],
    required: true,
  },
  {
    id: "constraints",
    step: 3,
    label: "Any constraints to consider?",
    description: "Budget limits, tech stack requirements, regulatory needs, etc.",
    type: "text",
    placeholder: "e.g., 'Must work with existing React codebase, budget under $10K'",
    required: false,
  },
  {
    id: "audience",
    step: 4,
    label: "Who is the target audience?",
    description: "Who will benefit from the innovation?",
    type: "select",
    options: [
      {
        value: "developers",
        label: "Developers",
        description: "Software engineers and technical users",
      },
      { value: "business", label: "Business Users", description: "Non-technical stakeholders" },
      { value: "consumers", label: "Consumers", description: "End users and general public" },
      { value: "enterprise", label: "Enterprise Teams", description: "Large organizations" },
      { value: "internal", label: "Internal Team", description: "Your own team or organization" },
      { value: "mixed", label: "Mixed Audience", description: "Multiple user segments" },
    ],
    required: true,
  },
  {
    id: "timeBudget",
    step: 5,
    label: "How much time to invest?",
    description: "This affects depth and breadth of exploration.",
    type: "select",
    options: [
      { value: "quick", label: "Quick (2-3 min)", description: "Fast brainstorm with top angles" },
      { value: "standard", label: "Standard (5-10 min)", description: "Balanced exploration" },
      {
        value: "thorough",
        label: "Thorough (15-20 min)",
        description: "Deep multi-angle analysis",
      },
      {
        value: "exhaustive",
        label: "Exhaustive (30+ min)",
        description: "Full pipeline with all angles",
      },
    ],
    required: true,
  },
];

/** Map wizard answers to pipeline configuration using decision tree. */
export function generateConfig(answers: WizardAnswers): GeneratedConfig {
  const config: GeneratedConfig = {
    angles: [],
    depth: "medium",
    model: "gpt-4.1-mini",
    scoringRubric: ["feasibility", "impact", "novelty"],
    exportFormat: "markdown",
    maxIdeasPerAngle: 3,
    autoMode: false,
  };

  // Time budget → depth and angle count
  switch (answers.timeBudget) {
    case "quick":
      config.depth = "shallow";
      config.maxIdeasPerAngle = 2;
      config.autoMode = true;
      break;
    case "standard":
      config.depth = "medium";
      config.maxIdeasPerAngle = 3;
      break;
    case "thorough":
      config.depth = "deep";
      config.maxIdeasPerAngle = 5;
      config.model = "gpt-4.1";
      break;
    case "exhaustive":
      config.depth = "deep";
      config.maxIdeasPerAngle = 5;
      config.model = "gpt-4.1";
      config.autoMode = true;
      break;
  }

  // Domain → angle selection
  const domainAngles: Record<string, string[]> = {
    technology: ["first-principles", "cross-domain", "what-if", "trend-collision"],
    healthcare: ["constraints", "perspectives", "inversion", "cross-domain"],
    finance: ["first-principles", "constraints", "inversion", "what-if"],
    education: ["perspectives", "scamper", "cross-domain", "what-if"],
    ecommerce: ["scamper", "trend-collision", "cross-domain", "perspectives"],
    sustainability: ["constraints", "cross-domain", "what-if", "first-principles"],
    creative: ["scamper", "what-if", "inversion", "perspectives"],
    other: ["scamper", "first-principles", "cross-domain", "what-if"],
  };

  config.angles = domainAngles[answers.domain] ?? domainAngles.other;

  // Quick mode uses fewer angles
  if (answers.timeBudget === "quick") {
    config.angles = config.angles.slice(0, 2);
  } else if (answers.timeBudget === "exhaustive") {
    config.angles = [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision",
    ];
  }

  // Audience → scoring rubric
  const audienceRubrics: Record<string, string[]> = {
    developers: ["feasibility", "technical-complexity", "impact"],
    business: ["impact", "market-fit", "strategic-alignment"],
    consumers: ["impact", "novelty", "feasibility"],
    enterprise: ["feasibility", "strategic-alignment", "market-fit"],
    internal: ["feasibility", "impact", "novelty"],
    mixed: ["feasibility", "impact", "novelty", "market-fit"],
  };

  config.scoringRubric = audienceRubrics[answers.audience] ?? audienceRubrics.mixed;

  // Enterprise audience prefers structured exports
  if (answers.audience === "enterprise" || answers.audience === "business") {
    config.exportFormat = "powerpoint";
  }

  return config;
}
