import { z } from "zod";

export interface ImageExtractor {
  name: string;
  extractContext(imageData: string | Buffer, mimeType: string): Promise<ExtractedImageContext>;
}

export const ExtractedImageContextSchema = z.object({
  description: z.string().max(2000),
  objects: z.array(z.string().max(200)).max(50),
  text: z.string().max(5000).optional(),
  tags: z.array(z.string().max(100)).max(20),
  confidence: z.number().min(0).max(1),
});
export type ExtractedImageContext = z.infer<typeof ExtractedImageContextSchema>;

export interface PDFExtractor {
  name: string;
  extractText(pdfData: Buffer): Promise<ExtractedDocumentContext>;
}

export const ExtractedDocumentContextSchema = z.object({
  text: z.string(),
  pages: z.number(),
  sections: z
    .array(
      z.object({
        title: z.string().max(500).optional(),
        content: z.string(),
        pageNumber: z.number(),
      })
    )
    .max(200),
  metadata: z.record(z.string()).optional(),
});
export type ExtractedDocumentContext = z.infer<typeof ExtractedDocumentContextSchema>;

export interface AudioTranscriber {
  name: string;
  transcribe(audioData: Buffer, format: string): Promise<TranscriptionResult>;
}

export const TranscriptionResultSchema = z.object({
  text: z.string(),
  durationSeconds: z.number(),
  language: z.string().max(10).optional(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        confidence: z.number().optional(),
      })
    )
    .max(1000)
    .optional(),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

export const EnrichedContextSchema = z.object({
  originalSubject: z.string(),
  extractedTexts: z.array(
    z.object({
      source: z.enum(["image", "pdf", "audio", "text"]),
      content: z.string(),
      confidence: z.number().optional(),
    })
  ),
  mergedContext: z.string(),
  totalSources: z.number(),
});
export type EnrichedContext = z.infer<typeof EnrichedContextSchema>;

const imageExtractors: ImageExtractor[] = [];
const pdfExtractors: PDFExtractor[] = [];
const audioTranscribers: AudioTranscriber[] = [];

function registerUniqueByName<T extends { name: string }>(registry: T[], entry: T): void {
  const existingIndex = registry.findIndex((item) => item.name === entry.name);
  if (existingIndex >= 0) {
    registry.splice(existingIndex, 1, entry);
    return;
  }

  registry.push(entry);
}

export function registerImageExtractor(extractor: ImageExtractor): void {
  registerUniqueByName(imageExtractors, extractor);
}

export function registerPDFExtractor(extractor: PDFExtractor): void {
  registerUniqueByName(pdfExtractors, extractor);
}

export function registerAudioTranscriber(transcriber: AudioTranscriber): void {
  registerUniqueByName(audioTranscribers, transcriber);
}

export function listImageExtractors(): string[] {
  return imageExtractors.map((extractor) => extractor.name);
}

export function listPDFExtractors(): string[] {
  return pdfExtractors.map((extractor) => extractor.name);
}

export function listAudioTranscribers(): string[] {
  return audioTranscribers.map((transcriber) => transcriber.name);
}

export function mergeExtractedContexts(
  subject: string,
  extractions: Array<{
    source: "image" | "pdf" | "audio" | "text";
    content: string;
    confidence?: number;
  }>
): EnrichedContext {
  const normalizedExtractions = extractions
    .map((extraction) => ({
      source: extraction.source,
      content: extraction.content.trim(),
      confidence: extraction.confidence,
    }))
    .filter((extraction) => extraction.content.length > 0);

  const mergedContext = [
    `Subject: ${subject.trim()}`,
    ...normalizedExtractions.map(
      (extraction, index) =>
        `Source ${index + 1} (${extraction.source})${extraction.confidence !== undefined ? ` [confidence ${extraction.confidence.toFixed(2)}]` : ""}: ${extraction.content}`
    ),
  ].join("\n\n");

  return EnrichedContextSchema.parse({
    originalSubject: subject,
    extractedTexts: normalizedExtractions,
    mergedContext,
    totalSources: normalizedExtractions.length,
  });
}

export function clearExtractorRegistries(): void {
  imageExtractors.length = 0;
  pdfExtractors.length = 0;
  audioTranscribers.length = 0;
}
