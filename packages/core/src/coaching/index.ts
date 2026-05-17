/**
 * @module coaching
 *
 * AI Innovation Coach — a Socratic facilitator that guides innovation sessions
 * with question generation, assumption detection, and pivot recommendations.
 * Integrates into the pipeline as an optional wrapper providing pre-investigation
 * clarification, mid-angle interventions, and post-synthesis deepening.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { Investigation, AngleResult, Synthesis } from "../types.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

/** Coach personality presets controlling tone and question style. */
export const CoachPersonalitySchema = z.enum([
  "socratic",
  "provocateur",
  "supportive",
  "analytical",
]);

/** A single coaching question with context. */
export const CoachQuestionSchema = z.object({
  question: z.string().max(1000),
  intent: z.string().max(500).describe("Why this question is being asked"),
  category: z.enum(["clarification", "assumption", "pivot", "deepening", "challenge"]),
});

/** A detected assumption in the subject or ideas. */
export const AssumptionSchema = z.object({
  assumption: z.string().max(500),
  risk: z.enum(["low", "medium", "high"]),
  challenge: z.string().max(500).describe("Question to challenge this assumption"),
});

/** A pivot recommendation suggesting an alternative direction. */
export const PivotRecommendationSchema = z.object({
  currentDirection: z.string().max(500),
  suggestedPivot: z.string().max(500),
  rationale: z.string().max(1000),
  confidence: z.number().min(0).max(1),
});

/** Full coaching intervention result. */
export const CoachInterventionSchema = z.object({
  questions: z.array(CoachQuestionSchema).max(10),
  assumptions: z.array(AssumptionSchema).max(10),
  pivots: z.array(PivotRecommendationSchema).max(5),
  summary: z.string().max(2000),
});

// ---- Types ----

export type CoachPersonality = z.infer<typeof CoachPersonalitySchema>;
export type CoachQuestion = z.infer<typeof CoachQuestionSchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type PivotRecommendation = z.infer<typeof PivotRecommendationSchema>;
export type CoachIntervention = z.infer<typeof CoachInterventionSchema>;

/** Configuration for the InnovationCoach. */
export interface CoachConfig {
  personality?: CoachPersonality;
  maxQuestions?: number;
  model?: string;
}

// ---- Personality Prompts ----

const PERSONALITY_PROMPTS: Record<CoachPersonality, string> = {
  socratic:
    "You are a Socratic innovation coach. Ask probing questions that guide the user to discover insights themselves. Never give direct answers — always lead with questions.",
  provocateur:
    "You are a provocative innovation coach. Challenge every assumption aggressively. Push for radical rethinking. Be bold and contrarian.",
  supportive:
    "You are a supportive innovation coach. Encourage exploration while gently probing for blind spots. Build confidence while expanding thinking.",
  analytical:
    "You are an analytical innovation coach. Focus on logical gaps, missing data, and rigorous evaluation. Demand evidence and structured reasoning.",
};

// ---- Core Functions ----

/**
 * Generate pre-investigation clarification questions for a subject.
 *
 * @param subject - The innovation subject to clarify
 * @param config - Coach configuration
 * @param signal - Optional AbortSignal for cancellation
 * @returns A CoachIntervention with clarifying questions
 */
export async function generateClarificationQuestions(
  subject: string,
  config: CoachConfig = {},
  signal?: AbortSignal
): Promise<CoachIntervention> {
  const personality = config.personality ?? "socratic";
  const maxQ = config.maxQuestions ?? 5;

  const prompt = `${PERSONALITY_PROMPTS[personality]}

${wrapUserInput("SUBJECT", subject)}

Before investigating this subject, generate clarifying questions to sharpen the innovation focus.
Also identify hidden assumptions in the subject framing and suggest potential pivots.

Return valid JSON only:
{
  "questions": [{ "question": "...", "intent": "...", "category": "clarification" }],
  "assumptions": [{ "assumption": "...", "risk": "low|medium|high", "challenge": "..." }],
  "pivots": [{ "currentDirection": "...", "suggestedPivot": "...", "rationale": "...", "confidence": 0.8 }],
  "summary": "Brief coaching summary"
}

Generate at most ${maxQ} questions, up to 5 assumptions, and up to 3 pivots.`;

  return runCoachPrompt(prompt, config.model, signal);
}

