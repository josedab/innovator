import { describe, it, expect } from "vitest";
import { CLIMATE_PACK } from "../verticals/climate-pack.js";

describe("CLIMATE_PACK", () => {
  it("has required top-level fields", () => {
    expect(CLIMATE_PACK).toMatchObject({
      id: "climate",
      name: "Climate Tech & Sustainability",
      version: "1.0.0",
      author: "Innovator Core Team",
    });
    expect(CLIMATE_PACK.description.length).toBeGreaterThan(10);
  });

  it("has domain angles with valid structure", () => {
    expect(CLIMATE_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of CLIMATE_PACK.domainAngles) {
      expect(angle).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        promptContext: expect.any(String),
      });
      expect(angle.description.length).toBeGreaterThan(0);
      expect(angle.promptContext.length).toBeGreaterThan(0);
    }
  });

  it("includes carbon-impact domain angle", () => {
    const ci = CLIMATE_PACK.domainAngles.find((a) => a.id === "carbon-impact");
    expect(ci).toMatchObject({ id: "carbon-impact", name: "Carbon Impact" });
  });

  it("includes circular-economy domain angle", () => {
    const ce = CLIMATE_PACK.domainAngles.find((a) => a.id === "circular-economy");
    expect(ce).toMatchObject({ id: "circular-economy" });
  });

  it("includes clean-energy domain angle", () => {
    const ce = CLIMATE_PACK.domainAngles.find((a) => a.id === "clean-energy");
    expect(ce).toMatchObject({ id: "clean-energy" });
  });

  it("has evaluation rubrics with criteria", () => {
    expect(CLIMATE_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = CLIMATE_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
    for (const criterion of rubric.criteria) {
      expect(criterion).toMatchObject({
        name: expect.any(String),
        weight: expect.any(Number),
      });
    }
  });

  it("rubric criteria weights sum to approximately 1.0", () => {
    const rubric = CLIMATE_PACK.evaluationRubrics[0];
    const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("has compliance rules including ESG reporting", () => {
    const esg = CLIMATE_PACK.complianceRules.find((r) => r.id === "esg-reporting");
    expect(esg).toMatchObject({ id: "esg-reporting" });
    expect(esg!.regulation).toContain("ISSB");
    expect(esg!.regulation).toContain("GRI");
  });

  it("has greenwashing prevention compliance rule", () => {
    const gw = CLIMATE_PACK.complianceRules.find((r) => r.id === "greenwashing-detection");
    expect(gw).toMatchObject({ id: "greenwashing-detection" });
    expect(gw!.regulation).toContain("FTC Green Guides");
  });

  it("has a comprehensive glossary with climate terms", () => {
    const glossary = CLIMATE_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    for (const term of ["GHG", "CO2e", "SBTi", "ESG"]) {
      expect(glossary[term]).toEqual(expect.any(String));
      expect(glossary[term].length).toBeGreaterThan(0);
    }
  });

  it("has example sessions", () => {
    expect(CLIMATE_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of CLIMATE_PACK.exampleSessions) {
      expect(session).toMatchObject({
        subject: expect.any(String),
        expectedAngles: expect.any(Array),
        sampleInsights: expect.any(Array),
      });
      expect(session.expectedAngles.length).toBeGreaterThan(0);
      expect(session.sampleInsights.length).toBeGreaterThan(0);
    }
  });

  it("has biomimicry subset entries", () => {
    expect(CLIMATE_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with climate and ESG tags", () => {
    expect(CLIMATE_PACK.metadata).toMatchObject({ icon: "🌍" });
    expect(CLIMATE_PACK.metadata.tags).toContain("climate");
    expect(CLIMATE_PACK.metadata.tags).toContain("ESG");
  });

  it("all domain angle IDs are unique", () => {
    const ids = CLIMATE_PACK.domainAngles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
