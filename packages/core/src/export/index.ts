/**
 * @module export
 *
 * Export innovation results to various formats.
 * Supports Markdown, JSON, and GitHub Issues via adapter pattern.
 */

import type { ExportData } from "../types.js";

/** Escape markdown special characters in inline content to prevent formatting breaks. */
function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\*_`\[\]|~<>])/g, "\\$1");
}

/** Escape a value for CSV output (RFC 4180 compliant). Handles non-string inputs, normalizes newlines. */
function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  // Normalize CRLF and CR to LF for consistent line endings
  const normalized = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Always quote if the value contains commas, double quotes, or newlines
  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r")
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

/** Export result containing the formatted output and metadata. */
export interface ExportResult {
  content: string;
  mimeType: string;
  extension: string;
  filename: string;
}

/** Adapter interface for third-party integrations. */
export interface IntegrationAdapter {
  id: string;
  name: string;
  export(
    data: ExportData,
    options?: Record<string, unknown>
  ): Promise<{ url?: string; id?: string }>;
}

// ---- Built-in Exporters ----

/** Export to Markdown format. */
export function exportToMarkdown(data: ExportData): ExportResult {
  const lines: string[] = [];
  const subject = escapeMarkdownInline(data.subject);

  lines.push(`# Innovation Report: ${subject}`);
  lines.push("");
  lines.push(`*Generated on ${new Date().toISOString().split("T")[0]}*`);
  lines.push("");

  if (data.investigation) {
    lines.push("## Investigation");
    lines.push("");
    lines.push(`### Summary`);
    lines.push(data.investigation.summary);
    lines.push("");

    lines.push("### Key Aspects");
    for (const aspect of data.investigation.keyAspects) {
      lines.push(`- **${escapeMarkdownInline(aspect.title)}**: ${aspect.description}`);
    }
    lines.push("");

    lines.push("### Current State");
    lines.push(data.investigation.currentState);
    lines.push("");

    lines.push("### Challenges");
    for (const c of data.investigation.challenges) {
      lines.push(`- ${c}`);
    }
    lines.push("");

    lines.push("### Opportunities");
    for (const o of data.investigation.opportunities) {
      lines.push(`- ${o}`);
    }
    lines.push("");
  }

  if (data.angleResults.length > 0) {
    lines.push("## Innovation Ideas by Angle");
    lines.push("");

    for (const angle of data.angleResults) {
      lines.push(`### ${escapeMarkdownInline(angle.angleName)}`);
      lines.push("");
      lines.push(`*${escapeMarkdownInline(angle.reasoning)}*`);
      lines.push("");

      for (const idea of angle.ideas) {
        lines.push(`#### ${escapeMarkdownInline(idea.title)}`);
        lines.push("");
        lines.push(idea.description);
        lines.push("");
        lines.push(`- **Impact**: ${idea.potentialImpact}`);
        lines.push(`- **How to start**: ${idea.implementationHint}`);
        lines.push("");
      }
    }
  }

  if (data.synthesis) {
    lines.push("## Synthesis");
    lines.push("");

    lines.push("### Top Ideas");
    lines.push("");
    for (const idea of data.synthesis.topIdeas) {
      lines.push(`#### ${escapeMarkdownInline(idea.title)} (${idea.feasibility} feasibility)`);
      lines.push("");
      lines.push(idea.description);
      lines.push(`- **Source**: ${escapeMarkdownInline(idea.sourceAngle)}`);
      lines.push(`- **Impact**: ${idea.potentialImpact}`);
      lines.push("");
    }

    lines.push("### Themes");
    for (const theme of data.synthesis.themes) {
      lines.push(`- ${theme}`);
    }
    lines.push("");

    lines.push("### Recommendation");
    lines.push(data.synthesis.recommendation);
    lines.push("");
  }

  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);

  return {
    content: lines.join("\n"),
    mimeType: "text/markdown",
    extension: ".md",
    filename: `innovation-${slug}.md`,
  };
}

