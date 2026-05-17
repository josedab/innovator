/**
 * @module vision/multi-modal
 *
 * Multi-Modal Innovation Input — accepts images, PDFs, and voice recordings
 * as investigation inputs. Processes each input type and produces enriched
 * context for the investigation pipeline with source attribution.
 */

import { z } from "zod";

// ---- Schemas ----

export const MultiModalInputTypeSchema = z.enum(["image", "pdf", "voice", "text", "url"]);

export const MultiModalInputSchema = z.object({
  id: z.string(),
  type: MultiModalInputTypeSchema,
  name: z.string().max(500),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().optional(),
  content: z.string().max(100000).optional(),
  base64Data: z.string().optional(),
  url: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ProcessedInputSchema = z.object({
  inputId: z.string(),
  inputType: MultiModalInputTypeSchema,
  extractedText: z.string().max(50000),
  summary: z.string().max(5000),
  confidence: z.number().min(0).max(1),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  sourceAttribution: z.string().max(500),
  processingTimeMs: z.number(),
  warnings: z.array(z.string().max(500)).max(10).optional(),
});

export const MultiModalContextSchema = z.object({
  processedInputs: z.array(ProcessedInputSchema),
  combinedContext: z.string().max(100000),
  totalInputs: z.number(),
  successfulInputs: z.number(),
  primarySubject: z.string().max(2000).optional(),
});

// ---- Types ----

export type MultiModalInputType = z.infer<typeof MultiModalInputTypeSchema>;
export type MultiModalInput = z.infer<typeof MultiModalInputSchema>;
export type ProcessedInput = z.infer<typeof ProcessedInputSchema>;
export type MultiModalContext = z.infer<typeof MultiModalContextSchema>;

// ---- Processing Functions ----

function processImage(input: MultiModalInput): ProcessedInput {
  const start = Date.now();
  // Extract text/description from image data
  const hasBase64 = !!input.base64Data;
  const description = hasBase64
    ? `Image "${input.name}" provided as base64 data (${input.sizeBytes ?? 0} bytes). Vision model analysis required for full extraction.`
    : `Image "${input.name}" referenced. Vision model analysis required.`;

  return {
    inputId: input.id,
    inputType: "image",
    extractedText: description,
    summary: `Image input: ${input.name}`,
    confidence: hasBase64 ? 0.7 : 0.3,
    sourceAttribution: `[Image: ${input.name}]`,
    processingTimeMs: Date.now() - start,
    structuredData: {
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      hasData: hasBase64,
    },
  };
}

function processPdf(input: MultiModalInput): ProcessedInput {
  const start = Date.now();
  const textContent = input.content ?? "";
  const extractedText =
    textContent.length > 0
      ? textContent.slice(0, 50000)
      : `PDF "${input.name}" provided. Text extraction required for processing.`;

  return {
    inputId: input.id,
    inputType: "pdf",
    extractedText,
    summary: `PDF document: ${input.name} (${textContent.length} characters extracted)`,
    confidence: textContent.length > 0 ? 0.9 : 0.2,
    sourceAttribution: `[PDF: ${input.name}]`,
    processingTimeMs: Date.now() - start,
    structuredData: {
      charCount: textContent.length,
      sizeBytes: input.sizeBytes,
    },
  };
}

function processVoice(input: MultiModalInput): ProcessedInput {
  const start = Date.now();
  const transcript = input.content ?? "";
  const extractedText =
    transcript.length > 0
      ? transcript.slice(0, 50000)
      : `Voice recording "${input.name}" provided. Whisper transcription required.`;

  return {
    inputId: input.id,
    inputType: "voice",
    extractedText,
    summary: `Voice recording: ${input.name} (${transcript.length > 0 ? "transcribed" : "pending transcription"})`,
    confidence: transcript.length > 0 ? 0.85 : 0.1,
    sourceAttribution: `[Voice: ${input.name}]`,
    processingTimeMs: Date.now() - start,
    warnings:
      transcript.length === 0
        ? ["Voice content requires Whisper API transcription before processing"]
        : undefined,
  };
}

function processText(input: MultiModalInput): ProcessedInput {
  const start = Date.now();
  const text = input.content ?? "";
  return {
    inputId: input.id,
    inputType: "text",
    extractedText: text.slice(0, 50000),
    summary: `Text input: ${input.name} (${text.length} characters)`,
    confidence: 1.0,
    sourceAttribution: `[Text: ${input.name}]`,
    processingTimeMs: Date.now() - start,
  };
}

function processUrl(input: MultiModalInput): ProcessedInput {
  const start = Date.now();
  const content = input.content ?? "";
  return {
    inputId: input.id,
    inputType: "url",
    extractedText:
      content.length > 0
        ? content.slice(0, 50000)
        : `URL "${input.url}" provided. Content fetch required.`,
    summary: `URL: ${input.url ?? input.name}`,
    confidence: content.length > 0 ? 0.8 : 0.2,
    sourceAttribution: `[URL: ${input.url ?? input.name}]`,
    processingTimeMs: Date.now() - start,
    warnings:
      content.length === 0 ? ["URL content requires fetching before processing"] : undefined,
  };
}

// ---- Core Functions ----

/** Process a single multi-modal input and extract structured content. */
export function processMultiModalInput(input: MultiModalInput): ProcessedInput {
  const validated = MultiModalInputSchema.parse(input);

  switch (validated.type) {
    case "image":
      return processImage(validated);
    case "pdf":
      return processPdf(validated);
    case "voice":
      return processVoice(validated);
    case "text":
      return processText(validated);
    case "url":
      return processUrl(validated);
  }
}

/** Process multiple inputs and combine into investigation context. */
export function batchProcessInputs(inputs: MultiModalInput[]): MultiModalContext {
  if (inputs.length === 0) {
    return {
      processedInputs: [],
      combinedContext: "",
      totalInputs: 0,
      successfulInputs: 0,
    };
  }

  const processed: ProcessedInput[] = [];
  for (const input of inputs) {
    try {
      processed.push(processMultiModalInput(input));
    } catch {
      processed.push({
        inputId: input.id,
        inputType: input.type,
        extractedText: "",
        summary: `Failed to process: ${input.name}`,
        confidence: 0,
        sourceAttribution: `[Failed: ${input.name}]`,
        processingTimeMs: 0,
        warnings: ["Processing failed for this input"],
      });
    }
  }

  const successful = processed.filter((p) => p.confidence > 0);
  const combinedContext = successful
    .map((p) => `--- ${p.sourceAttribution} ---\n${p.extractedText}`)
    .join("\n\n");

  // Attempt to detect primary subject from highest-confidence input
  const bestInput = successful.sort((a, b) => b.confidence - a.confidence)[0];
  const primarySubject = bestInput?.extractedText.slice(0, 200);

  return {
    processedInputs: processed,
    combinedContext,
    totalInputs: inputs.length,
    successfulInputs: successful.length,
    primarySubject,
  };
}
