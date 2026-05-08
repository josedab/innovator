/**
 * @module voice
 *
 * Voice-driven innovation sessions — types and interfaces for accepting
 * voice input, text-to-speech narration, and conversational voice commands.
 * Provides integration points for Web Speech API (browser) and Whisper (CLI).
 */

import { z } from "zod";

// ---- Zod Schemas ----

/** Voice command types for hands-free innovation. */
export const VOICE_COMMANDS = [
  "investigate",
  "next-angle",
  "previous-angle",
  "score-this",
  "refine",
  "export",
  "summarize",
  "stop",
  "help",
] as const;

export const VoiceCommandSchema = z.enum(VOICE_COMMANDS);
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;

/** Schema for voice session configuration. */
export const VoiceConfigSchema = z.object({
  /** Speech recognition engine. */
  engine: z.enum(["web-speech-api", "whisper", "none"]).default("none"),
  /** Language/locale for recognition. */
  locale: z.string().max(20).default("en-US"),
  /** Enable text-to-speech narration. */
  narrationEnabled: z.boolean().default(false),
  /** TTS voice identifier. */
  voice: z.string().max(200).optional(),
  /** TTS speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast). */
  speechRate: z.number().min(0.25).max(4.0).default(1.0),
  /** TTS pitch (0.5 = low, 1.0 = normal, 2.0 = high). */
  pitch: z.number().min(0.1).max(2.0).default(1.0),
  /** Enable continuous listening mode. */
  continuousListening: z.boolean().default(false),
  /** Wake word to activate voice commands. */
  wakeWord: z.string().max(50).optional(),
});

/** Schema for a transcribed voice input. */
export const VoiceTranscriptSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  isFinal: z.boolean(),
  timestamp: z.string(),
  locale: z.string().optional(),
});

/** Schema for a parsed voice command. */
export const ParsedVoiceCommandSchema = z.object({
  command: VoiceCommandSchema,
  argument: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rawTranscript: z.string(),
});

/** Schema for a narration segment. */
export const NarrationSegmentSchema = z.object({
  text: z.string(),
  type: z.enum(["heading", "body", "emphasis", "list-item", "summary"]),
  pauseAfterMs: z.number().default(500),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;
export type VoiceTranscript = z.infer<typeof VoiceTranscriptSchema>;
export type ParsedVoiceCommand = z.infer<typeof ParsedVoiceCommandSchema>;
export type NarrationSegment = z.infer<typeof NarrationSegmentSchema>;

// ---- Voice Command Parser ----

/** Command patterns for matching voice input to commands. */
const COMMAND_PATTERNS: Array<{ command: VoiceCommand; patterns: RegExp[] }> = [
  {
    command: "investigate",
    patterns: [/^investigate\s+(.+)/i, /^look into\s+(.+)/i, /^research\s+(.+)/i],
  },
  { command: "next-angle", patterns: [/^next\s*(angle)?/i, /^next\s+one/i, /^continue/i] },
  { command: "previous-angle", patterns: [/^previous\s*(angle)?/i, /^go\s+back/i, /^back/i] },
  {
    command: "score-this",
    patterns: [/^score\s+(this|these|it)/i, /^rate\s+(this|these|it)/i, /^evaluate/i],
  },
  { command: "refine", patterns: [/^refine\s*(.*)/i, /^improve\s*(.*)/i, /^make\s+better/i] },
  { command: "export", patterns: [/^export\s*(.*)/i, /^save\s*(.*)/i, /^download/i] },
  {
    command: "summarize",
    patterns: [
      /^summar(ize|y)\s*(.*)/i,
      /^what\s+are\s+the\s+results/i,
      /^give\s+me\s+a\s+summary/i,
    ],
  },
  { command: "stop", patterns: [/^stop/i, /^cancel/i, /^quit/i, /^end\s+session/i] },
  { command: "help", patterns: [/^help/i, /^what\s+can\s+(I|you)\s+(say|do)/i, /^commands/i] },
];

/**
 * Parse a voice transcript into a structured command.
 *
 * @param transcript - The transcribed voice input
 * @returns Parsed command or undefined if no command matched
 */
export function parseVoiceCommand(transcript: VoiceTranscript): ParsedVoiceCommand | undefined {
  const text = transcript.text.trim();

  for (const { command, patterns } of COMMAND_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          command,
          argument: match[1]?.trim() || undefined,
          confidence: transcript.confidence,
          rawTranscript: text,
        };
      }
    }
  }

  return undefined;
}

// ---- Narration Builder ----

/**
 * Build narration segments from investigation results for TTS.
 *
 * @param data - Investigation results data
 * @returns Array of narration segments
 */