/**
 * Generate mid-angle intervention based on partial results.
 *
 * @param subject - The innovation subject
 * @param investigation - The investigation results so far
 * @param angleResults - Angle results generated so far
 * @param config - Coach configuration
 * @param signal - Optional AbortSignal
 * @returns A CoachIntervention with mid-process questions and suggestions
 */
export async function generateMidAngleIntervention(
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  config: CoachConfig = {},
  signal?: AbortSignal
): Promise<CoachIntervention> {
  const personality = config.personality ?? "socratic";

  const ideasSummary = angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => `[${ar.angleName}] ${idea.title}: ${idea.description.slice(0, 200)}`)
  );

  const prompt = `${PERSONALITY_PROMPTS[personality]}

${wrapUserInput("SUBJECT", subject)}

INVESTIGATION SUMMARY: ${sanitizeLlmOutput(investigation.summary)}

IDEAS GENERATED SO FAR:
${sanitizeLlmOutput(ideasSummary.join("\n"))}

Review the ideas generated so far and provide coaching intervention:
- Are there blind spots or unexplored areas?
- What assumptions are the ideas making?
- Should the exploration pivot in a different direction?

Return valid JSON only:
{
  "questions": [{ "question": "...", "intent": "...", "category": "assumption|pivot|challenge" }],
  "assumptions": [{ "assumption": "...", "risk": "low|medium|high", "challenge": "..." }],
  "pivots": [{ "currentDirection": "...", "suggestedPivot": "...", "rationale": "...", "confidence": 0.8 }],
  "summary": "Brief coaching summary"
}`;

  return runCoachPrompt(prompt, config.model, signal);
}

/**
 * Generate post-synthesis deepening questions and recommendations.
 *
 * @param subject - The innovation subject
 * @param synthesis - The pipeline synthesis result
 * @param config - Coach configuration
 * @param signal - Optional AbortSignal
 * @returns A CoachIntervention focused on deepening top ideas
 */
export async function generatePostSynthesisDeepening(
  subject: string,
  synthesis: Synthesis,
  config: CoachConfig = {},
  signal?: AbortSignal
): Promise<CoachIntervention> {
  const personality = config.personality ?? "socratic";

  const topIdeasSummary = synthesis.topIdeas
    .map((idea) => `${idea.title} (${idea.sourceAngle}): ${idea.description.slice(0, 200)}`)
    .join("\n");

  const prompt = `${PERSONALITY_PROMPTS[personality]}

${wrapUserInput("SUBJECT", subject)}

TOP IDEAS FROM SYNTHESIS:
${sanitizeLlmOutput(topIdeasSummary)}

THEMES: ${sanitizeLlmOutput(synthesis.themes.join(", "))}
RECOMMENDATION: ${sanitizeLlmOutput(synthesis.recommendation)}

Now that the innovation session is complete, provide deepening coaching:
- Which top ideas deserve further investigation?
- What critical questions remain unanswered?
- What pivots could yield even stronger ideas?

Return valid JSON only:
{
  "questions": [{ "question": "...", "intent": "...", "category": "deepening|challenge" }],
  "assumptions": [{ "assumption": "...", "risk": "low|medium|high", "challenge": "..." }],
  "pivots": [{ "currentDirection": "...", "suggestedPivot": "...", "rationale": "...", "confidence": 0.8 }],
  "summary": "Brief coaching summary"
}`;

  return runCoachPrompt(prompt, config.model, signal);
}

