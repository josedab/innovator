/**
 * @module negotiation
 *
 * Interactive Idea Negotiation — multi-turn structured dialogue where AI and
 * user collaboratively refine a single idea through principled negotiation.
 * Implements a state machine with phases: Opening → Interest Exploration →
 * Option Generation → Criteria Evaluation → Agreement.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

export const NegotiationPhaseSchema = z.enum([
  "opening",
  "interest-exploration",
  "option-generation",
  "criteria-evaluation",
  "agreement",
  "completed",
]);

export const NegotiationMessageSchema = z.object({
  role: z.enum(["user", "ai", "system"]),
  content: z.string().max(5000),
  phase: NegotiationPhaseSchema,
  timestamp: z.string(),
  challengeType: z.enum([
    "feasibility",
    "market-fit",
    "ethical",
    "technical",
    "financial",
    "competitive",
    "none",
  ]).default("none"),
});

export const IdeaDeltaSchema = z.object({
  field: z.string().max(100),
  before: z.string().max(2000),
  after: z.string().max(2000),
  rationale: z.string().max(500),
});

export const NegotiationSessionSchema = z.object({
  id: z.string().max(100),
  ideaTitle: z.string().max(500),
  currentIdea: z.object({
    title: z.string().max(500),
    description: z.string().max(5000),
    potentialImpact: z.string().max(2000),
    implementationHint: z.string().max(2000),
  }),
  originalIdea: z.object({
    title: z.string().max(500),
    description: z.string().max(5000),
    potentialImpact: z.string().max(2000),
    implementationHint: z.string().max(2000),
  }),
  phase: NegotiationPhaseSchema,
  messages: z.array(NegotiationMessageSchema).max(100),
  deltas: z.array(IdeaDeltaSchema).max(50),
  convergenceScore: z.number().min(0).max(1).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NegotiationPhase = z.infer<typeof NegotiationPhaseSchema>;
export type NegotiationMessage = z.infer<typeof NegotiationMessageSchema>;
export type IdeaDelta = z.infer<typeof IdeaDeltaSchema>;
export type NegotiationSession = z.infer<typeof NegotiationSessionSchema>;

// ---- State Machine ----

const PHASE_TRANSITIONS: Record<NegotiationPhase, NegotiationPhase[]> = {
  opening: ["interest-exploration"],
  "interest-exploration": ["option-generation"],
  "option-generation": ["criteria-evaluation"],
  "criteria-evaluation": ["agreement", "option-generation"],
  agreement: ["completed"],
  completed: [],
};

const PHASE_PROMPTS: Record<NegotiationPhase, string> = {
  opening: `You are starting a principled negotiation about an innovation idea. Present the idea's current state and identify 3 key areas that need discussion: feasibility, market fit, and implementation approach. Ask the user which area they'd like to explore first. Be collaborative, not adversarial.`,
  "interest-exploration": `You are exploring the underlying interests behind the idea. Ask probing questions about: Who benefits? What problems does it really solve? What constraints are non-negotiable vs. flexible? Identify hidden assumptions. Summarize discovered interests.`,
  "option-generation": `Generate 3-5 alternative options for improving the idea based on the interests discovered. Each option should address a different concern while preserving the core value. Present trade-offs clearly. Ask the user to evaluate which options resonate.`,
  "criteria-evaluation": `Evaluate the selected options against objective criteria: technical feasibility (1-10), market demand (1-10), implementation effort (1-10), risk level (1-10). Recommend which option best satisfies all parties' interests. If no option is satisfactory, suggest returning to option generation.`,
  agreement: `Summarize the negotiated improvements to the idea. List all changes made with rationale. Present the final refined idea and ask for confirmation. Calculate a convergence score showing how much the idea evolved.`,
  completed: `The negotiation is complete.`,
};

// ---- In-Memory Store ----

const sessions = new Map<string, NegotiationSession>();

// ---- Core Functions ----

/**
 * Start a new negotiation session for an idea.
 */
