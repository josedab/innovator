import { describe, it, expect, beforeEach } from "vitest";

import {
  getReputation,
  updateReputation,
  listTopCreators,
  addReview,
  getItemReviews,
  markReviewHelpful,
  publishPromptPack,
  getPromptPack,
  searchPromptPacks,
  downloadPromptPack,
  createCollection,
  getCollection,
  listCollections,
  addToCollection,
  viewCollection,
  clearMarketplaceExtData,
} from "../marketplace/reputation.js";

beforeEach(() => {
  clearMarketplaceExtData();
});

describe("Reputation", () => {
  it("creates a newcomer reputation by default", () => {
    const rep = getReputation("user-1");
    expect(rep.level).toBe("newcomer");
    expect(rep.score).toBe(0);
    expect(rep.totalPublished).toBe(0);
  });

  it("increases score on publish", () => {
    updateReputation("user-1", { type: "publish" });
    const rep = getReputation("user-1");
    expect(rep.score).toBe(10);
    expect(rep.totalPublished).toBe(1);
    expect(rep.level).toBe("contributor");
  });

  it("levels up based on activity", () => {
    for (let i = 0; i < 5; i++) {
      updateReputation("user-2", { type: "publish" });
    }
    expect(getReputation("user-2").level).toBe("trusted");

    for (let i = 0; i < 15; i++) {
      updateReputation("user-2", { type: "publish" });
    }
    expect(getReputation("user-2").level).toBe("expert");
  });

  it("tracks downloads and stars", () => {
    updateReputation("user-3", { type: "download" });
    updateReputation("user-3", { type: "download" });
    updateReputation("user-3", { type: "star" });
    const rep = getReputation("user-3");
    expect(rep.totalDownloads).toBe(2);
    expect(rep.totalStars).toBe(1);
    expect(rep.score).toBe(5); // 1+1+3
  });

  it("computes average rating", () => {
    updateReputation("user-4", { type: "review", value: 5 });
    updateReputation("user-4", { type: "review", value: 3 });
    const rep = getReputation("user-4");
    expect(rep.avgRating).toBe(4);
    expect(rep.reviewCount).toBe(2);
  });

  it("assigns badges", () => {
    for (let i = 0; i < 10; i++) {
      updateReputation("user-5", { type: "publish" });
    }
    const rep = getReputation("user-5");
    expect(rep.badges).toContain("prolific-publisher");
    expect(rep.badges).toContain("first-publish");
  });

  it("lists top creators", () => {
    updateReputation("high", { type: "publish" });
    updateReputation("high", { type: "publish" });
    updateReputation("low", { type: "download" });

    const top = listTopCreators(10);
    expect(top[0].creatorId).toBe("high");
  });
});

describe("Reviews", () => {
  it("adds and retrieves reviews", () => {
    const review = addReview({
      itemId: "item-1",
      reviewerId: "reviewer-1",
      rating: 5,
      title: "Great angle pack",
      body: "Very useful for brainstorming sessions.",
    });
    expect(review.id).toBeDefined();
    expect(review.rating).toBe(5);

    const reviews = getItemReviews("item-1");
    expect(reviews).toHaveLength(1);
  });

  it("marks reviews as helpful", () => {
    const review = addReview({
      itemId: "item-2",
      reviewerId: "r1",
      rating: 4,
      title: "Good",
      body: "Works well.",
    });

    expect(markReviewHelpful(review.id)).toBe(true);
    expect(markReviewHelpful(review.id)).toBe(true);
    expect(markReviewHelpful("nonexistent")).toBe(false);
  });
});

