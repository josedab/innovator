/**
 * @module wargaming
 *
 * Innovation Scenario Wargaming — simulate competitive responses to ideas
 * using adversarial LLM agents playing competitor roles. Models move/counter-move
 * sequences across multiple rounds, producing strategy resilience scores and
 * counter-strategy recommendations.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { LlmParseError } from "../errors.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

/** Competitor persona type for wargaming. */
export const CompetitorPersonaSchema = z.object({
  name: z.string().max(200),
  type: z.enum(["incumbent", "disruptor", "fast-follower", "niche-player", "big-tech", "startup"]),
  strengths: z.array(z.string().max(500)).max(10),
  weaknesses: z.array(z.string().max(500)).max(10),
  likelyStrategy: z.string().max(1000),
  resourceLevel: z.enum(["low", "medium", "high", "massive"]),
});

/** A single move in a wargaming round. */
export const WargamingMoveSchema = z.object({
  actor: z.string().max(200),
  moveType: z.enum(["offensive", "defensive", "counter", "pivot", "alliance"]),
  description: z.string().max(2000),
  targetedWeakness: z.string().max(500).optional(),
  expectedImpact: z.enum(["negligible", "minor", "moderate", "significant", "devastating"]),
  timeToExecute: z.enum(["days", "weeks", "months", "quarters"]),
});

/** A single round of wargaming. */
export const WargamingRoundSchema = z.object({
  roundNumber: z.number().min(1).max(10),
  yourMove: WargamingMoveSchema,
  competitorMoves: z.array(WargamingMoveSchema).max(10),
  marketShiftDescription: z.string().max(1000),
  resilienceAfterRound: z.number().min(0).max(100),
});

/** Counter-strategy recommendation. */
export const CounterStrategySchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  targetCompetitor: z.string().max(200),
  priority: z.enum(["critical", "high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  defensiveActions: z.array(z.string().max(500)).max(5),
  offensiveActions: z.array(z.string().max(500)).max(5),
});

/** Full wargaming session result. */
export const WargamingResultSchema = z.object({
  ideaTitle: z.string().max(500),
  subject: z.string().max(2000),
  competitors: z.array(CompetitorPersonaSchema).max(10),
  rounds: z.array(WargamingRoundSchema).max(10),
  overallResilienceScore: z.number().min(0).max(100),
  vulnerabilities: z.array(z.string().max(500)).max(10),
  counterStrategies: z.array(CounterStrategySchema).max(10),
  strategicBrief: z.string().max(5000),
});

// ---- Types ----

export type CompetitorPersona = z.infer<typeof CompetitorPersonaSchema>;
export type WargamingMove = z.infer<typeof WargamingMoveSchema>;
export type WargamingRound = z.infer<typeof WargamingRoundSchema>;
export type CounterStrategy = z.infer<typeof CounterStrategySchema>;
export type WargamingResult = z.infer<typeof WargamingResultSchema>;

/** Configuration for a wargaming session. */
export interface WargamingConfig {
  rounds?: number;
  competitors?: CompetitorPersona[];
  model?: string;
  signal?: AbortSignal;
}

// ---- In-Memory Store ----

const wargamingSessions = new Map<string, WargamingResult>();

// ---- Core Functions ----

/**
 * Build competitor personas for a given idea and subject.
 */
