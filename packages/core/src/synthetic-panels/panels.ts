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
  type PanelConfig,
  type PanelResult,
  type InterRaterAgreement,
} from "./types.js";

const DEFAULT_PANEL_SIZE = 5;
const DEFAULT_ARCHETYPES: PersonaArchetype[] = [
  "early-adopter",
  "enterprise-buyer",
  "price-sensitive",
  "end-user-advocate",
  "skeptical-executive",
];

// ---- Persistent Persona Store ----

const personaStore = new Map<string, SyntheticPersona>();

/** Store a persona for reuse across panel sessions. */
export function storePersona(persona: SyntheticPersona): void {
  personaStore.set(persona.id, persona);
}

/** Retrieve a stored persona by ID. */
export function getStoredPersona(id: string): SyntheticPersona | undefined {
  return personaStore.get(id);
}

/** List all stored personas, optionally filtered by archetype. */
export function listStoredPersonas(archetype?: PersonaArchetype): SyntheticPersona[] {
  const all = Array.from(personaStore.values());
  return archetype ? all.filter((p) => p.archetype === archetype) : all;
}

/** Clear all stored personas (testing). */
export function clearPersonaStore(): void {
  personaStore.clear();
}

function generatePersona(archetype: PersonaArchetype, index: number): SyntheticPersona {
  // Check persistent store first for character consistency
  const storeKey = `persona-${archetype}-${index}`;
  const existing = personaStore.get(storeKey);
  if (existing) return existing;

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

  const persona: SyntheticPersona = {
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

  // Persist for reuse across sessions
  personaStore.set(persona.id, persona);
  return persona;
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
        } catch (debateErr) {
          // Log which persona failed and continue
          const reason = debateErr instanceof Error ? debateErr.message : "unknown error";
          debate.push({
            personaId: persona.id,
            personaName: persona.name,
            archetype: persona.archetype,
            statement: `[Debate contribution failed: ${reason}]`,
            sentiment: "nuance",
          });
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

/**
 * Compute inter-rater agreement statistics for panel evaluations.
 * Uses Fleiss' kappa for categorical agreement and variance metrics for scores.
 */
export function computeInterRaterAgreement(evaluations: PersonaEvaluation[]): InterRaterAgreement {
  if (evaluations.length < 2) {
    return {
      fleissKappa: 1,
      agreementLevel: "almost-perfect",
      pairwiseAgreement: 1,
      scoreVariance: 0,
      scoreStdDev: 0,
      confidenceInterval: { lower: 0, upper: 10, level: 0.95 },
    };
  }

  const scores = evaluations.map((e) => e.score);
  const n = scores.length;

  // Score statistics
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // 95% confidence interval for mean score
  const tValue = 1.96; // approximation for large samples
  const marginOfError = tValue * (stdDev / Math.sqrt(n));
  const confidenceInterval = {
    lower: Math.max(0, mean - marginOfError),
    upper: Math.min(10, mean + marginOfError),
    level: 0.95,
  };

  // Pairwise agreement: fraction of pairs with same verdict
  const verdicts = evaluations.map((e) => e.verdict);
  let agreePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < verdicts.length; i++) {
    for (let j = i + 1; j < verdicts.length; j++) {
      totalPairs++;
      if (verdicts[i] === verdicts[j]) agreePairs++;
    }
  }
  const pairwiseAgreement = totalPairs > 0 ? agreePairs / totalPairs : 1;

  // Fleiss' kappa for verdict categories
  const categories = ["enthusiastic", "positive", "neutral", "skeptical", "opposed"];
  const N = n;
  const _k = categories.length;

  const categoryCounts = categories.map((cat) => verdicts.filter((v) => v === cat).length);
  const pj = categoryCounts.map((c) => c / N);
  const Pe = pj.reduce((sum, p) => sum + p * p, 0);
  const Po = pairwiseAgreement;
  const fleissKappa = Pe === 1 ? 1 : (Po - Pe) / (1 - Pe);

  // Interpret kappa
  let agreementLevel: InterRaterAgreement["agreementLevel"];
  if (fleissKappa <= 0) agreementLevel = "poor";
  else if (fleissKappa <= 0.2) agreementLevel = "slight";
  else if (fleissKappa <= 0.4) agreementLevel = "fair";
  else if (fleissKappa <= 0.6) agreementLevel = "moderate";
  else if (fleissKappa <= 0.8) agreementLevel = "substantial";
  else agreementLevel = "almost-perfect";

  return {
    fleissKappa: Math.round(fleissKappa * 1000) / 1000,
    agreementLevel,
    pairwiseAgreement: Math.round(pairwiseAgreement * 1000) / 1000,
    scoreVariance: Math.round(variance * 100) / 100,
    scoreStdDev: Math.round(stdDev * 100) / 100,
    confidenceInterval: {
      lower: Math.round(confidenceInterval.lower * 100) / 100,
      upper: Math.round(confidenceInterval.upper * 100) / 100,
      level: 0.95,
    },
  };
}
