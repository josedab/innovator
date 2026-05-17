import { z } from "zod";
import { generateText } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { ExportData } from "../types.js";

// ---- Report Template Schemas ----

/** Valid section identifiers for innovation reports. */
export const ReportSectionIdSchema = z.enum([
  "executive-summary",
  "methodology",
  "idea-cards",
  "roadmap",
  "risk-matrix",
  "appendices",
]);
export type ReportSectionId = z.infer<typeof ReportSectionIdSchema>;

/** Branding configuration for report styling. */
export const ReportBrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().default("#2563eb"),
  secondaryColor: z.string().default("#64748b"),
  fontFamily: z.string().default("system-ui, -apple-system, sans-serif"),
});
export type ReportBranding = z.infer<typeof ReportBrandingSchema>;

/** Output format for the rendered report. */
export const ReportFormatSchema = z.enum(["html", "pdf", "markdown"]);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

/** Configuration for a report template. */
export const ReportTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  sections: z.array(ReportSectionIdSchema).min(1),
  branding: ReportBrandingSchema.optional(),
  format: ReportFormatSchema.default("html"),
});
export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;

// ---- Report Section ----

/** A single rendered report section. */
export interface ReportSection {
  id: ReportSectionId;
  title: string;
  content: string;
  order: number;
}

/** A fully assembled innovation report. */
export interface Report {
  title: string;
  sections: ReportSection[];
  branding: ReportBranding;
  format: ReportFormat;
  generatedAt: string;
}

/** Options for building a report. */
export interface ReportOptions {
  data: ExportData;
  template?: ReportTemplate;
  sections?: ReportSectionId[];
  branding?: Partial<ReportBranding>;
  model?: string;
  signal?: AbortSignal;
  scores?: Map<string, number>;
}

// ---- Built-in Templates ----

/** Pre-configured report templates. */
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "comprehensive",
    name: "Comprehensive Report",
    sections: [
      "executive-summary",
      "methodology",
      "idea-cards",
      "roadmap",
      "risk-matrix",
      "appendices",
    ],
    format: "html",
  },
  {
    id: "executive-brief",
    name: "Executive Brief",
    sections: ["executive-summary", "roadmap"],
    format: "html",
  },
  {
    id: "technical-deep-dive",
    name: "Technical Deep Dive",
    sections: ["methodology", "idea-cards", "appendices"],
    format: "html",
  },
];

// ---- Section Generators ----

