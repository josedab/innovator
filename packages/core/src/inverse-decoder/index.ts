/**
 * @module inverse-decoder
 *
 * Inverse Innovation Decoder: analyzes existing successful products, patents, or
 * companies and reverse-engineers which innovation angles, prompts, and thinking
 * patterns would have generated them. Users feed in a product URL or description
 * and receive a "recipe" showing the innovation path.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

/** Schema for an identified innovation pattern in the product. */
export const InnovationPatternSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  angle: z.string().max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(10),
});

/** Schema for a thinking step in the innovation recipe. */
export const ThinkingStepSchema = z.object({
  order: z.number().min(1),
  prompt: z.string().max(1000),
  expectedInsight: z.string().max(1000),
  technique: z.string().max(200),
  rationale: z.string().max(500),
});

/** Schema for a product analysis result. */
export const ProductAnalysisSchema = z.object({
  productName: z.string().max(300),
  category: z.string().max(200),
  coreProblem: z.string().max(1000),
  targetAudience: z.string().max(500),
  keyInnovations: z.array(z.string().max(500)).max(10),
  competitiveAdvantage: z.string().max(1000),
  marketContext: z.string().max(1000),
  disruptionType: z.enum([
    "sustaining",
    "low-end-disruption",
    "new-market-disruption",
    "radical",
    "incremental",
    "architectural",
  ]),
});

/** Schema for the full innovation recipe. */
export const InnovationRecipeSchema = z.object({
  productAnalysis: ProductAnalysisSchema,
  patterns: z.array(InnovationPatternSchema).max(15),
  recipe: z.object({
    title: z.string().max(300),
    summary: z.string().max(1000),
    steps: z.array(ThinkingStepSchema).max(20),
    suggestedAngles: z.array(z.string().max(100)).max(8),
    estimatedDifficulty: z.enum(["straightforward", "moderate", "complex", "visionary"]),
    keyInsight: z.string().max(500),
  }),
  learnings: z.array(
    z.object({
      principle: z.string().max(300),
      application: z.string().max(500),
      transferability: z.enum(["low", "medium", "high"]),
    })
  ).max(10),
  similarProducts: z.array(
    z.object({
      name: z.string().max(200),
      similarity: z.string().max(300),
      divergence: z.string().max(300),
    })
  ).max(5),
  generatedAt: z.string(),
});

// ---- Types ----

export type InnovationPattern = z.infer<typeof InnovationPatternSchema>;
export type ThinkingStep = z.infer<typeof ThinkingStepSchema>;
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;
export type InnovationRecipe = z.infer<typeof InnovationRecipeSchema>;

// ---- In-memory store ----

const recipes: Map<string, InnovationRecipe> = new Map();

// ---- Prompt builders ----

function buildAnalysisPrompt(productDescription: string): string {
  return `You are an innovation analyst. Analyze this product/company and reverse-engineer the innovation thinking that would have led to its creation.

Product/Company to analyze:
${sanitizeUserInput(productDescription)}

Respond with a JSON object matching this structure:
{
  "productAnalysis": {
    "productName": "string",
    "category": "string (e.g., SaaS, Hardware, Marketplace)",
    "coreProblem": "the core problem this product solves",
    "targetAudience": "primary audience",
    "keyInnovations": ["innovation 1", "innovation 2"],
    "competitiveAdvantage": "what makes this unique",
    "marketContext": "market conditions that enabled this",
    "disruptionType": "sustaining|low-end-disruption|new-market-disruption|radical|incremental|architectural"
  },
  "patterns": [
    {
      "name": "pattern name",
      "description": "how this pattern manifests",
      "angle": "which innovation angle (scamper, first-principles, cross-domain, constraints, inversion, perspectives, what-if, trend-collision)",
      "confidence": 0.85,
      "evidence": ["specific evidence from the product"]
    }
  ],
  "recipe": {
    "title": "Recipe: How to Innovate Like [Product]",
    "summary": "high-level innovation strategy",
    "steps": [
      {
        "order": 1,
        "prompt": "the thinking prompt that would generate this insight",
        "expectedInsight": "what insight this step produces",
        "technique": "the innovation technique used",
        "rationale": "why this step matters"
      }
    ],
    "suggestedAngles": ["angle1", "angle2"],
    "estimatedDifficulty": "straightforward|moderate|complex|visionary",
    "keyInsight": "the single most important innovation insight"
  },
  "learnings": [
    {
      "principle": "transferable innovation principle",
      "application": "how to apply this elsewhere",
      "transferability": "low|medium|high"
    }
  ],
  "similarProducts": [
    {
      "name": "similar product",
      "similarity": "what's similar",
      "divergence": "what's different"
    }
  ],
  "generatedAt": "${new Date().toISOString()}"
}

Be thorough. Identify 5-10 innovation patterns. Create 8-15 recipe steps that would guide someone to recreate this innovation from scratch. Focus on the thinking process, not just the end result.`;
}

