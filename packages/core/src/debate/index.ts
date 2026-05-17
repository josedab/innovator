/**
 * @module debate
 *
 * Structured debate engine that generates pro/con arguments for innovation ideas,
 * runs multi-round rebuttal cycles, and synthesizes a final verdict.
 * Supports configurable debater personas and debate quality scoring.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { Investigation, InnovationIdea } from "../types.js";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

/** Zod schema for a debater persona with name, role, bias direction, and argumentation style. */
export const DebaterPersonaSchema = z.object({
  name: z.string().max(200),
  role: z.string().max(500).describe("Role description for the debater"),
  bias: z.enum(["pro", "con"]).describe("Which side this persona argues for"),
  style: z.string().max(500).optional().describe("Argumentation style"),
});

/** Zod schema for a single debate argument with point, evidence, and strength score. */
export const DebateArgumentSchema = z.object({
  point: z.string().max(2000).describe("The core argument"),
  evidence: z.string().max(2000).describe("Supporting evidence or reasoning"),
  strength: z.number().min(1).max(10).describe("How strong this argument is"),
});

/** Zod schema for one debate round containing pro/con arguments and optional rebuttals. */
export const DebateRoundSchema = z.object({
  round: z.number().min(1),
  proArguments: z.array(DebateArgumentSchema).max(10),
  conArguments: z.array(DebateArgumentSchema).max(10),
  proRebuttal: z.string().max(3000).optional(),
  conRebuttal: z.string().max(3000).optional(),
});

