/**
 * @module meeting-intelligence/live-copilot
 *
 * Real-time meeting copilot that detects innovation moments as they happen
 * and surfaces relevant past ideas from the knowledge graph.
 * Provides live suggestion engine with buffered transcript processing.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Live Session Schemas ----

export const InnovationMomentTypeSchema = z.enum([
  "idea_spark",
  "problem_identified",
  "opportunity_spotted",
  "creative_connection",
  "challenge_raised",
  "decision_point",
  "consensus_forming",
  "divergent_thinking",
]);
export type InnovationMomentType = z.infer<typeof InnovationMomentTypeSchema>;

export const InnovationMomentSchema = z.object({
  id: z.string(),
  type: InnovationMomentTypeSchema,
  timestamp: z.string(),
  speaker: z.string().max(200).optional(),
  trigger: z.string().max(2000),
  summary: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string().max(500)).max(5),
  relatedPastIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        relevance: z.number().min(0).max(1),
        sourceSession: z.string().max(200).optional(),
      })
    )
    .max(5),
});
export type InnovationMoment = z.infer<typeof InnovationMomentSchema>;

export const LiveSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(["follow_up", "investigation", "angle", "connection", "challenge"]),
  text: z.string().max(1000),
  priority: z.enum(["low", "medium", "high"]),
  context: z.string().max(500).optional(),
  createdAt: z.string(),
});
export type LiveSuggestion = z.infer<typeof LiveSuggestionSchema>;

export const LiveSessionSchema = z.object({
  id: z.string(),
  meetingTitle: z.string().max(500),
  platform: z.string().max(100),
  status: z.enum(["active", "paused", "ended"]),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  transcriptBuffer: z.array(
    z.object({
      speaker: z.string().max(200),
      text: z.string().max(5000),
      timestamp: z.string(),
    })
  ),
  moments: z.array(InnovationMomentSchema),
  suggestions: z.array(LiveSuggestionSchema),
  stats: z.object({
    totalMoments: z.number().int().min(0),
    totalSuggestions: z.number().int().min(0),
    segmentsProcessed: z.number().int().min(0),
    avgMomentConfidence: z.number().min(0).max(1),
  }),
});
export type LiveSession = z.infer<typeof LiveSessionSchema>;

// ---- Known Idea Store (simulating knowledge graph) ----

interface KnownIdea {
  title: string;
  description: string;
  tags: string[];
  sessionId?: string;
}

const knownIdeas: KnownIdea[] = [];

/** Register known ideas for the copilot to reference. */
export function registerKnownIdeas(ideas: KnownIdea[]): void {
  knownIdeas.push(...ideas);
}

/** Clear known ideas (for testing). */
export function clearKnownIdeas(): void {
  knownIdeas.length = 0;
}

// ---- In-Memory Session Store ----

const liveSessions = new Map<string, LiveSession>();

// ---- Live Session Management ----

/**
 * Start a new live meeting copilot session.
 */
export function startLiveSession(input: { meetingTitle: string; platform: string }): LiveSession {
  const session: LiveSession = LiveSessionSchema.parse({
    id: randomUUID(),
    meetingTitle: input.meetingTitle,
    platform: input.platform,
    status: "active",
    startedAt: new Date().toISOString(),
    transcriptBuffer: [],
    moments: [],
    suggestions: [],
    stats: {
      totalMoments: 0,
      totalSuggestions: 0,
      segmentsProcessed: 0,
      avgMomentConfidence: 0,
    },
  });

  liveSessions.set(session.id, session);
  return session;
}

/** Get a live session. */
export function getLiveSession(sessionId: string): LiveSession | undefined {
  return liveSessions.get(sessionId);
}

/** List all live sessions. */
export function listLiveSessions(): LiveSession[] {
  return Array.from(liveSessions.values());
}

/**
 * Feed a transcript segment to the live copilot.
 * Analyzes the segment for innovation moments and generates suggestions.
 */
