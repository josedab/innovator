/**
 * @module tournament
 *
 * Gamified head-to-head idea competition with tournament brackets.
 * Supports single-elimination, double-elimination, and round-robin formats.
 * Includes Elo rating system, match execution, and tournament state machine.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const TournamentFormatSchema = z.enum([
  "single-elimination",
  "double-elimination",
  "round-robin",
]);
export type TournamentFormat = z.infer<typeof TournamentFormatSchema>;

export const TournamentStateSchema = z.enum(["setup", "in-progress", "completed", "cancelled"]);
export type TournamentState = z.infer<typeof TournamentStateSchema>;

export const MatchResultSchema = z.enum(["participant-a", "participant-b", "draw", "pending"]);
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const TournamentParticipantSchema = z.object({
  id: z.string().max(100),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(2000).optional(),
  angleId: z.string().max(100).optional(),
  elo: z.number().default(1200),
  wins: z.number().min(0).default(0),
  losses: z.number().min(0).default(0),
  draws: z.number().min(0).default(0),
  seed: z.number().min(0).optional(),
  eliminated: z.boolean().default(false),
});
export type TournamentParticipant = z.infer<typeof TournamentParticipantSchema>;

export const MatchSchema = z.object({
  id: z.string().max(100),
  round: z.number().min(0),
  matchNumber: z.number().min(0),
  participantA: z.string().max(100).nullable(),
  participantB: z.string().max(100).nullable(),
  result: MatchResultSchema.default("pending"),
  votes: z
    .object({
      a: z.number().min(0).default(0),
      b: z.number().min(0).default(0),
    })
    .default({ a: 0, b: 0 }),
  rationale: z.string().max(2000).optional(),
  judgeType: z.enum(["llm", "human", "vote"]).optional(),
  completedAt: z.string().optional(),
});
export type Match = z.infer<typeof MatchSchema>;

export const TournamentSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  format: TournamentFormatSchema,
  state: TournamentStateSchema.default("setup"),
  participants: z.array(TournamentParticipantSchema).max(64),
  matches: z.array(MatchSchema).max(500),
  currentRound: z.number().min(0).default(0),
  totalRounds: z.number().min(0).default(0),
  winnerId: z.string().max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Tournament = z.infer<typeof TournamentSchema>;

// ---- Store ----

const tournaments = new Map<string, Tournament>();

// ---- Elo Rating ----

const K_FACTOR = 32;

/** Calculate expected score in Elo system. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Update Elo ratings after a match. */
export function updateElo(
  ratingA: number,
  ratingB: number,
  result: "participant-a" | "participant-b" | "draw"
): { newRatingA: number; newRatingB: number } {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  let actualA: number, actualB: number;
  if (result === "participant-a") {
    actualA = 1;
    actualB = 0;
  } else if (result === "participant-b") {
    actualA = 0;
    actualB = 1;
  } else {
    actualA = 0.5;
    actualB = 0.5;
  }

  return {
    newRatingA: Math.round(ratingA + K_FACTOR * (actualA - expectedA)),
    newRatingB: Math.round(ratingB + K_FACTOR * (actualB - expectedB)),
  };
}

// ---- Bracket Generation ----

function nextPowerOf2(n: number): number {
  let power = 1;
  while (power < n) power *= 2;
  return power;
}

function generateSingleEliminationBracket(participants: TournamentParticipant[]): Match[] {
  const bracketSize = nextPowerOf2(participants.length);
  const totalRounds = Math.log2(bracketSize);
  const matches: Match[] = [];

  // Seed participants
  const seeded = [...participants].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));

  // First round
  let matchNum = 0;
  for (let i = 0; i < bracketSize; i += 2) {
    matches.push({
      id: `match-${randomUUID().slice(0, 8)}`,
      round: 0,
      matchNumber: matchNum++,
      participantA: seeded[i]?.id ?? null,
      participantB: seeded[i + 1]?.id ?? null,
      result: seeded[i + 1] ? "pending" : "participant-a", // bye
      votes: { a: 0, b: 0 },
    });
  }

  // Subsequent rounds (empty matches to be filled)
  for (let round = 1; round < totalRounds; round++) {
    const matchesInRound = Math.pow(2, totalRounds - round - 1);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        id: `match-${randomUUID().slice(0, 8)}`,
        round,
        matchNumber: matchNum++,
        participantA: null,
        participantB: null,
        result: "pending",
        votes: { a: 0, b: 0 },
      });
    }
  }

  return matches;
}

