import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `innovator-feedback-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  submitFeedback,
  loadAllFeedback,
  getSessionFeedback,
  computeAngleScores,
  getFeedbackSummary,
  buildFeedbackHint,
} = await import("../feedback/index.js");

describe("feedback", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "feedback"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("submitFeedback", () => {
    it("creates entry with UUID", () => {
      const id = submitFeedback({
        ideaTitle: "Test Idea",
        angleId: "scamper",
        rating: "up",
      });
      expect(id).toBeTruthy();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("persists optional fields", () => {
      submitFeedback({
        sessionId: "sess-1",
        ideaTitle: "Test",
        angleId: "scamper",
        rating: "down",
        comment: "not good",
      });
      const all = loadAllFeedback();
      expect(all).toHaveLength(1);
      expect(all[0].sessionId).toBe("sess-1");
      expect(all[0].comment).toBe("not good");
    });
  });

  describe("loadAllFeedback", () => {
    it("returns sorted entries (newest first)", async () => {
      submitFeedback({ ideaTitle: "First", angleId: "a", rating: "up" });
      await new Promise((r) => setTimeout(r, 10));
      submitFeedback({ ideaTitle: "Second", angleId: "b", rating: "down" });
      const all = loadAllFeedback();
      expect(all).toHaveLength(2);
      expect(all[0].ideaTitle).toBe("Second");
    });

    it("skips corrupt files", () => {
      submitFeedback({ ideaTitle: "Good", angleId: "a", rating: "up" });
      writeFileSync(
        join(testDir, ".innovator", "feedback", "corrupt.json"),
        "not json{{{",
        "utf-8"
      );
      const all = loadAllFeedback();
      expect(all).toHaveLength(1);
    });
  });

  describe("getSessionFeedback", () => {
    it("filters by sessionId", () => {
      submitFeedback({ sessionId: "s1", ideaTitle: "A", angleId: "a", rating: "up" });
      submitFeedback({ sessionId: "s2", ideaTitle: "B", angleId: "a", rating: "down" });
      submitFeedback({ ideaTitle: "C", angleId: "a", rating: "up" });
      const result = getSessionFeedback("s1");
      expect(result).toHaveLength(1);
      expect(result[0].ideaTitle).toBe("A");
    });
  });

  describe("computeAngleScores", () => {
    it("calculates qualityScore correctly", () => {
      submitFeedback({ ideaTitle: "A", angleId: "scamper", rating: "up" });
      submitFeedback({ ideaTitle: "B", angleId: "scamper", rating: "up" });
      submitFeedback({ ideaTitle: "C", angleId: "scamper", rating: "down" });
      const scores = computeAngleScores();
      const scamper = scores.find((s) => s.angleId === "scamper");
      expect(scamper).toBeDefined();
      expect(scamper!.qualityScore).toBeCloseTo(0.67, 1);
      expect(scamper!.thumbsUp).toBe(2);
      expect(scamper!.thumbsDown).toBe(1);
      expect(scamper!.totalFeedback).toBe(3);
    });

    it("computes recentTrend", () => {
      // Create 15 entries: first 5 down, then 10 up → recent should be "improving"
      for (let i = 0; i < 5; i++) {
        submitFeedback({ ideaTitle: `Old ${i}`, angleId: "test", rating: "down" });
      }
      for (let i = 0; i < 10; i++) {
        submitFeedback({ ideaTitle: `New ${i}`, angleId: "test", rating: "up" });
      }
      const scores = computeAngleScores();
      const testAngle = scores.find((s) => s.angleId === "test");
      expect(testAngle).toBeDefined();
      // Recent 10 are all up (score=1.0), overall is 10/15 ≈ 0.67
      expect(testAngle!.recentTrend).toBe("improving");
    });

    it("collects commonComplaints from down-rated entries", () => {
      submitFeedback({ ideaTitle: "A", angleId: "scamper", rating: "down", comment: "too vague" });
      submitFeedback({
        ideaTitle: "B",
        angleId: "scamper",
        rating: "down",
        comment: "not actionable",
      });
      submitFeedback({ ideaTitle: "C", angleId: "scamper", rating: "up" });
      const scores = computeAngleScores();
      const scamper = scores.find((s) => s.angleId === "scamper");
      expect(scamper!.commonComplaints).toContain("too vague");
      expect(scamper!.commonComplaints).toContain("not actionable");
    });
  });

  describe("getFeedbackSummary", () => {
    it("identifies bestAngle and worstAngle", () => {
      submitFeedback({ ideaTitle: "A", angleId: "good", rating: "up" });
      submitFeedback({ ideaTitle: "B", angleId: "good", rating: "up" });
      submitFeedback({ ideaTitle: "C", angleId: "bad", rating: "down" });
      submitFeedback({ ideaTitle: "D", angleId: "bad", rating: "down" });
      const summary = getFeedbackSummary();
      expect(summary.bestAngle).toBe("good");
      expect(summary.worstAngle).toBe("bad");
      expect(summary.totalFeedback).toBe(4);
    });

    it("handles empty feedback", () => {
      const summary = getFeedbackSummary();
      expect(summary.totalFeedback).toBe(0);
      expect(summary.bestAngle).toBeNull();
      expect(summary.worstAngle).toBeNull();
    });
  });

  describe("buildFeedbackHint", () => {
    it("returns null when <3 entries", () => {
      submitFeedback({ ideaTitle: "A", angleId: "scamper", rating: "down", comment: "bad" });
      expect(buildFeedbackHint("scamper")).toBeNull();
    });

    it("returns null when quality >= 0.7", () => {
      for (let i = 0; i < 5; i++) {
        submitFeedback({ ideaTitle: `G${i}`, angleId: "scamper", rating: "up" });
      }
      expect(buildFeedbackHint("scamper")).toBeNull();
    });

    it("generates hint when quality < 0.7 and has complaints", () => {
      submitFeedback({ ideaTitle: "A", angleId: "scamper", rating: "down", comment: "too vague" });
      submitFeedback({ ideaTitle: "B", angleId: "scamper", rating: "down", comment: "not useful" });
      submitFeedback({ ideaTitle: "C", angleId: "scamper", rating: "down", comment: "boring" });
      const hint = buildFeedbackHint("scamper");
      expect(hint).toBeTruthy();
      expect(hint).toContain("QUALITY NOTE");
      expect(hint).toContain("too vague");
    });

    it("returns null for unknown angle", () => {
      expect(buildFeedbackHint("nonexistent")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("all up ratings", () => {
      for (let i = 0; i < 5; i++) {
        submitFeedback({ ideaTitle: `U${i}`, angleId: "test", rating: "up" });
      }
      const scores = computeAngleScores();
      expect(scores[0].qualityScore).toBe(1);
    });

    it("all down ratings", () => {
      for (let i = 0; i < 5; i++) {
        submitFeedback({ ideaTitle: `D${i}`, angleId: "test", rating: "down" });
      }
      const scores = computeAngleScores();
      expect(scores[0].qualityScore).toBe(0);
    });

    it("single feedback entry", () => {
      submitFeedback({ ideaTitle: "Solo", angleId: "test", rating: "up" });
      const scores = computeAngleScores();
      expect(scores).toHaveLength(1);
      expect(scores[0].qualityScore).toBe(1);
      expect(scores[0].recentTrend).toBe("stable");
    });
  });
});
