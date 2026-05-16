/**
 * @module regulatory-screen
 *
 * Regulatory & Compliance Pre-Screen — screens ideas against regulatory
 * databases (GDPR, HIPAA, SOX, PCI-DSS, FDA, FCC) before the gauntlet
 * phase, flagging compliance risks with specific clause references and
 * mitigation suggestions.
 */

import { z } from "zod";

// ---- Regulatory Framework ----

export const RegulatoryFrameworkSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  /** Short code (e.g., GDPR, HIPAA). */
  shortCode: z.string().max(50),
  /** Jurisdiction. */
  jurisdiction: z.string().max(200),
  /** Applicable industries/domains. */
  applicableDomains: z.array(z.string().max(200)).max(20),
  /** Key provisions. */
  provisions: z
    .array(
      z.object({
        id: z.string().max(100),
        clause: z.string().max(200),
        title: z.string().max(500),
        summary: z.string().max(2000),
        riskAreas: z.array(z.string().max(200)).max(10),
      })
    )
    .max(100),
  /** Penalty range. */
  penaltyRange: z.string().max(500).optional(),
  /** Last updated. */
  lastUpdated: z.string(),
});

export type RegulatoryFramework = z.infer<typeof RegulatoryFrameworkSchema>;

// ---- Regulatory Risk ----

export const RiskLevelSchema = z.enum(["none", "low", "medium", "high", "critical"]);

export const RegulatoryRiskSchema = z.object({
  frameworkId: z.string().max(100),
  frameworkName: z.string().max(300),
  clause: z.string().max(200),
  clauseTitle: z.string().max(500),
  riskLevel: RiskLevelSchema,
  /** Description of the specific compliance risk. */
  description: z.string().max(3000),
  /** Mitigation suggestions. */
  mitigations: z.array(z.string().max(1000)).max(10),
  /** Estimated compliance effort. */
  complianceEffort: z.enum(["minimal", "moderate", "significant", "extensive"]),
});

export type RegulatoryRisk = z.infer<typeof RegulatoryRiskSchema>;

// ---- Screening Result ----

export const ScreeningResultSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000).optional(),
  /** Overall risk level. */
  overallRisk: RiskLevelSchema,
  /** Individual regulatory risks. */
  risks: z.array(RegulatoryRiskSchema).max(50),
  /** Whether the idea can proceed to gauntlet. */
  clearance: z.enum(["cleared", "conditional", "blocked"]),
  /** Conditions for proceeding (if conditional). */
  conditions: z.array(z.string().max(1000)).max(20),
  /** Summary. */
  summary: z.string().max(5000),
  screenedAt: z.string(),
});

export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;

// ---- Screening Report (Batch) ----

export const ScreeningReportSchema = z.object({
  id: z.string().max(200),
  results: z.array(ScreeningResultSchema).max(100),
  /** Aggregate stats. */
  totalScreened: z.number().int().min(0),
  cleared: z.number().int().min(0),
  conditional: z.number().int().min(0),
  blocked: z.number().int().min(0),
  /** Most common regulatory frameworks triggered. */
  topFrameworks: z
    .array(
      z.object({
        frameworkId: z.string().max(100),
        frameworkName: z.string().max(300),
        hitCount: z.number().int().min(0),
      })
    )
    .max(20),
  generatedAt: z.string(),
});

export type ScreeningReport = z.infer<typeof ScreeningReportSchema>;

// ---- Config ----

export interface RegulatoryScreenConfig {
  /** Frameworks to screen against (default: all). */
  frameworkIds?: string[];
  /** Domains relevant to the idea. */
  domains?: string[];
  /** LLM model. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
}
