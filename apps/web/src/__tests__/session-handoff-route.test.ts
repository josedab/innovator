import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", async () => {
  const { z: zod } = await import("zod");
  return {
    createBundle: vi.fn(),
    importSessionBundle: vi.fn(),
    getBundle: vi.fn(),
    listBundles: vi.fn(),
    deleteBundle: vi.fn(),
    shareBundle: vi.fn(),
    getShareInfo: vi.fn(),
    CreateBundleSchema: zod.object({
      subject: zod.string().min(1).max(500),
      model: zod.string().optional(),
      anglesUsed: zod.array(zod.string()).default([]),
      investigation: zod.record(zod.unknown()).nullable().default(null),
      angleResults: zod.array(zod.record(zod.unknown())).default([]),
      synthesis: zod.record(zod.unknown()).nullable().default(null),
      scores: zod.array(zod.record(zod.unknown())).default([]),
      tags: zod.array(zod.string().max(50)).max(20).default([]),
      includeHtml: zod.boolean().default(false),
    }),
    ImportBundleSchema: zod.object({
      version: zod.string(),
      id: zod.string(),
      exportedAt: zod.string(),
      metadata: zod.object({
        subject: zod.string(),
        model: zod.string().optional(),
        anglesUsed: zod.array(zod.string()),
        createdAt: zod.string(),
        duration: zod.number().optional(),
        exportedBy: zod.string().optional(),
        tags: zod.array(zod.string()).optional(),
      }),
      investigation: zod.record(zod.unknown()).nullable(),
      angleResults: zod.array(zod.record(zod.unknown())),
      synthesis: zod.record(zod.unknown()).nullable(),
      scores: zod.array(zod.record(zod.unknown())),
      renderedHtml: zod.string().optional(),
    }),
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET, POST } from "../app/api/session-handoff/route.js";
import {
  createBundle,
  importSessionBundle,
  getBundle,
  listBundles,
  deleteBundle,
  shareBundle,
} from "@innovator/core";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/session-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sampleBundle = {
  id: "bundle-123",
  version: "1.0.0",
  exportedAt: "2024-01-01T00:00:00Z",
  metadata: {
    subject: "AI Testing",
    anglesUsed: ["scamper"],
    createdAt: "2024-01-01T00:00:00Z",
  },
  investigation: null,
  angleResults: [],
  synthesis: null,
  scores: [],
};

describe("API /api/session-handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns list of bundles", async () => {
      vi.mocked(listBundles).mockReturnValue([sampleBundle] as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bundles).toEqual([sampleBundle]);
    });

    it("returns empty array when no bundles exist", async () => {
      vi.mocked(listBundles).mockReturnValue([] as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bundles).toEqual([]);
    });
  });

  // ---- POST action=export ----

  describe("POST action=export", () => {
    it("creates and returns a bundle", async () => {
      vi.mocked(createBundle).mockReturnValue(sampleBundle as never);

      const res = await POST(
        makePost({
          action: "export",
          subject: "AI Testing",
          anglesUsed: ["scamper"],
          investigation: null,
          angleResults: [],
          synthesis: null,
          scores: [],
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bundle).toEqual(sampleBundle);
      expect(body.bundle.id).toBe("bundle-123");
    });
  });

  // ---- POST action=import ----

  describe("POST action=import", () => {
    it("imports a valid bundle", async () => {
      vi.mocked(importSessionBundle).mockReturnValue(sampleBundle as never);

      const res = await POST(
        makePost({
          action: "import",
          bundle: sampleBundle,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.bundle).toEqual(sampleBundle);
    });
  });

  // ---- POST action=get ----

  describe("POST action=get", () => {
    it("returns bundle by id (200)", async () => {
      vi.mocked(getBundle).mockReturnValue(sampleBundle as never);

      const res = await POST(makePost({ action: "get", bundleId: "bundle-123" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bundle).toEqual(sampleBundle);
    });

    it("returns 404 for non-existent bundle", async () => {
      vi.mocked(getBundle).mockReturnValue(null as never);

      const res = await POST(makePost({ action: "get", bundleId: "nonexistent" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Bundle not found");
    });
  });

  // ---- POST action=list ----

  describe("POST action=list", () => {
    it("returns all bundles", async () => {
      vi.mocked(listBundles).mockReturnValue([sampleBundle] as never);

      const res = await POST(makePost({ action: "list" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bundles).toEqual([sampleBundle]);
    });
  });

  // ---- POST action=delete ----

  describe("POST action=delete", () => {
    it("deletes existing bundle (200)", async () => {
      vi.mocked(deleteBundle).mockReturnValue(true as never);

      const res = await POST(makePost({ action: "delete", bundleId: "bundle-123" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns success=false for non-existent bundle", async () => {
      vi.mocked(deleteBundle).mockReturnValue(false as never);

      const res = await POST(makePost({ action: "delete", bundleId: "nonexistent" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ---- POST action=share ----

  describe("POST action=share", () => {
    it("shares a bundle with expiry", async () => {
      vi.mocked(shareBundle).mockReturnValue({
        url: "http://localhost/share/abc",
        expiresAt: "2024-01-04T00:00:00Z",
      } as never);

      const res = await POST(
        makePost({ action: "share", bundleId: "bundle-123", expiresInHours: 72 })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.share.url).toContain("share");
      expect(shareBundle).toHaveBeenCalledWith("bundle-123", "http://localhost", 72);
    });

    it("returns 404 when bundle not found", async () => {
      vi.mocked(shareBundle).mockReturnValue(null as never);

      const res = await POST(
        makePost({ action: "share", bundleId: "nonexistent", expiresInHours: 24 })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Bundle not found");
    });

    it("rejects expiresInHours < 1", async () => {
      const res = await POST(
        makePost({ action: "share", bundleId: "bundle-123", expiresInHours: 0 })
      );
      expect(res.status).toBe(400);
    });

    it("rejects expiresInHours > 720", async () => {
      const res = await POST(
        makePost({ action: "share", bundleId: "bundle-123", expiresInHours: 721 })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- Error paths ----

  describe("POST error paths", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/session-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 for missing action", async () => {
      const res = await POST(makePost({ bundleId: "x" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      expect(body.details).toBeDefined();
    });

    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "purge" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing required fields (bundleId)", async () => {
      const res = await POST(makePost({ action: "get" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toBeDefined();
    });

    it("returns 400 for empty bundleId in delete", async () => {
      const res = await POST(makePost({ action: "delete", bundleId: "" }));
      expect(res.status).toBe(400);
    });
  });
});
