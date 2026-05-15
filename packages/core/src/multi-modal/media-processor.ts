/**
 * @module multi-modal/media-processor
 *
 * Extended media processing for video, whiteboard photos, and meeting recordings.
 * Handles frame extraction, whiteboard text recognition, and temporal segmentation.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const MediaTypeSchema = z.enum([
  "video",
  "whiteboard",
  "meeting_recording",
  "screen_capture",
  "sketch",
]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaSegmentSchema = z.object({
  id: z.string(),
  startTimeMs: z.number().int().min(0).optional(),
  endTimeMs: z.number().int().min(0).optional(),
  type: z.enum(["speech", "visual", "interaction", "silence", "key_moment"]),
  content: z.string().max(5000),
  speaker: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1),
  innovationRelevance: z.number().min(0).max(100).default(50),
});
export type MediaSegment = z.infer<typeof MediaSegmentSchema>;

export const WhiteboardRegionSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  type: z.enum(["text", "diagram", "drawing", "sticky_note", "arrow", "grouping"]),
  extractedText: z.string().max(2000),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  connections: z.array(z.string()).max(20),
});
export type WhiteboardRegion = z.infer<typeof WhiteboardRegionSchema>;

export const MediaAnalysisResultSchema = z.object({
  id: z.string(),
  mediaType: MediaTypeSchema,
  fileName: z.string().max(500),
  durationMs: z.number().int().min(0).optional(),
  segments: z.array(MediaSegmentSchema),
  whiteboardRegions: z.array(WhiteboardRegionSchema).optional(),
  summary: z.string().max(5000),
  keyInsights: z.array(z.string().max(1000)).max(20),
  innovationSubjects: z
    .array(
      z.object({
        subject: z.string().max(500),
        confidence: z.number().min(0).max(1),
        sourceSegments: z.array(z.string()),
      })
    )
    .max(10),
  processedAt: z.string(),
});
export type MediaAnalysisResult = z.infer<typeof MediaAnalysisResultSchema>;

// ---- In-Memory Store ----

const analysisResults = new Map<string, MediaAnalysisResult>();

// ---- Video Processing ----

/**
 * Process a video for innovation insights.
 * Extracts key moments, speech content, and visual elements.
 * In production, this would use video analysis APIs and speech-to-text.
 */
export async function processVideo(
  input: {
    fileName: string;
    transcript?: string;
    frameDescriptions?: string[];
    durationMs?: number;
  },
  options?: { model?: string; signal?: AbortSignal }
): Promise<MediaAnalysisResult> {
  const segments: MediaSegment[] = [];

  // Process transcript segments
  if (input.transcript) {
    const chunks = splitTranscript(input.transcript);
    for (let i = 0; i < chunks.length; i++) {
      segments.push({
        id: randomUUID(),
        startTimeMs: i * 30000,
        endTimeMs: (i + 1) * 30000,
        type: "speech",
        content: chunks[i],
        confidence: 0.8,
        innovationRelevance: 50,
      });
    }
  }

  // Process frame descriptions
  if (input.frameDescriptions) {
    for (let i = 0; i < input.frameDescriptions.length; i++) {
      segments.push({
        id: randomUUID(),
        type: "visual",
        content: input.frameDescriptions[i],
        confidence: 0.7,
        innovationRelevance: 40,
      });
    }
  }

  // Use LLM to analyze and extract insights
  const allContent = segments.map((s) => s.content).join("\n");
  const prompt = buildVideoAnalysisPrompt(input.fileName, allContent);

  let summary = "Video processed — content analysis complete.";
  let keyInsights: string[] = [];
  let innovationSubjects: Array<{ subject: string; confidence: number; sourceSegments: string[] }> =
    [];

  try {
    const raw = await withRetry(
      () => generateText({ prompt, model: options?.model, signal: options?.signal }),
      { signal: options?.signal }
    );

    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    summary = parsed.summary ?? summary;
    keyInsights = (parsed.keyInsights ?? []).slice(0, 20);
    innovationSubjects = (parsed.innovationSubjects ?? [])
      .slice(0, 10)
      .map((s: Record<string, unknown>) => ({
        subject: String(s.subject ?? ""),
        confidence: Number(s.confidence ?? 0.5),
        sourceSegments: [],
      }));
  } catch {
    // Use basic analysis if LLM fails
    keyInsights = segments
      .filter((s) => s.content.length > 50)
      .slice(0, 5)
      .map((s) => s.content.slice(0, 200));
  }

  // Score segments for innovation relevance
  const scoredSegments = scoreSegmentRelevance(segments, keyInsights);

  const result: MediaAnalysisResult = MediaAnalysisResultSchema.parse({
    id: randomUUID(),
    mediaType: "video",
    fileName: input.fileName,
    durationMs: input.durationMs,
    segments: scoredSegments,
    summary,
    keyInsights,
    innovationSubjects,
    processedAt: new Date().toISOString(),
  });

  analysisResults.set(result.id, result);
  return result;
}

// ---- Whiteboard Processing ----

/**
 * Process a whiteboard photo for innovation insights.
 * Extracts text, diagrams, connections, and structures.
 */
