/**
 * @module marketplace/community-gallery
 *
 * Community gallery for sharing and discovering innovation content:
 * custom angles, workflow templates, vertical packs, and visualization themes.
 * Features trending/featured feeds, fork/remix, comment threads, and star ratings.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Gallery Item ----

export const GalleryItemTypeSchema = z.enum([
  "angle",
  "workflow-template",
  "vertical-pack",
  "visualization-theme",
  "scoring-rubric",
  "prompt-template",
]);
export type GalleryItemType = z.infer<typeof GalleryItemTypeSchema>;

export const GalleryItemSchema = z.object({
  id: z.string().max(200),
  type: GalleryItemTypeSchema,
  title: z.string().max(500),
  description: z.string().max(5000),
  author: z.object({
    id: z.string().max(200),
    name: z.string().max(200),
    avatarUrl: z.string().max(2000).optional(),
    verified: z.boolean().default(false),
  }),
  content: z.unknown(),
  tags: z.array(z.string().max(100)).max(20),
  stars: z.number().int().min(0).default(0),
  forks: z.number().int().min(0).default(0),
  downloads: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  premium: z.boolean().default(false),
  price: z.number().min(0).optional(),
  revenueSharePercent: z.number().min(0).max(100).default(70),
  license: z.enum(["MIT", "Apache-2.0", "GPL-3.0", "proprietary", "CC-BY-4.0"]).default("MIT"),
  forkedFrom: z.string().max(200).optional(),
  version: z.string().max(50).default("1.0.0"),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  status: z.enum(["published", "under-review", "rejected", "archived"]).default("published"),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type GalleryItem = z.infer<typeof GalleryItemSchema>;

// ---- Comments ----

export const CommentSchema = z.object({
  id: z.string().max(200),
  itemId: z.string().max(200),
  authorId: z.string().max(200),
  authorName: z.string().max(200),
  content: z.string().max(5000),
  parentId: z.string().max(200).optional(),
  likes: z.number().int().min(0).default(0),
  createdAt: z.string(),
  editedAt: z.string().optional(),
});
export type Comment = z.infer<typeof CommentSchema>;

// ---- Star ----

export const StarSchema = z.object({
  userId: z.string().max(200),
  itemId: z.string().max(200),
  starredAt: z.string(),
});
export type Star = z.infer<typeof StarSchema>;

// ---- In-Memory Stores ----

const galleryItems = new Map<string, GalleryItem>();
const comments = new Map<string, Comment[]>();
const stars = new Map<string, Star[]>();

// ---- Gallery CRUD ----

export function publishToGallery(input: {
  type: GalleryItemType;
  title: string;
  description: string;
  author: { id: string; name: string; avatarUrl?: string; verified?: boolean };
  content: unknown;
  tags?: string[];
  premium?: boolean;
  price?: number;
  license?: GalleryItem["license"];
}): GalleryItem {
  const now = new Date().toISOString();
  const item: GalleryItem = GalleryItemSchema.parse({
    id: `gallery-${randomUUID().slice(0, 12)}`,
    type: input.type,
    title: input.title,
    description: input.description,
    author: input.author,
    content: input.content,
    tags: input.tags ?? [],
    premium: input.premium ?? false,
    price: input.price,
    license: input.license ?? "MIT",
    publishedAt: now,
    updatedAt: now,
  });

  galleryItems.set(item.id, item);
  return item;
}

export function getGalleryItem(id: string): GalleryItem | undefined {
  return galleryItems.get(id);
}

export function updateGalleryItem(
  id: string,
  updates: Partial<Pick<GalleryItem, "title" | "description" | "content" | "tags" | "price">>
): GalleryItem | undefined {
  const item = galleryItems.get(id);
  if (!item) return undefined;

  if (updates.title) item.title = updates.title;
  if (updates.description) item.description = updates.description;
  if (updates.content !== undefined) item.content = updates.content;
  if (updates.tags) item.tags = updates.tags;
  if (updates.price !== undefined) item.price = updates.price;
  item.updatedAt = new Date().toISOString();

  return item;
}

// ---- Search & Discovery ----

export function searchGallery(options: {
  query?: string;
  type?: GalleryItemType;
  tags?: string[];
  author?: string;
  featured?: boolean;
  premium?: boolean;
  sortBy?: "stars" | "downloads" | "recent" | "trending";
  limit?: number;
  offset?: number;
} = {}): { items: GalleryItem[]; total: number } {
  let items = Array.from(galleryItems.values()).filter(
    (item) => item.status === "published" && item.visibility === "public"
  );

  if (options.query) {
    const q = options.query.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (options.type) {
    items = items.filter((item) => item.type === options.type);
  }

  if (options.tags && options.tags.length > 0) {
    const tagSet = new Set(options.tags.map((t) => t.toLowerCase()));
    items = items.filter((item) =>
      item.tags.some((t) => tagSet.has(t.toLowerCase()))
    );
  }

  if (options.author) {
    items = items.filter((item) => item.author.id === options.author);
  }

  if (options.featured !== undefined) {
    items = items.filter((item) => item.featured === options.featured);
  }

  if (options.premium !== undefined) {
    items = items.filter((item) => item.premium === options.premium);
  }

  // Sort
  switch (options.sortBy) {
    case "stars":
      items.sort((a, b) => b.stars - a.stars);
      break;
    case "downloads":
      items.sort((a, b) => b.downloads - a.downloads);
      break;
    case "trending":
      // Combine recency + stars for trending
      items.sort((a, b) => {
        const scoreA =
          a.stars * 2 +
          a.downloads +
          (Date.now() - new Date(a.publishedAt).getTime() < 7 * 86400000 ? 100 : 0);
        const scoreB =
          b.stars * 2 +
          b.downloads +
          (Date.now() - new Date(b.publishedAt).getTime() < 7 * 86400000 ? 100 : 0);
        return scoreB - scoreA;
      });
      break;
    case "recent":
    default:
      items.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
  }

  const total = items.length;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

export function getTrendingItems(limit: number = 10): GalleryItem[] {
  return searchGallery({ sortBy: "trending", limit }).items;
}

export function getFeaturedItems(limit: number = 6): GalleryItem[] {
  return searchGallery({ featured: true, limit }).items;
}

// ---- Fork / Remix ----

export function forkGalleryItem(
  itemId: string,
  author: { id: string; name: string; avatarUrl?: string; verified?: boolean }
): GalleryItem | undefined {
  const original = galleryItems.get(itemId);
  if (!original) return undefined;

  original.forks++;

  const forked = publishToGallery({
    type: original.type,
    title: `${original.title} (Fork)`,
    description: `Forked from ${original.author.name}'s "${original.title}"`,
    author,
    content: original.content,
    tags: [...original.tags, "fork"],
    license: original.license,
  });

  forked.forkedFrom = itemId;
  return forked;
}

// ---- Stars ----

export function starItem(userId: string, itemId: string): boolean {
  const item = galleryItems.get(itemId);
  if (!item) return false;

  const itemStars = stars.get(itemId) ?? [];
  if (itemStars.some((s) => s.userId === userId)) return false;

  itemStars.push({
    userId,
    itemId,
    starredAt: new Date().toISOString(),
  });
  stars.set(itemId, itemStars);
  item.stars = itemStars.length;
  return true;
}

export function unstarItem(userId: string, itemId: string): boolean {
  const item = galleryItems.get(itemId);
  if (!item) return false;

  const itemStars = stars.get(itemId) ?? [];
  const filtered = itemStars.filter((s) => s.userId !== userId);
  if (filtered.length === itemStars.length) return false;

  stars.set(itemId, filtered);
  item.stars = filtered.length;
  return true;
}

// ---- Comments ----

export function addComment(input: {
  itemId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId?: string;
}): Comment {
  const comment: Comment = CommentSchema.parse({
    id: `comment-${randomUUID().slice(0, 12)}`,
    itemId: input.itemId,
    authorId: input.authorId,
    authorName: input.authorName,
    content: input.content,
    parentId: input.parentId,
    createdAt: new Date().toISOString(),
  });

  const itemComments = comments.get(input.itemId) ?? [];
  itemComments.push(comment);
  comments.set(input.itemId, itemComments);
  return comment;
}

export function getComments(itemId: string): Comment[] {
  return comments.get(itemId) ?? [];
}

// ---- Moderation ----

export function flagItem(
  itemId: string,
  reason: string
): boolean {
  const item = galleryItems.get(itemId);
  if (!item) return false;
  item.status = "under-review";
  item.updatedAt = new Date().toISOString();
  return true;
}

// ---- Cleanup ----

export function clearGallery(): void {
  galleryItems.clear();
  comments.clear();
  stars.clear();
}
