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
import { ValidationError } from "../errors.js";

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
    throw new ValidationError(`Model "${model.modelId}" is already registered`);
  }
  customModels.push(model);
}

/** Unregister a custom model by ID. Returns true if a model was removed. */
export function unregisterModel(modelId: string): boolean {
  const index = customModels.findIndex((m) => m.modelId === modelId);
  if (index === -1) return false;
  customModels.splice(index, 1);
  return true;
}

/** Get capability info for a specific model. */
export function getModelCapability(modelId: string): ModelCapability | undefined {
  return getModelRegistry().find((m) => m.modelId === modelId);
}

/** Summary of an available model for listing purposes. */
export interface AvailableModel {
  /** Model identifier. */
  id: string;
  /** Human-readable display name (from registry, or derived from ID). */
  displayName: string;
  /** Whether this model has capability metadata in the registry. */
  hasCapabilities: boolean;
  /** Source of this model entry. */
  source: "built-in" | "custom" | "env";
}

/**
 * Get a unified list of all available models from all sources:
 * - Built-in model registry (with full capability metadata)
 * - Custom models registered at runtime
 * - Models from `INNOVATOR_EXTRA_MODELS` environment variable
 *
 * Results are deduplicated by model ID, with registry entries taking priority.
 *
 * @returns Array of {@link AvailableModel} sorted alphabetically by ID
 */
export function getAvailableModels(): AvailableModel[] {
  const seen = new Set<string>();
  const models: AvailableModel[] = [];

  // Built-in registry models
  for (const m of MODEL_REGISTRY) {
    if (!seen.has(m.modelId)) {
      seen.add(m.modelId);
      models.push({
        id: m.modelId,
        displayName: m.displayName,
        hasCapabilities: true,
        source: "built-in",
      });
    }
  }

  // Custom runtime models
  for (const m of customModels) {
    if (!seen.has(m.modelId)) {
      seen.add(m.modelId);
      models.push({
        id: m.modelId,
        displayName: m.displayName,
        hasCapabilities: true,
        source: "custom",
      });
    }
  }

  // Environment variable models
  const envModels = (process.env.INNOVATOR_EXTRA_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const modelId of envModels) {
    if (!seen.has(modelId)) {
      seen.add(modelId);
      models.push({
        id: modelId,
        displayName: modelId,
        hasCapabilities: false,
        source: "env",
      });
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/** Auto-select the best model for each pipeline stage based on registered capabilities. */
export function getSmartRouting(
  preference: "quality" | "speed" | "cost" = "quality"
): ModelRouting {
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

/**
 * Run the same angle on multiple models in parallel and compare results side by side.
 * Results are returned in the same order as the input models array.
 */
export async function compareModels(
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  models: string[],
  generateFn: GenerateFn,
  signal?: AbortSignal
): Promise<ModelComparisonResult> {
  const resolvedAngleId = String(angleId);

  const promises = models.map(async (model) => {
    const start = Date.now();
    try {
      const angleResult = await generateFn(subject, investigation, angleId, model, signal);
      return {
        model,
        angleResult,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        model,
        angleResult: {
          angleId: resolvedAngleId,
          angleName: `Error (${model})`,
          ideas: [],
          reasoning: `Failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        durationMs: Date.now() - start,
      };
    }
  });

  const results = await Promise.all(promises);
  return { angleId: resolvedAngleId, results };
}

/** Clear custom models (for testing). */
export function clearCustomModels(): void {
  customModels.length = 0;
}
