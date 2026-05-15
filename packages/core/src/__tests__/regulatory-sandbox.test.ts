import { describe, it, expect, beforeEach } from "vitest";

import {
  listConstraintSets,
  getConstraintSet,
  createConstraintSet,
  screenIdea,
  createExperiment,
  getExperiment,
  listExperiments,
  screenIdeaInSandbox,
  revokeExperiment,
  screeningResultToMarkdown,
  clearSandboxData,
} from "../compliance/regulatory-sandbox.js";
import { clearGovernance } from "../compliance/governance.js";

beforeEach(() => {
  clearSandboxData();
  clearGovernance();
});

describe("Constraint Sets", () => {
  it("provides pre-built constraint sets", () => {
    const sets = listConstraintSets();
    expect(sets.length).toBeGreaterThanOrEqual(4);

    const hipaa = sets.find((s) => s.name.includes("HIPAA"));
    expect(hipaa).toBeDefined();
    expect(hipaa!.constraints.length).toBeGreaterThan(0);

    const gdpr = sets.find((s) => s.name.includes("GDPR"));
    expect(gdpr).toBeDefined();

    const sox = sets.find((s) => s.name.includes("SOX"));
    expect(sox).toBeDefined();
  });

  it("retrieves a specific constraint set", () => {
    const sets = listConstraintSets();
    const set = getConstraintSet(sets[0].id);
    expect(set).toBeDefined();
    expect(set!.constraints.length).toBeGreaterThan(0);
  });

  it("creates custom constraint set", () => {
    const custom = createConstraintSet({
      name: "Custom AI Ethics",
      description: "AI-specific ethical constraints",
      regulations: ["AI-ACT"],
      constraints: [
        {
          id: "ai-transparency",
          name: "AI Transparency",
          description: "AI systems must be explainable",
          category: "ai_ethics",
          regulation: "AI-ACT",
          severity: "mandatory",
          keywords: ["ai", "machine learning", "automated decision"],
          exemptions: [],
        },
      ],
      categories: ["ai_ethics"],
    });

    expect(custom.id).toBeDefined();
    expect(custom.name).toBe("Custom AI Ethics");
    expect(getConstraintSet(custom.id)).toBeDefined();
  });
});

describe("Compliance Screening", () => {
  it("screens an idea against HIPAA constraints", () => {
    const sets = listConstraintSets();
    const hipaaSet = sets.find((s) => s.name.includes("HIPAA"));

    const result = screenIdea(
      "Patient Data Analytics Dashboard",
      "Build a dashboard that displays patient data and medical records for doctors to analyze treatment outcomes",
      hipaaSet!.id
    );

    expect(result.status).not.toBe("clear");
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.overallRiskScore).toBeGreaterThan(0);
    // Should find patient data / medical record keywords
    const phiViolation = result.violations.find((v) => v.constraintId === "hipaa-phi");
    expect(phiViolation).toBeDefined();
  });

  it("clears an idea that doesn't trigger constraints", () => {
    const sets = listConstraintSets();
    const hipaaSet = sets.find((s) => s.name.includes("HIPAA"));

    const result = screenIdea(
      "Office Desk Organization Tool",
      "A simple tool for organizing office desk layouts and furniture arrangements",
      hipaaSet!.id
    );

    expect(result.violations).toHaveLength(0);
    expect(result.status).toBe("clear");
    expect(result.overallRiskScore).toBe(0);
  });

  it("screens against GDPR constraints", () => {
    const sets = listConstraintSets();
    const gdprSet = sets.find((s) => s.name.includes("GDPR"));

    const result = screenIdea(
      "User Profiling Engine",
      "Build a profiling system that processes personal data for automated decision making about users, with cross-border data transfer to US cloud servers",
      gdprSet!.id
    );

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.status).not.toBe("clear");
  });

  it("includes regulatory checks in screening", () => {
    const sets = listConstraintSets();
    const fullSet = sets.find((s) => s.name.includes("Full Enterprise"));

    const result = screenIdea(
      "Financial Reporting AI",
      "An AI system for automated financial reporting and disclosure with audit trail",
      fullSet!.id
    );

    expect(result.regulatoryChecks.length).toBeGreaterThan(0);
  });
});

