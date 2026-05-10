import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awardBadge,
  clearCommunityChallenges,
  closeCommunityChallenge,
  createCommunityChallenge,
  getCommunityChallenge,
  getCommunityLeaderboard,
  getEntryRankings,
  getUserBadges,
  listCommunityChallenges,
  submitEntry,
  voteForEntry,
} from "../gamification/challenges.js";

function createOpenChallenge(
  overrides: Partial<Parameters<typeof createCommunityChallenge>[0]> = {}
) {
  const challenge = createCommunityChallenge({
    title: "Community Challenge",
    description: "Explore the next product bet",
    organizerId: "org-1",
    organizerName: "Organizer One",
    judgingCriteria: [{ name: "Novelty", weight: 1, description: "Reward originality" }],
    ...overrides,
  });
  challenge.status = "open";
  return challenge;
}

describe("gamification/challenges", () => {
  beforeEach(() => {
    clearCommunityChallenges();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createCommunityChallenge / getCommunityChallenge / listCommunityChallenges", () => {
    it("creates draft challenges with defaults and retrieves them by id", () => {
      const challenge = createCommunityChallenge({
        title: "AI for Operations",
        description: "Improve incident response",
        organizerId: "org-1",
        organizerName: "Ops Guild",
        judgingCriteria: [{ name: "Impact", weight: 1, description: "Business impact" }],
      });

      expect(challenge.status).toBe("draft");
      expect(challenge.isPublic).toBe(true);
      expect(challenge.maxSubmissions).toBe(100);
      expect(challenge.submissions).toEqual([]);
      expect(getCommunityChallenge(challenge.id)).toEqual(challenge);
      expect(getCommunityChallenge("missing")).toBeUndefined();
    });

    it("filters challenges and sorts by updatedAt descending", () => {
      vi.useFakeTimers();

      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const first = createOpenChallenge({ title: "First", category: "design" });

      vi.setSystemTime(new Date("2025-01-02T00:00:00Z"));
      const second = createCommunityChallenge({
        title: "Second",
        description: "Hidden work",
        organizerId: "org-2",
        organizerName: "Private Org",
        isPublic: false,
        category: "ops",
        judgingCriteria: [{ name: "Feasibility", weight: 1, description: "Can ship soon" }],
      });
      second.status = "closed";

      vi.setSystemTime(new Date("2025-01-03T00:00:00Z"));
      const third = createOpenChallenge({ title: "Third", category: "design" });

      expect(listCommunityChallenges().map((challenge) => challenge.id)).toEqual([
        third.id,
        second.id,
        first.id,
      ]);
      expect(listCommunityChallenges({ status: "open" }).map((challenge) => challenge.id)).toEqual([
        third.id,
        first.id,
      ]);
      expect(listCommunityChallenges({ isPublic: false })).toEqual([second]);
      expect(
        listCommunityChallenges({ category: "design" }).map((challenge) => challenge.id)
      ).toEqual([third.id, first.id]);
    });

    it("re-sorts challenges when updatedAt changes after a submission", () => {
      vi.useFakeTimers();

      vi.setSystemTime(new Date("2025-02-01T00:00:00Z"));
      const older = createOpenChallenge({ title: "Older" });

      vi.setSystemTime(new Date("2025-02-02T00:00:00Z"));
      createOpenChallenge({ title: "Newer" });

      vi.setSystemTime(new Date("2025-02-03T00:00:00Z"));
      submitEntry(older.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Revive the older challenge",
        description: "Fresh submission",
      });

      expect(listCommunityChallenges()[0]?.id).toBe(older.id);
    });
  });

  describe("submitEntry", () => {
    it("submits to open challenges and awards points plus a first-submission badge", () => {
      const challenge = createOpenChallenge();

      const submission = submitEntry(challenge.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Idea 1",
        description: "Detailed pitch",
        angleIds: ["angle-a"],
        attachments: [{ name: "deck", url: "https://example.com/deck", type: "pdf" }],
      });

      expect(submission).toMatchObject({
        challengeId: challenge.id,
        authorId: "user-1",
        authorName: "Alice",
        title: "Idea 1",
        votes: 0,
        voterIds: [],
        angleIds: ["angle-a"],
      });
      expect(getCommunityChallenge(challenge.id)?.submissions).toHaveLength(1);
      expect(getUserBadges("user-1")).toEqual([
        expect.objectContaining({ id: "first-submission", challengeId: challenge.id }),
      ]);
      expect(getCommunityLeaderboard()).toEqual([
        expect.objectContaining({
          userId: "user-1",
          totalPoints: 10,
          submissionsCount: 1,
          winsCount: 0,
          votesReceived: 0,
          rank: 1,
        }),
      ]);
    });

    it("rejects submissions to missing, draft, judging, or closed challenges", () => {
      const challenge = createCommunityChallenge({
        title: "Locked Challenge",
        description: "Not open",
        organizerId: "org-1",
        organizerName: "Organizer",
        judgingCriteria: [{ name: "Impact", weight: 1, description: "Impact" }],
      });

      expect(
        submitEntry("missing", {
          authorId: "user-1",
          authorName: "Alice",
          title: "Should fail",
          description: "No challenge",
        })
      ).toBeUndefined();

      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "Draft submission",
          description: "Should fail",
        })
      ).toBeUndefined();

      challenge.status = "judging";
      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "Judging submission",
          description: "Should fail",
        })
      ).toBeUndefined();

      challenge.status = "closed";
      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "Closed submission",
          description: "Should fail",
        })
      ).toBeUndefined();
    });

    it("rejects submissions after the deadline", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-03-05T00:00:00Z"));
      const challenge = createOpenChallenge({ deadline: "2025-03-04T23:59:59Z" });

      const submission = submitEntry(challenge.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Late idea",
        description: "Too late",
      });

      expect(submission).toBeUndefined();
      expect(getCommunityChallenge(challenge.id)?.submissions).toEqual([]);
    });

    it("rejects duplicate submissions from the same author without adding extra points", () => {
      const challenge = createOpenChallenge();

      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "First idea",
          description: "Accepted",
        })
      ).toBeTruthy();

      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "Second idea",
          description: "Rejected",
        })
      ).toBeUndefined();

      expect(getCommunityChallenge(challenge.id)?.submissions).toHaveLength(1);
      expect(
        getUserBadges("user-1").filter((badge) => badge.id === "first-submission")
      ).toHaveLength(1);
      expect(getCommunityLeaderboard()[0]).toEqual(
        expect.objectContaining({ userId: "user-1", totalPoints: 10, submissionsCount: 1 })
      );
    });

    it("enforces the max submissions boundary", () => {
      const challenge = createOpenChallenge({ maxSubmissions: 1 });

      expect(
        submitEntry(challenge.id, {
          authorId: "user-1",
          authorName: "Alice",
          title: "Only slot",
          description: "Accepted",
        })
      ).toBeTruthy();

      expect(
        submitEntry(challenge.id, {
          authorId: "user-2",
          authorName: "Bob",
          title: "Overflow",
          description: "Rejected",
        })
      ).toBeUndefined();
    });

    it("only awards the first-submission badge once across multiple challenges", () => {
      const firstChallenge = createOpenChallenge({ title: "Challenge A" });
      const secondChallenge = createOpenChallenge({ title: "Challenge B" });

      submitEntry(firstChallenge.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Entry A",
        description: "First",
      });
      submitEntry(secondChallenge.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Entry B",
        description: "Second",
      });

      expect(
        getUserBadges("user-1").filter((badge) => badge.id === "first-submission")
      ).toHaveLength(1);
      expect(getCommunityLeaderboard()[0]).toEqual(
        expect.objectContaining({ userId: "user-1", totalPoints: 20, submissionsCount: 2 })
      );
    });
  });

  describe("voteForEntry / getEntryRankings", () => {
    it("allows voting during open and judging states and awards author points", () => {
      const challenge = createOpenChallenge();
      const submission = submitEntry(challenge.id, {
        authorId: "author-1",
        authorName: "Alice",
        title: "Entry",
        description: "Pitch",
      });

      expect(submission).toBeTruthy();
      expect(voteForEntry(challenge.id, submission!.id, "voter-1")).toBe(true);

      challenge.status = "judging";
      expect(voteForEntry(challenge.id, submission!.id, "voter-2")).toBe(true);

      expect(getCommunityChallenge(challenge.id)?.submissions[0]).toEqual(
        expect.objectContaining({ votes: 2, voterIds: ["voter-1", "voter-2"] })
      );
      expect(getCommunityLeaderboard()[0]).toEqual(
        expect.objectContaining({ userId: "author-1", totalPoints: 14, votesReceived: 2 })
      );
    });

    it("prevents self-voting, duplicate voting, missing submissions, and voting on closed challenges", () => {
      const challenge = createOpenChallenge();
      const submission = submitEntry(challenge.id, {
        authorId: "author-1",
        authorName: "Alice",
        title: "Entry",
        description: "Pitch",
      });

      expect(voteForEntry(challenge.id, submission!.id, "author-1")).toBe(false);
      expect(voteForEntry(challenge.id, submission!.id, "voter-1")).toBe(true);
      expect(voteForEntry(challenge.id, submission!.id, "voter-1")).toBe(false);
      expect(voteForEntry(challenge.id, "missing", "voter-2")).toBe(false);
      expect(voteForEntry("missing", submission!.id, "voter-2")).toBe(false);

      challenge.status = "closed";
      expect(voteForEntry(challenge.id, submission!.id, "voter-2")).toBe(false);
      expect(getCommunityChallenge(challenge.id)?.submissions[0]?.votes).toBe(1);
    });

    it("ranks entries by votes when scores are not available", () => {
      const challenge = createOpenChallenge();
      const first = submitEntry(challenge.id, {
        authorId: "author-1",
        authorName: "Alice",
        title: "Entry 1",
        description: "Pitch 1",
      })!;
      const second = submitEntry(challenge.id, {
        authorId: "author-2",
        authorName: "Bob",
        title: "Entry 2",
        description: "Pitch 2",
      })!;

      voteForEntry(challenge.id, second.id, "voter-1");
      voteForEntry(challenge.id, second.id, "voter-2");
      voteForEntry(challenge.id, first.id, "voter-3");

      expect(getEntryRankings(challenge.id).map((entry) => entry.id)).toEqual([
        second.id,
        first.id,
      ]);
    });

    it("ranks entries by score when judging data exists", () => {
      const challenge = createOpenChallenge();
      const first = submitEntry(challenge.id, {
        authorId: "author-1",
        authorName: "Alice",
        title: "Entry 1",
        description: "Pitch 1",
      })!;
      const second = submitEntry(challenge.id, {
        authorId: "author-2",
        authorName: "Bob",
        title: "Entry 2",
        description: "Pitch 2",
      })!;

      first.score = 72;
      second.score = 91;
      first.votes = 10;
      second.votes = 0;

      expect(getEntryRankings(challenge.id).map((entry) => entry.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(getEntryRankings("missing")).toEqual([]);
    });
  });

  describe("awardBadge / getUserBadges / getCommunityLeaderboard / closeCommunityChallenge", () => {
    it("awards manual badges and reflects the extra points in the leaderboard", () => {
      const challenge = createOpenChallenge();
      submitEntry(challenge.id, {
        authorId: "user-1",
        authorName: "Alice",
        title: "Entry",
        description: "Pitch",
      });

      const badge = awardBadge("user-1", {
        name: "Mentor",
        description: "Helped the community",
        icon: "🌟",
        category: "community",
        challengeId: challenge.id,
      });

      expect(getUserBadges("user-1")).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: badge.id, name: "Mentor" })])
      );
      expect(getCommunityLeaderboard()[0]).toEqual(
        expect.objectContaining({
          userId: "user-1",
          totalPoints: 15,
          badges: expect.arrayContaining([badge]),
        })
      );
    });

    it("returns an empty leaderboard when there is no activity", () => {
      expect(getCommunityLeaderboard()).toEqual([]);
      expect(getUserBadges("nobody")).toEqual([]);
    });

    it("aggregates leaderboard stats, ranks users, and respects the limit", () => {
      const challengeOne = createOpenChallenge({ title: "Challenge One" });
      const aliceEntry = submitEntry(challengeOne.id, {
        authorId: "alice",
        authorName: "Alice",
        title: "Alice entry",
        description: "Pitch",
      })!;
      const bobEntry = submitEntry(challengeOne.id, {
        authorId: "bob",
        authorName: "Bob",
        title: "Bob entry",
        description: "Pitch",
      })!;
      voteForEntry(challengeOne.id, aliceEntry.id, "voter-1");
      voteForEntry(challengeOne.id, aliceEntry.id, "voter-2");
      voteForEntry(challengeOne.id, bobEntry.id, "voter-3");
      closeCommunityChallenge(challengeOne.id);

      const challengeTwo = createOpenChallenge({ title: "Challenge Two" });
      submitEntry(challengeTwo.id, {
        authorId: "carol",
        authorName: "Carol",
        title: "Carol entry",
        description: "Pitch",
      });
      awardBadge("carol", {
        name: "Helper",
        description: "Helpful participant",
        icon: "H",
        category: "community",
      });

      const leaderboard = getCommunityLeaderboard(2);

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0]).toEqual(
        expect.objectContaining({
          userId: "alice",
          rank: 1,
          winsCount: 1,
          votesReceived: 2,
          totalPoints: 69,
        })
      );
      expect(leaderboard[0]?.badges).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Challenge Winner" })])
      );
      expect(leaderboard[1]).toEqual(expect.objectContaining({ rank: 2 }));
    });

    it("closes challenges, stamps closure time, and awards the winner badge plus bonus points", () => {
      const challenge = createOpenChallenge({ title: "Finale" });
      const aliceEntry = submitEntry(challenge.id, {
        authorId: "alice",
        authorName: "Alice",
        title: "Winner",
        description: "Pitch",
      })!;
      const bobEntry = submitEntry(challenge.id, {
        authorId: "bob",
        authorName: "Bob",
        title: "Runner-up",
        description: "Pitch",
      })!;

      voteForEntry(challenge.id, aliceEntry.id, "voter-1");
      voteForEntry(challenge.id, aliceEntry.id, "voter-2");
      voteForEntry(challenge.id, bobEntry.id, "voter-3");

      const closed = closeCommunityChallenge(challenge.id);

      expect(closed).toEqual(
        expect.objectContaining({
          id: challenge.id,
          status: "closed",
          closedAt: expect.any(String),
        })
      );
      expect(getUserBadges("alice")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Challenge Winner", challengeId: challenge.id }),
        ])
      );
      expect(getCommunityLeaderboard()[0]).toEqual(
        expect.objectContaining({ userId: "alice", winsCount: 1, totalPoints: 69 })
      );
    });

    it("returns undefined when closing a nonexistent challenge and handles empty challenges", () => {
      expect(closeCommunityChallenge("missing")).toBeUndefined();

      const challenge = createOpenChallenge({ title: "No submissions yet" });
      const closed = closeCommunityChallenge(challenge.id);

      expect(closed?.status).toBe("closed");
      expect(getCommunityLeaderboard()).toEqual([]);
    });
  });
});
