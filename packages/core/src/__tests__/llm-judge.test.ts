import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

// Mock tournament/index.js functions
vi.mock("../tournament/index.js", () => ({
  getTournament: vi.fn(),
  resolveMatch: vi.fn(),
  getLeaderboard: vi.fn(),
  createTournament: vi.fn(),
  startTournament: vi.fn(),
}));

import { generateText, extractJson } from "../copilot/client.js";
import {
  getTournament,
  resolveMatch,
  getLeaderboard,
  createTournament,
  startTournament,
} from "../tournament/index.js";

import {
  judgeMatch,
  autoJudgeTournament,
  runEvolutionaryTournament,
  evolutionaryTournamentToMarkdown,
  MatchJudgmentSchema,
} from "../tournament/llm-judge.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);
const mockGetTournament = vi.mocked(getTournament);
const mockResolveMatch = vi.mocked(resolveMatch);
const mockGetLeaderboard = vi.mocked(getLeaderboard);
const mockCreateTournament = vi.mocked(createTournament);
const mockStartTournament = vi.mocked(startTournament);

const VALID_JUDGMENT = {
  winner: "a" as const,
  scoreA: 80,
  scoreB: 65,
  rationale: "Idea A is more feasible and has clearer implementation path.",
  criteriaScores: [
    { criterion: "Novelty", scoreA: 75, scoreB: 70 },
    { criterion: "Feasibility", scoreA: 85, scoreB: 60 },
    { criterion: "Impact", scoreA: 80, scoreB: 65 },
  ],
};

