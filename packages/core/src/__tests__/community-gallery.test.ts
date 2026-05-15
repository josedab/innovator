/**
 * Tests for the Innovation Marketplace community gallery module.
 */
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  publishToGallery,
  getGalleryItem,
  updateGalleryItem,
  searchGallery,
  getTrendingItems,
  getFeaturedItems,
  forkGalleryItem,
  starItem,
  unstarItem,
  addComment,
  getComments,
  flagItem,
  clearGallery,
} from "../marketplace/community-gallery.js";

beforeEach(() => {
  clearGallery();
});

describe("community-gallery", () => {
  describe("publish and retrieve", () => {
    it("publishes an item", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Custom Biomimicry Angle",
        description: "Innovation inspired by nature",
        author: { id: "author-1", name: "Jane", verified: true },
        content: { angleConfig: { name: "biomimicry" } },
        tags: ["biology", "innovation"],
      });

      expect(item.id).toMatch(/^gallery-/);
      expect(item.title).toBe("Custom Biomimicry Angle");
      expect(item.stars).toBe(0);
      expect(item.license).toBe("MIT");
    });

    it("retrieves an item by ID", () => {
      const created = publishToGallery({
        type: "workflow-template",
        title: "Test Template",
        description: "A test",
        author: { id: "a1", name: "Bob" },
        content: {},
      });

      const retrieved = getGalleryItem(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe("Test Template");
    });

    it("returns undefined for nonexistent ID", () => {
      expect(getGalleryItem("nonexistent")).toBeUndefined();
    });

    it("updates an item", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Original",
        description: "Original desc",
        author: { id: "a1", name: "Bob" },
        content: {},
      });

      const updated = updateGalleryItem(item.id, { title: "Updated Title", description: "New desc" });
      expect(updated!.title).toBe("Updated Title");
      expect(updated!.description).toBe("New desc");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      publishToGallery({ type: "angle", title: "AI Angle", description: "AI-powered", author: { id: "a1", name: "Alice" }, content: {}, tags: ["ai"] });
      publishToGallery({ type: "workflow-template", title: "Healthcare Workflow", description: "For healthcare", author: { id: "a2", name: "Bob" }, content: {}, tags: ["healthcare"] });
      publishToGallery({ type: "angle", title: "Climate Angle", description: "Climate innovation", author: { id: "a1", name: "Alice" }, content: {}, tags: ["climate", "sustainability"] });
    });

    it("searches by query", () => {
      const { items, total } = searchGallery({ query: "Healthcare" });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0].title).toBe("Healthcare Workflow");
    });

    it("searches by type", () => {
      const { items } = searchGallery({ type: "angle" });
      expect(items).toHaveLength(2);
    });

    it("searches by tags", () => {
      const { items } = searchGallery({ tags: ["sustainability"] });
      expect(items).toHaveLength(1);
    });

    it("searches by author", () => {
      const { items } = searchGallery({ author: "a1" });
      expect(items).toHaveLength(2);
    });

    it("paginates results", () => {
      const { items } = searchGallery({ limit: 2, offset: 0 });
      expect(items).toHaveLength(2);

      const { items: page2 } = searchGallery({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it("sorts by stars", () => {
      const { items } = searchGallery({ sortBy: "stars" });
      expect(items).toHaveLength(3);
    });
  });

  describe("fork/remix", () => {
    it("forks an item", () => {
      const original = publishToGallery({
        type: "angle",
        title: "Original Angle",
        description: "Base angle",
        author: { id: "a1", name: "Alice" },
        content: { config: "test" },
      });

      const forked = forkGalleryItem(original.id, { id: "a2", name: "Bob" });

      expect(forked).toBeDefined();
      expect(forked!.title).toContain("Fork");
      expect(forked!.forkedFrom).toBe(original.id);
      expect(forked!.author.id).toBe("a2");

      // Original should have incremented fork count
      expect(getGalleryItem(original.id)!.forks).toBe(1);
    });

    it("returns undefined for nonexistent item", () => {
      expect(forkGalleryItem("nonexistent", { id: "a1", name: "Bob" })).toBeUndefined();
    });
  });

  describe("stars", () => {
    it("stars an item", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      expect(starItem("u1", item.id)).toBe(true);
      expect(getGalleryItem(item.id)!.stars).toBe(1);
    });

    it("prevents double starring", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      starItem("u1", item.id);
      expect(starItem("u1", item.id)).toBe(false);
      expect(getGalleryItem(item.id)!.stars).toBe(1);
    });

    it("unstars an item", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      starItem("u1", item.id);
      expect(unstarItem("u1", item.id)).toBe(true);
      expect(getGalleryItem(item.id)!.stars).toBe(0);
    });

    it("returns false for starring nonexistent item", () => {
      expect(starItem("u1", "nonexistent")).toBe(false);
    });
  });

  describe("comments", () => {
    it("adds a comment", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      const comment = addComment({
        itemId: item.id,
        authorId: "u1",
        authorName: "Bob",
        content: "Great angle!",
      });

      expect(comment.id).toMatch(/^comment-/);
      expect(comment.content).toBe("Great angle!");
    });

    it("retrieves comments for an item", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      addComment({ itemId: item.id, authorId: "u1", authorName: "Bob", content: "Comment 1" });
      addComment({ itemId: item.id, authorId: "u2", authorName: "Charlie", content: "Comment 2" });

      const comments = getComments(item.id);
      expect(comments).toHaveLength(2);
    });

    it("supports threaded comments", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      const parent = addComment({ itemId: item.id, authorId: "u1", authorName: "Bob", content: "Parent" });
      const reply = addComment({ itemId: item.id, authorId: "u2", authorName: "Charlie", content: "Reply", parentId: parent.id });

      expect(reply.parentId).toBe(parent.id);
    });

    it("returns empty for item with no comments", () => {
      expect(getComments("no-comments")).toHaveLength(0);
    });
  });

  describe("moderation", () => {
    it("flags an item for review", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      expect(flagItem(item.id, "spam")).toBe(true);
      expect(getGalleryItem(item.id)!.status).toBe("under-review");
    });

    it("flagged items are excluded from search", () => {
      const item = publishToGallery({
        type: "angle",
        title: "Test",
        description: "Test",
        author: { id: "a1", name: "Alice" },
        content: {},
      });

      flagItem(item.id, "spam");
      const { items } = searchGallery();
      expect(items).toHaveLength(0);
    });
  });
});
