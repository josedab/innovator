import { describe, it, expect, beforeEach } from "vitest";

import {
  registerRoutingPolicy,
  getRoutingPolicy,
  listRoutingPolicies,
  routeModel,
  recordQualityObservation,
  getModelStats,
  getRoutingAnalytics,
  getBestModel,
  clearAdaptiveRouterData,
} from "../adaptive-router/index.js";
import type { RoutingPolicy, QualityObservation } from "../adaptive-router/index.js";

function makePolicy(overrides: Partial<RoutingPolicy> = {}): RoutingPolicy {
  return {
    id: "default-policy",
    name: "Default Policy",
    costBudget: "medium",
    qualityThreshold: 0.7,
    enableExploration: false,
    explorationRate: 0,
    ...overrides,
  };
}

function makeObservation(overrides: Partial<QualityObservation> = {}): QualityObservation {
  return {
    modelId: "gpt-4.1",
    stage: "generation",
    qualityScore: 0.85,
    latencyMs: 2000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("adaptive-router", () => {
  beforeEach(() => {
    clearAdaptiveRouterData();
  });

  describe("policies", () => {
    it("registers and retrieves a policy", () => {
      const policy = registerRoutingPolicy(makePolicy());
      const fetched = getRoutingPolicy("default-policy");
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe("Default Policy");
    });

    it("lists all policies", () => {
      registerRoutingPolicy(makePolicy({ id: "p1", name: "Policy 1" }));
      registerRoutingPolicy(makePolicy({ id: "p2", name: "Policy 2" }));
      expect(listRoutingPolicies()).toHaveLength(2);
    });
  });

  describe("routing", () => {
    it("routes to a model for investigation stage", () => {
      const decision = routeModel("investigation");
      expect(decision.modelId).toBeTruthy();
      expect(decision.stage).toBe("investigation");
    });

    it("routes to a model for generation stage", () => {
      const decision = routeModel("generation");
      expect(decision.modelId).toBeTruthy();
      expect(decision.stage).toBe("generation");
    });

    it("routes to a model for synthesis stage", () => {
      const decision = routeModel("synthesis");
      expect(decision.modelId).toBeTruthy();
    });

    it("uses angle overrides when set", () => {
      registerRoutingPolicy(
        makePolicy({
          id: "override-policy",
          angleOverrides: { scamper: "gpt-5" },
        })
      );
      const decision = routeModel("generation", {
        policyId: "override-policy",
        angleId: "scamper",
      });
      expect(decision.modelId).toBe("gpt-5");
      expect(decision.reason).toContain("override");
    });

    it("uses domain overrides when set", () => {
      registerRoutingPolicy(
        makePolicy({
          id: "domain-policy",
          domainOverrides: { healthcare: "claude-sonnet-4.5" },
        })
      );
      const decision = routeModel("generation", {
        policyId: "domain-policy",
        domain: "healthcare",
      });
      expect(decision.modelId).toBe("claude-sonnet-4.5");
    });

    it("respects cost budget constraints", () => {
      registerRoutingPolicy(makePolicy({ id: "cheap", costBudget: "low" }));
      const decision = routeModel("generation", { policyId: "cheap" });
      expect(decision.modelId).toBeTruthy();
    });
  });

  describe("quality feedback loop", () => {
    it("records observations and updates stats", () => {
      recordQualityObservation(makeObservation({ modelId: "gpt-4.1", qualityScore: 0.9 }));
      recordQualityObservation(makeObservation({ modelId: "gpt-4.1", qualityScore: 0.8 }));

      const stats = getModelStats("generation");
      const gpt41 = stats.find((s) => s.modelId === "gpt-4.1");
      expect(gpt41).toBeDefined();
      expect(gpt41!.totalObservations).toBe(2);
      expect(gpt41!.meanQuality).toBeCloseTo(0.85, 1);
    });

    it("updates Beta distribution params on high quality", () => {
      recordQualityObservation(makeObservation({ qualityScore: 0.9 }));
      const stats = getModelStats("generation");
      const model = stats.find((s) => s.modelId === "gpt-4.1");
      expect(model!.alpha).toBe(2); // 1 (prior) + 1 (success)
      expect(model!.beta).toBe(1); // 1 (prior), no failure
    });

    it("updates Beta distribution params on low quality", () => {
      recordQualityObservation(makeObservation({ qualityScore: 0.3 }));
      const stats = getModelStats("generation");
      const model = stats.find((s) => s.modelId === "gpt-4.1");
      expect(model!.alpha).toBe(1); // 1 (prior), no success
      expect(model!.beta).toBe(2); // 1 (prior) + 1 (failure)
    });
  });

  describe("analytics", () => {
    it("provides routing analytics summary", () => {
      routeModel("investigation");
      routeModel("generation");
      recordQualityObservation(makeObservation());

      const analytics = getRoutingAnalytics();
      expect(analytics.totalDecisions).toBe(2);
      expect(analytics.totalObservations).toBe(1);
    });
  });

  describe("best model", () => {
    it("returns best model for a context", () => {
      recordQualityObservation(makeObservation({ modelId: "gpt-4.1", qualityScore: 0.9 }));
      recordQualityObservation(makeObservation({ modelId: "gpt-5", qualityScore: 0.7 }));

      const best = getBestModel("generation");
      expect(best).toBeDefined();
      expect(best!.modelId).toBe("gpt-4.1");
    });

    it("returns undefined when no observations exist", () => {
      const best = getBestModel("investigation", "scamper", "healthcare");
      expect(best).toBeUndefined();
    });
  });
});
