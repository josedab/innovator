import { z } from "zod";

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
