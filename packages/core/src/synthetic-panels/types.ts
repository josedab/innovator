import { z } from "zod";

// ---- Persona Archetypes ----

export const PersonaArchetypeSchema = z.enum([
  "early-adopter",
  "enterprise-buyer",
  "price-sensitive",
  "accessibility-focused",
  "tech-enthusiast",
  "skeptical-executive",
  "end-user-advocate",
  "security-conscious",
  "sustainability-driven",
  "innovation-laggard",
  "power-user",
  "casual-consumer",
]);

export type PersonaArchetype = z.infer<typeof PersonaArchetypeSchema>;

export const ARCHETYPE_PROFILES: Record<
  PersonaArchetype,
  { description: string; priorities: string[]; objectionStyle: string }
> = {
  "early-adopter": {
    description: "Loves new technology, willing to tolerate bugs, wants to be first.",
    priorities: ["novelty", "competitive advantage", "status"],
    objectionStyle: "Why isn't this more cutting-edge?",
  },
  "enterprise-buyer": {
    description: "Risk-averse, needs compliance, ROI-focused, long procurement cycles.",
    priorities: ["reliability", "ROI", "integration", "support"],
    objectionStyle: "Where's the enterprise SLA?",
  },
  "price-sensitive": {
    description: "Budget-constrained, compares alternatives aggressively, value-focused.",
    priorities: ["cost", "value-for-money", "free-tier"],
    objectionStyle: "Can I get this cheaper elsewhere?",
  },
  "accessibility-focused": {
    description: "Champions inclusive design, evaluates WCAG compliance, assistive tech support.",
    priorities: ["accessibility", "inclusivity", "standards"],
    objectionStyle: "How does this work with screen readers?",
  },
  "tech-enthusiast": {
    description: "Evaluates technical architecture, API quality, extensibility.",
    priorities: ["architecture", "API design", "performance"],
    objectionStyle: "What's the tech stack and why?",
  },
  "skeptical-executive": {
    description: "Needs convincing data, questions ROI, worried about market timing.",
    priorities: ["market proof", "ROI metrics", "risk mitigation"],
    objectionStyle: "Show me the numbers.",
  },
  "end-user-advocate": {
    description: "Focuses on UX, simplicity, and real user pain points.",
    priorities: ["usability", "simplicity", "user delight"],
    objectionStyle: "Would my mom understand this?",
  },
  "security-conscious": {
    description: "Evaluates threat models, data handling, compliance requirements.",
    priorities: ["security", "privacy", "compliance"],
    objectionStyle: "Where does my data go?",
  },
  "sustainability-driven": {
    description: "Values environmental impact, carbon footprint, ethical sourcing.",
    priorities: ["sustainability", "environmental impact", "ethics"],
    objectionStyle: "What's the carbon footprint?",
  },
  "innovation-laggard": {
    description: "Resistant to change, needs strong justification, prefers proven solutions.",
    priorities: ["stability", "familiarity", "low risk"],
    objectionStyle: "Why can't we keep doing what we're doing?",
  },
  "power-user": {
    description: "Advanced features, customization, automation, keyboard shortcuts.",
    priorities: ["power", "customization", "efficiency"],
    objectionStyle: "Can I script this?",
  },
  "casual-consumer": {
    description: "Minimal effort, wants things to just work, low technical literacy.",
    priorities: ["simplicity", "reliability", "zero-config"],
    objectionStyle: "This is too complicated.",
  },
};

// ---- Synthetic Persona ----

export const SyntheticPersonaSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  archetype: PersonaArchetypeSchema,
  demographics: z.object({
    ageRange: z.string().max(50),
    role: z.string().max(200),
    industry: z.string().max(200),
    companySize: z.string().max(100),
  }),
  motivations: z.array(z.string().max(500)).max(10),
  frustrations: z.array(z.string().max(500)).max(10),
  decisionCriteria: z.array(z.string().max(500)).max(10),
});

export type SyntheticPersona = z.infer<typeof SyntheticPersonaSchema>;

// ---- Evaluation ----

export const PersonaEvaluationSchema = z.object({
  personaId: z.string(),
  personaName: z.string().max(200),
  archetype: PersonaArchetypeSchema,
  verdict: z.enum(["enthusiastic", "positive", "neutral", "skeptical", "opposed"]),
  score: z.number().min(0).max(10),
  reasoning: z.string().max(3000),
  objections: z.array(z.string().max(1000)).max(10),
  suggestions: z.array(z.string().max(1000)).max(10),
  wouldBuy: z.boolean(),
  willingnessToPayRange: z.string().max(200).optional(),
});

export type PersonaEvaluation = z.infer<typeof PersonaEvaluationSchema>;

// ---- Panel Debate ----

export const PanelDebateEntrySchema = z.object({
  personaId: z.string(),
  personaName: z.string().max(200),
  archetype: PersonaArchetypeSchema,
  statement: z.string().max(2000),
  respondingTo: z.string().optional(),
  sentiment: z.enum(["agree", "disagree", "nuance", "question"]),
});

export type PanelDebateEntry = z.infer<typeof PanelDebateEntrySchema>;

// ---- Consensus ----

export const PanelConsensusSchema = z.object({
  overallScore: z.number().min(0).max(10),
  verdict: z.enum(["strong-yes", "yes", "mixed", "no", "strong-no"]),
  consensusStrength: z.number().min(0).max(1),
  topObjections: z.array(z.string().max(1000)).max(10),
  topStrengths: z.array(z.string().max(1000)).max(10),
  recommendation: z.string().max(3000),
  splitVote: z
    .object({
      enthusiastic: z.number().int().min(0),
      positive: z.number().int().min(0),
      neutral: z.number().int().min(0),
      skeptical: z.number().int().min(0),
      opposed: z.number().int().min(0),
    })
    .optional(),
});

export type PanelConsensus = z.infer<typeof PanelConsensusSchema>;

// ---- Panel Result ----

export const PanelResultSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  personas: z.array(SyntheticPersonaSchema),
  evaluations: z.array(PersonaEvaluationSchema),
  debate: z.array(PanelDebateEntrySchema),
  consensus: PanelConsensusSchema,
});

export type PanelResult = z.infer<typeof PanelResultSchema>;

// ---- Panel Config ----

export interface PanelConfig {
  archetypes?: PersonaArchetype[];
  panelSize?: number;
  enableDebate?: boolean;
  debateRounds?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: PanelProgress) => void;
}

export interface PanelProgress {
  stage: "generating-personas" | "evaluating" | "debating" | "consensus" | "complete";
  completedEvaluations: number;
  totalEvaluations: number;
  currentPersona?: string;
}

// ---- Inter-Rater Agreement ----

export const InterRaterAgreementSchema = z.object({
  fleissKappa: z.number().min(-1).max(1),
  agreementLevel: z.enum(["poor", "slight", "fair", "moderate", "substantial", "almost-perfect"]),
  pairwiseAgreement: z.number().min(0).max(1),
  scoreVariance: z.number().min(0),
  scoreStdDev: z.number().min(0),
  confidenceInterval: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number(),
  }),
});

export type InterRaterAgreement = z.infer<typeof InterRaterAgreementSchema>;
