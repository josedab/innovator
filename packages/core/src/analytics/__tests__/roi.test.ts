import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { calculateROI, roiToMarkdown } from "../roi.js";
import type { AnalyticsEvent } from "../index.js";

/** Helper to create a typed analytics event without hitting the filesystem. */
function makeEvent(type: AnalyticsEvent["type"], data?: Record<string, unknown>): AnalyticsEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

describe("analytics/roi", () => {
  describe("calculateROI", () => {
    it("should return empty report with no events", () => {
      const report = calculateROI({}, []);
      expect(report.investment.totalSessions).toBe(0);
      expect(report.returns.totalIdeas).toBe(0);
      expect(report.roi.roiPercent).toBe(0);
      expect(report.currency).toBe("USD");
    });

    it("should compute investment from sessions", () => {
      const events = [
        makeEvent("pipeline_completed", {}),
        makeEvent("pipeline_completed", {}),
        makeEvent("pipeline_completed", {}),
      ];

      const report = calculateROI({ costPerSession: 10, costPerHour: 60 }, events);
      expect(report.investment.totalSessions).toBe(3);
      expect(report.investment.sessionCost).toBe(30);
      expect(report.investment.totalCost).toBeGreaterThan(0);
    });

    it("should compute returns from ideas", () => {
      const events = [
        makeEvent("angle_generated", { ideaCount: 5 }),
        makeEvent("angle_generated", { ideaCount: 3 }),
        makeEvent("session_exported", {}),
      ];

      const report = calculateROI(
        {
          valuePerImplementedIdea: 1000,
          implementationRate: 0.5,
          valuePerExportedReport: 100,
        },
        events
      );
      expect(report.returns.totalIdeas).toBe(8);
      expect(report.returns.estimatedImplemented).toBe(4);
      expect(report.returns.totalExports).toBe(1);
      expect(report.returns.ideaValue).toBe(4000);
      expect(report.returns.exportValue).toBe(100);
    });

    it("should handle zero cost gracefully (no division by zero)", () => {
      const report = calculateROI({ costPerSession: 0, costPerHour: 0 }, []);
      expect(report.roi.roiPercent).toBe(0);
      expect(report.roi.paybackSessions).toBe(0);
    });

    it("should accept custom currency", () => {
      const report = calculateROI({ currency: "EUR" }, []);
      expect(report.currency).toBe("EUR");
    });

    it("should clamp paybackSessions to 0 when value < cost", () => {
      const events = [makeEvent("pipeline_completed", {})];
      const report = calculateROI(
        {
          costPerSession: 1000,
          valuePerImplementedIdea: 1,
          implementationRate: 0.01,
        },
        events
      );
      expect(report.roi.paybackSessions).toBe(0);
    });
  });

  describe("roiToMarkdown", () => {
    it("should generate readable markdown", () => {
      const report = calculateROI({}, []);
      const md = roiToMarkdown(report);
      expect(md).toContain("Innovation ROI Report");
      expect(md).toContain("Investment");
      expect(md).toContain("Returns");
      expect(md).toContain("ROI Metrics");
    });

    it("should include currency in output", () => {
      const report = calculateROI({ currency: "GBP" }, []);
      const md = roiToMarkdown(report);
      expect(md).toContain("GBP");
    });
  });
});