async function generateCompetitors(
  ideaTitle: string,
  ideaDescription: string,
  subject: string,
  model?: string,
  signal?: AbortSignal
): Promise<CompetitorPersona[]> {
  const prompt = `You are a competitive strategy expert. Identify 3-4 likely competitors who would respond to this innovation idea.

${wrapUserInput("SUBJECT", subject)}

IDEA: ${sanitizeLlmOutput(ideaTitle)}
DESCRIPTION: ${sanitizeLlmOutput(ideaDescription)}

For each competitor, determine their type, strengths, weaknesses, likely strategy, and resource level.

Return valid JSON only:
{
  "competitors": [
    {
      "name": "Competitor Name",
      "type": "incumbent|disruptor|fast-follower|niche-player|big-tech|startup",
      "strengths": ["strength1"],
      "weaknesses": ["weakness1"],
      "likelyStrategy": "Their most likely competitive response",
      "resourceLevel": "low|medium|high|massive"
    }
  ]
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(`Failed to parse competitors: ${jsonStr.slice(0, 200)}`, jsonStr);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  const result = z.object({ competitors: z.array(CompetitorPersonaSchema).max(10) }).parse(parsed);
  return result.competitors;
}

/**
 * Simulate a single wargaming round.
 */
async function simulateRound(
  ideaTitle: string,
  ideaDescription: string,
  subject: string,
  competitors: CompetitorPersona[],
  roundNumber: number,
  previousRounds: WargamingRound[],
  model?: string,
  signal?: AbortSignal
): Promise<WargamingRound> {
  const historyContext =
    previousRounds.length > 0
      ? `\nPREVIOUS ROUNDS:\n${previousRounds
          .map(
            (r) =>
              `Round ${r.roundNumber}: Your move: ${r.yourMove.description}. ` +
              `Competitor responses: ${r.competitorMoves.map((m) => `${m.actor}: ${m.description}`).join("; ")}. ` +
              `Resilience: ${r.resilienceAfterRound}/100`
          )
          .join("\n")}`
      : "";

  const prompt = `You are simulating a competitive wargaming exercise. This is Round ${roundNumber} of a strategic scenario.

${wrapUserInput("SUBJECT", subject)}

YOUR IDEA: ${sanitizeLlmOutput(ideaTitle)}
DESCRIPTION: ${sanitizeLlmOutput(ideaDescription)}

COMPETITORS:
${competitors
  .map(
    (c) =>
      `- ${sanitizeLlmOutput(c.name)} (${c.type}): Strengths: ${c.strengths.join(", ")}. Strategy: ${c.likelyStrategy}`
  )
  .join("\n")}
${historyContext}

Simulate Round ${roundNumber}:
1. Determine your best strategic move to advance this idea
2. Determine how each competitor would respond
3. Assess the market impact and resulting resilience score (0-100)

Return valid JSON only:
{
  "roundNumber": ${roundNumber},
  "yourMove": {
    "actor": "You",
    "moveType": "offensive|defensive|counter|pivot|alliance",
    "description": "Your strategic move",
    "expectedImpact": "negligible|minor|moderate|significant|devastating",
    "timeToExecute": "days|weeks|months|quarters"
  },
  "competitorMoves": [
    {
      "actor": "Competitor Name",
      "moveType": "offensive|defensive|counter|pivot|alliance",
      "description": "Their response",
      "targetedWeakness": "What weakness they exploit",
      "expectedImpact": "negligible|minor|moderate|significant|devastating",
      "timeToExecute": "days|weeks|months|quarters"
    }
  ],
  "marketShiftDescription": "How the market landscape changed",
  "resilienceAfterRound": 75
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(`Failed to parse round: ${jsonStr.slice(0, 200)}`, jsonStr);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  return WargamingRoundSchema.parse(parsed);
}

/**
 * Generate final strategic assessment after all rounds.
 */
async function generateStrategicBrief(
  ideaTitle: string,
  subject: string,
  competitors: CompetitorPersona[],
  rounds: WargamingRound[],
  model?: string,
  signal?: AbortSignal
): Promise<{
  vulnerabilities: string[];
  counterStrategies: CounterStrategy[];
  strategicBrief: string;
  overallResilienceScore: number;
}> {
  const prompt = `You are a chief strategy officer writing a final assessment after a competitive wargaming exercise.

${wrapUserInput("SUBJECT", subject)}
IDEA: ${sanitizeLlmOutput(ideaTitle)}

COMPETITORS: ${competitors.map((c) => c.name).join(", ")}

WARGAMING ROUNDS:
${rounds
  .map(
    (r) =>
      `Round ${r.roundNumber} (resilience: ${r.resilienceAfterRound}/100):
  Your move: ${r.yourMove.description}
  Competitor responses: ${r.competitorMoves.map((m) => `${m.actor}: ${m.description}`).join("; ")}
  Market shift: ${r.marketShiftDescription}`
  )
  .join("\n\n")}

Produce a final strategic assessment including:
1. Overall resilience score (0-100)
2. Key vulnerabilities identified
3. Counter-strategies for each major threat
4. A strategic brief summarizing findings

Return valid JSON only:
{
  "overallResilienceScore": 70,
  "vulnerabilities": ["vulnerability1"],
  "counterStrategies": [
    {
      "title": "Strategy title",
      "description": "Description",
      "targetCompetitor": "Competitor name",
      "priority": "critical|high|medium|low",
      "effort": "low|medium|high",
      "defensiveActions": ["action1"],
      "offensiveActions": ["action1"]
    }
  ],
  "strategicBrief": "Executive summary of wargaming findings..."
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(`Failed to parse brief: ${jsonStr.slice(0, 200)}`, jsonStr);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  return z
    .object({
      overallResilienceScore: z.number().min(0).max(100),
      vulnerabilities: z.array(z.string().max(500)).max(10),
      counterStrategies: z.array(CounterStrategySchema).max(10),
      strategicBrief: z.string().max(5000),
    })
    .parse(parsed);
}

/**
 * Run a full wargaming session for an idea.
 *
 * @param ideaTitle - Title of the idea to wargame
 * @param ideaDescription - Description of the idea
 * @param subject - The innovation subject
 * @param config - Optional wargaming configuration
 * @returns Full wargaming result with resilience score and counter-strategies
 */
export async function runWargaming(
  ideaTitle: string,
  ideaDescription: string,
  subject: string,
  config?: WargamingConfig
): Promise<WargamingResult> {
  const numRounds = Math.min(Math.max(config?.rounds ?? 3, 1), 5);
  const model = config?.model;
  const signal = config?.signal;

  const competitors = config?.competitors?.length
    ? config.competitors
    : await generateCompetitors(ideaTitle, ideaDescription, subject, model, signal);

  const rounds: WargamingRound[] = [];
  for (let i = 1; i <= numRounds; i++) {
    const round = await simulateRound(
      ideaTitle,
      ideaDescription,
      subject,
      competitors,
      i,
      rounds,
      model,
      signal
    );
    rounds.push(round);
  }

  const assessment = await generateStrategicBrief(
    ideaTitle,
    subject,
    competitors,
    rounds,
    model,
    signal
  );

  const result: WargamingResult = {
    ideaTitle,
    subject,
    competitors,
    rounds,
    ...assessment,
  };

  const sessionKey = `${subject}::${ideaTitle}`;
  wargamingSessions.set(sessionKey, result);

  return result;
}

/**
 * Get a stored wargaming session.
 */
export function getWargamingSession(
  subject: string,
  ideaTitle: string
): WargamingResult | undefined {
  return wargamingSessions.get(`${subject}::${ideaTitle}`);
}

/**
 * List all wargaming sessions.
 */
export function listWargamingSessions(): WargamingResult[] {
  return [...wargamingSessions.values()];
}

/**
 * Format wargaming results as Markdown.
 */
export function wargamingToMarkdown(result: WargamingResult): string {
  const lines: string[] = [
    `# 🎯 Wargaming Report: ${result.ideaTitle}`,
    "",
    `**Subject:** ${result.subject}`,
    `**Overall Resilience Score:** ${result.overallResilienceScore}/100`,
    "",
    "## Competitors",
    "",
  ];

  for (const c of result.competitors) {
    lines.push(`### ${c.name} (${c.type})`);
    lines.push(`- **Resources:** ${c.resourceLevel}`);
    lines.push(`- **Strategy:** ${c.likelyStrategy}`);
    lines.push(`- **Strengths:** ${c.strengths.join(", ")}`);
    lines.push(`- **Weaknesses:** ${c.weaknesses.join(", ")}`);
    lines.push("");
  }

  lines.push("## Wargaming Rounds", "");
  for (const r of result.rounds) {
    lines.push(`### Round ${r.roundNumber} (Resilience: ${r.resilienceAfterRound}/100)`);
    lines.push(`**Your Move:** [${r.yourMove.moveType}] ${r.yourMove.description}`);
    for (const m of r.competitorMoves) {
      lines.push(`- **${m.actor}:** [${m.moveType}] ${m.description}`);
    }
    lines.push(`**Market Shift:** ${r.marketShiftDescription}`);
    lines.push("");
  }

  lines.push("## Vulnerabilities", "");
  for (const v of result.vulnerabilities) {
    lines.push(`- ⚠️ ${v}`);
  }

  lines.push("", "## Counter-Strategies", "");
  for (const cs of result.counterStrategies) {
    lines.push(`### ${cs.title} [${cs.priority}]`);
    lines.push(`**Target:** ${cs.targetCompetitor} | **Effort:** ${cs.effort}`);
    lines.push(`${cs.description}`);
    if (cs.defensiveActions.length) lines.push(`**Defensive:** ${cs.defensiveActions.join("; ")}`);
    if (cs.offensiveActions.length) lines.push(`**Offensive:** ${cs.offensiveActions.join("; ")}`);
    lines.push("");
  }

  lines.push("## Strategic Brief", "", result.strategicBrief);

  return lines.join("\n");
}

/**
 * Clear all wargaming sessions (for testing).
 */
export function clearWargamingSessions(): void {
  wargamingSessions.clear();
}
