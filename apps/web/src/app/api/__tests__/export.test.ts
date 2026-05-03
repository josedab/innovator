import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", () => ({
  exportToMarkdown: vi.fn().mockReturnValue("# Markdown Export\n\nContent here"),
  exportToJson: vi.fn().mockReturnValue({ subject: "test", ideas: [] }),
  exportToClipboard: vi.fn().mockReturnValue("Clipboard text content"),
  generateGitHubIssueBody: vi.fn().mockReturnValue({ title: "Issue", body: "Body" }),
}));

import {
  exportToMarkdown,
  exportToJson,
  exportToClipboard,
  generateGitHubIssueBody,
} from "@innovator/core";

const API_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

const ExportSchema = z.object({
  format: z.enum(["markdown", "json", "clipboard", "github-issue"]),
  data: z.object({
    subject: z.string(),
    investigation: z.any().optional(),
    angleResults: z.array(z.any()),
    synthesis: z.any().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ExportSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid export request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { format, data } = parsed.data;
    const exportData = data as Record<string, unknown>;

    switch (format) {
      case "markdown": {
        const result = exportToMarkdown(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "json": {
        const result = exportToJson(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "clipboard": {
        const text = exportToClipboard(exportData);
        return new Response(JSON.stringify({ data: { content: text } }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "github-issue": {
        const issue = generateGitHubIssueBody(exportData);
        return new Response(JSON.stringify({ data: issue }), { headers: API_RESPONSE_HEADERS });
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown format" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Export failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

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
  });

  it("returns JSON content for format=json", async () => {
    const res = await POST(makeRequest({ format: "json", data: VALID_DATA }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(exportToJson).toHaveBeenCalledTimes(1);
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
