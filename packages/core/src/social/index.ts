/**
 * @module social
 *
 * Innovation social network with follow, like, share, trending,
 * threaded discussions, and innovation stories.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  SocialProfile,
  SharedIdea,
  SocialComment,
  FeedEvent,
  InnovationStory,
  TrendingIdea,
} from "./types.js";

export {
  SocialProfileSchema,
  SharedIdeaSchema,
  SocialCommentSchema,
  FeedEventSchema,
  InnovationStorySchema,
  TrendingIdeaSchema,
} from "./types.js";
export type {
  SocialProfile,
  SharedIdea,
  SocialComment,
  FeedEvent,
  InnovationStory,
  TrendingIdea,
} from "./types.js";

const SOCIAL_DIR = join(homedir(), ".innovator", "social");
const PROFILES_FILE = join(SOCIAL_DIR, "profiles.json");
const IDEAS_FILE = join(SOCIAL_DIR, "shared-ideas.json");
const FEED_FILE = join(SOCIAL_DIR, "feed.json");
const STORIES_FILE = join(SOCIAL_DIR, "stories.json");

function ensureDir(): void {
  if (!existsSync(SOCIAL_DIR)) mkdirSync(SOCIAL_DIR, { recursive: true });
}

function loadJson<T>(file: string, fallback: T): T {
  ensureDir();
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(file: string, data: unknown): void {
  ensureDir();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// ---- Profile Management ----

/** Get or create a social profile. */
export function getProfile(userId: string, displayName?: string): SocialProfile {
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);
  const existing = profiles.find((p) => p.userId === userId);
  if (existing) return existing;

  const profile: SocialProfile = {
    userId,
    displayName: displayName ?? userId,
    following: [],
    followers: [],
    ideaCount: 0,
    likeCount: 0,
    joinedAt: new Date().toISOString(),
  };
  profiles.push(profile);
  saveJson(PROFILES_FILE, profiles);
  return profile;
}

/** Follow a user. */
export function followUser(followerId: string, targetId: string): void {
  if (followerId === targetId) return;
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);

  const follower = profiles.find((p) => p.userId === followerId);
  const target = profiles.find((p) => p.userId === targetId);
  if (!follower || !target) return;

  if (!follower.following.includes(targetId)) {
    follower.following.push(targetId);
  }
  if (!target.followers.includes(followerId)) {
    target.followers.push(followerId);
  }

  saveJson(PROFILES_FILE, profiles);
  addFeedEvent({
    type: "user_followed",
    actorId: followerId,
    actorName: follower.displayName,
    targetId,
    targetTitle: target.displayName,
  });
}

/** Unfollow a user. */
export function unfollowUser(followerId: string, targetId: string): void {
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);

  const follower = profiles.find((p) => p.userId === followerId);
  const target = profiles.find((p) => p.userId === targetId);
  if (!follower || !target) return;

  follower.following = follower.following.filter((id) => id !== targetId);
  target.followers = target.followers.filter((id) => id !== followerId);
  saveJson(PROFILES_FILE, profiles);
}

// ---- Idea Sharing ----

/** Share an idea to the social network. */
export function shareIdea(
  authorId: string,
  title: string,
  description: string,
  options: { angleId?: string; tags?: string[]; visibility?: SharedIdea["visibility"] } = {}
): SharedIdea {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);
  const author = profiles.find((p) => p.userId === authorId);

  const idea: SharedIdea = {
    id: randomUUID(),
    authorId,
    title,
    description,
    angleId: options.angleId,
    tags: options.tags ?? [],
    likes: [],
    shares: 0,
    comments: [],
    visibility: options.visibility ?? "public",
    trendingScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ideas.push(idea);
  saveJson(IDEAS_FILE, ideas);

  if (author) {
    author.ideaCount++;
    saveJson(PROFILES_FILE, profiles);
  }

  addFeedEvent({
    type: "idea_shared",
    actorId: authorId,
    actorName: author?.displayName ?? authorId,
    targetId: idea.id,
    targetTitle: title,
  });

  return idea;
}

/** Like an idea. */
export function likeIdea(userId: string, ideaId: string): SharedIdea | undefined {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) return undefined;

  if (!idea.likes.includes(userId)) {
    idea.likes.push(userId);
    idea.trendingScore = computeTrendingScore(idea);
    idea.updatedAt = new Date().toISOString();
    saveJson(IDEAS_FILE, ideas);

    const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);
    const author = profiles.find((p) => p.userId === idea.authorId);
    if (author) {
      author.likeCount++;
      saveJson(PROFILES_FILE, profiles);
    }

    const actor = profiles.find((p) => p.userId === userId);
    addFeedEvent({
      type: "idea_liked",
      actorId: userId,
      actorName: actor?.displayName ?? userId,
      targetId: ideaId,
      targetTitle: idea.title,
    });
  }

  return idea;
}

/** Unlike an idea. */
export function unlikeIdea(userId: string, ideaId: string): SharedIdea | undefined {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) return undefined;

  idea.likes = idea.likes.filter((id) => id !== userId);
  idea.trendingScore = computeTrendingScore(idea);
  idea.updatedAt = new Date().toISOString();
  saveJson(IDEAS_FILE, ideas);
  return idea;
}

