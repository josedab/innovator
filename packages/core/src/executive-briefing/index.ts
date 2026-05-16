/**
 * @module executive-briefing
 *
 * Executive Briefing Generator — one-click board-ready reports with
 * portfolio heatmaps, strategic summaries, and risk assessment.
 * Leverages existing export, reports, and audience modules.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Schemas ----

export const BriefingFormatSchema = z.enum(["markdown", "html", "notion"]);
export type BriefingFormat = z.infer<typeof BriefingFormatSchema>;

export const HeatmapCellSchema = z.object({
  ideaTitle: z.string().max(200),
  impact: z.enum(["low", "medium", "high", "critical"]),
  effort: z.enum(["low", "medium", "high", "very-high"]),
  quadrant: z.enum(["quick-win", "strategic-bet", "fill-in", "avoid"]),
  score: z.number().min(0).max(100).optional(),
});

export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;

export const PortfolioHeatmapSchema = z.object({
  title: z.string().max(300),
  cells: z.array(HeatmapCellSchema).max(50),
  summary: z.string().max(2000),
  recommendedFocus: z.array(z.string().max(200)).max(5),
});

export type PortfolioHeatmap = z.infer<typeof PortfolioHeatmapSchema>;

export const ExecutiveBriefingSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  subject: z.string().max(1000),
  format: BriefingFormatSchema,
  /** One-paragraph strategic overview. */
  executiveSummary: z.string().max(3000),
  /** Key findings (3-5 bullet points). */
  keyFindings: z.array(z.string().max(500)).max(7),
  /** Portfolio heatmap (impact vs effort matrix). */
  heatmap: PortfolioHeatmapSchema,
  /** Strategic recommendations. */
  recommendations: z
    .array(
      z.object({
        title: z.string().max(200),
        description: z.string().max(1000),
        priority: z.enum(["immediate", "short-term", "long-term"]),
        expectedOutcome: z.string().max(500),
      })
    )
    .max(10),
  /** Risk assessment. */
  risks: z
    .array(
      z.object({
        risk: z.string().max(500),
        probability: z.enum(["low", "medium", "high"]),
        impact: z.enum(["low", "medium", "high", "critical"]),
        mitigation: z.string().max(500),
      })
    )
    .max(10),
  /** Resource requirements. */
  resourceEstimate: z
    .object({
      totalEffortWeeks: z.number().min(0),
      teamSize: z.number().int().min(1),
      budgetRange: z.string().max(200),
    })
    .optional(),
  generatedAt: z.string(),
});

export type ExecutiveBriefing = z.infer<typeof ExecutiveBriefingSchema>;

// ---- Briefing Generation ----

export interface BriefingInput {
  subject: string;
  ideas: Array<{
    title: string;
    description: string;
    score?: number;
    feasibility?: string;
    angle?: string;
  }>;
  investigation?: { summary: string; keyAspects?: string[] };
  synthesis?: { topIdeas?: string[]; executiveSummary?: string };
  format?: BriefingFormat;
  model?: string;
  signal?: AbortSignal;
}

const BriefingLLMResponseSchema = z.object({
  executiveSummary: z.string(),
  keyFindings: z.array(z.string()).max(7),
  heatmap: z.array(
    z.object({
      ideaTitle: z.string(),
      impact: z.enum(["low", "medium", "high", "critical"]),
      effort: z.enum(["low", "medium", "high", "very-high"]),
    })
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["immediate", "short-term", "long-term"]),
      expectedOutcome: z.string(),
    })
  ),
  risks: z.array(
    z.object({
      risk: z.string(),
      probability: z.enum(["low", "medium", "high"]),
      impact: z.enum(["low", "medium", "high", "critical"]),
      mitigation: z.string(),
    })
  ),
  resourceEstimate: z.object({
    totalEffortWeeks: z.number(),
    teamSize: z.number(),
    budgetRange: z.string(),
  }),
});

function classifyQuadrant(
  impact: HeatmapCell["impact"],
  effort: HeatmapCell["effort"]
): HeatmapCell["quadrant"] {
  const impactHigh = impact === "high" || impact === "critical";
  const effortLow = effort === "low" || effort === "medium";

  if (impactHigh && effortLow) return "quick-win";
  if (impactHigh && !effortLow) return "strategic-bet";
  if (!impactHigh && effortLow) return "fill-in";
  return "avoid";
}

/**
 * Generate a complete executive briefing from innovation pipeline results.
 */
