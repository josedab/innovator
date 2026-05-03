import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((_label: string, val: string) => val),
}));

const {
  DecisionPacketSchema,
  RiskLevelSchema,
  OptionSchema,
  decisionPacketToMarkdown,
  decisionPacketToSlidesJson,
} = await import("../decision/index.js");

type DecisionPacket = z.infer<typeof DecisionPacketSchema>;

const samplePacket: DecisionPacket = {
  title: "Decision: Adopt Solar Tech",
  executiveSummary: "We recommend solar adoption.",
  problemStatement: "Energy costs are rising.",
  context: "Market trends favor renewables.",
  options: [
    {
      name: "Option A",
      description: "Full solar installation",
      pros: ["Cost savings", "Green energy"],
      cons: ["High upfront cost"],
      effort: "high",
      impact: "high",
      timeToValue: "6 months",
      cost: "$200K",
    },
    {
      name: "Option B",
      description: "Partial solar with battery",
      pros: ["Moderate cost"],
      cons: ["Lower impact"],
      effort: "medium",
      impact: "medium",
      timeToValue: "3 months",
      cost: "$80K",
    },
  ],
  recommendation: {
    selectedOption: "Option A",
    rationale: "Best long-term ROI",
    nextSteps: ["Vendor selection", "Site survey"],
  },
  risks: [
    {
      risk: "Supply chain delay",
      level: "medium",
      likelihood: "possible",
      impact: "Project delayed 2 months",
      mitigation: "Secure early contracts",
    },
  ],
  resourceAsk: [
    {
      category: "Engineering",
      description: "Solar installation team",
      quantity: "3 FTEs",
      priority: "must-have",
    },
  ],
  timeline: "Q1: Procurement, Q2: Installation",
  successCriteria: ["30% energy cost reduction", "Zero downtime during install"],
};

describe("decision", () => {
  describe("Zod schemas", () => {
    it("RiskLevelSchema validates valid levels", () => {
      expect(RiskLevelSchema.parse("low")).toBe("low");
      expect(RiskLevelSchema.parse("medium")).toBe("medium");
      expect(RiskLevelSchema.parse("high")).toBe("high");
      expect(RiskLevelSchema.parse("critical")).toBe("critical");
    });

    it("RiskLevelSchema rejects invalid values", () => {
      expect(() => RiskLevelSchema.parse("extreme")).toThrow();
    });

    it("OptionSchema validates correct shape", () => {
      const result = OptionSchema.safeParse(samplePacket.options[0]);
      expect(result.success).toBe(true);
    });

    it("OptionSchema rejects missing required fields", () => {
      const result = OptionSchema.safeParse({ name: "only name" });
      expect(result.success).toBe(false);
    });

    it("DecisionPacketSchema validates full packet", () => {
      const result = DecisionPacketSchema.safeParse(samplePacket);
      expect(result.success).toBe(true);
    });

    it("DecisionPacketSchema rejects missing fields", () => {
      const result = DecisionPacketSchema.safeParse({ title: "only title" });
      expect(result.success).toBe(false);
    });
  });

  describe("decisionPacketToMarkdown", () => {
    it("includes all sections", () => {
      const md = decisionPacketToMarkdown(samplePacket);
      expect(md).toContain("# Decision: Adopt Solar Tech");
      expect(md).toContain("## Executive Summary");
      expect(md).toContain("## Problem Statement");
      expect(md).toContain("## Context");
      expect(md).toContain("## Options Matrix");
      expect(md).toContain("## ⭐ Recommendation");
      expect(md).toContain("## Risk Assessment");
      expect(md).toContain("## Resource Requirements");
      expect(md).toContain("## Timeline");
      expect(md).toContain("## Success Criteria");
      expect(md).toContain("Option A");
      expect(md).toContain("Option B");
      expect(md).toContain("✅ Cost savings");
      expect(md).toContain("❌ High upfront cost");
      expect(md).toContain("Vendor selection");
    });

    it("uses default branding when none provided", () => {
      const md = decisionPacketToMarkdown(samplePacket);
      expect(md).toContain("Innovation Team");
    });

    it("uses custom branding", () => {
      const md = decisionPacketToMarkdown(samplePacket, { companyName: "Acme Corp" });
      expect(md).toContain("Acme Corp");
      expect(md).not.toContain("Innovation Team");
    });

    it("handles empty companyName in branding", () => {
      const md = decisionPacketToMarkdown(samplePacket, { companyName: "" });
      // Empty string passes ?? check, so it will be used as-is
      expect(md).toContain("Prepared by");
    });

    it("handles packet with empty arrays", () => {
      const emptyPacket: DecisionPacket = {
        ...samplePacket,
        options: [],
        risks: [],
        resourceAsk: [],
        recommendation: { selectedOption: "None", rationale: "N/A", nextSteps: [] },
        successCriteria: [],
      };
      const md = decisionPacketToMarkdown(emptyPacket);
      expect(md).toContain("## Options Matrix");
      expect(md).toContain("## Success Criteria");
    });
  });

  describe("decisionPacketToSlidesJson", () => {
    it("produces correct slide structure", () => {
      const result = decisionPacketToSlidesJson(samplePacket);
      expect(result.format).toBe("google-slides");
      expect(Array.isArray(result.slides)).toBe(true);
      const slides = result.slides as Array<Record<string, unknown>>;

      // Check title slide
      expect(slides[0].layout).toBe("TITLE");
      expect(slides[0].title).toBe("Decision: Adopt Solar Tech");

      // Check executive summary slide
      expect(slides[1].layout).toBe("SECTION_HEADER");
      expect(slides[1].title).toBe("Executive Summary");

      // Check problem statement slide
      expect(slides[2].layout).toBe("TITLE_AND_BODY");
      expect(slides[2].title).toBe("Problem Statement");

      // Check options matrix table
      expect(slides[3].layout).toBe("TABLE");
      expect(slides[3].title).toBe("Options Matrix");

      // Check per-option TWO_COLUMN slides
      expect(slides[4].layout).toBe("TWO_COLUMN");
      expect(slides[4].title).toBe("Option A");
      expect(slides[5].layout).toBe("TWO_COLUMN");
      expect(slides[5].title).toBe("Option B");
    });

    it("handles zero options", () => {
      const emptyPacket: DecisionPacket = {
        ...samplePacket,
        options: [],
      };
      const result = decisionPacketToSlidesJson(emptyPacket);
      const slides = result.slides as Array<Record<string, unknown>>;
      // Should have standard slides without TWO_COLUMN option slides
      const twoColSlides = slides.filter((s) => s.layout === "TWO_COLUMN");
      expect(twoColSlides).toHaveLength(0);
    });
  });
});
