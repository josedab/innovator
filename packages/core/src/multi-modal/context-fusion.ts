/**
 * @module multi-modal/context-fusion
 *
 * Context Fusion Engine — merges multi-modal inputs (PDF text, image OCR,
 * audio transcriptions, diagram analysis) into a unified investigation context
 * with source attribution and rich output generation.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { Attachment } from "./index.js";

// ---- Schemas ----

export const InputSourceSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["text", "pdf", "image", "audio", "video", "diagram", "url"]),
  label: z.string().max(300),
  content: z.string().max(50000),
  confidence: z.number().min(0).max(1).default(1),
  extractionMethod: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type InputSource = z.infer<typeof InputSourceSchema>;

export const FusedContextSchema = z.object({
  id: z.string().max(100),
  subject: z.string().max(5000),
  sources: z.array(InputSourceSchema).max(50),
  unifiedSummary: z.string().max(10000),
  keyThemes: z.array(z.string().max(300)).max(20),
  contradictions: z
    .array(
      z.object({
        sourceA: z.string().max(200),
        sourceB: z.string().max(200),
        description: z.string().max(500),
      })
    )
    .max(10),
  confidence: z.number().min(0).max(1),
  totalTokens: z.number().int().min(0),
  fusedAt: z.string(),
});
export type FusedContext = z.infer<typeof FusedContextSchema>;

// ---- Input Processors ----

/**
 * Process a PDF attachment and extract text content.
 */
export function processPdfInput(attachment: Attachment): InputSource {
  if (attachment.type !== "pdf") throw new Error("Expected PDF attachment");

  return {
    id: attachment.id,
    type: "pdf",
    label: attachment.name,
    content: attachment.extractedText ?? "[PDF content extraction pending]",
    confidence: attachment.extractedText ? 0.9 : 0.1,
    extractionMethod: "text-extraction",
    metadata: { mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes },
  };
}

/**
 * Process an image attachment with OCR/description.
 */
export function processImageInput(attachment: Attachment): InputSource {
  if (attachment.type !== "image") throw new Error("Expected image attachment");

  return {
    id: attachment.id,
    type: "image",
    label: attachment.name,
    content: attachment.extractedText ?? "[Image analysis pending]",
    confidence: attachment.extractedText ? 0.8 : 0.1,
    extractionMethod: "vision-analysis",
    metadata: { mimeType: attachment.mimeType, hasBase64: !!attachment.base64Data },
  };
}

/**
 * Process an audio attachment with transcription.
 */
export function processAudioInput(attachment: Attachment): InputSource {
  if (attachment.type !== "audio") throw new Error("Expected audio attachment");

  return {
    id: attachment.id,
    type: "audio",
    label: attachment.name,
    content: attachment.extractedText ?? "[Audio transcription pending]",
    confidence: attachment.extractedText ? 0.85 : 0.1,
    extractionMethod: "whisper-transcription",
    metadata: { mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes },
  };
}

/**
 * Process a URL attachment by extracting page content.
 */
export function processUrlInput(attachment: Attachment): InputSource {
  if (attachment.type !== "url") throw new Error("Expected URL attachment");

  return {
    id: attachment.id,
    type: "url",
    label: attachment.name,
    content: attachment.extractedText ?? `[Content from ${attachment.sourceUrl} pending]`,
    confidence: attachment.extractedText ? 0.9 : 0.1,
    extractionMethod: "web-scraping",
    metadata: { url: attachment.sourceUrl },
  };
}

/**
 * Process any attachment into an InputSource.
 */
export function processAttachment(attachment: Attachment): InputSource {
  switch (attachment.type) {
    case "pdf":
      return processPdfInput(attachment);
    case "image":
      return processImageInput(attachment);
    case "audio":
      return processAudioInput(attachment);
    case "url":
      return processUrlInput(attachment);
    default:
      return {
        id: attachment.id,
        type: "text",
        label: attachment.name,
        content: attachment.extractedText ?? "",
        confidence: 0.5,
        metadata: {},
      };
  }
}

// ---- Context Fusion ----

/**
 * Fuse multiple input sources into a unified investigation context.
 */