/** Zod schema for the final debate verdict including winner, confidence, and conditions for change. */
export const DebateVerdictSchema = z.object({
  winner: z.enum(["pro", "con", "nuanced"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(3000),
  keyInsight: z.string().max(1000),
  conditions: z
    .array(z.string().max(500))
    .max(10)
    .describe("Conditions under which verdict changes"),
});

/** Zod schema for debate quality metrics across argument depth, evidence, balance, and novelty. */
export const DebateQualitySchema = z.object({
  argumentDepth: z.number().min(1).max(10),
  evidenceQuality: z.number().min(1).max(10),
  balanceScore: z.number().min(1).max(10),
  insightNovelty: z.number().min(1).max(10),
  overall: z.number().min(1).max(10),
});

/** Zod schema for the complete debate result including all rounds, verdict, and quality scores. */
export const DebateResultSchema = z.object({
  idea: z.string().max(500),
  rounds: z.array(DebateRoundSchema).max(10),
  verdict: DebateVerdictSchema,
  quality: DebateQualitySchema,
  totalRounds: z.number().min(1),
});

/** A debater persona defining name, role, bias direction, and argumentation style. */
export type DebaterPersona = z.infer<typeof DebaterPersonaSchema>;
/** A single argument in a debate round with point, evidence, and strength (1-10). */
export type DebateArgument = z.infer<typeof DebateArgumentSchema>;
/** One round of debate containing pro/con arguments and optional rebuttals. */
export type DebateRound = z.infer<typeof DebateRoundSchema>;
/** Final verdict of a debate: winner, confidence, summary, key insight, and conditions for change. */
export type DebateVerdict = z.infer<typeof DebateVerdictSchema>;
/** Quality metrics for a debate session (each scored 1-10). */
export type DebateQuality = z.infer<typeof DebateQualitySchema>;
/** Complete result of a structured debate including all rounds, verdict, and quality scores. */
export type DebateResult = z.infer<typeof DebateResultSchema>;

/** Configuration for a structured debate session. */
export interface DebateConfig {
  rounds?: number;
  personas?: { pro: DebaterPersona; con: DebaterPersona };
  model?: string;
  signal?: AbortSignal;
}

// ---- Default Personas ----

/** Default persona that argues in favor of an idea. */
export const DEFAULT_PRO_PERSONA: DebaterPersona = {
  name: "Innovation Advocate",
  role: "Argues in favor of the idea, highlighting potential, market opportunity, and strategic value",
  bias: "pro",
  style: "optimistic but evidence-based",
};

/** Default persona that argues against an idea. */
export const DEFAULT_CON_PERSONA: DebaterPersona = {
  name: "Critical Analyst",
  role: "Challenges the idea, identifying risks, feasibility concerns, and market barriers",
  bias: "con",
  style: "rigorous and skeptical",
};

// ---- Prompt Builders ----

function buildDebatePrompt(
  idea: InnovationIdea,
  investigation: Investigation | undefined,
  side: "pro" | "con",
  persona: DebaterPersona,
  previousRound?: DebateRound
): string {
  const context = investigation
    ? `\nCONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}\nOpportunities: ${investigation.opportunities.join("; ")}`
    : "";

  const rebuttalContext = previousRound
    ? `\nPREVIOUS ROUND ${previousRound.round}:\nPro arguments: ${JSON.stringify(previousRound.proArguments)}\nCon arguments: ${JSON.stringify(previousRound.conArguments)}\n\nYou must rebut the opposing side's arguments and strengthen your own position.`
    : "";

  return `You are ${persona.name}, a ${persona.role}.
Your argumentation style: ${persona.style || "balanced and thorough"}.
You are arguing the ${side.toUpperCase()} side.

${wrapUserInput("IDEA TITLE", idea.title)}
${wrapUserInput("IDEA DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL IMPACT", idea.potentialImpact)}
${context}
${rebuttalContext}

Generate ${side === "pro" ? "supporting" : "opposing"} arguments for this idea.
${previousRound ? "Also provide a rebuttal to the opposing side's previous arguments." : ""}

Respond with JSON only:
{
  "arguments": [
    { "point": "...", "evidence": "...", "strength": 1-10 }
  ]${previousRound ? `,\n  "rebuttal": "A concise rebuttal of the opposing arguments"` : ""}
}`;
}

function buildVerdictPrompt(idea: InnovationIdea, rounds: DebateRound[]): string {
  const roundsSummary = rounds.map((r) => ({
    round: r.round,
    pro: r.proArguments.map((a) => a.point),
    con: r.conArguments.map((a) => a.point),
    proRebuttal: r.proRebuttal,
    conRebuttal: r.conRebuttal,
  }));

  return `You are an impartial judge evaluating a structured debate about an innovation idea.

${wrapUserInput("IDEA", idea.title + ": " + idea.description)}

DEBATE ROUNDS:
"""
${sanitizeLlmOutput(JSON.stringify(roundsSummary, null, 2))}
"""

Synthesize a verdict considering all arguments and rebuttals.

Respond with JSON only:
{
  "verdict": {
    "winner": "pro" | "con" | "nuanced",
    "confidence": 0.0-1.0,
    "summary": "Overall assessment",
    "keyInsight": "The most important takeaway",
    "conditions": ["Condition that could change the verdict"]
  },
  "quality": {
    "argumentDepth": 1-10,
    "evidenceQuality": 1-10,
    "balanceScore": 1-10,
    "insightNovelty": 1-10,
    "overall": 1-10
  }
}`;
}

// ---- Core Functions ----

const ArgumentsResponseSchema = z.object({
  arguments: z.array(DebateArgumentSchema).max(10),
  rebuttal: z.string().max(3000).optional(),
});

const VerdictResponseSchema = z.object({
  verdict: DebateVerdictSchema,
  quality: DebateQualitySchema,
});

async function generateArguments(
  idea: InnovationIdea,
  investigation: Investigation | undefined,
  side: "pro" | "con",
  persona: DebaterPersona,
  previousRound: DebateRound | undefined,
  config: DebateConfig
): Promise<{ arguments: DebateArgument[]; rebuttal?: string }> {
  const prompt = buildDebatePrompt(idea, investigation, side, persona, previousRound);

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr);
      return ArgumentsResponseSchema.parse(parsed);
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

/**
 * Run a structured debate on an innovation idea.
 *
 * Generates pro and con arguments in parallel across multiple rounds,
 * then synthesizes a final verdict with quality scoring.
 *
 * @param idea - The innovation idea to debate.
 * @param investigation - Optional investigation context for grounding arguments.
 * @param config - Debate configuration (rounds, personas, model, signal).
 * @returns A complete {@link DebateResult} with all rounds, verdict, and quality scores.
 * @throws If the number of rounds is outside the 1-5 range.
 */
export async function runDebate(
  idea: InnovationIdea,
  investigation?: Investigation,
  config: DebateConfig = {}
): Promise<DebateResult> {
  const rounds = config.rounds ?? 2;
  const proPersona = config.personas?.pro ?? DEFAULT_PRO_PERSONA;
  const conPersona = config.personas?.con ?? DEFAULT_CON_PERSONA;

  if (rounds < 1 || rounds > 5) {
    throw new ValidationError("Debate rounds must be between 1 and 5");
  }

  const debateRounds: DebateRound[] = [];

  for (let i = 1; i <= rounds; i++) {
    const previousRound =
      debateRounds.length > 0 ? debateRounds[debateRounds.length - 1] : undefined;

    // Run pro and con arguments in parallel
    const [proResult, conResult] = await Promise.all([
      generateArguments(idea, investigation, "pro", proPersona, previousRound, config),
      generateArguments(idea, investigation, "con", conPersona, previousRound, config),
    ]);

    debateRounds.push({
      round: i,
      proArguments: proResult.arguments,
      conArguments: conResult.arguments,
      proRebuttal: proResult.rebuttal,
      conRebuttal: conResult.rebuttal,
    });
  }

  // Synthesize verdict
  const verdictPrompt = buildVerdictPrompt(idea, debateRounds);
  const verdictResult = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: verdictPrompt,
        model: config.model,
        signal: config.signal,
      });
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr);
      return VerdictResponseSchema.parse(parsed);
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );

  return DebateResultSchema.parse({
    idea: idea.title,
    rounds: debateRounds,
    verdict: verdictResult.verdict,
    quality: verdictResult.quality,
    totalRounds: rounds,
  });
}