describe("Prompt Packs", () => {
  it("publishes and retrieves a prompt pack", () => {
    const pack = publishPromptPack({
      title: "Innovation Essentials",
      description: "Core prompts for innovation sessions",
      creatorId: "creator-1",
      version: "1.0.0",
      prompts: [
        {
          id: "p1",
          name: "Brainstorm Starter",
          template: "Generate 5 ideas for {{topic}}",
          variables: ["topic"],
        },
        {
          id: "p2",
          name: "First Principles",
          template: "Break down {{problem}} to first principles",
          variables: ["problem"],
          category: "analysis",
        },
      ],
      tags: ["innovation", "brainstorming"],
    });

    expect(pack.id).toBeDefined();
    expect(pack.prompts).toHaveLength(2);
    expect(pack.downloads).toBe(0);

    const retrieved = getPromptPack(pack.id);
    expect(retrieved?.title).toBe("Innovation Essentials");
  });

  it("updates creator reputation on publish", () => {
    publishPromptPack({
      title: "Pack 1",
      description: "D",
      creatorId: "c1",
      version: "1.0",
      prompts: [{ id: "p1", name: "P", template: "T", variables: [] }],
      tags: [],
    });
    const rep = getReputation("c1");
    expect(rep.totalPublished).toBe(1);
    expect(rep.score).toBeGreaterThan(0);
  });

  it("searches prompt packs by query", () => {
    publishPromptPack({
      title: "AI Innovation Pack",
      description: "AI-focused prompts",
      creatorId: "c1",
      version: "1.0",
      prompts: [{ id: "p1", name: "P", template: "T", variables: [] }],
      tags: ["ai"],
    });
    publishPromptPack({
      title: "Design Thinking Pack",
      description: "Design prompts",
      creatorId: "c2",
      version: "1.0",
      prompts: [{ id: "p1", name: "P", template: "T", variables: [] }],
      tags: ["design"],
    });

    const results = searchPromptPacks({ query: "AI" });
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain("AI");
  });

  it("filters by tags", () => {
    publishPromptPack({
      title: "Pack A",
      description: "D",
      creatorId: "c1",
      version: "1.0",
      prompts: [{ id: "p1", name: "P", template: "T", variables: [] }],
      tags: ["innovation", "ai"],
    });

    const results = searchPromptPacks({ tags: ["ai"] });
    expect(results).toHaveLength(1);
  });

  it("increments download count", () => {
    const pack = publishPromptPack({
      title: "DL Pack",
      description: "D",
      creatorId: "c1",
      version: "1.0",
      prompts: [{ id: "p1", name: "P", template: "T", variables: [] }],
      tags: [],
    });

    downloadPromptPack(pack.id);
    downloadPromptPack(pack.id);
    const updated = getPromptPack(pack.id);
    expect(updated?.downloads).toBe(2);
  });
});

describe("Curated Collections", () => {
  it("creates and retrieves a collection", () => {
    const collection = createCollection({
      title: "Best of Q4",
      description: "Top innovation assets from Q4",
      curatorId: "curator-1",
      itemIds: ["item-1", "item-2"],
      tags: ["quarterly", "best-of"],
    });

    expect(collection.id).toBeDefined();
    expect(collection.itemIds).toHaveLength(2);

    const retrieved = getCollection(collection.id);
    expect(retrieved?.title).toBe("Best of Q4");
  });

  it("adds items to collection", () => {
    const collection = createCollection({
      title: "My Collection",
      description: "D",
      curatorId: "c1",
      itemIds: [],
      tags: [],
    });

    expect(addToCollection(collection.id, "new-item")).toBe(true);
    expect(addToCollection(collection.id, "new-item")).toBe(false); // Duplicate
    expect(getCollection(collection.id)?.itemIds).toHaveLength(1);
  });

  it("increments view count", () => {
    const collection = createCollection({
      title: "Views Test",
      description: "D",
      curatorId: "c1",
      itemIds: [],
      tags: [],
    });

    viewCollection(collection.id);
    viewCollection(collection.id);
    expect(getCollection(collection.id)?.views).toBe(2);
  });

  it("lists collections with filtering", () => {
    createCollection({
      title: "Col A",
      description: "D",
      curatorId: "c1",
      itemIds: [],
      tags: ["ai"],
    });
    createCollection({
      title: "Col B",
      description: "D",
      curatorId: "c2",
      itemIds: [],
      tags: ["design"],
    });

    const byTag = listCollections({ tags: ["ai"] });
    expect(byTag).toHaveLength(1);

    const byCurator = listCollections({ curatorId: "c1" });
    expect(byCurator).toHaveLength(1);
  });
});
