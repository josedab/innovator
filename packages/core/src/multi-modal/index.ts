/**
 * @module multi-modal
 *
 * Multi-Modal Innovation Input — accepts images (mockups, whiteboard photos),
 * PDFs (research papers), URLs (competitor products), and audio recordings
 * as innovation subjects. Provides parsers, prompt construction, and
 * extended investigate() input types.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Supported attachment types. */
export const AttachmentTypeSchema = z.enum(["image", "pdf", "url", "audio"]);
export type AttachmentType = z.infer<typeof AttachmentTypeSchema>;

/** An attachment with extracted content. */
export const AttachmentSchema = z.object({
  id: z.string().max(200),
  type: AttachmentTypeSchema,
  name: z.string().max(500),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  /** Raw data as base64 (for images/audio). */
  base64Data: z.string().optional(),
  /** Original URL (for URL type). */
  sourceUrl: z.string().max(2000).optional(),
  /** Extracted text content after parsing. */
  extractedText: z.string().optional(),
  /** Structured metadata from parsing. */
  metadata: z.record(z.unknown()).optional(),
  /** Processing status. */
  status: z.enum(["pending", "processing", "completed", "failed"]),
  errorMessage: z.string().max(1000).optional(),
  processedAt: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/** Extended investigation input with attachments. */
export const InvestigationInputSchema = z.object({
  subject: z.string().min(1).max(5000),
  attachments: z.array(AttachmentSchema).max(20).optional(),
  contextNotes: z.string().max(5000).optional(),
  focusAreas: z.array(z.string().max(200)).max(10).optional(),
});
export type InvestigationInput = z.infer<typeof InvestigationInputSchema>;

/** Parsing result from a single attachment. */
export const ParseResultSchema = z.object({
  attachmentId: z.string(),
  type: AttachmentTypeSchema,
  extractedText: z.string(),
  summary: z.string().max(2000),
  keyFindings: z.array(z.string().max(500)).max(20),
  metadata: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

/** Multi-modal prompt context built from attachments. */
export const MultiModalContextSchema = z.object({
  subject: z.string(),
  textContext: z.string(),
  attachmentSummaries: z
    .array(
      z.object({
        type: AttachmentTypeSchema,
        name: z.string(),
        summary: z.string(),
        keyFindings: z.array(z.string()),
      })
    )
    .max(20),
  totalAttachments: z.number().int(),
  focusAreas: z.array(z.string()).max(10),
});
export type MultiModalContext = z.infer<typeof MultiModalContextSchema>;

// ---- Size Limits ----

const SIZE_LIMITS: Record<AttachmentType, number> = {
  image: 20 * 1024 * 1024, // 20 MB
  pdf: 50 * 1024 * 1024, // 50 MB
  url: 0, // No file size for URLs
  audio: 100 * 1024 * 1024, // 100 MB
};

const SUPPORTED_MIME_TYPES: Record<AttachmentType, string[]> = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
  pdf: ["application/pdf"],
  url: [],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"],
};

// ---- Validation ----

/** Validate an attachment before processing. */
export function validateAttachment(attachment: Attachment): string[] {
  const errors: string[] = [];

  if (attachment.sizeBytes && attachment.sizeBytes > SIZE_LIMITS[attachment.type]) {
    errors.push(
      `File exceeds ${SIZE_LIMITS[attachment.type] / (1024 * 1024)} MB limit for ${attachment.type}`
    );
  }

  if (attachment.mimeType && SUPPORTED_MIME_TYPES[attachment.type].length > 0) {
    if (!SUPPORTED_MIME_TYPES[attachment.type].includes(attachment.mimeType)) {
      errors.push(`Unsupported MIME type: ${attachment.mimeType} for ${attachment.type}`);
    }
  }

  if (attachment.type === "url" && !attachment.sourceUrl) {
    errors.push("URL attachment must have a sourceUrl");
  }

  if (attachment.type !== "url" && !attachment.base64Data && !attachment.extractedText) {
    errors.push("Non-URL attachment must have base64Data or extractedText");
  }

  return errors;
}

// ---- Parsers ----

/** Parse an image attachment using vision LLM. */
export async function parseImage(
  attachment: Attachment,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ParseResult> {
  if (attachment.type !== "image") throw new Error("Not an image attachment");

  const prompt = `You are analyzing an image for innovation insights.

The image "${attachment.name}" has been provided for analysis.
${attachment.extractedText ? `OCR text found: ${attachment.extractedText}` : "No OCR text available."}

Analyze this image and extract:
1. What the image depicts (mockup, diagram, whiteboard, etc.)
2. Key concepts, ideas, or designs shown
3. Text or labels visible
4. Innovation-relevant insights

Respond with JSON: { "summary": "...", "keyFindings": ["..."], "imageType": "...", "extractedLabels": ["..."] }`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      return JSON.parse(extractJson(raw)) as { summary: string; keyFindings: string[] };
    } catch {
      return undefined;
    }
  })() ?? {
    summary: raw.slice(0, 500),
    keyFindings: [],
  };

  return {
    attachmentId: attachment.id,
    type: "image",
    extractedText: parsed.summary,
    summary: parsed.summary,
    keyFindings: parsed.keyFindings.slice(0, 20),
    confidence: 0.7,
  };
}

/** Parse a PDF attachment extracting text and figures. */
export async function parsePDF(
  attachment: Attachment,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ParseResult> {
  if (attachment.type !== "pdf") throw new Error("Not a PDF attachment");

  // In a real implementation, we'd use a PDF parsing library.
  // Here we use the LLM to process any extracted text.
  const textContent = attachment.extractedText ?? "[PDF content not yet extracted]";

  const prompt = `You are analyzing a PDF document for innovation insights.

${wrapUserInput("DOCUMENT", attachment.name)}
${wrapUserInput("TEXT CONTENT", textContent.slice(0, 10000))}

Extract:
1. Document type (research paper, patent, report, etc.)
2. Key findings and conclusions
3. Innovation-relevant insights
4. Potential applications or implications

Respond with JSON: { "summary": "...", "keyFindings": ["..."], "documentType": "...", "citations": [] }`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      return JSON.parse(extractJson(raw)) as { summary: string; keyFindings: string[] };
    } catch {
      return undefined;
    }
  })() ?? {
    summary: raw.slice(0, 500),
    keyFindings: [],
  };

  return {
    attachmentId: attachment.id,
    type: "pdf",
    extractedText: textContent.slice(0, 50000),
    summary: parsed.summary,
    keyFindings: parsed.keyFindings.slice(0, 20),
    confidence: 0.8,
  };
}

