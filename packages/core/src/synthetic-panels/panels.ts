import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import {
  ARCHETYPE_PROFILES,
  PersonaEvaluationSchema,
  PanelConsensusSchema,
  PanelDebateEntrySchema,
  type PersonaArchetype,
  type SyntheticPersona,
  type PersonaEvaluation,
  type PanelDebateEntry,
  type PanelConsensus,
  type PanelConfig,
  type PanelResult,
} from "./types.js";

const DEFAULT_PANEL_SIZE = 5;
const DEFAULT_ARCHETYPES: PersonaArchetype[] = [
  "early-adopter",
  "enterprise-buyer",
  "price-sensitive",
  "end-user-advocate",
  "skeptical-executive",
];

function generatePersona(archetype: PersonaArchetype, index: number): SyntheticPersona {
  const profile = ARCHETYPE_PROFILES[archetype];
  const names: Record<PersonaArchetype, string> = {
    "early-adopter": "Alex Chen",
    "enterprise-buyer": "Morgan Williams",
    "price-sensitive": "Sam Patel",
    "accessibility-focused": "Jamie Rivera",
    "tech-enthusiast": "Chris Nakamura",
    "skeptical-executive": "Patricia Hammond",
    "end-user-advocate": "Dana Kim",
    "security-conscious": "Viktor Petrov",
    "sustainability-driven": "Amara Okafor",
    "innovation-laggard": "Robert Miller",
    "power-user": "Yuki Tanaka",
    "casual-consumer": "Lisa Brown",
  };

  return {
    id: `persona-${archetype}-${index}`,
    name: names[archetype] ?? `Persona ${index}`,
    archetype,
    demographics: {
      ageRange: "28-55",
      role: archetype.replace(/-/g, " "),
      industry: "Technology",
      companySize: archetype === "enterprise-buyer" ? "1000+" : "10-200",
    },
    motivations: profile.priorities,
    frustrations: [profile.objectionStyle],
    decisionCriteria: profile.priorities,
  };
}

function buildEvaluationPrompt(
  persona: SyntheticPersona,
  ideaTitle: string,
  ideaDescription: string
): string {
  const profile = ARCHETYPE_PROFILES[persona.archetype];
  return `You are ${persona.name}, a ${persona.archetype} customer persona.
Profile: ${profile.description}
Priorities: ${profile.priorities.join(", ")}
Typical objection style: "${profile.objectionStyle}"

Evaluate this innovation idea:
Title: ${ideaTitle}
Description: ${ideaDescription}

Respond in JSON:
{
  "verdict": "enthusiastic" | "positive" | "neutral" | "skeptical" | "opposed",
  "score": 0-10,
  "reasoning": "your detailed evaluation",
  "objections": ["objection1", "objection2"],
  "suggestions": ["suggestion1"],
  "wouldBuy": true/false,
  "willingnessToPayRange": "$X-$Y/month or N/A"
}`;
}

function buildDebatePrompt(
  persona: SyntheticPersona,
  ideaTitle: string,
  previousStatements: PanelDebateEntry[]
): string {
  const profile = ARCHETYPE_PROFILES[persona.archetype];
  const context =
    previousStatements.length > 0
      ? previousStatements
          .map((s) => `${s.personaName} (${s.archetype}): "${s.statement}"`)
          .join("\n")
      : "No previous statements.";

  return `You are ${persona.name}, a ${persona.archetype} (${profile.description}).

The panel is debating: "${ideaTitle}"
Previous statements:
${context}

Share your perspective, responding to previous arguments if any.

Respond in JSON:
{
  "statement": "your argument or response",
  "respondingTo": "${previousStatements.length > 0 ? previousStatements[previousStatements.length - 1].personaId : ""}",
  "sentiment": "agree" | "disagree" | "nuance" | "question"
}`;
}

function buildConsensusPrompt(
  evaluations: PersonaEvaluation[],
  debate: PanelDebateEntry[],
  ideaTitle: string
): string {
  const evalSummary = evaluations
    .map(
      (e) =>
        `${e.personaName} (${e.archetype}): ${e.verdict} (${e.score}/10) — ${e.reasoning.slice(0, 200)}`
    )
    .join("\n");
  const debateSummary = debate
    .map((d) => `${d.personaName}: "${d.statement.slice(0, 200)}"`)
    .join("\n");

  return `Synthesize the panel's evaluation of "${ideaTitle}":

Individual Evaluations:
${evalSummary}

Panel Debate:
${debateSummary}

Provide consensus analysis in JSON:
{
  "overallScore": 0-10,
  "verdict": "strong-yes" | "yes" | "mixed" | "no" | "strong-no",
  "consensusStrength": 0.0-1.0,
  "topObjections": ["..."],
  "topStrengths": ["..."],
  "recommendation": "strategic recommendation",
  "splitVote": { "enthusiastic": N, "positive": N, "neutral": N, "skeptical": N, "opposed": N }
}`;
}

