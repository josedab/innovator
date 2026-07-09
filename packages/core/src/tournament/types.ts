import { z } from "zod";

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