/** Parse a URL by fetching and summarizing its content. */
export async function parseURL(
  attachment: Attachment,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ParseResult> {
  if (attachment.type !== "url") throw new Error("Not a URL attachment");
  if (!attachment.sourceUrl) throw new Error("URL attachment missing sourceUrl");

  // In production, we'd fetch the URL content. Here we use LLM to analyze the URL.
  const pageContent = attachment.extractedText ?? `[Content from ${attachment.sourceUrl}]`;

  const prompt = `You are analyzing a web page for innovation insights.

${wrapUserInput("URL", attachment.sourceUrl)}
${wrapUserInput("PAGE CONTENT", pageContent.slice(0, 10000))}

Analyze:
1. What the page/product/service is about
2. Key features and value propositions
3. Innovation opportunities and competitive insights
4. Strengths and weaknesses

Respond with JSON: { "summary": "...", "keyFindings": ["..."], "pageType": "...", "competitors": [] }`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      return JSON.parse(extractJson(raw)) as { summary: string; keyFindings: string[] };
    } catch {
      return undefined;
    }
  })() ?? {
    summary: raw.slice(0, 500),
    keyFindings: [],
  };

  return {
    attachmentId: attachment.id,
    type: "url",
    extractedText: pageContent,
    summary: parsed.summary,
    keyFindings: parsed.keyFindings.slice(0, 20),
    metadata: { sourceUrl: attachment.sourceUrl },
    confidence: 0.75,
  };
}

/** Parse an audio attachment using transcription. */
export async function parseAudio(
  attachment: Attachment,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ParseResult> {
  if (attachment.type !== "audio") throw new Error("Not an audio attachment");

  // In production, we'd use Whisper or similar for transcription.
  const transcript = attachment.extractedText ?? "[Audio transcript not yet available]";

  const prompt = `You are analyzing an audio transcription for innovation insights.

${wrapUserInput("AUDIO", attachment.name)}
${wrapUserInput("TRANSCRIPT", transcript.slice(0, 10000))}

Extract:
1. Main topics discussed
2. Key ideas and proposals mentioned
3. Action items or decisions
4. Innovation-relevant insights

Respond with JSON: { "summary": "...", "keyFindings": ["..."], "topics": ["..."] }`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      return JSON.parse(extractJson(raw)) as { summary: string; keyFindings: string[] };
    } catch {
      return undefined;
    }
  })() ?? {
    summary: raw.slice(0, 500),
    keyFindings: [],
  };

  return {
    attachmentId: attachment.id,
    type: "audio",
    extractedText: transcript,
    summary: parsed.summary,
    keyFindings: parsed.keyFindings.slice(0, 20),
    confidence: 0.65,
  };
}

