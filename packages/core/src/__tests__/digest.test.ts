import { describe, it, expect, beforeEach } from "vitest";
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  deleteSubscription,
  generateDigest,
  getGeneratedDigests,
  digestToMarkdown,
  digestToSlack,
  digestToRSS,
  getDueSubscriptions,
  clearDigests,
} from "../digest/index.js";
import type { DigestInput } from "../digest/index.js";

const mockInput: DigestInput = {
  sessions: [
    {
      subject: "AI in Healthcare",
      date: "2024-01-15",
      ideas: [
        { title: "AI Diagnosis Assistant", description: "ML-powered diagnosis", sourceAngle: "cross-domain", score: 8.5 },
        { title: "Patient Data Lake", description: "Centralized health data", sourceAngle: "first-principles", score: 7.2 },
      ],
      anglesUsed: ["cross-domain", "first-principles"],
    },
    {
      subject: "EdTech Innovation",
      date: "2024-01-16",
      ideas: [
        { title: "Adaptive Learning", description: "Personalized curriculum", sourceAngle: "scamper", score: 9.1 },
      ],
      anglesUsed: ["scamper", "what-if"],
    },
  ],
  period: { start: "2024-01-15", end: "2024-01-21" },
  frequency: "weekly",
};

describe("digest", () => {
  beforeEach(() => {
    clearDigests();
  });

  describe("subscriptions", () => {
    it("creates and retrieves a subscription", () => {
      const sub = createSubscription("user1", "weekly", [
        { type: "email", enabled: true, config: { address: "test@example.com" } },
      ]);
      expect(sub.id).toBeTruthy();
      expect(getSubscription(sub.id)).toBeDefined();
    });

    it("lists subscriptions by user", () => {
      createSubscription("user1", "daily", [{ type: "slack", enabled: true }]);
      createSubscription("user2", "weekly", [{ type: "rss", enabled: true }]);
      expect(listSubscriptions("user1")).toHaveLength(1);
      expect(listSubscriptions()).toHaveLength(2);
    });

    it("updates subscription settings", () => {
      const sub = createSubscription("user1", "daily", [{ type: "email", enabled: true }]);
      updateSubscription(sub.id, { frequency: "weekly", enabled: false });
      const updated = getSubscription(sub.id)!;
      expect(updated.frequency).toBe("weekly");
      expect(updated.enabled).toBe(false);
    });

    it("deletes a subscription", () => {
      const sub = createSubscription("user1", "daily", [{ type: "email", enabled: true }]);
      expect(deleteSubscription(sub.id)).toBe(true);
      expect(getSubscription(sub.id)).toBeUndefined();
    });
  });

  describe("generateDigest", () => {
    it("generates a digest with sections and metrics", () => {
      const sub = createSubscription("user1", "weekly", [{ type: "email", enabled: true }]);
      const digest = generateDigest(sub.id, mockInput);

      expect(digest.title).toContain("Weekly");
      expect(digest.metrics.totalSessions).toBe(2);
      expect(digest.metrics.totalIdeas).toBe(3);
      expect(digest.metrics.anglesUsed).toBeGreaterThan(0);
      expect(digest.topIdeas.length).toBeGreaterThan(0);
      expect(digest.sections.length).toBeGreaterThan(0);
      expect(digest.topIdeas[0].title).toBe("Adaptive Learning"); // highest score
    });

    it("stores generated digests", () => {
      const sub = createSubscription("user1", "weekly", [{ type: "email", enabled: true }]);
      generateDigest(sub.id, mockInput);
      expect(getGeneratedDigests(sub.id)).toHaveLength(1);
    });
  });

  describe("format renderers", () => {
    it("renders markdown", () => {
      const sub = createSubscription("user1", "weekly", [{ type: "email", enabled: true }]);
      const digest = generateDigest(sub.id, mockInput);
      const md = digestToMarkdown(digest);
      expect(md).toContain("# Innovation Digest");
      expect(md).toContain("2024-01-15");
    });

    it("renders Slack payload", () => {
      const sub = createSubscription("user1", "weekly", [{ type: "slack", enabled: true }]);
      const digest = generateDigest(sub.id, mockInput);
      const slack = digestToSlack(digest);
      expect(slack.text).toBeTruthy();
      expect(slack.blocks.length).toBeGreaterThan(0);
    });

    it("renders RSS feed", () => {
      const sub = createSubscription("user1", "weekly", [{ type: "rss", enabled: true }]);
      const digest = generateDigest(sub.id, mockInput);
      const rss = digestToRSS([digest]);
      expect(rss).toContain("<?xml");
      expect(rss).toContain("<rss");
      expect(rss).toContain(digest.id);
    });
  });

  describe("getDueSubscriptions", () => {
    it("returns subscriptions that need digest generation", () => {
      createSubscription("user1", "daily", [{ type: "email", enabled: true }]);
      const due = getDueSubscriptions();
      expect(due).toHaveLength(1); // never sent before = due
    });
  });
});
