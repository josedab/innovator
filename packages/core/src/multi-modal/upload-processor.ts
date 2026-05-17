/**
 * @module multi-modal/upload-processor
 *
 * Processes uploaded files (images, PDFs, audio, documents) for innovation
 * context extraction. Routes files to appropriate handlers based on MIME type,
 * validates constraints, and builds unified investigation prompts from
 * multi-modal inputs.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const UploadedFileSchema = z.object({
  id: z.string().max(200),
  filename: z.string().max(500),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().min(0),
  base64Content: z.string(),
  extractedText: z.string().optional(),
  analysis: z.record(z.unknown()).optional(),
  uploadedAt: z.string(),
});

export type UploadedFile = z.infer<typeof UploadedFileSchema>;

export const ProcessingResultSchema = z.object({
  fileId: z.string().max(200),
  type: z.enum(["image", "pdf", "audio", "document"]),
  extractedContext: z.string().max(50000),
  suggestedSubject: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
});

export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

// ---- Size Limits ----

const SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  pdf: 25 * 1024 * 1024, // 25 MB
  audio: 50 * 1024 * 1024, // 50 MB
  document: 25 * 1024 * 1024, // 25 MB
};

const MIME_TYPE_MAP: Record<string, ProcessingResult["type"]> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "application/pdf": "pdf",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "audio/mp4": "audio",
  "text/plain": "document",
  "text/markdown": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
};

// ---- Validation ----

/** Resolve file type from MIME type. */
export function resolveFileType(mimeType: string): ProcessingResult["type"] | undefined {
  return MIME_TYPE_MAP[mimeType];
}

/** Validate an uploaded file before processing. */
export function validateUploadedFile(file: UploadedFile): string[] {
  const errors: string[] = [];

  const fileType = resolveFileType(file.mimeType);
  if (!fileType) {
    errors.push(`Unsupported MIME type: ${file.mimeType}`);
    return errors;
  }

  const limit = SIZE_LIMITS[fileType];
  if (file.sizeBytes > limit) {
    errors.push(`File exceeds ${limit / (1024 * 1024)}MB limit for ${fileType} files`);
  }

  if (!file.base64Content && !file.extractedText) {
    errors.push("File must have base64Content or extractedText");
  }

  return errors;
}

// ---- Processors ----

/**
 * Upload processor that routes files to type-specific handlers and builds
 * unified innovation prompts from multi-modal inputs.
 */
export class UploadProcessor {
  private model?: string;

  constructor(options?: { model?: string }) {
    this.model = options?.model;
  }

