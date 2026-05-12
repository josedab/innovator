import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  shareInvestigation: vi.fn(),
  getSharedInvestigation: vi.fn(),
  listSharedInvestigations: vi.fn(),
  forkInvestigation: vi.fn(),
  buildShareUrl: vi.fn(),
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

import { GET, POST } from "../app/api/share/route.js";
import { shareInvestigation, listSharedInvestigations, buildShareUrl } from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonPost(): Request {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{",
  });
}

describe("API /api/share", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- POST ----

  describe("POST", () => {
    it("creates share link with valid subject", async () => {
      vi.mocked(shareInvestigation).mockReturnValue({
        slug: "abc-123",
        subject: "Test Subject",
        createdAt: "2025-01-01T00:00:00Z",
      } as never);
      vi.mocked(buildShareUrl).mockReturnValue("https://innovator.dev/share/abc-123");

      const res = await POST(makePostRequest({ subject: "Test Subject" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slug).toBe("abc-123");
      expect(body.shareUrl).toBe("https://innovator.dev/share/abc-123");
    });

    it("creates share with optional fields (title, isPublic, expiresInDays)", async () => {
      vi.mocked(shareInvestigation).mockReturnValue({
        slug: "def-456",
        subject: "Test",
        title: "My Title",
        createdAt: "2025-01-01T00:00:00Z",
      } as never);
      vi.mocked(buildShareUrl).mockReturnValue("https://innovator.dev/share/def-456");

      const res = await POST(
        makePostRequest({
          subject: "Test",
          title: "My Title",
          isPublic: false,
          expiresInDays: 30,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slug).toBe("def-456");
      expect(vi.mocked(shareInvestigation)).toHaveBeenCalledWith(
        "Test",
        expect.any(Object),
        expect.objectContaining({ title: "My Title", isPublic: false, expiresInDays: 30 })
      );
    });

    it("rejects missing subject", async () => {
      const res = await POST(makePostRequest({}));
      expect(res.status).toBe(400);
    });

    it("rejects empty subject", async () => {
      const res = await POST(makePostRequest({ subject: "" }));
      expect(res.status).toBe(400);
    });

    it("rejects subject > 500 chars", async () => {
      const res = await POST(makePostRequest({ subject: "x".repeat(501) }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid JSON body", async () => {
      const res = await POST(makeInvalidJsonPost());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("rejects invalid content-type", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported content type" }), { status: 415 })
      );
      const res = await POST(makePostRequest({ subject: "Test" }));
      expect(res.status).toBe(415);
    });

    it("rejects expiresInDays < 1", async () => {
      const res = await POST(makePostRequest({ subject: "Test", expiresInDays: 0 }));
      expect(res.status).toBe(400);
    });

    it("rejects expiresInDays > 365", async () => {
      const res = await POST(makePostRequest({ subject: "Test", expiresInDays: 366 }));
      expect(res.status).toBe(400);
    });

    it("returns 500 when shareInvestigation throws", async () => {
      vi.mocked(shareInvestigation).mockImplementation(() => {
        throw new Error("Storage error");
      });
      const res = await POST(makePostRequest({ subject: "Test" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Failed to create share link");
    });

    it("uses origin header for share URL base", async () => {
      vi.mocked(shareInvestigation).mockReturnValue({ slug: "s1" } as never);
      vi.mocked(buildShareUrl).mockReturnValue("https://custom.com/share/s1");

      const req = new Request("http://localhost/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://custom.com",
        },
        body: JSON.stringify({ subject: "Test" }),
      });
      await POST(req);
      expect(vi.mocked(buildShareUrl)).toHaveBeenCalledWith("s1", "https://custom.com");
    });

    it("handles unicode in subject and title", async () => {
      vi.mocked(shareInvestigation).mockReturnValue({ slug: "uni" } as never);
      vi.mocked(buildShareUrl).mockReturnValue("https://innovator.dev/share/uni");

      const res = await POST(makePostRequest({ subject: "人工智能创新", title: "日本語テスト" }));
      expect(res.status).toBe(200);
    });

    it("passes x-request-id header for logging", async () => {
      vi.mocked(shareInvestigation).mockReturnValue({ slug: "s1" } as never);
      vi.mocked(buildShareUrl).mockReturnValue("https://innovator.dev/share/s1");

      const req = new Request("http://localhost/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-123",
        },
        body: JSON.stringify({ subject: "Test" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns list of public shared investigations", async () => {
      vi.mocked(listSharedInvestigations).mockReturnValue([
        { slug: "s1", subject: "Test 1" },
        { slug: "s2", subject: "Test 2" },
      ] as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.investigations).toHaveLength(2);
    });

    it("returns empty list when no shared investigations", async () => {
      vi.mocked(listSharedInvestigations).mockReturnValue([] as never);
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.investigations).toEqual([]);
    });

    it("returns 500 when listSharedInvestigations throws", async () => {
      vi.mocked(listSharedInvestigations).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await GET();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Failed to list");
    });
  });
});