describe("Sandbox Experiments", () => {
  it("creates a sandbox experiment", () => {
    const sets = listConstraintSets();
    const experiment = createExperiment({
      title: "PHI Research Pilot",
      description: "Test de-identified patient data in innovation pipeline",
      constraintSetId: sets[0].id,
      exemptConstraints: ["hipaa-phi"],
      justification: "Using only de-identified data for research purposes",
      approvedBy: "Chief Compliance Officer",
    });

    expect(experiment.id).toBeDefined();
    expect(experiment.status).toBe("active");
    expect(experiment.exemptConstraints).toContain("hipaa-phi");

    const retrieved = getExperiment(experiment.id);
    expect(retrieved).toBeDefined();
  });

  it("screens ideas with experiment exemptions", () => {
    const sets = listConstraintSets();
    const hipaaSet = sets.find((s) => s.name.includes("HIPAA"));

    const experiment = createExperiment({
      title: "PHI Exempt Pilot",
      description: "Testing with exempted PHI constraints",
      constraintSetId: hipaaSet!.id,
      exemptConstraints: ["hipaa-phi"],
      justification: "De-identified data only",
    });

    const resultWithExemption = screenIdeaInSandbox(
      experiment.id,
      "Patient Analytics",
      "Analyze patient data patterns"
    );

    // PHI constraint should be skipped due to exemption
    const phiViolation = resultWithExemption.violations.find((v) => v.constraintId === "hipaa-phi");
    expect(phiViolation).toBeUndefined();
  });

  it("revokes an experiment", () => {
    const sets = listConstraintSets();
    const experiment = createExperiment({
      title: "Test Experiment",
      description: "D",
      constraintSetId: sets[0].id,
      exemptConstraints: [],
      justification: "Testing",
    });

    expect(revokeExperiment(experiment.id, "Security concern")).toBe(true);
    expect(getExperiment(experiment.id)?.status).toBe("revoked");
    expect(revokeExperiment("nonexistent", "reason")).toBe(false);
  });

  it("rejects screening in revoked experiment", () => {
    const sets = listConstraintSets();
    const experiment = createExperiment({
      title: "Revoked Exp",
      description: "D",
      constraintSetId: sets[0].id,
      exemptConstraints: [],
      justification: "Testing",
    });
    revokeExperiment(experiment.id, "Done");

    expect(() => screenIdeaInSandbox(experiment.id, "Test", "Description")).toThrow("not active");
  });

  it("lists experiments with filtering", () => {
    const sets = listConstraintSets();
    createExperiment({
      title: "Active 1",
      description: "D",
      constraintSetId: sets[0].id,
      exemptConstraints: [],
      justification: "J",
    });
    const exp2 = createExperiment({
      title: "To Revoke",
      description: "D",
      constraintSetId: sets[0].id,
      exemptConstraints: [],
      justification: "J",
    });
    revokeExperiment(exp2.id, "done");

    const active = listExperiments({ status: "active" });
    expect(active).toHaveLength(1);
    expect(active[0].title).toBe("Active 1");
  });
});

describe("screeningResultToMarkdown", () => {
  it("generates formatted markdown", () => {
    const sets = listConstraintSets();
    const hipaaSet = sets.find((s) => s.name.includes("HIPAA"));

    const result = screenIdea(
      "Health Data Platform",
      "Platform for managing patient data and medical records",
      hipaaSet!.id
    );

    const md = screeningResultToMarkdown(result);
    expect(md).toContain("# Compliance Screening");
    expect(md).toContain("Risk Score");
    expect(md).toContain("Violations");
  });
});