/** Export to JSON format. */
export function exportToJson(data: ExportData): ExportResult {
  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  return {
    content: JSON.stringify(data, null, 2),
    mimeType: "application/json",
    extension: ".json",
    filename: `innovation-${slug}.json`,
  };
}

/** Generate a GitHub Issue body from innovation data. */
export function generateGitHubIssueBody(data: ExportData): {
  title: string;
  body: string;
  labels: string[];
} {
  const title = `💡 Innovation: ${data.subject}`;
  const lines: string[] = [];

  lines.push(`## Innovation Ideas for: ${data.subject}`);
  lines.push("");

  if (data.synthesis) {
    lines.push("### Top Ideas");
    lines.push("");
    for (const idea of data.synthesis.topIdeas) {
      lines.push(`- [ ] **${idea.title}** (${idea.feasibility} feasibility)`);
      lines.push(`  ${idea.description}`);
      lines.push("");
    }

    lines.push("### Recommendation");
    lines.push(data.synthesis.recommendation);
  } else if (data.angleResults.length > 0) {
    for (const angle of data.angleResults) {
      lines.push(`### ${angle.angleName}`);
      for (const idea of angle.ideas) {
        lines.push(`- [ ] **${idea.title}**: ${idea.description}`);
      }
      lines.push("");
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*Generated by [Innovator](https://github.com/innovator)*");

  return {
    title,
    body: lines.join("\n"),
    labels: ["innovation", "ideas"],
  };
}

/** Export data for clipboard (plain text summary). */
export function exportToClipboard(data: ExportData): string {
  const lines: string[] = [];
  lines.push(`Innovation Report: ${data.subject}`);
  lines.push("=".repeat(40));

  if (data.synthesis) {
    lines.push("\nTop Ideas:");
    for (const idea of data.synthesis.topIdeas) {
      lines.push(`\n• ${idea.title} [${idea.feasibility}]`);
      lines.push(`  ${idea.description}`);
    }
    lines.push(`\nRecommendation: ${data.synthesis.recommendation}`);
  } else {
    for (const angle of data.angleResults) {
      lines.push(`\n${angle.angleName}:`);
      for (const idea of angle.ideas) {
        lines.push(`  • ${idea.title}: ${idea.description}`);
      }
    }
  }

  return lines.join("\n");
}

// ---- Integration Hub: Enterprise Export Adapters ----

/** Schema for export integration configuration. */
export const IntegrationConfigSchema = {
  jira: {
    type: "object" as const,
    properties: {
      projectKey: "string",
      issueType: "string",
      assignee: "string",
      labels: "array",
    },
  },
  confluence: {
    type: "object" as const,
    properties: {
      spaceKey: "string",
      parentPageId: "string",
      title: "string",
    },
  },
  notion: {
    type: "object" as const,
    properties: {
      databaseId: "string",
      parentPageId: "string",
    },
  },
};

/**
 * Export to PowerPoint-compatible XML format (PPTX slide content).
 * Generates structured slide data that can be converted to PPTX.
 */
export function exportToPowerPoint(data: ExportData): ExportResult {
  const slides: Array<{ title: string; content: string[]; notes: string }> = [];

  // Title slide
  slides.push({
    title: `Innovation Report: ${data.subject}`,
    content: [`Generated on ${new Date().toISOString().split("T")[0]}`],
    notes: "Title slide for innovation report",
  });

  // Investigation slide
  if (data.investigation) {
    slides.push({
      title: "Investigation Summary",
      content: [
        data.investigation.summary,
        "",
        "Key Aspects:",
        ...data.investigation.keyAspects.map((a) => `• ${a.title}: ${a.description}`),
      ],
      notes: `Current State: ${data.investigation.currentState}`,
    });

    slides.push({
      title: "Challenges & Opportunities",
      content: [
        "Challenges:",
        ...data.investigation.challenges.map((c) => `• ${c}`),
        "",
        "Opportunities:",
        ...data.investigation.opportunities.map((o) => `• ${o}`),
      ],
      notes: "",
    });
  }

  // Ideas slides
  if (data.synthesis) {
    for (const idea of data.synthesis.topIdeas) {
      slides.push({
        title: idea.title,
        content: [
          idea.description,
          "",
          `Feasibility: ${idea.feasibility}`,
          `Impact: ${idea.potentialImpact}`,
          `Source Angle: ${idea.sourceAngle}`,
        ],
        notes: `Recommended action: ${data.synthesis.recommendation}`,
      });
    }

    slides.push({
      title: "Themes & Recommendation",
      content: [
        "Key Themes:",
        ...data.synthesis.themes.map((t) => `• ${t}`),
        "",
        "Recommendation:",
        data.synthesis.recommendation,
      ],
      notes: "",
    });
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const pptxJson = JSON.stringify(
    { slides, metadata: { subject: data.subject, generatedAt: new Date().toISOString() } },
    null,
    2
  );

  return {
    content: pptxJson,
    mimeType: "application/json",
    extension: ".pptx.json",
    filename: `innovation-${slug}.pptx.json`,
  };
}

/**
 * Export to Jira-compatible format (multiple issues).
 */
export function exportToJira(
  data: ExportData,
  config?: { projectKey?: string; issueType?: string; labels?: string[] }
): ExportResult {
  const projectKey = config?.projectKey ?? "INNOV";
  const issueType = config?.issueType ?? "Story";
  const labels = config?.labels ?? ["innovation", "ai-generated"];

  const issues: Array<{
    summary: string;
    description: string;
    issueType: string;
    labels: string[];
    priority: string;
    epicName?: string;
  }> = [];

  // Epic
  issues.push({
    summary: `Innovation: ${data.subject}`,
    description: data.investigation?.summary ?? `Innovation investigation for ${data.subject}`,
    issueType: "Epic",
    labels,
    priority: "High",
    epicName: `Innovation: ${data.subject}`,
  });

  // Individual idea stories — normalize both shapes to a common format
  if (data.synthesis) {
    for (const idea of data.synthesis.topIdeas) {
      issues.push({
        summary: idea.title,
        description: `${idea.description}\n\n**Impact:** ${idea.potentialImpact}\n\n**Source:** ${idea.sourceAngle}`,
        issueType,
        labels,
        priority: idea.feasibility === "high" ? "High" : "Medium",
      });
    }
  } else {
    for (const angle of data.angleResults) {
      for (const idea of angle.ideas) {
        issues.push({
          summary: idea.title,
          description: `${idea.description}\n\n**Impact:** ${idea.potentialImpact}\n\n**How to start:** ${idea.implementationHint}`,
          issueType,
          labels,
          priority: "Medium",
        });
      }
    }
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const jiraJson = JSON.stringify({ projectKey, issues }, null, 2);

  return {
    content: jiraJson,
    mimeType: "application/json",
    extension: ".jira.json",
    filename: `innovation-${slug}.jira.json`,
  };
}

/**
 * Export to Confluence-compatible wiki markup.
 */
export function exportToConfluence(
  data: ExportData,
  config?: { spaceKey?: string; title?: string }
): ExportResult {
  const title = config?.title ?? `Innovation Report: ${data.subject}`;
  const lines: string[] = [];

  lines.push(`<h1>${title}</h1>`);
  lines.push(`<p><em>Generated on ${new Date().toISOString().split("T")[0]}</em></p>`);

  if (data.investigation) {
    lines.push(`<h2>Investigation</h2>`);
    lines.push(`<p>${data.investigation.summary}</p>`);

    lines.push(`<h3>Key Aspects</h3>`);
    lines.push(`<table><tr><th>Aspect</th><th>Description</th></tr>`);
    for (const aspect of data.investigation.keyAspects) {
      lines.push(`<tr><td>${aspect.title}</td><td>${aspect.description}</td></tr>`);
    }
    lines.push(`</table>`);

    lines.push(`<h3>Current State</h3><p>${data.investigation.currentState}</p>`);

    lines.push(`<h3>Challenges</h3><ul>`);
    for (const c of data.investigation.challenges) lines.push(`<li>${c}</li>`);
    lines.push(`</ul>`);

    lines.push(`<h3>Opportunities</h3><ul>`);
    for (const o of data.investigation.opportunities) lines.push(`<li>${o}</li>`);
    lines.push(`</ul>`);
  }

  if (data.synthesis) {
    lines.push(`<h2>Top Ideas</h2>`);
    lines.push(`<table><tr><th>Idea</th><th>Feasibility</th><th>Impact</th><th>Source</th></tr>`);
    for (const idea of data.synthesis.topIdeas) {
      lines.push(
        `<tr><td><strong>${idea.title}</strong><br/>${idea.description}</td><td>${idea.feasibility}</td><td>${idea.potentialImpact}</td><td>${idea.sourceAngle}</td></tr>`
      );
    }
    lines.push(`</table>`);

    lines.push(`<h2>Recommendation</h2><p>${data.synthesis.recommendation}</p>`);
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const confluenceData = JSON.stringify(
    {
      spaceKey: config?.spaceKey ?? "INNOV",
      title,
      body: { storage: { value: lines.join("\n"), representation: "storage" } },
    },
    null,
    2
  );

  return {
    content: confluenceData,
    mimeType: "application/json",
    extension: ".confluence.json",
    filename: `innovation-${slug}.confluence.json`,
  };
}

/**
 * Export to Notion-compatible format.
 */
export function exportToNotion(data: ExportData): ExportResult {
  const blocks: Array<{ type: string; content: unknown }> = [];

  blocks.push({
    type: "heading_1",
    content: { text: `Innovation Report: ${data.subject}` },
  });

  blocks.push({
    type: "paragraph",
    content: { text: `Generated on ${new Date().toISOString().split("T")[0]}` },
  });

  if (data.investigation) {
    blocks.push({ type: "heading_2", content: { text: "Investigation Summary" } });
    blocks.push({ type: "paragraph", content: { text: data.investigation.summary } });

    blocks.push({ type: "heading_3", content: { text: "Key Aspects" } });
    for (const aspect of data.investigation.keyAspects) {
      blocks.push({
        type: "bulleted_list_item",
        content: { text: `**${aspect.title}**: ${aspect.description}` },
      });
    }

    blocks.push({ type: "heading_3", content: { text: "Challenges" } });
    for (const c of data.investigation.challenges) {
      blocks.push({ type: "bulleted_list_item", content: { text: c } });
    }

    blocks.push({ type: "heading_3", content: { text: "Opportunities" } });
    for (const o of data.investigation.opportunities) {
      blocks.push({ type: "bulleted_list_item", content: { text: o } });
    }
  }

  if (data.synthesis) {
    blocks.push({ type: "heading_2", content: { text: "Top Ideas" } });
    for (const idea of data.synthesis.topIdeas) {
      blocks.push({ type: "heading_3", content: { text: idea.title } });
      blocks.push({ type: "paragraph", content: { text: idea.description } });
      blocks.push({
        type: "callout",
        content: {
          text: `Feasibility: ${idea.feasibility} | Impact: ${idea.potentialImpact} | Source: ${idea.sourceAngle}`,
        },
      });
    }

    blocks.push({ type: "heading_2", content: { text: "Recommendation" } });
    blocks.push({ type: "paragraph", content: { text: data.synthesis.recommendation } });
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);

  return {
    content: JSON.stringify({ blocks, metadata: { subject: data.subject } }, null, 2),
    mimeType: "application/json",
    extension: ".notion.json",
    filename: `innovation-${slug}.notion.json`,
  };
}

/**
 * Export to Google Slides-compatible format.
 */
export function exportToGoogleSlides(data: ExportData): ExportResult {
  const slides: Array<{
    layout: string;
    elements: Array<{ type: string; text: string; position?: string }>;
  }> = [];

  // Title slide
  slides.push({
    layout: "TITLE",
    elements: [
      { type: "title", text: `Innovation Report: ${data.subject}` },
      { type: "subtitle", text: `Generated on ${new Date().toISOString().split("T")[0]}` },
    ],
  });

  // Investigation slide
  if (data.investigation) {
    slides.push({
      layout: "TITLE_AND_BODY",
      elements: [
        { type: "title", text: "Investigation Summary" },
        { type: "body", text: data.investigation.summary },
      ],
    });

    const aspectsText = data.investigation.keyAspects
      .map((a) => `• ${a.title}: ${a.description}`)
      .join("\n");
    slides.push({
      layout: "TITLE_AND_BODY",
      elements: [
        { type: "title", text: "Key Aspects" },
        { type: "body", text: aspectsText },
      ],
    });
  }

  // Idea slides
  if (data.synthesis) {
    for (const idea of data.synthesis.topIdeas) {
      slides.push({
        layout: "TITLE_AND_TWO_COLUMNS",
        elements: [
          { type: "title", text: idea.title },
          { type: "body", text: idea.description, position: "left" },
          {
            type: "body",
            text: `Feasibility: ${idea.feasibility}\nImpact: ${idea.potentialImpact}\nSource: ${idea.sourceAngle}`,
            position: "right",
          },
        ],
      });
    }

    slides.push({
      layout: "TITLE_AND_BODY",
      elements: [
        { type: "title", text: "Recommendation" },
        { type: "body", text: data.synthesis.recommendation },
      ],
    });
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);

  return {
    content: JSON.stringify({ slides, metadata: { subject: data.subject } }, null, 2),
    mimeType: "application/json",
    extension: ".gslides.json",
    filename: `innovation-${slug}.gslides.json`,
  };
}

/**
 * Export to CSV format (spreadsheet-compatible).
 * If synthesis is available, exports top ideas; otherwise exports all angle ideas.
 */
export function exportToCsv(data: ExportData): ExportResult {
  const header = "Title,Description,Impact,Feasibility,Source Angle,Implementation Hint";
  const rows: string[] = [header];

  if (data.synthesis) {
    for (const idea of data.synthesis.topIdeas) {
      rows.push(
        [
          csvEscape(idea.title),
          csvEscape(idea.description),
          csvEscape(idea.potentialImpact),
          csvEscape(idea.feasibility),
          csvEscape(idea.sourceAngle),
          csvEscape(""),
        ].join(",")
      );
    }
  } else {
    for (const angle of data.angleResults) {
      for (const idea of angle.ideas) {
        rows.push(
          [
            csvEscape(idea.title),
            csvEscape(idea.description),
            csvEscape(idea.potentialImpact),
            csvEscape(""),
            csvEscape(angle.angleName),
            csvEscape(idea.implementationHint),
          ].join(",")
        );
      }
    }
  }

  const slug = data.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);

  return {
    content: rows.join("\n"),
    mimeType: "text/csv",
    extension: ".csv",
    filename: `innovation-${slug}.csv`,
  };
}

/** Get all available export formats. */
export function getAvailableFormats(): Array<{ id: string; name: string; extension: string }> {
  return [
    { id: "markdown", name: "Markdown", extension: ".md" },
    { id: "json", name: "JSON", extension: ".json" },
    { id: "github-issue", name: "GitHub Issue", extension: ".md" },
    { id: "clipboard", name: "Clipboard Text", extension: ".txt" },
    { id: "csv", name: "CSV (Spreadsheet)", extension: ".csv" },
    { id: "powerpoint", name: "PowerPoint (JSON)", extension: ".pptx.json" },
    { id: "jira", name: "Jira Issues (JSON)", extension: ".jira.json" },
    { id: "confluence", name: "Confluence (JSON)", extension: ".confluence.json" },
    { id: "notion", name: "Notion (JSON)", extension: ".notion.json" },
    { id: "google-slides", name: "Google Slides (JSON)", extension: ".gslides.json" },
  ];
}
