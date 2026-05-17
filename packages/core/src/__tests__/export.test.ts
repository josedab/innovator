import { describe, it, expect } from "vitest";
import {
  exportToMarkdown,
  exportToJson,
  exportToClipboard,
  exportToCsv,
  generateGitHubIssueBody,
  exportToPowerPoint,
  exportToJira,
  exportToConfluence,
  exportToNotion,
  exportToGoogleSlides,
  getAvailableFormats,
} from "../export/index.js";
import type { ExportData } from "../types.js";

const sampleData: ExportData = {
  subject: "Solar Energy Innovation",
  investigation: {
    summary: "Solar energy is a growing field",
    keyAspects: [{ title: "Efficiency", description: "Panel efficiency improvements" }],
    currentState: "Rapid growth in adoption",
    challenges: ["Cost of storage", "Grid integration"],
    opportunities: ["Perovskite cells", "Building-integrated PV"],
  },
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Solar Paint",
          description: "Paint that generates electricity",
          potentialImpact: "Revolutionary building integration",
          implementationHint: "Partner with paint manufacturers",
        },
      ],
      reasoning: "Applied SCAMPER substitution method",
    },
  ],
  synthesis: {
    topIdeas: [
      {
        title: "Solar Paint",
        description: "Paint that generates electricity",
        sourceAngle: "SCAMPER",
        potentialImpact: "Revolutionary",
        feasibility: "medium",
      },
    ],
    themes: ["Building integration", "Cost reduction"],
    recommendation: "Focus on building-integrated solutions",
  },
};

