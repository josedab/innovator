/**
 * @module supply-chain
 *
 * Innovation Supply Chain Mapper — auto-map the complete supply chain for each
 * idea: technologies, skills, partnerships, IP, and resources needed. Classify
 * each requirement as build/buy/partner with gap analysis and cost estimation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { LlmParseError } from "../errors.js";

// ---- Schemas ----

/** A single supply chain requirement. */
export const SupplyChainItemSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  category: z.enum([
    "technology",
    "skill",
    "partnership",
    "ip",
    "resource",
    "infrastructure",
    "data",
  ]),
  description: z.string().max(1000),
  acquisition: z.enum(["build", "buy", "partner"]),
  criticality: z.enum(["essential", "important", "nice-to-have"]),
  estimatedCostUsd: z.number().min(0).optional(),
  timeToAcquire: z.enum(["days", "weeks", "months", "quarters", "years"]),
  currentAvailability: z.enum(["available", "partial", "unavailable"]),
  alternatives: z.array(z.string().max(200)).max(5),
  risks: z.array(z.string().max(500)).max(5),
});

/** Gap analysis entry. */
export const SupplyChainGapSchema = z.object({
  itemId: z.string().max(100),
  itemName: z.string().max(200),
  gapType: z.enum(["missing", "insufficient", "outdated", "too-expensive"]),
  severity: z.enum(["blocking", "major", "minor"]),
  mitigationStrategy: z.string().max(1000),
  estimatedCostToClose: z.number().min(0).optional(),
});

/** Full supply chain map for an idea. */
export const SupplyChainMapSchema = z.object({
  ideaTitle: z.string().max(500),
  subject: z.string().max(2000),
  items: z.array(SupplyChainItemSchema).max(50),
  gaps: z.array(SupplyChainGapSchema).max(20),
  totalEstimatedCostUsd: z.number().min(0),
  buildItems: z.number().min(0),
  buyItems: z.number().min(0),
  partnerItems: z.number().min(0),
  readinessScore: z.number().min(0).max(100),
  criticalPath: z.array(z.string().max(200)).max(10),
  summary: z.string().max(2000),
});

// ---- Types ----

export type SupplyChainItem = z.infer<typeof SupplyChainItemSchema>;
export type SupplyChainGap = z.infer<typeof SupplyChainGapSchema>;
export type SupplyChainMap = z.infer<typeof SupplyChainMapSchema>;

// ---- In-Memory Store ----

const supplyChainStore = new Map<string, SupplyChainMap>();

// ---- Core Functions ----

/**
 * Map the complete supply chain for an idea using LLM analysis.
 *
 * @param ideaTitle - Title of the idea
 * @param ideaDescription - Description of the idea
 * @param subject - Innovation subject
 * @param model - Optional LLM model
 * @param signal - Optional AbortSignal
 */
