import { z } from "zod";

/** A user profile in the innovation social network. */
export const SocialProfileSchema = z.object({
  userId: z.string().max(100),
  displayName: z.string().max(200),
  bio: z.string().max(1000).optional(),
  avatarUrl: z.string().max(500).optional(),
  following: z.array(z.string().max(100)),
  followers: z.array(z.string().max(100)),
  ideaCount: z.number().min(0),
  likeCount: z.number().min(0),
  joinedAt: z.string(),
});
export type SocialProfile = z.infer<typeof SocialProfileSchema>;

/** A shared innovation idea in the social network. */
export const SharedIdeaSchema = z.object({
  id: z.string().max(100),
  authorId: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  angleId: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).max(20),
  likes: z.array(z.string().max(100)),
  shares: z.number().min(0),
  comments: z.array(
    z.object({
      id: z.string().max(100),
      authorId: z.string().max(100),
      authorName: z.string().max(200),
      content: z.string().max(2000),
      parentId: z.string().max(100).nullable(),
      likes: z.array(z.string().max(100)),
      createdAt: z.string(),
    })
  ),
  visibility: z.enum(["public", "team", "private"]),
  trendingScore: z.number().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SharedIdea = z.infer<typeof SharedIdeaSchema>;

/** A social comment (threaded). */
export const SocialCommentSchema = z.object({
  id: z.string().max(100),
  authorId: z.string().max(100),
  authorName: z.string().max(200),
  content: z.string().max(2000),
  parentId: z.string().max(100).nullable(),
  likes: z.array(z.string().max(100)),
  createdAt: z.string(),
});
export type SocialComment = z.infer<typeof SocialCommentSchema>;

/** Activity feed event. */
export const FeedEventSchema = z.object({
  id: z.string().max(100),
  type: z.enum([
    "idea_shared",
    "idea_liked",
    "idea_commented",
    "idea_trending",
    "user_followed",
    "innovation_story",
  ]),
  actorId: z.string().max(100),
  actorName: z.string().max(200),
  targetId: z.string().max(100).optional(),
  targetTitle: z.string().max(500).optional(),
  content: z.string().max(1000).optional(),
  timestamp: z.string(),
});
export type FeedEvent = z.infer<typeof FeedEventSchema>;

/** Innovation story (longer-form narrative). */
export const InnovationStorySchema = z.object({
  id: z.string().max(100),
  authorId: z.string().max(100),
  title: z.string().max(500),
  content: z.string().max(10000),
  relatedIdeaIds: z.array(z.string().max(100)).max(20),
  tags: z.array(z.string().max(100)).max(10),
  likes: z.array(z.string().max(100)),
  publishedAt: z.string(),
});
export type InnovationStory = z.infer<typeof InnovationStorySchema>;

/** Trending idea with score breakdown. */
export const TrendingIdeaSchema = z.object({
  ideaId: z.string().max(100),
  title: z.string().max(500),
  authorName: z.string().max(200),
  trendingScore: z.number(),
  recentLikes: z.number(),
  recentComments: z.number(),
  recentShares: z.number(),
  velocity: z.number(),
});
export type TrendingIdea = z.infer<typeof TrendingIdeaSchema>;
