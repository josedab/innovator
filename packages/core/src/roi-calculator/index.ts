/**
 * @module roi-calculator
 *
 * Innovation ROI Calculator & Business Case Generator — NPV/IRR calculators,
 * resource allocation models, risk adjustment matrices, LLM-powered
 * executive-ready documents, and portfolio-level ROI aggregation.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { ValidationError } from "../errors.js";

// ---- Zod Schemas ----

/** Cash flow entry for NPV/IRR calculations. */
export const CashFlowSchema = z.object({
  period: z.number().int().min(0),
  amount: z.number(),
  label: z.string().max(200).optional(),
});
export type CashFlow = z.infer<typeof CashFlowSchema>;

/** Resource allocation entry. */
export const ResourceAllocationSchema = z.object({
  category: z.enum(["engineering", "design", "marketing", "operations", "infrastructure", "other"]),
  headcount: z.number().min(0),
  costPerPeriod: z.number().min(0),
  periods: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});
export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;

/** Risk factor with impact assessment. */
export const RiskFactorSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(300),
  category: z.enum(["technical", "market", "operational", "financial", "regulatory"]),
  probability: z.number().min(0).max(1),
  impact: z.enum(["low", "medium", "high", "critical"]),
  mitigation: z.string().max(1000).optional(),
  adjustmentFactor: z.number().min(0).max(1),
});
export type RiskFactor = z.infer<typeof RiskFactorSchema>;

/** Financial metrics result. */
export const FinancialMetricsSchema = z.object({
  npv: z.number(),
  irr: z.number().optional(),
  paybackPeriod: z.number().optional(),
  roi: z.number(),
  riskAdjustedNpv: z.number(),
  totalInvestment: z.number(),
  totalReturn: z.number(),
  breakEvenPeriod: z.number().optional(),
});
export type FinancialMetrics = z.infer<typeof FinancialMetricsSchema>;

/** Business case document. */
export const BusinessCaseSchema = z.object({
  id: z.string(),
  ideaId: z.string().max(200),
  ideaTitle: z.string().max(500),
  generatedAt: z.string(),
  financialMetrics: FinancialMetricsSchema,
  resources: z.array(ResourceAllocationSchema).max(20),
  risks: z.array(RiskFactorSchema).max(20),
  sections: z.object({
    executiveSummary: z.string(),
    problemStatement: z.string(),
    proposedSolution: z.string(),
    financialProjections: z.string(),
    competitiveRationale: z.string(),
    riskAnalysis: z.string(),
    implementationPlan: z.string(),
    recommendation: z.string(),
  }),
  format: z.enum(["markdown", "html"]),
});
export type BusinessCase = z.infer<typeof BusinessCaseSchema>;

/** Portfolio ROI aggregation. */
export const PortfolioROISchema = z.object({
  totalInvestment: z.number(),
  totalExpectedReturn: z.number(),
  portfolioNpv: z.number(),
  portfolioRoi: z.number(),
  ideaCount: z.number().int(),
  investmentByCategory: z.record(z.number()),
  topIdeasByRoi: z
    .array(
      z.object({
        ideaId: z.string(),
        ideaTitle: z.string(),
        roi: z.number(),
        npv: z.number(),
      })
    )
    .max(20),
  generatedAt: z.string(),
});
export type PortfolioROI = z.infer<typeof PortfolioROISchema>;

// ---- In-Memory Store ----

const businessCases = new Map<string, BusinessCase>();

// ---- NPV/IRR Calculations ----

/** Calculate Net Present Value from cash flows. */
export function calculateNPV(cashFlows: CashFlow[], discountRate: number): number {
  if (discountRate < -1) throw new ValidationError("Discount rate must be >= -1");
  return cashFlows.reduce((npv, cf) => {
    return npv + cf.amount / Math.pow(1 + discountRate, cf.period);
  }, 0);
}

/** Calculate Internal Rate of Return using Newton-Raphson method. */
export function calculateIRR(
  cashFlows: CashFlow[],
  maxIterations: number = 100,
  tolerance: number = 0.0001
): number | undefined {
  if (cashFlows.length < 2) return undefined;

  let rate = 0.1; // Initial guess

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    for (const cf of cashFlows) {
      const discount = Math.pow(1 + rate, cf.period);
      npv += cf.amount / discount;
      derivative -= (cf.period * cf.amount) / Math.pow(1 + rate, cf.period + 1);
    }

    if (Math.abs(npv) < tolerance) return rate;
    if (Math.abs(derivative) < 1e-10) return undefined;

    rate = rate - npv / derivative;

    // Clamp to reasonable range
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  return rate;
}

