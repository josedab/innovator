/**
 * @module flow-state
 *
 * Innovation Flow State Engine: monitors cognitive load signals during innovation
 * sessions and intelligently intervenes with perspective shifts, break suggestions,
 * creative palate cleansers, or automatic angle switches. Helps maintain optimal
 * creative flow.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import { LlmParseError } from "../errors.js";

// ---- Schemas ----

/** Schema for cognitive load indicators. */
export const CognitiveLoadIndicatorsSchema = z.object({
  sessionDurationMinutes: z.number().min(0),
  ideasGenerated: z.number().min(0),
  anglesExplored: z.number().min(0),
  timeSinceLastIdeaMinutes: z.number().min(0),
  ideaQualityTrend: z.enum(["improving", "stable", "declining"]),
  repetitionRate: z.number().min(0).max(1),
  avgIdeaLengthTrend: z.enum(["increasing", "stable", "decreasing"]),
  userInteractionFrequency: z.enum(["high", "normal", "low", "idle"]),
});

/** Schema for flow state assessment. */
export const FlowStateSchema = z.object({
  state: z.enum(["warm-up", "flow", "productive", "fatigued", "blocked", "disengaged"]),
  cognitiveLoad: z.number().min(0).max(1),
  creativeEnergy: z.number().min(0).max(1),
  focusLevel: z.number().min(0).max(1),
  recommendation: z.string().max(500),
  confidence: z.number().min(0).max(1),
});

/** Schema for an intervention. */
export const InterventionSchema = z.object({
  type: z.enum([
    "perspective-shift",
    "break-suggestion",
    "palate-cleanser",
    "angle-switch",
    "constraint-challenge",
    "encouragement",
    "synthesis-prompt",
    "wild-card",
  ]),
  title: z.string().max(200),
  description: z.string().max(1000),
  prompt: z.string().max(500).optional(),
  urgency: z.enum(["low", "medium", "high"]),
  estimatedDurationMinutes: z.number().min(1).max(30),
});

/** Schema for session flow timeline entry. */
export const FlowTimelineEntrySchema = z.object({
  timestamp: z.string(),
  state: FlowStateSchema.shape.state,
  cognitiveLoad: z.number().min(0).max(1),
  event: z.string().max(200).optional(),
  intervention: InterventionSchema.optional(),
});

// ---- Types ----

export type CognitiveLoadIndicators = z.infer<typeof CognitiveLoadIndicatorsSchema>;
export type FlowState = z.infer<typeof FlowStateSchema>;
export type Intervention = z.infer<typeof InterventionSchema>;
export type FlowTimelineEntry = z.infer<typeof FlowTimelineEntrySchema>;

// ---- In-memory state ----

const sessionTimelines: Map<string, FlowTimelineEntry[]> = new Map();

// ---- Intervention library ----

