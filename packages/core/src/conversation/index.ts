/**
 * @module conversation
 *
 * Conversation mode for iterative refinement of innovation results.
 * Manages conversation context with sliding-window token budget,
 * session persistence, and structured follow-up interactions.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput, sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, Investigation, Synthesis } from "../types.js";

/** Maximum tokens budget (approximated as characters / 4). */
const DEFAULT_MAX_CONTEXT_CHARS = 30_000;

/** Zod schema for a conversation message. */
export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(50_000),
  timestamp: z.string(),
});

/** Zod schema for a refinement response. */
export const RefinementResponseSchema = z.object({
  response: z.string().max(10_000),
  updatedIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        potentialImpact: z.string().max(2000),
        implementationHint: z.string().max(2000),
        sourceAngle: z.string().max(200).optional(),
      })
    )
    .max(20)
    .optional(),
  suggestions: z.array(z.string().max(500)).max(5).optional(),
});

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type RefinementResponse = z.infer<typeof RefinementResponseSchema>;

/** Conversation context holding the full state of an iterative refinement session. */
export interface ConversationContext {
  sessionId: string;
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  messages: ConversationMessage[];
  selectedIdeas: string[];
  createdAt: string;
  updatedAt: string;
}

// In-memory store for conversation sessions
const sessions = new Map<string, ConversationContext>();

/**
 * Create a new conversation session from existing pipeline results.
 */
export function createConversation(params: {
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
}): ConversationContext {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const ctx: ConversationContext = {
    sessionId,
    subject: params.subject,
    investigation: params.investigation,
    angleResults: params.angleResults,
    synthesis: params.synthesis,
    messages: [],
    selectedIdeas: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(sessionId, ctx);
  return ctx;
}

/**
 * Retrieve an existing conversation session.
 */
export function getConversation(sessionId: string): ConversationContext | undefined {
  return sessions.get(sessionId);
}

/**
 * Delete a conversation session.
 */
export function deleteConversation(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * List all active conversation sessions.
 */
export function listConversations(): ConversationContext[] {
  return Array.from(sessions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Build a sliding-window context string that fits within token budget.
 */
function buildConversationPrompt(
  ctx: ConversationContext,
  userMessage: string,
  maxChars: number = DEFAULT_MAX_CONTEXT_CHARS
): string {
  const systemContext = buildSystemContext(ctx);
  const selectedIdeasContext = buildSelectedIdeasContext(ctx);
  const userPrompt = `\nUSER MESSAGE:\n${wrapUserInput("MESSAGE", userMessage)}`;

  let availableChars =
    maxChars - systemContext.length - selectedIdeasContext.length - userPrompt.length - 500;

  // Include recent messages from newest to oldest until budget is exhausted
  const recentMessages: string[] = [];
  for (let i = ctx.messages.length - 1; i >= 0 && availableChars > 0; i--) {
    const msg = ctx.messages[i];
    const formatted = `${msg.role.toUpperCase()}: ${msg.content}`;
    if (formatted.length <= availableChars) {
      recentMessages.unshift(formatted);
      availableChars -= formatted.length;
    } else {
      break;
    }
  }

  const historySection =
    recentMessages.length > 0 ? `\nCONVERSATION HISTORY:\n${recentMessages.join("\n\n")}\n` : "";

  return `${systemContext}${selectedIdeasContext}${historySection}${userPrompt}

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "response": "Your natural language response to the user's message",
  "updatedIdeas": [
    {
      "title": "Idea title",
      "description": "Description",
      "potentialImpact": "Impact",
      "implementationHint": "How to start",
      "sourceAngle": "optional angle name"
    }
  ],
  "suggestions": ["Follow-up question 1", "Follow-up question 2"]
}

If the user doesn't ask for new/modified ideas, omit "updatedIdeas". Always include 2-3 "suggestions" for follow-up questions.`;
}

function buildSystemContext(ctx: ConversationContext): string {
  let context = `You are an innovation consultant helping refine and develop ideas. You are in an ongoing conversation about the subject below.

${wrapUserInput("SUBJECT", ctx.subject)}
`;

  if (ctx.investigation) {
    context += `\nINVESTIGATION SUMMARY: ${sanitizeUserInput(ctx.investigation.summary)}`;
    context += `\nCHALLENGES: ${ctx.investigation.challenges.map((c) => sanitizeUserInput(c)).join("; ")}`;
  }

  if (ctx.synthesis) {
    context += `\nTOP IDEAS: ${ctx.synthesis.topIdeas.map((i) => sanitizeUserInput(i.title)).join(", ")}`;
    context += `\nRECOMMENDATION: ${sanitizeUserInput(ctx.synthesis.recommendation)}`;
  }

  return context;
}

function buildSelectedIdeasContext(ctx: ConversationContext): string {
  if (ctx.selectedIdeas.length === 0) return "";

  const allIdeas = ctx.angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({ ...idea, angleName: ar.angleName }))
  );
  const selected = allIdeas.filter((idea) => ctx.selectedIdeas.includes(idea.title));

  if (selected.length === 0) return "";

  return `\nSELECTED IDEAS FOR FOCUS:\n${selected.map((i) => `- ${sanitizeUserInput(i.title)}: ${sanitizeUserInput(i.description)}`).join("\n")}\n`;
}

/**
 * Send a refinement message in a conversation and get an AI response.
 *
 * @param sessionId - The conversation session ID
 * @param message - The user's follow-up message
 * @param selectedIdeas - Optional list of idea titles to focus on
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns The refinement response with updated ideas and suggestions
 */
export async function refineConversation(
  sessionId: string,
  message: string,
  selectedIdeas?: string[],
  model?: string,
  signal?: AbortSignal
): Promise<RefinementResponse> {
  const ctx = sessions.get(sessionId);
  if (!ctx) {
    throw new Error(`Conversation session "${sessionId}" not found`);
  }

  if (selectedIdeas) {
    ctx.selectedIdeas = selectedIdeas;
  }

  // Add user message
  ctx.messages.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  const prompt = buildConversationPrompt(ctx, message);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse refinement response as JSON: ${jsonStr.slice(0, 200)}`);
      }
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

  const response = RefinementResponseSchema.parse(parsed);

  // Add assistant response to history
  ctx.messages.push({
    role: "assistant",
    content: response.response,
    timestamp: new Date().toISOString(),
  });
  ctx.updatedAt = new Date().toISOString();

  return response;
}

/**
 * Clear all conversation sessions (for testing).
 */
export function clearConversations(): void {
  sessions.clear();
}