/** Generate an LLM-powered executive summary from innovation data. */
export async function generateExecutiveSummary(
  data: ExportData,
  model?: string,
  signal?: AbortSignal
): Promise<ReportSection> {
  const prompt = [
    "You are an innovation strategist. Write a concise executive summary (3-5 paragraphs) in HTML format.",
    "Cover: the subject investigated, key findings, top opportunities, and a strategic recommendation.",
    `Subject: ${data.subject}`,
    data.investigation ? `Investigation summary: ${data.investigation.summary}` : "",
    data.synthesis ? `Recommendation: ${data.synthesis.recommendation}` : "",
    data.synthesis ? `Themes: ${data.synthesis.themes.join(", ")}` : "",
    `Number of angles explored: ${data.angleResults.length}`,
    `Total ideas generated: ${data.angleResults.reduce((sum, r) => sum + r.ideas.length, 0)}`,
    "Respond ONLY with the HTML content (no wrapping tags like <html> or <body>).",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await withRetry(() => generateText({ prompt, model, signal }), {
    maxAttempts: 2,
    signal,
  });

  return {
    id: "executive-summary",
    title: "Executive Summary",
    content: sanitizeLlmOutput(raw),
    order: 0,
  };
}

/** Generate a methodology section describing angles and models used. */
export function generateMethodologySection(data: ExportData): ReportSection {
  const angles = data.angleResults.map(
    (r) =>
      `<li><strong>${escapeHtml(r.angleName)}</strong> (${escapeHtml(r.angleId)}): ${escapeHtml(r.reasoning.slice(0, 200))}${r.reasoning.length > 200 ? "…" : ""}</li>`
  );

  const content = [
    "<h3>Innovation Angles Applied</h3>",
    `<p>This analysis explored <strong>${data.angleResults.length}</strong> innovation angle(s) on the subject <em>${escapeHtml(data.subject)}</em>.</p>`,
    `<ul>${angles.join("\n")}</ul>`,
    data.investigation
      ? `<h3>Investigation Phase</h3><p>${escapeHtml(data.investigation.summary)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { id: "methodology", title: "Methodology", content, order: 1 };
}

/** Generate formatted idea cards with optional scoring. */
export function generateIdeaCards(data: ExportData, scores?: Map<string, number>): ReportSection {
  const cards: string[] = [];

  for (const result of data.angleResults) {
    for (const idea of result.ideas) {
      const score = scores?.get(idea.title);
      const scoreHtml = score != null ? `<span class="idea-score">Score: ${score}/10</span>` : "";

      cards.push(
        `<div class="idea-card">` +
          `<h4>${escapeHtml(idea.title)} ${scoreHtml}</h4>` +
          `<p>${escapeHtml(idea.description)}</p>` +
          `<p><strong>Impact:</strong> ${escapeHtml(idea.potentialImpact)}</p>` +
          `<p><strong>Implementation:</strong> ${escapeHtml(idea.implementationHint)}</p>` +
          `<p class="idea-source">Source: ${escapeHtml(result.angleName)}</p>` +
          `</div>`
      );
    }
  }

  return {
    id: "idea-cards",
    title: "Innovation Ideas",
    content: `<div class="idea-cards-grid">${cards.join("\n")}</div>`,
    order: 2,
  };
}

/** Generate an LLM-powered implementation roadmap. */
export async function generateRoadmap(
  data: ExportData,
  model?: string,
  signal?: AbortSignal
): Promise<ReportSection> {
  const topIdeas = data.synthesis?.topIdeas.slice(0, 5) ?? [];
  const ideasSummary =
    topIdeas.length > 0
      ? topIdeas.map((i) => `- ${i.title} (feasibility: ${i.feasibility})`).join("\n")
      : data.angleResults
          .flatMap((r) => r.ideas)
          .slice(0, 5)
          .map((i) => `- ${i.title}`)
          .join("\n");

  const prompt = [
    "You are a product strategist. Create a phased implementation roadmap in HTML format.",
    "Include: immediate actions (0-30 days), short-term (1-3 months), and medium-term (3-6 months) phases.",
    "For each phase list 2-3 concrete action items with owners and success metrics.",
    `Subject: ${data.subject}`,
    `Top ideas:\n${ideasSummary}`,
    "Respond ONLY with the HTML content (no wrapping tags like <html> or <body>).",
  ].join("\n");

  const raw = await withRetry(() => generateText({ prompt, model, signal }), {
    maxAttempts: 2,
    signal,
  });

  return {
    id: "roadmap",
    title: "Implementation Roadmap",
    content: sanitizeLlmOutput(raw),
    order: 3,
  };
}

/** Generate an LLM-powered risk analysis matrix. */
export async function generateRiskMatrix(
  data: ExportData,
  model?: string,
  signal?: AbortSignal
): Promise<ReportSection> {
  const ideasSummary = data.angleResults
    .flatMap((r) => r.ideas)
    .slice(0, 10)
    .map((i) => `- ${i.title}: ${i.description.slice(0, 100)}`)
    .join("\n");

  const prompt = [
    "You are a risk analyst. Create a risk matrix in HTML table format for these innovation ideas.",
    "Columns: Risk, Likelihood (Low/Medium/High), Impact (Low/Medium/High), Mitigation Strategy.",
    "Identify 5-8 key risks including technical, market, resource, and regulatory risks.",
    `Subject: ${data.subject}`,
    `Ideas:\n${ideasSummary}`,
    "Respond ONLY with the HTML content (no wrapping tags like <html> or <body>).",
  ].join("\n");

  const raw = await withRetry(() => generateText({ prompt, model, signal }), {
    maxAttempts: 2,
    signal,
  });

  return {
    id: "risk-matrix",
    title: "Risk Matrix",
    content: sanitizeLlmOutput(raw),
    order: 4,
  };
}

/** Generate appendices with raw investigation and synthesis data. */
export function generateAppendices(data: ExportData): ReportSection {
  const parts: string[] = [];

  if (data.investigation) {
    parts.push("<h3>Investigation Data</h3>");
    parts.push(
      `<pre><code>${escapeHtml(JSON.stringify(data.investigation, null, 2))}</code></pre>`
    );
  }

  if (data.synthesis) {
    parts.push("<h3>Synthesis Data</h3>");
    parts.push(`<pre><code>${escapeHtml(JSON.stringify(data.synthesis, null, 2))}</code></pre>`);
  }

  if (data.metadata) {
    parts.push("<h3>Metadata</h3>");
    parts.push(`<pre><code>${escapeHtml(JSON.stringify(data.metadata, null, 2))}</code></pre>`);
  }

  parts.push("<h3>Raw Angle Results</h3>");
  for (const result of data.angleResults) {
    parts.push(
      `<details><summary>${escapeHtml(result.angleName)} (${result.ideas.length} ideas)</summary>`
    );
    parts.push(`<pre><code>${escapeHtml(JSON.stringify(result, null, 2))}</code></pre>`);
    parts.push("</details>");
  }

  return {
    id: "appendices",
    title: "Appendices",
    content: parts.join("\n"),
    order: 5,
  };
}

// ---- Report Builder ----

/** Assemble all requested sections into a complete report. */
export async function buildReport(options: ReportOptions): Promise<Report> {
  const {
    data,
    template,
    sections: sectionIds,
    branding: brandingOverrides,
    model,
    signal,
    scores,
  } = options;

  const resolvedTemplate = template ?? REPORT_TEMPLATES[0];
  const activeSections = sectionIds ?? resolvedTemplate.sections;
  const branding = ReportBrandingSchema.parse({
    ...resolvedTemplate.branding,
    ...brandingOverrides,
  });

  const sectionGenerators: Record<ReportSectionId, () => Promise<ReportSection> | ReportSection> = {
    "executive-summary": () => generateExecutiveSummary(data, model, signal),
    methodology: () => generateMethodologySection(data),
    "idea-cards": () => generateIdeaCards(data, scores),
    roadmap: () => generateRoadmap(data, model, signal),
    "risk-matrix": () => generateRiskMatrix(data, model, signal),
    appendices: () => generateAppendices(data),
  };

  const sections: ReportSection[] = [];
  for (const id of activeSections) {
    const generator = sectionGenerators[id];
    if (generator) {
      sections.push(await generator());
    }
  }

  sections.sort((a, b) => a.order - b.order);

  return {
    title: `Innovation Report: ${data.subject}`,
    sections,
    branding,
    format: resolvedTemplate.format,
    generatedAt: new Date().toISOString(),
  };
}

// ---- HTML Renderer ----

/** Render a report as a self-contained HTML document with inline CSS. */
export function renderReportHTML(report: Report): string {
  const { branding } = report;
  const sectionsHtml = report.sections
    .map(
      (s) =>
        `<section class="report-section" id="section-${s.id}">` +
        `<h2>${escapeHtml(s.title)}</h2>` +
        `${s.content}` +
        `</section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(report.title)}</title>
<style>
  :root {
    --primary: ${branding.primaryColor};
    --secondary: ${branding.secondaryColor};
    --font: ${branding.fontFamily};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); color: #1e293b; line-height: 1.6; max-width: 960px; margin: 0 auto; padding: 2rem; }
  h1 { color: var(--primary); border-bottom: 3px solid var(--primary); padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  h2 { color: var(--primary); margin: 2rem 0 1rem; padding-bottom: 0.25rem; border-bottom: 1px solid #e2e8f0; }
  h3 { color: var(--secondary); margin: 1.5rem 0 0.75rem; }
  h4 { margin: 0.5rem 0; }
  p { margin: 0.5rem 0; }
  ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1rem; overflow-x: auto; font-size: 0.85rem; margin: 0.5rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: var(--primary); color: white; }
  .report-header { text-align: center; margin-bottom: 2rem; }
  .report-header .meta { color: var(--secondary); font-size: 0.9rem; }
  .report-section { margin-bottom: 2rem; page-break-inside: avoid; }
  .idea-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .idea-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; background: #f8fafc; }
  .idea-card h4 { color: var(--primary); }
  .idea-score { background: var(--primary); color: white; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.8rem; margin-left: 0.5rem; }
  .idea-source { font-size: 0.8rem; color: var(--secondary); margin-top: 0.5rem; }
  .chart-placeholder { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 2rem; text-align: center; color: var(--secondary); margin: 1rem 0; }
  details { margin: 0.5rem 0; }
  summary { cursor: pointer; font-weight: 600; color: var(--primary); }
  ${branding.logoUrl ? `.report-header::before { content: ''; display: block; width: 120px; height: 60px; margin: 0 auto 1rem; background: url('${branding.logoUrl}') center/contain no-repeat; }` : ""}
  @media print {
    body { max-width: 100%; padding: 1cm; }
    .report-section { page-break-inside: avoid; }
    .idea-cards-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
<header class="report-header">
<h1>${escapeHtml(report.title)}</h1>
<p class="meta">Generated on ${escapeHtml(report.generatedAt)}</p>
</header>
${sectionsHtml}
</body>
</html>`;
}

// ---- Markdown Renderer ----

/** Render a report as Markdown. */
export function renderReportMarkdown(report: Report): string {
  const lines: string[] = [`# ${report.title}`, "", `*Generated on ${report.generatedAt}*`, ""];

  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(stripHtmlToMarkdown(section.content));
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Shareable Payload ----

/** Create a base64-encoded compressed payload for URL sharing. */
export function generateShareablePayload(report: Report): string {
  const json = JSON.stringify({
    title: report.title,
    sections: report.sections.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
    })),
    generatedAt: report.generatedAt,
  });

  // Use base64 encoding for URL-safe sharing
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64url");
  }
  // Fallback for environments without Buffer
  return btoa(encodeURIComponent(json));
}

