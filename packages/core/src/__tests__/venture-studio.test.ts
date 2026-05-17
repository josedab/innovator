import { beforeEach, describe, expect, it } from "vitest";

import {
  ComplianceDossierSchema,
  ControlPlanSchema,
  RiskClassificationSchema,
  classifyRisk,
  clearVentureStudioData,
  exportDossier,
  generateControlPlan,
  generateDossier,
  getDossier,
  listDossiers,
  simulateJurisdictionRisk,
} from "../venture-studio/index.js";

describe("venture studio", () => {
  beforeEach(() => {
    clearVentureStudioData();
  });

  it("classifies a concept with inferred categories and risk details", () => {
    const classification = classifyRisk(
      "AI lending platform",
      "A regulated fintech platform processing personal data, payments, and credit decisions."
    );

    expect(RiskClassificationSchema.parse(classification)).toEqual(classification);
    expect(classification.categories).toEqual(
      expect.arrayContaining(["regulatory", "data-privacy", "security", "financial"])
    );
    expect(["medium", "high", "critical"]).toContain(classification.overallRiskLevel);
    expect(classification.details.length).toBeGreaterThan(1);
  });

  it("generates a control plan with checkpoints for a stored classification", () => {
    const classification = classifyRisk(
      "Clinical AI assistant",
      "Healthcare workflow assistant handling medical records and patient communications.",
      ["regulatory", "data-privacy", "security"]
    );

    const plan = generateControlPlan(classification.id);

    expect(ControlPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.classificationId).toBe(classification.id);
    expect(plan.controls.length).toBeGreaterThanOrEqual(3);
    expect(plan.checkpoints).toHaveLength(3);
  });

  it("simulates jurisdiction-specific risk posture", () => {
    const classification = classifyRisk(
      "Battery recycling marketplace",
      "Cross-border platform for battery reuse, recycling, and sustainability reporting.",
      ["environmental", "regulatory"]
    );

    const analysis = simulateJurisdictionRisk(classification.id, ["eu", "us", "apac"]);

    expect(analysis).toHaveLength(3);
    expect(analysis[0]).toMatchObject({ jurisdiction: "eu" });
    expect(analysis.map((entry) => entry.riskPosture)).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
  });

  it("generates, stores, lists, and exports dossiers", () => {
    const dossier = generateDossier("Global health-data exchange", {
      conceptDescription:
        "A cross-border data platform for hospitals sharing patient data and analytics insights.",
      jurisdictions: ["us", "eu", "uk", "global"],
      format: "internal",
    });

    expect(ComplianceDossierSchema.parse(dossier)).toEqual(dossier);
    expect(getDossier(dossier.id)?.conceptTitle).toBe("Global health-data exchange");
    expect(listDossiers()).toHaveLength(1);

    const regulatorMarkdown = exportDossier(dossier.id, "regulator");
    const customerMarkdown = exportDossier(dossier.id, "customer");

    expect(regulatorMarkdown).toContain("# Regulatory Dossier");
    expect(regulatorMarkdown).toContain("## Control Plan");
    expect(customerMarkdown).toContain("# Customer Assurance Summary");
    expect(getDossier(dossier.id)?.exportFormat).toBe("customer");
  });

  it("supports custom category overrides during dossier generation", () => {
    const dossier = generateDossier("Autonomous compliance co-pilot", {
      conceptDescription: "AI assistant handling regulated workflows and evidence collection.",
      categories: ["regulatory", "security", "ip"],
    });

    expect(dossier.classification.categories).toEqual(
      expect.arrayContaining(["regulatory", "security", "ip"])
    );
  });
});
