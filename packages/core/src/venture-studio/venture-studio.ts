import { randomUUID } from "node:crypto";

import {
  ComplianceDossierSchema,
  ControlPlanSchema,
  JurisdictionSchema,
  RiskCategorySchema,
  RiskClassificationSchema,
  type ComplianceDossier,
  type ControlPlan,
  type Jurisdiction,
  type RiskCategory,
  type RiskClassification,
} from "./types.js";

export interface GenerateDossierOptions {
  conceptDescription?: string;
  categories?: RiskCategory[];
  jurisdictions?: Jurisdiction[];
  format?: "internal" | "regulator" | "customer";
}

const classifications = new Map<string, RiskClassification>();
const controlPlans = new Map<string, ControlPlan>();
const dossiers = new Map<string, ComplianceDossier>();

const RISK_LEVEL_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const;

const CATEGORY_KEYWORDS: Record<RiskCategory, string[]> = {
  regulatory: [
    "regulated",
    "compliance",
    "bank",
    "banking",
    "lending",
    "loan",
    "insurance",
    "healthcare",
    "medical",
    "crypto",
    "exchange",
  ],
  "data-privacy": [
    "pii",
    "personal data",
    "customer data",
    "tracking",
    "surveillance",
    "biometric",
    "health data",
    "consent",
  ],
  security: [
    "security",
    "authentication",
    "identity",
    "payment",
    "payments",
    "api",
    "cloud",
    "cyber",
    "sso",
  ],
  financial: [
    "billing",
    "payment",
    "payments",
    "pricing",
    "credit",
    "investment",
    "marketplace",
    "revenue",
  ],
  ip: [
    "patent",
    "license",
    "copyright",
    "proprietary",
    "model weights",
    "training data",
    "dataset",
  ],
  environmental: [
    "battery",
    "energy",
    "emission",
    "climate",
    "carbon",
    "waste",
    "recycling",
    "sustainability",
  ],
};

const CATEGORY_REGULATIONS: Record<RiskCategory, string[]> = {
  regulatory: ["SOX", "SEC disclosure", "AML/KYC", "FDA guidance", "MiCA"],
  "data-privacy": ["GDPR", "CCPA", "UK GDPR", "DPDP", "ePrivacy"],
  security: ["ISO 27001", "SOC 2", "NIS2", "PCI DSS"],
  financial: ["Consumer duty", "Basel guidance", "Revenue recognition"],
  ip: ["Copyright review", "Open-source license policy", "Patent screening"],
  environmental: ["CSRD", "SEC climate disclosure", "WEEE", "RoHS"],
};

const CATEGORY_CONTROLS: Record<
  RiskCategory,
  Array<{
    title: string;
    description: string;
    type: "automated" | "manual" | "review";
    frequency: "once" | "daily" | "weekly" | "monthly" | "quarterly";
    responsible: string;
  }>
> = {
  regulatory: [
    {
      title: "Regulatory requirement inventory",
      description: "Document licensing, reporting, and approval obligations before launch.",
      type: "review",
      frequency: "once",
      responsible: "Compliance lead",
    },
    {
      title: "Quarterly policy attestation",
      description: "Review live controls against the applicable regulatory perimeter.",
      type: "manual",
      frequency: "quarterly",
      responsible: "Risk committee",
    },
  ],
  "data-privacy": [
    {
      title: "Data minimization checks",
      description: "Verify only required personal data fields are collected and retained.",
      type: "automated",
      frequency: "weekly",
      responsible: "Privacy engineering",
    },
    {
      title: "Data protection impact assessment",
      description: "Complete a documented DPIA before external rollout.",
      type: "review",
      frequency: "once",
      responsible: "Privacy counsel",
    },
  ],
  security: [
    {
      title: "Threat model review",
      description: "Assess attack surface, privileged paths, and critical dependencies.",
      type: "review",
      frequency: "once",
      responsible: "Security architect",
    },
    {
      title: "Control monitoring",
      description: "Track authentication, access, and encryption guardrails in production.",
      type: "automated",
      frequency: "daily",
      responsible: "Security operations",
    },
  ],
  financial: [
    {
      title: "Revenue and exposure review",
      description: "Validate pricing, settlement, and financial exposure assumptions.",
      type: "manual",
      frequency: "monthly",
      responsible: "Finance partner",
    },
  ],
  ip: [
    {
      title: "IP provenance verification",
      description: "Confirm ownership, licensing, and third-party usage constraints.",
      type: "review",
      frequency: "once",
      responsible: "Legal counsel",
    },
  ],
  environmental: [
    {
      title: "Environmental claims substantiation",
      description: "Review sustainability claims against measurable operating data.",
      type: "manual",
      frequency: "quarterly",
      responsible: "Sustainability lead",
    },
  ],
};