/**
 * Detect assumptions in a given text or subject.
 *
 * @param text - The text to analyze for assumptions
 * @param model - Optional model override
 * @param signal - Optional AbortSignal
 * @returns Array of detected assumptions
 */
export async function detectAssumptions(
  text: string,
  model?: string,
  signal?: AbortSignal
): Promise<Assumption[]> {
  const prompt = `You are an expert at identifying hidden assumptions in innovation contexts.

${wrapUserInput("TEXT", text)}

Identify all hidden assumptions in this text. For each, assess the risk level and provide a challenging question.

Return valid JSON only:
{
  "assumptions": [{ "assumption": "...", "risk": "low|medium|high", "challenge": "..." }]
}`;

  const parsed = await runLlmJson(prompt, model, signal);
  const result = z.object({ assumptions: z.array(AssumptionSchema).max(20) }).parse(parsed);
  return result.assumptions;
}

/**
 * Generate pivot recommendations for the current innovation direction.
 *
 * @param subject - The innovation subject
 * @param currentIdeas - Summary of current ideas
 * @param model - Optional model override
 * @param signal - Optional AbortSignal
 * @returns Array of pivot recommendations
 */
export async function recommendPivots(
  subject: string,
  currentIdeas: string[],
  model?: string,
  signal?: AbortSignal
): Promise<PivotRecommendation[]> {
  const prompt = `You are an expert innovation strategist advising on potential pivots.

${wrapUserInput("SUBJECT", subject)}

CURRENT IDEAS:
${sanitizeLlmOutput(currentIdeas.join("\n"))}

Suggest strategic pivots that could yield more impactful innovation. Consider:
- Underserved user segments
- Adjacent domains or technologies
- Contrarian approaches

Return valid JSON only:
{
  "pivots": [{ "currentDirection": "...", "suggestedPivot": "...", "rationale": "...", "confidence": 0.8 }]
}`;

  const parsed = await runLlmJson(prompt, model, signal);
  const result = z.object({ pivots: z.array(PivotRecommendationSchema).max(10) }).parse(parsed);
  return result.pivots;
}

// ---- Internal Helpers ----

