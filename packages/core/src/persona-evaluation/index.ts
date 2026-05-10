/**
 * @module persona-evaluation
 *
 * Stakeholder Persona Simulation — configurable persona templates,
 * multi-persona evaluation with per-persona scorecards, alignment matrices,
 * conflict detection, and mediation suggestions.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const PersonaTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(100),
  priorities: z.array(z.string().max(200)).min(1).max(20),
  riskTolerance: z.number().int().min(1).max(10),
  domainExpertise: z.array(z.string().max(200)).max(20),
  biases: z.array(z.string().max(200)).max(20),
  evaluationCriteria: z.array(z.string().max(200)).min(1).max(20),
  customPromptContext: z.string().max(2000).optional(),
});

export type PersonaTemplate = z.infer<typeof PersonaTemplateSchema>;

export const PersonaScorecardSchema = z.object({
  personaId: z.string(),
  ideaTitle: z.string(),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
  strengths: z.array(z.string().max(500)).max(20),
  concerns: z.array(z.string().max(500)).max(20),
  recommendation: z.string().max(3000),
  riskFlags: z.array(z.string().max(500)).max(20),
});

export type PersonaScorecard = z.infer<typeof PersonaScorecardSchema>;

export const AlignmentMatrixSchema = z.object({
  personas: z.array(z.string()),
  ideas: z.array(z.string()),
  scores: z.array(z.array(z.number().min(0).max(100))),
  consensusIdeas: z.array(z.string()),
  divisiveIdeas: z.array(z.string()),
  alignmentScore: z.number().min(0).max(1),
});

export type AlignmentMatrix = z.infer<typeof AlignmentMatrixSchema>;

export const MediationSuggestionSchema = z.object({
  conflictDescription: z.string().max(2000),
  personaA: z.string(),
  personaB: z.string(),
  suggestedCompromise: z.string().max(3000),
  tradeoffs: z.array(z.string().max(500)).max(20),
});

export type MediationSuggestion = z.infer<typeof MediationSuggestionSchema>;

export const StakeholderAssessmentSchema = z.object({
  idea: z.string(),
  scorecards: z.array(PersonaScorecardSchema),
  alignmentMatrix: AlignmentMatrixSchema,
  mediationSuggestions: z.array(MediationSuggestionSchema),
  overallReadiness: z.enum(["ready", "conditional", "not-ready"]),
  riskFlags: z.array(z.string().max(500)).max(50),
  executiveSummary: z.string().max(5000),
});

export type StakeholderAssessment = z.infer<typeof StakeholderAssessmentSchema>;

// ---- Built-in Personas ----

export const BUILT_IN_PERSONAS: PersonaTemplate[] = [
  {
    id: "cto",
    name: "Chief Technology Officer",
    role: "CTO",
    priorities: ["technical feasibility", "architecture", "team capabilities", "scalability"],
    riskTolerance: 5,
    domainExpertise: ["software architecture", "engineering management", "technology strategy"],
    biases: ["favors proven technologies", "values engineering elegance"],
    evaluationCriteria: [
      "technical feasibility",
      "scalability",
      "security",
      "maintainability",
      "innovation",
    ],
  },
  {
    id: "end-user",
    name: "End User Representative",
    role: "End User",
    priorities: ["usability", "value delivered", "pain points solved", "simplicity"],
    riskTolerance: 7,
    domainExpertise: ["user experience", "product adoption", "daily workflows"],
    biases: ["prefers simplicity over features", "values immediate utility"],
    evaluationCriteria: [
      "ease of use",
      "value proposition",
      "learning curve",
      "reliability",
      "accessibility",
    ],
  },
  {
    id: "investor",
    name: "Venture Capital Investor",
    role: "Investor",
    priorities: ["market size", "defensibility", "growth potential", "exit path"],
    riskTolerance: 8,
    domainExpertise: ["market analysis", "financial modeling", "competitive landscape"],
    biases: ["favors high-growth opportunities", "values network effects"],
    evaluationCriteria: [
      "market opportunity",
      "competitive advantage",
      "revenue potential",
      "scalability",
      "team capability",
    ],
  },
  {
    id: "regulator",
    name: "Regulatory Authority Representative",
    role: "Regulator",
    priorities: ["compliance", "data protection", "safety", "consumer rights"],
    riskTolerance: 2,
    domainExpertise: ["regulatory frameworks", "data privacy", "industry standards"],
    biases: ["prioritizes caution over innovation", "values precedent"],
    evaluationCriteria: [
      "regulatory compliance",
      "data privacy",
      "safety",
      "transparency",
      "accountability",
    ],
  },
];

// ---- Persona Registry ----

const customPersonas = new Map<string, PersonaTemplate>();

/** Create and register a custom persona template. */
export function createPersona(template: PersonaTemplate): PersonaTemplate {
  const validated = PersonaTemplateSchema.parse(template);
  customPersonas.set(validated.id, validated);
  return validated;
}