const INTERVENTION_LIBRARY: Intervention[] = [
  {
    type: "perspective-shift",
    title: "Reverse the Problem",
    description:
      "Instead of solving the problem, think about how you would create it. What would make this challenge worse? Now flip those answers.",
    urgency: "medium",
    estimatedDurationMinutes: 5,
  },
  {
    type: "perspective-shift",
    title: "10-Year-Old Explanation",
    description:
      "Explain your current idea to an imaginary 10-year-old. What questions would they ask? Use their naivety to find hidden assumptions.",
    urgency: "low",
    estimatedDurationMinutes: 3,
  },
  {
    type: "break-suggestion",
    title: "Creative Micro-Break",
    description:
      "Take a 5-minute break. Look at something green, stretch, or doodle. Your subconscious will continue working on the problem.",
    urgency: "high",
    estimatedDurationMinutes: 5,
  },
  {
    type: "break-suggestion",
    title: "Walk & Think",
    description:
      "Take a short walk. Research shows movement significantly boosts creative thinking. Don't try to solve the problem — just observe your surroundings.",
    urgency: "high",
    estimatedDurationMinutes: 10,
  },
  {
    type: "palate-cleanser",
    title: "Random Word Association",
    description:
      "Pick a random word: 'Jellyfish'. Connect it to your innovation subject in 3 different ways. This activates lateral thinking pathways.",
    prompt: "Connect the word 'Jellyfish' to your subject in 3 creative ways",
    urgency: "medium",
    estimatedDurationMinutes: 3,
  },
  {
    type: "palate-cleanser",
    title: "Worst Idea Competition",
    description:
      "Spend 2 minutes generating the worst possible ideas. The more ridiculous, the better. Often the inverse of a terrible idea is brilliant.",
    prompt: "Generate 5 intentionally terrible ideas for your subject",
    urgency: "medium",
    estimatedDurationMinutes: 3,
  },
  {
    type: "angle-switch",
    title: "Industry Transplant",
    description:
      "How would a completely different industry solve this? Think restaurants, space exploration, or fashion. Cross-pollinate!",
    urgency: "medium",
    estimatedDurationMinutes: 5,
  },
  {
    type: "constraint-challenge",
    title: "Zero Budget Challenge",
    description:
      "How would you solve this with absolutely zero budget? Constraints breed creativity — some of the best ideas cost nothing.",
    prompt: "Reimagine your idea with zero budget",
    urgency: "low",
    estimatedDurationMinutes: 5,
  },
  {
    type: "encouragement",
    title: "Progress Check",
    description:
      "You've generated some great ideas! Take a moment to appreciate the thinking you've done. Innovation is iterative — every angle explored is progress.",
    urgency: "low",
    estimatedDurationMinutes: 1,
  },
  {
    type: "synthesis-prompt",
    title: "Combine Two Ideas",
    description:
      "Look at your top 2 ideas. What if you combined them? Sometimes the best innovation is a mashup of existing ideas.",
    prompt: "Combine your best two ideas into one super-idea",
    urgency: "medium",
    estimatedDurationMinutes: 5,
  },
  {
    type: "wild-card",
    title: "Time Travel",
    description:
      "How would this problem be solved in 2050? In 1900? Removing time constraints often reveals fundamental truths about the problem.",
    urgency: "low",
    estimatedDurationMinutes: 5,
  },
  {
    type: "wild-card",
    title: "Alien Perspective",
    description:
      "An intelligent alien visits Earth and encounters your problem. They have no cultural baggage. What solution would they propose?",
    urgency: "low",
    estimatedDurationMinutes: 3,
  },
];

// ---- Flow state detection ----

/**
 * Assess cognitive load and flow state from session indicators.
 * Uses heuristics — no LLM call required.
 */
export function assessFlowState(indicators: CognitiveLoadIndicators): FlowState {
  const {
    sessionDurationMinutes,
    ideasGenerated,
    timeSinceLastIdeaMinutes,
    ideaQualityTrend,
    repetitionRate,
    userInteractionFrequency,
  } = indicators;

  // Compute cognitive load (0 = fresh, 1 = exhausted)
  const durationLoad = Math.min(1, sessionDurationMinutes / 120);
  const stallLoad = Math.min(1, timeSinceLastIdeaMinutes / 15);
  const repetitionLoad = repetitionRate;
  const cognitiveLoad = durationLoad * 0.3 + stallLoad * 0.4 + repetitionLoad * 0.3;

  // Compute creative energy
  const qualityBoost =
    ideaQualityTrend === "improving" ? 0.3 : ideaQualityTrend === "stable" ? 0 : -0.3;
  const productivityBoost = ideasGenerated > 0 ? Math.min(0.3, ideasGenerated / 30) : -0.1;
  const creativeEnergy = Math.max(
    0,
    Math.min(1, 0.5 + qualityBoost + productivityBoost - cognitiveLoad * 0.5)
  );

  // Compute focus level
  const interactionBoost =
    userInteractionFrequency === "high"
      ? 0.3
      : userInteractionFrequency === "normal"
        ? 0.1
        : userInteractionFrequency === "low"
          ? -0.1
          : -0.4;
  const focusLevel = Math.max(0, Math.min(1, 0.5 + interactionBoost - stallLoad * 0.3));

  // Determine state
  let state: FlowState["state"];
  if (sessionDurationMinutes < 5) {
    state = "warm-up";
  } else if (cognitiveLoad > 0.8) {
    state = "fatigued";
  } else if (userInteractionFrequency === "idle" || timeSinceLastIdeaMinutes > 10) {
    state = "disengaged";
  } else if (repetitionRate > 0.5 && ideaQualityTrend === "declining") {
    state = "blocked";
  } else if (creativeEnergy > 0.6 && focusLevel > 0.5) {
    state = "flow";
  } else {
    state = "productive";
  }

  const recommendations: Record<FlowState["state"], string> = {
    "warm-up":
      "Getting started — explore freely without judgment. The best ideas come after initial warm-up.",
    flow: "You're in the zone! Keep going. Avoid interruptions.",
    productive: "Good pace. Consider trying a different angle for fresh perspectives.",
    fatigued: "You've been working hard. A short break would refresh your creative thinking.",
    blocked: "Feeling stuck is normal. Try a palate cleanser or perspective shift.",
    disengaged: "Seems like you've paused. Ready for a creative challenge to re-engage?",
  };

  return {
    state,
    cognitiveLoad: Math.round(cognitiveLoad * 100) / 100,
    creativeEnergy: Math.round(creativeEnergy * 100) / 100,
    focusLevel: Math.round(focusLevel * 100) / 100,
    recommendation: recommendations[state],
    confidence: 0.7,
  };
}

