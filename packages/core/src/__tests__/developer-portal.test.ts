import { describe, it, expect, vi } from "vitest";

vi.mock("../api-gateway/api-spec.js", () => ({
  generateOpenApiSpec: vi.fn(() => ({
    openapi: "3.1.0",
    info: { title: "Innovator API", version: "1.0.0" },
    paths: {},
  })),
  generateSdkSnippet: vi.fn(
    (endpoint: string, lang: string) => `// ${lang} snippet for ${endpoint}`
  ),
}));

vi.mock("../api-gateway/billing.js", () => ({
  getPricingPlans: vi.fn(() => [
    { id: "free", name: "Free", price: 0, limits: {} },
    { id: "pro", name: "Pro", price: 29, limits: {} },
  ]),
}));

vi.mock("../api-gateway/index.js", () => ({
  // BillingTier type re-exported, no runtime value needed
}));

import {
  getPortalConfig,
  getQuickstartGuides,
  filterGuides,
  getOnboardingSteps,
  getDeveloperPortalPage,
  getSwaggerUiConfig,
} from "../api-gateway/developer-portal.js";

describe("getPortalConfig", () => {
  it("produces valid config with correct URLs", () => {
    const config = getPortalConfig("https://api.example.com");
    expect(config.title).toContain("Innovator");
    expect(config.baseUrl).toBe("https://api.example.com");
    expect(config.swaggerUiUrl).toBe("https://api.example.com/docs");
    expect(config.features.length).toBeGreaterThan(0);
    expect(config.supportEmail).toBeTruthy();
  });

  it("uses default baseUrl when not provided", () => {
    const config = getPortalConfig();
    expect(config.baseUrl).toBe("https://api.innovator.dev");
  });
});

describe("getQuickstartGuides", () => {
  it("returns all 5 guides with unique IDs", () => {
    const guides = getQuickstartGuides();
    expect(guides).toHaveLength(5);
    const ids = new Set(guides.map((g) => g.id));
    expect(ids.size).toBe(5);
  });

  it("returns a copy (not reference to internal array)", () => {
    const guides1 = getQuickstartGuides();
    const guides2 = getQuickstartGuides();
    expect(guides1).not.toBe(guides2);
  });
});

describe("filterGuides", () => {
  it("filters by language", () => {
    const results = filterGuides({ language: "python" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    results.forEach((g) => expect(g.language).toBe("python"));
  });

  it("filters by difficulty", () => {
    const results = filterGuides({ difficulty: "beginner" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    results.forEach((g) => expect(g.difficulty).toBe("beginner"));
  });

  it("filters by both language and difficulty", () => {
    const results = filterGuides({ language: "typescript", difficulty: "beginner" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    results.forEach((g) => {
      expect(g.language).toBe("typescript");
      expect(g.difficulty).toBe("beginner");
    });
  });

  it("returns all guides when no filters are provided", () => {
    const results = filterGuides({});
    expect(results).toHaveLength(5);
  });
});

describe("getOnboardingSteps", () => {
  it("returns 5 steps in correct order", () => {
    const steps = getOnboardingSteps();
    expect(steps).toHaveLength(5);
    expect(steps[0].step).toBe(1);
    expect(steps[4].step).toBe(5);
    // First step is always completed
    expect(steps[0].completed).toBe(true);
  });

  it("marks steps based on provided options", () => {
    const steps = getOnboardingSteps({
      hasApiKey: true,
      hasMadeCall: true,
      hasWebhook: false,
    });
    expect(steps[1].completed).toBe(true); // API key
    expect(steps[2].completed).toBe(true); // Made call
    expect(steps[3].completed).toBe(false); // Webhook
  });

  it("defaults optional flags to false", () => {
    const steps = getOnboardingSteps();
    expect(steps[1].completed).toBe(false);
    expect(steps[2].completed).toBe(false);
    expect(steps[3].completed).toBe(false);
  });
});

describe("getDeveloperPortalPage", () => {
  it("returns complete bundle with all sections", () => {
    const page = getDeveloperPortalPage("https://api.example.com");
    expect(page.config).toBeDefined();
    expect(page.guides).toBeDefined();
    expect(page.pricing).toBeDefined();
    expect(page.sdkSnippets).toBeDefined();
    expect(page.swagger).toBeDefined();
    expect(page.onboarding).toBeDefined();

    // SDK snippets for all 5 languages
    expect(Object.keys(page.sdkSnippets)).toHaveLength(5);
    expect(page.sdkSnippets.javascript).toBeTruthy();
    expect(page.sdkSnippets.python).toBeTruthy();
  });
});

describe("getSwaggerUiConfig", () => {
  it("produces valid OpenAPI spec structure", () => {
    const { spec, uiConfig } = getSwaggerUiConfig();
    expect(spec).toHaveProperty("openapi");
    expect(spec).toHaveProperty("info");
    expect(uiConfig.deepLinking).toBe(true);
    expect(uiConfig.tryItOutEnabled).toBe(true);
  });
});
