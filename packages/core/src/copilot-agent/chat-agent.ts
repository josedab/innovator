/**
 * @module copilot-agent/chat-agent
 *
 * Innovation Co-Pilot Chat Agent — persistent conversational agent that guides
 * users through the innovation pipeline with context-aware follow-ups, proactive
 * suggestions, and natural-language control of all modules.
 *
 * Components:
 * - Conversational Router: NLU intent classifier mapping natural language to module invocations
 * - Context Manager: session-aware conversation state tracking
 * - Proactive Suggestions: after each step, suggests logical next actions
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Intent Classification ----

export const ChatIntentSchema = z.enum([
  "investigate",
  "generate-ideas",
  "score-ideas",
  "synthesize",
  "run-pipeline",
  "refine-idea",
  "compare-models",
  "export-results",
  "search-history",
  "validate-idea",
  "create-artifact",
  "manage-session",
  "ask-question",
  "set-preference",
  "help",
  "unknown",
]);
export type ChatIntent = z.infer<typeof ChatIntentSchema>;

export const ClassifiedIntentSchema = z.object({
  intent: ChatIntentSchema,
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string().max(500)).default({}),
  parameters: z.record(z.unknown()).default({}),
  originalMessage: z.string().max(5000),
});
export type ClassifiedIntent = z.infer<typeof ClassifiedIntentSchema>;

// ---- Chat Session State ----

export const ChatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(50000),
  intent: ChatIntentSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  timestamp: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatSessionStateSchema = z.object({
  currentSubject: z.string().max(500).optional(),
  lastInvestigationId: z.string().max(100).optional(),
  lastAngleResults: z.array(z.string().max(100)).default([]),
  lastSynthesisId: z.string().max(100).optional(),
  preferences: z.record(z.string().max(500)).default({}),
  pipelineStage: z.enum([
    "idle",
    "investigating",
    "generating",
    "scoring",
    "synthesizing",
    "complete",
  ]).default("idle"),
  activeAngles: z.array(z.string().max(100)).default([]),
  ideaCount: z.number().int().min(0).default(0),
});
export type ChatSessionState = z.infer<typeof ChatSessionStateSchema>;

export const ChatSessionSchema = z.object({
  id: z.string().max(100),
  messages: z.array(ChatMessageSchema).max(500),
  state: ChatSessionStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

// ---- Proactive Suggestions ----

export const SuggestionSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(500),
  intent: ChatIntentSchema,
  priority: z.enum(["high", "medium", "low"]),
  reason: z.string().max(300),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const ChatResponseSchema = z.object({
  message: z.string().max(50000),
  intent: ChatIntentSchema,
  suggestions: z.array(SuggestionSchema).max(5),
  stateUpdate: ChatSessionStateSchema.partial().optional(),
  actionTaken: z.string().max(500).optional(),
});
export type ChatAgentResponse = z.infer<typeof ChatResponseSchema>;

// ---- In-Memory Store ----

const chatSessions = new Map<string, ChatSession>();

// ---- Intent Classification ----

const INTENT_KEYWORDS: Record<ChatIntent, string[]> = {
  investigate: ["investigate", "research", "explore", "look into", "analyze", "study", "examine"],
  "generate-ideas": ["generate", "brainstorm", "ideate", "create ideas", "come up with", "think of"],
  "score-ideas": ["score", "rate", "evaluate", "rank", "assess", "prioritize"],
  synthesize: ["synthesize", "summarize", "combine", "merge", "consolidate"],
  "run-pipeline": ["run pipeline", "auto mode", "full pipeline", "end to end", "complete analysis"],
  "refine-idea": ["refine", "improve", "iterate", "enhance", "develop further", "drill down"],
  "compare-models": ["compare models", "model comparison", "benchmark", "which model"],
  "export-results": ["export", "download", "save as", "generate report", "share"],
  "search-history": ["history", "past sessions", "previous", "find session", "search sessions"],
  "validate-idea": ["validate", "check feasibility", "market check", "patent check"],
  "create-artifact": ["create prd", "tech spec", "pitch deck", "artifact", "document"],
  "manage-session": ["new session", "clear", "reset", "start over", "save session"],
  "ask-question": ["what is", "how does", "explain", "tell me about", "why"],
  "set-preference": ["set model", "use model", "prefer", "configure", "settings"],
  help: ["help", "what can you do", "commands", "guide", "how to use"],
  unknown: [],
};

/**
 * Classify user intent using keyword matching with LLM fallback.
 */