const JURISDICTION_NOTES: Record<Jurisdiction, string> = {
  us: "U.S. market access is feasible with clear disclosures, vendor diligence, and state-level review where applicable.",
  eu: "EU operation demands tighter privacy, security, and product governance evidence before launch.",
  uk: "UK launch requires governance clarity and consumer-risk controls, but approvals are typically manageable.",
  apac: "APAC posture depends on local rollout sequencing; cross-border data and financial rules vary by market.",
  global:
    "A global rollout needs the strictest common denominator controls and evidence reuse across regions.",
};

function highestRiskLevel(
  levels: Array<keyof typeof RISK_LEVEL_ORDER>
): keyof typeof RISK_LEVEL_ORDER {
  return levels.reduce(
    (highest, level) => (RISK_LEVEL_ORDER[level] > RISK_LEVEL_ORDER[highest] ? level : highest),
    "low" as keyof typeof RISK_LEVEL_ORDER
  );
}

function inferCategories(text: string): RiskCategory[] {
  const normalized = text.toLowerCase();
  const matches = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([category]) => RiskCategorySchema.parse(category));

  return matches.length > 0 ? Array.from(new Set(matches)) : ["regulatory"];
}

function riskLevelForCategory(category: RiskCategory, text: string): keyof typeof RISK_LEVEL_ORDER {
  const normalized = text.toLowerCase();
  const keywordHits = CATEGORY_KEYWORDS[category].filter((keyword) =>
    normalized.includes(keyword)
  ).length;
  const score = keywordHits + (text.length > 400 ? 1 : 0);

  if (score >= 4) return "critical";
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return category === "regulatory" ? "medium" : "low";
}

function defaultJurisdictions(categories: RiskCategory[]): Jurisdiction[] {
  const jurisdictions = new Set<Jurisdiction>(["global"]);

  if (categories.includes("data-privacy") || categories.includes("security")) {
    jurisdictions.add("us");
    jurisdictions.add("eu");
    jurisdictions.add("uk");
  }

  if (categories.includes("financial") || categories.includes("regulatory")) {
    jurisdictions.add("us");
    jurisdictions.add("uk");
  }

  if (categories.includes("environmental")) {
    jurisdictions.add("eu");
    jurisdictions.add("apac");
  }

  return Array.from(jurisdictions);
}

function uniqueRegulations(
  category: RiskCategory,
  riskLevel: keyof typeof RISK_LEVEL_ORDER
): string[] {
  const base = CATEGORY_REGULATIONS[category];
  const extra =
    riskLevel === "critical"
      ? base.slice(0, 4)
      : riskLevel === "high"
        ? base.slice(0, 3)
        : base.slice(0, 2);
  return Array.from(new Set(extra)).slice(0, 10);
}

function requireClassification(classificationId: string): RiskClassification {
  const classification = classifications.get(classificationId);
  if (!classification) {
    throw new Error(`Risk classification not found: ${classificationId}`);
  }
  return classification;
}

