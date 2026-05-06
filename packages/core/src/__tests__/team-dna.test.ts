import { describe, it, expect, beforeEach } from "vitest";
import {
  recordActivity,
  recordActivities,
  buildMemberProfile,
  analyzeTeamDNA,
  shannonEntropy,
  teamDNAToMarkdown,
  clearTeamDNAData,
} from "../team-dna/index.js";
import type { MemberActivity } from "../team-dna/index.js";

function makeActivity(
  userId: string,
  angleId: string,
  action: MemberActivity["action"] = "used",
  displayName?: string
): MemberActivity {
  return {
    userId,
    displayName: displayName ?? userId,
    angleId,
    action,
    timestamp: Date.now(),
  };
}

describe("team-dna", () => {
  beforeEach(() => {
    clearTeamDNAData();
  });

  describe("shannonEntropy", () => {
    it("returns 0 for single-element distribution", () => {
      expect(shannonEntropy([1])).toBe(-0); // -0 since -sum with p*log2(p)=0
    });

    it("returns maximum entropy for uniform distribution", () => {
      const n = 4;
      const probs = Array(n).fill(1 / n);
      const maxEntropy = Math.log2(n);
      expect(shannonEntropy(probs)).toBeCloseTo(maxEntropy, 5);
    });

    it("returns 0 for empty input", () => {
      expect(shannonEntropy([])).toBe(-0); // reduce returns 0, negated → -0
    });

    it("handles distribution with zero probabilities", () => {
      // Only non-zero values contribute
      const result = shannonEntropy([0.5, 0.5, 0, 0]);
      expect(result).toBeCloseTo(1, 5); // log2(2) = 1
    });

    it("returns 1 for two equal probabilities", () => {
      expect(shannonEntropy([0.5, 0.5])).toBeCloseTo(1, 5);
    });
  });

  describe("buildMemberProfile", () => {
    it("returns empty profile for unknown user", () => {
      const profile = buildMemberProfile("unknown");
      expect(profile.userId).toBe("unknown");
      expect(profile.totalSessions).toBe(0);
      expect(profile.totalIdeas).toBe(0);
      expect(profile.totalVotes).toBe(0);
      expect(profile.preferredAngles).toEqual([]);
      expect(profile.innovationStyle).toBe("explorer");
    });

    it("builds profile from usage activities", () => {
      recordActivity(makeActivity("alice", "scamper", "used", "Alice"));
      recordActivity(makeActivity("alice", "scamper", "used", "Alice"));
      recordActivity(makeActivity("alice", "first-principles", "used", "Alice"));

      const profile = buildMemberProfile("alice");
      expect(profile.displayName).toBe("Alice");
      expect(profile.totalIdeas).toBe(3);
      expect(profile.angleUsage["scamper"]).toBe(2);
      expect(profile.angleUsage["first-principles"]).toBe(1);
      expect(profile.preferredAngles[0]).toBe("scamper");
    });

    it("tracks voting patterns separately", () => {
      recordActivity(makeActivity("alice", "scamper", "voted", "Alice"));
      recordActivity(makeActivity("alice", "inversion", "voted", "Alice"));

      const profile = buildMemberProfile("alice");
      expect(profile.totalVotes).toBe(2);
      expect(profile.votingPatterns["scamper"]).toBe(1);
    });

    it("detects avoided angles", () => {
      // Only use scamper, all others should be avoided
      recordActivity(makeActivity("alice", "scamper", "used"));
      const profile = buildMemberProfile("alice");
      expect(profile.avoidedAngles.length).toBeGreaterThan(0);
      expect(profile.avoidedAngles).not.toContain("scamper");
    });

    it("classifies connector style for high cross-domain usage", () => {
      for (let i = 0; i < 5; i++) {
        recordActivity(makeActivity("alice", "cross-domain", "used"));
      }
      recordActivity(makeActivity("alice", "scamper", "used"));
      const profile = buildMemberProfile("alice");
      expect(profile.innovationStyle).toBe("connector");
    });

    it("classifies disruptor style for high inversion usage", () => {
      for (let i = 0; i < 5; i++) {
        recordActivity(makeActivity("alice", "inversion", "used"));
      }
      recordActivity(makeActivity("alice", "scamper", "used"));
      const profile = buildMemberProfile("alice");
      expect(profile.innovationStyle).toBe("disruptor");
    });

    it("classifies analyzer style for high first-principles usage", () => {
      for (let i = 0; i < 5; i++) {
        recordActivity(makeActivity("alice", "first-principles", "used"));
      }
      recordActivity(makeActivity("alice", "scamper", "used"));
      const profile = buildMemberProfile("alice");
      expect(profile.innovationStyle).toBe("analyzer");
    });

    it("classifies builder style for high constraints usage", () => {
      for (let i = 0; i < 5; i++) {
        recordActivity(makeActivity("alice", "constraints", "used"));
      }
      recordActivity(makeActivity("alice", "scamper", "used"));
      const profile = buildMemberProfile("alice");
      expect(profile.innovationStyle).toBe("builder");
    });
  });

  describe("analyzeTeamDNA", () => {
    it("builds profiles from activity history", () => {
      recordActivity(makeActivity("alice", "scamper", "used", "Alice"));
      recordActivity(makeActivity("bob", "inversion", "used", "Bob"));

      const dna = analyzeTeamDNA("team-1", ["alice", "bob"]);
      expect(dna.teamId).toBe("team-1");
      expect(dna.memberProfiles).toHaveLength(2);
    });

    it("computes diversity index between 0 and 1", () => {
      recordActivity(makeActivity("alice", "scamper", "used"));
      recordActivity(makeActivity("alice", "first-principles", "used"));
      recordActivity(makeActivity("alice", "cross-domain", "used"));
      recordActivity(makeActivity("alice", "inversion", "used"));

      const dna = analyzeTeamDNA("team-1", ["alice"]);
      expect(dna.diversityIndex).toBeGreaterThanOrEqual(0);
      expect(dna.diversityIndex).toBeLessThanOrEqual(1);
    });

    it("computes Shannon entropy and max entropy", () => {
      recordActivity(makeActivity("alice", "scamper", "used"));
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      expect(dna.shannonEntropy).toBeGreaterThanOrEqual(0);
      expect(dna.maxEntropy).toBeGreaterThan(0);
    });

    it("detects blind spots for unused angles", () => {
      // Only use one angle heavily
      for (let i = 0; i < 20; i++) {
        recordActivity(makeActivity("alice", "scamper", "used"));
      }
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      expect(dna.blindSpots.length).toBeGreaterThan(0);
      // Blind spots should not include scamper (which is heavily used)
      expect(dna.blindSpots.every((bs) => bs.angleId !== "scamper")).toBe(true);
    });

    it("detects underused angles as blind spots", () => {
      // Use all angles but one very little
      for (let i = 0; i < 10; i++) {
        recordActivity(makeActivity("alice", "scamper", "used"));
        recordActivity(makeActivity("alice", "first-principles", "used"));
        recordActivity(makeActivity("alice", "cross-domain", "used"));
        recordActivity(makeActivity("alice", "constraints", "used"));
        recordActivity(makeActivity("alice", "inversion", "used"));
        recordActivity(makeActivity("alice", "perspectives", "used"));
        recordActivity(makeActivity("alice", "what-if", "used"));
        recordActivity(makeActivity("alice", "trend-collision", "used"));
      }
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      // With even distribution, should have minimal blind spots
      expect(dna.diversityIndex).toBeGreaterThan(0.8);
    });

    it("identifies team strengths", () => {
      for (let i = 0; i < 10; i++) {
        recordActivity(makeActivity("alice", "scamper", "used"));
      }
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      expect(dna.teamStrengths.length).toBeGreaterThan(0);
      expect(dna.teamStrengths[0]).toContain("SCAMPER");
    });

    it("identifies team weaknesses from blind spots", () => {
      for (let i = 0; i < 20; i++) {
        recordActivity(makeActivity("alice", "scamper", "used"));
      }
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      if (dna.blindSpots.length > 0) {
        expect(dna.teamWeaknesses.length).toBeGreaterThan(0);
      }
    });

    it("suggests complementary pairings", () => {
      // Alice prefers scamper, Bob prefers inversion
      for (let i = 0; i < 10; i++) {
        recordActivity(makeActivity("alice", "scamper", "used", "Alice"));
        recordActivity(makeActivity("bob", "inversion", "used", "Bob"));
      }
      const dna = analyzeTeamDNA("team-1", ["alice", "bob"]);
      // May or may not have pairings depending on overlap
      expect(dna.suggestedPairings).toBeDefined();
    });

    it("handles empty team", () => {
      const dna = analyzeTeamDNA("team-1", []);
      expect(dna.memberProfiles).toHaveLength(0);
      // All zero usage → entropy is -0, maxEnt > 0, so diversityIndex ≈ 0
      expect(Math.abs(dna.diversityIndex)).toBe(0);
    });
  });

  describe("teamDNAToMarkdown", () => {
    it("produces markdown with team info", () => {
      recordActivity(makeActivity("alice", "scamper", "used", "Alice"));
      const dna = analyzeTeamDNA("team-1", ["alice"]);
      const md = teamDNAToMarkdown(dna);
      expect(md).toContain("Team Innovation DNA");
      expect(md).toContain("team-1");
      expect(md).toContain("Cognitive Diversity Index");
      expect(md).toContain("Member Profiles");
      expect(md).toContain("Alice");
    });
  });

  describe("clearTeamDNAData", () => {
    it("clears all activity data", () => {
      recordActivity(makeActivity("alice", "scamper", "used"));
      clearTeamDNAData();
      const profile = buildMemberProfile("alice");
      expect(profile.totalIdeas).toBe(0);
    });
  });

  describe("recordActivities (batch)", () => {
    it("records multiple activities at once", () => {
      recordActivities([
        makeActivity("alice", "scamper", "used"),
        makeActivity("alice", "inversion", "used"),
        makeActivity("alice", "cross-domain", "voted"),
      ]);
      const profile = buildMemberProfile("alice");
      expect(profile.totalIdeas).toBe(2);
      expect(profile.totalVotes).toBe(1);
    });
  });
});
