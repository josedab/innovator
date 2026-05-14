/**
 * @module tournament/llm-judge
 *
 * LLM-powered match judging and tournament-evolution integration.
 * Connects the tournament bracket system with the genetic evolution engine
 * for automated idea competition, crossover of winners, and
 * multi-round evolutionary tournaments.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { Tournament, TournamentParticipant, Match } from "./index.js";
import {
  getTournament,
  resolveMatch,
  getLeaderboard,
  createTournament,
  startTournament,
} from "./index.js";
import type { InnovationIdea } from "../types.js";

// ---- LLM Judge Types ----

export const JudgingCriterionSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(500),
  weight: z.number().min(0).max(1),
});

export const MatchJudgmentSchema = z.object({
  winner: z.enum(["a", "b", "draw"]),
  scoreA: z.number().min(0).max(100),
  scoreB: z.number().min(0).max(100),
  rationale: z.string().max(2000),
  criteriaScores: z.array(
    z.object({
      criterion: z.string(),
      scoreA: z.number().min(0).max(100),
      scoreB: z.number().min(0).max(100),
    })
  ),
  confidence: z.number().min(0).max(1).optional(),
});

export type JudgingCriterion = z.infer<typeof JudgingCriterionSchema>;
export type MatchJudgment = z.infer<typeof MatchJudgmentSchema>;

export const DEFAULT_JUDGING_CRITERIA: JudgingCriterion[] = [
  { name: "Novelty", description: "How unique and original is the idea?", weight: 0.25 },
  { name: "Feasibility", description: "How realistic is the implementation?", weight: 0.25 },
  { name: "Impact", description: "How significant is the potential impact?", weight: 0.3 },
  { name: "Clarity", description: "How well-defined and actionable is the idea?", weight: 0.2 },
];

// ---- LLM Judge ----

export interface JudgeConfig {
  criteria?: JudgingCriterion[];
  model?: string;
  signal?: AbortSignal;
  context?: string;
}

/**
 * Use LLM to judge a head-to-head match between two ideas.
 */