export async function classifyIntent(
  message: string,
  sessionState?: ChatSessionState,
  model?: string,
  signal?: AbortSignal
): Promise<ClassifiedIntent> {
  const lowerMessage = message.toLowerCase().trim();

  // Fast keyword-based classification
  let bestIntent: ChatIntent = "unknown";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        const score = keyword.length / lowerMessage.length;
        if (score > bestScore) {
          bestScore = score;
          bestIntent = intent as ChatIntent;
        }
      }
    }
  }

  if (bestScore > 0.15) {
    return {
      intent: bestIntent,
      confidence: Math.min(bestScore * 3, 0.95),
      entities: extractEntities(message),
      parameters: {},
      originalMessage: message,
    };
  }

  // LLM-based classification for ambiguous inputs
  try {
    const prompt = buildClassificationPrompt(message, sessionState);
    const result = await withRetry(
      async () => {
        const raw = await generateText({ prompt, model, signal });
        return ClassifiedIntentSchema.parse(
          JSON.parse(extractJson(sanitizeLlmOutput(raw)))
        );
      },
      { signal, maxAttempts: 2 }
    );
    return { ...result, originalMessage: message };
  } catch {
    return {
      intent: "ask-question",
      confidence: 0.3,
      entities: extractEntities(message),
      parameters: {},
      originalMessage: message,
    };
  }
}

function extractEntities(message: string): Record<string, string> {
  const entities: Record<string, string> = {};

  // Extract quoted subjects
  const quoted = message.match(/"([^"]+)"/);
  if (quoted) entities.subject = quoted[1];

  // Extract model names
  const modelMatch = message.match(/\b(gpt-4[.\w-]*|claude[\w.-]*|o[13]-\w+|mistral[\w.-]*)\b/i);
  if (modelMatch) entities.model = modelMatch[1];

  // Extract angle names
  const angleMatch = message.match(/\b(scamper|first.principles|biomimicry|reverse|lateral|blue.ocean)\b/i);
  if (angleMatch) entities.angle = angleMatch[1].toLowerCase();

  return entities;
}

function buildClassificationPrompt(message: string, state?: ChatSessionState): string {
  const intents = ChatIntentSchema.options.join(", ");
  const stateContext = state
    ? `Current pipeline stage: ${state.pipelineStage}. Subject: ${state.currentSubject ?? "none"}.`
    : "";

  return `Classify the user's intent for an innovation platform.

Available intents: ${intents}

${stateContext}

${wrapUserInput("USER_MESSAGE", message)}

Respond in JSON:
{
  "intent": "one-of-the-intents",
  "confidence": 0.0-1.0,
  "entities": { "subject": "extracted subject if any", "model": "model name if any" },
  "parameters": {}
}`;
}

// ---- Proactive Suggestions ----

const STAGE_SUGGESTIONS: Record<string, Suggestion[]> = {
  idle: [
    { id: "s1", text: "Investigate a new subject", intent: "investigate", priority: "high", reason: "Start your innovation journey" },
    { id: "s2", text: "Search past sessions for inspiration", intent: "search-history", priority: "medium", reason: "Build on previous work" },
    { id: "s3", text: "Run a full auto pipeline", intent: "run-pipeline", priority: "medium", reason: "Get end-to-end results quickly" },
  ],
  investigating: [
    { id: "s4", text: "Generate ideas from this investigation", intent: "generate-ideas", priority: "high", reason: "Turn findings into actionable ideas" },
    { id: "s5", text: "Drill deeper into a specific aspect", intent: "refine-idea", priority: "medium", reason: "Explore sub-topics" },
  ],
  generating: [
    { id: "s6", text: "Score and prioritize these ideas", intent: "score-ideas", priority: "high", reason: "Identify the most promising ideas" },
    { id: "s7", text: "Synthesize results across all angles", intent: "synthesize", priority: "high", reason: "Get a unified view" },
  ],
  scoring: [
    { id: "s8", text: "Create a PRD for the top idea", intent: "create-artifact", priority: "high", reason: "Move from idea to action" },
    { id: "s9", text: "Validate the top ideas", intent: "validate-idea", priority: "medium", reason: "Check feasibility and market fit" },
  ],
  synthesizing: [
    { id: "s10", text: "Export results as a report", intent: "export-results", priority: "high", reason: "Share findings with your team" },
    { id: "s11", text: "Refine a specific idea further", intent: "refine-idea", priority: "medium", reason: "Deepen the most promising idea" },
  ],
  complete: [
    { id: "s12", text: "Start a new investigation", intent: "investigate", priority: "medium", reason: "Explore a new direction" },
    { id: "s13", text: "Export and share results", intent: "export-results", priority: "high", reason: "Distribute your findings" },
    { id: "s14", text: "Compare with different models", intent: "compare-models", priority: "low", reason: "See how other LLMs approach this" },
  ],
};

