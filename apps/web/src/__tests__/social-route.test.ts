import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  shareIdea: vi.fn(),
  likeIdea: vi.fn(),
  unlikeIdea: vi.fn(),
  commentOnIdea: vi.fn(),
  repostIdea: vi.fn(),
  getTrendingIdeas: vi.fn(),
  getGlobalFeed: vi.fn(),
  getUserFeed: vi.fn(),
  searchIdeas: vi.fn(),
  getProfile: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  publishStory: vi.fn(),
  getStories: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/social/route.js";
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
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/social");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("API /api/social", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- POST: share ----

  describe("POST share", () => {
    it("shares an idea successfully", async () => {
      vi.mocked(shareIdea).mockReturnValue({
        id: "idea-1",
        title: "Great Idea",
      } as never);
      const res = await POST(
        makePost({
          action: "share",
          authorId: "user-1",
          title: "Great Idea",
          description: "A wonderful idea",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("idea-1");
      expect(shareIdea).toHaveBeenCalledWith("user-1", "Great Idea", "A wonderful idea", {
        angleId: undefined,
        tags: undefined,
        visibility: undefined,
      });
    });

    it("shares with optional fields", async () => {
      vi.mocked(shareIdea).mockReturnValue({ id: "idea-2" } as never);
      const res = await POST(
        makePost({
          action: "share",
          authorId: "user-1",
          title: "Tagged Idea",
          description: "Description",
          angleId: "scamper",
          tags: ["AI", "ML"],
          visibility: "team",
        })
      );
      expect(res.status).toBe(200);
      expect(shareIdea).toHaveBeenCalledWith("user-1", "Tagged Idea", "Description", {
        angleId: "scamper",
        tags: ["AI", "ML"],
        visibility: "team",
      });
    });

    it("returns 400 for missing authorId", async () => {
      const res = await POST(
        makePost({
          action: "share",
          title: "No Author",
          description: "Missing",
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing title", async () => {
      const res = await POST(
        makePost({
          action: "share",
          authorId: "user-1",
          description: "No title",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: like / unlike ----

  describe("POST like/unlike", () => {
    it("likes an idea", async () => {
      vi.mocked(likeIdea).mockReturnValue({ likes: 5 } as never);
      const res = await POST(
        makePost({ action: "like", userId: "user-1", ideaId: "idea-1" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.likes).toBe(5);
    });

    it("unlikes an idea", async () => {
      vi.mocked(unlikeIdea).mockReturnValue({ likes: 4 } as never);
      const res = await POST(
        makePost({ action: "unlike", userId: "user-1", ideaId: "idea-1" })
      );
      expect(res.status).toBe(200);
      expect(unlikeIdea).toHaveBeenCalledWith("user-1", "idea-1");
    });
  });

  // ---- POST: comment ----

  describe("POST comment", () => {
    it("comments on an idea", async () => {
      vi.mocked(commentOnIdea).mockReturnValue({ id: "c-1", content: "Nice!" } as never);
      const res = await POST(
        makePost({
          action: "comment",
          userId: "user-1",
          userName: "Test User",
          ideaId: "idea-1",
          content: "Nice!",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toBe("Nice!");
    });

    it("supports nested comments with parentId", async () => {
      vi.mocked(commentOnIdea).mockReturnValue({ id: "c-2", parentId: "c-1" } as never);
      const res = await POST(
        makePost({
          action: "comment",
          userId: "user-1",
          userName: "Test User",
          ideaId: "idea-1",
          content: "Reply!",
          parentId: "c-1",
        })
      );
      expect(res.status).toBe(200);
      expect(commentOnIdea).toHaveBeenCalledWith("user-1", "Test User", "idea-1", "Reply!", "c-1");
    });

    it("passes null parentId when not provided", async () => {
      vi.mocked(commentOnIdea).mockReturnValue({ id: "c-3" } as never);
      await POST(
        makePost({
          action: "comment",
          userId: "user-1",
          userName: "Test User",
          ideaId: "idea-1",
          content: "Top-level",
        })
      );
      expect(commentOnIdea).toHaveBeenCalledWith("user-1", "Test User", "idea-1", "Top-level", null);
    });
  });

  // ---- POST: follow / unfollow ----

  describe("POST follow/unfollow", () => {
    it("follows a user", async () => {
      const res = await POST(
        makePost({ action: "follow", followerId: "user-1", targetId: "user-2" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(followUser).toHaveBeenCalledWith("user-1", "user-2");
    });

    it("unfollows a user", async () => {
      const res = await POST(
        makePost({ action: "unfollow", followerId: "user-1", targetId: "user-2" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(unfollowUser).toHaveBeenCalledWith("user-1", "user-2");
    });
  });

  // ---- POST: repost ----

  describe("POST repost", () => {
    it("reposts an idea", async () => {
      vi.mocked(repostIdea).mockReturnValue({ repostId: "r-1" } as never);
      const res = await POST(
        makePost({ action: "repost", userId: "user-1", ideaId: "idea-1" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.repostId).toBe("r-1");
    });
  });

  // ---- POST: publish-story ----

  describe("POST publish-story", () => {
    it("publishes a story", async () => {
      vi.mocked(publishStory).mockReturnValue({ id: "story-1", title: "My Story" } as never);
      const res = await POST(
        makePost({
          action: "publish-story",
          authorId: "user-1",
          title: "My Story",
          content: "Story content here.",
          relatedIdeaIds: ["idea-1"],
          tags: ["innovation"],
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("My Story");
      expect(publishStory).toHaveBeenCalledWith(
        "user-1", "My Story", "Story content here.", ["idea-1"], ["innovation"]
      );
    });
  });

  // ---- POST: validation errors ----

  describe("POST validation errors", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "unknown-action" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns content-type error when validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makePost({ action: "like", userId: "u", ideaId: "i" }));
      expect(res.status).toBe(415);
    });

    it("returns 500 on internal error", async () => {
      vi.mocked(shareIdea).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await POST(
        makePost({
          action: "share",
          authorId: "user-1",
          title: "Fail",
          description: "Error",
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Social action failed");
    });
  });

  // ---- GET ----

  describe("GET trending", () => {
    it("returns trending ideas by default", async () => {
      vi.mocked(getTrendingIdeas).mockReturnValue([{ id: "t1" }] as never);
      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(getTrendingIdeas).toHaveBeenCalledWith(20);
    });

    it("respects limit param", async () => {
      vi.mocked(getTrendingIdeas).mockReturnValue([] as never);
      await GET(makeGet({ type: "trending", limit: "5" }));
      expect(getTrendingIdeas).toHaveBeenCalledWith(5);
    });
  });

  describe("GET feed", () => {
    it("returns global feed without userId", async () => {
      vi.mocked(getGlobalFeed).mockReturnValue([{ id: "f1" }] as never);
      const res = await GET(makeGet({ type: "feed" }));
      expect(res.status).toBe(200);
      expect(getGlobalFeed).toHaveBeenCalledWith(50);
    });

    it("returns user feed with userId", async () => {
      vi.mocked(getUserFeed).mockReturnValue([{ id: "f2" }] as never);
      const res = await GET(makeGet({ type: "feed", userId: "user-1" }));
      expect(res.status).toBe(200);
      expect(getUserFeed).toHaveBeenCalledWith("user-1", 50);
    });
  });

  describe("GET search", () => {
    it("searches ideas", async () => {
      vi.mocked(searchIdeas).mockReturnValue([{ id: "s1" }] as never);
      const res = await GET(makeGet({ type: "search", q: "AI" }));
      expect(res.status).toBe(200);
      expect(searchIdeas).toHaveBeenCalledWith("AI", 20);
    });
  });

  describe("GET profile", () => {
    it("returns user profile", async () => {
      vi.mocked(getProfile).mockReturnValue({ userId: "user-1", name: "Test" } as never);
      const res = await GET(makeGet({ type: "profile", userId: "user-1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("user-1");
    });
  });

  describe("GET stories", () => {
    it("returns stories", async () => {
      vi.mocked(getStories).mockReturnValue([{ id: "st1" }] as never);
      const res = await GET(makeGet({ type: "stories" }));
      expect(res.status).toBe(200);
      expect(getStories).toHaveBeenCalledWith(20);
    });
  });

  describe("GET error handling", () => {
    it("returns 400 for unknown type", async () => {
      const res = await GET(makeGet({ type: "invalid" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Unknown type");
    });

    it("returns 500 on internal error", async () => {
      vi.mocked(getTrendingIdeas).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await GET(makeGet());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Failed to fetch");
    });
  });
});