export async function judgeMatch(
  ideaA: { title: string; description: string },
  ideaB: { title: string; description: string },
  config: JudgeConfig = {}
): Promise<MatchJudgment> {
  const criteria = config.criteria ?? DEFAULT_JUDGING_CRITERIA;

  const criteriaText = criteria
    .map((c) => `- ${c.name} (weight: ${c.weight}): ${c.description}`)
    .join("\n");

  const prompt = `You are an impartial innovation judge evaluating two ideas head-to-head.
${config.context ? `\nCONTEXT: ${sanitizeLlmOutput(config.context)}` : ""}

IDEA A:
${wrapUserInput("TITLE", ideaA.title)}
${wrapUserInput("DESCRIPTION", ideaA.description)}

IDEA B:
${wrapUserInput("TITLE", ideaB.title)}
${wrapUserInput("DESCRIPTION", ideaB.description)}

JUDGING CRITERIA:
${criteriaText}

Score each idea 0-100 on each criterion. Determine the overall winner based on weighted scores.

Respond with JSON only:
{
  "winner": "a" | "b" | "draw",
  "scoreA": <overall 0-100>,
  "scoreB": <overall 0-100>,
  "rationale": "...",
  "criteriaScores": [
    { "criterion": "Novelty", "scoreA": 80, "scoreB": 70 },
    ...
  ]
}`;

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const jsonStr = extractJson(raw);
      const judgment = MatchJudgmentSchema.parse(JSON.parse(jsonStr));

      // Compute statistical confidence from criteria score variance
      if (judgment.criteriaScores.length > 0 && judgment.confidence === undefined) {
        const diffs = judgment.criteriaScores.map((cs) => cs.scoreA - cs.scoreB);
        const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance =
          diffs.length > 1
            ? diffs.reduce((sum, d) => sum + (d - meanDiff) ** 2, 0) / (diffs.length - 1)
            : 0;
        const stdDev = Math.sqrt(variance);
        // Confidence: high when score gap is large relative to variance
        const absDiff = Math.abs(judgment.scoreA - judgment.scoreB);
        judgment.confidence =
          Math.round(Math.min(1, absDiff / Math.max(1, absDiff + stdDev)) * 100) / 100;
      }

      return judgment;
    },
    {
      signal: config.signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

// ---- Auto-Judge Tournament ----

export interface AutoJudgeProgress {
  tournamentId: string;
  totalMatches: number;
  completedMatches: number;
  currentMatch?: { ideaA: string; ideaB: string };
  phase: "judging" | "complete";
}

/**
 * Automatically judge all pending matches in a tournament using LLM.
 */
export async function autoJudgeTournament(
  tournamentId: string,
  config: JudgeConfig = {},
  onProgress?: (progress: AutoJudgeProgress) => void
): Promise<Tournament | undefined> {
  const tournament = getTournament(tournamentId);
  if (!tournament || tournament.state !== "in-progress") return undefined;

  const pendingMatches = tournament.matches.filter(
    (m) => m.result === "pending" && m.participantA && m.participantB
  );

  for (let i = 0; i < pendingMatches.length; i++) {
    const match = pendingMatches[i];
    const pA = tournament.participants.find((p) => p.id === match.participantA);
    const pB = tournament.participants.find((p) => p.id === match.participantB);

    if (!pA || !pB) continue;

    onProgress?.({
      tournamentId,
      totalMatches: pendingMatches.length,
      completedMatches: i,
      currentMatch: { ideaA: pA.ideaTitle, ideaB: pB.ideaTitle },
      phase: "judging",
    });

    try {
      const judgment = await judgeMatch(
        { title: pA.ideaTitle, description: pA.ideaDescription ?? "" },
        { title: pB.ideaTitle, description: pB.ideaDescription ?? "" },
        config
      );

      const result =
        judgment.winner === "a"
          ? ("participant-a" as const)
          : judgment.winner === "b"
            ? ("participant-b" as const)
            : ("draw" as const);

      resolveMatch(tournamentId, match.id, result, judgment.rationale, "llm");
    } catch (judgeErr) {
      // Record failure reason in the match for debugging
      const reason = judgeErr instanceof Error ? judgeErr.message : "unknown error";
      match.rationale = `[Judgment failed: ${reason}]`;
    }
  }

  onProgress?.({
    tournamentId,
    totalMatches: pendingMatches.length,
    completedMatches: pendingMatches.length,
    phase: "complete",
  });

  return getTournament(tournamentId);
}

// ---- Evolutionary Tournament ----

export interface EvolutionaryTournamentConfig {
  rounds: number;
  ideasPerRound: number;
  crossoverTopN: number;
  judgeConfig?: JudgeConfig;
}

export interface EvolutionaryTournamentResult {
  tournamentId: string;
  rounds: Array<{
    round: number;
    tournamentId: string;
    winnerId?: string;
    winnerTitle: string;
    leaderboard: TournamentParticipant[];
  }>;
  finalChampion: { title: string; description: string; elo: number };
  genealogy: Array<{ id: string; title: string; parentTitles: string[]; round: number }>;
}

/**
 * Build a crossover prompt for creating hybrid ideas from tournament winners.
 */
function buildCrossoverPrompt(ideas: Array<{ title: string; description: string }>): string {
  const ideaSummaries = ideas
    .map(
      (i, idx) =>
        `IDEA ${idx + 1}: ${sanitizeLlmOutput(i.title)} — ${sanitizeLlmOutput(i.description)}`
    )
    .join("\n\n");

  return `You are an innovation crossover engine. Combine the strongest aspects of these winning ideas into novel hybrids.

${ideaSummaries}

Generate ${Math.min(ideas.length, 3)} NEW hybrid ideas that blend and improve upon the originals.
Each hybrid should be distinctly different from the inputs.

Respond with JSON only:
{
  "hybrids": [
    { "title": "...", "description": "...", "parentIndices": [0, 1] }
  ]
}`;
}

const HybridResponseSchema = z.object({
  hybrids: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(2000),
      parentIndices: z.array(z.number()),
    })
  ),
});

/**
 * Run an evolutionary tournament: multiple tournament rounds where
 * winners from each round are cross-bred to create the next generation.
 */
