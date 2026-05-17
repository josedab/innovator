import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFederationExchangeData,
  createPlaybook,
  detectAnomalies,
  extractAnonymizedBundle,
  getAuditLog,
  getPatternBundle,
  getPlaybook,
  getPrivacyBudget,
  hasPrivacyBudget,
  initializePrivacyBudget,
  licensePlaybook,
  listPatternBundles,
  listPlaybooks,
  logAuditEntry,
  resetPrivacyBudget,
  spendPrivacyBudget,
} from "../federation/privacy-exchange.js";

describe("federation/privacy-exchange", () => {
  beforeEach(() => {
    clearFederationExchangeData();
  });

  it("initializes, spends, checks, and resets privacy budgets", () => {
    const budget = initializePrivacyBudget("org-1", 2);
    expect(budget.totalBudget).toBe(2);
    expect(hasPrivacyBudget("org-1", 1.5)).toBe(true);

    const spent = spendPrivacyBudget("org-1", "benchmark-query", 0.5);
    expect(spent?.usedBudget).toBe(0.5);
    expect(spent?.queries).toHaveLength(1);
    expect(getPrivacyBudget("org-1")?.usedBudget).toBe(0.5);
    expect(hasPrivacyBudget("org-1", 1.6)).toBe(false);

    const reset = resetPrivacyBudget("org-1");
    expect(reset?.usedBudget).toBe(0);
    expect(reset?.queries).toEqual([]);
  });

  it("extracts and lists anonymized pattern bundles", () => {
    const bundle = extractAnonymizedBundle(
      "org-1",
      "healthcare",
      [
        { name: "rapid experimentation", frequency: 10 },
        { name: "cross-functional ritual", frequency: 6 },
      ],
      0.2
    );

    expect(bundle.noiseLevel).toBe(0.2);
    expect(bundle.patterns[0]?.anonymizedSource).toBe("anon-source-1");
    expect(getPatternBundle(bundle.id)).toEqual(bundle);
    expect(listPatternBundles("healthcare")).toEqual([bundle]);
  });

  it("creates, licenses, and lists playbooks", () => {
    const playbook = createPlaybook({
      title: "Outcome Discovery",
      description: "A repeatable discovery motion",
      domain: "saas",
      angles: ["scamper", "first-principles"],
      methodology: "Interview customers, map pain, prototype weekly.",
      price: 499,
      creatorOrgId: "org-creator",
    });

    const licensed = licensePlaybook(playbook.id, "org-buyer");
    expect(licensed?.licensedTo).toContain("org-buyer");
    expect(getPlaybook(playbook.id)?.licensedTo).toContain("org-buyer");
    expect(listPlaybooks("saas")).toEqual([expect.objectContaining({ id: playbook.id })]);
  });

  it("detects anomalies based on budget pressure and query volume", () => {
    initializePrivacyBudget("org-1", 1);
    for (let i = 0; i < 20; i += 1) {
      spendPrivacyBudget("org-1", `query-${i}`, 0.045);
    }

    const anomalies = detectAnomalies("org-1");
    expect(anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "privacy-budget" }),
        expect.objectContaining({ type: "query-volume" }),
      ])
    );
  });

  it("records and filters audit entries", () => {
    logAuditEntry("org-1", "import-bundle", "Imported a sector benchmark");
    logAuditEntry("org-2", "export-bundle", "Exported anonymized patterns", 0.2);

    expect(getAuditLog()).toHaveLength(2);
    expect(getAuditLog("org-1")).toEqual([
      expect.objectContaining({ organizationId: "org-1", action: "import-bundle" }),
    ]);
  });
});