/**
 * Select the best intervention for the current flow state.
 */
export function selectIntervention(flowState: FlowState): Intervention {
  const stateToTypes: Record<FlowState["state"], Intervention["type"][]> = {
    "warm-up": ["encouragement", "wild-card"],
    flow: ["encouragement"],
    productive: ["perspective-shift", "angle-switch"],
    fatigued: ["break-suggestion"],
    blocked: ["palate-cleanser", "perspective-shift", "wild-card"],
    disengaged: ["constraint-challenge", "palate-cleanser", "wild-card"],
  };

  const preferredTypes = stateToTypes[flowState.state];
  const candidates = INTERVENTION_LIBRARY.filter((i) => preferredTypes.includes(i.type));

  if (candidates.length === 0) return INTERVENTION_LIBRARY[0];

  // Pick randomly from candidates for variety
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Options for LLM-powered intervention generation. */
export interface GenerateInterventionOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Generate a custom intervention using LLM based on current session context.
 */
export async function generateCustomIntervention(
  subject: string,
  flowState: FlowState,
  recentIdeas: string[] = [],
  options: GenerateInterventionOptions = {}
): Promise<Intervention> {
  const prompt = `You are a creative innovation coach. The user is in a ${flowState.state} state while innovating on "${sanitizeUserInput(subject)}".

Cognitive load: ${flowState.cognitiveLoad}, Creative energy: ${flowState.creativeEnergy}
Recent ideas: ${recentIdeas.slice(0, 5).join(", ") || "none yet"}

Generate a creative intervention to help them. Respond with JSON:
{
  "type": "perspective-shift|break-suggestion|palate-cleanser|angle-switch|constraint-challenge|encouragement|synthesis-prompt|wild-card",
  "title": "short catchy title",
  "description": "engaging description of the intervention",
  "prompt": "optional creative prompt for the user",
  "urgency": "low|medium|high",
  "estimatedDurationMinutes": <1-15>
}

Make it specific to their subject and state. Be creative and engaging.`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        throw new LlmParseError(
          `Failed to parse intervention: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal: options.signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );
  return InterventionSchema.parse(parsed);
}

/**
 * Record a flow state entry in the session timeline.
 */
export function recordFlowEntry(
  sessionId: string,
  state: FlowState["state"],
  cognitiveLoad: number,
  event?: string,
  intervention?: Intervention
): void {
  if (!sessionTimelines.has(sessionId)) {
    sessionTimelines.set(sessionId, []);
  }

  sessionTimelines.get(sessionId)!.push({
    timestamp: new Date().toISOString(),
    state,
    cognitiveLoad,
    event,
    intervention,
  });
}

/**
 * Get the flow timeline for a session.
 */
export function getFlowTimeline(sessionId: string): FlowTimelineEntry[] {
  return sessionTimelines.get(sessionId) ?? [];
}

/**
 * Get the full intervention library.
 */
export function getInterventionLibrary(): Intervention[] {
  return [...INTERVENTION_LIBRARY];
}

/**
 * Clear all flow state data.
 */
export function clearFlowData(): void {
  sessionTimelines.clear();
}
