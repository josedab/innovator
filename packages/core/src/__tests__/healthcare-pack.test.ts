import { describe, it, expect } from "vitest";
import { HEALTHCARE_PACK } from "../verticals/healthcare-pack.js";

describe("HEALTHCARE_PACK", () => {
  it("has required top-level fields", () => {
    expect(HEALTHCARE_PACK).toMatchObject({
      id: "healthcare",
      version: "1.0.0",
      author: "Innovator Core Team",
    });
    expect(HEALTHCARE_PACK.name).toBe("Healthcare & Life Sciences");
    expect(HEALTHCARE_PACK.description.length).toBeGreaterThan(10);
  });

  it("has domain angles with valid structure", () => {
    expect(HEALTHCARE_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of HEALTHCARE_PACK.domainAngles) {
      expect(angle).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        promptContext: expect.any(String),
      });
      expect(angle.id.length).toBeGreaterThan(0);
      expect(angle.name.length).toBeGreaterThan(0);
      expect(angle.description.length).toBeGreaterThan(0);
      expect(angle.promptContext.length).toBeGreaterThan(0);
    }
  });

  it("includes patient-safety domain angle", () => {
    const patientSafety = HEALTHCARE_PACK.domainAngles.find((a) => a.id === "patient-safety");
    expect(patientSafety).toMatchObject({
      id: "patient-safety",
      name: "Patient Safety",
    });
  });

  it("includes digital-health domain angle", () => {
    const dh = HEALTHCARE_PACK.domainAngles.find((a) => a.id === "digital-health");
    expect(dh).toMatchObject({ id: "digital-health" });
  });

  it("has evaluation rubrics with criteria", () => {
    expect(HEALTHCARE_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = HEALTHCARE_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
    expect(rubric.passingScore).toBeGreaterThan(0);
    for (const criterion of rubric.criteria) {
      expect(criterion).toMatchObject({
        name: expect.any(String),
        weight: expect.any(Number),
      });
    }
  });

  it("rubric has patient safety criterion", () => {
    const rubric = HEALTHCARE_PACK.evaluationRubrics[0];
    const safetyC = rubric.criteria.find((c) => c.name === "Patient Safety Impact");
    expect(safetyC).toMatchObject({
      name: "Patient Safety Impact",
      weight: expect.any(Number),
    });
    expect(safetyC!.weight).toBeGreaterThan(0);
  });

  it("rubric criteria weights sum to approximately 1.0", () => {
    const rubric = HEALTHCARE_PACK.evaluationRubrics[0];
    const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("has compliance rules including HIPAA", () => {
    expect(HEALTHCARE_PACK.complianceRules.length).toBeGreaterThan(0);
    const hipaa = HEALTHCARE_PACK.complianceRules.find((r) => r.id === "hipaa-phi");
    expect(hipaa).toMatchObject({
      id: "hipaa-phi",
      severity: "critical",
    });
    expect(hipaa!.regulation).toContain("HIPAA");
  });

  it("has FDA device classification compliance rule", () => {
    const fda = HEALTHCARE_PACK.complianceRules.find((r) => r.id === "fda-device-class");
    expect(fda).toMatchObject({
      id: "fda-device-class",
      severity: "critical",
    });
  });

  it("has a comprehensive glossary with healthcare terms", () => {
    const glossary = HEALTHCARE_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    for (const term of ["PHI", "EHR", "FHIR", "SaMD"]) {
      expect(glossary[term]).toEqual(expect.any(String));
      expect(glossary[term].length).toBeGreaterThan(0);
    }
  });

  it("has example sessions", () => {
    expect(HEALTHCARE_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of HEALTHCARE_PACK.exampleSessions) {
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
    expect(HEALTHCARE_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with tags, icon, and color", () => {
    expect(HEALTHCARE_PACK.metadata).toMatchObject({
      icon: "🏥",
    });
    expect(HEALTHCARE_PACK.metadata.tags).toContain("healthcare");
    expect(HEALTHCARE_PACK.metadata.tags).toContain("HIPAA");
    expect(HEALTHCARE_PACK.metadata.color).toEqual(expect.any(String));
  });

  it("all domain angle IDs are unique", () => {
    const ids = HEALTHCARE_PACK.domainAngles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all compliance rule IDs are unique", () => {
    const ids = HEALTHCARE_PACK.complianceRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