/** Calculate payback period (in periods). */
export function calculatePaybackPeriod(cashFlows: CashFlow[]): number | undefined {
  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);
  let cumulative = 0;

  for (const cf of sorted) {
    cumulative += cf.amount;
    if (cumulative >= 0) return cf.period;
  }

  return undefined;
}

/** Calculate ROI percentage. */
export function calculateROI(totalInvestment: number, totalReturn: number): number {
  if (totalInvestment === 0) return 0;
  return ((totalReturn - totalInvestment) / totalInvestment) * 100;
}

// ---- Risk Adjustment ----

/** Apply risk adjustments to NPV. */
export function riskAdjustNPV(npv: number, risks: RiskFactor[]): number {
  if (risks.length === 0) return npv;

  // Weighted risk factor
  const totalRiskFactor = risks.reduce((factor, risk) => {
    const impactWeight = { low: 0.1, medium: 0.25, high: 0.5, critical: 0.75 }[risk.impact];
    const adjustment = risk.probability * impactWeight;
    return factor * (1 - adjustment);
  }, 1);

  return npv * Math.max(0, totalRiskFactor);
}

/** Generate risk adjustment matrix summary. */
export function generateRiskMatrix(risks: RiskFactor[]): string {
  if (risks.length === 0) return "No risk factors identified.";

  const header = "| Risk | Category | Probability | Impact | Mitigation |";
  const separator = "|------|----------|-------------|--------|------------|";
  const rows = risks.map(
    (r) =>
      `| ${r.name} | ${r.category} | ${(r.probability * 100).toFixed(0)}% | ${r.impact} | ${r.mitigation ?? "N/A"} |`
  );

  return [header, separator, ...rows].join("\n");
}

// ---- Resource Allocation ----

/** Calculate total investment from resource allocations. */
export function calculateTotalInvestment(resources: ResourceAllocation[]): number {
  return resources.reduce((total, r) => total + r.costPerPeriod * r.periods, 0);
}

// ---- Business Case Generation ----

/** Generate a full business case document. */
export async function generateBusinessCase(
  ideaId: string,
  ideaTitle: string,
  ideaDescription: string,
  cashFlows: CashFlow[],
  resources: ResourceAllocation[],
  risks: RiskFactor[],
  options?: {
    discountRate?: number;
    model?: string;
    signal?: AbortSignal;
    format?: "markdown" | "html";
    competitiveContext?: string;
  }
): Promise<BusinessCase> {
  const discountRate = options?.discountRate ?? 0.1;
  const format = options?.format ?? "markdown";

  // Calculate financial metrics
  const npv = calculateNPV(cashFlows, discountRate);
  const irr = calculateIRR(cashFlows);
  const paybackPeriod = calculatePaybackPeriod(cashFlows);
  const totalInvestment = calculateTotalInvestment(resources);
  const totalReturn = cashFlows
    .filter((cf) => cf.amount > 0)
    .reduce((sum, cf) => sum + cf.amount, 0);
  const roi = calculateROI(totalInvestment, totalReturn);
  const riskAdjustedNpv = riskAdjustNPV(npv, risks);
  const sortedFlows = [...cashFlows].sort((a, b) => a.period - b.period);
  let cumulative = 0;
  let breakEvenPeriod: number | undefined;
  for (const cf of sortedFlows) {
    cumulative += cf.amount;
    if (cumulative >= 0 && breakEvenPeriod === undefined) breakEvenPeriod = cf.period;
  }

  const financialMetrics: FinancialMetrics = {
    npv,
    irr,
    paybackPeriod,
    roi,
    riskAdjustedNpv,
    totalInvestment,
    totalReturn,
    breakEvenPeriod,
  };

  const riskMatrix = generateRiskMatrix(risks);

  // LLM-generated sections
  const prompt = `You are a business case analyst. Generate executive-ready business case sections.

${wrapUserInput("IDEA", ideaTitle)}
${wrapUserInput("DESCRIPTION", ideaDescription)}

FINANCIAL METRICS:
- NPV: $${npv.toLocaleString()}
- IRR: ${irr ? (irr * 100).toFixed(1) + "%" : "N/A"}
- ROI: ${roi.toFixed(1)}%
- Payback: ${paybackPeriod ? paybackPeriod + " periods" : "N/A"}
- Total Investment: $${totalInvestment.toLocaleString()}
- Risk-Adjusted NPV: $${riskAdjustedNpv.toLocaleString()}

RESOURCES: ${resources.map((r) => `${r.category}: ${r.headcount} people, $${r.costPerPeriod}/period × ${r.periods}`).join("; ")}

RISKS: ${risks.map((r) => `${r.name} (${r.probability * 100}% prob, ${r.impact} impact)`).join("; ")}

${options?.competitiveContext ? `COMPETITIVE CONTEXT: ${options.competitiveContext}` : ""}

Respond with JSON containing these sections (each 2-4 paragraphs):
{
  "executiveSummary": "...",
  "problemStatement": "...",
  "proposedSolution": "...",
  "financialProjections": "...",
  "competitiveRationale": "...",
  "riskAnalysis": "...",
  "implementationPlan": "...",
  "recommendation": "..."
}`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const sections = (() => {
    try {
      return JSON.parse(extractJson(raw)) as BusinessCase["sections"];
    } catch {
      return undefined;
    }
  })() ?? {
    executiveSummary: `Business case for ${ideaTitle} with NPV of $${npv.toLocaleString()}.`,
    problemStatement: ideaDescription,
    proposedSolution: ideaTitle,
    financialProjections: `Total investment: $${totalInvestment.toLocaleString()}, Expected ROI: ${roi.toFixed(1)}%`,
    competitiveRationale: options?.competitiveContext ?? "Competitive analysis pending.",
    riskAnalysis: riskMatrix,
    implementationPlan: `${resources.length} resource categories identified.`,
    recommendation: npv > 0 ? "Proceed with investment." : "Reconsider investment parameters.",
  };

  const businessCase: BusinessCase = {
    id: randomUUID(),
    ideaId,
    ideaTitle,
    generatedAt: new Date().toISOString(),
    financialMetrics,
    resources,
    risks,
    sections,
    format,
  };

  businessCases.set(businessCase.id, businessCase);
  return businessCase;
}

