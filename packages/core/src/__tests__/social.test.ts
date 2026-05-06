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

import { existsSync, writeFileSync } from "node:fs";
import {
  getProfile,
  followUser,
  unfollowUser,
  shareIdea,
  likeIdea,
  unlikeIdea,
  commentOnIdea,
  getTrendingIdeas,
  getUserFeed,
  getGlobalFeed,
  searchIdeas,
  clearSocialData,
} from "../social/index.js";

// Access the mock store for cleanup
const mockFs = vi.mocked(await import("node:fs"));
const store = (mockFs as unknown as { __store: Map<string, string> }).__store;

describe("social", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(existsSync).mockImplementation((path) => store.has(path as string));
    clearSocialData();
  });

  describe("getProfile", () => {
    it("creates a new profile if not found", () => {
      const profile = getProfile("user1", "Alice");
      expect(profile.userId).toBe("user1");
      expect(profile.displayName).toBe("Alice");
      expect(profile.following).toEqual([]);
      expect(profile.followers).toEqual([]);
      expect(profile.ideaCount).toBe(0);
      expect(profile.joinedAt).toBeTruthy();
    });

    it("returns existing profile on second call", () => {
      getProfile("user1", "Alice");
      const profile2 = getProfile("user1", "Different Name");
      expect(profile2.displayName).toBe("Alice"); // original name kept
    });

    it("defaults displayName to userId", () => {
      const profile = getProfile("user1");
      expect(profile.displayName).toBe("user1");
    });
  });

  describe("followUser / unfollowUser", () => {
    it("adds follower relationship", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");

      const alice = getProfile("alice");
      const bob = getProfile("bob");
      expect(alice.following).toContain("bob");
      expect(bob.followers).toContain("alice");
    });

    it("is idempotent (following twice does not duplicate)", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");
      followUser("alice", "bob");

      const alice = getProfile("alice");
      expect(alice.following.filter((id: string) => id === "bob")).toHaveLength(1);
    });

    it("cannot follow yourself", () => {
      getProfile("alice", "Alice");
      followUser("alice", "alice");
      const alice = getProfile("alice");
      expect(alice.following).not.toContain("alice");
    });

    it("removes follower relationship on unfollow", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");
      unfollowUser("alice", "bob");

      const alice = getProfile("alice");
      const bob = getProfile("bob");
      expect(alice.following).not.toContain("bob");
      expect(bob.followers).not.toContain("alice");
    });

    it("unfollow is safe when not following", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      // Should not throw
      unfollowUser("alice", "bob");
    });
  });

  describe("shareIdea", () => {
    it("creates a shared idea with UUID and timestamps", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Great Idea", "Description of idea");
      expect(idea.id).toBeTruthy();
      expect(idea.authorId).toBe("alice");
      expect(idea.title).toBe("Great Idea");
      expect(idea.description).toBe("Description of idea");
      expect(idea.createdAt).toBeTruthy();
      expect(idea.updatedAt).toBeTruthy();
      expect(idea.likes).toEqual([]);
      expect(idea.comments).toEqual([]);
      expect(idea.visibility).toBe("public");
    });

    it("increments author ideaCount", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Idea 1", "desc");
      shareIdea("alice", "Idea 2", "desc");
      const alice = getProfile("alice");
      expect(alice.ideaCount).toBe(2);
    });

    it("supports tags and angleId", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Tagged Idea", "desc", {
        angleId: "scamper",
        tags: ["ai", "innovation"],
      });
      expect(idea.angleId).toBe("scamper");
      expect(idea.tags).toEqual(["ai", "innovation"]);
    });
  });

  describe("likeIdea / unlikeIdea", () => {
    it("likes an idea", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Likeable", "desc");
      const liked = likeIdea("bob", idea.id);
      expect(liked).toBeDefined();
      expect(liked!.likes).toContain("bob");
    });

    it("liking is idempotent", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Likeable", "desc");
      likeIdea("bob", idea.id);
      likeIdea("bob", idea.id);
      const updated = likeIdea("bob", idea.id);
      expect(updated!.likes.filter((id: string) => id === "bob")).toHaveLength(1);
    });

    it("returns undefined for nonexistent idea", () => {
      expect(likeIdea("bob", "nonexistent")).toBeUndefined();
    });

    it("unlikes an idea (toggle off)", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Likeable", "desc");
      likeIdea("bob", idea.id);
      const unliked = unlikeIdea("bob", idea.id);
      expect(unliked).toBeDefined();
      expect(unliked!.likes).not.toContain("bob");
    });

    it("unlike returns undefined for nonexistent idea", () => {
      expect(unlikeIdea("bob", "nonexistent")).toBeUndefined();
    });
  });

  describe("commentOnIdea", () => {
    it("adds a comment with UUID and timestamp", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Commentable", "desc");
      const comment = commentOnIdea("bob", "Bob", idea.id, "Great idea!");
      expect(comment).toBeDefined();
      expect(comment!.id).toBeTruthy();
      expect(comment!.authorId).toBe("bob");
      expect(comment!.content).toBe("Great idea!");
      expect(comment!.createdAt).toBeTruthy();
      expect(comment!.parentId).toBeNull();
    });

    it("supports nested replies via parentId", () => {
      getProfile("alice", "Alice");
      const idea = shareIdea("alice", "Discussable", "desc");
      const comment1 = commentOnIdea("bob", "Bob", idea.id, "First comment");
      const reply = commentOnIdea("alice", "Alice", idea.id, "Reply!", comment1!.id);
      expect(reply!.parentId).toBe(comment1!.id);
    });

    it("returns undefined for nonexistent idea", () => {
      expect(commentOnIdea("bob", "Bob", "nonexistent", "Comment")).toBeUndefined();
    });
  });

  describe("trending", () => {
    it("computes trending score based on engagement and decay", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea = shareIdea("alice", "Trending Idea", "desc");
      likeIdea("bob", idea.id);
      commentOnIdea("bob", "Bob", idea.id, "Nice!");

      const trending = getTrendingIdeas(10);
      expect(trending.length).toBeGreaterThan(0);
      expect(trending[0].trendingScore).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      getProfile("alice", "Alice");
      for (let i = 0; i < 5; i++) {
        shareIdea("alice", `Idea ${i}`, "desc");
      }
      const trending = getTrendingIdeas(3);
      expect(trending.length).toBeLessThanOrEqual(3);
    });

    it("sorts by trending score descending", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      const idea1 = shareIdea("alice", "Less Popular", "desc");
      const idea2 = shareIdea("alice", "More Popular", "desc");
      likeIdea("bob", idea2.id);
      likeIdea("bob", idea2.id);
      commentOnIdea("bob", "Bob", idea2.id, "Great!");

      const trending = getTrendingIdeas();
      if (trending.length >= 2) {
        expect(trending[0].trendingScore).toBeGreaterThanOrEqual(trending[1].trendingScore);
      }
    });
  });

  describe("feeds", () => {
    it("getUserFeed includes own and followed users' events", () => {
      getProfile("alice", "Alice");
      getProfile("bob", "Bob");
      followUser("alice", "bob");
      shareIdea("bob", "Bob's Idea", "desc");

      const feed = getUserFeed("alice");
      expect(feed.length).toBeGreaterThan(0);
    });

    it("getGlobalFeed returns all events", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Global Idea", "desc");
      const feed = getGlobalFeed();
      expect(feed.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      getProfile("alice", "Alice");
      for (let i = 0; i < 5; i++) {
        shareIdea("alice", `Idea ${i}`, "desc");
      }
      const feed = getGlobalFeed(2);
      expect(feed.length).toBeLessThanOrEqual(2);
    });
  });

  describe("searchIdeas", () => {
    it("finds ideas by keyword in title", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Machine Learning Innovation", "desc");
      shareIdea("alice", "Blockchain Platform", "desc");

      const results = searchIdeas("Machine");
      expect(results.length).toBe(1);
      expect(results[0].title).toContain("Machine");
    });

    it("finds ideas by keyword in description", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Innovation", "Uses artificial intelligence for predictions");

      const results = searchIdeas("artificial");
      expect(results.length).toBe(1);
    });

    it("finds ideas by tag", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Tagged Idea", "desc", { tags: ["ai", "ml"] });

      const results = searchIdeas("ai");
      expect(results.length).toBe(1);
    });

    it("only returns public ideas", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Public Idea", "desc", { visibility: "public" });
      shareIdea("alice", "Private Idea", "desc", { visibility: "private" });

      const results = searchIdeas("Idea");
      expect(results.every((i) => i.visibility === "public")).toBe(true);
    });

    it("respects limit parameter", () => {
      getProfile("alice", "Alice");
      for (let i = 0; i < 5; i++) {
        shareIdea("alice", `Test Idea ${i}`, "desc");
      }
      const results = searchIdeas("Test", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe("clearSocialData", () => {
    it("clears all data", () => {
      getProfile("alice", "Alice");
      shareIdea("alice", "Idea", "desc");
      clearSocialData();
      expect(getGlobalFeed()).toHaveLength(0);
      expect(searchIdeas("Idea")).toHaveLength(0);
    });
  });
});