/** Add a threaded comment to an idea. */
export function commentOnIdea(
  userId: string,
  userName: string,
  ideaId: string,
  content: string,
  parentId: string | null = null
): SocialComment | undefined {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) return undefined;

  const comment: SocialComment = {
    id: randomUUID(),
    authorId: userId,
    authorName: userName,
    content,
    parentId,
    likes: [],
    createdAt: new Date().toISOString(),
  };

  idea.comments.push(comment);
  idea.trendingScore = computeTrendingScore(idea);
  idea.updatedAt = new Date().toISOString();
  saveJson(IDEAS_FILE, ideas);

  addFeedEvent({
    type: "idea_commented",
    actorId: userId,
    actorName: userName,
    targetId: ideaId,
    targetTitle: idea.title,
    content: content.slice(0, 200),
  });

  return comment;
}

/** Share (repost) an idea, incrementing the share count. */
export function repostIdea(userId: string, ideaId: string): SharedIdea | undefined {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) return undefined;

  idea.shares++;
  idea.trendingScore = computeTrendingScore(idea);
  idea.updatedAt = new Date().toISOString();
  saveJson(IDEAS_FILE, ideas);
  return idea;
}

// ---- Trending ----

function computeTrendingScore(idea: SharedIdea): number {
  const now = Date.now();
  const ageHours = (now - new Date(idea.createdAt).getTime()) / 3_600_000;
  const decay = Math.max(0.1, 1 / (1 + ageHours / 24)); // Half-life ~24h

  const engagement = idea.likes.length * 3 + idea.comments.length * 5 + idea.shares * 10;

  return Math.round(engagement * decay * 100) / 100;
}

/** Get trending ideas, sorted by trending score. */
export function getTrendingIdeas(limit: number = 20): TrendingIdea[] {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);

  const now = Date.now();
  const recentMs = 24 * 60 * 60 * 1000;

  return ideas
    .filter((i) => i.visibility === "public")
    .map((idea) => {
      const recentLikes = idea.likes.length; // Simplified: all likes count
      const recentComments = idea.comments.filter(
        (c) => now - new Date(c.createdAt).getTime() < recentMs
      ).length;
      const author = profiles.find((p) => p.userId === idea.authorId);

      return {
        ideaId: idea.id,
        title: idea.title,
        authorName: author?.displayName ?? idea.authorId,
        trendingScore: computeTrendingScore(idea),
        recentLikes,
        recentComments,
        recentShares: idea.shares,
        velocity: recentLikes + recentComments * 2 + idea.shares * 3,
      };
    })
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, limit);
}

// ---- Activity Feed ----

function addFeedEvent(event: Omit<FeedEvent, "id" | "timestamp">): void {
  const feed = loadJson<FeedEvent[]>(FEED_FILE, []);
  feed.unshift({
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  });

  // Keep last 500 events
  if (feed.length > 500) feed.length = 500;
  saveJson(FEED_FILE, feed);
}

/** Get the activity feed for a user (their own + followed users' activities). */
export function getUserFeed(userId: string, limit: number = 50): FeedEvent[] {
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);
  const profile = profiles.find((p) => p.userId === userId);
  const following = new Set(profile?.following ?? []);
  following.add(userId);

  const feed = loadJson<FeedEvent[]>(FEED_FILE, []);
  return feed.filter((e) => following.has(e.actorId)).slice(0, limit);
}

/** Get the global activity feed. */
export function getGlobalFeed(limit: number = 50): FeedEvent[] {
  return loadJson<FeedEvent[]>(FEED_FILE, []).slice(0, limit);
}

// ---- Innovation Stories ----

/** Publish an innovation story. */
export function publishStory(
  authorId: string,
  title: string,
  content: string,
  relatedIdeaIds: string[] = [],
  tags: string[] = []
): InnovationStory {
  const stories = loadJson<InnovationStory[]>(STORIES_FILE, []);
  const profiles = loadJson<SocialProfile[]>(PROFILES_FILE, []);
  const author = profiles.find((p) => p.userId === authorId);

  const story: InnovationStory = {
    id: randomUUID(),
    authorId,
    title,
    content,
    relatedIdeaIds,
    tags,
    likes: [],
    publishedAt: new Date().toISOString(),
  };

  stories.push(story);
  saveJson(STORIES_FILE, stories);

  addFeedEvent({
    type: "innovation_story",
    actorId: authorId,
    actorName: author?.displayName ?? authorId,
    targetId: story.id,
    targetTitle: title,
  });

  return story;
}

/** Get all published stories. */
export function getStories(limit: number = 20): InnovationStory[] {
  return loadJson<InnovationStory[]>(STORIES_FILE, [])
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

// ---- Search ----

/** Search shared ideas by keyword. */
export function searchIdeas(query: string, limit: number = 20): SharedIdea[] {
  const ideas = loadJson<SharedIdea[]>(IDEAS_FILE, []);
  const q = query.toLowerCase();
  return ideas
    .filter(
      (i) =>
        i.visibility === "public" &&
        (i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)))
    )
    .slice(0, limit);
}

/** Clear all social data (for testing). */
export function clearSocialData(): void {
  ensureDir();
  saveJson(PROFILES_FILE, []);
  saveJson(IDEAS_FILE, []);
  saveJson(FEED_FILE, []);
  saveJson(STORIES_FILE, []);
}
