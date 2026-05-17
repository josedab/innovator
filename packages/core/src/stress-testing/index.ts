/**
 * @module stress-testing
 *
 * Idea Stress Testing via simulated scenarios. Generates 5 scenario types
 * (regulatory change, market shift, tech breakthrough, economic downturn,
 * competitor move), assesses impact per idea, computes aggregate resilience
 * scores, and identifies vulnerabilities and hedging strategies.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

export const ScenarioTypeSchema = z.enum([
  "regulatory-change",
  "market-shift",
  "tech-breakthrough",
  "economic-downturn",
  "competitor-move",
]);

export const StressScenarioSchema = z.object({
  type: ScenarioTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  probability: z.enum(["low", "medium", "high"]),
  timeframe: z.string().max(200),
});

export const ImpactAssessmentSchema = z.object({
  scenarioType: ScenarioTypeSchema,
  survives: z.boolean(),
  impactLevel: z.enum(["none", "minor", "moderate", "severe", "fatal"]),
  explanation: z.string().max(1000),
  adaptationStrategy: z.string().max(1000),
});

export const VulnerabilitySchema = z.object({
  area: z.string().max(300),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().max(1000),
});

export const HedgingStrategySchema = z.object({
  strategy: z.string().max(500),
  mitigates: z.array(ScenarioTypeSchema).max(5),
  effort: z.enum(["low", "medium", "high"]),
  description: z.string().max(1000),
});

export const StressTestResultSchema = z.object({
  idea: z.string().max(500),
  scenarios: z.array(StressScenarioSchema).max(5),
  impacts: z.array(ImpactAssessmentSchema).max(5),
  resilienceScore: z.number().min(0).max(5),
  vulnerabilities: z.array(VulnerabilitySchema).max(10),
  hedgingStrategies: z.array(HedgingStrategySchema).max(5),
  stressTested: z.boolean(),
  badge: z.enum(["resilient", "moderate", "fragile"]),
});

export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;
export type StressScenario = z.infer<typeof StressScenarioSchema>;
export type ImpactAssessment = z.infer<typeof ImpactAssessmentSchema>;
export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
export type HedgingStrategy = z.infer<typeof HedgingStrategySchema>;
export type StressTestResult = z.infer<typeof StressTestResultSchema>;

/** Configuration options for stress testing operations. */
export interface StressTestConfig {
  model?: string;
  signal?: AbortSignal;
}

// ---- Prompt Builders ----

function buildScenarioPrompt(idea: InnovationIdea, domain: string): string {
  return `You are a strategic risk analyst. Generate stress test scenarios for an innovation idea.

${wrapUserInput("IDEA", idea.title + ": " + idea.description)}
${wrapUserInput("DOMAIN", domain)}
${wrapUserInput("POTENTIAL IMPACT", idea.potentialImpact)}

Generate exactly 5 stress scenarios (one per type) and assess the idea's survival under each.
Also identify vulnerabilities and suggest hedging strategies.

Respond with JSON only:
{
  "scenarios": [
    { "type": "regulatory-change", "title": "...", "description": "...", "probability": "low|medium|high", "timeframe": "e.g., 1-2 years" },
    { "type": "market-shift", "title": "...", "description": "...", "probability": "...", "timeframe": "..." },
    { "type": "tech-breakthrough", "title": "...", "description": "...", "probability": "...", "timeframe": "..." },
    { "type": "economic-downturn", "title": "...", "description": "...", "probability": "...", "timeframe": "..." },
    { "type": "competitor-move", "title": "...", "description": "...", "probability": "...", "timeframe": "..." }
  ],
  "impacts": [
    { "scenarioType": "regulatory-change", "survives": true|false, "impactLevel": "none|minor|moderate|severe|fatal", "explanation": "...", "adaptationStrategy": "..." }
  ],
  "vulnerabilities": [
    { "area": "...", "severity": "low|medium|high|critical", "description": "..." }
  ],
  "hedgingStrategies": [
    { "strategy": "...", "mitigates": ["regulatory-change", "market-shift"], "effort": "low|medium|high", "description": "..." }
  ]
}`;
}