export async function processWhiteboard(
  input: {
    fileName: string;
    imageBase64?: string;
    ocrText?: string;
    regions?: Array<{
      label: string;
      type: WhiteboardRegion["type"];
      extractedText: string;
      connections?: string[];
    }>;
  },
  options?: { model?: string; signal?: AbortSignal }
): Promise<MediaAnalysisResult> {
  const whiteboardRegions: WhiteboardRegion[] = [];

  // Process known regions
  if (input.regions) {
    for (const region of input.regions) {
      whiteboardRegions.push({
        id: randomUUID(),
        label: region.label,
        type: region.type,
        extractedText: region.extractedText,
        connections: region.connections ?? [],
      });
    }
  }

  // Build content from regions and OCR
  const contentParts: string[] = [];
  if (input.ocrText) {
    contentParts.push(input.ocrText);
  }
  for (const region of whiteboardRegions) {
    contentParts.push(`[${region.type}] ${region.label}: ${region.extractedText}`);
  }

  const prompt = buildWhiteboardAnalysisPrompt(input.fileName, contentParts.join("\n"));

  let summary = "Whiteboard analyzed — structure and content extracted.";
  let keyInsights: string[] = [];
  let innovationSubjects: Array<{ subject: string; confidence: number; sourceSegments: string[] }> =
    [];

  try {
    const raw = await withRetry(
      () => generateText({ prompt, model: options?.model, signal: options?.signal }),
      { signal: options?.signal }
    );

    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    summary = parsed.summary ?? summary;
    keyInsights = (parsed.keyInsights ?? []).slice(0, 20);
    innovationSubjects = (parsed.innovationSubjects ?? [])
      .slice(0, 10)
      .map((s: Record<string, unknown>) => ({
        subject: String(s.subject ?? ""),
        confidence: Number(s.confidence ?? 0.6),
        sourceSegments: [],
      }));
  } catch {
    keyInsights = whiteboardRegions
      .filter((r) => r.extractedText.length > 10)
      .slice(0, 5)
      .map((r) => `${r.label}: ${r.extractedText}`);
  }

  const segments: MediaSegment[] = whiteboardRegions.map((r) => ({
    id: randomUUID(),
    type: "visual" as const,
    content: `${r.label}: ${r.extractedText}`,
    confidence: 0.75,
    innovationRelevance: 60,
  }));

  const result: MediaAnalysisResult = MediaAnalysisResultSchema.parse({
    id: randomUUID(),
    mediaType: "whiteboard",
    fileName: input.fileName,
    segments,
    whiteboardRegions,
    summary,
    keyInsights,
    innovationSubjects,
    processedAt: new Date().toISOString(),
  });

  analysisResults.set(result.id, result);
  return result;
}

// ---- Meeting Recording Processing ----

/**
 * Process a meeting recording for innovation insights.
 * Extracts discussion points, decisions, and innovation moments.
 */
export async function processMeetingRecording(
  input: {
    fileName: string;
    transcript: string;
    speakers?: string[];
    durationMs?: number;
  },
  options?: { model?: string; signal?: AbortSignal }
): Promise<MediaAnalysisResult> {
  const chunks = splitTranscript(input.transcript);
  const segments: MediaSegment[] = chunks.map((chunk, i) => ({
    id: randomUUID(),
    startTimeMs: i * 60000,
    endTimeMs: (i + 1) * 60000,
    type: "speech" as const,
    content: chunk,
    confidence: 0.85,
    innovationRelevance: 50,
  }));

  const prompt = buildMeetingAnalysisPrompt(
    input.fileName,
    input.transcript.slice(0, 15000),
    input.speakers
  );

  let summary = "Meeting recording analyzed.";
  let keyInsights: string[] = [];
  let innovationSubjects: Array<{ subject: string; confidence: number; sourceSegments: string[] }> =
    [];

  try {
    const raw = await withRetry(
      () => generateText({ prompt, model: options?.model, signal: options?.signal }),
      { signal: options?.signal }
    );

    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    summary = parsed.summary ?? summary;
    keyInsights = (parsed.keyInsights ?? []).slice(0, 20);
    innovationSubjects = (parsed.innovationSubjects ?? [])
      .slice(0, 10)
      .map((s: Record<string, unknown>) => ({
        subject: String(s.subject ?? ""),
        confidence: Number(s.confidence ?? 0.7),
        sourceSegments: [],
      }));
  } catch {
    keyInsights = chunks.slice(0, 5).map((c) => c.slice(0, 200));
  }

  const scoredSegments = scoreSegmentRelevance(segments, keyInsights);

  const result: MediaAnalysisResult = MediaAnalysisResultSchema.parse({
    id: randomUUID(),
    mediaType: "meeting_recording",
    fileName: input.fileName,
    durationMs: input.durationMs,
    segments: scoredSegments,
    summary,
    keyInsights,
    innovationSubjects,
    processedAt: new Date().toISOString(),
  });

  analysisResults.set(result.id, result);
  return result;
}

// ---- Result Access ----

