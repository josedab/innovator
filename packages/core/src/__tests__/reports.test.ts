import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExportData } from "../types.js";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

import {
  REPORT_TEMPLATES,
  generateMethodologySection,
  generateIdeaCards,
  generateAppendices,
  generateExecutiveSummary,
  generateRoadmap,
  generateRiskMatrix,
  buildReport,
  renderReportHTML,
  renderReportMarkdown,
  renderReport,
  generateShareablePayload,
} from "../reports/index.js";
import type { Report, ReportSection } from "../reports/index.js";

const MOCK_DATA: ExportData = {
  subject: "Test Innovation",
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      reasoning: "Applied SCAMPER",
      ideas: [
        {
          title: "Idea 1",
          description: "Description 1",
          potentialImpact: "High",
          implementationHint: "Do it",
        },
      ],
    },
  ],
};

const MOCK_DATA_WITH_SYNTHESIS: ExportData = {
  ...MOCK_DATA,
  investigation: {
    summary: "Investigation summary text",
    keyAspects: [{ title: "Aspect", description: "Details" }],
    currentState: "Current state",
    challenges: ["Challenge 1"],
    opportunities: ["Opportunity 1"],
  },
  synthesis: {
    topIdeas: [
      {
        title: "Top Idea",
        description: "Top description",
        sourceAngle: "SCAMPER",
        potentialImpact: "High",
        feasibility: "high",
      },
    ],
    themes: ["Theme A", "Theme B"],
    recommendation: "Recommendation text",
  },
  metadata: { version: "1.0" },
};

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: "Innovation Report: Test Innovation",
    sections: [
      { id: "executive-summary", title: "Executive Summary", content: "<p>Summary</p>", order: 0 },
      { id: "methodology", title: "Methodology", content: "<p>Method</p>", order: 1 },
    ],
    branding: {
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      fontFamily: "system-ui, -apple-system, sans-serif",
    },
    format: "html",
    generatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- REPORT_TEMPLATES ----

describe("REPORT_TEMPLATES", () => {
  it("contains exactly 3 templates", () => {
    expect(REPORT_TEMPLATES).toHaveLength(3);
  });

  it("has comprehensive, executive-brief, and technical-deep-dive", () => {
    const ids = REPORT_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["comprehensive", "executive-brief", "technical-deep-dive"]);
  });

  it("each template has valid structure", () => {
    for (const t of REPORT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.sections.length).toBeGreaterThan(0);
      expect(t.format).toBe("html");
    }
  });
});

// ---- generateMethodologySection ----

describe("generateMethodologySection", () => {
  it("returns a ReportSection with id 'methodology'", () => {
    const section = generateMethodologySection(MOCK_DATA);
    expect(section.id).toBe("methodology");
    expect(section.title).toBe("Methodology");
    expect(section.order).toBe(1);
  });

  it("includes the subject and angle information", () => {
    const section = generateMethodologySection(MOCK_DATA);
    expect(section.content).toContain("Test Innovation");
    expect(section.content).toContain("SCAMPER");
    expect(section.content).toContain("scamper");
  });

  it("includes investigation summary when present", () => {
    const section = generateMethodologySection(MOCK_DATA_WITH_SYNTHESIS);
    expect(section.content).toContain("Investigation summary text");
  });

  it("truncates long reasoning to 200 chars with ellipsis", () => {
    const longReasoning = "A".repeat(250);
    const data: ExportData = {
      subject: "Test",
      angleResults: [{ angleId: "x", angleName: "X", reasoning: longReasoning, ideas: [] }],
    };
    const section = generateMethodologySection(data);
    expect(section.content).toContain("…");
    expect(section.content).not.toContain(longReasoning);
  });
});

// ---- generateIdeaCards ----

describe("generateIdeaCards", () => {
  it("returns a ReportSection with id 'idea-cards'", () => {
    const section = generateIdeaCards(MOCK_DATA);
    expect(section.id).toBe("idea-cards");
    expect(section.title).toBe("Innovation Ideas");
    expect(section.order).toBe(2);
  });

  it("renders idea content in cards", () => {
    const section = generateIdeaCards(MOCK_DATA);
    expect(section.content).toContain("Idea 1");
    expect(section.content).toContain("Description 1");
    expect(section.content).toContain("High");
    expect(section.content).toContain("Do it");
    expect(section.content).toContain("SCAMPER");
  });

  it("includes score when scores map is provided", () => {
    const scores = new Map([["Idea 1", 8]]);
    const section = generateIdeaCards(MOCK_DATA, scores);
    expect(section.content).toContain("Score: 8/10");
  });

  it("omits score badge when no matching score", () => {
    const scores = new Map([["Other Idea", 5]]);
    const section = generateIdeaCards(MOCK_DATA, scores);
    expect(section.content).not.toContain("idea-score");
  });
});

// ---- generateAppendices ----

describe("generateAppendices", () => {
  it("returns a ReportSection with id 'appendices'", () => {
    const section = generateAppendices(MOCK_DATA);
    expect(section.id).toBe("appendices");
    expect(section.title).toBe("Appendices");
    expect(section.order).toBe(5);
  });

  it("includes raw angle results", () => {
    const section = generateAppendices(MOCK_DATA);
    expect(section.content).toContain("Raw Angle Results");
    expect(section.content).toContain("SCAMPER");
  });

  it("includes investigation, synthesis, and metadata when present", () => {
    const section = generateAppendices(MOCK_DATA_WITH_SYNTHESIS);
    expect(section.content).toContain("Investigation Data");
    expect(section.content).toContain("Synthesis Data");
    expect(section.content).toContain("Metadata");
  });
});