async function runCoachPrompt(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<CoachIntervention> {
  const parsed = await runLlmJson(prompt, model, signal);
  return CoachInterventionSchema.parse(parsed);
}

async function runLlmJson(prompt: string, model?: string, signal?: AbortSignal): Promise<unknown> {
  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse coaching response as JSON: ${jsonStr.slice(0, 200)}`,
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
}

// ---- Socratic Innovation Coach ----

export interface CoachingSession {
  id: string;
  topic: string;
  messages: CoachMessage[];
  blindSpots: string[];
  suggestedAngles: string[];
  learningPathId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoachMessage {
  role: "coach" | "user";
  content: string;
  timestamp: string;
  type?: "question" | "suggestion" | "insight" | "challenge";
}

export const LearningPathSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(2000),
  modules: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(500),
        description: z.string().max(1000),
        exercises: z.array(z.string().max(500)).max(10),
        estimatedMinutes: z.number().min(1).max(120),
      })
    )
    .max(20),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  tags: z.array(z.string().max(100)).max(10),
});
export type LearningPath = z.infer<typeof LearningPathSchema>;

const coachingSessions = new Map<string, CoachingSession>();
const BASE_COACHING_ANGLES = [
  "first-principles",
  "scamper",
  "inversion",
  "constraints",
  "perspectives",
  "what-if",
  "cross-domain",
  "trend-collision",
];

const BUILT_IN_LEARNING_PATHS: LearningPath[] = [
  LearningPathSchema.parse({
    id: "innovation-foundations",
    title: "Innovation Foundations",
    description:
      "Build a durable mental model for framing opportunities and selecting the right innovation angles.",
    modules: [
      {
        id: "opportunity-framing",
        title: "Opportunity Framing",
        description:
          "Clarify the user, job-to-be-done, and strategic constraint before ideation starts.",
        exercises: [
          "Rewrite one vague idea as a concrete opportunity statement.",
          "List three assumptions hidden in your current problem framing.",
        ],
        estimatedMinutes: 30,
      },
      {
        id: "angle-selection",
        title: "Angle Selection",
        description:
          "Choose complementary innovation angles based on problem shape and evidence gaps.",
        exercises: ["Match five example problems to their best-fit innovation angles."],
        estimatedMinutes: 35,
      },
    ],
    difficulty: "beginner",
    tags: ["innovation", "fundamentals", "strategy"],
  }),
  LearningPathSchema.parse({
    id: "customer-discovery-loop",
    title: "Customer Discovery Loop",
    description:
      "Improve idea quality by grounding hypotheses in customer evidence and rapid feedback.",
    modules: [
      {
        id: "interview-design",
        title: "Interview Design",
        description: "Craft questions that uncover pain points without leading the participant.",
        exercises: ["Draft five open-ended interview prompts for your product area."],
        estimatedMinutes: 25,
      },
      {
        id: "signal-synthesis",
        title: "Signal Synthesis",
        description: "Turn qualitative feedback into reusable patterns and decision criteria.",
        exercises: ["Cluster interview notes into three repeatable themes."],
        estimatedMinutes: 30,
      },
    ],
    difficulty: "intermediate",
    tags: ["research", "customer-discovery", "validation"],
  }),
  LearningPathSchema.parse({
    id: "experimentation-systems",
    title: "Experimentation Systems",
    description:
      "Design lightweight experiments that test desirability, feasibility, and viability in sequence.",
    modules: [
      {
        id: "experiment-design",
        title: "Experiment Design",
        description:
          "Define hypotheses, success metrics, and stop-loss criteria for innovation bets.",
        exercises: ["Convert one idea into a falsifiable experiment plan."],
        estimatedMinutes: 40,
      },
      {
        id: "evidence-review",
        title: "Evidence Review",
        description:
          "Interpret experiment results and decide whether to double down, pivot, or stop.",
        exercises: ["Review a failed experiment and extract two lessons learned."],
        estimatedMinutes: 35,
      },
    ],
    difficulty: "intermediate",
    tags: ["experiments", "decision-making", "measurement"],
  }),
  LearningPathSchema.parse({
    id: "ai-product-innovation",
    title: "AI Product Innovation",
    description:
      "Explore high-leverage AI product opportunities while managing risk, trust, and adoption constraints.",
    modules: [
      {
        id: "ai-opportunity-mapping",
        title: "AI Opportunity Mapping",
        description:
          "Identify where AI creates differentiated value versus incremental automation.",
        exercises: ["Map one workflow and mark where AI adds, supports, or should stay out."],
        estimatedMinutes: 45,
      },
      {
        id: "risk-and-guardrails",
        title: "Risk and Guardrails",
        description: "Define evaluation criteria, human oversight, and trust-building mechanisms.",
        exercises: ["Draft guardrails for one AI-powered feature you want to ship."],
        estimatedMinutes: 40,
      },
    ],
    difficulty: "advanced",
    tags: ["ai", "product", "risk"],
  }),
];

function getAngleCatalogForTopic(topic: string): string[] {
  const normalized = topic.toLowerCase();
  if (
    normalized.includes("ai") ||
    normalized.includes("machine learning") ||
    normalized.includes("llm")
  ) {
    return [
      "first-principles",
      "constraints",
      "what-if",
      "cross-domain",
      "trend-collision",
      "perspectives",
    ];
  }
  if (
    normalized.includes("market") ||
    normalized.includes("customer") ||
    normalized.includes("growth")
  ) {
    return ["perspectives", "inversion", "what-if", "trend-collision", "scamper", "cross-domain"];
  }
  return [...BASE_COACHING_ANGLES];
}

function extractCompletedAngles(messages: CoachMessage[], allAngles: string[]): string[] {
  const content = messages.map((message) => message.content.toLowerCase()).join(" ");
  return allAngles.filter((angle) => content.includes(angle.toLowerCase()));
}

export function createCoachingSession(topic: string): CoachingSession {
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) {
    throw new ValidationError("topic is required");
  }

  const now = new Date().toISOString();
  const allAngles = getAngleCatalogForTopic(trimmedTopic);
  const session: CoachingSession = {
    id: randomUUID(),
    topic: trimmedTopic,
    messages: [
      {
        role: "coach",
        content: `What assumption about ${trimmedTopic} should we challenge first?`,
        timestamp: now,
        type: "question",
      },
    ],
    blindSpots: detectBlindSpots([], allAngles),
    suggestedAngles: suggestNextAngles([], allAngles),
    createdAt: now,
    updatedAt: now,
  };

  coachingSessions.set(session.id, session);
  return session;
}

export function getCoachingSession(id: string): CoachingSession | undefined {
  return coachingSessions.get(id);
}

export function addCoachMessage(
  sessionId: string,
  role: "coach" | "user",
  content: string,
  type?: CoachMessage["type"]
): CoachingSession | undefined {
  const session = coachingSessions.get(sessionId);
  if (!session) return undefined;

  const now = new Date().toISOString();
  session.messages.push({
    role,
    content,
    timestamp: now,
    type: type ?? (role === "coach" ? "question" : "insight"),
  });

  const allAngles = getAngleCatalogForTopic(session.topic);
  const completedAngles = extractCompletedAngles(session.messages, allAngles);
  session.blindSpots = detectBlindSpots(completedAngles, allAngles);
  session.suggestedAngles = suggestNextAngles(completedAngles, allAngles);
  session.updatedAt = now;
  coachingSessions.set(sessionId, session);
  return session;
}

export function detectBlindSpots(investigationAngles: string[], allAngles: string[]): string[] {
  const completed = new Set(investigationAngles.map((angle) => angle.toLowerCase()));
  return Array.from(new Set(allAngles)).filter((angle) => !completed.has(angle.toLowerCase()));
}

export function suggestNextAngles(completedAngles: string[], allAngles: string[]): string[] {
  return detectBlindSpots(completedAngles, allAngles).slice(0, 3);
}

export function getBuiltInLearningPaths(): LearningPath[] {
  return BUILT_IN_LEARNING_PATHS.map((path) => ({
    ...path,
    modules: path.modules.map((module) => ({ ...module, exercises: [...module.exercises] })),
    tags: [...path.tags],
  }));
}

export function clearCoachingSessions(): void {
  coachingSessions.clear();
}

// ---- Re-exports ----

export {
  type InnovationProfile,
  type SessionRecord as CoachingSessionRecord,
  type ProactiveCoachingSuggestion,
  getInnovationProfile,
  recordSession as recordCoachingSession,
  getProactiveCoaching,
  getSessionHistory as getCoachingHistory,
  clearCoachingProfiles,
} from "./innovation-profile.js";

export {
  type TeamInnovationProfile,
  type CoachingInsight,
  buildTeamProfile,
  getTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
  clearTeamProfiles,
} from "./proactive-agent.js";

// ---- Guided Coaching Flows ----

export {
  type FlowStepType,
  type FlowStep,
  type GuidedFlow,
  type FlowSession,
  PRODUCT_LAUNCH_FLOW,
  PROCESS_IMPROVEMENT_FLOW,
  MARKET_ENTRY_FLOW,
  registerFlow,
  getFlow,
  listFlows,
  getFlowsByCategory,
  searchFlows,
  unregisterFlow,
  clearFlows,
  startFlowSession,
  getCurrentStep,
  submitStepResponse,
  getFlowSession,
  clearFlowSessions,
} from "./guided-flows.js";