/**
 * Render a report in its configured format. PDF format falls back to HTML
 * with print-optimized styles (use browser print-to-PDF or Puppeteer externally).
 */
export function renderReport(report: Report): { content: string; mimeType: string } {
  switch (report.format) {
    case "markdown":
      return { content: renderReportMarkdown(report), mimeType: "text/markdown" };
    case "pdf":
      // PDF generation requires Puppeteer/Playwright externally.
      // Return print-optimized HTML that can be converted to PDF.
      return { content: renderReportHTML(report), mimeType: "text/html" };
    case "html":
    default:
      return { content: renderReportHTML(report), mimeType: "text/html" };
  }
}

// ---- Utilities ----

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Basic HTML-to-Markdown conversion for report content. */
function stripHtmlToMarkdown(html: string): string {
  return html
    .replace(/<h3>(.*?)<\/h3>/gi, "### $1")
    .replace(/<h4>(.*?)<\/h4>/gi, "#### $1")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<li>(.*?)<\/li>/gi, "- $1")
    .replace(/<ul>|<\/ul>/gi, "")
    .replace(/<ol>|<\/ol>/gi, "")
    .replace(/<p>(.*?)<\/p>/gi, "$1\n")
    .replace(/<pre><code>(.*?)<\/code><\/pre>/gis, "```\n$1\n```")
    .replace(/<details><summary>(.*?)<\/summary>/gi, "**$1**\n")
    .replace(/<\/details>/gi, "")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/div>/gi, "")
    .replace(/<section[^>]*>/gi, "")
    .replace(/<\/section>/gi, "")
    .replace(/<span[^>]*>(.*?)<\/span>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}
