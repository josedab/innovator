import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { Investigation } from "../types.js";
import {
  PERSONALITY_DESCRIPTIONS,
  type AgentPersonality,
  type Blackboard,
  type BlackboardEntry,
  type SwarmAgent,
  type SwarmConfig,
  type SwarmIdea,
  type SwarmResult,
  type SwarmStage,
  SwarmIdeaSchema,
} from "./types.js";

const DEFAULT_AGENT_COUNT = 4;
const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_CONVERGENCE_THRESHOLD = 0.7;

const DEFAULT_PERSONALITIES: AgentPersonality[] = [
  "risk-taker",
  "pragmatist",
  "contrarian",
  "domain-expert",
];

function createAgents(config: SwarmConfig): SwarmAgent[] {
  const personalities =
    config.personalities ??
    DEFAULT_PERSONALITIES.slice(0, config.agentCount ?? DEFAULT_AGENT_COUNT);
  const count = config.agentCount ?? personalities.length;

  return Array.from({ length: count }, (_, i) => ({
    id: `agent-${i}`,
    personality: personalities[i % personalities.length],
    status: "idle" as const,
    discoveries: [],
    iterationsCompleted: 0,
  }));
}

function buildExplorePrompt(
  agent: SwarmAgent,
  subject: string,
  investigation: Investigation | undefined,
  blackboard: Blackboard
): string {
  const personalityDesc = PERSONALITY_DESCRIPTIONS[agent.personality];
  const existingIdeas =
    blackboard.entries.length > 0
      ? blackboard.entries
          .map((e) => `- [${e.personality}] ${e.ideaTitle}: ${e.ideaDescription}`)
          .join("\n")
      : "No ideas shared yet.";

  return `You are an autonomous innovation agent with the personality: "${agent.personality}".
Personality description: ${personalityDesc}

Subject being explored: ${subject}
${investigation ? `\nInvestigation context:\n${investigation.summary}\nKey challenges: ${investigation.challenges.join(", ")}` : ""}

Ideas already on the shared blackboard:
${existingIdeas}

Your task: Generate 1-2 novel innovation ideas that reflect your personality.
${blackboard.entries.length > 0 ? "Build on, challenge, or extend existing ideas — do NOT simply repeat them." : ""}

Respond in JSON:
{
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "confidence": 0.0-1.0,
      "tags": ["tag1", "tag2"]
    }
  ]
}`;
}

function buildReactPrompt(agent: SwarmAgent, entry: BlackboardEntry): string {
  const personalityDesc = PERSONALITY_DESCRIPTIONS[agent.personality];
  return `You are an innovation agent with personality: "${agent.personality}" (${personalityDesc}).

Another agent (${entry.personality}) proposed this idea:
Title: ${entry.ideaTitle}
Description: ${entry.ideaDescription}

React to this idea from your personality's perspective. Choose one reaction type.

Respond in JSON:
{
  "type": "endorse" | "challenge" | "extend" | "merge",
  "comment": "your brief reaction (max 200 words)"
}`;
}

function buildConvergePrompt(blackboard: Blackboard, subject: string): string {
  const entries = blackboard.entries
    .map(
      (e) =>
        `- [${e.personality}] "${e.ideaTitle}": ${e.ideaDescription} (confidence: ${e.confidence}, endorsements: ${e.reactions.filter((r) => r.type === "endorse").length}, challenges: ${e.reactions.filter((r) => r.type === "challenge").length})`
    )
    .join("\n");

  return `Analyze these innovation ideas from a multi-agent swarm exploring "${subject}":

${entries}

Synthesize the best ideas, merging complementary ones and noting which had the most support.
Score overall convergence from 0-1 (1 = strong consensus on top ideas).

Respond in JSON:
{
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "originAgents": ["agent-0"],
      "originPersonalities": ["risk-taker"],
      "confidence": 0.8,
      "endorsements": 3,
      "challenges": ["challenge1"],
      "evolutionPath": ["initial idea", "extended by integrator"]
    }
  ],
  "convergenceScore": 0.75,
  "dominantThemes": ["theme1"],
  "emergentInsights": ["insight1"]
}`;
}

const ExploreResponseSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(3000),
        confidence: z.number().min(0).max(1),
        tags: z.array(z.string()).max(20).default([]),
      })
    )
    .max(5),
});

