/**
 * @module decision
 *
 * Executive Decision Packet generator. Produces structured decision documents
 * from synthesis and investigation data, including problem statement, options
 * matrix, recommendation, risk assessment, and resource requirements.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { Investigation, Synthesis } from "../types.js";

// ---- Schemas ----

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const OptionSchema = z.object({
  name: z.string().max(500),
  description: z.string().max(2000),
  pros: z.array(z.string().max(500)).max(10),
  cons: z.array(z.string().max(500)).max(10),
  effort: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  timeToValue: z.string().max(200),
  cost: z.string().max(200),
});

export const RiskAssessmentSchema = z.object({
  risk: z.string().max(500),
  level: RiskLevelSchema,
  likelihood: z.enum(["unlikely", "possible", "likely", "certain"]),
  impact: z.string().max(500),
  mitigation: z.string().max(500),
});

export const ResourceAskSchema = z.object({
  category: z.string().max(200),
  description: z.string().max(500),
  quantity: z.string().max(200),
  priority: z.enum(["must-have", "should-have", "nice-to-have"]),
});

export const DecisionPacketSchema = z.object({
  title: z.string().max(500),
  executiveSummary: z.string().max(3000),
  problemStatement: z.string().max(2000),
  context: z.string().max(3000),
  options: z.array(OptionSchema).max(10),
  recommendation: z.object({
    selectedOption: z.string().max(500),
    rationale: z.string().max(2000),
    nextSteps: z.array(z.string().max(500)).max(10),
  }),
  risks: z.array(RiskAssessmentSchema).max(15),
  resourceAsk: z.array(ResourceAskSchema).max(10),
  timeline: z.string().max(2000),
  successCriteria: z.array(z.string().max(500)).max(10),
});

export type Option = z.infer<typeof OptionSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type ResourceAsk = z.infer<typeof ResourceAskSchema>;
export type DecisionPacket = z.infer<typeof DecisionPacketSchema>;

export interface DecisionPacketConfig {
  model?: string;
  signal?: AbortSignal;
  branding?: { companyName?: string; logoUrl?: string };
}

// ---- Prompt Builder ----

function buildDecisionPrompt(
  synthesis: Synthesis,
  investigation: Investigation,
  subject: string
): string {
  const topIdeasSummary = synthesis.topIdeas.map((i) => ({
    title: i.title,
    description: i.description,
    sourceAngle: i.sourceAngle,
    feasibility: i.feasibility,
    potentialImpact: i.potentialImpact,
  }));

  return `You are a senior strategy consultant preparing an executive decision packet.

${wrapUserInput("SUBJECT", subject)}

INVESTIGATION CONTEXT:
"""
Summary: ${sanitizeLlmOutput(investigation.summary)}
Challenges: ${investigation.challenges.join("; ")}
Opportunities: ${investigation.opportunities.join("; ")}
"""

TOP IDEAS FROM SYNTHESIS:
"""
${sanitizeLlmOutput(JSON.stringify(topIdeasSummary, null, 2))}
"""

RECOMMENDATION: ${sanitizeLlmOutput(synthesis.recommendation)}
THEMES: ${synthesis.themes.join(", ")}

Generate a comprehensive executive decision packet. For each top idea, create a decision option.
Include realistic risk assessments and resource requirements.

Respond with JSON only:
{
  "title": "Decision: ...",
  "executiveSummary": "2-3 paragraph summary for C-suite",
  "problemStatement": "Clear problem we're solving",
  "context": "Market and organizational context",
  "options": [
    {
      "name": "Option name",
      "description": "What this option entails",
      "pros": ["pro1", "pro2"],
      "cons": ["con1", "con2"],
      "effort": "low|medium|high",
      "impact": "low|medium|high",
      "timeToValue": "e.g., 3 months",
      "cost": "e.g., $50K-100K"
    }
  ],
  "recommendation": {
    "selectedOption": "Name of recommended option",
    "rationale": "Why this option",
    "nextSteps": ["Step 1", "Step 2"]
  },
  "risks": [
    {
      "risk": "Risk description",
      "level": "low|medium|high|critical",
      "likelihood": "unlikely|possible|likely|certain",
      "impact": "Impact if realized",
      "mitigation": "How to mitigate"
    }
  ],
  "resourceAsk": [
    {
      "category": "Engineering|Design|Data|Budget",
      "description": "What's needed",
      "quantity": "2 FTEs for 3 months",
      "priority": "must-have|should-have|nice-to-have"
    }
  ],
  "timeline": "Phase-based timeline",
  "successCriteria": ["Measurable criterion 1"]
}`;
}

// ---- Core Functions ----

/**
 * Generate an executive decision packet from synthesis and investigation data.
 */
