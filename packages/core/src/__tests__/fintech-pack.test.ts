import { describe, it, expect } from "vitest";
import { FINTECH_PACK } from "../verticals/fintech-pack.js";

describe("FINTECH_PACK", () => {
  it("has required top-level fields", () => {
    expect(FINTECH_PACK).toMatchObject({
      id: "fintech",
      name: "Financial Technology",
      version: "1.0.0",
      author: "Innovator Core Team",
    });
    expect(FINTECH_PACK.description.length).toBeGreaterThan(10);
  });

  it("has domain angles with valid structure", () => {
    expect(FINTECH_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of FINTECH_PACK.domainAngles) {
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

  it("includes regulatory-compliance domain angle", () => {
    const rc = FINTECH_PACK.domainAngles.find((a) => a.id === "regulatory-compliance");
    expect(rc).toMatchObject({ id: "regulatory-compliance", name: "Regulatory Compliance" });
  });

  it("includes financial-inclusion domain angle", () => {
    const fi = FINTECH_PACK.domainAngles.find((a) => a.id === "financial-inclusion");
    expect(fi).toMatchObject({ id: "financial-inclusion" });
  });

  it("includes fraud-prevention domain angle", () => {
    const fp = FINTECH_PACK.domainAngles.find((a) => a.id === "fraud-prevention");
    expect(fp).toMatchObject({ id: "fraud-prevention" });
  });

  it("has evaluation rubrics with criteria", () => {
    expect(FINTECH_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = FINTECH_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
    for (const criterion of rubric.criteria) {
      expect(criterion).toMatchObject({
        name: expect.any(String),
        weight: expect.any(Number),
      });
    }
  });

  it("rubric criteria weights sum to approximately 1.0", () => {
    const rubric = FINTECH_PACK.evaluationRubrics[0];
    const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("has compliance rules including KYC/AML", () => {
    const kyc = FINTECH_PACK.complianceRules.find((r) => r.id === "kyc-aml");
    expect(kyc).toMatchObject({ id: "kyc-aml", severity: "critical" });
    expect(kyc!.regulation).toContain("BSA");
  });

  it("has PCI DSS compliance rule", () => {
    const pci = FINTECH_PACK.complianceRules.find((r) => r.id === "pci-dss");
    expect(pci).toMatchObject({ id: "pci-dss", severity: "critical" });
  });

  it("has a comprehensive glossary with fintech terms", () => {
    const glossary = FINTECH_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    for (const term of ["KYC", "AML", "DeFi", "BaaS"]) {
      expect(glossary[term]).toEqual(expect.any(String));
      expect(glossary[term].length).toBeGreaterThan(0);
    }
  });

  it("has example sessions with expected angles", () => {
    expect(FINTECH_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of FINTECH_PACK.exampleSessions) {
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
    expect(FINTECH_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with KYC and AML tags", () => {
    expect(FINTECH_PACK.metadata).toMatchObject({ icon: "💰" });
    expect(FINTECH_PACK.metadata.tags).toContain("KYC");
    expect(FINTECH_PACK.metadata.tags).toContain("AML");
  });

  it("all domain angle IDs are unique", () => {
    const ids = FINTECH_PACK.domainAngles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
