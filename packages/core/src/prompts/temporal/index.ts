/**
 * @module prompts/temporal
 *
 * Temporal Innovation Lens — generates ideas contextualized to time horizons:
 * near-term (1yr), mid-term (5yr), and far-future (20yr). Prompt builders
 * ground ideas in realistic constraints per era.
 */

import { z } from "zod";
import { generateText, extractJson } from "../../copilot/client.js";
import { withRetry } from "../../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../../prompts/sanitize.js";
import type { Investigation, InnovationIdea } from "../../types.js";

// ---- Schemas ----

/** Available time horizons. */
export const TimeHorizonSchema = z.enum(["near", "mid", "far"]);

/** A temporally-contextualized idea with era-specific details. */
export const TemporalIdeaSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  implementationHint: z.string().max(2000),
  horizon: TimeHorizonSchema,
  enablers: z
    .array(z.string().max(500))
    .max(10)
    .describe("Technologies or trends enabling this idea in this era"),
  constraints: z.array(z.string().max(500)).max(10).describe("Realistic constraints of this era"),
  probability: z.number().min(0).max(1).describe("Estimated probability of viability in this era"),
});

/** Result of temporal lens analysis for a single horizon. */
export const TemporalHorizonResultSchema = z.object({
  horizon: TimeHorizonSchema,
  label: z.string().max(100),
  yearRange: z.string().max(50),
  ideas: z.array(TemporalIdeaSchema).max(20),
  eraContext: z
    .string()
    .max(2000)
    .describe("Description of the technological landscape in this era"),
});

/** Full temporal lens result across all requested horizons. */
export const TemporalLensResultSchema = z.object({
  subject: z.string().max(1000),
  horizons: z.array(TemporalHorizonResultSchema).max(3),
  timelineNarrative: z
    .string()
    .max(3000)
    .describe("Narrative connecting ideas across time horizons"),
});

// ---- Types ----

export type TimeHorizon = z.infer<typeof TimeHorizonSchema>;
export type TemporalIdea = z.infer<typeof TemporalIdeaSchema>;
export type TemporalHorizonResult = z.infer<typeof TemporalHorizonResultSchema>;
export type TemporalLensResult = z.infer<typeof TemporalLensResultSchema>;

/** Configuration for temporal lens generation. */
export interface TemporalLensConfig {
  horizons?: TimeHorizon[];
  ideasPerHorizon?: number;
  model?: string;
}

// ---- Horizon Definitions ----

const HORIZON_CONFIGS: Record<TimeHorizon, { label: string; yearRange: string; context: string }> =
  {
    near: {
      label: "Near-Term",
      yearRange: "0-1 years",
      context: `Focus on what's achievable with TODAY's technology and infrastructure. Consider:
- Currently available APIs, frameworks, and platforms
- Existing regulatory environment
- Current market conditions and consumer behavior
- Incremental improvements to existing solutions
- Resource constraints of typical organizations`,
    },
    mid: {
      label: "Mid-Term",
      yearRange: "2-5 years",
      context: `Consider emerging technologies reaching maturity. Account for:
- AI/ML becoming more capable and accessible
- Advancing edge computing and IoT
- Evolving regulatory frameworks
- Shifting consumer expectations and digital literacy
- Growing infrastructure (5G/6G, cloud, quantum exploration)
- Sustainability becoming a core business requirement`,
    },
    far: {
      label: "Far-Future",
      yearRange: "10-20 years",
      context: `Imagine transformative possibilities with breakthrough technologies. Consider:
- Mature quantum computing for select applications
- Advanced human-AI collaboration and AGI-adjacent systems
- Brain-computer interfaces reaching consumer adoption
- Fully autonomous systems across domains
- Radical shifts in energy, materials, and biology
- New economic models and governance structures
- Climate adaptation and space economy`,
    },
  };

// ---- Core Functions ----

/**
 * Build a temporal prompt for a specific time horizon.
 *
 * @param subject - The innovation subject
 * @param horizon - The time horizon to target
 * @param investigation - Optional investigation for context
 * @param ideasPerHorizon - Number of ideas to generate (default: 3)
 * @returns The formatted prompt string
 */
