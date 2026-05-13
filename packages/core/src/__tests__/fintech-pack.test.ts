import { describe, it, expect } from "vitest";
import { FINTECH_PACK } from "../verticals/fintech-pack.js";

describe("FINTECH_PACK", () => {
  it("has required top-level fields", () => {
    expect(FINTECH_PACK.id).toBe("fintech");
    expect(FINTECH_PACK.name).toBe("Financial Technology");
    expect(FINTECH_PACK.version).toBeDefined();
    expect(FINTECH_PACK.description).toBeDefined();
    expect(FINTECH_PACK.author).toBeDefined();
  });

  it("has domain angles with valid structure", () => {
    expect(FINTECH_PACK.domainAngles.length).toBeGreaterThan(0);
    for (const angle of FINTECH_PACK.domainAngles) {
      expect(angle.id).toBeDefined();
      expect(angle.name).toBeDefined();
      expect(angle.description.length).toBeGreaterThan(0);
      expect(angle.promptContext.length).toBeGreaterThan(0);
    }
  });

  it("includes regulatory-compliance domain angle", () => {
    const rc = FINTECH_PACK.domainAngles.find((a) => a.id === "regulatory-compliance");
    expect(rc).toBeDefined();
    expect(rc!.name).toBe("Regulatory Compliance");
  });

  it("includes financial-inclusion domain angle", () => {
    const fi = FINTECH_PACK.domainAngles.find((a) => a.id === "financial-inclusion");
    expect(fi).toBeDefined();
  });

  it("includes fraud-prevention domain angle", () => {
    const fp = FINTECH_PACK.domainAngles.find((a) => a.id === "fraud-prevention");
    expect(fp).toBeDefined();
  });

  it("has evaluation rubrics with criteria", () => {
    expect(FINTECH_PACK.evaluationRubrics.length).toBeGreaterThan(0);
    const rubric = FINTECH_PACK.evaluationRubrics[0];
    expect(rubric.criteria.length).toBeGreaterThan(0);
  });

  it("rubric criteria weights sum to approximately 1.0", () => {
    const rubric = FINTECH_PACK.evaluationRubrics[0];
    const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("has compliance rules including KYC/AML", () => {
    const kyc = FINTECH_PACK.complianceRules.find((r) => r.id === "kyc-aml");
    expect(kyc).toBeDefined();
    expect(kyc!.severity).toBe("critical");
    expect(kyc!.regulation).toContain("BSA");
  });

  it("has PCI DSS compliance rule", () => {
    const pci = FINTECH_PACK.complianceRules.find((r) => r.id === "pci-dss");
    expect(pci).toBeDefined();
    expect(pci!.severity).toBe("critical");
  });

  it("has a comprehensive glossary with fintech terms", () => {
    const glossary = FINTECH_PACK.glossary;
    expect(Object.keys(glossary).length).toBeGreaterThan(10);
    expect(glossary["KYC"]).toBeDefined();
    expect(glossary["AML"]).toBeDefined();
    expect(glossary["DeFi"]).toBeDefined();
    expect(glossary["BaaS"]).toBeDefined();
  });

  it("has example sessions with expected angles", () => {
    expect(FINTECH_PACK.exampleSessions.length).toBeGreaterThan(0);
    for (const session of FINTECH_PACK.exampleSessions) {
      expect(session.subject).toBeDefined();
      expect(session.expectedAngles.length).toBeGreaterThan(0);
      expect(session.sampleInsights.length).toBeGreaterThan(0);
    }
  });

  it("has biomimicry subset entries", () => {
    expect(FINTECH_PACK.biomimicrySubset.length).toBeGreaterThan(0);
  });

  it("has metadata with KYC and AML tags", () => {
    expect(FINTECH_PACK.metadata.tags).toContain("KYC");
    expect(FINTECH_PACK.metadata.tags).toContain("AML");
    expect(FINTECH_PACK.metadata.icon).toBe("💰");
  });
});