const StressResponseSchema = z.object({
  scenarios: z.array(StressScenarioSchema).max(5),
  impacts: z.array(ImpactAssessmentSchema).max(5),
  vulnerabilities: z.array(VulnerabilitySchema).max(10),
  hedgingStrategies: z.array(HedgingStrategySchema).max(5),
});

// ---- Core Functions ----

/**
 * Generate stress scenarios and assess an idea's resilience.
 */
export async function generateStressScenarios(
  idea: InnovationIdea,
  domain: string,
  config: StressTestConfig = {}
): Promise<StressTestResult> {
  const prompt = buildScenarioPrompt(idea, domain);

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const jsonStr = extractJson(raw);
      return StressResponseSchema.parse(JSON.parse(jsonStr));
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );

  const survivedCount = result.impacts.filter((i) => i.survives).length;
  const badge = survivedCount >= 4 ? "resilient" : survivedCount >= 2 ? "moderate" : "fragile";

  return StressTestResultSchema.parse({
    idea: idea.title,
    scenarios: result.scenarios,
    impacts: result.impacts,
    resilienceScore: survivedCount,
    vulnerabilities: result.vulnerabilities,
    hedgingStrategies: result.hedgingStrategies,
    stressTested: true,
    badge,
  });
}

/**
 * Stress test multiple ideas and return results sorted by resilience.
 */
export async function stressTestIdeas(
  ideas: InnovationIdea[],
  domain: string,
  config: StressTestConfig = {}
): Promise<StressTestResult[]> {
  const results: StressTestResult[] = [];
  for (const idea of ideas) {
    const result = await generateStressScenarios(idea, domain, config);
    results.push(result);
  }
  return results.sort((a, b) => b.resilienceScore - a.resilienceScore);
}

/**
 * Format stress test results as markdown.
 */
export function stressTestToMarkdown(result: StressTestResult): string {
  const badgeIcon = result.badge === "resilient" ? "🛡️" : result.badge === "moderate" ? "⚠️" : "🔴";
  const lines: string[] = [
    `# Stress Test: ${result.idea}`,
    `**Resilience:** ${badgeIcon} ${result.badge.toUpperCase()} (${result.resilienceScore}/5 scenarios survived)`,
    "",
    "## Scenarios & Impact",
    "",
  ];

  for (let i = 0; i < result.scenarios.length; i++) {
    const scenario = result.scenarios[i];
    const impact = result.impacts[i];
    const passIcon = impact?.survives ? "✅" : "❌";
    lines.push(`### ${passIcon} ${scenario.title}`);
    lines.push(
      `**Type:** ${scenario.type} | **Probability:** ${scenario.probability} | **Timeframe:** ${scenario.timeframe}`
    );
    lines.push(scenario.description);
    if (impact) {
      lines.push(`\n**Impact Level:** ${impact.impactLevel}`);
      lines.push(`**Assessment:** ${impact.explanation}`);
      lines.push(`**Adaptation:** ${impact.adaptationStrategy}`);
    }
    lines.push("");
  }

  if (result.vulnerabilities.length > 0) {
    lines.push("## Vulnerabilities");
    for (const v of result.vulnerabilities) {
      const icon =
        v.severity === "critical"
          ? "🔴"
          : v.severity === "high"
            ? "🟠"
            : v.severity === "medium"
              ? "🟡"
              : "🟢";
      lines.push(`- ${icon} **${v.area}** (${v.severity}): ${v.description}`);
    }
    lines.push("");
  }

  if (result.hedgingStrategies.length > 0) {
    lines.push("## Hedging Strategies");
    for (const h of result.hedgingStrategies) {
      lines.push(`- **${h.strategy}** (effort: ${h.effort})`);
      lines.push(`  Mitigates: ${h.mitigates.join(", ")}`);
      lines.push(`  ${h.description}`);
    }
  }

  return lines.join("\n");
}
