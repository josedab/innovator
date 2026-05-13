import { describe, it, expect } from "vitest";
import { CLIMATE_PACK } from "../verticals/climate-pack.js";

describe("CLIMATE_PACK", () => {
  it("has required top-level fields", () => {
    expect(CLIMATE_PACK.id).toBe("climate");
    expect(CLIMATE_PACK.name).toBe("Climate Tech & Sustainability");
    expect(CLIMATE_PACK.version).toBeDefined();
    expect(CLIMATE_PACK.description).toBeDefined();
    expect(CLIMATE_PACK.author).toBeDefined();
  });

  it("has domain angles with valid structure", () => {
    expect(CLIMATE_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of CLIMATE_PACK.domainAngles) {
      expect(angle.id).toBeDefined();
      expect(angle.name).toBeDefined();
      expect(angle.description.length).toBeGreaterThan(0);
      expect(angle.promptContext.length).toBeGreaterThan(0);
    }
  });

  it("includes carbon-impact domain angle", () => {
    const ci = CLIMATE_PACK.domainAngles.find((a) => a.id === "carbon-impact");
    expect(ci).toBeDefined();
    expect(ci!.name).toBe("Carbon Impact");
  });

  it("includes circular-economy domain angle", () => {
    const ce = CLIMATE_PACK.domainAngles.find((a) => a.id === "circular-economy");
    expect(ce).toBeDefined();
  });

  it("includes clean-energy domain angle", () => {
    const ce = CLIMATE_PACK.domainAngles.find((a) => a.id === "clean-energy");
    expect(ce).toBeDefined();
  });

  it("has evaluation rubrics with criteria", () => {
    expect(CLIMATE_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = CLIMATE_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
  });

  it("rubric criteria weights sum to approximately 1.0", () => {
    const rubric = CLIMATE_PACK.evaluationRubrics[0];
    const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("has compliance rules including ESG reporting", () => {
    const esg = CLIMATE_PACK.complianceRules.find((r) => r.id === "esg-reporting");
    expect(esg).toBeDefined();
    expect(esg!.regulation).toContain("ISSB");
    expect(esg!.regulation).toContain("GRI");
  });

  it("has greenwashing prevention compliance rule", () => {
    const gw = CLIMATE_PACK.complianceRules.find((r) => r.id === "greenwashing-detection");
    expect(gw).toBeDefined();
    expect(gw!.regulation).toContain("FTC Green Guides");
  });

  it("has a comprehensive glossary with climate terms", () => {
    const glossary = CLIMATE_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    expect(glossary["GHG"]).toBeDefined();
    expect(glossary["CO2e"]).toBeDefined();
    expect(glossary["SBTi"]).toBeDefined();
    expect(glossary["ESG"]).toBeDefined();
  });

  it("has example sessions", () => {
    expect(CLIMATE_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of CLIMATE_PACK.exampleSessions) {
      expect(session.subject).toBeDefined();
      expect(session.expectedAngles.length).toBeGreaterThan(0);
      expect(session.sampleInsights.length).toBeGreaterThan(0);
    }
  });

  it("has biomimicry subset entries", () => {
    expect(CLIMATE_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with climate and ESG tags", () => {
    expect(CLIMATE_PACK.metadata.tags).toContain("climate");
    expect(CLIMATE_PACK.metadata.tags).toContain("ESG");
    expect(CLIMATE_PACK.metadata.icon).toBe("🌍");
  });
});
