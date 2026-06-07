export interface ProviderHealth {
  name: string;
  status: "healthy" | "unhealthy";
  latencyMs: number;
  message?: string;
  lastCheck: string;
}

const PROVIDER_HEALTH_TIMEOUT_MS = 8_000;
const PROVIDER_HEALTH_CACHE_MS = 15_000;

let cachedHealth: { expiresAt: number; value: ProviderHealth } | undefined;
let healthCheckPromise: Promise<ProviderHealth> | undefined;

export function clearCopilotProviderHealthCache(): void {
  cachedHealth = undefined;
  healthCheckPromise = undefined;
}

async function checkCopilotProvider(): Promise<ProviderHealth> {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const [auth, models] = await Promise.race([
      (async () => {
        const { getCopilotClient } = await import("@innovator/core");
        const client = await getCopilotClient();
        return Promise.all([
          client.getAuthStatus(),
          client.listModels(),
          client.ping("innovator-readiness"),
        ]).then(([authStatus, modelList]) => [authStatus, modelList] as const);
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Copilot provider health check timed out")),
          PROVIDER_HEALTH_TIMEOUT_MS
        );
      }),
    ]);
    const isHealthy = auth.isAuthenticated && models.length > 0;
    if (!isHealthy) {
      const { resetCopilotClientIfIdle } = await import("@innovator/core");
      await resetCopilotClientIfIdle().catch(() => false);
    }

    return {
      name: "llm-provider-copilot",
      status: isHealthy ? "healthy" : "unhealthy",
      latencyMs: Date.now() - startedAt,
      ...(isHealthy
        ? {}
        : {
            message: auth.isAuthenticated
              ? "No Copilot models are available"
              : (auth.statusMessage ?? "Copilot authentication is invalid"),
          }),
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    const { resetCopilotClientIfIdle } = await import("@innovator/core");
    await resetCopilotClientIfIdle().catch(() => false);
    return {
      name: "llm-provider-copilot",
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Copilot provider check failed",
      lastCheck: new Date().toISOString(),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function getCopilotProviderHealth(): Promise<ProviderHealth> {
  const now = Date.now();
  if (cachedHealth && cachedHealth.expiresAt > now) {
    return cachedHealth.value;
  }
  if (healthCheckPromise) {
    return healthCheckPromise;
  }

  healthCheckPromise = checkCopilotProvider()
    .then((value) => {
      cachedHealth = {
        value,
        expiresAt: Date.now() + PROVIDER_HEALTH_CACHE_MS,
      };
      return value;
    })
    .finally(() => {
      healthCheckPromise = undefined;
    });

  return healthCheckPromise;
}
