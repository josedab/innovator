import { describe, it, expect } from "vitest";
import {
  exportToMarkdown,
  exportToJson,
  exportToClipboard,
  generateGitHubIssueBody,
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
  });
});