/** Generate a double-elimination bracket: winners bracket + losers bracket + grand final. */
function generateDoubleEliminationBracket(participants: TournamentParticipant[]): Match[] {
  // Winners bracket is standard single-elimination
  const winnerMatches = generateSingleEliminationBracket(participants);
  const winnerRounds = Math.ceil(Math.log2(participants.length));

  // Mark all winner bracket matches
  for (const m of winnerMatches) {
    m.id = `W-${m.id}`;
  }

  let matchNum = winnerMatches.length;
  const loserMatches: Match[] = [];

  // Losers bracket: roughly 2*(winnerRounds - 1) rounds
  // Each winners bracket round feeds losers into the losers bracket
  const losersRounds = (winnerRounds - 1) * 2;
  for (let round = 0; round < losersRounds; round++) {
    const matchesInRound = Math.max(
      1,
      Math.ceil(participants.length / Math.pow(2, Math.floor(round / 2) + 2))
    );
    for (let i = 0; i < matchesInRound; i++) {
      loserMatches.push({
        id: `L-match-${randomUUID().slice(0, 8)}`,
        round: winnerRounds + round,
        matchNumber: matchNum++,
        participantA: null,
        participantB: null,
        result: "pending",
        votes: { a: 0, b: 0 },
      });
    }
  }

  // Grand final
  const grandFinal: Match = {
    id: `GF-match-${randomUUID().slice(0, 8)}`,
    round: winnerRounds + losersRounds,
    matchNumber: matchNum++,
    participantA: null,
    participantB: null,
    result: "pending",
    votes: { a: 0, b: 0 },
  };

  return [...winnerMatches, ...loserMatches, grandFinal];
}

function generateRoundRobinSchedule(participants: TournamentParticipant[]): Match[] {
  const matches: Match[] = [];
  let matchNum = 0;

  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      matches.push({
        id: `match-${randomUUID().slice(0, 8)}`,
        round: 0, // All matches are in "round 0" for round-robin
        matchNumber: matchNum++,
        participantA: participants[i].id,
        participantB: participants[j].id,
        result: "pending",
        votes: { a: 0, b: 0 },
      });
    }
  }

  return matches;
}

// ---- Tournament CRUD ----