/** Get a persona by ID (built-in or custom). */
export function getPersona(id: string): PersonaTemplate | undefined {
  return customPersonas.get(id) ?? BUILT_IN_PERSONAS.find((p) => p.id === id);
}

/** List all available personas (built-in + custom). */
export function listPersonas(): PersonaTemplate[] {
  const builtInIds = new Set(BUILT_IN_PERSONAS.map((p) => p.id));
  const customs = [...customPersonas.values()].filter((p) => !builtInIds.has(p.id));
  return [...BUILT_IN_PERSONAS, ...customs];
}

// ---- Prompt Builders ----

function buildScorecardPrompt(idea: string, persona: PersonaTemplate): string {
  const criteriaList = persona.evaluationCriteria.map((c) => `"${c}"`).join(", ");
  return `You are ${persona.name}, a ${persona.role}.

Your priorities: ${persona.priorities.join(", ")}
Your risk tolerance: ${persona.riskTolerance}/10
Your domain expertise: ${persona.domainExpertise.join(", ")}
Your known biases: ${persona.biases.join(", ")}
${persona.customPromptContext ? `Additional context: ${persona.customPromptContext}` : ""}

Evaluate the following idea from your persona's perspective.
${wrapUserInput("Idea", idea)}

Score each of these criteria from 0-100: ${criteriaList}
Also provide an overall score (0-100), strengths, concerns, a recommendation, and any risk flags.

Respond in JSON:
{
  "overallScore": 0-100,
  "dimensionScores": { ${persona.evaluationCriteria.map((c) => `"${c}": 0`).join(", ")} },
  "strengths": ["strength1"],
  "concerns": ["concern1"],
  "recommendation": "your recommendation",
  "riskFlags": ["flag1"]
}`;
}

function buildMediationPrompt(
  idea: string,
  scorecardA: PersonaScorecard,
  scorecardB: PersonaScorecard,
  personaA: PersonaTemplate,
  personaB: PersonaTemplate,
  conflictDescription: string
): string {
  return `You are an expert mediator resolving a stakeholder conflict about an innovation idea.

${wrapUserInput("Idea", idea)}

Conflict: ${conflictDescription}

${personaA.name} (${personaA.role}):
- Overall Score: ${scorecardA.overallScore}/100
- Concerns: ${scorecardA.concerns.join("; ")}
- Recommendation: ${scorecardA.recommendation}

${personaB.name} (${personaB.role}):
- Overall Score: ${scorecardB.overallScore}/100
- Concerns: ${scorecardB.concerns.join("; ")}
- Recommendation: ${scorecardB.recommendation}

Suggest a compromise that addresses both parties' concerns. Identify the tradeoffs involved.

Respond in JSON:
{
  "suggestedCompromise": "detailed compromise proposal",
  "tradeoffs": ["tradeoff1", "tradeoff2"]
}`;
}

// ---- Multi-Persona Evaluation ----

interface EvaluationOptions {
  model?: string;
  signal?: AbortSignal;
}

