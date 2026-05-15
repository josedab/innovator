import { z } from "zod";

// ---- Stakeholder Roles ----

/** Validates organizational roles used in stakeholder simulations (e.g., ceo, cto, end-user, regulator). */
export const StakeholderRoleSchema = z.enum([
  "ceo",
  "cto",
  "cfo",
  "end-user",
  "regulator",
  "investor",
  "competitor",
  "partner",
  "media",
  "employee",
  "board-member",
  "customer-success",
]);

/** An organizational role used as a simulated stakeholder persona. @see StakeholderRoleSchema */
export type StakeholderRole = z.infer<typeof StakeholderRoleSchema>;

/**
 * Predefined profiles for each stakeholder role, including their title, key priorities,
 * risk tolerance level, and characteristic perspective used to shape simulated reactions.
 * @see StakeholderRole
 */
export const STAKEHOLDER_PROFILES: Record<
  StakeholderRole,
  {
    title: string;
    priorities: string[];
    riskTolerance: "low" | "medium" | "high";
    perspective: string;
  }
> = {
  ceo: {
    title: "Chief Executive Officer",
    priorities: ["strategic alignment", "market position", "shareholder value", "vision"],
    riskTolerance: "medium",
    perspective: "Does this align with our 5-year strategy and strengthen market position?",
  },
  cto: {
    title: "Chief Technology Officer",
    priorities: ["technical feasibility", "architecture", "team capabilities", "tech debt"],
    riskTolerance: "medium",
    perspective: "Can we build this with our current stack and team? What are the technical risks?",
  },
  cfo: {
    title: "Chief Financial Officer",
    priorities: ["ROI", "cost structure", "revenue impact", "financial risk"],
    riskTolerance: "low",
    perspective: "What's the financial model? When does this break even?",
  },
  "end-user": {
    title: "End User Representative",
    priorities: ["usability", "value delivered", "pain points solved", "simplicity"],
    riskTolerance: "high",
    perspective: "Does this actually solve my problem in a way I'd use daily?",
  },
  regulator: {
    title: "Regulatory Authority Representative",
    priorities: ["compliance", "data protection", "safety", "consumer rights"],
    riskTolerance: "low",
    perspective: "Does this comply with all applicable regulations and standards?",
  },
  investor: {
    title: "Venture Capital Investor",
    priorities: ["market size", "defensibility", "team", "growth potential", "exit path"],
    riskTolerance: "high",
    perspective: "Is this a venture-scale opportunity with a clear path to 10x returns?",
  },
  competitor: {
    title: "Competitor Analyst",
    priorities: [
      "competitive threat",
      "market share impact",
      "differentiation",
      "response strategy",
    ],
    riskTolerance: "medium",
    perspective: "How does this threaten our position and how should we respond?",
  },
  partner: {
    title: "Strategic Partner",
    priorities: ["integration opportunity", "mutual value", "ecosystem fit", "channel potential"],
    riskTolerance: "medium",
    perspective: "Does this create a partnership opportunity that benefits both sides?",
  },
  media: {
    title: "Tech Journalist",
    priorities: ["newsworthiness", "user impact", "trend relevance", "story angle"],
    riskTolerance: "high",
    perspective: "Would my readers care about this? Is there a compelling story?",
  },
  employee: {
    title: "Engineering Team Member",
    priorities: ["workload impact", "learning opportunities", "job satisfaction", "career growth"],
    riskTolerance: "medium",
    perspective: "Would I be excited or dreading working on this?",
  },
  "board-member": {
    title: "Board Member",
    priorities: ["governance", "fiduciary duty", "strategic direction", "risk oversight"],
    riskTolerance: "low",
    perspective: "Is this a responsible use of company resources with adequate oversight?",
  },
  "customer-success": {
    title: "Customer Success Manager",
    priorities: ["customer satisfaction", "churn reduction", "onboarding", "support burden"],
    riskTolerance: "medium",
    perspective: "Will this help or hurt our customer retention and satisfaction scores?",
  },
};

// ---- Stakeholder Reaction ----

/**
 * Validates a simulated stakeholder reaction, including sentiment, support score,
 * key questions, conditions for approval, and political implications.
 */
export const SimStakeholderReactionSchema = z.object({
  role: StakeholderRoleSchema,
  sentiment: z.enum(["strongly-support", "support", "neutral", "concerned", "opposed"]),
  score: z.number().min(0).max(10),
  reaction: z.string().max(3000),
  keyQuestions: z.array(z.string().max(500)).max(10),
  conditions: z.array(z.string().max(500)).max(10),
  politicalImplications: z.string().max(2000),
});

/** A simulated stakeholder's reaction to an idea, with sentiment and political analysis. */
export type SimStakeholderReaction = z.infer<typeof SimStakeholderReactionSchema>;

// ---- Debate Turn ----

/** Validates a single turn in a simulated stakeholder debate, including stance and optional response target. */
export const DebateTurnSchema = z.object({
  role: StakeholderRoleSchema,
  statement: z.string().max(2000),
  respondingTo: StakeholderRoleSchema.optional(),
  stance: z.enum(["support", "oppose", "negotiate", "redirect"]),
});

/** A single statement in a multi-stakeholder debate simulation. @see DebateTurnSchema */
export type DebateTurn = z.infer<typeof DebateTurnSchema>;

// ---- Simulation Result ----

/**
 * Validates the full stakeholder simulation result, including individual reactions,
 * debate transcript, coalition analysis, and a political feasibility score (0–1).
 */
export const StakeholderSimResultSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  reactions: z.array(SimStakeholderReactionSchema),
  debate: z.array(DebateTurnSchema).max(50),
  politicalFeasibilityScore: z.number().min(0).max(1),
  supportCoalition: z.array(StakeholderRoleSchema),
  oppositionCoalition: z.array(StakeholderRoleSchema),
  criticalConditions: z.array(z.string().max(500)).max(20),
  recommendation: z.string().max(3000),
});

/** Complete result of a stakeholder simulation with reactions, debate, and feasibility analysis. */
export type StakeholderSimResult = z.infer<typeof StakeholderSimResultSchema>;

// ---- Config ----

/** Configuration options for stakeholder simulation, including role selection and debate depth. */
export interface StakeholderSimConfig {
  roles?: StakeholderRole[];
  debateRounds?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: StakeholderSimProgress) => void;
}

/** Progress state emitted during stakeholder simulation via {@link StakeholderSimConfig.onProgress}. */
export interface StakeholderSimProgress {
  stage: "reacting" | "debating" | "analyzing" | "complete";
  completedReactions: number;
  totalReactions: number;
  currentRole?: string;
}