/**
 * Generate proactive suggestions based on current session state.
 */
export function getProactiveSuggestions(state: ChatSessionState): Suggestion[] {
  const stage = state.pipelineStage;
  return STAGE_SUGGESTIONS[stage] ?? STAGE_SUGGESTIONS.idle;
}

// ---- Chat Session Management ----

/**
 * Create a new chat session.
 */
export function createChatSession(): ChatSession {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: randomUUID(),
    messages: [{
      id: randomUUID(),
      role: "system",
      content: "Innovation Co-Pilot ready. I can help you investigate subjects, generate ideas, score them, and guide you through the full innovation pipeline.",
      metadata: {},
      timestamp: now,
    }],
    state: {
      pipelineStage: "idle",
      activeAngles: [],
      preferences: {},
      lastAngleResults: [],
      ideaCount: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  chatSessions.set(session.id, session);
  return session;
}

/**
 * Get an existing chat session.
 */
export function getChatSession(sessionId: string): ChatSession | undefined {
  return chatSessions.get(sessionId);
}

/**
 * Delete a chat session.
 */
export function deleteChatSession(sessionId: string): boolean {
  return chatSessions.delete(sessionId);
}

/**
 * List all active chat sessions.
 */
export function listChatSessions(): ChatSession[] {
  return Array.from(chatSessions.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---- Main Chat Handler ----

/**
 * Process a user message through the chat agent.
 * Classifies intent, generates a contextual response, and provides proactive suggestions.
 */
export async function chat(
  sessionId: string,
  message: string,
  model?: string,
  signal?: AbortSignal
): Promise<ChatAgentResponse> {
  const session = chatSessions.get(sessionId);
  if (!session) throw new Error(`Chat session "${sessionId}" not found`);

  // Add user message
  session.messages.push({
    id: randomUUID(),
    role: "user",
    content: message,
    metadata: {},
    timestamp: new Date().toISOString(),
  });

  // Classify intent
  const classified = await classifyIntent(message, session.state, model, signal);

  // Build contextual prompt
  const prompt = buildChatPrompt(session, classified);

  // Generate response
  const response = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
      return ChatResponseSchema.parse(parsed);
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  // Update session state
  if (response.stateUpdate) {
    Object.assign(session.state, response.stateUpdate);
  }

  // Add assistant message
  session.messages.push({
    id: randomUUID(),
    role: "assistant",
    content: response.message,
    intent: classified.intent,
    metadata: {},
    timestamp: new Date().toISOString(),
  });

  session.updatedAt = new Date().toISOString();

  // Ensure we have suggestions
  if (!response.suggestions || response.suggestions.length === 0) {
    response.suggestions = getProactiveSuggestions(session.state);
  }

  return response;
}

function buildChatPrompt(session: ChatSession, classified: ClassifiedIntent): string {
  const recentMessages = session.messages
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const stateContext = `Pipeline stage: ${session.state.pipelineStage}
Subject: ${session.state.currentSubject ?? "none set"}
Ideas generated: ${session.state.ideaCount}
Active angles: ${session.state.activeAngles.join(", ") || "none"}`;

  return `You are an Innovation Co-Pilot — a conversational guide for an AI-powered innovation platform.

CAPABILITIES:
- Investigate subjects to uncover opportunities
- Generate ideas from multiple innovation angles (SCAMPER, First Principles, etc.)
- Score and prioritize ideas by feasibility, impact, and novelty
- Synthesize results into actionable recommendations
- Create artifacts (PRDs, tech specs, pitch decks)
- Export results in multiple formats
- Search past sessions for inspiration

CURRENT STATE:
${stateContext}

DETECTED INTENT: ${classified.intent} (confidence: ${classified.confidence.toFixed(2)})
ENTITIES: ${JSON.stringify(classified.entities)}

CONVERSATION:
${recentMessages}

${wrapUserInput("LATEST_MESSAGE", classified.originalMessage)}

Respond helpfully based on the detected intent. If the user wants to invoke a module, describe what you would do.
After responding, suggest 2-3 logical next actions.

Respond in JSON:
{
  "message": "Your response to the user",
  "intent": "${classified.intent}",
  "suggestions": [
    { "id": "s1", "text": "Suggested action", "intent": "intent-name", "priority": "high|medium|low", "reason": "Why this is useful" }
  ],
  "stateUpdate": { "pipelineStage": "idle", "currentSubject": "..." },
  "actionTaken": "Description of action taken, if any"
}`;
}

/**
 * Clear all chat sessions (for testing).
 */
export function clearChatSessions(): void {
  chatSessions.clear();
}
