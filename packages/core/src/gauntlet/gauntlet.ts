/**
 * @module gauntlet
 *
 * Adversarial Idea Gauntlet — multi-agent adversarial stress-testing
 * for innovation ideas. Each adversary attacks from a specialized angle;
 * attacks are aggregated into a Survivability Index (0–100).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";
import {
  AdversaryRoleSchema,
  ADVERSARY_DESCRIPTIONS,
  ADVERSARY_ATTACK_CATEGORIES,
  AttackSchema,
  type AdversaryRole,
  type Attack,
  type GauntletConfig,
  type GauntletResult,
  type GauntletProgress,
  type GauntletTranscriptEntry,
} from "./types.js";

// ---- Default Config ----

const DEFAULT_ADVERSARIES: AdversaryRole[] = [
  "competitor",
  "regulator",
  "skeptic",
  "economist",
  "engineer",
];

// ---- Prompt Builders ----

function buildAttackPrompt(
  role: AdversaryRole | string,
  description: string,
  categories: string[],
  idea: InnovationIdea
): string {
  return `You are an adversarial reviewer with the role: "${role}".
Role description: ${description}

Your job is to attack the following innovation idea, finding its most critical weaknesses.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL_IMPACT", idea.potentialImpact)}

Attack categories to consider: ${categories.join(", ")}

Generate 1-3 attacks. Each attack must be specific, evidence-based, and actionable.
For each attack, also suggest how the idea could be modified to counter it.

Respond in JSON:
{
  "attacks": [
    {
      "adversaryRole": "${role}",
      "category": "one of the categories above",
      "severity": 1-10,
      "title": "short attack title",
      "reasoning": "why this is a problem",
      "evidence": "evidence or precedent supporting the attack",
      "suggestedCounter": "how to address this weakness"
    }
  ]
}`;
}

function buildStrengthenPrompt(idea: InnovationIdea, topAttacks: Attack[]): string {
  const attackSummary = topAttacks
    .map(
      (a, i) =>
        `${i + 1}. [${a.adversaryRole}] ${a.title} (severity: ${a.severity}/10): ${a.reasoning}\n   Counter suggestion: ${a.suggestedCounter}`
    )
    .join("\n");

  return `An innovation idea has been stress-tested by adversarial reviewers.
Your job is to revise the idea to address the most critical attacks while preserving its core value.

Original idea:
${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}

Top attacks to address:
${attackSummary}

Respond in JSON:
{
  "title": "revised idea title",
  "description": "revised idea description that addresses the attacks",
  "addressedAttacks": ["attack title 1", "attack title 2"]
}`;
}

// ---- Response Schemas ----

const AttackResponseSchema = z.object({
  attacks: z.array(AttackSchema).min(1).max(5),
});

const StrengthenResponseSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  addressedAttacks: z.array(z.string().max(500)),
});

// ---- Scoring ----

/** Severity weights by adversary role — technical and economic attacks weighted higher. */
const ROLE_WEIGHTS: Record<string, number> = {
  competitor: 0.2,
  regulator: 0.2,
  skeptic: 0.15,
  economist: 0.25,
  engineer: 0.2,
};

/**
 * Compute the Survivability Index (0–100) from a set of attacks.
 * Higher = more survivable. Formula: 100 - weighted average severity × 10.
 */
export function computeSurvivabilityIndex(attacks: Attack[]): number {
  if (attacks.length === 0) return 100;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const attack of attacks) {
    const weight = ROLE_WEIGHTS[attack.adversaryRole] ?? 0.15;
    const severity = Number.isFinite(attack.severity)
      ? Math.max(0, Math.min(10, attack.severity))
      : 0;
    weightedSum += severity * weight;
    totalWeight += weight;
  }

  const weightedAvgSeverity = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const index = Math.round(Math.max(0, Math.min(100, 100 - weightedAvgSeverity * 10)));
  return index;
}

// ---- Core Engine ----

