/**
 * @module tournament
 *
 * Gamified head-to-head idea competition with tournament brackets.
 * Supports single-elimination, double-elimination, and round-robin formats.
 * Includes Elo rating, match execution, LLM judging, and evolutionary tournaments.
 */

export {
  TournamentFormatSchema,
  TournamentStateSchema,
  MatchResultSchema,
  TournamentParticipantSchema,
  MatchSchema,
  TournamentSchema,
} from "./types.js";
export type {
  TournamentFormat,
  TournamentState,
  MatchResult,
  TournamentParticipant,
  Match,
  Tournament,
} from "./types.js";

export {
  updateElo,
  createTournament,
  getTournament,
  listTournaments,
  deleteTournament,
  startTournament,
  resolveMatch,
  voteInMatch,
  getLeaderboard,
  getBracketData,
  clearTournaments,
} from "./tournament.js";

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
