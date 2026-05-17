/**
 * @description Multi-modal file upload processing for innovation context extraction.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { UploadProcessor, resolveFileType, validateUploadedFile } from "@innovator/core";
import type { UploadedFile, ProcessingResult } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

// ---- In-memory result store (per-instance) ----

const processingResults = new Map<string, ProcessingResult>();

// ---- Validation ----

const MAX_FORM_SIZE = 50 * 1024 * 1024; // 50 MB total

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

// ---- POST: Process uploaded files ----

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let files: UploadedFile[];

    if (contentType.includes("multipart/form-data")) {
      files = await parseFormData(request);
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
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      files = parsed.data.files;
    } else {
      return NextResponse.json(
        { error: "Unsupported content type. Use multipart/form-data or application/json." },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    // Validate all files
    const validationErrors: Array<{ filename: string; errors: string[] }> = [];
    for (const file of files) {
      const errors = validateUploadedFile(file);
      if (errors.length > 0) {
        validationErrors.push({ filename: file.filename, errors });
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "File validation failed", validationErrors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    // Process files
    const processor = new UploadProcessor();
    const results: ProcessingResult[] = [];

    for (const file of files) {
      try {
        const result = await processor.processFile(file);
        results.push(result);
        processingResults.set(result.fileId, result);
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

    // Build combined prompt if multiple files
    const combinedPrompt =
      results.length > 1 ? processor.buildInnovationPrompt(results) : undefined;

    return NextResponse.json(
      {
        results,
        suggestedSubjects: results.filter((r) => r.confidence > 0.5).map((r) => r.suggestedSubject),
        combinedPrompt,
      },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed";
    return NextResponse.json({ error: message }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}

// ---- GET: Retrieve processing results by ID ----

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json(
      { error: "Missing fileId query parameter" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const result = processingResults.get(fileId);
  if (!result) {
    return NextResponse.json(
      { error: "Processing result not found" },
      { status: 404, headers: API_RESPONSE_HEADERS }
    );
  }

  return NextResponse.json({ result }, { headers: API_RESPONSE_HEADERS });
}

// ---- Helpers ----

async function parseFormData(request: Request): Promise<UploadedFile[]> {
  const formData = await request.formData();
  const files: UploadedFile[] = [];

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
    const base64Content = buffer.toString("base64");

    files.push({
      id: `upload-${Date.now().toString(36)}-${files.length}`,
      filename: entry.name,
      mimeType: entry.type,
      sizeBytes: entry.size,
      base64Content,
      uploadedAt: new Date().toISOString(),
    });
  }

  if (files.length === 0) {
    throw new Error("No valid files found in upload");
  }

  return files;
}
