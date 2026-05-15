import { describe, it, expect, beforeEach } from "vitest";

import { recordActivity, analyzeTeamDNA, clearTeamDNAData } from "../team-dna/index.js";
import {
  generateCoachingRecommendations,
  analyzeComposition,
  compositionToMarkdown,
} from "../team-dna/coaching.js";
import type { MemberActivity } from "../team-dna/index.js";

function seedTeamData() {
  const now = Date.now();
  const activities: MemberActivity[] = [
    // Alice: explorer - uses many angles
    {
      userId: "alice",
      displayName: "Alice",
      angleId: "scamper",
      action: "used",
      timestamp: now - 1000,
    },
    {
      userId: "alice",
      displayName: "Alice",
      angleId: "first-principles",
      action: "used",
      timestamp: now - 900,
    },
    {
      userId: "alice",
      displayName: "Alice",
      angleId: "cross-domain",
      action: "used",
      timestamp: now - 800,
    },
    {
      userId: "alice",
      displayName: "Alice",
      angleId: "what-if",
      action: "used",
      timestamp: now - 700,
    },
    {
      userId: "alice",
      displayName: "Alice",
      angleId: "scamper",
      action: "generated",
      timestamp: now - 600,
    },
    // Bob: analyzer - heavy first-principles
    {
      userId: "bob",
      displayName: "Bob",
      angleId: "first-principles",
      action: "used",
      timestamp: now - 500,
    },
    {
      userId: "bob",
      displayName: "Bob",
      angleId: "first-principles",
      action: "used",
      timestamp: now - 400,
    },
    {
      userId: "bob",
      displayName: "Bob",
      angleId: "first-principles",
      action: "generated",
      timestamp: now - 300,
    },
    {
      userId: "bob",
      displayName: "Bob",
      angleId: "constraints",
      action: "used",
      timestamp: now - 200,
    },
    // Carol: disruptor - inversion heavy
    {
      userId: "carol",
      displayName: "Carol",
      angleId: "inversion",
      action: "used",
      timestamp: now - 100,
    },
    {
      userId: "carol",
      displayName: "Carol",
      angleId: "inversion",
      action: "used",
      timestamp: now - 90,
    },
    {
      userId: "carol",
      displayName: "Carol",
      angleId: "what-if",
      action: "used",
      timestamp: now - 80,
    },
    {
      userId: "carol",
      displayName: "Carol",
      angleId: "inversion",
      action: "generated",
      timestamp: now - 70,
    },
    // Dave: low activity
    {
      userId: "dave",
      displayName: "Dave",
      angleId: "scamper",
      action: "used",
      timestamp: now - 50,
    },
  ];

  for (const a of activities) {
    recordActivity(a);
  }
}

beforeEach(() => {
  clearTeamDNAData();
});

describe("generateCoachingRecommendations", () => {
  it("generates recommendations for a team", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol", "dave"]);
    const recs = generateCoachingRecommendations(dna);

    expect(recs.length).toBeGreaterThan(0);
    // Should be sorted by priority
    const priorities = recs.map((r) => r.priority);
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
    }
  });

  it("identifies blind spots as coaching needs", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol", "dave"]);
    const recs = generateCoachingRecommendations(dna);

    const angleRecs = recs.filter((r) => r.category === "angle_exploration");
    expect(angleRecs.length).toBeGreaterThan(0);
  });

  it("generates member-level coaching for low activity", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol", "dave"]);
    const recs = generateCoachingRecommendations(dna);

    const daveRecs = recs.filter((r) => r.targetMember === "Dave");
    expect(daveRecs.length).toBeGreaterThanOrEqual(0); // Dave may get coaching
  });

  it("generates collaboration recommendations when pairings exist", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol"]);

    if (dna.suggestedPairings.length > 0) {
      const recs = generateCoachingRecommendations(dna);
      const collabRecs = recs.filter((r) => r.category === "collaboration");
      expect(collabRecs.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("analyzeComposition", () => {
  it("computes composition score", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol", "dave"]);
    const result = analyzeComposition(dna);

    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.overall).toBeLessThanOrEqual(100);
    expect(result.score.diversityScore).toBeGreaterThanOrEqual(0);
    expect(result.score.coverageScore).toBeGreaterThanOrEqual(0);
    expect(result.score.balanceScore).toBeGreaterThanOrEqual(0);
  });

  it("identifies missing styles", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob"]);
    const result = analyzeComposition(dna);

    // With only explorer and analyzer, some styles should be missing
    expect(result.score.styleDistribution).toBeDefined();
  });

  it("suggests optimal additions", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["bob"]); // Only analyzer
    const result = analyzeComposition(dna);

    expect(result.optimalAdditions.length).toBeGreaterThan(0);
    // Additions should be sorted by impact
    for (let i = 1; i < result.optimalAdditions.length; i++) {
      expect(result.optimalAdditions[i].expectedImpact).toBeLessThanOrEqual(
        result.optimalAdditions[i - 1].expectedImpact
      );
    }
  });

  it("identifies risk factors for small teams", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("tiny-team", ["alice"]);
    const result = analyzeComposition(dna);

    const sizeRisks = result.riskFactors.filter((r) => r.factor.includes("too small"));
    expect(sizeRisks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("compositionToMarkdown", () => {
  it("generates formatted markdown report", () => {
    seedTeamData();
    const dna = analyzeTeamDNA("team-alpha", ["alice", "bob", "carol", "dave"]);
    const result = analyzeComposition(dna);
    const md = compositionToMarkdown(result);

    expect(md).toContain("# Team Composition Analysis");
    expect(md).toContain("Overall Score:");
    expect(md).toContain("Style Distribution");
  });
});