/** Create a new tournament. */
export function createTournament(input: {
  name: string;
  description?: string;
  format: TournamentFormat;
  ideas: Array<{ title: string; description?: string; angleId?: string }>;
}): Tournament {
  if (input.ideas.length < 2) {
    throw new ValidationError("Tournament requires at least 2 participants");
  }
  if (input.ideas.length > 64) {
    throw new ValidationError("Tournament supports at most 64 participants");
  }

  const participants: TournamentParticipant[] = input.ideas.map((idea, i) => ({
    id: `tp-${randomUUID().slice(0, 8)}`,
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    angleId: idea.angleId,
    elo: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    seed: i,
    eliminated: false,
  }));

  let matches: Match[];
  let totalRounds: number;

  if (input.format === "round-robin") {
    matches = generateRoundRobinSchedule(participants);
    totalRounds = 1;
  } else if (input.format === "double-elimination") {
    matches = generateDoubleEliminationBracket(participants);
    totalRounds = Math.ceil(Math.log2(participants.length)) * 2;
  } else {
    // single-elimination
    matches = generateSingleEliminationBracket(participants);
    totalRounds = Math.ceil(Math.log2(participants.length));
  }

  const now = new Date().toISOString();
  const tournament: Tournament = {
    id: `tour-${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    format: input.format,
    state: "setup",
    participants,
    matches,
    currentRound: 0,
    totalRounds,
    createdAt: now,
    updatedAt: now,
  };

  tournaments.set(tournament.id, tournament);
  return tournament;
}

/** Get a tournament by ID. */
export function getTournament(id: string): Tournament | undefined {
  return tournaments.get(id);
}

/** List all tournaments. */
export function listTournaments(): Tournament[] {
  return Array.from(tournaments.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete a tournament. */
export function deleteTournament(id: string): boolean {
  return tournaments.delete(id);
}

/** Start a tournament (transition from setup to in-progress). */
export function startTournament(id: string): Tournament | undefined {
  const tournament = tournaments.get(id);
  if (!tournament || tournament.state !== "setup") return undefined;

  tournament.state = "in-progress";
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

// ---- Match Execution ----

/** Record the result of a match. */
export function resolveMatch(
  tournamentId: string,
  matchId: string,
  result: "participant-a" | "participant-b" | "draw",
  rationale?: string,
  judgeType?: "llm" | "human" | "vote"
): Match | undefined {
  const tournament = tournaments.get(tournamentId);
  if (!tournament || tournament.state !== "in-progress") return undefined;

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match || match.result !== "pending") return undefined;
  if (!match.participantA || !match.participantB) return undefined;

  match.result = result;
  match.rationale = rationale;
  match.judgeType = judgeType;
  match.completedAt = new Date().toISOString();

  // Update participant stats
  const pA = tournament.participants.find((p) => p.id === match.participantA);
  const pB = tournament.participants.find((p) => p.id === match.participantB);

  if (pA && pB) {
    const eloResult = updateElo(pA.elo, pB.elo, result);
    pA.elo = eloResult.newRatingA;
    pB.elo = eloResult.newRatingB;

    if (result === "participant-a") {
      pA.wins++;
      pB.losses++;
      if (tournament.format === "single-elimination") pB.eliminated = true;
    } else if (result === "participant-b") {
      pB.wins++;
      pA.losses++;
      if (tournament.format === "single-elimination") pA.eliminated = true;
    } else {
      pA.draws++;
      pB.draws++;
    }
  }

  // Advance winner to next round (single-elimination)
  if (tournament.format === "single-elimination" || tournament.format === "double-elimination") {
    advanceBracket(tournament, match, result);
  }

  // Check if tournament is complete
  checkTournamentCompletion(tournament);
  tournament.updatedAt = new Date().toISOString();

  return match;
}

function advanceBracket(
  tournament: Tournament,
  match: Match,
  result: "participant-a" | "participant-b" | "draw"
): void {
  const winnerId =
    result === "participant-a"
      ? match.participantA
      : result === "participant-b"
        ? match.participantB
        : null;

  if (!winnerId) return;

  // Find all matches in the next round
  const nextRoundMatches = tournament.matches.filter((m) => m.round === match.round + 1);
  if (nextRoundMatches.length === 0) return;

  // Calculate which match in the next round this feeds into
  const matchesInCurrentRound = tournament.matches.filter((m) => m.round === match.round);
  const indexInRound = matchesInCurrentRound.findIndex((m) => m.id === match.id);
  if (indexInRound < 0) return;

  const nextMatchIndex = Math.floor(indexInRound / 2);
  if (nextMatchIndex >= nextRoundMatches.length) return;

  const nextMatch = nextRoundMatches[nextMatchIndex];
  if (!nextMatch) return;

  // Fill the appropriate slot based on position
  const isFirstFeeder = indexInRound % 2 === 0;
  if (isFirstFeeder) {
    nextMatch.participantA = winnerId;
  } else {
    nextMatch.participantB = winnerId;
  }
}

function checkTournamentCompletion(tournament: Tournament): void {
  const pendingMatches = tournament.matches.filter(
    (m) => m.result === "pending" && m.participantA && m.participantB
  );

  if (pendingMatches.length === 0) {
    // All matches resolved
    const notEliminated = tournament.participants.filter((p) => !p.eliminated);
    if (notEliminated.length === 1) {
      tournament.winnerId = notEliminated[0].id;
      tournament.state = "completed";
    } else if (tournament.format === "round-robin") {
      // Build head-to-head record for tiebreaking
      const h2h = new Map<string, Map<string, number>>();
      for (const m of tournament.matches) {
        if (m.result === "pending" || !m.participantA || !m.participantB) continue;
        if (!h2h.has(m.participantA)) h2h.set(m.participantA, new Map());
        if (!h2h.has(m.participantB)) h2h.set(m.participantB, new Map());
        if (m.result === "participant-a") {
          h2h.get(m.participantA)!.set(m.participantB, 1);
          h2h.get(m.participantB)!.set(m.participantA, -1);
        } else if (m.result === "participant-b") {
          h2h.get(m.participantB)!.set(m.participantA, 1);
          h2h.get(m.participantA)!.set(m.participantB, -1);
        }
      }

      const sorted = [...tournament.participants].sort((a, b) => {
        // Primary: most wins
        if (b.wins !== a.wins) return b.wins - a.wins;
        // Secondary: head-to-head record
        const aBeatsB = h2h.get(a.id)?.get(b.id) ?? 0;
        if (aBeatsB !== 0) return -aBeatsB;
        // Tertiary: highest Elo
        return b.elo - a.elo;
      });
      tournament.winnerId = sorted[0]?.id;
      tournament.state = "completed";
    }
  }
}

/** Cast a vote in a match (for human voting mode). */
export function voteInMatch(
  tournamentId: string,
  matchId: string,
  vote: "a" | "b"
): Match | undefined {
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return undefined;

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match || match.result !== "pending") return undefined;

  if (vote === "a") match.votes.a++;
  else match.votes.b++;

  tournament.updatedAt = new Date().toISOString();
  return match;
}

// ---- Leaderboard ----

/** Get tournament leaderboard sorted by Elo rating. */
export function getLeaderboard(tournamentId: string): TournamentParticipant[] | undefined {
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return undefined;

  return [...tournament.participants].sort((a, b) => b.elo - a.elo);
}

/** Get bracket data for visualization. */
export function getBracketData(tournamentId: string):
  | {
      rounds: Array<{ round: number; matches: Match[] }>;
      participants: TournamentParticipant[];
    }
  | undefined {
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return undefined;

  const rounds = new Map<number, Match[]>();
  for (const match of tournament.matches) {
    const round = rounds.get(match.round) ?? [];
    round.push(match);
    rounds.set(match.round, round);
  }

  return {
    rounds: Array.from(rounds.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, matches]) => ({ round, matches })),
    participants: tournament.participants,
  };
}

/** Clear all tournaments (for testing). */
export function clearTournaments(): void {
  tournaments.clear();
}

// ---- LLM Judge & Evolutionary Tournament ----

export {
  type JudgingCriterion,
  type MatchJudgment,
  type JudgeConfig,
  type AutoJudgeProgress,
  type EvolutionaryTournamentConfig,
  type EvolutionaryTournamentResult,
  DEFAULT_JUDGING_CRITERIA,
  judgeMatch,
  autoJudgeTournament,
  runEvolutionaryTournament,
  evolutionaryTournamentToMarkdown,
} from "./llm-judge.js";