// ---- generateExecutiveSummary ----

describe("generateExecutiveSummary", () => {
  it("returns executive-summary section from LLM response", async () => {
    mockGenerateText.mockResolvedValue("<p>Executive summary content</p>");
    const section = await generateExecutiveSummary(MOCK_DATA);
    expect(section.id).toBe("executive-summary");
    expect(section.title).toBe("Executive Summary");
    expect(section.content).toBe("<p>Executive summary content</p>");
    expect(section.order).toBe(0);
  });

  it("passes model and signal to generateText", async () => {
    mockGenerateText.mockResolvedValue("<p>Summary</p>");
    const controller = new AbortController();
    await generateExecutiveSummary(MOCK_DATA, "gpt-4", controller.signal);
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4", signal: controller.signal })
    );
  });
});

// ---- generateRoadmap ----

describe("generateRoadmap", () => {
  it("returns roadmap section from LLM response", async () => {
    mockGenerateText.mockResolvedValue("<h3>Phase 1</h3>");
    const section = await generateRoadmap(MOCK_DATA);
    expect(section.id).toBe("roadmap");
    expect(section.title).toBe("Implementation Roadmap");
    expect(section.content).toBe("<h3>Phase 1</h3>");
    expect(section.order).toBe(3);
  });
});

// ---- generateRiskMatrix ----

describe("generateRiskMatrix", () => {
  it("returns risk-matrix section from LLM response", async () => {
    mockGenerateText.mockResolvedValue("<table><tr><td>Risk</td></tr></table>");
    const section = await generateRiskMatrix(MOCK_DATA);
    expect(section.id).toBe("risk-matrix");
    expect(section.title).toBe("Risk Matrix");
    expect(section.content).toContain("<table>");
    expect(section.order).toBe(4);
  });
});

// ---- buildReport ----

describe("buildReport", () => {
  it("assembles sections from default template", async () => {
    mockGenerateText.mockResolvedValue("<p>LLM content</p>");
    const report = await buildReport({ data: MOCK_DATA });
    expect(report.title).toBe("Innovation Report: Test Innovation");
    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.format).toBe("html");
    expect(report.generatedAt).toBeTruthy();
  });

  it("uses only requested sections when specified", async () => {
    const report = await buildReport({
      data: MOCK_DATA,
      sections: ["methodology", "appendices"],
    });
    const ids = report.sections.map((s) => s.id);
    expect(ids).toContain("methodology");
    expect(ids).toContain("appendices");
    expect(ids).not.toContain("executive-summary");
  });

  it("applies branding overrides", async () => {
    const report = await buildReport({
      data: MOCK_DATA,
      sections: ["methodology"],
      branding: { primaryColor: "#ff0000" },
    });
    expect(report.branding.primaryColor).toBe("#ff0000");
  });
});

// ---- renderReportHTML ----

describe("renderReportHTML", () => {
  it("produces a self-contained HTML document", () => {
    const html = renderReportHTML(makeReport());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>");
    expect(html).toContain("Test Innovation");
    expect(html).toContain("</html>");
  });

  it("includes inline CSS with branding variables", () => {
    const html = renderReportHTML(makeReport());
    expect(html).toContain("--primary: #2563eb");
    expect(html).toContain("--secondary: #64748b");
  });

  it("renders all sections", () => {
    const html = renderReportHTML(makeReport());
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Methodology");
  });
});

// ---- renderReportMarkdown ----

describe("renderReportMarkdown", () => {
  it("produces markdown with title and sections", () => {
    const md = renderReportMarkdown(makeReport());
    expect(md).toContain("# Innovation Report: Test Innovation");
    expect(md).toContain("## Executive Summary");
    expect(md).toContain("## Methodology");
  });

  it("includes generated-at timestamp", () => {
    const md = renderReportMarkdown(makeReport());
    expect(md).toContain("2024-01-01T00:00:00.000Z");
  });
});

// ---- renderReport ----

describe("renderReport", () => {
  it("returns html content for html format", () => {
    const result = renderReport(makeReport({ format: "html" }));
    expect(result.mimeType).toBe("text/html");
    expect(result.content).toContain("<!DOCTYPE html>");
  });

  it("returns markdown content for markdown format", () => {
    const result = renderReport(makeReport({ format: "markdown" }));
    expect(result.mimeType).toBe("text/markdown");
    expect(result.content).toContain("# Innovation Report");
  });

  it("falls back to HTML for pdf format", () => {
    const result = renderReport(makeReport({ format: "pdf" }));
    expect(result.mimeType).toBe("text/html");
    expect(result.content).toContain("<!DOCTYPE html>");
  });
});

// ---- generateShareablePayload ----

describe("generateShareablePayload", () => {
  it("returns a base64-encoded string", () => {
    const payload = generateShareablePayload(makeReport());
    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(0);
  });

  it("decodes back to valid JSON with expected fields", () => {
    const report = makeReport();
    const payload = generateShareablePayload(report);
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    expect(decoded.title).toBe(report.title);
    expect(decoded.generatedAt).toBe(report.generatedAt);
    expect(decoded.sections).toHaveLength(report.sections.length);
  });
});