// ---- Core functions ----

/** Options for analyzing a product. */
export interface AnalyzeProductOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Analyze a product/company and generate an innovation recipe.
 * Reverse-engineers the thinking patterns that would have generated it.
 */
export async function analyzeProduct(
  productDescription: string,
  options: AnalyzeProductOptions = {}
): Promise<InnovationRecipe> {
  if (!productDescription || productDescription.trim().length === 0) {
    throw new Error("Product description is required");
  }
  if (productDescription.length > 5000) {
    throw new Error("Product description must be under 5000 characters");
  }

  const prompt = buildAnalysisPrompt(productDescription.trim());
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: options.model, signal: options.signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse recipe response as JSON: ${jsonStr.slice(0, 200)}`);
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
  const recipe = InnovationRecipeSchema.parse(parsed);

  const id = `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  recipes.set(id, recipe);

  return recipe;
}

/**
 * Get a stored recipe by ID.
 */
export function getRecipe(id: string): InnovationRecipe | undefined {
  return recipes.get(id);
}

/**
 * List all stored recipe IDs with product names.
 */
export function listRecipes(): Array<{ id: string; productName: string; generatedAt: string }> {
  return Array.from(recipes.entries()).map(([id, r]) => ({
    id,
    productName: r.productAnalysis.productName,
    generatedAt: r.generatedAt,
  }));
}

/**
 * Clear all stored recipes.
 */
export function clearRecipes(): void {
  recipes.clear();
}

/**
 * Convert an innovation recipe to Markdown.
 */
export function recipeToMarkdown(recipe: InnovationRecipe): string {
  const lines: string[] = [];
  const { productAnalysis: pa, recipe: r, patterns, learnings, similarProducts } = recipe;

  lines.push(`# ${r.title}\n`);
  lines.push(`*Generated: ${recipe.generatedAt}*\n`);

  lines.push(`## Product Analysis\n`);
  lines.push(`- **Name:** ${pa.productName}`);
  lines.push(`- **Category:** ${pa.category}`);
  lines.push(`- **Disruption Type:** ${pa.disruptionType}`);
  lines.push(`- **Core Problem:** ${pa.coreProblem}`);
  lines.push(`- **Target Audience:** ${pa.targetAudience}`);
  lines.push(`- **Competitive Advantage:** ${pa.competitiveAdvantage}`);
  lines.push(`- **Market Context:** ${pa.marketContext}\n`);
  lines.push(`### Key Innovations\n`);
  for (const i of pa.keyInnovations) lines.push(`- ${i}`);

  lines.push(`\n## Innovation Patterns Detected\n`);
  for (const p of patterns) {
    lines.push(`### ${p.name} (${p.angle}, confidence: ${(p.confidence * 100).toFixed(0)}%)\n`);
    lines.push(p.description);
    if (p.evidence.length > 0) {
      lines.push(`\n**Evidence:**`);
      for (const e of p.evidence) lines.push(`- ${e}`);
    }
    lines.push("");
  }

  lines.push(`## Innovation Recipe\n`);
  lines.push(`**Summary:** ${r.summary}`);
  lines.push(`**Difficulty:** ${r.estimatedDifficulty}`);
  lines.push(`**Key Insight:** ${r.keyInsight}\n`);
  lines.push(`**Suggested Angles:** ${r.suggestedAngles.join(", ")}\n`);
  lines.push(`### Steps\n`);
  for (const s of r.steps) {
    lines.push(`**Step ${s.order}: ${s.technique}**`);
    lines.push(`- *Prompt:* ${s.prompt}`);
    lines.push(`- *Expected Insight:* ${s.expectedInsight}`);
    lines.push(`- *Rationale:* ${s.rationale}\n`);
  }

  lines.push(`## Transferable Learnings\n`);
  for (const l of learnings) {
    lines.push(`### ${l.principle} (transferability: ${l.transferability})\n`);
    lines.push(l.application);
    lines.push("");
  }

  if (similarProducts.length > 0) {
    lines.push(`## Similar Products\n`);
    for (const sp of similarProducts) {
      lines.push(`- **${sp.name}**: ${sp.similarity} | Diverges: ${sp.divergence}`);
    }
  }

  return lines.join("\n");
}
