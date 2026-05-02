import type { ModelPricing } from "./types.js";

/** Default pricing table — updated as models change. */
const DEFAULT_PRICING: ModelPricing[] = [
  { modelId: "gpt-4.1", inputPer1k: 0.002, outputPer1k: 0.008 },
  { modelId: "gpt-4.1-mini", inputPer1k: 0.0004, outputPer1k: 0.0016 },
  { modelId: "gpt-5", inputPer1k: 0.003, outputPer1k: 0.015 },
  { modelId: "gpt-5-mini", inputPer1k: 0.0012, outputPer1k: 0.005 },
  { modelId: "claude-sonnet-4.5", inputPer1k: 0.003, outputPer1k: 0.015 },
  { modelId: "claude-sonnet-4", inputPer1k: 0.003, outputPer1k: 0.015 },
];

const pricingTable = new Map<string, ModelPricing>(DEFAULT_PRICING.map((p) => [p.modelId, p]));

/** Register or update pricing for a model. */
export function setModelPricing(pricing: ModelPricing): void {
  pricingTable.set(pricing.modelId, pricing);
}

/** Get pricing for a model. Returns undefined for unknown models. */
export function getModelPricing(modelId: string): ModelPricing | undefined {
  return pricingTable.get(modelId);
}

/** List all registered model pricing entries. */
export function listModelPricing(): ModelPricing[] {
  return Array.from(pricingTable.values());
}

/**
 * Estimate cost for a given token count.
 * Returns 0 for unknown models.
 */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingTable.get(modelId);
  if (!pricing) return 0;
  return (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
}