async function runAdversary(
  role: AdversaryRole | string,
  description: string,
  categories: string[],
  idea: InnovationIdea,
  config: GauntletConfig
): Promise<Attack[]> {
  const prompt = buildAttackPrompt(role, description, categories, idea);

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
      return AttackResponseSchema.parse(parsed);
    },
    { signal: config.signal }
  );

  return result.attacks;
}

/**
 * Run the Adversarial Idea Gauntlet against a single innovation idea.
 *
 * @param idea - The idea to stress-test
 * @param config - Gauntlet configuration
 * @param onProgress - Optional callback for streaming progress updates
 * @returns The complete gauntlet result with attacks and survivability index
 */
export async function runGauntlet(
  idea: InnovationIdea,
  config: GauntletConfig = {},
  onProgress?: (progress: GauntletProgress) => void
): Promise<GauntletResult> {
  if (!idea.title?.trim()) {
    throw new Error("Idea title is required for gauntlet evaluation");
  }
  if (!idea.description?.trim()) {
    throw new Error("Idea description is required for gauntlet evaluation");
  }

  const adversaries = config.adversaries ?? DEFAULT_ADVERSARIES;
  const allAttacks: Attack[] = [];
  const transcript: GauntletTranscriptEntry[] = [];
  const completedAdversaries: string[] = [];

  // Emit initial progress
  onProgress?.({
    stage: "attacking",
    completedAdversaries: [],
    totalAdversaries: adversaries.length + (config.customAdversaries?.length ?? 0),
    attacks: [],
  });

  // Run built-in adversaries (sequentially for progress tracking; use concurrency for perf)
  for (const role of adversaries) {
    if (config.signal?.aborted) break;

    onProgress?.({
      stage: "attacking",
      currentAdversary: role,
      completedAdversaries: [...completedAdversaries],
      totalAdversaries: adversaries.length + (config.customAdversaries?.length ?? 0),
      attacks: [...allAttacks],
    });

    try {
      const attacks = await runAdversary(
        role,
        ADVERSARY_DESCRIPTIONS[role],
        ADVERSARY_ATTACK_CATEGORIES[role],
        idea,
        config
      );
      allAttacks.push(...attacks);
      transcript.push({
        adversaryRole: role,
        attacks,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      // Individual adversary failure is non-fatal — log and continue
      console.warn(
        `[gauntlet] Adversary "${role}" failed:`,
        err instanceof Error ? err.message : err
      );
      transcript.push({
        adversaryRole: role,
        attacks: [],
        timestamp: new Date().toISOString(),
      });
    }
    completedAdversaries.push(role);
  }

  // Run custom adversaries
  if (config.customAdversaries) {
    for (const custom of config.customAdversaries) {
      if (config.signal?.aborted) break;

      onProgress?.({
        stage: "attacking",
        currentAdversary: custom.role,
        completedAdversaries: [...completedAdversaries],
        totalAdversaries: adversaries.length + config.customAdversaries.length,
        attacks: [...allAttacks],
      });

      try {
        const attacks = await runAdversary(
          custom.role as AdversaryRole,
          custom.description,
          custom.attackCategories,
          idea,
          config
        );
        allAttacks.push(...attacks);
        transcript.push({
          adversaryRole: custom.role as AdversaryRole,
          attacks,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn(
          `[gauntlet] Custom adversary "${custom.role}" failed:`,
          err instanceof Error ? err.message : err
        );
        transcript.push({
          adversaryRole: custom.role as AdversaryRole,
          attacks: [],
          timestamp: new Date().toISOString(),
        });
      }
      completedAdversaries.push(custom.role);
    }
  }

  // Scoring
  onProgress?.({
    stage: "scoring",
    completedAdversaries: [...completedAdversaries],
    totalAdversaries: adversaries.length + (config.customAdversaries?.length ?? 0),
    attacks: [...allAttacks],
  });

  const survivabilityIndex = computeSurvivabilityIndex(allAttacks);

  // Build result
  const result: GauntletResult = {
    id: randomUUID(),
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    attacks: allAttacks,
    survivabilityIndex,
    transcript,
    createdAt: new Date().toISOString(),
    model: config.model,
  };

  // Strengthen if requested
  if (config.strengthen && allAttacks.length > 0 && !config.signal?.aborted) {
    onProgress?.({
      stage: "strengthening",
      completedAdversaries: [...completedAdversaries],
      totalAdversaries: adversaries.length + (config.customAdversaries?.length ?? 0),
      attacks: [...allAttacks],
      survivabilityIndex,
    });

    try {
      const topAttacks = [...allAttacks].sort((a, b) => b.severity - a.severity).slice(0, 5);

      const prompt = buildStrengthenPrompt(idea, topAttacks);
      const strengthened = await withRetry(
        async () => {
          const raw = await generateText({
            prompt,
            model: config.model,
            signal: config.signal,
          });
          const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
          return StrengthenResponseSchema.parse(parsed);
        },
        { signal: config.signal }
      );

      // Re-score the strengthened idea (approximate: reduce severity of addressed attacks)
      const addressedTitles = new Set(strengthened.addressedAttacks.map((t) => t.toLowerCase()));
      const adjustedAttacks = allAttacks.map((a) =>
        addressedTitles.has(a.title.toLowerCase())
          ? { ...a, severity: Math.max(1, a.severity - 3) }
          : a
      );

      result.strengthenedIdea = {
        title: strengthened.title,
        description: strengthened.description,
        addressedAttacks: strengthened.addressedAttacks,
        revisedSurvivabilityIndex: computeSurvivabilityIndex(adjustedAttacks),
      };
    } catch (err) {
      console.warn("[gauntlet] Strengthen failed:", err instanceof Error ? err.message : err);
    }
  }

  onProgress?.({
    stage: "complete",
    completedAdversaries: [...completedAdversaries],
    totalAdversaries: adversaries.length + (config.customAdversaries?.length ?? 0),
    attacks: [...allAttacks],
    survivabilityIndex,
    result,
  });

  return result;
}

// ---- Formatting ----

/** Convert a gauntlet result to a human-readable Markdown report. */
export function gauntletToMarkdown(result: GauntletResult): string {
  const lines: string[] = [
    `# ⚔️ Adversarial Gauntlet Report`,
    "",
    `**Idea:** ${result.ideaTitle}`,
    `**Survivability Index:** ${result.survivabilityIndex}/100`,
    `**Date:** ${result.createdAt}`,
    `**Attacks:** ${result.attacks.length}`,
    "",
  ];

  // Group attacks by adversary
  const byRole = new Map<string, Attack[]>();
  for (const attack of result.attacks) {
    const existing = byRole.get(attack.adversaryRole) ?? [];
    existing.push(attack);
    byRole.set(attack.adversaryRole, existing);
  }

  for (const [role, attacks] of byRole) {
    lines.push(`## ${role.charAt(0).toUpperCase() + role.slice(1)}`);
    lines.push("");
    for (const attack of attacks) {
      lines.push(`### ${attack.title} (Severity: ${attack.severity}/10)`);
      lines.push(`**Category:** ${attack.category}`);
      lines.push(`**Reasoning:** ${attack.reasoning}`);
      lines.push(`**Evidence:** ${attack.evidence}`);
      lines.push(`**Counter:** ${attack.suggestedCounter}`);
      lines.push("");
    }
  }

  if (result.strengthenedIdea) {
    lines.push(`## 🛡️ Strengthened Idea`);
    lines.push("");
    lines.push(`**Title:** ${result.strengthenedIdea.title}`);
    lines.push(`**Description:** ${result.strengthenedIdea.description}`);
    lines.push(
      `**Revised Survivability:** ${result.strengthenedIdea.revisedSurvivabilityIndex}/100`
    );
    lines.push(`**Addressed:** ${result.strengthenedIdea.addressedAttacks.join(", ")}`);
  }

  return lines.join("\n");
}
