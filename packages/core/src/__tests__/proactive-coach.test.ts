import { describe, it, expect, beforeEach } from "vitest";
import {
  ProactiveCoachingEngine,
  clearProactiveCoachData,
  type SessionContext,
} from "../coaching/proactive-coach.js";
import {
  InnovationProfileBuilder,
  clearProfileBuilderData,
  type SessionHistoryEntry,
} from "../coaching/innovation-profile-builder.js";

function makeSession(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    sessionId: `s-${Math.random().toString(36).slice(2, 8)}`,
    subject: "AI healthcare diagnostics",
    domain: "healthcare",
    anglesUsed: ["scamper", "first-principles"],
    ideaCount: 5,
    avgQuality: 7,
    duration: 20,
    completedAt: "2024-06-15T10:00:00Z",
    ...overrides,
  };
}

describe("proactive-coach", () => {
  let engine: ProactiveCoachingEngine;
  let profileBuilder: InnovationProfileBuilder;

  beforeEach(() => {
    clearProactiveCoachData();
    clearProfileBuilderData();
    engine = new ProactiveCoachingEngine();
    profileBuilder = new InnovationProfileBuilder();
  });

  describe("getPreSessionRecommendations", () => {
    it("returns recommendations array", () => {
      const recs = engine.getPreSessionRecommendations("user-1", "AI in healthcare");
      expect(Array.isArray(recs)).toBe(true);
    });

    it("suggests blind spot angles when profile exists", () => {
      profileBuilder.buildProfile("user-1", [makeSession({ anglesUsed: ["scamper"] })]);
      const recs = engine.getPreSessionRecommendations("user-1", "AI in healthcare");
      const angleSuggestion = recs.find(
        (r) => r.actionType === "try_angle" && r.priority === "high"
      );
      expect(angleSuggestion).toBeDefined();
      expect(angleSuggestion!.message).toContain("blind spot");
    });

    it("warns about domain pitfalls for healthcare", () => {
      const recs = engine.getPreSessionRecommendations("user-1", "healthcare patient monitoring");
      const pitfallRec = recs.find((r) => r.message.includes("pitfall"));
      expect(pitfallRec).toBeDefined();
    });

    it("suggests domain exploration for new domains", () => {
      profileBuilder.buildProfile("user-1", [makeSession({ domain: "fintech" })]);
      const recs = engine.getPreSessionRecommendations("user-1", "healthcare patient monitoring");
      const domainRec = recs.find((r) => r.actionType === "explore_domain");
      expect(domainRec).toBeDefined();
    });

    it("recommends best-performing angle when enough data", () => {
      profileBuilder.buildProfile("user-1", [
        makeSession({ anglesUsed: ["scamper"], avgQuality: 9 }),
        makeSession({ anglesUsed: ["scamper"], avgQuality: 9 }),
        makeSession({ anglesUsed: ["scamper"], avgQuality: 9 }),
      ]);
      const recs = engine.getPreSessionRecommendations("user-1", "test");
      const anchorRec = recs.find((r) => r.message.includes("best-performing"));
      expect(anchorRec).toBeDefined();
    });
  });

  describe("getMidSessionNudges", () => {
    it("nudges when investigating too long without ideas", () => {
      const context: SessionContext = {
        sessionId: "s1",
        subject: "test",
        currentAngles: [],
        elapsedTime: 20,
        ideasGenerated: 0,
        qualityScores: [],
      };
      const nudges = engine.getMidSessionNudges("user-1", context);
      const timeNudge = nudges.find((n) => n.message.includes("investigating"));
      expect(timeNudge).toBeDefined();
      expect(timeNudge!.priority).toBe("high");
    });

    it("suggests divergent angles when only convergent used", () => {
      const context: SessionContext = {
        sessionId: "s1",
        subject: "test",
        currentAngles: ["first-principles", "constraints"],
        elapsedTime: 10,
        ideasGenerated: 3,
        qualityScores: [7, 7, 7],
      };
      const nudges = engine.getMidSessionNudges("user-1", context);
      const diversityNudge = nudges.find((n) => n.message.includes("divergent"));
      expect(diversityNudge).toBeDefined();
    });

    it("suggests convergent angles when only divergent used", () => {
      const context: SessionContext = {
        sessionId: "s1",
        subject: "test",
        currentAngles: ["scamper", "what-if"],
        elapsedTime: 10,
        ideasGenerated: 3,
        qualityScores: [7, 7, 7],
      };
      const nudges = engine.getMidSessionNudges("user-1", context);
      const convergentNudge = nudges.find((n) => n.message.includes("convergent"));
      expect(convergentNudge).toBeDefined();
    });

    it("alerts on quality drop below personal average", () => {
      profileBuilder.buildProfile("user-1", [
        makeSession({ avgQuality: 8 }),
        makeSession({ avgQuality: 8 }),
      ]);
      const context: SessionContext = {
        sessionId: "s1",
        subject: "test",
        currentAngles: ["scamper"],
        elapsedTime: 10,
        ideasGenerated: 5,
        qualityScores: [3, 3, 3],
      };
      const nudges = engine.getMidSessionNudges("user-1", context);
      const qualityAlert = nudges.find((n) => n.message.includes("below your average"));
      expect(qualityAlert).toBeDefined();
    });

    it("suggests synthesis for long sessions", () => {
      const context: SessionContext = {
        sessionId: "s1",
        subject: "test",
        currentAngles: ["scamper"],
        elapsedTime: 50,
        ideasGenerated: 10,
        qualityScores: [7, 7, 7],
      };
      const nudges = engine.getMidSessionNudges("user-1", context);
      const synthNudge = nudges.find((n) => n.message.includes("synthesizing"));
      expect(synthNudge).toBeDefined();
    });
  });

  describe("getPostSessionAnalysis", () => {
    it("returns quality comparison with personal average", () => {
      profileBuilder.buildProfile("user-1", [makeSession({ avgQuality: 6 })]);
      const analysis = engine.getPostSessionAnalysis("user-1", makeSession({ avgQuality: 8 }));
      expect(analysis.qualityVsAverage.session).toBe(8);
      expect(analysis.qualityVsAverage.delta).toBeGreaterThan(0);
    });

    it("provides improvement suggestions for low quality", () => {
      profileBuilder.buildProfile("user-1", [makeSession({ avgQuality: 8 })]);
      const analysis = engine.getPostSessionAnalysis("user-1", makeSession({ avgQuality: 5 }));
      expect(analysis.improvements.length).toBeGreaterThan(0);
    });

    it("calculates XP earned", () => {
      const analysis = engine.getPostSessionAnalysis("user-1", makeSession());
      expect(analysis.xpEarned).toBeGreaterThan(0);
    });

    it("suggests using more angles when few are used", () => {
      const analysis = engine.getPostSessionAnalysis(
        "user-1",
        makeSession({ anglesUsed: ["scamper"] })
      );
      const moreAngles = analysis.improvements.find((i) => i.includes("more angles"));
      expect(moreAngles).toBeDefined();
    });
  });

  describe("generateChallenge", () => {
    it("generates a challenge targeting blind spot angle", () => {
      profileBuilder.buildProfile("user-1", [makeSession({ anglesUsed: ["scamper"] })]);
      const challenge = engine.generateChallenge("user-1");
      expect(challenge.id).toContain("challenge-user-1");
      expect(challenge.targetAngle).toBeDefined();
      expect(challenge.goalCount).toBeGreaterThan(0);
      expect(challenge.currentProgress).toBe(0);
    });

    it("generates quality challenge when no blind spot angles", () => {
      profileBuilder.buildProfile("user-1", [
        ...[
          "scamper",
          "first-principles",
          "cross-domain",
          "constraints",
          "inversion",
          "perspectives",
          "what-if",
          "trend-collision",
        ].map((a) => makeSession({ anglesUsed: [a], avgQuality: 5 })),
        ...[
          "scamper",
          "first-principles",
          "cross-domain",
          "constraints",
          "inversion",
          "perspectives",
          "what-if",
          "trend-collision",
        ].map((a) => makeSession({ anglesUsed: [a], avgQuality: 5 })),
      ]);
      const challenge = engine.generateChallenge("user-1");
      expect(challenge.title).toContain("Quality");
    });

    it("stores challenge in active challenges", () => {
      engine.generateChallenge("user-1");
      const challenges = engine.getActiveChallenges("user-1");
      expect(challenges).toHaveLength(1);
    });

    it("returns empty challenges for new user", () => {
      expect(engine.getActiveChallenges("new-user")).toHaveLength(0);
    });
  });
});
