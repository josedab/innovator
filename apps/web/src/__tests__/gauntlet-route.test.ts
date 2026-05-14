import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  runGauntlet: vi.fn(),
  gauntletToMarkdown: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/gauntlet/route.js";
import { runGauntlet, gauntletToMarkdown } from "@innovator/core";

const mockRunGauntlet = vi.mocked(runGauntlet);
const mockGauntletToMarkdown = vi.mocked(gauntletToMarkdown);

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/gauntlet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/gauntlet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates required idea fields", async () => {
    const res = await POST(makePost({ idea: { title: "" } }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("runs gauntlet and returns JSON result", async () => {
    const mockResult = {
      id: "test-id",
      ideaTitle: "Test Idea",
      ideaDescription: "Description",
      attacks: [],
      survivabilityIndex: 75,
      transcript: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    mockRunGauntlet.mockResolvedValue(mockResult);

    const res = await POST(
      makePost({
        idea: { title: "Test Idea", description: "A test idea" },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.survivabilityIndex).toBe(75);
    expect(mockRunGauntlet).toHaveBeenCalledOnce();
  });

  it("returns markdown when format=markdown", async () => {
    mockRunGauntlet.mockResolvedValue({
      id: "test-id",
      ideaTitle: "Test",
      ideaDescription: "Desc",
      attacks: [],
      survivabilityIndex: 80,
      transcript: [],
      createdAt: "2026-01-01T00:00:00Z",
    });
    mockGauntletToMarkdown.mockReturnValue("# Gauntlet Report");

    const res = await POST(
      makePost({
        idea: { title: "Test", description: "Desc" },
        format: "markdown",
      })
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Gauntlet Report");
  });

  it("passes adversaries and strengthen config", async () => {
    mockRunGauntlet.mockResolvedValue({
      id: "id",
      ideaTitle: "T",
      ideaDescription: "D",
      attacks: [],
      survivabilityIndex: 90,
      transcript: [],
      createdAt: "2026-01-01T00:00:00Z",
    });

    await POST(
      makePost({
        idea: { title: "T", description: "D" },
        adversaries: ["skeptic", "economist"],
        strengthen: true,
        model: "gpt-5",
      })
    );

    expect(mockRunGauntlet).toHaveBeenCalledWith(
      expect.objectContaining({ title: "T" }),
      expect.objectContaining({
        adversaries: ["skeptic", "economist"],
        strengthen: true,
        model: "gpt-5",
      })
    );
  });

  it("returns 500 on gauntlet failure", async () => {
    mockRunGauntlet.mockRejectedValue(new Error("LLM timeout"));
    const res = await POST(
      makePost({
        idea: { title: "Test", description: "Desc" },
      })
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("LLM timeout");
  });
});