export async function startNegotiation(
  idea: InnovationIdea,
  model?: string,
  signal?: AbortSignal
): Promise<NegotiationSession> {
  const id = `neg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const ideaObj = {
    title: idea.title,
    description: idea.description,
    potentialImpact: idea.potentialImpact,
    implementationHint: idea.implementationHint,
  };

  const session: NegotiationSession = {
    id,
    ideaTitle: idea.title,
    currentIdea: { ...ideaObj },
    originalIdea: { ...ideaObj },
    phase: "opening",
    messages: [],
    deltas: [],
    convergenceScore: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Generate opening message
  const openingPrompt = `${PHASE_PROMPTS["opening"]}

${wrapUserInput("IDEA", `Title: ${idea.title}\nDescription: ${idea.description}\nImpact: ${idea.potentialImpact}\nImplementation: ${idea.implementationHint}`)}

Respond with a structured opening that:
1. Acknowledges the idea's strengths
2. Identifies 3 areas for negotiation
3. Asks the user to choose where to start

Return your response as a JSON object:
{
  "message": "Your opening message text",
  "challengeAreas": ["area1", "area2", "area3"]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt: openingPrompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { message: string; challengeAreas?: string[] };

    session.messages.push({
      role: "ai",
      content: sanitizeLlmOutput(parsed.message),
      phase: "opening",
      timestamp: now,
      challengeType: "none",
    });
  } catch (openErr) {
    const reason = openErr instanceof Error ? openErr.message : "unknown error";
    session.messages.push({
      role: "ai",
      content: `Let's negotiate on "${idea.title}". I see potential in this idea, but let's explore three key areas: feasibility, market fit, and implementation approach. Which would you like to discuss first?`,
      phase: "opening",
      timestamp: now,
      challengeType: "none",
    });
    session.messages.push({
      role: "system",
      content: `[Opening generation fell back to template: ${reason}]`,
      phase: "opening",
      timestamp: now,
      challengeType: "none",
    });
  }

  sessions.set(id, session);
  return session;
}

/**
 * Continue negotiation with a user message.
 */
export async function negotiateStep(
  sessionId: string,
  userMessage: string,
  model?: string,
  signal?: AbortSignal
): Promise<NegotiationSession | undefined> {
  const session = sessions.get(sessionId);
  if (!session || session.phase === "completed") return undefined;

  const now = new Date().toISOString();

  // Record user message
  session.messages.push({
    role: "user",
    content: userMessage.slice(0, 5000),
    phase: session.phase,
    timestamp: now,
    challengeType: "none",
  });

  // Determine if phase should advance
  const messageCount = session.messages.filter((m) => m.phase === session.phase).length;
  const shouldAdvance = messageCount >= 4 || userMessage.toLowerCase().includes("next") || userMessage.toLowerCase().includes("move on");

  if (shouldAdvance && PHASE_TRANSITIONS[session.phase].length > 0) {
    session.phase = PHASE_TRANSITIONS[session.phase][0];
  }

  // Build context
  const recentMessages = session.messages.slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n\n");

  const prompt = `${PHASE_PROMPTS[session.phase]}

CURRENT IDEA STATE:
Title: ${session.currentIdea.title}
Description: ${session.currentIdea.description}
Impact: ${session.currentIdea.potentialImpact}

CONVERSATION HISTORY:
${recentMessages}

${wrapUserInput("USER_INPUT", userMessage)}

Based on this negotiation phase and conversation, respond with JSON:
{
  "message": "Your response continuing the negotiation",
  "challengeType": "feasibility|market-fit|ethical|technical|financial|competitive|none",
  "suggestedChanges": [
    {"field": "title|description|potentialImpact|implementationHint", "newValue": "...", "rationale": "..."}
  ],
  "convergenceEstimate": 0.0 to 1.0
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      message: string;
      challengeType?: string;
      suggestedChanges?: Array<{ field: string; newValue: string; rationale: string }>;
      convergenceEstimate?: number;
    };

    session.messages.push({
      role: "ai",
      content: sanitizeLlmOutput(parsed.message),
      phase: session.phase,
      timestamp: new Date().toISOString(),
      challengeType: (parsed.challengeType as NegotiationMessage["challengeType"]) ?? "none",
    });

    // Apply suggested changes with validated field names
    if (parsed.suggestedChanges) {
      const validFields = ["title", "description", "potentialImpact", "implementationHint"] as const;
      type IdeaField = (typeof validFields)[number];
      for (const change of parsed.suggestedChanges) {
        if (validFields.includes(change.field as IdeaField)) {
          const field = change.field as IdeaField;
          const before = session.currentIdea[field];
          session.currentIdea[field] = change.newValue.slice(0, 5000);
          session.deltas.push({
            field,
            before,
            after: change.newValue.slice(0, 2000),
            rationale: change.rationale.slice(0, 500),
          });
        }
      }
    }

    if (parsed.convergenceEstimate !== undefined) {
      session.convergenceScore = Math.min(1, Math.max(0, parsed.convergenceEstimate));
    }
  } catch (stepErr) {
    const reason = stepErr instanceof Error ? stepErr.message : "unknown error";
    session.messages.push({
      role: "ai",
      content: `I understand your point. Let's continue exploring this aspect. What specific concerns do you have about the current approach?`,
      phase: session.phase,
      timestamp: new Date().toISOString(),
      challengeType: "none",
    });
    session.messages.push({
      role: "system",
      content: `[Negotiation step fell back to template: ${reason}]`,
      phase: session.phase,
      timestamp: new Date().toISOString(),
      challengeType: "none",
    });
  }

  // Auto-complete if in agreement phase with high convergence
  if (session.phase === "agreement" && session.convergenceScore >= 0.8) {
    session.phase = "completed";
  }

  session.updatedAt = new Date().toISOString();
  return session;
}

