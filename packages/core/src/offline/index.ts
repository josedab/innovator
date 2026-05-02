/**
 * @module offline
 *
 * Offline / local-first mode support.
 * Auto-detects running Ollama instances, checks network state,
 * and provides recommended model configurations.
 */

export interface OllamaStatus {
  available: boolean;
  baseUrl: string;
  models: string[];
  error?: string;
}

export interface RecommendedModel {
  id: string;
  name: string;
  useCase: "fast" | "quality" | "balanced";
  description: string;
  minRamGb: number;
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: "mistral:7b",
    name: "Mistral 7B",
    useCase: "fast",
    description: "Fast responses, good for quick investigations and brainstorming",
    minRamGb: 8,
  },
  {
    id: "llama3:8b",
    name: "Llama 3 8B",
    useCase: "balanced",
    description: "Good balance of speed and quality for general innovation tasks",
    minRamGb: 8,
  },
  {
    id: "llama3:70b",
    name: "Llama 3 70B",
    useCase: "quality",
    description: "Highest quality output, best for deep analysis (requires significant RAM)",
    minRamGb: 48,
  },
  {
    id: "codellama:13b",
    name: "Code Llama 13B",
    useCase: "balanced",
    description: "Optimized for technical and code-related innovation subjects",
    minRamGb: 16,
  },
  {
    id: "mixtral:8x7b",
    name: "Mixtral 8x7B",
    useCase: "quality",
    description: "MoE architecture with strong reasoning capabilities",
    minRamGb: 32,
  },
];

/**
 * Check if an Ollama instance is running at the given URL.
 * Returns status with available models.
 */
export async function detectOllama(
  baseUrl: string = "http://localhost:11434"
): Promise<OllamaStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { available: false, baseUrl, models: [], error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map((m) => m.name);

    return { available: true, baseUrl, models };
  } catch (err) {
    return {
      available: false,
      baseUrl,
      models: [],
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/**
 * Check network connectivity by attempting to reach a known endpoint.
 * Returns true if online, false if offline.
 */
export async function checkNetworkStatus(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.github.com/zen", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return response.ok;
  } catch {
    return false;
  }
}

export interface OfflineStatus {
  isOnline: boolean;
  ollama: OllamaStatus;
  canRunOffline: boolean;
  recommendedModel: RecommendedModel | null;
}

/**
 * Get full offline status: network connectivity + Ollama availability.
 */
export async function getOfflineStatus(ollamaUrl?: string): Promise<OfflineStatus> {
  const [isOnline, ollama] = await Promise.all([checkNetworkStatus(), detectOllama(ollamaUrl)]);

  const canRunOffline = ollama.available && ollama.models.length > 0;

  // Find best available recommended model
  let recommendedModel: RecommendedModel | null = null;
  if (ollama.available) {
    for (const rec of RECOMMENDED_MODELS) {
      if (ollama.models.some((m) => m.startsWith(rec.id.split(":")[0]))) {
        recommendedModel = rec;
        break;
      }
    }
  }

  return { isOnline, ollama, canRunOffline, recommendedModel };
}

/** Get recommended model for a specific use case. */
export function getRecommendedModel(
  useCase: "fast" | "quality" | "balanced"
): RecommendedModel | undefined {
  return RECOMMENDED_MODELS.find((m) => m.useCase === useCase);
}
