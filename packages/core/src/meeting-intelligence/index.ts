/**
 * @module meeting-intelligence
 *
 * Connects to Zoom, Microsoft Teams, and Google Meet to extract
 * innovation-relevant discussions from meeting transcripts. LLM-powered
 * extractors identify problem statements, opportunity signals, frustration
 * indicators, competitive mentions, and decision points. Auto-creates
 * investigation subjects from high-confidence signals.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";

// ---- Meeting Source Types ----

export const MEETING_PLATFORMS = ["zoom", "teams", "google-meet", "generic"] as const;

export type MeetingPlatform = (typeof MEETING_PLATFORMS)[number];

export const MeetingTranscriptSchema = z.object({
  id: z.string().min(1).max(200),
  platform: z.enum(MEETING_PLATFORMS),
  title: z.string().max(500),
  date: z.string(),
  duration: z.number().min(0).describe("Duration in minutes"),
  participants: z
    .array(
      z.object({
        name: z.string().max(200),
        role: z.string().max(200).optional(),
        email: z.string().max(300).optional(),
      })
    )
    .max(100),
  segments: z
    .array(
      z.object({
        speaker: z.string().max(200),
        timestamp: z.string().max(20),
        text: z.string().max(10_000),
      })
    )
    .max(5000),
  rawText: z.string().max(500_000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type MeetingTranscript = z.infer<typeof MeetingTranscriptSchema>;

// ---- Signal Types ----

export const SIGNAL_TYPES = [
  "problem-statement",
  "opportunity",
  "frustration",
  "competitive-mention",
  "decision-point",
  "action-item",
  "idea-spark",
  "customer-feedback",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const MeetingSignalSchema = z.object({
  id: z.string().max(200),
  meetingId: z.string().max(200),
  type: z.enum(SIGNAL_TYPES),
  content: z.string().max(2000),
  context: z.string().max(2000).describe("Surrounding conversation context"),
  speaker: z.string().max(200),
  timestamp: z.string().max(20),
  confidence: z.number().min(0).max(1),
  relevanceScore: z.number().min(0).max(100),
  suggestedSubject: z.string().max(500).optional().describe("Auto-generated investigation subject"),
  tags: z.array(z.string().max(100)).max(10),
});

export type MeetingSignal = z.infer<typeof MeetingSignalSchema>;

// ---- Extraction Result ----

export const ExtractionResultSchema = z.object({
  meetingId: z.string().max(200),
  extractedAt: z.string(),
  signals: z.array(MeetingSignalSchema).max(100),
  summary: z.string().max(5000),
  innovationRelevanceScore: z.number().min(0).max(100),
  suggestedInvestigations: z
    .array(
      z.object({
        subject: z.string().max(500),
        rationale: z.string().max(1000),
        sourceSignals: z.array(z.string().max(200)).max(10),
        priority: z.enum(["low", "medium", "high"]),
      })
    )
    .max(20),
  topicClusters: z
    .array(
      z.object({
        topic: z.string().max(200),
        signalCount: z.number().int().min(0),
        avgRelevance: z.number().min(0).max(100),
      })
    )
    .max(20),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ---- Platform Connector Config ----

export const MeetingConnectorConfigSchema = z.object({
  platform: z.enum(MEETING_PLATFORMS),
  enabled: z.boolean().default(false),
  apiEndpoint: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
  credentials: z
    .object({
      clientId: z.string().max(200).optional(),
      clientSecret: z.string().max(200).optional(),
      accessToken: z.string().max(2000).optional(),
      refreshToken: z.string().max(2000).optional(),
    })
    .optional(),
  filters: z
    .object({
      minDuration: z.number().min(0).default(5),
      requiredParticipants: z.array(z.string().max(200)).max(20).optional(),
      titlePatterns: z.array(z.string().max(200)).max(10).optional(),
      excludePatterns: z.array(z.string().max(200)).max(10).optional(),
    })
    .optional(),
});

export type MeetingConnectorConfig = z.infer<typeof MeetingConnectorConfigSchema>;

// ---- In-Memory Store ----

const transcripts = new Map<string, MeetingTranscript>();
const extractions = new Map<string, ExtractionResult>();
const connectorConfigs = new Map<MeetingPlatform, MeetingConnectorConfig>();

let signalIdCounter = 0;

// ---- Functions ----

/** Store a meeting transcript for analysis. */
export function ingestTranscript(transcript: MeetingTranscript): void {
  MeetingTranscriptSchema.parse(transcript);
  transcripts.set(transcript.id, transcript);
}

/** Get a stored transcript. */
export function getTranscript(id: string): MeetingTranscript | undefined {
  return transcripts.get(id);
}

/** List all stored transcripts. */
export function listTranscripts(): MeetingTranscript[] {
  return Array.from(transcripts.values());
}