/** Get a stored analysis result. */
export function getMediaAnalysis(id: string): MediaAnalysisResult | undefined {
  return analysisResults.get(id);
}

/** List all analysis results. */
export function listMediaAnalyses(): MediaAnalysisResult[] {
  return Array.from(analysisResults.values());
}

/** Clear all results (for testing). */
export function clearMediaAnalyses(): void {
  analysisResults.clear();
}

// ---- Helpers ----

function splitTranscript(transcript: string, maxChunkLength = 500): string[] {
  const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunkLength) {
      if (current.length > 0) chunks.push(current.trim());
      current = sentence;
    } else {
      current += ". " + sentence;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [transcript.slice(0, maxChunkLength)];
}

function scoreSegmentRelevance(segments: MediaSegment[], keyInsights: string[]): MediaSegment[] {
  const insightWords = new Set(
    keyInsights
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  return segments.map((s) => {
    const words = s.content.toLowerCase().split(/\s+/);
    const matches = words.filter((w) => insightWords.has(w)).length;
    const relevance = Math.min(100, Math.round((matches / Math.max(1, words.length)) * 200 + 30));
    return { ...s, innovationRelevance: relevance };
  });
}

function buildVideoAnalysisPrompt(fileName: string, content: string): string {
  return `You are analyzing video content for innovation insights.

${wrapUserInput("VIDEO", fileName)}
${wrapUserInput("CONTENT", content.slice(0, 10000))}

Extract innovation-relevant insights. Respond with JSON:
{
  "summary": "2-3 sentence overview",
  "keyInsights": ["insight1", "insight2"],
  "innovationSubjects": [{ "subject": "investigation subject", "confidence": 0.8 }]
}`;
}

function buildWhiteboardAnalysisPrompt(fileName: string, content: string): string {
  return `You are analyzing a whiteboard photo for innovation insights.

${wrapUserInput("WHITEBOARD", fileName)}
${wrapUserInput("CONTENT", content.slice(0, 10000))}

Identify:
1. Main topics and ideas
2. Relationships between concepts
3. Potential innovation subjects

Respond with JSON:
{
  "summary": "2-3 sentence overview of the whiteboard",
  "keyInsights": ["insight1", "insight2"],
  "innovationSubjects": [{ "subject": "investigation subject", "confidence": 0.8 }]
}`;
}

function buildMeetingAnalysisPrompt(
  fileName: string,
  transcript: string,
  speakers?: string[]
): string {
  return `You are analyzing a meeting recording for innovation insights.

${wrapUserInput("MEETING", fileName)}
${speakers ? `SPEAKERS: ${speakers.join(", ")}` : ""}
${wrapUserInput("TRANSCRIPT", transcript.slice(0, 15000))}

Extract:
1. Innovation moments (new ideas, creative solutions)
2. Problem statements that could be investigated
3. Decisions with innovation implications
4. Unresolved questions worth exploring

Respond with JSON:
{
  "summary": "2-3 sentence meeting overview",
  "keyInsights": ["insight1", "insight2"],
  "innovationSubjects": [{ "subject": "investigation subject", "confidence": 0.8 }]
}`;
}

// ---- Markdown Export ----

/** Export a media analysis as markdown. */
export function mediaAnalysisToMarkdown(result: MediaAnalysisResult): string {
  const lines: string[] = [
    `# Media Analysis: ${result.fileName}`,
    "",
    `**Type:** ${result.mediaType}`,
    `**Processed:** ${result.processedAt}`,
    result.durationMs ? `**Duration:** ${Math.round(result.durationMs / 1000)}s` : "",
    "",
    "## Summary",
    "",
    result.summary,
    "",
  ];

  if (result.keyInsights.length > 0) {
    lines.push("## Key Insights");
    lines.push("");
    for (const insight of result.keyInsights) {
      lines.push(`- ${insight}`);
    }
    lines.push("");
  }

  if (result.innovationSubjects.length > 0) {
    lines.push("## Innovation Subjects");
    lines.push("");
    lines.push("| Subject | Confidence |");
    lines.push("|---------|------------|");
    for (const s of result.innovationSubjects) {
      lines.push(`| ${s.subject} | ${(s.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  if (result.whiteboardRegions?.length) {
    lines.push("## Whiteboard Regions");
    lines.push("");
    for (const r of result.whiteboardRegions) {
      lines.push(`- **[${r.type}] ${r.label}**: ${r.extractedText}`);
    }
    lines.push("");
  }

  if (result.segments.length > 0) {
    const relevant = result.segments
      .filter((s) => s.innovationRelevance >= 60)
      .sort((a, b) => b.innovationRelevance - a.innovationRelevance);

    if (relevant.length > 0) {
      lines.push("## High-Relevance Segments");
      lines.push("");
      for (const s of relevant.slice(0, 10)) {
        const time = s.startTimeMs !== undefined ? ` @${Math.round(s.startTimeMs / 1000)}s` : "";
        lines.push(
          `- **[${s.type}${time}]** (relevance: ${s.innovationRelevance}) ${s.content.slice(0, 200)}`
        );
      }
      lines.push("");
    }
  }

  return lines.filter(Boolean).join("\n");
}