export async function feedTranscriptSegment(
  sessionId: string,
  segment: { speaker: string; text: string; timestamp?: string },
  options?: { model?: string; signal?: AbortSignal }
): Promise<{
  moments: InnovationMoment[];
  suggestions: LiveSuggestion[];
}> {
  const session = liveSessions.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Session not found or not active");
  }

  const entry = {
    speaker: segment.speaker,
    text: segment.text,
    timestamp: segment.timestamp ?? new Date().toISOString(),
  };
  session.transcriptBuffer.push(entry);
  session.stats.segmentsProcessed++;

  // Detect innovation moments
  const moments = await detectInnovationMoments(segment, session, options);

  // Generate suggestions based on moments
  const suggestions = generateLiveSuggestions(moments, session);

  // Update session
  session.moments.push(...moments);
  session.suggestions.push(...suggestions);
  session.stats.totalMoments += moments.length;
  session.stats.totalSuggestions += suggestions.length;

  if (session.moments.length > 0) {
    session.stats.avgMomentConfidence =
      session.moments.reduce((s, m) => s + m.confidence, 0) / session.moments.length;
  }

  liveSessions.set(sessionId, session);

  return { moments, suggestions };
}

/**
 * End a live session and produce a summary.
 */
export function endLiveSession(sessionId: string): LiveSession | undefined {
  const session = liveSessions.get(sessionId);
  if (!session) return undefined;

  session.status = "ended";
  session.endedAt = new Date().toISOString();
  liveSessions.set(sessionId, session);
  return session;
}

/** Pause a live session. */
export function pauseLiveSession(sessionId: string): boolean {
  const session = liveSessions.get(sessionId);
  if (!session || session.status !== "active") return false;
  session.status = "paused";
  return true;
}

/** Resume a paused session. */
export function resumeLiveSession(sessionId: string): boolean {
  const session = liveSessions.get(sessionId);
  if (!session || session.status !== "paused") return false;
  session.status = "active";
  return true;
}

// ---- Innovation Moment Detection ----

const MOMENT_PATTERNS: Array<{
  type: InnovationMomentType;
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    type: "idea_spark",
    patterns: [
      /what if we/i,
      /we could/i,
      /idea:/i,
      /how about/i,
      /imagine if/i,
      /why don't we/i,
      /we should/i,
    ],
    confidence: 0.75,
  },
  {
    type: "problem_identified",
    patterns: [
      /the problem is/i,
      /pain point/i,
      /challenge (is|we)/i,
      /struggling with/i,
      /difficulty/i,
      /bottleneck/i,
    ],
    confidence: 0.8,
  },
  {
    type: "opportunity_spotted",
    patterns: [
      /opportunity/i,
      /market gap/i,
      /potential/i,
      /growth area/i,
      /untapped/i,
      /emerging/i,
    ],
    confidence: 0.7,
  },
  {
    type: "creative_connection",
    patterns: [
      /reminds me of/i,
      /similar to/i,
      /like.*in/i,
      /cross.*(domain|industry)/i,
      /borrow.*from/i,
    ],
    confidence: 0.65,
  },
  {
    type: "challenge_raised",
    patterns: [/but.*risk/i, /concern.*is/i, /obstacle/i, /won't work because/i, /blocker/i],
    confidence: 0.7,
  },
  {
    type: "decision_point",
    patterns: [
      /let's decide/i,
      /we need to choose/i,
      /should we/i,
      /go with option/i,
      /consensus/i,
    ],
    confidence: 0.75,
  },
  {
    type: "divergent_thinking",
    patterns: [
      /different approach/i,
      /alternative/i,
      /another way/i,
      /flip.*on its head/i,
      /opposite/i,
      /contrarian/i,
    ],
    confidence: 0.7,
  },
];

