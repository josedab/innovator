import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  shareInvestigation: vi.fn(),
  listSharedInvestigations: vi.fn(),
  getSharedInvestigation: vi.fn(),
  forkInvestigation: vi.fn(),
  buildShareUrl: vi.fn(),
}));

import { shareInvestigation, listSharedInvestigations, buildShareUrl } from "@innovator/core";
import { GET, POST } from "../share/route";

const mockShareInvestigation = vi.mocked(shareInvestigation);
const mockListShared = vi.mocked(listSharedInvestigations);
const mockBuildShareUrl = vi.mocked(buildShareUrl);

function makePostRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShareInvestigation.mockReturnValue({ slug: "abc123" } as any);
    mockBuildShareUrl.mockReturnValue("https://innovator.dev/share/abc123");
  });

  it("returns 200 with slug and shareUrl for valid body", async () => {
    const res = await POST(makePostRequest({ subject: "AI Innovation" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slug).toBe("abc123");
    expect(data.shareUrl).toBe("https://innovator.dev/share/abc123");
  });

  it("returns 400 for missing subject", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 415 for non-JSON Content-Type", async () => {
    const req = new Request("http://localhost/api/share", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 400 for subject > 500 chars", async () => {
    const res = await POST(makePostRequest({ subject: "x".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for expiresInDays outside 1-365", async () => {
    const res = await POST(makePostRequest({ subject: "test", expiresInDays: 0 }));
    expect(res.status).toBe(400);

    const res2 = await POST(makePostRequest({ subject: "test", expiresInDays: 366 }));
    expect(res2.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts empty angleResults", async () => {
    const res = await POST(makePostRequest({ subject: "test", angleResults: [] }));
    expect(res.status).toBe(200);
  });

  it("passes isPublic=false to core", async () => {
    const res = await POST(makePostRequest({ subject: "test", isPublic: false }));
    expect(res.status).toBe(200);
    expect(mockShareInvestigation).toHaveBeenCalledWith(
      "test",
      expect.anything(),
      expect.objectContaining({ isPublic: false })
    );
  });

  it("returns 500 when core function throws", async () => {
    mockShareInvestigation.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await POST(makePostRequest({ subject: "test" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Failed to create share link");
  });
});

describe("GET /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public investigations", async () => {
    mockListShared.mockReturnValue([{ slug: "abc" }] as any);
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toHaveLength(1);
  });

  it("returns 500 when core function throws", async () => {
    mockListShared.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