const ReactResponseSchema = z.object({
  type: z.enum(["endorse", "challenge", "extend", "merge"]),
  comment: z.string().max(1000),
});

async function agentExplore(
  agent: SwarmAgent,
  subject: string,
  investigation: Investigation | undefined,
  blackboard: Blackboard,
  config: SwarmConfig
): Promise<BlackboardEntry[]> {
  const prompt = buildExplorePrompt(agent, subject, investigation, blackboard);

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return ExploreResponseSchema.parse(parsed);
    },
    { signal: config.signal }
  );

  return result.ideas.map((idea, idx) => ({
    id: `${agent.id}-${Date.now()}-${idx}`,
    agentId: agent.id,
    personality: agent.personality,
    content: idea.description,
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    confidence: idea.confidence,
    tags: idea.tags,
    iteration: agent.iterationsCompleted,
    createdAt: new Date().toISOString(),
    reactions: [],
  }));
}

async function agentReact(
  agent: SwarmAgent,
  entry: BlackboardEntry,
  config: SwarmConfig
): Promise<{ type: "endorse" | "challenge" | "extend" | "merge"; comment: string }> {
  const prompt = buildReactPrompt(agent, entry);

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return ReactResponseSchema.parse(parsed);
    },
    { signal: config.signal }
  );
}

function computeConvergence(blackboard: Blackboard): number {
  if (blackboard.entries.length === 0) return 0;

  const endorsementRatios = blackboard.entries.map((entry) => {
    const endorsements = entry.reactions.filter((r) => r.type === "endorse").length;
    const total = entry.reactions.length || 1;
    return endorsements / total;
  });

  return endorsementRatios.reduce((sum, r) => sum + r, 0) / endorsementRatios.length;
}

/** Detect conflicts between agents based on their reactions to the same ideas. */
export function detectPersonalityConflicts(blackboard: Blackboard): Array<{
  agentA: string;
  agentB: string;
  conflictScore: number;
  conflictingIdeas: string[];
}> {
  const conflicts: Array<{
    agentA: string;
    agentB: string;
    conflictScore: number;
    conflictingIdeas: string[];
  }> = [];

  const agentReactions = new Map<string, Map<string, string>>();
  for (const entry of blackboard.entries) {
    for (const reaction of entry.reactions) {
      if (!agentReactions.has(reaction.agentId)) {
        agentReactions.set(reaction.agentId, new Map());
      }
      agentReactions.get(reaction.agentId)!.set(entry.id, reaction.type);
    }
  }

  const agentIds = [...agentReactions.keys()];
  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const reactionsA = agentReactions.get(agentIds[i])!;
      const reactionsB = agentReactions.get(agentIds[j])!;
      const conflictingIdeas: string[] = [];
      let disagreements = 0;
      let sharedEntries = 0;

      for (const [entryId, typeA] of reactionsA) {
        const typeB = reactionsB.get(entryId);
        if (typeB) {
          sharedEntries++;
          const isConflict =
            (typeA === "endorse" && typeB === "challenge") ||
            (typeA === "challenge" && typeB === "endorse");
          if (isConflict) {
            disagreements++;
            conflictingIdeas.push(entryId);
          }
        }
      }

      if (sharedEntries > 0 && disagreements > 0) {
        conflicts.push({
          agentA: agentIds[i],
          agentB: agentIds[j],
          conflictScore: disagreements / sharedEntries,
          conflictingIdeas,
        });
      }
    }
  }

  return conflicts.sort((a, b) => b.conflictScore - a.conflictScore);
}

