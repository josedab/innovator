/**
 * @description Social sharing and collaboration features.
 */
export const runtime = "nodejs";

import {
  shareIdea,
  likeIdea,
  unlikeIdea,
  commentOnIdea,
  repostIdea,
  getTrendingIdeas,
  getGlobalFeed,
  getUserFeed,
  searchIdeas,
  getProfile,
  followUser,
  unfollowUser,
  publishStory,
  getStories,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ShareSchema = z.object({
  action: z.literal("share"),
  authorId: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  angleId: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  visibility: z.enum(["public", "team", "private"]).optional(),
});

const LikeSchema = z.object({
  action: z.literal("like"),
  userId: z.string().min(1).max(100),
  ideaId: z.string().min(1).max(100),
});

const UnlikeSchema = z.object({
  action: z.literal("unlike"),
  userId: z.string().min(1).max(100),
  ideaId: z.string().min(1).max(100),
});

const CommentSchema = z.object({
  action: z.literal("comment"),
  userId: z.string().min(1).max(100),
  userName: z.string().min(1).max(200),
  ideaId: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  parentId: z.string().max(100).nullable().optional(),
});

const FollowSchema = z.object({
  action: z.literal("follow"),
  followerId: z.string().min(1).max(100),
  targetId: z.string().min(1).max(100),
});

const UnfollowSchema = z.object({
  action: z.literal("unfollow"),
  followerId: z.string().min(1).max(100),
  targetId: z.string().min(1).max(100),
});

const RepostSchema = z.object({
  action: z.literal("repost"),
  userId: z.string().min(1).max(100),
  ideaId: z.string().min(1).max(100),
});

const StorySchema = z.object({
  action: z.literal("publish-story"),
  authorId: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  relatedIdeaIds: z.array(z.string().max(100)).max(20).optional(),
  tags: z.array(z.string().max(100)).max(10).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  ShareSchema,
  LikeSchema,
  UnlikeSchema,
  CommentSchema,
  FollowSchema,
  UnfollowSchema,
  RepostSchema,
  StorySchema,
]);

/**
 * Social network actions — share, like, comment, follow, repost, publish stories.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const data = parsed.data;
    let result: unknown;

    switch (data.action) {
      case "share":
        result = shareIdea(data.authorId, data.title, data.description, {
          angleId: data.angleId,
          tags: data.tags,
          visibility: data.visibility,
        });
        break;
      case "like":
        result = likeIdea(data.userId, data.ideaId);
        break;
      case "unlike":
        result = unlikeIdea(data.userId, data.ideaId);
        break;
      case "comment":
        result = commentOnIdea(
          data.userId,
          data.userName,
          data.ideaId,
          data.content,
          data.parentId ?? null
        );
        break;
      case "follow":
        followUser(data.followerId, data.targetId);
        result = { success: true };
        break;
      case "unfollow":
        unfollowUser(data.followerId, data.targetId);
        result = { success: true };
        break;
      case "repost":
        result = repostIdea(data.userId, data.ideaId);
        break;
      case "publish-story":
        result = publishStory(
          data.authorId,
          data.title,
          data.content,
          data.relatedIdeaIds,
          data.tags
        );
        break;
    }

    logger.info("Social action completed", {
      route: "/api/social",
      requestId,
      action: data.action,
      durationMs: Date.now() - startTime,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Social action error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/social",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Social action failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * GET — trending ideas, feed, search, profile, stories.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "trending";

  try {
    let result: unknown;

    switch (type) {
      case "trending":
        result = getTrendingIdeas(Number(url.searchParams.get("limit")) || 20);
        break;
      case "feed": {
        const userId = url.searchParams.get("userId");
        result = userId
          ? getUserFeed(userId, Number(url.searchParams.get("limit")) || 50)
          : getGlobalFeed(Number(url.searchParams.get("limit")) || 50);
        break;
      }
      case "search":
        result = searchIdeas(
          url.searchParams.get("q") ?? "",
          Number(url.searchParams.get("limit")) || 20
        );
        break;
      case "profile":
        result = getProfile(url.searchParams.get("userId") ?? "");
        break;
      case "stories":
        result = getStories(Number(url.searchParams.get("limit")) || 20);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Unknown type. Use: trending, feed, search, profile, stories" }),
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch social data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