async function detectInnovationMoments(
  segment: { speaker: string; text: string; timestamp?: string },
  session: LiveSession,
  options?: { model?: string; signal?: AbortSignal }
): Promise<InnovationMoment[]> {
  const moments: InnovationMoment[] = [];
  const text = segment.text;

  // Pattern-based detection
  for (const pattern of MOMENT_PATTERNS) {
    const matched = pattern.patterns.some((p) => p.test(text));
    if (matched) {
      const relatedPastIdeas = findRelatedIdeas(text);

      moments.push(
        InnovationMomentSchema.parse({
          id: randomUUID(),
          type: pattern.type,
          timestamp: segment.timestamp ?? new Date().toISOString(),
          speaker: segment.speaker,
          trigger: text.slice(0, 2000),
          summary: buildMomentSummary(pattern.type, text),
          confidence: pattern.confidence,
          suggestions: buildMomentSuggestions(pattern.type),
          relatedPastIdeas,
        })
      );
    }
  }

  // For high-value text, try LLM-based detection
  if (text.length > 100 && moments.length === 0) {
    try {
      const llmMoments = await detectWithLLM(text, segment.speaker, options);
      moments.push(...llmMoments);
    } catch {
      // LLM detection is optional
    }
  }

  return moments;
}

function buildMomentSummary(type: InnovationMomentType, text: string): string {
  const prefix: Record<InnovationMomentType, string> = {
    idea_spark: "💡 New idea proposed",
    problem_identified: "🔍 Problem identified",
    opportunity_spotted: "🎯 Opportunity spotted",
    creative_connection: "🔗 Creative connection made",
    challenge_raised: "⚠️ Challenge raised",
    decision_point: "🔀 Decision point reached",
    consensus_forming: "🤝 Consensus forming",
    divergent_thinking: "🔄 Divergent thinking",
  };
  return `${prefix[type]}: ${text.slice(0, 150)}`;
}

function buildMomentSuggestions(type: InnovationMomentType): string[] {
  const suggestions: Record<InnovationMomentType, string[]> = {
    idea_spark: [
      "Explore this idea further with SCAMPER analysis",
      "Run a quick investigation on this concept",
    ],
    problem_identified: [
      "Investigate root causes with First Principles",
      "Look for existing solutions in adjacent domains",
    ],
    opportunity_spotted: [
      "Validate market size and timing",
      "Generate ideas targeting this opportunity",
    ],
    creative_connection: [
      "Deepen this cross-domain connection",
      "Explore analogies from the referenced domain",
    ],
    challenge_raised: [
      "Reframe using Inversion thinking",
      "Identify constraints that could become advantages",
    ],
    decision_point: [
      "Compare options using stakeholder simulation",
      "Run scenario modeling for each alternative",
    ],
    consensus_forming: ["Document the emerging consensus", "Test assumptions before committing"],
    divergent_thinking: [
      "Expand on this alternative perspective",
      "Use What-If analysis to explore implications",
    ],
  };
  return suggestions[type] ?? [];
}

function findRelatedIdeas(text: string): Array<{
  title: string;
  relevance: number;
  sourceSession?: string;
}> {
  if (knownIdeas.length === 0) return [];

  const textWords = new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  return knownIdeas
    .map((idea) => {
      const ideaWords = `${idea.title} ${idea.description} ${idea.tags.join(" ")}`
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);

      const matches = ideaWords.filter((w) => textWords.has(w)).length;
      const relevance = Math.min(1, (matches / Math.max(1, ideaWords.length)) * 3);

      return { title: idea.title, relevance, sourceSession: idea.sessionId };
    })
    .filter((r) => r.relevance > 0.1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);
}