export async function generateExecutiveBriefing(input: BriefingInput): Promise<ExecutiveBriefing> {
  const ideasContext = input.ideas
    .slice(0, 15)
    .map(
      (i) => `- ${i.title}: ${i.description.slice(0, 200)}${i.score ? ` (score: ${i.score})` : ""}`
    )
    .join("\n");

  const prompt = `You are a senior innovation strategist creating a board-ready executive briefing.

Subject: ${wrapUserInput("SUBJECT", input.subject)}
${input.investigation?.summary ? `\nInvestigation Summary: ${wrapUserInput("INVESTIGATION", input.investigation.summary.slice(0, 1500))}` : ""}

Innovation Ideas:
${wrapUserInput("IDEAS", ideasContext)}

Create an executive briefing suitable for C-level presentation.

Respond in JSON:
{
  "executiveSummary": "One-paragraph strategic overview for the board...",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "heatmap": [
    { "ideaTitle": "idea name", "impact": "high", "effort": "low" }
  ],
  "recommendations": [
    { "title": "...", "description": "...", "priority": "immediate", "expectedOutcome": "..." }
  ],
  "risks": [
    { "risk": "...", "probability": "medium", "impact": "high", "mitigation": "..." }
  ],
  "resourceEstimate": {
    "totalEffortWeeks": 12,
    "teamSize": 3,
    "budgetRange": "$50K-$100K"
  }
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: input.model, signal: input.signal });
      return BriefingLLMResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
    },
    { signal: input.signal }
  );

  const heatmapCells: HeatmapCell[] = result.heatmap.slice(0, 50).map((h) => ({
    ideaTitle: h.ideaTitle.slice(0, 200),
    impact: h.impact,
    effort: h.effort,
    quadrant: classifyQuadrant(h.impact, h.effort),
    score: input.ideas.find((i) =>
      i.title.toLowerCase().includes(h.ideaTitle.toLowerCase().slice(0, 20))
    )?.score,
  }));

  const quickWins = heatmapCells.filter((c) => c.quadrant === "quick-win").map((c) => c.ideaTitle);

  return ExecutiveBriefingSchema.parse({
    id: `briefing-${randomUUID().slice(0, 8)}`,
    title: `Innovation Briefing: ${input.subject}`,
    subject: input.subject,
    format: input.format ?? "markdown",
    executiveSummary: String(result.executiveSummary).slice(0, 3000),
    keyFindings: result.keyFindings.slice(0, 7).map((f) => String(f).slice(0, 500)),
    heatmap: {
      title: `Portfolio Heatmap: ${input.subject}`,
      cells: heatmapCells,
      summary: `${heatmapCells.length} ideas analyzed. ${quickWins.length} quick wins identified.`,
      recommendedFocus: quickWins.slice(0, 5),
    },
    recommendations: result.recommendations.slice(0, 10).map((r) => ({
      title: String(r.title).slice(0, 200),
      description: String(r.description).slice(0, 1000),
      priority: r.priority,
      expectedOutcome: String(r.expectedOutcome).slice(0, 500),
    })),
    risks: result.risks.slice(0, 10).map((r) => ({
      risk: String(r.risk).slice(0, 500),
      probability: r.probability,
      impact: r.impact,
      mitigation: String(r.mitigation).slice(0, 500),
    })),
    resourceEstimate: {
      totalEffortWeeks: Math.max(0, result.resourceEstimate.totalEffortWeeks),
      teamSize: Math.max(1, Math.round(result.resourceEstimate.teamSize)),
      budgetRange: String(result.resourceEstimate.budgetRange).slice(0, 200),
    },
    generatedAt: new Date().toISOString(),
  });
}

// ---- Output Formatters ----

/** Format briefing as markdown. */
export function briefingToMarkdown(briefing: ExecutiveBriefing): string {
  const lines: string[] = [
    `# 📊 ${briefing.title}`,
    "",
    `*Generated: ${briefing.generatedAt.slice(0, 10)}*`,
    "",
    "## Executive Summary",
    "",
    briefing.executiveSummary,
    "",
    "## Key Findings",
    "",
    ...briefing.keyFindings.map((f, i) => `${i + 1}. ${f}`),
    "",
    "## Portfolio Heatmap",
    "",
    "| Idea | Impact | Effort | Quadrant |",
    "|------|--------|--------|----------|",
    ...briefing.heatmap.cells.map(
      (c) => `| ${c.ideaTitle} | ${c.impact} | ${c.effort} | ${c.quadrant} |`
    ),
    "",
  ];

  if (briefing.heatmap.recommendedFocus.length > 0) {
    lines.push(
      "### 🎯 Recommended Focus (Quick Wins)",
      "",
      ...briefing.heatmap.recommendedFocus.map((f) => `- **${f}**`),
      ""
    );
  }

  lines.push(
    "## Strategic Recommendations",
    "",
    ...briefing.recommendations.map(
      (r) =>
        `### ${r.priority === "immediate" ? "🔴" : r.priority === "short-term" ? "🟡" : "🟢"} ${r.title}\n\n${r.description}\n\n**Expected Outcome:** ${r.expectedOutcome}\n`
    ),
    "## Risk Assessment",
    "",
    "| Risk | Probability | Impact | Mitigation |",
    "|------|------------|--------|------------|",
    ...briefing.risks.map(
      (r) => `| ${r.risk} | ${r.probability} | ${r.impact} | ${r.mitigation} |`
    ),
    ""
  );

  if (briefing.resourceEstimate) {
    const re = briefing.resourceEstimate;
    lines.push(
      "## Resource Estimate",
      "",
      `- **Effort:** ${re.totalEffortWeeks} person-weeks`,
      `- **Team Size:** ${re.teamSize} people`,
      `- **Budget Range:** ${re.budgetRange}`,
      ""
    );
  }

  return lines.join("\n");
}