export async function fuseContext(
  subject: string,
  sources: InputSource[],
  model?: string,
  signal?: AbortSignal
): Promise<FusedContext> {
  if (sources.length === 0) {
    return {
      id: randomUUID(),
      subject,
      sources: [],
      unifiedSummary: subject,
      keyThemes: [],
      contradictions: [],
      confidence: 1,
      totalTokens: 0,
      fusedAt: new Date().toISOString(),
    };
  }

  const sourceDescriptions = sources
    .map(
      (s, i) =>
        `[Source ${i + 1}: ${s.type} — "${s.label}" (confidence: ${s.confidence.toFixed(2)})]:\n${s.content.slice(0, 3000)}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are an innovation research assistant merging multiple input sources into a unified investigation brief.

${wrapUserInput("SUBJECT", subject)}

MULTI-MODAL SOURCES:
${sourceDescriptions}

Analyze all sources and produce a unified summary that:
1. Synthesizes key information from all sources
2. Identifies common themes across sources
3. Notes any contradictions between sources
4. Weighs sources by their confidence scores

Respond in JSON:
{
  "unifiedSummary": "A comprehensive summary merging all sources",
  "keyThemes": ["theme1", "theme2", ...],
  "contradictions": [
    { "sourceA": "Source 1 label", "sourceB": "Source 2 label", "description": "What contradicts" }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw))) as {
        unifiedSummary: string;
        keyThemes: string[];
        contradictions: Array<{ sourceA: string; sourceB: string; description: string }>;
      };
    },
    { signal }
  );

  const totalTokens = Math.ceil(sources.reduce((sum, s) => sum + s.content.length, 0) / 4);
  const avgConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;

  return FusedContextSchema.parse({
    id: randomUUID(),
    subject,
    sources,
    unifiedSummary: result.unifiedSummary,
    keyThemes: result.keyThemes ?? [],
    contradictions: result.contradictions ?? [],
    confidence: avgConfidence,
    totalTokens,
    fusedAt: new Date().toISOString(),
  });
}

// ---- Rich Output ----

export const RichOutputSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["summary-card", "comparison-table", "mind-map", "timeline", "swot-matrix"]),
  title: z.string().max(300),
  content: z.string().max(50000),
  format: z.enum(["markdown", "html", "mermaid", "json"]),
  sourceIds: z.array(z.string().max(200)).max(50),
  generatedAt: z.string(),
});
export type RichOutput = z.infer<typeof RichOutputSchema>;

/**
 * Generate a rich visual output artifact from fused context.
 */
export async function generateRichOutput(
  fusedContext: FusedContext,
  outputType: RichOutput["type"],
  model?: string,
  signal?: AbortSignal
): Promise<RichOutput> {
  const formatInstructions: Record<RichOutput["type"], string> = {
    "summary-card":
      "Create a concise summary card with key findings, metrics, and action items in markdown.",
    "comparison-table":
      "Create a markdown comparison table analyzing different aspects of the subject.",
    "mind-map":
      "Create a Mermaid mindmap diagram showing the key concepts and their relationships.",
    timeline: "Create a Mermaid timeline showing the evolution or planned progression.",
    "swot-matrix":
      "Create a markdown SWOT analysis (Strengths, Weaknesses, Opportunities, Threats).",
  };

  const format: RichOutput["format"] =
    outputType === "mind-map" || outputType === "timeline" ? "mermaid" : "markdown";

  const prompt = `Based on this innovation context, ${formatInstructions[outputType]}

Subject: ${wrapUserInput("SUBJECT", fusedContext.subject)}
Summary: ${fusedContext.unifiedSummary.slice(0, 3000)}
Themes: ${fusedContext.keyThemes.join(", ")}

Respond with ONLY the ${format} content, no JSON wrapper.`;

  const content = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      return sanitizeLlmOutput(raw);
    },
    { signal }
  );

  return RichOutputSchema.parse({
    id: randomUUID(),
    type: outputType,
    title: `${outputType.replace(/-/g, " ")} — ${fusedContext.subject.slice(0, 100)}`,
    content,
    format,
    sourceIds: fusedContext.sources.map((s) => s.id),
    generatedAt: new Date().toISOString(),
  });
}
