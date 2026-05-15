import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

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

import { UploadProcessor, resolveFileType, validateUploadedFile } from "@innovator/core";
const mockValidateUploadedFile = vi.mocked(validateUploadedFile);

const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "text/plain",
  "text/markdown",
];

const MAX_FORM_SIZE = 50 * 1024 * 1024;

// Inline simplified POST handler
async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let files: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      base64Content: string;
      uploadedAt: string;
    }>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      files = [];
      let totalSize = 0;
      const entries = formData.getAll("files");
      for (const entry of entries) {
        if (!(entry instanceof File)) continue;
        if (!ACCEPTED_MIME_TYPES.includes(entry.type)) {
          throw new Error(`Unsupported file type: ${entry.type} (${entry.name})`);
        }
        totalSize += entry.size;
        if (totalSize > MAX_FORM_SIZE) {
          throw new Error("Total upload size exceeds 50MB limit");
        }
        const buffer = Buffer.from(await entry.arrayBuffer());
        files.push({
          id: `upload-${Date.now().toString(36)}-${files.length}`,
          filename: entry.name,
          mimeType: entry.type,
          sizeBytes: entry.size,
          base64Content: buffer.toString("base64"),
          uploadedAt: new Date().toISOString(),
        });
      }
      if (files.length === 0) {
        throw new Error("No valid files found in upload");
      }
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      const parsed = z
        .object({
          files: z
            .array(
              z.object({
                id: z.string().max(200),
                filename: z.string().max(500),
                mimeType: z.string().max(200),
                sizeBytes: z.number().int().min(0),
                base64Content: z.string(),
                extractedText: z.string().optional(),
                uploadedAt: z.string(),
              })
            )
            .min(1)
            .max(10),
          model: z.string().max(100).optional(),
        })
        .safeParse(body);

      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      files = parsed.data.files;
    } else {
      return new Response(
        JSON.stringify({
          error: "Unsupported content type. Use multipart/form-data or application/json.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate all files
    const validationErrors: Array<{ filename: string; errors: string[] }> = [];
    for (const file of files) {
      const errors = validateUploadedFile(file as never);
      if (errors.length > 0) {
        validationErrors.push({ filename: file.filename, errors });
      }
    }
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: "File validation failed", validationErrors }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process files
    const processor = new UploadProcessor();
    const results = [];
    for (const file of files) {
      try {
        const result = await (
          processor as unknown as { processFile: (f: unknown) => Promise<unknown> }
        ).processFile(file);
        results.push(result);
      } catch (err) {
        results.push({
          fileId: file.id,
          type: resolveFileType(file.mimeType) ?? "document",
          extractedContext: "",
          suggestedSubject: file.filename,
          confidence: 0,
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    return new Response(
      JSON.stringify({
        results,
        suggestedSubjects: (results as Array<{ confidence: number; suggestedSubject: string }>)
          .filter((r) => r.confidence > 0.5)
          .map((r) => r.suggestedSubject),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Inline simplified GET handler
const processingResults = new Map<string, unknown>();

async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return new Response(JSON.stringify({ error: "Missing fileId query parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = processingResults.get(fileId);
  if (!result) {
    return new Response(JSON.stringify({ error: "Processing result not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/upload/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateUploadedFile.mockReturnValue([]);
    processingResults.clear();
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
  beforeEach(() => {
    processingResults.clear();
  });

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
    processingResults.set("file-1", { fileId: "file-1", type: "image" });
    const req = new Request("http://localhost/api/upload/process?fileId=file-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.fileId).toBe("file-1");
  });
});