  /** Process a file by routing to the appropriate handler based on MIME type. */
  async processFile(file: UploadedFile, signal?: AbortSignal): Promise<ProcessingResult> {
    const errors = validateUploadedFile(file);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    const fileType = resolveFileType(file.mimeType)!;

    switch (fileType) {
      case "image":
        return this.processImage(file, signal);
      case "pdf":
        return this.processPDF(file, signal);
      case "audio":
        return this.processAudio(file, signal);
      case "document":
        return this.processDocument(file, signal);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /** Extract innovation context from images (whiteboards, diagrams, products). */
  async processImage(file: UploadedFile, signal?: AbortSignal): Promise<ProcessingResult> {
    const prompt = `You are analyzing an uploaded image for innovation insights.

${wrapUserInput("FILENAME", file.filename)}
${file.extractedText ? wrapUserInput("OCR TEXT", file.extractedText) : "No OCR text available."}

Analyze this image and extract:
1. Objects detected (products, devices, diagrams, whiteboard content, etc.)
2. Text extracted from the image
3. Layout description (how content is organized)
4. Innovation subjects suggested based on what you see

Respond with JSON only:
{
  "objectsDetected": ["..."],
  "textExtracted": "...",
  "layoutDescription": "...",
  "innovationSubjects": ["..."],
  "summary": "...",
  "confidence": 0.8
}`;

    const raw = await withRetry(() =>
      generateText({
        prompt,
        model: this.model,
        serverMode: true,
        signal,
      })
    );

    const parsed = safeParseJson(raw);

    return {
      fileId: file.id,
      type: "image",
      extractedContext: [
        parsed.summary ?? "Image analysis completed",
        parsed.objectsDetected ? `Objects: ${(parsed.objectsDetected as string[]).join(", ")}` : "",
        parsed.textExtracted ? `Text: ${parsed.textExtracted}` : "",
        parsed.layoutDescription ? `Layout: ${parsed.layoutDescription}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      suggestedSubject:
        Array.isArray(parsed.innovationSubjects) && parsed.innovationSubjects.length > 0
          ? (parsed.innovationSubjects as string[])[0]
          : file.filename,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      metadata: {
        objectsDetected: parsed.objectsDetected,
        layoutDescription: parsed.layoutDescription,
      },
    };
  }

  /** Extract text and structure from PDFs. */
  async processPDF(file: UploadedFile, signal?: AbortSignal): Promise<ProcessingResult> {
    const textContent = file.extractedText ?? "[PDF content not yet extracted]";

    const prompt = `You are analyzing a PDF document for innovation research.

${wrapUserInput("DOCUMENT", file.filename)}
${wrapUserInput("TEXT CONTENT", textContent.slice(0, 15000))}

Extract:
1. Main text content summary
2. Section headings and structure
3. Key concepts and terminology
4. Suggested investigation subjects for innovation

Respond with JSON only:
{
  "textSummary": "...",
  "headings": ["..."],
  "keyConcepts": ["..."],
  "suggestedSubjects": ["..."],
  "documentType": "research|patent|report|article|other",
  "confidence": 0.8
}`;

    const raw = await withRetry(() =>
      generateText({
        prompt,
        model: this.model,
        serverMode: true,
        signal,
      })
    );

    const parsed = safeParseJson(raw);

    return {
      fileId: file.id,
      type: "pdf",
      extractedContext: [
        parsed.textSummary ?? "PDF analysis completed",
        parsed.headings ? `Headings: ${(parsed.headings as string[]).join(", ")}` : "",
        parsed.keyConcepts ? `Key concepts: ${(parsed.keyConcepts as string[]).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      suggestedSubject:
        Array.isArray(parsed.suggestedSubjects) && parsed.suggestedSubjects.length > 0
          ? (parsed.suggestedSubjects as string[])[0]
          : file.filename,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
      metadata: {
        headings: parsed.headings,
        keyConcepts: parsed.keyConcepts,
        documentType: parsed.documentType,
      },
    };
  }

  /** Transcribe audio to text and extract key topics. */
  async processAudio(file: UploadedFile, signal?: AbortSignal): Promise<ProcessingResult> {
    const transcript = file.extractedText ?? "[Audio transcript not yet available]";

    const prompt = `You are analyzing an audio transcription for innovation insights.

${wrapUserInput("AUDIO FILE", file.filename)}
${wrapUserInput("TRANSCRIPT", transcript.slice(0, 15000))}

Extract:
1. Full transcript summary
2. Key topics discussed
3. Suggested innovation subjects from the conversation

Respond with JSON only:
{
  "transcriptSummary": "...",
  "keyTopics": ["..."],
  "suggestedSubjects": ["..."],
  "speakers": 1,
  "confidence": 0.7
}`;

    const raw = await withRetry(() =>
      generateText({
        prompt,
        model: this.model,
        serverMode: true,
        signal,
      })
    );

    const parsed = safeParseJson(raw);

    return {
      fileId: file.id,
      type: "audio",
      extractedContext: [
        parsed.transcriptSummary ?? "Audio analysis completed",
        parsed.keyTopics ? `Topics: ${(parsed.keyTopics as string[]).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      suggestedSubject:
        Array.isArray(parsed.suggestedSubjects) && parsed.suggestedSubjects.length > 0
          ? (parsed.suggestedSubjects as string[])[0]
          : file.filename,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      metadata: {
        keyTopics: parsed.keyTopics,
        speakers: parsed.speakers,
      },
    };
  }

  /** Process a text document and extract key content. */
  private async processDocument(
    file: UploadedFile,
    signal?: AbortSignal
  ): Promise<ProcessingResult> {
    const textContent =
      (file.extractedText ?? file.base64Content)
        ? Buffer.from(file.base64Content, "base64").toString("utf-8").slice(0, 50000)
        : "[Document content not available]";

    const prompt = `You are analyzing a document for innovation insights.

${wrapUserInput("DOCUMENT", file.filename)}
${wrapUserInput("CONTENT", (typeof textContent === "string" ? textContent : "").slice(0, 15000))}

Extract:
1. Document summary
2. Key concepts and terminology
3. Suggested innovation subjects

Respond with JSON only:
{
  "summary": "...",
  "keyConcepts": ["..."],
  "suggestedSubjects": ["..."],
  "confidence": 0.75
}`;

    const raw = await withRetry(() =>
      generateText({
        prompt,
        model: this.model,
        serverMode: true,
        signal,
      })
    );

    const parsed = safeParseJson(raw);

    return {
      fileId: file.id,
      type: "document",
      extractedContext: [
        parsed.summary ?? "Document analysis completed",
        parsed.keyConcepts ? `Key concepts: ${(parsed.keyConcepts as string[]).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      suggestedSubject:
        Array.isArray(parsed.suggestedSubjects) && parsed.suggestedSubjects.length > 0
          ? (parsed.suggestedSubjects as string[])[0]
          : file.filename,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      metadata: { keyConcepts: parsed.keyConcepts },
    };
  }

  /** Combine multi-modal processing results into a single investigation prompt. */
  buildInnovationPrompt(results: ProcessingResult[]): string {
    if (results.length === 0) return "";

    const sections = results.map((r) => {
      const label = r.type.toUpperCase();
      return `[${label}] ${r.suggestedSubject}\n${r.extractedContext}`;
    });

    const subjects = results.filter((r) => r.confidence > 0.5).map((r) => r.suggestedSubject);

    return `You are investigating an innovation subject informed by multiple uploaded inputs.

UPLOADED MATERIALS:
${sections.join("\n\n---\n\n")}

SUGGESTED SUBJECTS (by confidence):
${subjects.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Based on all uploaded materials, provide a comprehensive innovation investigation covering:
1. Synthesis of all inputs
2. Key themes and connections across materials
3. Innovation opportunities identified
4. Recommended investigation subject combining all inputs`;
  }
}

// ---- Helpers ----

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(extractJson(raw)) as Record<string, unknown>;
  } catch {
    return { summary: raw.slice(0, 500) };
  }
}