// ---- Unified Parser ----

/** Parse any attachment type, routing to the appropriate parser. */
export async function parseAttachment(
  attachment: Attachment,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ParseResult> {
  const errors = validateAttachment(attachment);
  if (errors.length > 0) {
    throw new Error(`Attachment validation failed: ${errors.join("; ")}`);
  }

  switch (attachment.type) {
    case "image":
      return parseImage(attachment, options);
    case "pdf":
      return parsePDF(attachment, options);
    case "url":
      return parseURL(attachment, options);
    case "audio":
      return parseAudio(attachment, options);
    default:
      throw new Error(`Unsupported attachment type: ${attachment.type}`);
  }
}

// ---- Multi-Modal Prompt Construction ----

/** Build multi-modal context from investigation input and parsed attachments. */
export function buildMultiModalContext(
  input: InvestigationInput,
  parseResults: ParseResult[]
): MultiModalContext {
  const attachmentSummaries = parseResults.map((pr) => ({
    type: pr.type,
    name: input.attachments?.find((a) => a.id === pr.attachmentId)?.name ?? pr.attachmentId,
    summary: pr.summary,
    keyFindings: pr.keyFindings,
  }));

  const allInsights = parseResults.flatMap((pr) => pr.keyFindings);
  const textContext = [
    input.contextNotes ?? "",
    ...parseResults.map((pr) => `[${pr.type.toUpperCase()}] ${pr.summary}`),
    allInsights.length > 0 ? `Key findings:\n${allInsights.map((f) => `- ${f}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: input.subject,
    textContext,
    attachmentSummaries,
    totalAttachments: parseResults.length,
    focusAreas: input.focusAreas ?? [],
  };
}

/** Build an enhanced investigation prompt incorporating multi-modal context. */
export function buildMultiModalPrompt(context: MultiModalContext): string {
  const attachmentSection =
    context.attachmentSummaries.length > 0
      ? `\nATTACHMENT ANALYSIS:\n${context.attachmentSummaries
          .map(
            (a) =>
              `[${a.type.toUpperCase()}] ${a.name}:\n  Summary: ${a.summary}\n  Key findings: ${a.keyFindings.join("; ")}`
          )
          .join("\n\n")}`
      : "";

  const focusSection =
    context.focusAreas.length > 0 ? `\nFOCUS AREAS: ${context.focusAreas.join(", ")}` : "";

  return `You are investigating an innovation subject with multi-modal context.

${wrapUserInput("SUBJECT", context.subject)}
${attachmentSection}

ADDITIONAL CONTEXT:
${context.textContext}
${focusSection}

Based on all available context (text, images, documents, URLs, audio), provide a comprehensive investigation covering:
1. Summary of the subject and all attached context
2. Key aspects identified across all modalities
3. Current state of the art
4. Challenges and opportunities
5. Cross-modal insights (connections between different inputs)

Respond with JSON: { "summary": "...", "keyAspects": ["..."], "currentState": "...", "challenges": ["..."], "opportunities": ["..."] }`;
}

/** Process a full multi-modal investigation input. */
export async function processMultiModalInput(
  input: InvestigationInput,
  options?: { model?: string; signal?: AbortSignal }
): Promise<{ context: MultiModalContext; parseResults: ParseResult[] }> {
  const validated = InvestigationInputSchema.parse(input);
  const parseResults: ParseResult[] = [];

  if (validated.attachments) {
    for (const attachment of validated.attachments) {
      try {
        const result = await parseAttachment(attachment, options);
        parseResults.push(result);
      } catch (err) {
        parseResults.push({
          attachmentId: attachment.id,
          type: attachment.type,
          extractedText: "",
          summary: `Failed to parse: ${err instanceof Error ? err.message : String(err)}`,
          keyFindings: [],
          confidence: 0,
        });
      }
    }
  }

  const context = buildMultiModalContext(validated, parseResults);
  return { context, parseResults };
}

// ---- Batch Processing & Voice Pipeline ----

export {
  type BatchStatus,
  type BatchItem,
  type BatchProgress,
  type BatchResult,
  type BatchConfig,
  type TranscriptionConfig,
  type TranscriptionResult,
  type TranscriptionSegment,
  processBatch,
  createVoiceAttachment,
  createDocumentAttachment,
  createURLAttachment,
  buildInvestigationInput,
} from "./batch.js";

// ---- Vision Model Integration ----

export {
  type VisionAnalysis,
  type WhiteboardSession,
  VisionAnalysisSchema,
  WhiteboardSessionSchema,
  analyzeImage,
  visionToSubject,
  processWhiteboard,
  validateImage,
} from "./vision.js";
