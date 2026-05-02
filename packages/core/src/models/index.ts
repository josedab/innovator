/**
 * @module models
 *
 * Model registry with capability metadata, comparison mode,
 * and smart routing that auto-selects optimal model per stage.
 */

import type {
  ModelCapability,
  ModelRouting,
  ModelComparisonResult,
  PipelineModelStage,
  AngleId,
  AngleResult,
  Investigation,
} from "../types.js";

/** Built-in model capability registry. */
const MODEL_REGISTRY: ModelCapability[] = [
  {
    modelId: "gpt-5",
    displayName: "GPT-5",
    strengths: ["investigation", "generation", "synthesis"],
    costTier: "high",
    speedTier: "medium",
    qualityTier: "premium",
  },
  {
    modelId: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    strengths: ["synthesis"],
    costTier: "low",
    speedTier: "fast",
    qualityTier: "standard",
  },
  {
    modelId: "gpt-4.1",
    displayName: "GPT-4.1",
    strengths: ["investigation", "generation"],
    costTier: "medium",
    speedTier: "medium",
    qualityTier: "high",
  },
  {
    modelId: "gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    strengths: ["synthesis"],
    costTier: "low",
    speedTier: "fast",
    qualityTier: "standard",
  },
  {
    modelId: "claude-sonnet-4.5",
    displayName: "Claude Sonnet 4.5",
    strengths: ["generation", "synthesis"],
    costTier: "medium",
    speedTier: "medium",
    qualityTier: "high",
  },
  {
    modelId: "claude-sonnet-4",
    displayName: "Claude Sonnet 4",
    strengths: ["investigation", "generation"],
    costTier: "medium",
    speedTier: "medium",
    qualityTier: "high",
  },
];

/** Custom models added at runtime. */
const customModels: ModelCapability[] = [];

/** Get all registered model capabilities. */
export function getModelRegistry(): ModelCapability[] {
  return [...MODEL_REGISTRY, ...customModels];
}

/** Register a custom model capability. */
export function registerModel(model: ModelCapability): void {
  if (getModelRegistry().some((m) => m.modelId === model.modelId)) {
    throw new Error(`Model "${model.modelId}" is already registered`);
  }
  customModels.push(model);
}

/** Get capability info for a specific model. */
export function getModelCapability(modelId: string): ModelCapability | undefined {
  return getModelRegistry().find((m) => m.modelId === modelId);
}

/** Auto-select the best model for each pipeline stage based on registered capabilities. */
export function getSmartRouting(preference: "quality" | "speed" | "cost" = "quality"): ModelRouting {
  const registry = getModelRegistry();

  const selectBest = (stage: PipelineModelStage): string | undefined => {
    const candidates = registry.filter((m) => m.strengths.includes(stage));
    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => {
      const tierOrder = { premium: 3, high: 2, standard: 1 };
      const costOrder = { low: 3, medium: 2, high: 1 };
      const speedOrder = { fast: 3, medium: 2, slow: 1 };

      switch (preference) {
        case "quality":
          return (tierOrder[b.qualityTier] ?? 0) - (tierOrder[a.qualityTier] ?? 0);
        case "speed":
          return (speedOrder[b.speedTier] ?? 0) - (speedOrder[a.speedTier] ?? 0);
        case "cost":
          return (costOrder[b.costTier] ?? 0) - (costOrder[a.costTier] ?? 0);
        default:
          return 0;
      }
    });

    return candidates[0]?.modelId;
  };

  return {
    investigation: selectBest("investigation"),
    generation: selectBest("generation"),
    synthesis: selectBest("synthesis"),
  };
}

/** Type for the generate function used by compareModels. */
type GenerateFn = (
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  model?: string,
  signal?: AbortSignal
) => Promise<AngleResult>;

/** Run the same angle on multiple models and compare results side by side. */
export async function compareModels(
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  models: string[],
  generateFn: GenerateFn,
  signal?: AbortSignal
): Promise<ModelComparisonResult> {
  const results: ModelComparisonResult["results"] = [];

  for (const model of models) {
    const start = Date.now();
    try {
      const angleResult = await generateFn(subject, investigation, angleId, model, signal);
      results.push({
        model,
        angleResult,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        model,
        angleResult: {
          angleId: typeof angleId === "string" ? angleId : angleId,
          angleName: `Error (${model})`,
          ideas: [],
          reasoning: `Failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        durationMs: Date.now() - start,
      });
    }
  }

  return { angleId: typeof angleId === "string" ? angleId : angleId, results };
}

/** Clear custom models (for testing). */
export function clearCustomModels(): void {
  customModels.length = 0;
}