function updateStoredDossiers(classificationId: string, controlPlan: ControlPlan): void {
  for (const dossier of dossiers.values()) {
    if (dossier.classification.id === classificationId) {
      const updated = ComplianceDossierSchema.parse({
        ...dossier,
        controlPlan,
      });
      dossiers.set(updated.id, updated);
    }
  }
}

export function classifyRisk(
  conceptTitle: string,
  conceptDescription: string,
  categories?: RiskCategory[]
): RiskClassification {
  const title = conceptTitle.trim();
  const description = conceptDescription.trim();
  const combined = `${title} ${description}`.trim();
  const selectedCategories = Array.from(
    new Set(
      (categories?.length ? categories : inferCategories(combined)).map((category) =>
        RiskCategorySchema.parse(category)
      )
    )
  );
  const details = selectedCategories.map((category) => {
    const riskLevel = riskLevelForCategory(category, combined);
    return {
      category,
      riskLevel,
      description: `${category.replace(/-/g, " ")} exposure for ${title} requires documented controls and monitoring.`,
      regulations: uniqueRegulations(category, riskLevel),
    };
  });

  const classification = RiskClassificationSchema.parse({
    id: randomUUID(),
    conceptId: randomUUID(),
    conceptTitle: title,
    categories: selectedCategories,
    overallRiskLevel: highestRiskLevel(details.map((detail) => detail.riskLevel)),
    jurisdictions: defaultJurisdictions(selectedCategories),
    details,
    classifiedAt: new Date().toISOString(),
  });

  classifications.set(classification.id, classification);
  return classification;
}

export function generateControlPlan(classificationId: string): ControlPlan {
  const classification = requireClassification(classificationId);
  const controls = classification.details.flatMap((detail) =>
    CATEGORY_CONTROLS[detail.category].map((control) => ({
      id: randomUUID(),
      title: `${detail.category.replace(/-/g, " ")} — ${control.title}`,
      description: control.description,
      type: control.type,
      frequency: control.frequency,
      responsible: control.responsible,
      status: "pending" as const,
    }))
  );

  const checkpoints = [
    {
      id: randomUUID(),
      title: "Initial compliance triage",
      stage: "intake",
      requiredApprovals: 1,
      currentApprovals: 0,
    },
    {
      id: randomUUID(),
      title: "Pre-launch control validation",
      stage: "pre-launch",
      requiredApprovals: classification.overallRiskLevel === "critical" ? 3 : 2,
      currentApprovals: 0,
    },
    {
      id: randomUUID(),
      title: "Post-launch governance review",
      stage: "post-launch",
      requiredApprovals: 2,
      currentApprovals: 0,
    },
  ];

  const controlPlan = ControlPlanSchema.parse({
    id: randomUUID(),
    classificationId,
    controls: controls.slice(0, 30),
    checkpoints,
    createdAt: new Date().toISOString(),
  });

  controlPlans.set(controlPlan.id, controlPlan);
  updateStoredDossiers(classificationId, controlPlan);
  return controlPlan;
}

export function simulateJurisdictionRisk(
  classificationId: string,
  jurisdictions: Jurisdiction[]
): ComplianceDossier["jurisdictionAnalysis"] {
  const classification = requireClassification(classificationId);
  const selectedJurisdictions = Array.from(
    new Set(
      (jurisdictions.length > 0 ? jurisdictions : classification.jurisdictions).map(
        (jurisdiction) => JurisdictionSchema.parse(jurisdiction)
      )
    )
  );

  return selectedJurisdictions.map((jurisdiction) => {
    const strictness = jurisdiction === "eu" || jurisdiction === "global" ? 1 : 0;
    const score = RISK_LEVEL_ORDER[classification.overallRiskLevel] + strictness;
    const riskPosture =
      score >= 4
        ? "prohibitive"
        : score >= 3
          ? "challenging"
          : score >= 2
            ? "neutral"
            : "favorable";
    const keyRegulations = Array.from(
      new Set(classification.details.flatMap((detail) => detail.regulations))
    ).slice(0, 10);

    return {
      jurisdiction,
      riskPosture,
      keyRegulations,
      notes: JURISDICTION_NOTES[jurisdiction],
    };
  });
}