export function buildNarrationSegments(data: {
  subject?: string;
  summary?: string;
  topIdeas?: Array<{ title: string; description: string }>;
  themes?: string[];
  recommendation?: string;
}): NarrationSegment[] {
  const segments: NarrationSegment[] = [];

  if (data.subject) {
    segments.push({
      text: `Innovation results for: ${data.subject}`,
      type: "heading",
      pauseAfterMs: 1000,
    });
  }

  if (data.summary) {
    segments.push({
      text: data.summary,
      type: "body",
      pauseAfterMs: 800,
    });
  }

  if (data.topIdeas && data.topIdeas.length > 0) {
    segments.push({
      text: `Here are the top ${data.topIdeas.length} ideas:`,
      type: "heading",
      pauseAfterMs: 600,
    });

    for (const idea of data.topIdeas) {
      segments.push({
        text: `${idea.title}: ${idea.description}`,
        type: "list-item",
        pauseAfterMs: 800,
      });
    }
  }

  if (data.themes && data.themes.length > 0) {
    segments.push({
      text: `Cross-cutting themes identified: ${data.themes.join(", ")}`,
      type: "body",
      pauseAfterMs: 600,
    });
  }

  if (data.recommendation) {
    segments.push({
      text: `Recommendation: ${data.recommendation}`,
      type: "summary",
      pauseAfterMs: 1000,
    });
  }

  return segments;
}

/**
 * Get help text for available voice commands.
 */
export function getVoiceCommandHelp(): string {
  return `Available voice commands:
• "Investigate [topic]" — Start investigating a subject
• "Next angle" — Move to the next innovation angle
• "Previous angle" — Go back to the previous angle
• "Score this" — Score and rank current ideas
• "Refine [instruction]" — Refine current ideas with specific guidance
• "Export" — Export results to file
• "Summarize" — Get a summary of current results
• "Stop" — Stop the current operation
• "Help" — Show this help message`;
}

// ---- Speech Provider Interface ----

/** Interface for speech recognition providers. */
export interface SpeechRecognitionProvider {
  id: string;
  name: string;
  /** Start listening for speech input. */
  start(config: VoiceConfig): void;
  /** Stop listening. */
  stop(): void;
  /** Check if currently listening. */
  isListening(): boolean;
  /** Register callback for transcription results. */
  onTranscript(callback: (transcript: VoiceTranscript) => void): void;
  /** Register callback for errors. */
  onError(callback: (error: Error) => void): void;
}

/** Interface for text-to-speech providers. */
export interface TextToSpeechProvider {
  id: string;
  name: string;
  /** Speak the given text. */
  speak(text: string, config: VoiceConfig): Promise<void>;
  /** Stop speaking. */
  stop(): void;
  /** Check if currently speaking. */
  isSpeaking(): boolean;
  /** List available voices. */
  listVoices(): Array<{ id: string; name: string; locale: string }>;
}

// Provider registries
const sttProviders: Map<string, SpeechRecognitionProvider> = new Map();
const ttsProviders: Map<string, TextToSpeechProvider> = new Map();

/** Register a speech recognition provider. */
export function registerSTTProvider(provider: SpeechRecognitionProvider): void {
  sttProviders.set(provider.id, provider);
}

/** Register a text-to-speech provider. */
export function registerTTSProvider(provider: TextToSpeechProvider): void {
  ttsProviders.set(provider.id, provider);
}

/** Get a speech recognition provider by ID. */
export function getSTTProvider(id: string): SpeechRecognitionProvider | undefined {
  return sttProviders.get(id);
}

/** Get a text-to-speech provider by ID. */
export function getTTSProvider(id: string): TextToSpeechProvider | undefined {
  return ttsProviders.get(id);
}

/** List all registered STT providers. */
export function listSTTProviders(): SpeechRecognitionProvider[] {
  return Array.from(sttProviders.values());
}

/** List all registered TTS providers. */
export function listTTSProviders(): TextToSpeechProvider[] {
  return Array.from(ttsProviders.values());
}

/** Clear all voice providers. */
export function clearVoiceProviders(): void {
  sttProviders.clear();
  ttsProviders.clear();
}

// ---- VoiceSession State Machine ----

export const VoiceSessionStateSchema = z.enum([
  "idle",
  "listening",
  "processing",
  "speaking",
  "thinking-aloud",
  "paused",
  "error",
  "ended",
]);

export const VoiceSessionSchema = z.object({
  id: z.string().max(100),
  state: VoiceSessionStateSchema,
  config: VoiceConfigSchema,
  subject: z.string().max(500).optional(),
  transcripts: z.array(VoiceTranscriptSchema),
  commands: z.array(ParsedVoiceCommandSchema),
  narrationQueue: z.array(NarrationSegmentSchema),
  thinkingAloudBuffer: z.array(
    z.object({
      text: z.string().max(5000),
      timestamp: z.string(),
      structured: z.boolean().default(false),
    })
  ),
  startedAt: z.string(),
  lastActivityAt: z.string(),
});

