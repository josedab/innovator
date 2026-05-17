/**
 * @module coaching/coach-session
 *
 * AI Innovation Coach — conversational agent that guides users through the
 * innovation process with domain detection, probing questions, angle
 * recommendations, and learning feedback loops.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const CoachMessageRoleSchema = z.enum(["user", "coach", "system"]);

export const CoachSessionStatusSchema = z.enum(["active", "paused", "completed"]);

export const CoachMessageSchema = z.object({
  id: z.string(),
  role: CoachMessageRoleSchema,
  content: z.string().max(10000),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CoachDomainSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  confidence: z.number().min(0).max(1),
  suggestedAngles: z.array(z.string().max(100)).max(8),
  contextHints: z.string().max(2000).optional(),
});

export const CoachSessionSchema = z.object({
  id: z.string(),
  subject: z.string().max(2000),
  status: CoachSessionStatusSchema,
  domain: CoachDomainSchema.optional(),
  messages: z.array(CoachMessageSchema),
  suggestedAngles: z.array(z.string().max(100)).max(8),
  investigation: z.any().optional(),
  angleResults: z.array(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  feedbackScore: z.number().min(1).max(5).optional(),
});

// ---- Types ----

export type CoachMessageRole = z.infer<typeof CoachMessageRoleSchema>;
export type CoachSessionStatus = z.infer<typeof CoachSessionStatusSchema>;
export type CoachMessage = z.infer<typeof CoachMessageSchema>;
export type CoachDomain = z.infer<typeof CoachDomainSchema>;
export type CoachSession = z.infer<typeof CoachSessionSchema>;

export interface CoachSessionConfig {
  personality?: "socratic" | "provocateur" | "supportive" | "analytical";
  model?: string;
  maxTurns?: number;
}

// ---- In-Memory Store ----

const sessions = new Map<string, CoachSession>();

// ---- Domain Detection ----

const DOMAIN_KEYWORDS: Record<string, { angles: string[]; hints: string }> = {
  healthcare: {
    angles: ["first-principles", "constraints", "perspectives", "what-if"],
    hints:
      "Consider HIPAA compliance, patient outcomes, clinical workflows, and care coordination.",
  },
  fintech: {
    angles: ["first-principles", "inversion", "trend-collision", "cross-domain"],
    hints:
      "Consider regulatory requirements (PCI-DSS, SOX), risk management, and financial inclusion.",
  },
  edtech: {
    angles: ["perspectives", "what-if", "cross-domain", "scamper"],
    hints: "Consider learning outcomes, accessibility, engagement, and pedagogical frameworks.",
  },
  climate: {
    angles: ["first-principles", "constraints", "what-if", "trend-collision"],
    hints:
      "Consider sustainability metrics, carbon reduction, circular economy, and policy impact.",
  },
  saas: {
    angles: ["scamper", "inversion", "trend-collision", "cross-domain"],
    hints: "Consider churn reduction, activation, pricing models, and platform ecosystem effects.",
  },
  ai: {
    angles: ["first-principles", "what-if", "constraints", "inversion"],
    hints: "Consider ethical AI, bias mitigation, model efficiency, and human-AI collaboration.",
  },
};

function detectDomain(subject: string): CoachDomain | undefined {
  const lower = subject.toLowerCase();
  for (const [domain, config] of Object.entries(DOMAIN_KEYWORDS)) {
    const keywords =
      domain === "ai"
        ? ["artificial intelligence", " ai ", "machine learning", "deep learning", "llm", "neural"]
        : domain === "healthcare"
          ? ["health", "medical", "clinical", "patient", "hospital", "pharma"]
          : domain === "fintech"
            ? ["finance", "banking", "payment", "fintech", "trading", "insurance"]
            : domain === "edtech"
              ? ["education", "learning", "teaching", "student", "school", "course"]
              : domain === "climate"
                ? ["climate", "sustainability", "carbon", "renewable", "green", "environment"]
                : ["saas", "subscription", "platform", "b2b", "enterprise software"];

    const matchCount = keywords.filter((k) => lower.includes(k)).length;
    if (matchCount > 0) {
      return {
        id: domain,
        name: domain.charAt(0).toUpperCase() + domain.slice(1),
        confidence: Math.min(matchCount / keywords.length + 0.3, 1.0),
        suggestedAngles: config.angles,
        contextHints: config.hints,
      };
    }
  }
  return undefined;
}

// ---- Core Functions ----

/** Start a new coaching session for a subject. */
export async function startCoachSession(
  subject: string,
  config: CoachSessionConfig = {},
  signal?: AbortSignal
): Promise<CoachSession> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const domain = detectDomain(subject);

  const personality = config.personality ?? "socratic";
  const systemPrompt = buildCoachSystemPrompt(personality, domain);

  // Generate initial coaching message
  const prompt = `${systemPrompt}

${wrapUserInput("SUBJECT", subject)}

The user wants to explore innovation around this subject. Generate a warm, engaging opening message that:
1. Acknowledges the subject and shows understanding
2. Identifies the domain if relevant
3. Asks 2-3 probing questions to refine the innovation focus
4. Suggests which innovation angles might be most productive

Return valid JSON only:
{
  "message": "Your coaching response...",
  "suggestedAngles": ["angle-id-1", "angle-id-2"]
}`;

  const parsed = await runCoachLlm(prompt, config.model, signal);
  const response = z
    .object({
      message: z.string().max(5000),
      suggestedAngles: z.array(z.string().max(100)).max(8),
    })
    .parse(parsed);

  const session: CoachSession = {
    id,
    subject,
    status: "active",
    domain,
    messages: [
      {
        id: randomUUID(),
        role: "system",
        content: systemPrompt,
        timestamp: now,
      },
      {
        id: randomUUID(),
        role: "coach",
        content: response.message,
        timestamp: now,
      },
    ],
    suggestedAngles:
      response.suggestedAngles.length > 0
        ? response.suggestedAngles
        : (domain?.suggestedAngles ?? ["first-principles", "scamper", "what-if"]),
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(id, session);
  return session;
}