async function detectWithLLM(
  text: string,
  speaker: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<InnovationMoment[]> {
  const prompt = `Analyze this meeting segment for innovation moments:
${wrapUserInput("SPEAKER", speaker)}
${wrapUserInput("TEXT", text.slice(0, 3000))}

If there are innovation-relevant moments (ideas, problems, opportunities, creative connections), respond with JSON:
{ "moments": [{ "type": "idea_spark|problem_identified|opportunity_spotted|creative_connection", "summary": "brief summary", "confidence": 0.7 }] }
If not innovative, respond: { "moments": [] }`;

  const raw = await withRetry(
    () => generateText({ prompt, model: options?.model, signal: options?.signal }),
    { signal: options?.signal }
  );

  const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
  if (!Array.isArray(parsed.moments)) return [];

  return parsed.moments.slice(0, 3).map((m: Record<string, unknown>) =>
    InnovationMomentSchema.parse({
      id: randomUUID(),
      type: [
        "idea_spark",
        "problem_identified",
        "opportunity_spotted",
        "creative_connection",
      ].includes(String(m.type))
        ? m.type
        : "idea_spark",
      timestamp: new Date().toISOString(),
      speaker,
      trigger: text.slice(0, 2000),
      summary: String(m.summary ?? text.slice(0, 150)),
      confidence: Number(m.confidence ?? 0.5),
      suggestions: [],
      relatedPastIdeas: findRelatedIdeas(text),
    })
  );
}

function generateLiveSuggestions(
  moments: InnovationMoment[],
  _session: LiveSession
): LiveSuggestion[] {
  const suggestions: LiveSuggestion[] = [];

  for (const moment of moments) {
    if (moment.confidence >= 0.7) {
      suggestions.push(
        LiveSuggestionSchema.parse({
          id: randomUUID(),
          type:
            moment.type === "idea_spark"
              ? "investigation"
              : moment.type === "problem_identified"
                ? "follow_up"
                : moment.type === "creative_connection"
                  ? "connection"
                  : "follow_up",
          text: moment.suggestions[0] ?? `Follow up on: ${moment.summary.slice(0, 200)}`,
          priority: moment.confidence >= 0.85 ? "high" : "medium",
          context: moment.trigger.slice(0, 500),
          createdAt: new Date().toISOString(),
        })
      );
    }
  }

  return suggestions;
}

// ---- Markdown Export ----

/** Export a live session summary as markdown. */
export function liveSessionToMarkdown(session: LiveSession): string {
  const lines: string[] = [
    `# Meeting Copilot: ${session.meetingTitle}`,
    "",
    `**Platform:** ${session.platform}`,
    `**Status:** ${session.status}`,
    `**Started:** ${session.startedAt}`,
    session.endedAt ? `**Ended:** ${session.endedAt}` : "",
    `**Segments Processed:** ${session.stats.segmentsProcessed}`,
    `**Innovation Moments:** ${session.stats.totalMoments}`,
    `**Suggestions Generated:** ${session.stats.totalSuggestions}`,
    "",
  ];

  if (session.moments.length > 0) {
    lines.push("## Innovation Moments");
    lines.push("");
    const sorted = [...session.moments].sort((a, b) => b.confidence - a.confidence);
    for (const m of sorted) {
      lines.push(`### ${m.summary}`);
      lines.push(
        `*Type: ${m.type} | Confidence: ${(m.confidence * 100).toFixed(0)}%${m.speaker ? ` | Speaker: ${m.speaker}` : ""}*`
      );
      lines.push("");
      if (m.suggestions.length > 0) {
        lines.push("**Suggestions:**");
        for (const s of m.suggestions) {
          lines.push(`- ${s}`);
        }
      }
      if (m.relatedPastIdeas.length > 0) {
        lines.push("**Related past ideas:**");
        for (const idea of m.relatedPastIdeas) {
          lines.push(`- ${idea.title} (${(idea.relevance * 100).toFixed(0)}% relevant)`);
        }
      }
      lines.push("");
    }
  }

  if (session.suggestions.length > 0) {
    const highPriority = session.suggestions.filter((s) => s.priority === "high");
    if (highPriority.length > 0) {
      lines.push("## High-Priority Suggestions");
      lines.push("");
      for (const s of highPriority) {
        lines.push(`- **[${s.type}]** ${s.text}`);
      }
      lines.push("");
    }
  }

  return lines.filter(Boolean).join("\n");
}

/** Clear all live sessions (for testing). */
export function clearLiveSessions(): void {
  liveSessions.clear();
}
