import { describe, it, expect } from "vitest";
import { HEALTHCARE_PACK } from "../verticals/healthcare-pack.js";

describe("HEALTHCARE_PACK", () => {
  it("has required top-level fields", () => {
    expect(HEALTHCARE_PACK.id).toBe("healthcare");
    expect(HEALTHCARE_PACK.name).toBeDefined();
    expect(HEALTHCARE_PACK.version).toBeDefined();
    expect(HEALTHCARE_PACK.description).toBeDefined();
    expect(HEALTHCARE_PACK.author).toBeDefined();
  });

  it("has domain angles with valid structure", () => {
    expect(HEALTHCARE_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of HEALTHCARE_PACK.domainAngles) {
      expect(angle.id).toBeDefined();
      expect(angle.name).toBeDefined();
      expect(angle.description).toBeDefined();
      expect(angle.promptContext).toBeDefined();
    }
  });

  it("includes patient-safety domain angle", () => {
    const patientSafety = HEALTHCARE_PACK.domainAngles.find((a) => a.id === "patient-safety");
    expect(patientSafety).toBeDefined();
    expect(patientSafety!.name).toBe("Patient Safety");
  });

  it("includes digital-health domain angle", () => {
    const dh = HEALTHCARE_PACK.domainAngles.find((a) => a.id === "digital-health");
    expect(dh).toBeDefined();
  });

  it("has evaluation rubrics with criteria", () => {
    expect(HEALTHCARE_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = HEALTHCARE_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
    expect(rubric.passingScore).toBeGreaterThan(0);
  });

  it("rubric has patient safety criterion", () => {
    const rubric = HEALTHCARE_PACK.evaluationRubrics[0];
    const safetyC = rubric.criteria.find((c) => c.name === "Patient Safety Impact");
    expect(safetyC).toBeDefined();
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
    expect(hipaa).toBeDefined();
    expect(hipaa!.regulation).toContain("HIPAA");
    expect(hipaa!.severity).toBe("critical");
  });

  it("has FDA device classification compliance rule", () => {
    const fda = HEALTHCARE_PACK.complianceRules.find((r) => r.id === "fda-device-class");
    expect(fda).toBeDefined();
    expect(fda!.severity).toBe("critical");
  });

  it("has a comprehensive glossary with healthcare terms", () => {
    const glossary = HEALTHCARE_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    expect(glossary["PHI"]).toBeDefined();
    expect(glossary["EHR"]).toBeDefined();
    expect(glossary["FHIR"]).toBeDefined();
    expect(glossary["SaMD"]).toBeDefined();
  });

  it("has example sessions", () => {
    expect(HEALTHCARE_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of HEALTHCARE_PACK.exampleSessions) {
      expect(session.subject).toBeDefined();
      expect(session.expectedAngles.length).toBeGreaterThan(0);
      expect(session.sampleInsights.length).toBeGreaterThan(0);
    }
  });

  it("has biomimicry subset entries", () => {
    expect(HEALTHCARE_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with tags, icon, and color", () => {
    expect(HEALTHCARE_PACK.metadata.tags.length).toBeGreaterThan(0);
    expect(HEALTHCARE_PACK.metadata.tags).toContain("healthcare");
    expect(HEALTHCARE_PACK.metadata.tags).toContain("HIPAA");
    expect(HEALTHCARE_PACK.metadata.icon).toBe("🏥");
    expect(HEALTHCARE_PACK.metadata.color).toBeDefined();
  });
});