/** Run a single persona evaluation on an idea. */
export async function evaluateWithPersona(
  idea: string,
  personaId: string,
  options: EvaluationOptions = {}
): Promise<PersonaScorecard> {
  if (!idea || idea.trim().length === 0) throw new Error("Idea cannot be empty");
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Persona not found: ${personaId}`);

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildScorecardPrompt(idea, persona),
        model: options.model,
        signal: options.signal,
      });
      const jsonStr = extractJson(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error(`Failed to parse persona evaluation response as JSON`);
      }
      return PersonaScorecardSchema.parse({
        personaId,
        ideaTitle: idea,
        ...(parsed as Record<string, unknown>),
      });
    },
    { signal: options.signal }
  );
}

/** Evaluate an idea with multiple personas in parallel. */
export async function evaluateWithMultiplePersonas(
  idea: string,
  personaIds: string[],
  options: EvaluationOptions = {}
): Promise<PersonaScorecard[]> {
  if (!idea || idea.trim().length === 0) throw new Error("Idea cannot be empty");
  if (!personaIds || personaIds.length === 0) throw new Error("At least one persona ID required");
  const results = await Promise.allSettled(
    personaIds.map((id) => evaluateWithPersona(idea, id, options))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<PersonaScorecard> => r.status === "fulfilled")
    .map((r) => r.value);
}

/** Evaluate multiple ideas across multiple personas, producing an alignment matrix. */
export async function buildAlignmentMatrix(
  ideas: string[],
  personaIds: string[],
  options: EvaluationOptions = {}
): Promise<AlignmentMatrix> {
  // Evaluate all idea×persona combinations
  const allScorecards: PersonaScorecard[][] = [];
  for (const idea of ideas) {
    const scorecards = await evaluateWithMultiplePersonas(idea, personaIds, options);
    allScorecards.push(scorecards);
  }

  // Build scores 2D array: rows = personas, columns = ideas
  const scores: number[][] = personaIds.map((pid) =>
    ideas.map((_, ideaIdx) => {
      const card = allScorecards[ideaIdx].find((s) => s.personaId === pid);
      return card?.overallScore ?? 0;
    })
  );

  // Identify consensus and divisive ideas
  const CONSENSUS_THRESHOLD = 15;
  const DIVISIVE_THRESHOLD = 30;
  const consensusIdeas: string[] = [];
  const divisiveIdeas: string[] = [];

  for (let ideaIdx = 0; ideaIdx < ideas.length; ideaIdx++) {
    const ideaScores = personaIds.map((_, pIdx) => scores[pIdx][ideaIdx]);
    if (ideaScores.length < 2) continue;

    const min = Math.min(...ideaScores);
    const max = Math.max(...ideaScores);
    const spread = max - min;

    if (spread <= CONSENSUS_THRESHOLD) {
      consensusIdeas.push(ideas[ideaIdx]);
    } else if (spread >= DIVISIVE_THRESHOLD) {
      divisiveIdeas.push(ideas[ideaIdx]);
    }
  }

  // Compute overall alignment score (1 - normalized average spread)
  let totalSpread = 0;
  let count = 0;
  for (let ideaIdx = 0; ideaIdx < ideas.length; ideaIdx++) {
    const ideaScores = personaIds.map((_, pIdx) => scores[pIdx][ideaIdx]);
    if (ideaScores.length < 2) continue;
    totalSpread += Math.max(...ideaScores) - Math.min(...ideaScores);
    count++;
  }
  const alignmentScore = count > 0 ? Math.max(0, 1 - totalSpread / (count * 100)) : 1;

  return AlignmentMatrixSchema.parse({
    personas: personaIds,
    ideas,
    scores,
    consensusIdeas,
    divisiveIdeas,
    alignmentScore: Math.round(alignmentScore * 100) / 100,
  });
}

// ---- Conflict Resolution ----

/** Detect conflicts between persona scorecards based on score divergence. */
export function detectConflicts(
  scorecards: PersonaScorecard[]
): Array<{ personaA: string; personaB: string; description: string }> {
  const CONFLICT_THRESHOLD = 30;
  const conflicts: Array<{ personaA: string; personaB: string; description: string }> = [];

  for (let i = 0; i < scorecards.length; i++) {
    for (let j = i + 1; j < scorecards.length; j++) {
      const a = scorecards[i];
      const b = scorecards[j];
      const diff = Math.abs(a.overallScore - b.overallScore);

      if (diff >= CONFLICT_THRESHOLD) {
        const higher = a.overallScore > b.overallScore ? a : b;
        const lower = a.overallScore > b.overallScore ? b : a;
        conflicts.push({
          personaA: a.personaId,
          personaB: b.personaId,
          description: `${higher.personaId} scored ${higher.overallScore}/100 vs ${lower.personaId} at ${lower.overallScore}/100 (${diff} point gap). Key disagreement areas: ${lower.concerns.slice(0, 2).join("; ")}`,
        });
      }
    }
  }

  return conflicts.sort(
    (a, b) => b.description.length - a.description.length
  );
}

/** Generate LLM-powered mediation suggestions for conflicting scorecards. */
export async function suggestMediation(
  scorecards: PersonaScorecard[],
  options: EvaluationOptions = {}
): Promise<MediationSuggestion[]> {
  const conflicts = detectConflicts(scorecards);
  if (conflicts.length === 0) return [];

  const suggestions: MediationSuggestion[] = [];

  for (const conflict of conflicts) {
    if (options.signal?.aborted) break;

    const cardA = scorecards.find((s) => s.personaId === conflict.personaA)!;
    const cardB = scorecards.find((s) => s.personaId === conflict.personaB)!;
    const personaA = getPersona(conflict.personaA);
    const personaB = getPersona(conflict.personaB);

    if (!personaA || !personaB) continue;

    try {
      const suggestion = await withRetry(
        async () => {
          const raw = await generateText({
            prompt: buildMediationPrompt(
              cardA.ideaTitle,
              cardA,
              cardB,
              personaA,
              personaB,
              conflict.description
            ),
            model: options.model,
            signal: options.signal,
          });
          const parsed = JSON.parse(extractJson(raw));
          return MediationSuggestionSchema.parse({
            conflictDescription: conflict.description,
            personaA: conflict.personaA,
            personaB: conflict.personaB,
            ...parsed,
          });
        },
        { signal: options.signal }
      );
      suggestions.push(suggestion);
    } catch {
      // Non-critical: skip mediation on failure
    }
  }

  return suggestions;
}

/** Generate a full stakeholder assessment with scorecards, alignment, mediation, and readiness. */
export async function generateStakeholderAssessment(
  idea: string,
  personaIds: string[],
  options: EvaluationOptions = {}
): Promise<StakeholderAssessment> {
  // Evaluate all personas
  const scorecards = await evaluateWithMultiplePersonas(idea, personaIds, options);

  // Build alignment matrix for single idea
  const alignmentMatrix = await buildAlignmentMatrix([idea], personaIds, options);

  // Generate mediation suggestions for conflicts
  const mediationSuggestions = await suggestMediation(scorecards, options);

  // Aggregate risk flags
  const allRiskFlags = [...new Set(scorecards.flatMap((s) => s.riskFlags))];

  // Determine readiness
  const avgScore =
    scorecards.length > 0
      ? scorecards.reduce((sum, s) => sum + s.overallScore, 0) / scorecards.length
      : 0;
  const hasHighRisk = allRiskFlags.length > 3;
  const hasConflicts = mediationSuggestions.length > 0;

  let overallReadiness: "ready" | "conditional" | "not-ready";
  if (avgScore >= 70 && !hasHighRisk) {
    overallReadiness = "ready";
  } else if (avgScore >= 40 || (avgScore >= 30 && !hasHighRisk)) {
    overallReadiness = "conditional";
  } else {
    overallReadiness = "not-ready";
  }

  // Build executive summary
  const supportCount = scorecards.filter((s) => s.overallScore >= 60).length;
  const oppositionCount = scorecards.filter((s) => s.overallScore < 40).length;

  const executiveSummary = [
    `Assessment of "${idea}" across ${scorecards.length} stakeholder personas.`,
    `Average score: ${avgScore.toFixed(0)}/100.`,
    `${supportCount} persona(s) supportive, ${oppositionCount} persona(s) opposed.`,
    hasConflicts
      ? `${mediationSuggestions.length} conflict(s) identified with mediation suggestions provided.`
      : "No significant conflicts detected.",
    allRiskFlags.length > 0
      ? `Risk flags: ${allRiskFlags.slice(0, 5).join("; ")}.`
      : "No risk flags identified.",
    `Overall readiness: ${overallReadiness}.`,
  ].join(" ");

  return StakeholderAssessmentSchema.parse({
    idea,
    scorecards,
    alignmentMatrix,
    mediationSuggestions,
    overallReadiness,
    riskFlags: allRiskFlags,
    executiveSummary,
  });
}

// ---- Markdown Export ----

/** Convert a stakeholder assessment to a markdown report. */
export function assessmentToMarkdown(assessment: StakeholderAssessment): string {
  const lines: string[] = [
    "# Stakeholder Persona Assessment",
    "",
    `**Idea:** ${assessment.idea}`,
    `**Overall Readiness:** ${assessment.overallReadiness}`,
    `**Alignment Score:** ${(assessment.alignmentMatrix.alignmentScore * 100).toFixed(0)}%`,
    "",
    "## Executive Summary",
    "",
    assessment.executiveSummary,
    "",
  ];

  // Scorecards
  lines.push("## Persona Scorecards", "");
  for (const card of assessment.scorecards) {
    const persona = getPersona(card.personaId);
    const label = persona ? `${persona.name} (${card.personaId})` : card.personaId;
    lines.push(`### ${label}`);
    lines.push(`**Overall Score:** ${card.overallScore}/100`);
    lines.push("");

    // Dimension scores table
    const dims = Object.entries(card.dimensionScores);
    if (dims.length > 0) {
      lines.push("| Criterion | Score |");
      lines.push("|-----------|-------|");
      for (const [criterion, score] of dims) {
        lines.push(`| ${criterion} | ${score}/100 |`);
      }
      lines.push("");
    }

    if (card.strengths.length > 0) {
      lines.push("**Strengths:**");
      card.strengths.forEach((s) => lines.push(`- ${s}`));
      lines.push("");
    }
    if (card.concerns.length > 0) {
      lines.push("**Concerns:**");
      card.concerns.forEach((c) => lines.push(`- ${c}`));
      lines.push("");
    }
    if (card.riskFlags.length > 0) {
      lines.push("**Risk Flags:**");
      card.riskFlags.forEach((f) => lines.push(`- ⚠️ ${f}`));
      lines.push("");
    }
    lines.push(`**Recommendation:** ${card.recommendation}`, "");
  }

  // Alignment matrix
  if (assessment.alignmentMatrix.ideas.length > 0) {
    lines.push("## Alignment Matrix", "");
    if (assessment.alignmentMatrix.consensusIdeas.length > 0) {
      lines.push(
        `**Consensus Ideas:** ${assessment.alignmentMatrix.consensusIdeas.join(", ")}`
      );
    }
    if (assessment.alignmentMatrix.divisiveIdeas.length > 0) {
      lines.push(
        `**Divisive Ideas:** ${assessment.alignmentMatrix.divisiveIdeas.join(", ")}`
      );
    }
    lines.push("");
  }

  // Mediation suggestions
  if (assessment.mediationSuggestions.length > 0) {
    lines.push("## Conflict Resolution", "");
    for (const med of assessment.mediationSuggestions) {
      lines.push(`### ${med.personaA} vs ${med.personaB}`);
      lines.push(`**Conflict:** ${med.conflictDescription}`);
      lines.push(`**Suggested Compromise:** ${med.suggestedCompromise}`);
      if (med.tradeoffs.length > 0) {
        lines.push("**Tradeoffs:**");
        med.tradeoffs.forEach((t) => lines.push(`- ${t}`));
      }
      lines.push("");
    }
  }

  // Risk flags
  if (assessment.riskFlags.length > 0) {
    lines.push("## Risk Flags", "");
    assessment.riskFlags.forEach((f) => lines.push(`- ⚠️ ${f}`));
    lines.push("");
  }

  return lines.join("\n");
}


/** Clear all custom personas (built-in personas are preserved). */
export function clearCustomPersonas(): void {
  customPersonas.clear();
}