export async function generateDecisionPacket(
  synthesis: Synthesis,
  investigation: Investigation,
  subject: string,
  config: DecisionPacketConfig = {}
): Promise<DecisionPacket> {
  const prompt = buildDecisionPrompt(synthesis, investigation, subject);

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr);
      return DecisionPacketSchema.parse(parsed);
    },
    {
      signal: config.signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

/**
 * Format a decision packet as a polished markdown document.
 */
export function decisionPacketToMarkdown(
  packet: DecisionPacket,
  branding?: { companyName?: string }
): string {
  const lines: string[] = [];
  const company = branding?.companyName ?? "Innovation Team";

  lines.push(`# ${packet.title}`);
  lines.push(`*Prepared by ${company}*\n`);

  lines.push("## Executive Summary");
  lines.push(packet.executiveSummary);
  lines.push("");

  lines.push("## Problem Statement");
  lines.push(packet.problemStatement);
  lines.push("");

  lines.push("## Context");
  lines.push(packet.context);
  lines.push("");

  // Options Matrix
  lines.push("## Options Matrix");
  lines.push("");
  lines.push("| Option | Effort | Impact | Time to Value | Cost |");
  lines.push("|--------|--------|--------|---------------|------|");
  for (const opt of packet.options) {
    lines.push(
      `| **${opt.name}** | ${opt.effort} | ${opt.impact} | ${opt.timeToValue} | ${opt.cost} |`
    );
  }
  lines.push("");

  for (const opt of packet.options) {
    lines.push(`### ${opt.name}`);
    lines.push(opt.description);
    lines.push("\n**Pros:**");
    for (const p of opt.pros) lines.push(`- ✅ ${p}`);
    lines.push("\n**Cons:**");
    for (const c of opt.cons) lines.push(`- ❌ ${c}`);
    lines.push("");
  }

  // Recommendation
  lines.push("## ⭐ Recommendation");
  lines.push(`**Selected:** ${packet.recommendation.selectedOption}`);
  lines.push(`\n${packet.recommendation.rationale}`);
  lines.push("\n**Next Steps:**");
  for (let i = 0; i < packet.recommendation.nextSteps.length; i++) {
    lines.push(`${i + 1}. ${packet.recommendation.nextSteps[i]}`);
  }
  lines.push("");

  // Risk Assessment
  lines.push("## Risk Assessment");
  lines.push("");
  lines.push("| Risk | Level | Likelihood | Impact | Mitigation |");
  lines.push("|------|-------|------------|--------|------------|");
  for (const risk of packet.risks) {
    const icon =
      risk.level === "critical"
        ? "🔴"
        : risk.level === "high"
          ? "🟠"
          : risk.level === "medium"
            ? "🟡"
            : "🟢";
    lines.push(
      `| ${risk.risk} | ${icon} ${risk.level} | ${risk.likelihood} | ${risk.impact} | ${risk.mitigation} |`
    );
  }
  lines.push("");

  // Resource Ask
  lines.push("## Resource Requirements");
  lines.push("");
  lines.push("| Category | Description | Quantity | Priority |");
  lines.push("|----------|-------------|----------|----------|");
  for (const r of packet.resourceAsk) {
    lines.push(`| ${r.category} | ${r.description} | ${r.quantity} | ${r.priority} |`);
  }
  lines.push("");

  // Timeline
  lines.push("## Timeline");
  lines.push(packet.timeline);
  lines.push("");

  // Success Criteria
  lines.push("## Success Criteria");
  for (const criterion of packet.successCriteria) {
    lines.push(`- [ ] ${criterion}`);
  }

  return lines.join("\n");
}

/**
 * Export decision packet to Google Slides JSON format.
 */
export function decisionPacketToSlidesJson(packet: DecisionPacket): Record<string, unknown> {
  return {
    format: "google-slides",
    slides: [
      {
        layout: "TITLE",
        title: packet.title,
        subtitle: new Date().toLocaleDateString(),
      },
      {
        layout: "SECTION_HEADER",
        title: "Executive Summary",
        body: packet.executiveSummary,
      },
      {
        layout: "TITLE_AND_BODY",
        title: "Problem Statement",
        body: packet.problemStatement,
      },
      {
        layout: "TABLE",
        title: "Options Matrix",
        headers: ["Option", "Effort", "Impact", "Time", "Cost"],
        rows: packet.options.map((o) => [o.name, o.effort, o.impact, o.timeToValue, o.cost]),
      },
      ...packet.options.map((opt) => ({
        layout: "TWO_COLUMN" as const,
        title: opt.name,
        leftColumn: { title: "Pros", items: opt.pros },
        rightColumn: { title: "Cons", items: opt.cons },
      })),
      {
        layout: "TITLE_AND_BODY",
        title: "⭐ Recommendation",
        body: `${packet.recommendation.selectedOption}\n\n${packet.recommendation.rationale}`,
      },
      {
        layout: "TABLE",
        title: "Risk Assessment",
        headers: ["Risk", "Level", "Likelihood", "Mitigation"],
        rows: packet.risks.map((r) => [r.risk, r.level, r.likelihood, r.mitigation]),
      },
      {
        layout: "TABLE",
        title: "Resource Requirements",
        headers: ["Category", "Description", "Quantity", "Priority"],
        rows: packet.resourceAsk.map((r) => [r.category, r.description, r.quantity, r.priority]),
      },
      {
        layout: "TITLE_AND_BODY",
        title: "Timeline & Success Criteria",
        body: `${packet.timeline}\n\n${packet.successCriteria.map((c) => `• ${c}`).join("\n")}`,
      },
    ],
  };
}