export type VoiceSessionState = z.infer<typeof VoiceSessionStateSchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

// State machine transitions
const VALID_TRANSITIONS: Record<VoiceSessionState, VoiceSessionState[]> = {
  idle: ["listening", "ended"],
  listening: ["processing", "thinking-aloud", "paused", "error", "ended"],
  processing: ["speaking", "listening", "error", "ended"],
  speaking: ["listening", "paused", "ended"],
  "thinking-aloud": ["processing", "listening", "paused", "ended"],
  paused: ["listening", "thinking-aloud", "ended"],
  error: ["listening", "idle", "ended"],
  ended: [],
};

const voiceSessions = new Map<string, VoiceSession>();

/** Create a new voice session. */
export function createVoiceSession(config?: Partial<VoiceConfig>): VoiceSession {
  const id = `vsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const session: VoiceSession = {
    id,
    state: "idle",
    config: VoiceConfigSchema.parse(config ?? {}),
    transcripts: [],
    commands: [],
    narrationQueue: [],
    thinkingAloudBuffer: [],
    startedAt: now,
    lastActivityAt: now,
  };

  voiceSessions.set(id, session);
  return session;
}

/** Get a voice session by ID. */
export function getVoiceSession(id: string): VoiceSession | undefined {
  return voiceSessions.get(id);
}

/** Transition a voice session to a new state. */
export function transitionVoiceSession(sessionId: string, newState: VoiceSessionState): boolean {
  const session = voiceSessions.get(sessionId);
  if (!session) return false;

  const valid = VALID_TRANSITIONS[session.state];
  if (!valid.includes(newState)) return false;

  session.state = newState;
  session.lastActivityAt = new Date().toISOString();
  return true;
}

/** Add a transcript to a voice session. */
export function addVoiceTranscript(
  sessionId: string,
  transcript: VoiceTranscript
): ParsedVoiceCommand | undefined {
  const session = voiceSessions.get(sessionId);
  if (!session) return undefined;

  session.transcripts.push(transcript);
  session.lastActivityAt = new Date().toISOString();

  // If in thinking-aloud mode, buffer the text
  if (session.state === "thinking-aloud") {
    session.thinkingAloudBuffer.push({
      text: transcript.text,
      timestamp: transcript.timestamp,
      structured: false,
    });
    return undefined;
  }

  // Try to parse as a command
  const command = parseVoiceCommand(transcript);
  if (command) {
    session.commands.push(command);
  }

  return command;
}

/** Queue narration segments for TTS. */
export function queueNarration(sessionId: string, segments: NarrationSegment[]): boolean {
  const session = voiceSessions.get(sessionId);
  if (!session) return false;

  session.narrationQueue.push(...segments);
  return true;
}

/** Get and clear the next narration segment. */
export function dequeueNarration(sessionId: string): NarrationSegment | undefined {
  const session = voiceSessions.get(sessionId);
  if (!session) return undefined;
  return session.narrationQueue.shift();
}

/**
 * Structure thinking-aloud buffer into coherent ideas.
 * Extracts key themes and ideas from free-form spoken input.
 */
export function structureThinkingAloud(sessionId: string): Array<{
  theme: string;
  ideas: string[];
  rawText: string;
}> {
  const session = voiceSessions.get(sessionId);
  if (!session || session.thinkingAloudBuffer.length === 0) return [];

  const fullText = session.thinkingAloudBuffer.map((b) => b.text).join(" ");

  // Simple structuring: split by sentence boundaries and group by keywords
  const sentences = fullText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const themes = new Map<string, string[]>();
  const keywords = ["could", "should", "might", "idea", "what if", "maybe", "think", "consider"];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const matchedKeyword = keywords.find((k) => lower.includes(k));
    const theme = matchedKeyword ?? "general";

    const existing = themes.get(theme) ?? [];
    existing.push(sentence);
    themes.set(theme, existing);
  }

  // Mark buffer as structured
  for (const entry of session.thinkingAloudBuffer) {
    entry.structured = true;
  }

  return Array.from(themes.entries()).map(([theme, ideas]) => ({
    theme,
    ideas,
    rawText: ideas.join(". "),
  }));
}

/** End a voice session. */
export function endVoiceSession(sessionId: string): VoiceSession | undefined {
  const session = voiceSessions.get(sessionId);
  if (!session) return undefined;

  session.state = "ended";
  session.lastActivityAt = new Date().toISOString();
  return session;
}

/** List all active voice sessions. */
export function listVoiceSessions(): VoiceSession[] {
  return Array.from(voiceSessions.values()).filter((s) => s.state !== "ended");
}

/** Clear all voice sessions (for testing). */
export function clearVoiceSessions(): void {
  voiceSessions.clear();
}