export function buildTemporalPrompt(
  subject: string,
  horizon: TimeHorizon,
  investigation?: Investigation,
  ideasPerHorizon: number = 3
): string {
  const config = HORIZON_CONFIGS[horizon];

  const investigationCtx = investigation
    ? `\nINVESTIGATION CONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}\nOpportunities: ${investigation.opportunities.join("; ")}`
    : "";

  return `You are a futurist and innovation strategist specializing in temporal analysis.

${wrapUserInput("SUBJECT", subject)}
${investigationCtx}

TIME HORIZON: ${config.label} (${config.yearRange})

ERA CONTEXT:
${config.context}

Generate ${ideasPerHorizon} innovative ideas for this subject that are specifically grounded in the ${config.label} time horizon.
Each idea must be realistic for its era — don't propose far-future tech for near-term, or trivial improvements for far-future.

For each idea, provide:
- title, description, potentialImpact, implementationHint
- horizon: "${horizon}"
- enablers: technologies/trends that make this possible in this era
- constraints: realistic limitations of this era
- probability: 0-1 estimated viability

Also provide an eraContext describing the technological landscape.

Return valid JSON only:
{
  "horizon": "${horizon}",
  "label": "${config.label}",
  "yearRange": "${config.yearRange}",
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "implementationHint": "...",
      "horizon": "${horizon}",
      "enablers": ["..."],
      "constraints": ["..."],
      "probability": 0.8
    }
  ],
  "eraContext": "Description of the landscape..."
}`;
}

/**
 * Generate temporal ideas for a single horizon.
 *
 * @param subject - The innovation subject
 * @param horizon - Target time horizon
 * @param investigation - Optional investigation context
 * @param config - Temporal lens configuration
 * @param signal - Optional AbortSignal
 * @returns Temporal horizon result
 */
export async function generateForHorizon(
  subject: string,
  horizon: TimeHorizon,
  investigation?: Investigation,
  config: TemporalLensConfig = {},
  signal?: AbortSignal
): Promise<TemporalHorizonResult> {
  const prompt = buildTemporalPrompt(subject, horizon, investigation, config.ideasPerHorizon ?? 3);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        serverMode: true,
        signal,
      });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse temporal response: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
    }
  );

  return TemporalHorizonResultSchema.parse(parsed);
}

/**
 * Run full temporal lens analysis across multiple horizons.
 *
 * @param subject - The innovation subject
 * @param investigation - Optional investigation context
 * @param config - Temporal lens configuration
 * @param signal - Optional AbortSignal
 * @returns Complete temporal lens result
 */
export async function runTemporalLens(
  subject: string,
  investigation?: Investigation,
  config: TemporalLensConfig = {},
  signal?: AbortSignal
): Promise<TemporalLensResult> {
  const horizons = config.horizons ?? (["near", "mid", "far"] as TimeHorizon[]);

  const results: TemporalHorizonResult[] = [];
  for (const horizon of horizons) {
    if (signal?.aborted) break;
    const result = await generateForHorizon(subject, horizon, investigation, config, signal);
    results.push(result);
  }

  // Generate connecting narrative
  let narrative = "Ideas span from immediate improvements to transformative future possibilities.";
  if (results.length > 1) {
    try {
      narrative = await generateTimelineNarrative(subject, results, config.model, signal);
    } catch {
      // fallback narrative
    }
  }

  return {
    subject,
    horizons: results,
    timelineNarrative: narrative,
  };
}

/**
 * Get the configuration for a specific time horizon.
 *
 * @param horizon - The time horizon
 * @returns Horizon label, year range, and context description
 */
export function getHorizonConfig(horizon: TimeHorizon): {
  label: string;
  yearRange: string;
  context: string;
} {
  return { ...HORIZON_CONFIGS[horizon] };
}

// ---- Helpers ----

async function generateTimelineNarrative(
  subject: string,
  horizons: TemporalHorizonResult[],
  model?: string,
  signal?: AbortSignal
): Promise<string> {
  const summary = horizons.map((h) => ({
    horizon: h.label,
    ideas: h.ideas.map((i) => i.title),
  }));

  const prompt = `Write a brief narrative (max 3000 chars) connecting these innovation ideas across time horizons for "${subject}":

${sanitizeLlmOutput(JSON.stringify(summary, null, 2))}

Explain how near-term ideas lay groundwork for mid-term, and how mid-term enables far-future possibilities.
Return only the narrative text, no JSON.`;

  const raw = await generateText({ prompt, model, serverMode: true, signal });
  return raw.slice(0, 3000);
}
