import { z } from "zod";

export const RiskCategorySchema = z.enum([
  "regulatory",
  "data-privacy",
  "security",
  "financial",
  "ip",
  "environmental",
]);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

export const JurisdictionSchema = z.enum(["us", "eu", "uk", "apac", "global"]);
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

export const RiskClassificationSchema = z.object({
  id: z.string(),
  conceptId: z.string(),
  conceptTitle: z.string().max(500),
  categories: z.array(RiskCategorySchema),
  overallRiskLevel: z.enum(["low", "medium", "high", "critical"]),
  jurisdictions: z.array(JurisdictionSchema),
  details: z
    .array(
      z.object({
        category: RiskCategorySchema,
        riskLevel: z.enum(["low", "medium", "high", "critical"]),
        description: z.string().max(1000),
        regulations: z.array(z.string().max(200)).max(10),
      })
    )
    .max(20),
  classifiedAt: z.string(),
});
export type RiskClassification = z.infer<typeof RiskClassificationSchema>;

export const ControlPlanSchema = z.object({
  id: z.string(),
  classificationId: z.string(),
  controls: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(500),
        description: z.string().max(1000),
        type: z.enum(["automated", "manual", "review"]),
        frequency: z.enum(["once", "daily", "weekly", "monthly", "quarterly"]),
        responsible: z.string().max(200),
        status: z.enum(["pending", "in-progress", "complete"]),
      })
    )
    .max(30),
  checkpoints: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(500),
        stage: z.string().max(200),
        requiredApprovals: z.number().min(1).max(10),
        currentApprovals: z.number().min(0),
      })
    )
    .max(10),
  createdAt: z.string(),
});
export type ControlPlan = z.infer<typeof ControlPlanSchema>;

export const ComplianceDossierSchema = z.object({
  id: z.string(),
  conceptTitle: z.string().max(500),
  classification: RiskClassificationSchema,
  controlPlan: ControlPlanSchema,
  jurisdictionAnalysis: z
    .array(
      z.object({
        jurisdiction: JurisdictionSchema,
        riskPosture: z.enum(["favorable", "neutral", "challenging", "prohibitive"]),
        keyRegulations: z.array(z.string().max(200)).max(10),
        notes: z.string().max(1000),
      })
    )
    .max(10),
  generatedAt: z.string(),
  exportFormat: z.enum(["internal", "regulator", "customer"]).optional(),
});
export type ComplianceDossier = z.infer<typeof ComplianceDossierSchema>;