/** Send a message in an existing coaching session. */
export async function sendCoachMessage(
  sessionId: string,
  message: string,
  config: CoachSessionConfig = {},
  signal?: AbortSignal
): Promise<CoachSession | undefined> {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "active") return undefined;

  const now = new Date().toISOString();
  session.messages.push({
    id: randomUUID(),
    role: "user",
    content: message,
    timestamp: now,
  });

  // Build conversation context (sliding window)
  const recentMessages = session.messages.slice(-10);
  const conversationContext = recentMessages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const personality = config.personality ?? "socratic";
  const systemPrompt = buildCoachSystemPrompt(personality, session.domain);

  const prompt = `${systemPrompt}

${wrapUserInput("SUBJECT", session.subject)}

CONVERSATION SO FAR:
${sanitizeLlmOutput(conversationContext)}

${wrapUserInput("USER MESSAGE", message)}

Continue coaching. Respond with probing questions, angle suggestions, or guidance.
If the user seems ready to proceed, suggest starting the investigation.

Return valid JSON only:
{
  "message": "Your coaching response...",
  "suggestedAngles": ["angle-id-1"],
  "readyToInvestigate": false
}`;

  const parsed = await runCoachLlm(prompt, config.model, signal);
  const response = z
    .object({
      message: z.string().max(5000),
      suggestedAngles: z.array(z.string().max(100)).max(8).optional(),
      readyToInvestigate: z.boolean().optional(),
    })
    .parse(parsed);

  session.messages.push({
    id: randomUUID(),
    role: "coach",
    content: response.message,
    timestamp: now,
    metadata: {
      readyToInvestigate: response.readyToInvestigate,
    },
  });

  if (response.suggestedAngles && response.suggestedAngles.length > 0) {
    session.suggestedAngles = response.suggestedAngles;
  }
  session.updatedAt = now;
  sessions.set(sessionId, session);
  return session;
}

/** Get a coaching session by ID. */
export function getCoachSession(id: string): CoachSession | undefined {
  return sessions.get(id);
}

/** List all coaching sessions. */
export function listCoachSessions(): CoachSession[] {
  return Array.from(sessions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** End a coaching session with optional feedback. */
export function endCoachSession(id: string, feedbackScore?: number): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.status = "completed";
  session.updatedAt = new Date().toISOString();
  if (feedbackScore !== undefined) {
    session.feedbackScore = Math.max(1, Math.min(5, feedbackScore));
  }
  sessions.set(id, session);
  return true;
}

/** Clear all coaching sessions (for testing). */
export function clearCoachSessions(): void {
  sessions.clear();
}

// ---- Helpers ----

function buildCoachSystemPrompt(personality: string, domain?: CoachDomain): string {
  const personalityPrompts: Record<string, string> = {
    socratic: "You are a Socratic innovation coach. Guide with questions, not answers.",
    provocateur: "You are a provocative innovation coach. Challenge assumptions boldly.",
    supportive: "You are a supportive innovation coach. Encourage while probing blind spots.",
    analytical:
      "You are an analytical innovation coach. Focus on evidence and structured reasoning.",
  };

  let prompt = personalityPrompts[personality] ?? personalityPrompts.socratic;
  if (domain) {
    prompt += `\n\nDetected domain: ${domain.name} (confidence: ${Math.round(domain.confidence * 100)}%).`;
    if (domain.contextHints) {
      prompt += ` ${domain.contextHints}`;
    }
  }
  return prompt;
}

async function runCoachLlm(prompt: string, model?: string, signal?: AbortSignal): Promise<unknown> {
  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse coach response as JSON: ${jsonStr.slice(0, 200)}`);
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
}
