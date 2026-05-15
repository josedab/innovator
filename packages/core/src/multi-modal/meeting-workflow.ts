/**
 * @module multi-modal/meeting-workflow
 *
 * 'Innovation from Meeting' workflow — processes meeting recordings,
 * transcripts, and whiteboard photos to extract innovation opportunities.
 * Supports audio transcription, video frame extraction, and structured
 * context extraction for feeding into the innovation pipeline.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const MeetingInputTypeSchema = z.enum([
  "audio-recording",
  "video-recording",
  "transcript",
  "whiteboard-photo",
  "slide-deck",
  "meeting-notes",
]);
export type MeetingInputType = z.infer<typeof MeetingInputTypeSchema>;

export const MeetingInputSchema = z.object({
  id: z.string().max(200),
  type: MeetingInputTypeSchema,
  filename: z.string().max(500),
  content: z.string().max(500000),
  mimeType: z.string().max(200).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  uploadedAt: z.string(),
});
export type MeetingInput = z.infer<typeof MeetingInputSchema>;

export const ExtractedTopicSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  speakers: z.array(z.string().max(200)).max(20).optional(),
  innovationPotential: z.enum(["low", "medium", "high"]),
  keywords: z.array(z.string().max(100)).max(20),
  timestamp: z.string().max(100).optional(),
});
export type ExtractedTopic = z.infer<typeof ExtractedTopicSchema>;

export const MeetingAnalysisSchema = z.object({
  id: z.string().max(200),
  meetingTitle: z.string().max(500),
  summary: z.string().max(5000),
  topics: z.array(ExtractedTopicSchema).max(20),
  actionItems: z.array(
    z.object({
      description: z.string().max(500),
      assignee: z.string().max(200).optional(),
      priority: z.enum(["low", "medium", "high"]),
    })
  ).max(20),
  innovationOpportunities: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(2000),
      suggestedAngle: z.string().max(100).optional(),
      confidence: z.number().min(0).max(1),
    })
  ).max(10),
  suggestedSubjects: z.array(z.string().max(500)).max(5),
  participants: z.array(z.string().max(200)).max(50),
  durationMinutes: z.number().int().min(0).optional(),
  createdAt: z.string(),
});
export type MeetingAnalysis = z.infer<typeof MeetingAnalysisSchema>;

// ---- Video Frame Extraction ----

export const VideoFrameSchema = z.object({
  id: z.string().max(200),
  timestampSeconds: z.number().min(0),
  base64Image: z.string().max(10000000),
  description: z.string().max(2000).optional(),
});
export type VideoFrame = z.infer<typeof VideoFrameSchema>;

export function extractKeyFrameTimestamps(
  durationSeconds: number,
  maxFrames: number = 10
): number[] {
  if (durationSeconds <= 0 || maxFrames <= 0) return [];
  const interval = durationSeconds / (maxFrames + 1);
  return Array.from({ length: maxFrames }, (_, i) =>
    Math.round((i + 1) * interval)
  );
}

// ---- Meeting Analysis ----

const MeetingAnalysisResponseSchema = z.object({
  meetingTitle: z.string().max(500),
  summary: z.string().max(5000),
  topics: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(2000),
      innovationPotential: z.enum(["low", "medium", "high"]),
      keywords: z.array(z.string().max(100)).max(20),
    })
  ).max(20),
  actionItems: z.array(
    z.object({
      description: z.string().max(500),
      assignee: z.string().max(200).optional(),
      priority: z.enum(["low", "medium", "high"]),
    })
  ).max(20),
  innovationOpportunities: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(2000),
      suggestedAngle: z.string().max(100).optional(),
      confidence: z.number().min(0).max(1),
    })
  ).max(10),
  suggestedSubjects: z.array(z.string().max(500)).max(5),
  participants: z.array(z.string().max(200)).max(50),
});

export async function analyzeMeeting(
  inputs: MeetingInput[],
  config: { model?: string; signal?: AbortSignal } = {}
): Promise<MeetingAnalysis> {
  if (inputs.length === 0) {
    throw new Error("At least one meeting input is required");
  }

  // Combine all input content
  const combinedContent = inputs
    .map((input) => {
      const label = `[${input.type}] ${input.filename}`;
      const content = input.content.slice(0, 50000);
      return `${label}:\n${content}`;
    })
    .join("\n\n---\n\n");

  const totalDuration = inputs.reduce(
    (sum, i) => sum + (i.durationSeconds ?? 0),
    0
  );

  const prompt = `Analyze this meeting content and extract innovation opportunities.

Meeting Content:
${wrapUserInput("MEETING", combinedContent.slice(0, 80000))}

Extract:
1. Meeting title and summary
2. Key discussion topics with innovation potential rating
3. Action items with assignees and priorities
4. Innovation opportunities (ideas discussed, problems identified, potential solutions)
5. Suggested subjects for deeper innovation exploration
6. List of participants mentioned

Respond in JSON:
{
  "meetingTitle": "...",
  "summary": "...",
  "topics": [{ "title": "...", "description": "...", "innovationPotential": "high", "keywords": ["..."] }],
  "actionItems": [{ "description": "...", "assignee": "...", "priority": "medium" }],
  "innovationOpportunities": [{ "title": "...", "description": "...", "suggestedAngle": "first-principles", "confidence": 0.8 }],
  "suggestedSubjects": ["..."],
  "participants": ["..."]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      return MeetingAnalysisResponseSchema.parse(
        JSON.parse(extractJson(sanitizeLlmOutput(raw)))
      );
    },
    { signal: config.signal }
  );

  return MeetingAnalysisSchema.parse({
    id: `meeting-${randomUUID().slice(0, 12)}`,
    ...result,
    durationMinutes: totalDuration > 0 ? Math.round(totalDuration / 60) : undefined,
    createdAt: new Date().toISOString(),
  });
}

/** Format meeting analysis as Markdown. */
export function meetingAnalysisToMarkdown(analysis: MeetingAnalysis): string {
  const lines: string[] = [
    `# 🎙️ Meeting Analysis: ${analysis.meetingTitle}`,
    "",
    analysis.summary,
    "",
  ];

  if (analysis.durationMinutes) {
    lines.push(`**Duration:** ${analysis.durationMinutes} minutes`);
  }
  if (analysis.participants.length > 0) {
    lines.push(`**Participants:** ${analysis.participants.join(", ")}`);
  }
  lines.push("");

  if (analysis.innovationOpportunities.length > 0) {
    lines.push("## 💡 Innovation Opportunities");
    lines.push("");
    for (const opp of analysis.innovationOpportunities) {
      lines.push(
        `### ${opp.title} (confidence: ${Math.round(opp.confidence * 100)}%)`
      );
      lines.push(opp.description);
      if (opp.suggestedAngle) {
        lines.push(`*Suggested angle: ${opp.suggestedAngle}*`);
      }
      lines.push("");
    }
  }

  if (analysis.suggestedSubjects.length > 0) {
    lines.push("## 🔍 Suggested Innovation Subjects");
    lines.push("");
    for (const subject of analysis.suggestedSubjects) {
      lines.push(`- ${subject}`);
    }
    lines.push("");
  }

  if (analysis.actionItems.length > 0) {
    lines.push("## ✅ Action Items");
    lines.push("");
    for (const item of analysis.actionItems) {
      const assignee = item.assignee ? ` (@${item.assignee})` : "";
      lines.push(`- [${item.priority}] ${item.description}${assignee}`);
    }
  }

  return lines.join("\n");
}
