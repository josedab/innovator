/**
 * Tests for the Innovation Analytics executive report module.
 */
vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateExecutiveReport, executiveReportToMarkdown } from "../executive-report.js";
import { trackEvent, clearAnalytics } from "../index.js";

beforeEach(() => {
  clearAnalytics();
});

describe("executive-report", () => {
  describe("generateExecutiveReport", () => {
    it("generates report with no events", () => {
      const report = generateExecutiveReport("Test Period");

      expect(report.id).toMatch(/^report-/);
      expect(report.title).toContain("Test Period");
      expect(report.highlights).toHaveLength(4);
      expect(report.sections.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeDefined();
    });

    it("generates report with tracked events", () => {
      trackEvent("pipeline_started", { subject: "AI" });
      trackEvent("pipeline_completed", { subject: "AI" });
      trackEvent("angle_generated", { angleId: "scamper", ideaCount: 5 });
      trackEvent("angle_generated", { angleId: "first-principles", ideaCount: 3 });
      trackEvent("session_exported", {});

      const report = generateExecutiveReport();

      expect(report.highlights.find((h) => h.metric === "Innovation Sessions")).toBeDefined();
      expect(report.highlights.find((h) => h.metric === "Ideas Generated")).toBeDefined();

      const velocitySection = report.sections.find((s) => s.title === "Innovation Velocity");
      expect(velocitySection).toBeDefined();
      expect(velocitySection!.chartType).toBe("velocity");
    });

    it("includes funnel data", () => {
      trackEvent("pipeline_started");
      trackEvent("pipeline_completed");

      const report = generateExecutiveReport();
      const funnelSection = report.sections.find((s) => s.title === "Innovation Funnel");
      expect(funnelSection).toBeDefined();
      expect(funnelSection!.chartType).toBe("funnel");
    });

    it("includes ROI section", () => {
      const report = generateExecutiveReport();
      const roiSection = report.sections.find((s) => s.title === "ROI Analysis");
      expect(roiSection).toBeDefined();
      expect(roiSection!.chartType).toBe("roi");
    });

    it("generates actionable recommendations", () => {
      const report = generateExecutiveReport();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("executiveReportToMarkdown", () => {
    it("formats report as markdown", () => {
      const report = generateExecutiveReport("Q1 2026");
      const md = executiveReportToMarkdown(report);

      expect(md).toContain("Innovation Executive Report");
      expect(md).toContain("Q1 2026");
      expect(md).toContain("Key Highlights");
      expect(md).toContain("Executive Summary");
      expect(md).toContain("Recommendations");
    });

    it("includes trend arrows", () => {
      trackEvent("pipeline_started");
      trackEvent("pipeline_completed");

      const report = generateExecutiveReport();
      const md = executiveReportToMarkdown(report);

      // Should contain at least one trend arrow
      expect(md).toMatch(/[↑↓→]/);
    });
  });
});
