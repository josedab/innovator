import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProcessFile = vi.fn().mockResolvedValue({
  fileId: "file-1",
  type: "image",
  extractedContext: "An image of a graph",
  suggestedSubject: "Data Visualization",
  confidence: 0.85,
  metadata: {},
});

const mockBuildPrompt = vi.fn().mockReturnValue("Combined prompt");

vi.mock("@innovator/core", () => ({
  UploadProcessor: class MockUploadProcessor {
    processFile = mockProcessFile;
    buildInnovationPrompt = mockBuildPrompt;
  },
  resolveFileType: vi.fn().mockReturnValue("document"),
  validateUploadedFile: vi.fn().mockReturnValue([]),
}));

import { validateUploadedFile } from "@innovator/core";
import { GET, POST } from "../upload/process/route";

const mockValidateUploadedFile = vi.mocked(validateUploadedFile);

describe("POST /api/upload/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateUploadedFile.mockReturnValue([]);
  });

  it("processes JSON body with valid file and returns results", async () => {
    const req = new Request("http://localhost/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            id: "file-1",
            filename: "chart.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            base64Content: "iVBOR...",
            uploadedAt: new Date().toISOString(),
          },
        ],
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].fileId).toBe("file-1");
    expect(data.results[0].confidence).toBe(0.85);
    expect(data.suggestedSubjects).toContain("Data Visualization");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [] }), // empty array fails min(1)
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("returns 400 for unsupported content type", async () => {
    const req = new Request("http://localhost/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unsupported content type");
  });

  it("returns 400 when file validation fails", async () => {
    mockValidateUploadedFile.mockReturnValue(["File too large"]);

    const req = new Request("http://localhost/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            id: "file-1",
            filename: "big.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            base64Content: "...",
            uploadedAt: new Date().toISOString(),
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("File validation failed");
    expect(data.validationErrors).toHaveLength(1);
    expect(data.validationErrors[0].filename).toBe("big.pdf");
  });

  it("processes multiple files in JSON body", async () => {
    const req = new Request("http://localhost/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          {
            id: "f1",
            filename: "a.png",
            mimeType: "image/png",
            sizeBytes: 512,
            base64Content: "...",
            uploadedAt: new Date().toISOString(),
          },
          {
            id: "f2",
            filename: "b.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            base64Content: "...",
            uploadedAt: new Date().toISOString(),
          },
        ],
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(2);
  });
});

describe("GET /api/upload/process", () => {
  it("returns 400 when fileId is missing", async () => {
    const req = new Request("http://localhost/api/upload/process");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing fileId query parameter");
  });

  it("returns 404 when file not found", async () => {
    const req = new Request("http://localhost/api/upload/process?fileId=unknown");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Processing result not found");
  });

  it("returns result when file exists", async () => {
    await POST(
      new Request("http://localhost/api/upload/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [
            {
              id: "file-1",
              filename: "chart.png",
              mimeType: "image/png",
              sizeBytes: 1024,
              base64Content: "iVBOR...",
              uploadedAt: new Date().toISOString(),
            },
          ],
        }),
      })
    );
    const req = new Request("http://localhost/api/upload/process?fileId=file-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.fileId).toBe("file-1");
  });
});
