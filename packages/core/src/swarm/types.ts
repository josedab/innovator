import { z } from "zod";

// ---- Agent Personality ----

export const AgentPersonalitySchema = z.enum([
  "risk-taker",
  "pragmatist",
  "contrarian",
  "domain-expert",
  "visionary",
  "integrator",
  "optimizer",
  "provocateur",
  "researcher",
  "critic",
  "synthesizer",
]);

export type AgentPersonality = z.infer<typeof AgentPersonalitySchema>;

export const PERSONALITY_DESCRIPTIONS: Record<AgentPersonality, string> = {
  "risk-taker": "Pushes boundaries, favors bold moonshot ideas with high upside even if risky.",
  pragmatist: "Focuses on feasibility, market fit, and incremental improvement paths.",
  contrarian: "Challenges assumptions, looks for flaws, and proposes opposite approaches.",
  "domain-expert": "Brings deep technical knowledge and evaluates ideas on technical merit.",
  visionary: "Thinks long-term, imagines future scenarios and paradigm shifts.",
  integrator: "Finds connections between disparate ideas and synthesizes hybrid concepts.",
  optimizer: "Seeks efficiency gains, cost reduction, and process improvements.",
  provocateur: "Deliberately provokes unconventional thinking and questions status quo.",
  researcher:
    "Gathers evidence, cites prior art, and grounds ideas in existing knowledge and data.",
  critic: "Rigorously evaluates ideas for weaknesses, risks, logical gaps, and hidden assumptions.",
  synthesizer:
    "Merges complementary ideas into cohesive strategies, finds common themes and synergies.",
};

// ---- Agent Status ----

export const SwarmAgentStatusSchema = z.enum([
  "idle",
  "exploring",
  "sharing",
  "converging",
  "completed",
  "failed",
]);

export type SwarmAgentStatus = z.infer<typeof SwarmAgentStatusSchema>;

// ---- Blackboard ----

export const BlackboardEntrySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  personality: AgentPersonalitySchema,
  content: z.string().max(5000),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(3000),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string().max(100)).max(20),
  iteration: z.number().int().min(0),
  createdAt: z.string(),
  reactions: z
    .array(
      z.object({
        agentId: z.string(),
        type: z.enum(["endorse", "challenge", "extend", "merge"]),
        comment: z.string().max(1000),
      })
    )
    .default([]),
});

export type BlackboardEntry = z.infer<typeof BlackboardEntrySchema>;

export const BlackboardSchema = z.object({
  entries: z.array(BlackboardEntrySchema),
  convergenceScore: z.number().min(0).max(1),
  dominantThemes: z.array(z.string().max(500)).max(20),
});

export type Blackboard = z.infer<typeof BlackboardSchema>;

// ---- Swarm Agent ----

export const SwarmAgentSchema = z.object({
  id: z.string(),
  personality: AgentPersonalitySchema,
  status: SwarmAgentStatusSchema,
  explorationFocus: z.string().max(2000).optional(),
  discoveries: z.array(z.string()).max(50),
  iterationsCompleted: z.number().int().min(0),
});

export type SwarmAgent = z.infer<typeof SwarmAgentSchema>;

// ---- Swarm Config ----

export interface SwarmConfig {
  agentCount?: number;
  personalities?: AgentPersonality[];
  maxIterations?: number;
  convergenceThreshold?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: SwarmProgress) => void;
}

// ---- Swarm Progress ----

export const SwarmStageSchema = z.enum([
  "initializing",
  "exploring",
  "sharing",
  "converging",
  "synthesizing",
  "complete",
  "error",
]);

export type SwarmStage = z.infer<typeof SwarmStageSchema>;

export interface SwarmProgress {
  stage: SwarmStage;
  iteration: number;
  maxIterations: number;
  agents: SwarmAgent[];
  blackboard: Blackboard;
  convergenceScore: number;
  activeAgentId?: string;
}

// ---- Swarm Result ----

export const SwarmIdeaSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  originAgents: z.array(z.string()),
  originPersonalities: z.array(AgentPersonalitySchema),
  confidence: z.number().min(0).max(1),
  endorsements: z.number().int().min(0),
  challenges: z.array(z.string().max(1000)).max(10),
  evolutionPath: z.array(z.string().max(500)).max(20),
});

export type SwarmIdea = z.infer<typeof SwarmIdeaSchema>;

export const SwarmResultSchema = z.object({
  ideas: z.array(SwarmIdeaSchema).max(50),
  totalIterations: z.number().int().min(0),
  convergenceScore: z.number().min(0).max(1),
  agentContributions: z.array(
    z.object({
      agentId: z.string(),
      personality: AgentPersonalitySchema,
      discoveriesCount: z.number().int().min(0),
      endorsementsGiven: z.number().int().min(0),
      challengesMade: z.number().int().min(0),
    })
  ),
  dominantThemes: z.array(z.string().max(500)).max(20),
  emergentInsights: z.array(z.string().max(2000)).max(10),
});

export type SwarmResult = z.infer<typeof SwarmResultSchema>;
