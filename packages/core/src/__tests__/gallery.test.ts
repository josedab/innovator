import { describe, it, expect, beforeEach } from "vitest";
import {
  publishToGallery,
  getGalleryListing,
  searchGallery,
  upvoteListing,
  addGalleryComment,
  getGalleryComments,
  forkGalleryListing,
  upsertContributorProfile,
  getContributorProfile,
  createFeaturedCollection,
  listFeaturedCollections,
  clearGallery,
} from "../gallery/index.js";
import type { GalleryListing, ContributorProfile } from "../gallery/index.js";

function makeListing(overrides: Partial<GalleryListing> = {}): GalleryListing {
  return {
    id: "test-listing-1",
    slug: "test-listing",
    title: "Test Investigation",
    subject: "AI in education",
    description: "An exploration of AI in education",
    category: "education",
    tags: ["ai", "education"],
    authorId: "user-1",
    authorName: "Test User",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    upvotes: 0,
    forkCount: 0,
    viewCount: 0,
    commentCount: 0,
    featured: false,
    ideaCount: 5,
    angleCount: 3,
    ...overrides,
  };
}

describe("gallery", () => {
  beforeEach(() => {
    clearGallery();
  });

  it("publishes and retrieves a listing", () => {
    const listing = publishToGallery(makeListing());
    const retrieved = getGalleryListing(listing.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.title).toBe("Test Investigation");
  });

  it("increments view count on retrieval", () => {
    publishToGallery(makeListing());
    getGalleryListing("test-listing-1");
    const listing = getGalleryListing("test-listing-1");
    expect(listing?.viewCount).toBe(2);
  });

  it("searches listings by query", () => {
    publishToGallery(makeListing({ id: "l1", title: "AI in healthcare" }));
    publishToGallery(makeListing({ id: "l2", title: "Blockchain finance" }));
    const results = searchGallery({ query: "healthcare" });
    expect(results.listings).toHaveLength(1);
    expect(results.listings[0].id).toBe("l1");
  });

  it("filters by category", () => {
    publishToGallery(makeListing({ id: "l1", category: "education" }));
    publishToGallery(makeListing({ id: "l2", category: "technology" }));
    const results = searchGallery({ category: "education" });
    expect(results.listings).toHaveLength(1);
  });

  it("handles upvoting and toggle", () => {
    publishToGallery(makeListing());
    expect(upvoteListing("test-listing-1", "user-2")).toBe(1);
    expect(upvoteListing("test-listing-1", "user-3")).toBe(2);
    // Toggle off
    expect(upvoteListing("test-listing-1", "user-2")).toBe(1);
  });

  it("returns -1 for upvoting non-existent listing", () => {
    expect(upvoteListing("nonexistent", "user-1")).toBe(-1);
  });

  it("adds and retrieves comments", () => {
    publishToGallery(makeListing());
    addGalleryComment({
      id: "comment-1",
      listingId: "test-listing-1",
      authorId: "user-2",
      authorName: "Commenter",
      content: "Great investigation!",
      createdAt: Date.now(),
    });
    const comments = getGalleryComments("test-listing-1");
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("Great investigation!");
  });

  it("forks a listing", () => {
    publishToGallery(makeListing());
    const forked = forkGalleryListing("test-listing-1", "user-2", "Forker");
    expect(forked).toBeTruthy();
    expect(forked?.forkedFrom).toBe("test-listing-1");
    expect(forked?.authorId).toBe("user-2");
    const original = getGalleryListing("test-listing-1");
    expect(original?.forkCount).toBe(1);
  });

  it("manages contributor profiles", () => {
    const profile: ContributorProfile = {
      userId: "user-1",
      displayName: "Test User",
      bio: "A tester",
      listingCount: 0,
      totalUpvotes: 0,
      totalForks: 0,
      joinedAt: Date.now(),
      badges: [],
    };
    upsertContributorProfile(profile);
    const retrieved = getContributorProfile("user-1");
    expect(retrieved?.displayName).toBe("Test User");
  });

  it("manages featured collections", () => {
    createFeaturedCollection({
      id: "collection-1",
      title: "Best of Week",
      description: "Top investigations",
      listingIds: ["l1", "l2"],
      curatedBy: "admin",
      createdAt: Date.now(),
    });
    const collections = listFeaturedCollections();
    expect(collections).toHaveLength(1);
    expect(collections[0].title).toBe("Best of Week");
  });

  describe("searchGallery sorting", () => {
    it("sortBy 'newest' returns date-descending", () => {
      publishToGallery(makeListing({ id: "old", createdAt: 1000 }));
      publishToGallery(makeListing({ id: "new", createdAt: 2000 }));
      const results = searchGallery({ sortBy: "newest" });
      expect(results.listings[0].id).toBe("new");
      expect(results.listings[1].id).toBe("old");
    });

    it("sortBy 'most-upvoted' returns vote-descending", () => {
      publishToGallery(makeListing({ id: "low", upvotes: 1 }));
      publishToGallery(makeListing({ id: "high", upvotes: 100 }));
      const results = searchGallery({ sortBy: "most-upvoted" });
      expect(results.listings[0].id).toBe("high");
      expect(results.listings[1].id).toBe("low");
    });
  });

  describe("searchGallery pagination", () => {
    it("offset and limit paginate correctly", () => {
      for (let i = 0; i < 5; i++) {
        publishToGallery(makeListing({ id: `l-${i}`, createdAt: i }));
      }
      const page1 = searchGallery({ sortBy: "newest", limit: 2, offset: 0 });
      const page2 = searchGallery({ sortBy: "newest", limit: 2, offset: 2 });
      expect(page1.listings).toHaveLength(2);
      expect(page2.listings).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.listings[0].id).not.toBe(page2.listings[0].id);
    });

    it("empty query returns all listings", () => {
      publishToGallery(makeListing({ id: "a" }));
      publishToGallery(makeListing({ id: "b" }));
      const results = searchGallery({});
      expect(results.total).toBe(2);
    });
  });

  describe("comments", () => {
    it("comment with parentId creates threaded reply", () => {
      publishToGallery(makeListing());
      addGalleryComment({
        id: "parent-1",
        listingId: "test-listing-1",
        authorId: "user-1",
        authorName: "User",
        content: "Top-level comment",
        createdAt: Date.now(),
      });
      addGalleryComment({
        id: "reply-1",
        listingId: "test-listing-1",
        authorId: "user-2",
        authorName: "Reply User",
        content: "A reply",
        createdAt: Date.now(),
        parentId: "parent-1",
      });
      const comments = getGalleryComments("test-listing-1");
      expect(comments).toHaveLength(2);
      const reply = comments.find((c) => c.id === "reply-1");
      expect(reply?.parentId).toBe("parent-1");
    });
  });

  describe("Zod schema validation", () => {
    it("rejects oversized strings", () => {
      expect(() => publishToGallery(makeListing({ title: "x".repeat(501) }))).toThrow();
    });
  });

  describe("trending score edge case", () => {
    it("0-view 0-upvote listing has low trending rank", () => {
      publishToGallery(
        makeListing({ id: "zero", upvotes: 0, viewCount: 0, forkCount: 0, commentCount: 0 })
      );
      publishToGallery(
        makeListing({ id: "active", upvotes: 10, viewCount: 100, forkCount: 5, commentCount: 20 })
      );
      const results = searchGallery({ sortBy: "trending" });
      // Active listing should rank higher than zero-engagement one
      expect(results.listings[0].id).toBe("active");
    });
  });
});
