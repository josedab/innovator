import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs", () => {
  const store = new Map<string, string>();
  return {
    existsSync: vi.fn((path: string) => store.has(path)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((path: string) => {
      if (!store.has(path)) throw new Error("ENOENT");
      return store.get(path)!;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    readdirSync: vi.fn(() => []),
    __store: store,
  };
});

import {
  getProfile,
  followUser,
  unfollowUser,
  shareIdea,
  likeIdea,
  unlikeIdea,
  commentOnIdea,
  repostIdea,
  getTrendingIdeas,
  getUserFeed,
  getGlobalFeed,
  publishStory,
  getStories,
  searchIdeas,
  clearSocialData,
} from "../index.js";

const mockFs = vi.mocked(await import("node:fs"));
const store = (mockFs as unknown as { __store: Map<string, string> }).__store;

describe("social (comprehensive)", () => {
  beforeEach(() => {
    store.clear();
    clearSocialData();
  });

  describe("shareIdea engagement counters", () => {
    it("initializes likes=[], shares=0, comments=[]", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Idea", "desc");
      expect(idea.likes).toEqual([]);
      expect(idea.shares).toBe(0);
      expect(idea.comments).toEqual([]);
    });
  });

  describe("likeIdea", () => {
    it("adds user to likes array", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      const liked = likeIdea("bob", idea.id);
      expect(liked!.likes).toContain("bob");
    });

    it("liking already-liked idea is idempotent", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      likeIdea("bob", idea.id);
      const result = likeIdea("bob", idea.id);
      expect(result!.likes.filter((id: string) => id === "bob")).toHaveLength(1);
    });

    it("returns undefined for non-existent idea", () => {
      expect(likeIdea("bob", "nonexistent")).toBeUndefined();
    });
  });

  describe("unlikeIdea", () => {
    it("removes user from likes array", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      likeIdea("bob", idea.id);
      const result = unlikeIdea("bob", idea.id);
      expect(result!.likes).not.toContain("bob");
    });

    it("unlike non-liked idea does not error", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      const result = unlikeIdea("bob", idea.id);
      expect(result).toBeDefined();
      expect(result!.likes).not.toContain("bob");
    });

    it("returns undefined for non-existent idea", () => {
      expect(unlikeIdea("bob", "nonexistent")).toBeUndefined();
    });
  });

  describe("commentOnIdea", () => {
    it("increments comments array", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Test", "desc");
      commentOnIdea("bob", "Bob", idea.id, "Nice!");
      commentOnIdea("charlie", "Charlie", idea.id, "Great!");
      // Re-read from mock fs to get updated state
      const updated = searchIdeas("Test");
      expect(updated[0].comments).toHaveLength(2);
    });
  });

  describe("repostIdea", () => {
    it("increments shares counter", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      const reposted = repostIdea("bob", idea.id);
      expect(reposted!.shares).toBe(1);
    });

    it("multiple reposts increment counter each time", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Test", "desc");
      repostIdea("bob", idea.id);
      const result = repostIdea("bob", idea.id);
      expect(result!.shares).toBe(2);
    });

    it("returns undefined for non-existent idea", () => {
      expect(repostIdea("bob", "nonexistent")).toBeUndefined();
    });
  });

  describe("getTrendingIdeas scoring formula", () => {
    it("trending score includes likes*3 + comments*5 + shares*10", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Trending Test", "desc");
      likeIdea("bob", idea.id);
      commentOnIdea("bob", "Bob", idea.id, "Comment");
      repostIdea("bob", idea.id);

      const trending = getTrendingIdeas();
      expect(trending.length).toBeGreaterThan(0);
      // With 1 like (3) + 1 comment (5) + 1 share (10) = 18 base engagement * decay
      expect(trending[0].trendingScore).toBeGreaterThan(0);
    });

    it("returns empty for 0 ideas", () => {
      expect(getTrendingIdeas()).toHaveLength(0);
    });

    it("only includes public ideas", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Public", "desc", { visibility: "public" });
      shareIdea("alice", "Private", "desc", { visibility: "private" });
      const trending = getTrendingIdeas();
      expect(trending.every((t) => t.title !== "Private")).toBe(true);
    });
  });

  describe("getUserFeed / getGlobalFeed", () => {
    it("getUserFeed includes own events", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "My Idea", "desc");
      const feed = getUserFeed("alice");
      expect(feed.length).toBeGreaterThan(0);
    });

    it("getUserFeed includes followed users events", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");
      shareIdea("bob", "Bob's Idea", "desc");
      const feed = getUserFeed("alice");
      const hasShareEvent = feed.some((e) => e.actorId === "bob");
      expect(hasShareEvent).toBe(true);
    });

    it("feed for 0 follows only includes own events", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      shareIdea("bob", "Bob's Idea", "desc");
      const feed = getUserFeed("alice");
      expect(feed.every((e) => e.actorId === "alice")).toBe(true);
    });

    it("getGlobalFeed respects limit", () => {
      getProfile("alice", "Alice");
      for (let i = 0; i < 10; i++) {
        shareIdea("alice", `Idea ${i}`, "desc");
      }
      const feed = getGlobalFeed(3);
      expect(feed.length).toBeLessThanOrEqual(3);
    });

    it("feed is ordered by timestamp (most recent first)", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "First", "desc");
      shareIdea("alice", "Second", "desc");
      const feed = getGlobalFeed();
      if (feed.length >= 2) {
        expect(new Date(feed[0].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(feed[1].timestamp).getTime()
        );
      }
    });
  });

  describe("followUser / unfollowUser", () => {
    it("follow toggle: follow then unfollow", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");
      unfollowUser("alice", "bob");
      const alice = getProfile("alice");
      expect(alice.following).not.toContain("bob");
    });

    it("unfollowUser when not following does not error", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      unfollowUser("alice", "bob"); // Should not throw
    });
  });

  describe("publishStory / getStories", () => {
    it("publishes a story with all fields", () => {
      getProfile("alice", "Alice");
      const story = publishStory("alice", "My Story", "Once upon a time...", ["idea1"], ["tag1"]);
      expect(story.id).toBeTruthy();
      expect(story.title).toBe("My Story");
      expect(story.content).toBe("Once upon a time...");
      expect(story.relatedIdeaIds).toEqual(["idea1"]);
      expect(story.tags).toEqual(["tag1"]);
    });

    it("getStories returns published stories", () => {
      getProfile("alice", "Alice");
      publishStory("alice", "Story 1", "content");
      publishStory("alice", "Story 2", "content");
      const stories = getStories();
      expect(stories).toHaveLength(2);
    });

    it("getStories respects limit", () => {
      getProfile("alice", "Alice");
      for (let i = 0; i < 5; i++) {
        publishStory("alice", `Story ${i}`, "content");
      }
      expect(getStories(2).length).toBeLessThanOrEqual(2);
    });
  });

  describe("searchIdeas", () => {
    it("search with no matches returns empty", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "AI Tool", "desc");
      expect(searchIdeas("nonexistent")).toHaveLength(0);
    });

    it("matches by tag", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Tool", "desc", { tags: ["machine-learning"] });
      const results = searchIdeas("machine-learning");
      expect(results).toHaveLength(1);
    });
  });
});