/** Format briefing as HTML for presentation. */
export function briefingToHtml(briefing: ExecutiveBriefing): string {
  const heatmapRows = briefing.heatmap.cells
    .map((c) => {
      const color =
        c.quadrant === "quick-win"
          ? "#22c55e"
          : c.quadrant === "strategic-bet"
            ? "#3b82f6"
            : c.quadrant === "fill-in"
              ? "#eab308"
              : "#ef4444";
      return `<tr><td>${c.ideaTitle}</td><td>${c.impact}</td><td>${c.effort}</td><td style="color:${color};font-weight:bold">${c.quadrant}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${briefing.title}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1e293b; }
h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; }
h2 { color: #1e40af; margin-top: 2rem; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th, td { padding: 0.5rem; border: 1px solid #e2e8f0; text-align: left; }
th { background: #f1f5f9; font-weight: 600; }
.summary { background: #eff6ff; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #3b82f6; }
.finding { padding: 0.25rem 0; }
.recommendation { margin: 1rem 0; padding: 1rem; border-radius: 6px; border-left: 3px solid #3b82f6; background: #f8fafc; }
.footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>📊 ${briefing.title}</h1>
<p><em>Generated: ${briefing.generatedAt.slice(0, 10)}</em></p>

<h2>Executive Summary</h2>
<div class="summary">${briefing.executiveSummary}</div>

<h2>Key Findings</h2>
<ol>${briefing.keyFindings.map((f) => `<li class="finding">${f}</li>`).join("")}</ol>

<h2>Portfolio Heatmap</h2>
<table><thead><tr><th>Idea</th><th>Impact</th><th>Effort</th><th>Quadrant</th></tr></thead>
<tbody>${heatmapRows}</tbody></table>

<h2>Recommendations</h2>
${briefing.recommendations.map((r) => `<div class="recommendation"><strong>${r.title}</strong> <em>(${r.priority})</em><p>${r.description}</p><p><strong>Expected:</strong> ${r.expectedOutcome}</p></div>`).join("")}

<h2>Risk Assessment</h2>
<table><thead><tr><th>Risk</th><th>Probability</th><th>Impact</th><th>Mitigation</th></tr></thead>
<tbody>${briefing.risks.map((r) => `<tr><td>${r.risk}</td><td>${r.probability}</td><td>${r.impact}</td><td>${r.mitigation}</td></tr>`).join("")}</tbody></table>

${briefing.resourceEstimate ? `<h2>Resource Estimate</h2><ul><li><strong>Effort:</strong> ${briefing.resourceEstimate.totalEffortWeeks} person-weeks</li><li><strong>Team:</strong> ${briefing.resourceEstimate.teamSize} people</li><li><strong>Budget:</strong> ${briefing.resourceEstimate.budgetRange}</li></ul>` : ""}

<div class="footer">Generated by Innovator — AI-Powered Innovation Engine</div>
</body></html>`;
}
