import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  exportToMarkdown: vi.fn().mockReturnValue("# Markdown Export\n\nContent here"),
  exportToJson: vi.fn().mockReturnValue({ subject: "test", ideas: [] }),
  exportToClipboard: vi.fn().mockReturnValue("Clipboard text content"),
  generateGitHubIssueBody: vi.fn().mockReturnValue({ title: "Issue", body: "Body" }),
  exportToPowerPoint: vi.fn(),
  exportToJira: vi.fn(),
  exportToConfluence: vi.fn(),
  exportToNotion: vi.fn(),
  exportToGoogleSlides: vi.fn(),
  getAvailableFormats: vi.fn(() => []),
}));

import {
  exportToMarkdown,
  exportToJson,
  exportToClipboard,
  generateGitHubIssueBody,
} from "@innovator/core";
import { POST } from "../export/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_DATA = {
  subject: "Solar Energy",
  angleResults: [
    {
      angleId: "scamper",
      ideas: [{ title: "Flexible Panels", description: "Bendable solar" }],
    },
  ],
  synthesis: { topIdeas: [], themes: ["clean energy"], recommendation: "Go solar" },
};

describe("POST /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns markdown content for format=markdown", async () => {
    const res = await POST(makeRequest({ format: "markdown", data: VALID_DATA }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toContain("Markdown Export");
    expect(exportToMarkdown).toHaveBeenCalledTimes(1);
    expect(exportToMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Solar Energy" })
    );
  });

  it("returns JSON content for format=json", async () => {
    const res = await POST(makeRequest({ format: "json", data: VALID_DATA }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(exportToJson).toHaveBeenCalledTimes(1);
    expect(exportToJson).toHaveBeenCalledWith(expect.objectContaining({ subject: "Solar Energy" }));
  });

  it("returns clipboard content for format=clipboard", async () => {
    const res = await POST(makeRequest({ format: "clipboard", data: VALID_DATA }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.content).toBe("Clipboard text content");
    expect(exportToClipboard).toHaveBeenCalledTimes(1);
  });

  it("returns github issue content for format=github-issue", async () => {
    const res = await POST(makeRequest({ format: "github-issue", data: VALID_DATA }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.title).toBe("Issue");
    expect(generateGitHubIssueBody).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid format", async () => {
    const res = await POST(makeRequest({ format: "pdf", data: VALID_DATA }));
    expect(res.status).toBe(400);
    // No export function should be called for invalid format
    expect(exportToMarkdown).not.toHaveBeenCalled();
    expect(exportToJson).not.toHaveBeenCalled();
    expect(exportToClipboard).not.toHaveBeenCalled();
    expect(generateGitHubIssueBody).not.toHaveBeenCalled();
  });

  it("returns 400 for missing data.subject", async () => {
    const res = await POST(
      makeRequest({
        format: "markdown",
        data: { angleResults: [] },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid export request");
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 500 on internal error", async () => {
    vi.mocked(exportToMarkdown).mockImplementationOnce(() => {
      throw new Error("Internal failure");
    });
    const res = await POST(makeRequest({ format: "markdown", data: VALID_DATA }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Export failed");
  });

  it("handles empty angleResults array", async () => {
    const res = await POST(
      makeRequest({
        format: "markdown",
        data: { subject: "Test", angleResults: [] },
      })
    );
    expect(res.status).toBe(200);
  });

  it("handles missing optional synthesis", async () => {
    const res = await POST(
      makeRequest({
        format: "json",
        data: { subject: "Test", angleResults: [] },
      })
    );
    expect(res.status).toBe(200);
  });
});
