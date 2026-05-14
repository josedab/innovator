// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  searchPlugins: vi.fn(),
  getMarketplacePlugin: vi.fn(),
  getFeaturedPlugins: vi.fn(),
  getCategories: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  publishPlugin: vi.fn(),
  addReview: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/marketplace/route.js";
import {
  searchPlugins,
  getMarketplacePlugin,
  getFeaturedPlugins,
  getCategories,
  installMarketplacePlugin,
  publishPlugin,
  addReview,
} from "@innovator/core";
import { NextRequest } from "next/server";

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/marketplace");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: "GET" });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): NextRequest {
  return new NextRequest("http://localhost/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json{{",
  });
}

const fakePlugin = {
  id: "plugin-1",
  name: "Test Plugin",
  description: "A test plugin",
  category: "angle",
  version: "1.0.0",
  downloads: 100,
  rating: 4.5,
};

describe("API /api/marketplace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCategories).mockReturnValue(["angle", "exporter"]);
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns plugin by id (200)", async () => {
      vi.mocked(getMarketplacePlugin).mockReturnValue(fakePlugin);
      const req = makeGetRequest({ id: "plugin-1" }) as never;
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("plugin-1");
      expect(body.name).toBe("Test Plugin");
    });

    it("returns 404 for non-existent plugin id", async () => {
      vi.mocked(getMarketplacePlugin).mockReturnValue(undefined);
      const req = makeGetRequest({ id: "nonexistent" }) as never;
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Plugin not found");
    });

    it("returns featured plugins when featured=true", async () => {
      vi.mocked(getFeaturedPlugins).mockReturnValue([fakePlugin]);
      const req = makeGetRequest({ featured: "true" }) as never;
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plugins).toHaveLength(1);
      expect(body.categories).toBeDefined();
    });

    it("searches plugins with query, category, and sort", async () => {
      vi.mocked(searchPlugins).mockReturnValue([fakePlugin]);
      const req = makeGetRequest({ q: "test", category: "angle", sort: "rating" }) as never;
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plugins).toHaveLength(1);
      expect(vi.mocked(searchPlugins)).toHaveBeenCalledWith({
        query: "test",
        category: "angle",
        sortBy: "rating",
      });
    });

    it("returns all plugins with no params", async () => {
      vi.mocked(searchPlugins).mockReturnValue([]);
      const req = makeGetRequest() as never;
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plugins).toBeDefined();
      expect(body.categories).toBeDefined();
    });

    it("defaults sort to downloads", async () => {
      vi.mocked(searchPlugins).mockReturnValue([]);
      const req = makeGetRequest({ q: "test" }) as never;
      await GET(req);
      expect(vi.mocked(searchPlugins)).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "downloads" })
      );
    });
  });

  // ---- POST ----

  describe("POST", () => {
    it("returns 400 for invalid JSON body", async () => {
      const res = await POST(makeInvalidJsonRequest());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON");
    });

    describe("install action", () => {
      it("installs plugin successfully", async () => {
        vi.mocked(installMarketplacePlugin).mockReturnValue(fakePlugin);
        const res = await POST(makePostRequest({ action: "install", pluginId: "plugin-1" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.installed).toEqual(fakePlugin);
      });

      it("returns 404 for non-existent plugin", async () => {
        vi.mocked(installMarketplacePlugin).mockReturnValue(undefined);
        const res = await POST(makePostRequest({ action: "install", pluginId: "nonexistent" }));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("Plugin not found");
      });

      it("rejects install with empty pluginId", async () => {
        const res = await POST(makePostRequest({ action: "install", pluginId: "" }));
        expect(res.status).toBe(400);
      });
    });

    describe("publish action", () => {
      const validPublish = {
        action: "publish",
        name: "New Plugin",
        description: "A new plugin for innovation",
        category: "angle",
        source: "https://github.com/test/plugin",
        version: "1.0.0",
        author: { name: "Test Author" },
      };

      it("publishes plugin with valid data (201)", async () => {
        const published = { ...fakePlugin, id: "new-id" };
        vi.mocked(publishPlugin).mockReturnValue(published);
        const res = await POST(makePostRequest(validPublish));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.published).toBeDefined();
      });

      it("rejects publish with invalid category", async () => {
        const res = await POST(
          makePostRequest({ ...validPublish, category: "invalid-cat" }) as never
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("Invalid request");
      });

      it("rejects publish with name > 100 chars", async () => {
        const res = await POST(
          makePostRequest({ ...validPublish, name: "x".repeat(101) }) as never
        );
        expect(res.status).toBe(400);
      });

      it("rejects publish with missing name", async () => {
        const { name, ...noName } = validPublish;
        const res = await POST(makePostRequest(noName));
        expect(res.status).toBe(400);
      });

      it("rejects publish with missing description", async () => {
        const { description, ...noDesc } = validPublish;
        const res = await POST(makePostRequest(noDesc));
        expect(res.status).toBe(400);
      });

      it("rejects publish with missing source", async () => {
        const { source, ...noSource } = validPublish;
        const res = await POST(makePostRequest(noSource));
        expect(res.status).toBe(400);
      });

      it("accepts publish with optional tags", async () => {
        vi.mocked(publishPlugin).mockReturnValue(fakePlugin);
        const res = await POST(
          makePostRequest({ ...validPublish, tags: ["ai", "innovation"] }) as never
        );
        expect(res.status).toBe(201);
      });

      it("accepts all valid categories", async () => {
        vi.mocked(publishPlugin).mockReturnValue(fakePlugin);
        const categories = [
          "angle",
          "vertical-pack",
          "exporter",
          "validator",
          "visualizer",
          "integration",
        ];
        for (const category of categories) {
          const res = await POST(makePostRequest({ ...validPublish, category }) as never);
          expect(res.status).toBe(201);
        }
      });
    });

    describe("review action", () => {
      it("adds review with valid data", async () => {
        const review = { id: "r1", rating: 5, comment: "Great!" };
        vi.mocked(addReview).mockReturnValue(review);
        const res = await POST(
          makePostRequest({
            action: "review",
            pluginId: "plugin-1",
            authorName: "Author",
            rating: 5,
            comment: "Great plugin!",
          }) as never
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.review).toBeDefined();
      });

      it("returns 400 for non-existent plugin review", async () => {
        vi.mocked(addReview).mockReturnValue(undefined);
        const res = await POST(
          makePostRequest({
            action: "review",
            pluginId: "nonexistent",
            authorName: "Author",
            rating: 3,
            comment: "Comment",
          }) as never
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("not found");
      });

      it("rejects review with rating < 1", async () => {
        const res = await POST(
          makePostRequest({
            action: "review",
            pluginId: "p1",
            authorName: "A",
            rating: 0,
            comment: "Bad",
          }) as never
        );
        expect(res.status).toBe(400);
      });

      it("rejects review with rating > 5", async () => {
        const res = await POST(
          makePostRequest({
            action: "review",
            pluginId: "p1",
            authorName: "A",
            rating: 6,
            comment: "Too high",
          }) as never
        );
        expect(res.status).toBe(400);
      });

      it("rejects review with empty comment", async () => {
        const res = await POST(
          makePostRequest({
            action: "review",
            pluginId: "p1",
            authorName: "A",
            rating: 3,
            comment: "",
          }) as never
        );
        expect(res.status).toBe(400);
      });
    });

    describe("unknown action", () => {
      it("rejects unknown action", async () => {
        const res = await POST(
          makePostRequest({ action: "unknown-action", data: "test" }) as never
        );
        expect(res.status).toBe(400);
      });
    });
  });
});
