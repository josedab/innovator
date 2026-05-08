import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue("Review guidance text"),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, value: string) => `${label}: ${value}`),
}));

import {
  upsertExpertiseProfile,
  getExpertiseProfile,
  listAvailableReviewers,
  submitReviewRequest,
  getReviewRequest,
  listReviewRequests,
  matchReviewers,
  computeMatchScore,
  submitReview,
  closeReviewRequest,
  getReviewerReputation,
  getLeaderboard,
  getNotifications,
  markNotificationsRead,
  generateReviewGuidance,
  clearPeerReviewData,
} from "../peer-review/index.js";
import type { ExpertiseProfile, ReviewDimension } from "../peer-review/index.js";

function makeProfile(overrides: Partial<ExpertiseProfile> = {}): ExpertiseProfile {
  const now = new Date().toISOString();
  return {
    userId: "reviewer-1",
    displayName: "Jane Expert",
    domains: [{ domain: "AI/ML", level: "expert", keywords: ["machine-learning", "neural"] }],
    availability: "available",
    maxReviewsPerWeek: 5,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDimensions(): ReviewDimension[] {
  return [
    {
      dimension: "feasibility",
      score: 8,
      feedback: "Very feasible given current technology stack and resources available.",
    },
    {
      dimension: "novelty",
      score: 7,
      feedback: "Novel approach to the problem space with unique angle.",
    },
    {
      dimension: "market-fit",
      score: 9,
      feedback: "Strong market demand for this type of solution.",
    },
  ];
}

describe("peer-review", () => {
  beforeEach(() => {
    clearPeerReviewData();
  });

  describe("expertise profiles", () => {
    it("creates and retrieves a profile", () => {
      const profile = makeProfile();
      upsertExpertiseProfile(profile);
      const fetched = getExpertiseProfile("reviewer-1");
      expect(fetched).toBeDefined();
      expect(fetched?.displayName).toBe("Jane Expert");
    });

    it("lists available reviewers", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1", availability: "available" }));
      upsertExpertiseProfile(makeProfile({ userId: "r2", availability: "busy" }));
      upsertExpertiseProfile(makeProfile({ userId: "r3", availability: "available" }));
      expect(listAvailableReviewers()).toHaveLength(2);
    });
  });

  describe("review requests", () => {
    it("submits a review request", () => {
      const req = submitReviewRequest(
        "author-1",
        "AI Widget",
        "An AI-powered widget for data analysis",
        ["AI/ML"]
      );
      expect(req.status).toBe("submitted");
      expect(req.authorId).toBe("author-1");
    });

    it("retrieves a request by ID", () => {
      const req = submitReviewRequest("author-1", "AI Widget", "Description", ["AI/ML"]);
      const fetched = getReviewRequest(req.id);
      expect(fetched?.ideaTitle).toBe("AI Widget");
    });

    it("lists requests by status", () => {
      submitReviewRequest("a1", "Idea 1", "Desc 1", ["AI/ML"]);
      submitReviewRequest("a2", "Idea 2", "Desc 2", ["Biotech"]);
      expect(listReviewRequests({ status: "submitted" })).toHaveLength(2);
      expect(listReviewRequests({ authorId: "a1" })).toHaveLength(1);
    });
  });

  describe("matching", () => {
    it("matches reviewers to requests by domain expertise", () => {
      upsertExpertiseProfile(
        makeProfile({ userId: "r1", domains: [{ domain: "AI/ML", level: "expert" }] })
      );
      upsertExpertiseProfile(
        makeProfile({ userId: "r2", domains: [{ domain: "Biotech", level: "advanced" }] })
      );
      const req = submitReviewRequest("author-1", "ML Pipeline", "A machine-learning pipeline", [
        "AI/ML",
      ]);
      const matched = matchReviewers(req.id);
      expect(matched).toContain("r1");
      expect(matched).not.toContain("r2");
    });

    it("blocks self-review", () => {
      upsertExpertiseProfile(makeProfile({ userId: "author-1" }));
      const req = submitReviewRequest("author-1", "My Idea", "Description", ["AI/ML"]);
      const score = computeMatchScore(getExpertiseProfile("author-1")!, req);
      expect(score).toBe(0);
    });

    it("excludes unavailable reviewers", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1", availability: "unavailable" }));
      const req = submitReviewRequest("author-1", "Idea", "Desc", ["AI/ML"]);
      const score = computeMatchScore(getExpertiseProfile("r1")!, req);
      expect(score).toBe(0);
    });
  });

  describe("review submission", () => {
    it("submits a valid review", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test Idea", "Description here", ["AI/ML"]);
      matchReviewers(req.id);

      const review = submitReview(
        req.id,
        "r1",
        makeDimensions(),
        8,
        ["Great concept"],
        ["Needs more detail"],
        ["Add benchmarks"],
        "approve"
      );
      expect(review.overallScore).toBe(8);
      expect(review.verdict).toBe("approve");
    });

    it("rejects duplicate review from same reviewer", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      matchReviewers(req.id);
      submitReview(req.id, "r1", makeDimensions(), 8, ["Good"], ["Bad"], ["Fix"], "approve");
      expect(() => submitReview(req.id, "r1", makeDimensions(), 7, [], [], [], "approve")).toThrow(
        "already submitted"
      );
    });

    it("rejects review from unmatched reviewer", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      expect(() => submitReview(req.id, "r1", makeDimensions(), 8, [], [], [], "approve")).toThrow(
        "not matched"
      );
    });
  });

  describe("reputation and leaderboard", () => {
    it("updates reputation after review", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      matchReviewers(req.id);
      submitReview(req.id, "r1", makeDimensions(), 8, ["Good"], ["Meh"], ["Fix it"], "approve");

      const rep = getReviewerReputation("r1");
      expect(rep).toBeDefined();
      expect(rep!.totalReviews).toBe(1);
      expect(rep!.badges.some((b) => b.id === "first-review")).toBe(true);
    });

    it("generates leaderboard", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1", displayName: "Alice" }));
      upsertExpertiseProfile(makeProfile({ userId: "r2", displayName: "Bob" }));
      const req1 = submitReviewRequest("author-1", "Idea1", "Desc", ["AI/ML"]);
      matchReviewers(req1.id, 2);
      submitReview(req1.id, "r1", makeDimensions(), 9, ["Great"], [], [], "strong-approve");
      submitReview(req1.id, "r2", makeDimensions(), 6, ["OK"], ["Weak"], [], "needs-work");

      const board = getLeaderboard();
      expect(board).toHaveLength(2);
      expect(board[0].rank).toBe(1);
    });
  });

  describe("close request", () => {
    it("closes a request with reviews", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      matchReviewers(req.id);
      submitReview(req.id, "r1", makeDimensions(), 8, ["Good"], [], [], "approve");

      const closed = closeReviewRequest(req.id, "author-1");
      expect(closed.status).toBe("closed");
      expect(closed.closedAt).toBeDefined();
    });

    it("rejects closing by non-author", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      matchReviewers(req.id);
      submitReview(req.id, "r1", makeDimensions(), 8, ["Good"], [], [], "approve");
      expect(() => closeReviewRequest(req.id, "other-user")).toThrow("Only the author");
    });
  });

  describe("notifications", () => {
    it("generates notifications on review lifecycle", () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      const authorNotifs = getNotifications("author-1");
      expect(authorNotifs.length).toBeGreaterThan(0);
      expect(authorNotifs[0].type).toBe("review-requested");

      matchReviewers(req.id);
      const reviewerNotifs = getNotifications("r1");
      expect(reviewerNotifs.some((n) => n.type === "reviewer-matched")).toBe(true);
    });

    it("marks notifications as read", () => {
      submitReviewRequest("author-1", "Test", "Desc", ["AI/ML"]);
      const notifs = getNotifications("author-1");
      markNotificationsRead(notifs.map((n) => n.id));
      expect(getNotifications("author-1", true)).toHaveLength(0);
    });
  });

  describe("LLM guidance", () => {
    it("generates review guidance", async () => {
      upsertExpertiseProfile(makeProfile({ userId: "r1" }));
      const req = submitReviewRequest("author-1", "Test Idea", "An AI thing", ["AI/ML"]);
      matchReviewers(req.id);

      const guidance = await generateReviewGuidance(req.id, "r1");
      expect(guidance).toBeTruthy();
    });
  });
});