/** Run an agentic innovation swarm that explores ideas through collective intelligence. */
export async function runSwarm(
  subject: string,
  investigation?: Investigation,
  config: SwarmConfig = {}
): Promise<SwarmResult> {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const convergenceThreshold = config.convergenceThreshold ?? DEFAULT_CONVERGENCE_THRESHOLD;
  const agents = createAgents(config);
  const blackboard: Blackboard = {
    entries: [],
    convergenceScore: 0,
    dominantThemes: [],
  };

  let stage: SwarmStage = "initializing";
  const emitProgress = () => {
    config.onProgress?.({
      stage,
      iteration: currentIteration,
      maxIterations,
      agents: [...agents],
      blackboard: { ...blackboard },
      convergenceScore: blackboard.convergenceScore,
    });
  };

  let currentIteration = 0;
  emitProgress();

  for (let iter = 0; iter < maxIterations; iter++) {
    if (config.signal?.aborted) break;
    currentIteration = iter;

    // Exploration phase
    stage = "exploring";
    for (const agent of agents) {
      if (config.signal?.aborted) break;
      agent.status = "exploring";
      emitProgress();

      try {
        const newEntries = await agentExplore(agent, subject, investigation, blackboard, config);
        blackboard.entries.push(...newEntries);
        agent.discoveries.push(...newEntries.map((e) => e.ideaTitle));
      } catch {
        agent.status = "failed";
      }
      agent.status = "idle";
      agent.iterationsCompleted = iter + 1;
    }

    // Sharing/reaction phase
    stage = "sharing";
    const recentEntries = blackboard.entries.filter((e) => e.iteration === iter);
    for (const agent of agents) {
      if (config.signal?.aborted) break;
      agent.status = "sharing";
      emitProgress();

      for (const entry of recentEntries) {
        if (entry.agentId === agent.id) continue;
        try {
          const reaction = await agentReact(agent, entry, config);
          entry.reactions.push({
            agentId: agent.id,
            ...reaction,
          });
        } catch {
          // Non-critical: skip reaction on failure
        }
      }
      agent.status = "idle";
    }

    // Check convergence
    blackboard.convergenceScore = computeConvergence(blackboard);
    if (blackboard.convergenceScore >= convergenceThreshold) {
      stage = "converging";
      emitProgress();
      break;
    }
  }

  // Final synthesis
  stage = "synthesizing";
  emitProgress();

  const convergeResult = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildConvergePrompt(blackboard, subject),
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return z
        .object({
          ideas: z.array(SwarmIdeaSchema).max(50),
          convergenceScore: z.number().min(0).max(1),
          dominantThemes: z.array(z.string().max(500)).max(20),
          emergentInsights: z.array(z.string().max(2000)).max(10),
        })
        .parse(parsed);
    },
    { signal: config.signal }
  );

  const agentContributions = agents.map((agent) => ({
    agentId: agent.id,
    personality: agent.personality,
    discoveriesCount: agent.discoveries.length,
    endorsementsGiven: blackboard.entries
      .flatMap((e) => e.reactions)
      .filter((r) => r.agentId === agent.id && r.type === "endorse").length,
    challengesMade: blackboard.entries
      .flatMap((e) => e.reactions)
      .filter((r) => r.agentId === agent.id && r.type === "challenge").length,
  }));

  stage = "complete";
  emitProgress();

  return {
    ideas: convergeResult.ideas,
    totalIterations: currentIteration + 1,
    convergenceScore: convergeResult.convergenceScore,
    agentContributions,
    dominantThemes: convergeResult.dominantThemes,
    emergentInsights: convergeResult.emergentInsights,
  };
}

/** Convert a swarm result to a markdown summary. */
export function swarmToMarkdown(result: SwarmResult): string {
  const lines: string[] = [
    "# Innovation Swarm Results",
    "",
    `**Convergence Score:** ${(result.convergenceScore * 100).toFixed(0)}%`,
    `**Total Iterations:** ${result.totalIterations}`,
    "",
    "## Top Ideas",
    "",
  ];

  for (const idea of result.ideas) {
    lines.push(`### ${idea.title}`);
    lines.push("");
    lines.push(idea.description);
    lines.push("");
    lines.push(`**Impact:** ${idea.potentialImpact}`);
    lines.push(
      `**Origin:** ${idea.originPersonalities.join(", ")} (confidence: ${(idea.confidence * 100).toFixed(0)}%)`
    );
    if (idea.challenges.length > 0) {
      lines.push(`**Challenges:** ${idea.challenges.join("; ")}`);
    }
    lines.push("");
  }

  if (result.dominantThemes.length > 0) {
    lines.push("## Dominant Themes");
    lines.push("");
    result.dominantThemes.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  if (result.emergentInsights.length > 0) {
    lines.push("## Emergent Insights");
    lines.push("");
    result.emergentInsights.forEach((i) => lines.push(`- ${i}`));
    lines.push("");
  }

  lines.push("## Agent Contributions");
  lines.push("");
  for (const c of result.agentContributions) {
    lines.push(
      `- **${c.personality}** (${c.agentId}): ${c.discoveriesCount} discoveries, ${c.endorsementsGiven} endorsements, ${c.challengesMade} challenges`
    );
  }

  return lines.join("\n");
}
