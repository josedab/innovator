/**
 * @module multi-modal/transcription
 *
 * Rule-based audio transcription utilities that work with pre-extracted text
 * and provide topic grouping plus innovation-friendly exports.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const TranscriptionSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
  speaker: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;

export const TranscriptionResultSchema = z.object({
  id: z.string().max(200),
  fileName: z.string().max(500),
  durationSeconds: z.number().min(0),
  language: z.string().max(20).optional(),
  segments: z.array(TranscriptionSegmentSchema),
  fullText: z.string(),
  speakers: z.array(z.string().max(100)).max(20),
  topics: z
    .array(
      z.object({
        topic: z.string().max(200),
        startTime: z.number().min(0),
        endTime: z.number().min(0),
      })
    )
    .max(50),
  processedAt: z.string(),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

export const TranscriptionProviderSchema = z.enum(["whisper", "deepgram", "assembly-ai", "manual"]);
export type TranscriptionProvider = z.infer<typeof TranscriptionProviderSchema>;

const TOPIC_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "been",
  "from",
  "have",
  "into",
  "just",
  "meeting",
  "notes",
  "project",
  "really",
  "should",
  "their",
  "there",
  "these",
  "this",
  "those",
  "today",
  "transcript",
  "using",
  "with",
  "would",
]);

function normalizeTranscript(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

function countWords(text: string): number {
  return (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length;
}

function detectLanguage(text: string): string | undefined {
  const sample = text.toLowerCase().slice(0, 5000);
  const englishHits = (sample.match(/\b(the|and|with|for|from|this|that|will|can|into)\b/g) ?? [])
    .length;
  const spanishHits = (sample.match(/\b(el|la|los|las|con|para|como|este|esta|una|del)\b/g) ?? [])
    .length;

  if (englishHits >= 3 && englishHits >= spanishHits) return "en";
  if (spanishHits >= 3 && spanishHits > englishHits) return "es";
  return undefined;
}

function estimateDurationSeconds(text: string, base64Data?: string): number {
  const wordEstimate = Math.max(0, Math.round(countWords(text) / 2.6));
  if (wordEstimate > 0) return wordEstimate;
  if (!base64Data) return 0;
  return Math.max(5, Math.round(base64Data.length / 18000));
}

function buildTopicLabel(text: string): string {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/\b[a-z][a-z0-9-]{2,}\b/g) ?? [];

  for (const word of words) {
    if (TOPIC_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const topWords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

  return topWords.length > 0 ? topWords.join(" & ") : "General Discussion";
}

function splitIntoUtterances(text: string): Array<{ speaker?: string; text: string }> {
  const lines = normalizeTranscript(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const utterances: Array<{ speaker?: string; text: string }> = [];
  for (const line of lines) {
    const speakerMatch = line.match(/^([A-Z][\w .'-]{0,98}):\s+(.+)$/);
    if (speakerMatch) {
      utterances.push({ speaker: speakerMatch[1].trim().slice(0, 100), text: speakerMatch[2].trim() });
      continue;
    }

    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const sentence of sentences.length > 0 ? sentences : [line]) {
      utterances.push({ text: sentence });
    }
  }

  return utterances;
}

function buildSegments(
  utterances: Array<{ speaker?: string; text: string }>,
  durationSeconds: number
): TranscriptionSegment[] {
  if (utterances.length === 0) return [];

  const totalWords = Math.max(utterances.reduce((sum, utterance) => sum + countWords(utterance.text), 0), 1);
  let currentTime = 0;

  return utterances.map((utterance) => {
    const utteranceWords = Math.max(countWords(utterance.text), 1);
    const segmentDuration = durationSeconds > 0 ? (utteranceWords / totalWords) * durationSeconds : 0;
    const start = Number(currentTime.toFixed(2));
    currentTime += segmentDuration;
    const end = Number(Math.max(start, currentTime).toFixed(2));

    return TranscriptionSegmentSchema.parse({
      start,
      end,
      text: utterance.text,
      speaker: utterance.speaker,
      confidence: utterance.text.startsWith("[") ? 0.4 : 0.9,
    });
  });
}

function buildTopics(segments: TranscriptionSegment[]): TranscriptionResult["topics"] {
  if (segments.length === 0) return [];

  const groupedTopics: TranscriptionResult["topics"] = [];
  for (let index = 0; index < segments.length; index += 3) {
    const window = segments.slice(index, index + 3);
    const topic = buildTopicLabel(window.map((segment) => segment.text).join(" "));
    const startTime = window[0].start;
    const endTime = window[window.length - 1].end;
    const previous = groupedTopics[groupedTopics.length - 1];

    if (previous && previous.topic === topic) {
      previous.endTime = endTime;
      continue;
    }

    groupedTopics.push({ topic, startTime, endTime });
  }

  return groupedTopics.slice(0, 50);
}

export async function transcribeAudio(
  input: { fileName: string; base64Data?: string; text?: string },
  provider: TranscriptionProvider = "manual"
): Promise<TranscriptionResult> {
  const normalizedText = normalizeTranscript(
    input.text ??
      `[${provider}] transcription placeholder for ${input.fileName}. Provide extracted text to replace this placeholder.`
  );
  const durationSeconds = estimateDurationSeconds(normalizedText, input.base64Data);
  const segments = buildSegments(splitIntoUtterances(normalizedText), durationSeconds);
  const speakers = Array.from(
    new Set(segments.map((segment) => segment.speaker).filter((speaker): speaker is string => Boolean(speaker)))
  ).slice(0, 20);
  const topics = buildTopics(segments);

  return TranscriptionResultSchema.parse({
    id: `transcript-${randomUUID().slice(0, 12)}`,
    fileName: input.fileName,
    durationSeconds,
    language: detectLanguage(normalizedText),
    segments,
    fullText: normalizedText,
    speakers,
    topics,
    processedAt: new Date().toISOString(),
  });
}

export function segmentByTopics(transcript: TranscriptionResult): Array<{
  topic: string;
  startTime: number;
  endTime: number;
  segments: TranscriptionSegment[];
  text: string;
}> {
  if (transcript.topics.length === 0) {
    return [
      {
        topic: "General Discussion",
        startTime: 0,
        endTime: transcript.durationSeconds,
        segments: transcript.segments,
        text: transcript.fullText,
      },
    ];
  }

  return transcript.topics.map((topic) => {
    const segments = transcript.segments.filter(
      (segment) => segment.start < topic.endTime && segment.end >= topic.startTime
    );

    return {
      topic: topic.topic,
      startTime: topic.startTime,
      endTime: topic.endTime,
      segments,
      text: segments.map((segment) => segment.text).join(" ").trim(),
    };
  });
}

export function transcriptionToSubject(transcript: TranscriptionResult): string {
  const speakerLine = transcript.speakers.length > 0 ? `Speakers: ${transcript.speakers.join(", ")}` : undefined;
  const topicLine = transcript.topics.length > 0
    ? `Topics: ${transcript.topics.map((topic) => topic.topic).join(", ")}`
    : undefined;
  const excerpt = transcript.segments
    .slice(0, 4)
    .map((segment) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : "";
      return `- [${segment.start.toFixed(0)}s-${segment.end.toFixed(0)}s] ${speaker}${segment.text}`;
    })
    .join("\n");

  return [
    `Audio Transcript: ${transcript.fileName}`,
    `Duration: ${transcript.durationSeconds}s`,
    speakerLine,
    topicLine,
    `Transcript summary: ${transcript.fullText.slice(0, 1200)}`,
    excerpt ? `Key excerpts:\n${excerpt}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function transcriptionToMarkdown(transcript: TranscriptionResult): string {
  const lines: string[] = [
    `# 🎧 Transcript: ${transcript.fileName}`,
    "",
    `- **Duration:** ${transcript.durationSeconds} seconds`,
    transcript.language ? `- **Language:** ${transcript.language}` : "",
    transcript.speakers.length > 0 ? `- **Speakers:** ${transcript.speakers.join(", ")}` : "",
    "",
  ].filter(Boolean);

  if (transcript.topics.length > 0) {
    lines.push("## Topics", "");
    for (const topic of transcript.topics) {
      lines.push(`- **${topic.topic}** (${topic.startTime}s–${topic.endTime}s)`);
    }
    lines.push("");
  }

  lines.push("## Transcript", "");
  for (const segment of transcript.segments) {
    const speaker = segment.speaker ? `**${segment.speaker}:** ` : "";
    lines.push(`- \`${segment.start.toFixed(0)}s–${segment.end.toFixed(0)}s\` ${speaker}${segment.text}`);
  }

  return lines.join("\n");
}
