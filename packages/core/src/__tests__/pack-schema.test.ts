import { describe, it, expect, beforeEach } from "vitest";
import { VerticalPackRegistry, type ExtendedVerticalPack } from "../verticals/pack-schema.js";
import { HEALTHCARE_PACK } from "../verticals/healthcare-pack.js";

function makeMinimalPack(overrides?: Partial<ExtendedVerticalPack>): ExtendedVerticalPack {
  return {
    id: "test-pack",
    name: "Test Pack",
    version: "1.0.0",
    description: "A test pack",
    author: "Test",
    domainAngles: [
      {
        id: "angle-1",
        name: "Test Angle",
        description: "A test angle",
        promptContext: "test context",
      },
    ],
    evaluationRubrics: [
      {
        id: "rubric-1",
        name: "Test Rubric",
        criteria: [
          {
            name: "Criterion A",
            description: "test criterion alpha",
            weight: 0.6,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Criterion B",
            description: "test criterion bravo",
            weight: 0.4,
            scaleMin: 0,
            scaleMax: 10,
          },
        ],
        passingScore: 5,
      },
    ],
    complianceRules: [
      {
        id: "rule-1",
        name: "Test Rule",
        regulation: "Test Regulation",
        description: "A test compliance rule",
        severity: "medium",
        checkFunction: "Check if ideas address the test regulation requirements",
        autoDetectable: true,
      },
    ],
    glossary: { term1: "definition1" },
    exampleSessions: [
      {
        subject: "Test subject",
        description: "Test session",
        expectedAngles: ["angle-1"],
        sampleInsights: ["insight1"],
      },
    ],
    biomimicrySubset: ["Pattern one"],
    metadata: { tags: ["test"], icon: "🧪", color: "#000" },
    ...overrides,
  };
}

describe("VerticalPackRegistry", () => {
  let registry: VerticalPackRegistry;

  beforeEach(() => {
    registry = new VerticalPackRegistry();
    registry.reset();
  });

  it("register and get a valid pack", () => {
    const pack = makeMinimalPack();
    const result = registry.register(pack);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    const retrieved = registry.get("test-pack");
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Test Pack");
  });

  it("list returns all registered packs", () => {
    registry.register(makeMinimalPack());
    registry.register(makeMinimalPack({ id: "pack-2", name: "Pack Two" }));
    const packs = registry.list();
    expect(packs.length).toBe(2);
  });

  it("list filters by tag", () => {
    registry.register(
      makeMinimalPack({ metadata: { tags: ["healthcare"], icon: "🏥", color: "#fff" } })
    );
    registry.register(
      makeMinimalPack({ id: "other", metadata: { tags: ["fintech"], icon: "💰", color: "#0f0" } })
    );
    expect(registry.list({ tag: "healthcare" }).length).toBe(1);
    expect(registry.list({ tag: "fintech" }).length).toBe(1);
  });

  it("list filters by search", () => {
    registry.register(makeMinimalPack({ name: "Alpha Pack" }));
    registry.register(makeMinimalPack({ id: "beta", name: "Beta Pack" }));
    expect(registry.list({ search: "Alpha" }).length).toBe(1);
  });

  it("validatePack returns errors for invalid pack", () => {
    const result = registry.validatePack({ id: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validatePack flags rubric weights not summing to 1.0", () => {
    const badPack = makeMinimalPack({
      evaluationRubrics: [
        {
          id: "bad-rubric",
          name: "Bad Rubric",
          criteria: [
            {
              name: "C1",
              description: "desc one for testing",
              weight: 0.3,
              scaleMin: 0,
              scaleMax: 10,
            },
            {
              name: "C2",
              description: "desc two for testing",
              weight: 0.3,
              scaleMin: 0,
              scaleMax: 10,
            },
          ],
          passingScore: 5,
        },
      ],
    });
    const result = registry.validatePack(badPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("weights sum to"))).toBe(true);
  });

  it("validatePack accepts the real HEALTHCARE_PACK", () => {
    const result = registry.validatePack(HEALTHCARE_PACK);
    expect(result.valid).toBe(true);
  });

  it("evaluateWithRubric scores ideas against registered rubric", () => {
    registry.register(makeMinimalPack());
    const ideas = ["This idea has test criterion alpha and bravo qualities"];
    const result = registry.evaluateWithRubric(ideas, "rubric-1");
    expect(result).toBeDefined();
    expect(result!.rubricId).toBe("rubric-1");
    expect(result!.scores.length).toBe(2);
    expect(typeof result!.totalScore).toBe("number");
    expect(typeof result!.passed).toBe("boolean");
  });

  it("evaluateWithRubric returns undefined for unknown rubric", () => {
    expect(registry.evaluateWithRubric(["idea"], "nonexistent")).toBeUndefined();
  });

  it("checkCompliance runs rules against ideas", () => {
    registry.register(makeMinimalPack());
    const result = registry.checkCompliance(
      ["This idea addresses the test regulation requirements"],
      "test-pack"
    );
    expect(result).toBeDefined();
    expect(result!.packId).toBe("test-pack");
    expect(result!.results.length).toBe(1);
    expect(typeof result!.overallPassed).toBe("boolean");
  });

  it("checkCompliance returns undefined for unknown pack", () => {
    expect(registry.checkCompliance(["idea"], "nonexistent")).toBeUndefined();
  });

  it("getGlossary returns terms for a registered pack", () => {
    registry.register(makeMinimalPack());
    const glossary = registry.getGlossary("test-pack");
    expect(glossary).toBeDefined();
    expect(glossary!.term1).toBe("definition1");
  });

  it("unregister removes a pack", () => {
    registry.register(makeMinimalPack());
    expect(registry.unregister("test-pack")).toBe(true);
    expect(registry.get("test-pack")).toBeUndefined();
    expect(registry.unregister("test-pack")).toBe(false);
  });

  it("getExampleSessions returns examples for a registered pack", () => {
    registry.register(makeMinimalPack());
    const sessions = registry.getExampleSessions("test-pack");
    expect(sessions).toBeDefined();
    expect(sessions!.length).toBe(1);
    expect(sessions![0].subject).toBe("Test subject");
  });
});