/** Extract innovation-relevant signals from a meeting transcript using LLM. */
export async function extractSignals(
  transcriptId: string,
  model?: string,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  const transcript = transcripts.get(transcriptId);
  if (!transcript) throw new Error(`Transcript not found: ${transcriptId}`);

  // Build condensed transcript for LLM (respect context limits)
  const condensed = transcript.segments
    .map((s) => `[${s.speaker}] ${s.text}`)
    .join("\n")
    .slice(0, 30_000);

  const prompt = `You are an innovation intelligence analyst. Extract innovation-relevant signals from this meeting transcript.

## Meeting: ${sanitizeUserInput(transcript.title)}
Date: ${transcript.date}
Participants: ${transcript.participants.map((p) => p.name).join(", ")}
Duration: ${transcript.duration} minutes

## Transcript (condensed)
${condensed}

Extract these signal types: problem-statement, opportunity, frustration, competitive-mention, decision-point, action-item, idea-spark, customer-feedback.

For each signal, assess confidence (0-1) and relevance (0-100).
Also suggest investigation subjects for high-relevance signals.

Respond in JSON:
{
  "signals": [{ "type": "signal-type", "content": "extracted text", "context": "surrounding context", "speaker": "name", "timestamp": "HH:MM", "confidence": 0-1, "relevanceScore": 0-100, "suggestedSubject": "optional subject", "tags": ["tag"] }],
  "summary": "meeting innovation summary",
  "innovationRelevanceScore": 0-100,
  "suggestedInvestigations": [{ "subject": "string", "rationale": "string", "sourceSignals": ["signal indices"], "priority": "low|medium|high" }],
  "topicClusters": [{ "topic": "string", "signalCount": number, "avgRelevance": number }]
}`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  const signals: MeetingSignal[] = (parsed.signals ?? []).map(
    (s: Record<string, unknown>, _i: number) => ({
      id: `signal-${transcriptId}-${++signalIdCounter}`,
      meetingId: transcriptId,
      type: s.type ?? "idea-spark",
      content: s.content ?? "",
      context: s.context ?? "",
      speaker: s.speaker ?? "Unknown",
      timestamp: s.timestamp ?? "00:00",
      confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
      relevanceScore: typeof s.relevanceScore === "number" ? s.relevanceScore : 50,
      suggestedSubject: s.suggestedSubject as string | undefined,
      tags: Array.isArray(s.tags) ? s.tags : [],
    })
  );

  const result: ExtractionResult = {
    meetingId: transcriptId,
    extractedAt: new Date().toISOString(),
    signals,
    summary: typeof parsed.summary === "string" ? parsed.summary : "No summary available",
    innovationRelevanceScore:
      typeof parsed.innovationRelevanceScore === "number" ? parsed.innovationRelevanceScore : 50,
    suggestedInvestigations: parsed.suggestedInvestigations ?? [],
    topicClusters: parsed.topicClusters ?? [],
  };

  const validated = ExtractionResultSchema.parse(result);
  extractions.set(transcriptId, validated);
  return validated;
}

/** Get extraction results for a transcript. */
export function getExtractionResult(meetingId: string): ExtractionResult | undefined {
  return extractions.get(meetingId);
}

/** Get all high-confidence signals across all meetings. */
export function getHighConfidenceSignals(minConfidence: number = 0.7): MeetingSignal[] {
  const allSignals: MeetingSignal[] = [];
  for (const extraction of extractions.values()) {
    allSignals.push(...extraction.signals.filter((s) => s.confidence >= minConfidence));
  }
  return allSignals.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Get all suggested investigation subjects from all meetings. */
export function getSuggestedInvestigations(): Array<{
  subject: string;
  rationale: string;
  sourceSignals: string[];
  priority: string;
  meetingId: string;
}> {
  const subjects: Array<{
    subject: string;
    rationale: string;
    sourceSignals: string[];
    priority: string;
    meetingId: string;
  }> = [];
  for (const extraction of extractions.values()) {
    for (const inv of extraction.suggestedInvestigations) {
      subjects.push({ ...inv, meetingId: extraction.meetingId });
    }
  }
  return subjects.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2)
    );
  });
}

/** Register a meeting platform connector configuration. */
export function registerMeetingConnector(config: MeetingConnectorConfig): void {
  MeetingConnectorConfigSchema.parse(config);
  connectorConfigs.set(config.platform, config);
}

/** Get a meeting platform connector configuration. */
export function getMeetingConnector(platform: MeetingPlatform): MeetingConnectorConfig | undefined {
  return connectorConfigs.get(platform);
}

/** Check if a transcript passes the connector's filter criteria. */
export function passesFilters(
  transcript: MeetingTranscript,
  config: MeetingConnectorConfig
): boolean {
  const filters = config.filters;
  if (!filters) return true;

  if (filters.minDuration && transcript.duration < filters.minDuration) return false;

  if (filters.titlePatterns?.length) {
    const matched = filters.titlePatterns.some((p) => new RegExp(p, "i").test(transcript.title));
    if (!matched) return false;
  }

  if (filters.excludePatterns?.length) {
    const excluded = filters.excludePatterns.some((p) => new RegExp(p, "i").test(transcript.title));
    if (excluded) return false;
  }

  return true;
}

/** Clear all meeting intelligence data. */
export function clearMeetingIntelligenceData(): void {
  transcripts.clear();
  extractions.clear();
  connectorConfigs.clear();
  signalIdCounter = 0;
}