export async function mapSupplyChain(
  ideaTitle: string,
  ideaDescription: string,
  subject: string,
  model?: string,
  signal?: AbortSignal
): Promise<SupplyChainMap> {
  const prompt = `You are a strategic supply chain analyst mapping everything needed to bring an innovation idea to life.

${wrapUserInput("SUBJECT", subject)}

IDEA: ${sanitizeLlmOutput(ideaTitle)}
DESCRIPTION: ${sanitizeLlmOutput(ideaDescription)}

Map the COMPLETE supply chain including:
1. Technologies needed (frameworks, platforms, APIs)
2. Skills and talent required
3. Partnerships needed
4. IP considerations (patents, licenses)
5. Resources (funding, infrastructure, data)

For each item, classify as build/buy/partner and assess availability.
Then identify gaps and compute a readiness score (0-100).

Return valid JSON only:
{
  "items": [
    {
      "id": "item-1",
      "name": "Item name",
      "category": "technology|skill|partnership|ip|resource|infrastructure|data",
      "description": "What this is and why it's needed",
      "acquisition": "build|buy|partner",
      "criticality": "essential|important|nice-to-have",
      "estimatedCostUsd": 10000,
      "timeToAcquire": "days|weeks|months|quarters|years",
      "currentAvailability": "available|partial|unavailable",
      "alternatives": ["alternative1"],
      "risks": ["risk1"]
    }
  ],
  "gaps": [
    {
      "itemId": "item-1",
      "itemName": "Item name",
      "gapType": "missing|insufficient|outdated|too-expensive",
      "severity": "blocking|major|minor",
      "mitigationStrategy": "How to close this gap",
      "estimatedCostToClose": 5000
    }
  ],
  "criticalPath": ["item-1", "item-2"],
  "summary": "Executive summary of supply chain readiness"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse supply chain: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  const rawResult = z
    .object({
      items: z.array(SupplyChainItemSchema).max(50),
      gaps: z.array(SupplyChainGapSchema).max(20),
      criticalPath: z.array(z.string().max(200)).max(10),
      summary: z.string().max(2000),
    })
    .parse(parsed);

  const buildItems = rawResult.items.filter((i) => i.acquisition === "build").length;
  const buyItems = rawResult.items.filter((i) => i.acquisition === "buy").length;
  const partnerItems = rawResult.items.filter((i) => i.acquisition === "partner").length;
  const totalCost = rawResult.items.reduce((sum, i) => sum + (i.estimatedCostUsd ?? 0), 0);

  // Compute readiness score based on availability and gaps
  const availableCount = rawResult.items.filter(
    (i) => i.currentAvailability === "available"
  ).length;
  const totalItems = rawResult.items.length || 1;
  const blockingGaps = rawResult.gaps.filter((g) => g.severity === "blocking").length;
  const readinessScore = Math.max(
    0,
    Math.round((availableCount / totalItems) * 100 - blockingGaps * 15)
  );

  const result: SupplyChainMap = {
    ideaTitle,
    subject,
    ...rawResult,
    totalEstimatedCostUsd: totalCost,
    buildItems,
    buyItems,
    partnerItems,
    readinessScore,
  };

  supplyChainStore.set(`${subject}::${ideaTitle}`, result);
  return result;
}

/**
 * Get a stored supply chain map.
 */
export function getSupplyChainMap(subject: string, ideaTitle: string): SupplyChainMap | undefined {
  return supplyChainStore.get(`${subject}::${ideaTitle}`);
}

/**
 * List all supply chain maps.
 */
export function listSupplyChainMaps(): SupplyChainMap[] {
  return [...supplyChainStore.values()];
}

/**
 * Format supply chain map as Markdown.
 */
export function supplyChainToMarkdown(map: SupplyChainMap): string {
  const lines: string[] = [
    `# 🔗 Supply Chain Map: ${map.ideaTitle}`,
    "",
    `**Subject:** ${map.subject}`,
    `**Readiness Score:** ${map.readinessScore}/100`,
    `**Total Estimated Cost:** $${map.totalEstimatedCostUsd.toLocaleString()}`,
    `**Build:** ${map.buildItems} | **Buy:** ${map.buyItems} | **Partner:** ${map.partnerItems}`,
    "",
    "## Requirements",
    "",
    "| Name | Category | Acquire | Criticality | Availability | Cost |",
    "|------|----------|---------|-------------|--------------|------|",
  ];

  for (const item of map.items) {
    const cost = item.estimatedCostUsd ? `$${item.estimatedCostUsd.toLocaleString()}` : "TBD";
    lines.push(
      `| ${item.name} | ${item.category} | ${item.acquisition} | ${item.criticality} | ${item.currentAvailability} | ${cost} |`
    );
  }

  if (map.gaps.length > 0) {
    lines.push("", "## Gaps", "");
    for (const gap of map.gaps) {
      lines.push(`### ${gap.itemName} [${gap.severity}]`);
      lines.push(`**Type:** ${gap.gapType} | **Mitigation:** ${gap.mitigationStrategy}`);
      if (gap.estimatedCostToClose)
        lines.push(`**Cost to close:** $${gap.estimatedCostToClose.toLocaleString()}`);
      lines.push("");
    }
  }

  if (map.criticalPath.length > 0) {
    lines.push("## Critical Path", "", map.criticalPath.join(" → "));
  }

  lines.push("", "## Summary", "", map.summary);
  return lines.join("\n");
}

/**
 * Clear all supply chain data (for testing).
 */
export function clearSupplyChainData(): void {
  supplyChainStore.clear();
}
