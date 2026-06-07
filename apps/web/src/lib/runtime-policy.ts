export const SINGLE_TENANT_PROFILE = "single-tenant";
const MIN_API_KEY_LENGTH = 32;

const PRODUCTION_API_ROUTES = new Map<string, ReadonlySet<string>>([
  ["/api/health", new Set(["GET"])],
  ["/api/angles", new Set(["GET"])],
  ["/api/presets", new Set(["GET"])],
  ["/api/investigate", new Set(["POST"])],
  ["/api/innovate", new Set(["POST"])],
  ["/api/auto", new Set(["POST"])],
  ["/api/nl-innovate", new Set(["POST"])],
  ["/api/v1/investigate", new Set(["POST"])],
  ["/api/v1/innovate", new Set(["POST"])],
  ["/api/v1/auto", new Set(["POST"])],
  ["/api/v1/openapi", new Set(["GET"])],
]);

export type ProductionRouteDecision =
  | { action: "allow"; authenticated: boolean }
  | { action: "not-found" }
  | { action: "method-not-allowed"; allowedMethods: string[] }
  | { action: "misconfigured" };

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build";
}

export function getConfiguredApiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const legacyKey = env.INNOVATOR_API_KEY?.trim() ?? "";
  const configuredKeys = (env.INNOVATOR_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (legacyKey && configuredKeys.length > 0) {
    throw new Error("Configure INNOVATOR_API_KEYS or INNOVATOR_API_KEY, not both");
  }

  return legacyKey ? [legacyKey] : configuredKeys;
}

export function validateProductionRuntime(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProductionRuntime(env)) return;

  if (env.INNOVATOR_DEPLOYMENT_PROFILE !== SINGLE_TENANT_PROFILE) {
    throw new Error(
      `INNOVATOR_DEPLOYMENT_PROFILE must be "${SINGLE_TENANT_PROFILE}" in production`
    );
  }

  if (env.INNOVATOR_API_KEY?.trim()) {
    throw new Error("INNOVATOR_API_KEY is legacy; production must use INNOVATOR_API_KEYS");
  }

  const apiKeys = getConfiguredApiKeys(env);
  if (apiKeys.length === 0) {
    throw new Error("INNOVATOR_API_KEYS must contain at least one production API key");
  }
  if (apiKeys.some((key) => key.length < MIN_API_KEY_LENGTH)) {
    throw new Error(`Production API keys must be at least ${MIN_API_KEY_LENGTH} characters`);
  }
  if (new Set(apiKeys).size !== apiKeys.length) {
    throw new Error("INNOVATOR_API_KEYS must not contain duplicate keys");
  }
  if (!env.GH_TOKEN?.trim()) {
    throw new Error("GH_TOKEN is required for the production Copilot provider");
  }
}

export function getProductionRouteDecision(
  pathname: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env
): ProductionRouteDecision {
  if (!isProductionRuntime(env)) {
    return { action: "allow", authenticated: pathname.startsWith("/api/") };
  }

  if (pathname === "/healthz") {
    return { action: "allow", authenticated: false };
  }

  try {
    validateProductionRuntime(env);
  } catch {
    return { action: "misconfigured" };
  }

  if (pathname === "/readyz") {
    return { action: "allow", authenticated: false };
  }

  const allowedMethods = PRODUCTION_API_ROUTES.get(pathname);
  if (!allowedMethods) {
    return { action: "not-found" };
  }
  if (!allowedMethods.has(method)) {
    return {
      action: "method-not-allowed",
      allowedMethods: [...allowedMethods],
    };
  }

  return { action: "allow", authenticated: true };
}