/** Get a business case by ID. */
export function getBusinessCase(caseId: string): BusinessCase | undefined {
  return businessCases.get(caseId);
}

/** List all business cases for an idea. */
export function listBusinessCases(ideaId?: string): BusinessCase[] {
  let results = [...businessCases.values()];
  if (ideaId) results = results.filter((bc) => bc.ideaId === ideaId);
  return results.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

// ---- Portfolio ROI Aggregation ----

/** Aggregate ROI across a portfolio of business cases. */
export function aggregatePortfolioROI(caseIds?: string[]): PortfolioROI {
  let cases = [...businessCases.values()];
  if (caseIds) {
    const idSet = new Set(caseIds);
    cases = cases.filter((bc) => idSet.has(bc.id));
  }

  const totalInvestment = cases.reduce((sum, bc) => sum + bc.financialMetrics.totalInvestment, 0);
  const totalReturn = cases.reduce((sum, bc) => sum + bc.financialMetrics.totalReturn, 0);
  const portfolioNpv = cases.reduce((sum, bc) => sum + bc.financialMetrics.npv, 0);
  const portfolioRoi = calculateROI(totalInvestment, totalReturn);

  const investmentByCategory: Record<string, number> = {};
  for (const bc of cases) {
    for (const r of bc.resources) {
      investmentByCategory[r.category] =
        (investmentByCategory[r.category] ?? 0) + r.costPerPeriod * r.periods;
    }
  }

  const topIdeasByRoi = cases
    .map((bc) => ({
      ideaId: bc.ideaId,
      ideaTitle: bc.ideaTitle,
      roi: bc.financialMetrics.roi,
      npv: bc.financialMetrics.npv,
    }))
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 20);

  return {
    totalInvestment,
    totalExpectedReturn: totalReturn,
    portfolioNpv,
    portfolioRoi,
    ideaCount: cases.length,
    investmentByCategory,
    topIdeasByRoi,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Export Helpers ----

/** Render business case as Markdown. */
export function businessCaseToMarkdown(bc: BusinessCase): string {
  const { sections, financialMetrics: fm } = bc;
  return `# Business Case: ${bc.ideaTitle}

## Executive Summary
${sections.executiveSummary}

## Problem Statement
${sections.problemStatement}

## Proposed Solution
${sections.proposedSolution}

## Financial Projections
${sections.financialProjections}

| Metric | Value |
|--------|-------|
| NPV | $${fm.npv.toLocaleString()} |
| IRR | ${fm.irr ? (fm.irr * 100).toFixed(1) + "%" : "N/A"} |
| ROI | ${fm.roi.toFixed(1)}% |
| Payback Period | ${fm.paybackPeriod ?? "N/A"} periods |
| Total Investment | $${fm.totalInvestment.toLocaleString()} |
| Risk-Adjusted NPV | $${fm.riskAdjustedNpv.toLocaleString()} |

## Competitive Rationale
${sections.competitiveRationale}

## Risk Analysis
${sections.riskAnalysis}

## Implementation Plan
${sections.implementationPlan}

## Recommendation
${sections.recommendation}

---
*Generated on ${bc.generatedAt}*`;
}

// ---- Store Management ----

/** Clear all ROI calculator data (for testing). */
export function clearROICalculatorData(): void {
  businessCases.clear();
}
