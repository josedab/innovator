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
import { ValidationError, LlmParseError } from "../errors.js";
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
    throw new ValidationError(`Conversation session "${sessionId}" not found`);
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
        throw new LlmParseError(
          "Failed to parse refinement response as JSON",
          jsonStr.slice(0, 200)
        );
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

// ---- Branching Exploration Trees ----

/** Schema for an exploration tree node. */
export const ExplorationNodeSchema = z.object({
  id: z.string().max(100),
  parentId: z.string().max(100).optional(),
  query: z.string().max(2000),
  response: z.string().max(10000),
  ideas: z
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
  depth: z.number().min(0).max(20),
  createdAt: z.string(),
});

/** Schema for an exploration tree. */
export const ExplorationTreeSchema = z.object({
  sessionId: z.string().max(100),
  subject: z.string().max(500),
  rootNodeId: z.string().max(100),
  nodes: z.record(ExplorationNodeSchema),
  activeNodeId: z.string().max(100),
  createdAt: z.string(),
});

export type ExplorationNode = z.infer<typeof ExplorationNodeSchema>;
export type ExplorationTree = z.infer<typeof ExplorationTreeSchema>;

const explorationTrees = new Map<string, ExplorationTree>();

/**
 * Create a branching exploration tree from a conversation session.
 * Each branch allows users to explore a different direction from any node.
 */
export function createExplorationTree(sessionId: string): ExplorationTree | null {
  const ctx = sessions.get(sessionId);
  if (!ctx) return null;

  const rootId = randomUUID();
  const rootNode: ExplorationNode = {
    id: rootId,
    query: `Investigate: ${ctx.subject}`,
    response: ctx.investigation?.summary ?? "Initial investigation",
    ideas: ctx.synthesis?.topIdeas.map((i) => ({
      title: i.title,
      description: i.description,
      potentialImpact: i.potentialImpact,
      implementationHint: "",
      sourceAngle: i.sourceAngle,
    })),
    suggestions: [
      "Drill deeper into the top idea",
      "Explore alternative approaches",
      "Identify potential blockers",
    ],
    depth: 0,
    createdAt: new Date().toISOString(),
  };

  const tree: ExplorationTree = {
    sessionId,
    subject: ctx.subject,
    rootNodeId: rootId,
    nodes: { [rootId]: rootNode },
    activeNodeId: rootId,
    createdAt: new Date().toISOString(),
  };

  explorationTrees.set(sessionId, tree);
  return tree;
}

/** Get an exploration tree by session ID. */
export function getExplorationTree(sessionId: string): ExplorationTree | undefined {
  return explorationTrees.get(sessionId);
}

/**
 * Drill down into a specific node, creating a new child branch.
 */
export async function drillDown(
  sessionId: string,
  parentNodeId: string,
  query: string,
  model?: string,
  signal?: AbortSignal
): Promise<ExplorationNode> {
  const tree = explorationTrees.get(sessionId);
  if (!tree) throw new ValidationError(`Exploration tree not found for session "${sessionId}"`);

  const parentNode = tree.nodes[parentNodeId];
  if (!parentNode) throw new ValidationError(`Parent node "${parentNodeId}" not found`);

  if (parentNode.depth >= 20) throw new ValidationError("Maximum exploration depth reached");

  const ctx = sessions.get(sessionId);
  const context = buildDrillDownPrompt(ctx, parentNode, query);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt: context, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError("Failed to parse drill-down response", jsonStr.slice(0, 200));
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

  const nodeId = randomUUID();
  const newNode: ExplorationNode = {
    id: nodeId,
    parentId: parentNodeId,
    query,
    response: response.response,
    ideas: response.updatedIdeas,
    suggestions: response.suggestions,
    depth: parentNode.depth + 1,
    createdAt: new Date().toISOString(),
  };

  tree.nodes[nodeId] = newNode;
  tree.activeNodeId = nodeId;
  return newNode;
}

/**
 * Get the path from root to a specific node in the exploration tree.
 */
export function getExplorationPath(sessionId: string, nodeId: string): ExplorationNode[] {
  const tree = explorationTrees.get(sessionId);
  if (!tree) return [];

  const path: ExplorationNode[] = [];
  let current: ExplorationNode | undefined = tree.nodes[nodeId];
  while (current) {
    path.unshift(current);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path;
}

/**
 * Get all branches (child nodes) from a specific node.
 */
export function getNodeBranches(sessionId: string, nodeId: string): ExplorationNode[] {
  const tree = explorationTrees.get(sessionId);
  if (!tree) return [];
  return Object.values(tree.nodes).filter((n) => n.parentId === nodeId);
}

function buildDrillDownPrompt(
  ctx: ConversationContext | undefined,
  parentNode: ExplorationNode,
  query: string
): string {
  let prompt = `You are an innovation analyst performing a deep-dive investigation.

${wrapUserInput("SUBJECT", ctx?.subject ?? "Unknown")}

PREVIOUS EXPLORATION CONTEXT:
Question: ${sanitizeUserInput(parentNode.query)}
Findings: ${sanitizeUserInput(parentNode.response)}
`;

  if (parentNode.ideas?.length) {
    prompt += `\nIDEAS FROM PREVIOUS STEP:\n`;
    for (const idea of parentNode.ideas) {
      prompt += `- ${sanitizeUserInput(idea.title)}: ${sanitizeUserInput(idea.description)}\n`;
    }
  }

  prompt += `\n${wrapUserInput("DRILL-DOWN QUESTION", query)}

Provide a detailed analysis that goes deeper into this specific aspect. Explore nuances, identify sub-opportunities, and surface non-obvious insights.

You MUST respond with valid JSON only:
{
  "response": "Your detailed drill-down analysis",
  "updatedIdeas": [
    {
      "title": "Specific sub-idea",
      "description": "Detailed description",
      "potentialImpact": "Expected impact",
      "implementationHint": "How to start"
    }
  ],
  "suggestions": ["Next drill-down question 1", "Alternative exploration path", "Related area to investigate"]
}`;

  return prompt;
}