describe("tournament/llm-judge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- judgeMatch ----

  describe("judgeMatch", () => {
    it("returns valid MatchJudgment shape", async () => {
      mockGenerateText.mockResolvedValue(JSON.stringify(VALID_JUDGMENT));
      mockExtractJson.mockReturnValue(JSON.stringify(VALID_JUDGMENT));

      const result = await judgeMatch(
        { title: "Idea A", description: "Description A" },
        { title: "Idea B", description: "Description B" }
      );

      expect(() => MatchJudgmentSchema.parse(result)).not.toThrow();
      expect(result.winner).toBe("a");
      expect(result.scoreA).toBe(80);
      expect(result.scoreB).toBe(65);
      expect(result.criteriaScores).toHaveLength(3);
    });

    it("computes confidence from criteria score variance", async () => {
      const judgmentNoConf = { ...VALID_JUDGMENT };
      delete (judgmentNoConf as Record<string, unknown>).confidence;

      mockGenerateText.mockResolvedValue(JSON.stringify(judgmentNoConf));
      mockExtractJson.mockReturnValue(JSON.stringify(judgmentNoConf));

      const result = await judgeMatch(
        { title: "A", description: "A" },
        { title: "B", description: "B" }
      );

      expect(result.confidence).toBeDefined();
      expect(result.confidence!).toBeGreaterThanOrEqual(0);
      expect(result.confidence!).toBeLessThanOrEqual(1);
    });

    it("throws on malformed JSON from LLM", async () => {
      mockGenerateText.mockResolvedValue("not json");
      mockExtractJson.mockReturnValue("not json");

      await expect(
        judgeMatch({ title: "A", description: "A" }, { title: "B", description: "B" })
      ).rejects.toThrow();
    });

    it("passes custom criteria and context", async () => {
      mockGenerateText.mockResolvedValue(JSON.stringify(VALID_JUDGMENT));
      mockExtractJson.mockReturnValue(JSON.stringify(VALID_JUDGMENT));

      await judgeMatch(
        { title: "A", description: "A" },
        { title: "B", description: "B" },
        {
          criteria: [{ name: "Custom", description: "Custom criterion", weight: 1.0 }],
          context: "Healthcare domain",
        }
      );

      expect(mockGenerateText).toHaveBeenCalledOnce();
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Custom");
    });
  });

  // ---- autoJudgeTournament ----

  describe("autoJudgeTournament", () => {
    it("invokes progress callback for each match", async () => {
      const tournament = {
        id: "t1",
        state: "in-progress",
        participants: [
          { id: "p1", ideaTitle: "Idea 1", ideaDescription: "Desc 1" },
          { id: "p2", ideaTitle: "Idea 2", ideaDescription: "Desc 2" },
        ],
        matches: [{ id: "m1", participantA: "p1", participantB: "p2", result: "pending" }],
      };

      mockGetTournament.mockReturnValue(tournament as never);
      mockGenerateText.mockResolvedValue(JSON.stringify(VALID_JUDGMENT));
      mockExtractJson.mockReturnValue(JSON.stringify(VALID_JUDGMENT));

      const progress: unknown[] = [];
      await autoJudgeTournament("t1", {}, (p) => progress.push(p));

      expect(progress.length).toBeGreaterThanOrEqual(2); // at least one per match + completion
      const last = progress[progress.length - 1] as { phase: string };
      expect(last.phase).toBe("complete");
    });

    it("returns undefined for non-existent tournament", async () => {
      mockGetTournament.mockReturnValue(undefined);
      const result = await autoJudgeTournament("missing");
      expect(result).toBeUndefined();
    });

    it("returns undefined for tournament not in-progress", async () => {
      mockGetTournament.mockReturnValue({ id: "t1", state: "completed" } as never);
      const result = await autoJudgeTournament("t1");
      expect(result).toBeUndefined();
    });

    it("handles judgment failure gracefully", async () => {
      const tournament = {
        id: "t1",
        state: "in-progress",
        participants: [
          { id: "p1", ideaTitle: "A", ideaDescription: "A" },
          { id: "p2", ideaTitle: "B", ideaDescription: "B" },
        ],
        matches: [
          {
            id: "m1",
            participantA: "p1",
            participantB: "p2",
            result: "pending",
            rationale: undefined,
          },
        ],
      };

      mockGetTournament.mockReturnValue(tournament as never);
      mockGenerateText.mockRejectedValue(new Error("LLM timeout"));
      mockExtractJson.mockReturnValue("");

      await autoJudgeTournament("t1");
      // Should record failure without crashing
      expect(tournament.matches[0].rationale).toContain("Judgment failed");
    });
  });

  // ---- AbortSignal ----

  describe("AbortSignal cancellation", () => {
    it("passes signal through to judgeMatch via config", async () => {
      const controller = new AbortController();
      mockGenerateText.mockResolvedValue(JSON.stringify(VALID_JUDGMENT));
      mockExtractJson.mockReturnValue(JSON.stringify(VALID_JUDGMENT));

      await judgeMatch(
        { title: "A", description: "A" },
        { title: "B", description: "B" },
        { signal: controller.signal }
      );

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  // ---- runEvolutionaryTournament ----

  describe("runEvolutionaryTournament", () => {
    it("runs single-round tournament with 2 ideas", async () => {
      const mockTournament = {
        id: "evo-1",
        state: "in-progress",
        participants: [
          {
            id: "p1",
            ideaTitle: "Idea A",
            ideaDescription: "Desc A",
            elo: 1250,
            wins: 1,
            losses: 0,
          },
          {
            id: "p2",
            ideaTitle: "Idea B",
            ideaDescription: "Desc B",
            elo: 1150,
            wins: 0,
            losses: 1,
          },
        ],
        matches: [{ id: "m1", participantA: "p1", participantB: "p2", result: "pending" }],
      };

      mockCreateTournament.mockReturnValue(mockTournament as never);
      mockStartTournament.mockReturnValue(undefined);
      mockGetTournament.mockReturnValue(mockTournament as never);
      mockGetLeaderboard.mockReturnValue(mockTournament.participants as never);
      mockGenerateText.mockResolvedValue(JSON.stringify(VALID_JUDGMENT));
      mockExtractJson.mockReturnValue(JSON.stringify(VALID_JUDGMENT));

      const result = await runEvolutionaryTournament(
        [
          { title: "Idea A", description: "Desc A" },
          { title: "Idea B", description: "Desc B" },
        ],
        { rounds: 1, ideasPerRound: 4, crossoverTopN: 2 }
      );

      expect(result.rounds).toHaveLength(1);
      expect(result.finalChampion.title).toBe("Idea A");
      expect(result.genealogy.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- evolutionaryTournamentToMarkdown ----

  describe("evolutionaryTournamentToMarkdown", () => {
    it("produces formatted markdown with champion and rounds", () => {
      const result = {
        tournamentId: "t1",
        rounds: [
          {
            round: 0,
            tournamentId: "t1",
            winnerId: "p1",
            winnerTitle: "Best Idea",
            leaderboard: [
              { id: "p1", ideaTitle: "Best Idea", elo: 1300, wins: 2, losses: 0 } as never,
              { id: "p2", ideaTitle: "Other", elo: 1100, wins: 0, losses: 2 } as never,
            ],
          },
        ],
        finalChampion: { title: "Best Idea", description: "A great idea", elo: 1300 },
        genealogy: [
          { id: "Best Idea", title: "Best Idea", parentTitles: [], round: 0 },
          { id: "Hybrid", title: "Hybrid", parentTitles: ["Best Idea", "Other"], round: 1 },
        ],
      };

      const md = evolutionaryTournamentToMarkdown(result);
      expect(md).toContain("🏆 Evolutionary Tournament Results");
      expect(md).toContain("Best Idea");
      expect(md).toContain("Elo: 1300");
      expect(md).toContain("Round 1");
      expect(md).toContain("Genealogy");
      expect(md).toContain("Hybrid");
    });

    it("handles empty rounds gracefully", () => {
      const result = {
        tournamentId: "",
        rounds: [],
        finalChampion: { title: "No champion", description: "", elo: 0 },
        genealogy: [],
      };

      const md = evolutionaryTournamentToMarkdown(result);
      expect(md).toContain("No champion");
      expect(md).toContain("Rounds:** 0");
    });
  });
});