describe("export", () => {
  describe("exportToMarkdown", () => {
    it("generates valid markdown", () => {
      const result = exportToMarkdown(sampleData);
      expect(result.content).toContain("# Innovation Report: Solar Energy Innovation");
      expect(result.content).toContain("## Investigation");
      expect(result.content).toContain("## Innovation Ideas by Angle");
      expect(result.content).toContain("## Synthesis");
      expect(result.content).toContain("Solar Paint");
      expect(result.extension).toBe(".md");
      expect(result.mimeType).toBe("text/markdown");
    });
  });

  describe("exportToJson", () => {
    it("generates valid JSON", () => {
      const result = exportToJson(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.subject).toBe("Solar Energy Innovation");
      expect(result.extension).toBe(".json");
    });
  });

  describe("exportToClipboard", () => {
    it("generates plain text summary", () => {
      const text = exportToClipboard(sampleData);
      expect(text).toContain("Solar Energy Innovation");
      expect(text).toContain("Solar Paint");
      expect(text).toContain("Recommendation");
    });
  });

  describe("generateGitHubIssueBody", () => {
    it("generates issue with title and body", () => {
      const issue = generateGitHubIssueBody(sampleData);
      expect(issue.title).toContain("Solar Energy Innovation");
      expect(issue.body).toContain("Solar Paint");
      expect(issue.labels).toContain("innovation");
    });

    it("includes checkboxes for ideas", () => {
      const issue = generateGitHubIssueBody(sampleData);
      expect(issue.body).toContain("- [ ]");
    });
  });

  describe("handles minimal data", () => {
    it("exports with no synthesis", () => {
      const data: ExportData = {
        subject: "Test",
        angleResults: [],
      };
      const result = exportToMarkdown(data);
      expect(result.content).toContain("# Innovation Report: Test");
    });

    it("exports with no investigation", () => {
      const data: ExportData = {
        subject: "No Investigation",
        angleResults: [
          {
            angleId: "a1",
            angleName: "Angle 1",
            ideas: [
              {
                title: "Idea",
                description: "Desc",
                potentialImpact: "Impact",
                implementationHint: "Hint",
              },
            ],
            reasoning: "Reasoning",
          },
        ],
      };
      const result = exportToMarkdown(data);
      expect(result.content).toContain("## Innovation Ideas by Angle");
      expect(result.content).not.toContain("## Investigation");
    });
  });

  describe("exportToJson - round trip fidelity", () => {
    it("JSON round-trip preserves all data fields", () => {
      const result = exportToJson(sampleData);
      const parsed = JSON.parse(result.content) as ExportData;
      expect(parsed.subject).toBe(sampleData.subject);
      expect(parsed.investigation?.summary).toBe(sampleData.investigation?.summary);
      expect(parsed.angleResults).toHaveLength(sampleData.angleResults.length);
      expect(parsed.synthesis?.topIdeas).toHaveLength(sampleData.synthesis?.topIdeas.length ?? 0);
      expect(parsed.synthesis?.themes).toEqual(sampleData.synthesis?.themes);
      expect(parsed.synthesis?.recommendation).toBe(sampleData.synthesis?.recommendation);
    });

    it("JSON round-trip preserves nested idea details", () => {
      const result = exportToJson(sampleData);
      const parsed = JSON.parse(result.content) as ExportData;
      const idea = parsed.angleResults[0].ideas[0];
      expect(idea.title).toBe("Solar Paint");
      expect(idea.description).toBe("Paint that generates electricity");
      expect(idea.potentialImpact).toBe("Revolutionary building integration");
      expect(idea.implementationHint).toBe("Partner with paint manufacturers");
    });
  });

  describe("special characters handling", () => {
    it("handles special characters in subject for slug generation", () => {
      const data: ExportData = {
        subject: 'Test & Special <Characters> "Quotes"',
        angleResults: [],
      };
      const result = exportToMarkdown(data);
      expect(result.filename).not.toContain("&");
      expect(result.filename).not.toContain("<");
      expect(result.filename).toMatch(/^innovation-[a-z0-9-]+\.md$/);
    });

    it("handles very long subject (slug truncated to 50 chars)", () => {
      const longSubject = "A".repeat(100);
      const data: ExportData = { subject: longSubject, angleResults: [] };
      const result = exportToMarkdown(data);
      // slug is max 50 chars + prefix "innovation-" + ".md"
      expect(result.filename.length).toBeLessThanOrEqual("innovation-".length + 50 + ".md".length);
    });

    it("handles markdown injection in content", () => {
      const data: ExportData = {
        subject: "# Injected Heading",
        angleResults: [
          {
            angleId: "a1",
            angleName: "Angle **bold**",
            ideas: [
              {
                title: "Idea with [link](http://evil.com)",
                description: "Description with `code` and *emphasis*",
                potentialImpact: "Impact",
                implementationHint: "Hint",
              },
            ],
            reasoning: "Reasoning",
          },
        ],
      };
      const result = exportToMarkdown(data);
      // Should still produce valid output without crashing
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe("exportToClipboard edge cases", () => {
    it("uses angleResults when no synthesis", () => {
      const data: ExportData = {
        subject: "Test",
        angleResults: [
          {
            angleId: "a1",
            angleName: "Angle 1",
            ideas: [
              {
                title: "Idea1",
                description: "Desc1",
                potentialImpact: "Impact",
                implementationHint: "Hint",
              },
            ],
            reasoning: "R",
          },
        ],
      };
      const text = exportToClipboard(data);
      expect(text).toContain("Angle 1:");
      expect(text).toContain("Idea1");
    });
  });

  describe("exportToCsv", () => {
    it("exports synthesis top ideas as CSV with headers", () => {
      const result = exportToCsv(sampleData);
      const lines = result.content.split("\n");
      expect(lines[0]).toBe(
        "Title,Description,Impact,Feasibility,Source Angle,Implementation Hint"
      );
      expect(lines.length).toBeGreaterThan(1);
      expect(result.extension).toBe(".csv");
      expect(result.mimeType).toBe("text/csv");
    });

    it("exports angle results when no synthesis", () => {
      const data: ExportData = {
        subject: "Test",
        angleResults: [
          {
            angleId: "scamper",
            angleName: "SCAMPER",
            ideas: [
              {
                title: "Idea A",
                description: "Desc A",
                potentialImpact: "High",
                implementationHint: "Step 1",
              },
            ],
            reasoning: "R",
          },
        ],
      };
      const result = exportToCsv(data);
      const lines = result.content.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain("Idea A");
      expect(lines[1]).toContain("SCAMPER");
    });

    it("escapes commas and quotes in CSV values", () => {
      const data: ExportData = {
        subject: "Test",
        angleResults: [
          {
            angleId: "a1",
            angleName: "Test, Angle",
            ideas: [
              {
                title: 'Idea with "quotes"',
                description: "Normal desc",
                potentialImpact: "High",
                implementationHint: "Hint",
              },
            ],
            reasoning: "R",
          },
        ],
      };
      const result = exportToCsv(data);
      expect(result.content).toContain('"Test, Angle"');
      expect(result.content).toContain('"Idea with ""quotes"""');
    });

    it("returns only header for empty data", () => {
      const data: ExportData = { subject: "Empty", angleResults: [] };
      const result = exportToCsv(data);
      const lines = result.content.split("\n");
      expect(lines).toHaveLength(1);
    });
  });

  describe("exportToPowerPoint", () => {
    it("generates structured slide data with title slide", () => {
      const result = exportToPowerPoint(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.slides.length).toBeGreaterThanOrEqual(1);
      expect(parsed.slides[0].title).toContain("Innovation Report");
      expect(parsed.metadata.subject).toBe("Solar Energy Innovation");
      expect(result.extension).toBe(".pptx.json");
      expect(result.mimeType).toBe("application/json");
    });

    it("includes investigation and synthesis slides", () => {
      const result = exportToPowerPoint(sampleData);
      const parsed = JSON.parse(result.content);
      const titles = parsed.slides.map((s: { title: string }) => s.title);
      expect(titles).toContain("Investigation Summary");
      expect(titles).toContain("Challenges & Opportunities");
      expect(titles).toContain("Themes & Recommendation");
    });

    it("handles empty angleResults", () => {
      const data: ExportData = { subject: "Empty", angleResults: [] };
      const result = exportToPowerPoint(data);
      const parsed = JSON.parse(result.content);
      expect(parsed.slides.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("exportToJira", () => {
    it("generates Jira JSON with epic and story issues", () => {
      const result = exportToJira(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.projectKey).toBe("INNOV");
      expect(parsed.issues.length).toBeGreaterThanOrEqual(2);
      expect(parsed.issues[0].issueType).toBe("Epic");
      expect(parsed.issues[0].epicName).toContain("Solar Energy Innovation");
      expect(result.extension).toBe(".jira.json");
    });

    it("uses custom config for projectKey and labels", () => {
      const result = exportToJira(sampleData, {
        projectKey: "MYPROJ",
        labels: ["custom-label"],
      });
      const parsed = JSON.parse(result.content);
      expect(parsed.projectKey).toBe("MYPROJ");
      expect(parsed.issues[0].labels).toContain("custom-label");
    });

    it("handles data without synthesis (falls back to angleResults)", () => {
      const data: ExportData = {
        subject: "Test",
        angleResults: [
          {
            angleId: "scamper",
            angleName: "SCAMPER",
            ideas: [
              {
                title: "Idea1",
                description: "Desc",
                potentialImpact: "High",
                implementationHint: "Start",
              },
            ],
            reasoning: "r",
          },
        ],
      };
      const result = exportToJira(data);
      const parsed = JSON.parse(result.content);
      // Epic + 1 idea
      expect(parsed.issues).toHaveLength(2);
    });

    it("handles empty angleResults with no synthesis", () => {
      const data: ExportData = { subject: "Empty", angleResults: [] };
      const result = exportToJira(data);
      const parsed = JSON.parse(result.content);
      expect(parsed.issues).toHaveLength(1); // just the epic
    });
  });

  describe("exportToConfluence", () => {
    it("generates Confluence XHTML storage format", () => {
      const result = exportToConfluence(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.spaceKey).toBe("INNOV");
      expect(parsed.body.storage.representation).toBe("storage");
      expect(parsed.body.storage.value).toContain("<h1>");
      expect(parsed.body.storage.value).toContain("Solar Energy Innovation");
      expect(result.extension).toBe(".confluence.json");
    });

    it("uses custom spaceKey and title", () => {
      const result = exportToConfluence(sampleData, {
        spaceKey: "TEAM",
        title: "Custom Title",
      });
      const parsed = JSON.parse(result.content);
      expect(parsed.spaceKey).toBe("TEAM");
      expect(parsed.title).toBe("Custom Title");
    });

    it("includes investigation table and synthesis table", () => {
      const result = exportToConfluence(sampleData);
      const parsed = JSON.parse(result.content);
      const html = parsed.body.storage.value;
      expect(html).toContain("<table>");
      expect(html).toContain("Efficiency");
      expect(html).toContain("Solar Paint");
    });

    it("handles special characters in text", () => {
      const data: ExportData = {
        subject: "Test <script>alert('xss')</script>",
        angleResults: [],
      };
      const result = exportToConfluence(data);
      expect(result.content).toBeDefined();
    });
  });

  describe("exportToNotion", () => {
    it("generates Notion block format", () => {
      const result = exportToNotion(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.blocks.length).toBeGreaterThan(0);
      expect(parsed.blocks[0].type).toBe("heading_1");
      expect(parsed.metadata.subject).toBe("Solar Energy Innovation");
      expect(result.extension).toBe(".notion.json");
    });

    it("includes correct block types for investigation", () => {
      const result = exportToNotion(sampleData);
      const parsed = JSON.parse(result.content);
      const types = parsed.blocks.map((b: { type: string }) => b.type);
      expect(types).toContain("heading_2");
      expect(types).toContain("heading_3");
      expect(types).toContain("bulleted_list_item");
      expect(types).toContain("paragraph");
    });

    it("includes callout blocks for synthesis ideas", () => {
      const result = exportToNotion(sampleData);
      const parsed = JSON.parse(result.content);
      const types = parsed.blocks.map((b: { type: string }) => b.type);
      expect(types).toContain("callout");
    });

    it("handles empty data", () => {
      const data: ExportData = { subject: "Empty", angleResults: [] };
      const result = exportToNotion(data);
      const parsed = JSON.parse(result.content);
      expect(parsed.blocks.length).toBeGreaterThanOrEqual(2); // heading + date
    });
  });

  describe("exportToGoogleSlides", () => {
    it("generates Google Slides format with correct layouts", () => {
      const result = exportToGoogleSlides(sampleData);
      const parsed = JSON.parse(result.content);
      expect(parsed.slides.length).toBeGreaterThan(0);
      expect(parsed.slides[0].layout).toBe("TITLE");
      expect(parsed.slides[0].elements[0].type).toBe("title");
      expect(result.extension).toBe(".gslides.json");
    });

    it("uses TITLE_AND_TWO_COLUMNS for idea slides", () => {
      const result = exportToGoogleSlides(sampleData);
      const parsed = JSON.parse(result.content);
      const layouts = parsed.slides.map((s: { layout: string }) => s.layout);
      expect(layouts).toContain("TITLE_AND_TWO_COLUMNS");
    });

    it("includes investigation slides", () => {
      const result = exportToGoogleSlides(sampleData);
      const parsed = JSON.parse(result.content);
      const titles = parsed.slides.flatMap((s: { elements: Array<{ text: string }> }) =>
        s.elements.map((e) => e.text)
      );
      expect(titles).toContain("Investigation Summary");
    });

    it("handles empty data with no investigation or synthesis", () => {
      const data: ExportData = { subject: "Minimal", angleResults: [] };
      const result = exportToGoogleSlides(data);
      const parsed = JSON.parse(result.content);
      expect(parsed.slides).toHaveLength(1); // title slide only
    });
  });

  describe("getAvailableFormats", () => {
    it("returns all 10 formats", () => {
      const formats = getAvailableFormats();
      expect(formats).toHaveLength(10);
    });

    it("includes all expected format IDs", () => {
      const formats = getAvailableFormats();
      const ids = formats.map((f) => f.id);
      expect(ids).toContain("markdown");
      expect(ids).toContain("json");
      expect(ids).toContain("github-issue");
      expect(ids).toContain("clipboard");
      expect(ids).toContain("powerpoint");
      expect(ids).toContain("jira");
      expect(ids).toContain("confluence");
      expect(ids).toContain("notion");
      expect(ids).toContain("google-slides");
    });
  });
});