export async function runEvolutionaryTournament(
  initialIdeas: Array<{ title: string; description: string; angleId?: string }>,
  config: EvolutionaryTournamentConfig = { rounds: 3, ideasPerRound: 8, crossoverTopN: 4 }
): Promise<EvolutionaryTournamentResult> {
  const genealogy: EvolutionaryTournamentResult["genealogy"] = [];
  const rounds: EvolutionaryTournamentResult["rounds"] = [];
  let currentIdeas = initialIdeas;

  // Track lineage
  for (const idea of currentIdeas) {
    genealogy.push({ id: idea.title, title: idea.title, parentTitles: [], round: 0 });
  }

  for (let round = 0; round < config.rounds; round++) {
    // Create and run tournament
    const tournament = createTournament({
      name: `Evolution Round ${round + 1}`,
      format: currentIdeas.length <= 4 ? "round-robin" : "single-elimination",
      ideas: currentIdeas,
    });

    startTournament(tournament.id);
    await autoJudgeTournament(tournament.id, config.judgeConfig);

    const finalTournament = getTournament(tournament.id)!;
    const leaderboard = getLeaderboard(tournament.id) ?? [];
    const winner = leaderboard[0];

    rounds.push({
      round,
      tournamentId: tournament.id,
      winnerId: winner?.id,
      winnerTitle: winner?.ideaTitle ?? "Unknown",
      leaderboard,
    });

    // If not the last round, crossover top ideas for next generation
    if (round < config.rounds - 1) {
      const topIdeas = leaderboard.slice(0, config.crossoverTopN).map((p) => ({
        title: p.ideaTitle,
        description: p.ideaDescription ?? "",
      }));

      try {
        const prompt = buildCrossoverPrompt(topIdeas);
        const raw = await generateText({
          prompt,
          model: config.judgeConfig?.model,
          signal: config.judgeConfig?.signal,
        });
        const jsonStr = extractJson(raw);
        const parsed = HybridResponseSchema.parse(JSON.parse(jsonStr));

        const hybrids = parsed.hybrids.map((h) => {
          const parentTitles = h.parentIndices.map((i) => topIdeas[i]?.title ?? "Unknown");
          genealogy.push({
            id: h.title,
            title: h.title,
            parentTitles,
            round: round + 1,
          });
          return { title: h.title, description: h.description };
        });

        // Next round: survivors + hybrids
        currentIdeas = [
          ...topIdeas.slice(0, 2), // Keep top 2 survivors
          ...hybrids,
        ].slice(0, config.ideasPerRound);
      } catch {
        // On failure, just carry forward top ideas
        currentIdeas = leaderboard.slice(0, config.ideasPerRound).map((p) => ({
          title: p.ideaTitle,
          description: p.ideaDescription ?? "",
        }));
      }
    }
  }

  const finalLeaderboard = rounds[rounds.length - 1]?.leaderboard ?? [];
  const champion = finalLeaderboard[0];

  return {
    tournamentId: rounds[0]?.tournamentId ?? "",
    rounds,
    finalChampion: {
      title: champion?.ideaTitle ?? "No champion",
      description: champion?.ideaDescription ?? "",
      elo: champion?.elo ?? 0,
    },
    genealogy,
  };
}

/**
 * Format evolutionary tournament results as markdown.
 */
export function evolutionaryTournamentToMarkdown(result: EvolutionaryTournamentResult): string {
  const lines: string[] = [
    "# 🏆 Evolutionary Tournament Results",
    "",
    `**Champion:** ${result.finalChampion.title} (Elo: ${result.finalChampion.elo})`,
    "",
    `> ${result.finalChampion.description}`,
    "",
    `**Rounds:** ${result.rounds.length}`,
    "",
  ];

  for (const round of result.rounds) {
    lines.push(`## Round ${round.round + 1}`);
    lines.push(`**Winner:** ${round.winnerTitle}`);
    lines.push("");
    lines.push("| Rank | Idea | Elo | W-L |");
    lines.push("|------|------|-----|-----|");
    for (const p of round.leaderboard.slice(0, 5)) {
      lines.push(
        `| ${round.leaderboard.indexOf(p) + 1} | ${p.ideaTitle} | ${p.elo} | ${p.wins}-${p.losses} |`
      );
    }
    lines.push("");
  }

  if (result.genealogy.length > 0) {
    lines.push("## Genealogy");
    for (const entry of result.genealogy.filter((g) => g.parentTitles.length > 0)) {
      lines.push(`- **${entry.title}** ← ${entry.parentTitles.join(" × ")} (round ${entry.round})`);
    }
  }

  return lines.join("\n");
}
