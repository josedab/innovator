import { describe, it, expect, beforeEach } from "vitest";

import {
  registerOrganization,
  getOrganization,
  listOrganizations,
  updatePrivacySettings,
  suspendOrganization,
  subscribeToTopic,
  unsubscribeFromTopic,
  listSubscriptions,
  contributePatterns,
  aggregateTrends,
  getNetworkTrends,
  createChallenge,
  submitToChallenge,
  scoreSubmission,
  startJudging,
  finalizeChallenge,
  getChallenge,
  listChallenges,
  clearNetworkState,
} from "../federation-dp/network.js";

describe("federation-dp/network", () => {
  beforeEach(() => {
    clearNetworkState();
  });

  describe("organization management", () => {
    it("registers an organization", () => {
      const org = registerOrganization("Acme Corp", "admin@acme.com");
      expect(org.name).toBe("Acme Corp");
      expect(org.slug).toBe("acme-corp");
      expect(org.status).toBe("active");
      expect(org.privacySettings.shareAngleEffectiveness).toBe(true);
    });

    it("gets organization by id", () => {
      const org = registerOrganization("TestOrg", "test@org.com");
      expect(getOrganization(org.id)).toBeDefined();
      expect(getOrganization("nonexistent")).toBeUndefined();
    });

    it("lists only active orgs", () => {
      registerOrganization("Org1", "a@b.com");
      const org2 = registerOrganization("Org2", "c@d.com");
      suspendOrganization(org2.id);
      expect(listOrganizations()).toHaveLength(1);
    });

    it("updates privacy settings", () => {
      const org = registerOrganization("PrivOrg", "p@o.com");
      updatePrivacySettings(org.id, { shareAnonymizedIdeas: true, minimumAggregationSize: 10 });
      const updated = getOrganization(org.id);
      expect(updated?.privacySettings.shareAnonymizedIdeas).toBe(true);
      expect(updated?.privacySettings.minimumAggregationSize).toBe(10);
    });

    it("suspends organization", () => {
      const org = registerOrganization("SuspOrg", "s@o.com");
      expect(suspendOrganization(org.id)).toBe(true);
      expect(getOrganization(org.id)?.status).toBe("suspended");
    });
  });

  describe("topic subscriptions", () => {
    it("subscribes to topic", () => {
      const org = registerOrganization("SubOrg", "s@o.com");
      const sub = subscribeToTopic(org.id, "AI Safety");
      expect(sub.topic).toBe("AI Safety");
      expect(getOrganization(org.id)?.optInTopics).toContain("AI Safety");
    });

    it("prevents duplicate subscriptions", () => {
      const org = registerOrganization("DupOrg", "d@o.com");
      const sub1 = subscribeToTopic(org.id, "ML");
      const sub2 = subscribeToTopic(org.id, "ML");
      expect(sub1.id).toBe(sub2.id);
    });

    it("unsubscribes from topic", () => {
      const org = registerOrganization("UnsubOrg", "u@o.com");
      subscribeToTopic(org.id, "Quantum");
      expect(unsubscribeFromTopic(org.id, "Quantum")).toBe(true);
      expect(listSubscriptions(org.id)).toHaveLength(0);
    });

    it("returns false for nonexistent unsubscription", () => {
      expect(unsubscribeFromTopic("fake", "topic")).toBe(false);
    });
  });

  describe("pattern contribution", () => {
    it("accepts patterns from active orgs", () => {
      const org = registerOrganization("PatOrg", "p@o.com");
      const result = contributePatterns(org.id, [
        {
          id: "dp-test",
          type: "angle-effectiveness",
          angleId: "scamper",
          topicCategory: "tech",
          noisedValue: 0.75,
          ciLower: 0.6,
          ciUpper: 0.9,
          sampleSize: 10,
          epoch: "2024-01",
          createdAt: new Date().toISOString(),
        },
      ]);
      expect(result).toBe(true);
    });

    it("rejects patterns from suspended orgs", () => {
      const org = registerOrganization("SusOrg", "s@o.com");
      suspendOrganization(org.id);
      expect(contributePatterns(org.id, [])).toBe(false);
    });

    it("rejects when sharing disabled", () => {
      const org = registerOrganization("NoShare", "n@o.com");
      updatePrivacySettings(org.id, { shareAngleEffectiveness: false });
      expect(contributePatterns(org.id, [])).toBe(false);
    });
  });

  describe("trend aggregation", () => {
    it("returns null when insufficient orgs", () => {
      const org = registerOrganization("Solo", "s@o.com");
      contributePatterns(org.id, [
        {
          id: "p1",
          type: "angle-effectiveness",
          angleId: "scamper",
          topicCategory: "tech",
          noisedValue: 0.8,
          ciLower: 0.6,
          ciUpper: 1.0,
          sampleSize: 5,
          epoch: "2024-01",
          createdAt: new Date().toISOString(),
        },
      ]);
      const trend = aggregateTrends("tech");
      expect(trend).toBeNull();
    });
  });

  describe("challenges", () => {
    it("creates a challenge", () => {
      const org = registerOrganization("ChOrg", "c@o.com");
      const ch = createChallenge(
        org.id,
        "AI Safety Challenge",
        "Solve alignment",
        "AI",
        new Date(Date.now() + 86400_000).toISOString(),
        [{ name: "Novelty", weight: 0.5, description: "How novel" }]
      );
      expect(ch.status).toBe("open");
      expect(ch.title).toBe("AI Safety Challenge");
    });

    it("throws for inactive org", () => {
      expect(() => createChallenge("fake", "T", "D", "T", "2025-01-01", [])).toThrow();
    });

    it("accepts submissions", () => {
      const org = registerOrganization("SubOrg2", "s@o.com");
      const ch = createChallenge(org.id, "Test", "Desc", "Topic", "2025-12-01", [
        { name: "Quality", weight: 1, description: "Overall quality" },
      ]);
      const sub = submitToChallenge(ch.id, org.id, "My great idea");
      expect(sub).not.toBeNull();
      expect(sub!.anonymousId).toBeDefined();
    });

    it("rejects submissions to closed challenges", () => {
      const org = registerOrganization("ClosedOrg", "c@o.com");
      const ch = createChallenge(org.id, "Closed", "D", "T", "2025-12-01", []);
      startJudging(ch.id);
      expect(submitToChallenge(ch.id, org.id, "Late idea")).toBeNull();
    });

    it("scores and finalizes", () => {
      const org1 = registerOrganization("Org1Ch", "a@b.com");
      const org2 = registerOrganization("Org2Ch", "c@d.com");
      const ch = createChallenge(org1.id, "Comp", "D", "T", "2025-12-01", [
        { name: "Quality", weight: 1, description: "Quality" },
      ]);
      const s1 = submitToChallenge(ch.id, org1.id, "Idea 1")!;
      const s2 = submitToChallenge(ch.id, org2.id, "Idea 2")!;

      startJudging(ch.id);
      scoreSubmission(ch.id, s1.anonymousId, { Quality: 8 });
      scoreSubmission(ch.id, s2.anonymousId, { Quality: 6 });

      const finalized = finalizeChallenge(ch.id);
      expect(finalized?.status).toBe("completed");
      expect(finalized?.submissions[0].rank).toBeDefined();
    });

    it("lists challenges with filters", () => {
      const org = registerOrganization("ListOrg", "l@o.com");
      createChallenge(org.id, "A", "D", "AI", "2025-12-01", []);
      createChallenge(org.id, "B", "D", "Bio", "2025-12-01", []);
      expect(listChallenges({ topic: "AI" })).toHaveLength(1);
      expect(listChallenges({ status: "open" })).toHaveLength(2);
    });
  });
});