/** Run a synthetic user panel evaluation on an innovation idea. */
export async function runPanel(
  ideaTitle: string,
  ideaDescription: string,
  config: PanelConfig = {}
): Promise<PanelResult> {
  const archetypes = config.archetypes ?? DEFAULT_ARCHETYPES;
  const panelSize = config.panelSize ?? DEFAULT_PANEL_SIZE;
  const enableDebate = config.enableDebate ?? true;

  // Generate personas
  config.onProgress?.({
    stage: "generating-personas",
    completedEvaluations: 0,
    totalEvaluations: panelSize,
  });

  const personas = archetypes.slice(0, panelSize).map((a, i) => generatePersona(a, i));

  // Individual evaluations
  const evaluations: PersonaEvaluation[] = [];
  for (let i = 0; i < personas.length; i++) {
    if (config.signal?.aborted) break;
    const persona = personas[i];

    config.onProgress?.({
      stage: "evaluating",
      completedEvaluations: i,
      totalEvaluations: personas.length,
      currentPersona: persona.name,
    });

    const evaluation = await withRetry(
      async () => {
        const raw = await generateText({
          prompt: buildEvaluationPrompt(persona, ideaTitle, ideaDescription),
          model: config.model,
          signal: config.signal,
        });
        const parsed = JSON.parse(extractJson(raw));
        return {
          personaId: persona.id,
          personaName: persona.name,
          archetype: persona.archetype,
          ...PersonaEvaluationSchema.omit({
            personaId: true,
            personaName: true,
            archetype: true,
          }).parse(parsed),
        };
      },
      { signal: config.signal }
    );

    evaluations.push(evaluation as PersonaEvaluation);
  }

  // Panel debate (multi-round)
  const debate: PanelDebateEntry[] = [];
  const debateRounds = config.debateRounds ?? 1;
  if (enableDebate && personas.length > 1) {
    for (let round = 0; round < debateRounds; round++) {
      if (config.signal?.aborted) break;

      config.onProgress?.({
        stage: "debating",
        completedEvaluations: evaluations.length,
        totalEvaluations: personas.length,
        currentPersona: `Round ${round + 1}/${debateRounds}`,
      });

      for (const persona of personas) {
        if (config.signal?.aborted) break;
        try {
          const result = await withRetry(
            async () => {
              const raw = await generateText({
                prompt: buildDebatePrompt(persona, ideaTitle, debate),
                model: config.model,
                signal: config.signal,
              });
              const parsed = JSON.parse(extractJson(raw));
              return PanelDebateEntrySchema.omit({
                personaId: true,
                personaName: true,
                archetype: true,
              }).parse(parsed);
            },
            { signal: config.signal }
          );
          debate.push({
            personaId: persona.id,
            personaName: persona.name,
            archetype: persona.archetype,
            ...result,
          });
        } catch {
          // Non-critical: skip debate entry on failure
        }
      }
    }
  }

  // Consensus
  config.onProgress?.({
    stage: "consensus",
    completedEvaluations: evaluations.length,
    totalEvaluations: personas.length,
  });

  const consensus = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildConsensusPrompt(evaluations, debate, ideaTitle),
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return PanelConsensusSchema.parse(parsed);
    },
    { signal: config.signal }
  );

  config.onProgress?.({
    stage: "complete",
    completedEvaluations: evaluations.length,
    totalEvaluations: personas.length,
  });

  return {
    ideaTitle,
    ideaDescription,
    personas,
    evaluations,
    debate,
    consensus,
  };
}

/** Convert a panel result to a markdown summary. */
export function panelToMarkdown(result: PanelResult): string {
  const lines: string[] = [
    "# Synthetic User Panel Report",
    "",
    `**Idea:** ${result.ideaTitle}`,
    `**Panel Verdict:** ${result.consensus.verdict} (${result.consensus.overallScore}/10)`,
    `**Consensus Strength:** ${(result.consensus.consensusStrength * 100).toFixed(0)}%`,
    "",
    "## Individual Evaluations",
    "",
  ];

  for (const evaluation of result.evaluations) {
    lines.push(`### ${evaluation.personaName} (${evaluation.archetype})`);
    lines.push(
      `**Verdict:** ${evaluation.verdict} | **Score:** ${evaluation.score}/10 | **Would Buy:** ${evaluation.wouldBuy ? "Yes" : "No"}`
    );
    lines.push(`**Reasoning:** ${evaluation.reasoning}`);
    if (evaluation.objections.length > 0) {
      lines.push(`**Objections:** ${evaluation.objections.join("; ")}`);
    }
    lines.push("");
  }

  if (result.debate.length > 0) {
    lines.push("## Panel Debate", "");
    for (const entry of result.debate) {
      lines.push(`> **${entry.personaName}** (${entry.sentiment}): ${entry.statement}`);
      lines.push("");
    }
  }

  lines.push("## Consensus", "");
  lines.push(result.consensus.recommendation);
  if (result.consensus.topStrengths.length > 0) {
    lines.push("", "**Strengths:**");
    result.consensus.topStrengths.forEach((s) => lines.push(`- ${s}`));
  }
  if (result.consensus.topObjections.length > 0) {
    lines.push("", "**Objections:**");
    result.consensus.topObjections.forEach((o) => lines.push(`- ${o}`));
  }

  return lines.join("\n");
}