/**
 * Run debates on multiple ideas sequentially and return results sorted by verdict confidence.
 * @param ideas - Array of innovation ideas to debate.
 * @param investigation - Optional investigation context.
 * @param config - Debate configuration.
 * @returns Array of {@link DebateResult} sorted by descending verdict confidence.
 */
export async function debateIdeas(
  ideas: InnovationIdea[],
  investigation?: Investigation,
  config: DebateConfig = {}
): Promise<DebateResult[]> {
  const results: DebateResult[] = [];
  for (const idea of ideas) {
    const result = await runDebate(idea, investigation, config);
    results.push(result);
  }
  return results.sort((a, b) => b.verdict.confidence - a.verdict.confidence);
}

/**
 * Format a debate result as readable markdown with rounds, verdict, and quality scores.
 * @param result - The debate result to format.
 * @returns A markdown string.
 */
export function debateToMarkdown(result: DebateResult): string {
  const lines: string[] = [`# Debate: ${result.idea}`, ""];

  for (const round of result.rounds) {
    lines.push(`## Round ${round.round}`);
    lines.push("");
    lines.push("### Pro Arguments");
    for (const arg of round.proArguments) {
      lines.push(`- **${arg.point}** (strength: ${arg.strength}/10)`);
      lines.push(`  ${arg.evidence}`);
    }
    if (round.proRebuttal) {
      lines.push(`\n*Pro Rebuttal:* ${round.proRebuttal}`);
    }
    lines.push("");
    lines.push("### Con Arguments");
    for (const arg of round.conArguments) {
      lines.push(`- **${arg.point}** (strength: ${arg.strength}/10)`);
      lines.push(`  ${arg.evidence}`);
    }
    if (round.conRebuttal) {
      lines.push(`\n*Con Rebuttal:* ${round.conRebuttal}`);
    }
    lines.push("");
  }

  lines.push("## Verdict");
  lines.push(
    `**Winner:** ${result.verdict.winner} (confidence: ${(result.verdict.confidence * 100).toFixed(0)}%)`
  );
  lines.push(`\n${result.verdict.summary}`);
  lines.push(`\n**Key Insight:** ${result.verdict.keyInsight}`);

  if (result.verdict.conditions.length > 0) {
    lines.push("\n**Conditions for change:**");
    for (const c of result.verdict.conditions) {
      lines.push(`- ${c}`);
    }
  }

  lines.push("\n## Quality Scores");
  lines.push(`- Argument Depth: ${result.quality.argumentDepth}/10`);
  lines.push(`- Evidence Quality: ${result.quality.evidenceQuality}/10`);
  lines.push(`- Balance: ${result.quality.balanceScore}/10`);
  lines.push(`- Insight Novelty: ${result.quality.insightNovelty}/10`);
  lines.push(`- Overall: ${result.quality.overall}/10`);

  return lines.join("\n");
}
