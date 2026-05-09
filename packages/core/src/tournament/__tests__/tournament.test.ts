import { describe, it, expect, beforeEach } from "vitest";
import {
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
} from "../index.js";
import type { TournamentFormat } from "../index.js";

function makeIdeas(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Idea ${i}`,
    description: `Description ${i}`,
  }));
}

describe("tournament", () => {
  beforeEach(() => {
    clearTournaments();
  });

  // ---- Elo Rating ----

  describe("updateElo", () => {
    it("adjusts ratings when participant-a wins with equal ratings", () => {
      const result = updateElo(1200, 1200, "participant-a");
      expect(result.newRatingA).toBeGreaterThan(1200);
      expect(result.newRatingB).toBeLessThan(1200);
      // Symmetric: sum should be preserved
      expect(result.newRatingA + result.newRatingB).toBe(2400);
    });

    it("adjusts ratings with large gap - underdog wins", () => {
      const result = updateElo(1000, 1600, "participant-a");
      // Underdog winning should gain more points
      expect(result.newRatingA - 1000).toBeGreaterThanOrEqual(1600 - result.newRatingB);
      // Both should shift significantly
      expect(result.newRatingA).toBeGreaterThan(1000);
      expect(result.newRatingB).toBeLessThan(1600);
    });

    it("handles draw with equal ratings", () => {
      const result = updateElo(1200, 1200, "draw");
      expect(result.newRatingA).toBe(1200);
      expect(result.newRatingB).toBe(1200);
    });

    it("handles participant-b win", () => {
      const result = updateElo(1200, 1200, "participant-b");
      expect(result.newRatingB).toBeGreaterThan(1200);
      expect(result.newRatingA).toBeLessThan(1200);
    });
  });

  // ---- createTournament ----

  describe("createTournament", () => {
    it("creates a single-elimination tournament", () => {
      const t = createTournament({
        name: "Test",
        format: "single-elimination",
        ideas: makeIdeas(4),
      });
      expect(t.id).toBeDefined();
      expect(t.format).toBe("single-elimination");
      expect(t.participants).toHaveLength(4);
      expect(t.state).toBe("setup");
      expect(t.matches.length).toBeGreaterThan(0);
    });

    it("creates a round-robin tournament", () => {
      const t = createTournament({
        name: "RR",
        format: "round-robin",
        ideas: makeIdeas(4),
      });
      expect(t.format).toBe("round-robin");
      // n*(n-1)/2 = 6 matches
      expect(t.matches).toHaveLength(6);
    });

    it("creates a double-elimination tournament", () => {
      const t = createTournament({
        name: "DE",
        format: "double-elimination",
        ideas: makeIdeas(4),
      });
      expect(t.format).toBe("double-elimination");
      expect(t.matches.length).toBeGreaterThan(0);
    });

    it("throws for fewer than 2 participants", () => {
      expect(() =>
        createTournament({ name: "T", format: "single-elimination", ideas: makeIdeas(1) })
      ).toThrow("at least 2");
    });

    it("throws for more than 64 participants", () => {
      expect(() =>
        createTournament({ name: "T", format: "single-elimination", ideas: makeIdeas(65) })
      ).toThrow("at most 64");
    });
  });

  // ---- Bracket generation ----

  describe("bracket generation", () => {
    it("generates correct brackets for power-of-2 count", () => {
      const t = createTournament({
        name: "P2",
        format: "single-elimination",
        ideas: makeIdeas(8),
      });
      // 8 participants: 4 first round + 2 second round + 1 final = 7
      expect(t.matches).toHaveLength(7);
      expect(t.totalRounds).toBe(3);
    });

    it("handles odd number of participants with byes", () => {
      const t = createTournament({
        name: "Odd",
        format: "single-elimination",
        ideas: makeIdeas(3),
      });
      // Bracket size 4: some matches are byes
      const byeMatches = t.matches.filter(
        (m) => m.result === "participant-a" && m.participantB === null
      );
      expect(byeMatches.length).toBeGreaterThan(0);
    });

    it("handles exactly 2 participants", () => {
      const t = createTournament({
        name: "Finals",
        format: "single-elimination",
        ideas: makeIdeas(2),
      });
      expect(t.matches).toHaveLength(1);
      expect(t.totalRounds).toBe(1);
    });
  });

  // ---- resolveMatch ----

  describe("resolveMatch", () => {
    it("resolves a match and updates stats", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      startTournament(t.id);

      const match = t.matches[0];
      const result = resolveMatch(t.id, match.id, "participant-a", "Better idea", "human");
      expect(result).toBeDefined();
      expect(result!.result).toBe("participant-a");
      expect(result!.rationale).toBe("Better idea");

      const updated = getTournament(t.id)!;
      const winner = updated.participants.find((p) => p.id === match.participantA);
      expect(winner!.wins).toBe(1);
    });

    it("returns undefined for non-started tournament", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      const result = resolveMatch(t.id, t.matches[0].id, "participant-a");
      expect(result).toBeUndefined();
    });

    it("returns undefined for already resolved match", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      startTournament(t.id);
      resolveMatch(t.id, t.matches[0].id, "participant-a");
      const result = resolveMatch(t.id, t.matches[0].id, "participant-b");
      expect(result).toBeUndefined();
    });

    it("eliminates loser in single-elimination", () => {
      const t = createTournament({
        name: "T",
        format: "single-elimination",
        ideas: makeIdeas(4),
      });
      startTournament(t.id);

      const firstRound = t.matches.filter((m) => m.round === 0 && m.participantA && m.participantB);
      const match = firstRound[0];
      resolveMatch(t.id, match.id, "participant-a");

      const updated = getTournament(t.id)!;
      const loser = updated.participants.find((p) => p.id === match.participantB);
      expect(loser!.eliminated).toBe(true);
    });
  });

  // ---- voteInMatch ----

  describe("voteInMatch", () => {
    it("increments vote count", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      startTournament(t.id);
      const match = t.matches[0];

      voteInMatch(t.id, match.id, "a");
      voteInMatch(t.id, match.id, "b");
      voteInMatch(t.id, match.id, "a");

      const updated = getTournament(t.id)!.matches.find((m) => m.id === match.id)!;
      expect(updated.votes.a).toBe(2);
      expect(updated.votes.b).toBe(1);
    });

    it("returns undefined for completed match", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      startTournament(t.id);
      resolveMatch(t.id, t.matches[0].id, "participant-a");
      const result = voteInMatch(t.id, t.matches[0].id, "a");
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent tournament", () => {
      expect(voteInMatch("bad-id", "match-1", "a")).toBeUndefined();
    });
  });

  // ---- getLeaderboard ----

  describe("getLeaderboard", () => {
    it("returns participants sorted by Elo", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      startTournament(t.id);

      // Resolve first match so Elos diverge
      resolveMatch(t.id, t.matches[0].id, "participant-a");
      const lb = getLeaderboard(t.id)!;
      expect(lb[0].elo).toBeGreaterThanOrEqual(lb[1].elo);
    });

    it("returns undefined for non-existent tournament", () => {
      expect(getLeaderboard("bad-id")).toBeUndefined();
    });
  });

  // ---- CRUD ----

  describe("CRUD", () => {
    it("getTournament returns tournament by ID", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(3),
      });
      expect(getTournament(t.id)).toBeDefined();
    });

    it("listTournaments returns all tournaments", () => {
      createTournament({ name: "A", format: "round-robin", ideas: makeIdeas(2) });
      createTournament({ name: "B", format: "round-robin", ideas: makeIdeas(2) });
      expect(listTournaments()).toHaveLength(2);
    });

    it("deleteTournament removes a tournament", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(2),
      });
      expect(deleteTournament(t.id)).toBe(true);
      expect(getTournament(t.id)).toBeUndefined();
    });

    it("startTournament changes state to in-progress", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(2),
      });
      const started = startTournament(t.id);
      expect(started!.state).toBe("in-progress");
    });

    it("startTournament returns undefined for non-setup tournament", () => {
      const t = createTournament({
        name: "T",
        format: "round-robin",
        ideas: makeIdeas(2),
      });
      startTournament(t.id);
      expect(startTournament(t.id)).toBeUndefined();
    });
  });
});
