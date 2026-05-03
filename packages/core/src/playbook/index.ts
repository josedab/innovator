/**
 * @module playbook
 *
 * Innovation Playbook Generator — generates a polished document
 * with executive summary, methodology, angles explored, top ideas,
 * implementation roadmap, and risk assessment.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type {
  Investigation,
  AngleResult,
  Synthesis,
  PipelineProgress,
} from "../types.js";

// ---- Schemas ----

export const PlaybookFormatSchema = z.enum([
  "markdown",
  "html",
]);

export type PlaybookFormat = z.infer<typeof PlaybookFormatSchema>;

export const RoadmapItemSchema = z.object({
  phase: z.string().max(200),
  timeframe: z.string().max(200),
  activities: z.array(z.string().max(500)).max(10),
  deliverables: z.array(z.string().max(500)).max(10),
  dependencies: z.array(z.string().max(500)).max(5).optional(),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

export const RiskItemSchema = z.object({
  risk: z.string().max(500),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().max(500),
});

export type RiskItem = z.infer<typeof RiskItemSchema>;

export const PlaybookSectionsSchema = z.object({
  executiveSummary: z.string().max(5000),
  roadmap: z.array(RoadmapItemSchema).max(10),
  risks: z.array(RiskItemSchema).max(10),
  nextSteps: z.array(z.string().max(500)).max(10),
});

export type PlaybookSections = z.infer<typeof PlaybookSectionsSchema>;

export const PlaybookSchema = z.object({
  title: z.string().max(500),
  subject: z.string().max(2000),
  generatedAt: z.string(),
  format: PlaybookFormatSchema,
  content: z.string(),
  sections: PlaybookSectionsSchema,
});

export type Playbook = z.infer<typeof PlaybookSchema>;

// ---- LLM Section Generation ----

async function generatePlaybookSections(
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis: Synthesis,
  model?: string,
  signal?: AbortSignal
): Promise<PlaybookSections> {
  const anglesContext = angleResults
    .map(
      (ar) =>
        `${ar.angleName}: ${ar.ideas.length} ideas — ${ar.ideas.map((i) => i.title).join(", ")}`
    )
    .join("\n");

  const topIdeasContext = synthesis.topIdeas
    .map(
      (i) =>
        `- ${i.title} [${i.feasibility}]: ${i.description.slice(0, 200)}`
    )
    .join("\n");

  const prompt = `You are a senior innovation consultant creating a professional Innovation Playbook.

${wrapUserInput("SUBJECT", subject)}

INVESTIGATION SUMMARY:
${sanitizeLlmOutput(investigation.summary)}
Challenges: ${investigation.challenges.join("; ")}
Opportunities: ${investigation.opportunities.join("; ")}

ANGLES EXPLORED:
${sanitizeLlmOutput(anglesContext)}

TOP IDEAS:
${sanitizeLlmOutput(topIdeasContext)}

RECOMMENDATION: ${sanitizeLlmOutput(synthesis.recommendation)}
THEMES: ${synthesis.themes.join(", ")}

Generate structured playbook sections. You MUST respond with valid JSON only.

{
  "executiveSummary": "A compelling 3-5 paragraph executive summary covering the opportunity landscape, key findings, and strategic recommendation",
  "roadmap": [
    {
      "phase": "Phase 1: Quick Wins",
      "timeframe": "Weeks 1-4",
      "activities": ["Activity 1", "Activity 2"],
      "deliverables": ["Deliverable 1"],
      "dependencies": ["Dependency if any"]
    }
  ],
  "risks": [
    {
      "risk": "Risk description",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "How to mitigate"
    }
  ],
  "nextSteps": ["Immediate action 1", "Immediate action 2"]
}

Provide 3-4 roadmap phases, 4-6 risks, and 3-5 next steps.`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse playbook sections: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  return PlaybookSectionsSchema.parse(parsed);
}

// ---- Template Rendering ----

function renderMarkdownPlaybook(
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis: Synthesis,
  sections: PlaybookSections
): string {
  const now = new Date().toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push(`# Innovation Playbook: ${subject}`);
  lines.push(`\n*Generated on ${now}*\n`);
  lines.push("---\n");

  // Table of Contents
  lines.push("## Table of Contents\n");
  lines.push("1. [Executive Summary](#executive-summary)");
  lines.push("2. [Investigation Overview](#investigation-overview)");
  lines.push("3. [Methodology & Angles](#methodology--angles)");
  lines.push("4. [Top Ideas & Analysis](#top-ideas--analysis)");
  lines.push("5. [Implementation Roadmap](#implementation-roadmap)");
  lines.push("6. [Risk Assessment](#risk-assessment)");
  lines.push("7. [Next Steps](#next-steps)\n");

  // Executive Summary
  lines.push("## Executive Summary\n");
  lines.push(sections.executiveSummary);
  lines.push("");

  // Investigation Overview
  lines.push("## Investigation Overview\n");
  lines.push(`### Summary\n\n${investigation.summary}\n`);
  lines.push("### Key Aspects\n");
  for (const aspect of investigation.keyAspects) {
    lines.push(`- **${aspect.title}**: ${aspect.description}`);
  }
  lines.push(`\n### Current State\n\n${investigation.currentState}\n`);
  lines.push("### Challenges\n");
  for (const c of investigation.challenges) {
    lines.push(`- ${c}`);
  }
  lines.push("\n### Opportunities\n");
  for (const o of investigation.opportunities) {
    lines.push(`- ${o}`);
  }
  lines.push("");

  // Methodology
  lines.push("## Methodology & Angles\n");
  lines.push(
    `${angleResults.length} innovation angles were applied to generate diverse perspectives:\n`
  );
  for (const ar of angleResults) {
    lines.push(`### ${ar.angleName}\n`);
    lines.push(`*${ar.reasoning}*\n`);
    lines.push(`**${ar.ideas.length} ideas generated:**\n`);
    for (const idea of ar.ideas) {
      lines.push(`- **${idea.title}**: ${idea.description.slice(0, 200)}...`);
    }
    lines.push("");
  }

  // Top Ideas
  lines.push("## Top Ideas & Analysis\n");
  lines.push(`### Cross-Cutting Themes\n`);
  for (const theme of synthesis.themes) {
    lines.push(`- ${theme}`);
  }
  lines.push("\n### Top Ranked Ideas\n");
  for (let i = 0; i < synthesis.topIdeas.length; i++) {
    const idea = synthesis.topIdeas[i];
    lines.push(`#### ${i + 1}. ${idea.title}\n`);
    lines.push(`- **Source**: ${idea.sourceAngle}`);
    lines.push(`- **Feasibility**: ${idea.feasibility}`);
    lines.push(`- **Potential Impact**: ${idea.potentialImpact}`);
    lines.push(`- **Description**: ${idea.description}\n`);
  }
  lines.push(`### Strategic Recommendation\n\n${synthesis.recommendation}\n`);

  // Roadmap
  lines.push("## Implementation Roadmap\n");
  for (const phase of sections.roadmap) {
    lines.push(`### ${phase.phase} (${phase.timeframe})\n`);
    lines.push("**Activities:**\n");
    for (const a of phase.activities) {
      lines.push(`- ${a}`);
    }
    lines.push("\n**Deliverables:**\n");
    for (const d of phase.deliverables) {
      lines.push(`- ${d}`);
    }
    if (phase.dependencies && phase.dependencies.length > 0) {
      lines.push("\n**Dependencies:**\n");
      for (const dep of phase.dependencies) {
        lines.push(`- ${dep}`);
      }
    }
    lines.push("");
  }

  // Risk Assessment
  lines.push("## Risk Assessment\n");
  lines.push(
    "| Risk | Likelihood | Impact | Mitigation |"
  );
  lines.push("| --- | --- | --- | --- |");
  for (const risk of sections.risks) {
    lines.push(
      `| ${risk.risk} | ${risk.likelihood} | ${risk.impact} | ${risk.mitigation} |`
    );
  }
  lines.push("");

  // Next Steps
  lines.push("## Next Steps\n");
  for (let i = 0; i < sections.nextSteps.length; i++) {
    lines.push(`${i + 1}. ${sections.nextSteps[i]}`);
  }
  lines.push("");

  lines.push("---\n");
  lines.push("*Generated by Innovator — AI-Powered Innovation Engine*");

  return lines.join("\n");
}

function renderHtmlPlaybook(markdownContent: string, subject: string): string {
  // Simple markdown to HTML conversion for key elements
  let html = markdownContent
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\| (.+) \|/g, (match) => {
      const cells = match
        .split("|")
        .filter((c) => c.trim())
        .map((c) => `<td>${c.trim()}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    })
    .replace(/\| --- \|/g, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Innovation Playbook: ${subject}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 3px solid #6366f1; padding-bottom: 12px; }
    h2 { color: #2d2d4e; margin-top: 40px; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; }
    h3 { color: #4a4a6a; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 8px 12px; border: 1px solid #e0e0e0; }
    tr:first-child td { background: #f5f5f5; font-weight: 600; }
    li { margin: 4px 0; }
    hr { border: none; border-top: 2px solid #e0e0e0; margin: 40px 0; }
    em { color: #666; }
    @media print { body { max-width: 100%; } }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

// ---- Main Generator ----

/**
 * Generate a complete Innovation Playbook from pipeline results.
 *
 * @param subject - The innovation subject
 * @param investigation - Investigation results
 * @param angleResults - All angle results
 * @param synthesis - Synthesis results
 * @param format - Output format (markdown or html)
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Complete Playbook with rendered content
 */