/** Maximum session idle time before auto-expiry (1 hour). */
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Get a negotiation session by ID. Returns undefined if expired.
 */
export function getNegotiation(sessionId: string): NegotiationSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  // Auto-expire idle sessions
  const lastUpdate = new Date(session.updatedAt).getTime();
  if (Date.now() - lastUpdate > SESSION_TIMEOUT_MS && session.phase !== "completed") {
    session.phase = "completed";
    session.messages.push({
      role: "system",
      content: "Session expired due to inactivity.",
      phase: "completed",
      timestamp: new Date().toISOString(),
      challengeType: "none",
    });
    session.updatedAt = new Date().toISOString();
  }

  return session;
}

/**
 * Clean up expired negotiation sessions.
 */
export function cleanupExpiredNegotiations(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    const lastUpdate = new Date(session.updatedAt).getTime();
    if (now - lastUpdate > SESSION_TIMEOUT_MS * 24) {
      sessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * List all negotiation sessions.
 */
export function listNegotiations(): NegotiationSession[] {
  return [...sessions.values()];
}

/**
 * Complete a negotiation, producing the final refined idea.
 */
export function completeNegotiation(sessionId: string): {
  finalIdea: InnovationIdea;
  deltas: IdeaDelta[];
  convergenceScore: number;
  messageCount: number;
} | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  session.phase = "completed";
  session.updatedAt = new Date().toISOString();

  return {
    finalIdea: session.currentIdea,
    deltas: session.deltas,
    convergenceScore: session.convergenceScore,
    messageCount: session.messages.length,
  };
}

/**
 * Compute idea-delta score showing how much the idea has changed.
 */
export function computeIdeaDeltaScore(session: NegotiationSession): number {
  if (session.deltas.length === 0) return 0;

  let totalChange = 0;
  for (const delta of session.deltas) {
    // Simple Jaccard-based change measurement
    const beforeWords = new Set(delta.before.toLowerCase().split(/\s+/));
    const afterWords = new Set(delta.after.toLowerCase().split(/\s+/));
    const intersection = new Set([...beforeWords].filter((w) => afterWords.has(w)));
    const union = new Set([...beforeWords, ...afterWords]);
    const similarity = union.size > 0 ? intersection.size / union.size : 1;
    totalChange += 1 - similarity;
  }

  return Math.min(1, totalChange / session.deltas.length);
}

/** Clear all negotiation data (for testing). */
export function clearNegotiations(): void {
  sessions.clear();
}