export function generateDossier(
  conceptTitle: string,
  opts: GenerateDossierOptions = {}
): ComplianceDossier {
  const classification = classifyRisk(
    conceptTitle,
    opts.conceptDescription ?? conceptTitle,
    opts.categories
  );
  const controlPlan = generateControlPlan(classification.id);
  const jurisdictionAnalysis = simulateJurisdictionRisk(
    classification.id,
    opts.jurisdictions ?? classification.jurisdictions
  );

  const dossier = ComplianceDossierSchema.parse({
    id: randomUUID(),
    conceptTitle: classification.conceptTitle,
    classification,
    controlPlan,
    jurisdictionAnalysis,
    generatedAt: new Date().toISOString(),
    exportFormat: opts.format,
  });

  dossiers.set(dossier.id, dossier);
  return dossier;
}

export function exportDossier(
  dossierId: string,
  format: "internal" | "regulator" | "customer"
): string | undefined {
  const dossier = dossiers.get(dossierId);
  if (!dossier) return undefined;

  const updated = ComplianceDossierSchema.parse({
    ...dossier,
    exportFormat: format,
  });
  dossiers.set(dossierId, updated);

  const summaryLine = `Overall risk: ${updated.classification.overallRiskLevel.toUpperCase()} across ${updated.classification.categories.join(", ")}.`;
  const controls = updated.controlPlan.controls
    .map(
      (control) =>
        `- ${control.title} (${control.type}, ${control.frequency}) — ${control.responsible}`
    )
    .join("\n");
  const jurisdictions = updated.jurisdictionAnalysis
    .map(
      (analysis) =>
        `- ${analysis.jurisdiction.toUpperCase()}: ${analysis.riskPosture} — ${analysis.notes}`
    )
    .join("\n");

  if (format === "regulator") {
    return [
      `# Regulatory Dossier: ${updated.conceptTitle}`,
      "",
      "## Classification Overview",
      summaryLine,
      "",
      "## Detailed Risk Evidence",
      ...updated.classification.details.map(
        (detail) =>
          `- ${detail.category}: ${detail.riskLevel} (${detail.regulations.join(", ")}) — ${detail.description}`
      ),
      "",
      "## Control Plan",
      controls,
      "",
      "## Jurisdictional Analysis",
      jurisdictions,
    ].join("\n");
  }

  if (format === "customer") {
    return [
      `# Customer Assurance Summary: ${updated.conceptTitle}`,
      "",
      "## Trust Posture",
      summaryLine,
      "",
      "## Key Controls",
      controls,
      "",
      "## Regional Availability Considerations",
      jurisdictions,
    ].join("\n");
  }

  return [
    `# Internal Compliance Dossier: ${updated.conceptTitle}`,
    "",
    "## Executive Summary",
    summaryLine,
    "",
    "## Category Breakdown",
    ...updated.classification.details.map(
      (detail) =>
        `- ${detail.category}: ${detail.riskLevel} — ${detail.description} (regs: ${detail.regulations.join(", ")})`
    ),
    "",
    "## Control Backlog",
    controls,
    "",
    "## Approval Checkpoints",
    ...updated.controlPlan.checkpoints.map(
      (checkpoint) =>
        `- ${checkpoint.title} [${checkpoint.stage}] approvals ${checkpoint.currentApprovals}/${checkpoint.requiredApprovals}`
    ),
    "",
    "## Jurisdiction Simulation",
    jurisdictions,
  ].join("\n");
}

export function getDossier(id: string): ComplianceDossier | undefined {
  return dossiers.get(id);
}

export function listDossiers(): ComplianceDossier[] {
  return Array.from(dossiers.values()).sort((left, right) =>
    right.generatedAt.localeCompare(left.generatedAt)
  );
}

export function clearVentureStudioData(): void {
  classifications.clear();
  controlPlans.clear();
  dossiers.clear();
}