export async function generatePlaybook(
  subject: string,
  investigation: Investigation,
  angleResults: AngleResult[],
  synthesis: Synthesis,
  format: PlaybookFormat = "markdown",
  model?: string,
  signal?: AbortSignal
): Promise<Playbook> {
  if (!subject || !investigation || angleResults.length === 0 || !synthesis) {
    throw new Error("Complete pipeline results required to generate a playbook");
  }

  const sections = await generatePlaybookSections(
    subject,
    investigation,
    angleResults,
    synthesis,
    model,
    signal
  );

  const markdownContent = renderMarkdownPlaybook(
    subject,
    investigation,
    angleResults,
    synthesis,
    sections
  );

  const content =
    format === "html"
      ? renderHtmlPlaybook(markdownContent, subject)
      : markdownContent;

  return {
    title: `Innovation Playbook: ${subject}`,
    subject,
    generatedAt: new Date().toISOString(),
    format,
    content,
    sections,
  };
}

/**
 * Generate a playbook directly from a PipelineProgress result.
 */
export async function generatePlaybookFromPipeline(
  progress: PipelineProgress,
  format: PlaybookFormat = "markdown",
  model?: string,
  signal?: AbortSignal
): Promise<Playbook> {
  if (
    progress.stage !== "complete" ||
    !progress.investigation ||
    !progress.synthesis
  ) {
    throw new Error(
      "Pipeline must be complete with investigation and synthesis to generate a playbook"
    );
  }

  return generatePlaybook(
    progress.investigation.summary.split(".")[0] || "Innovation Subject",
    progress.investigation,
    progress.angleResults,
    progress.synthesis,
    format,
    model,
    signal
  );
}
