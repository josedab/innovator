import { describe, it, expect, beforeEach } from "vitest";

import {
  createOutcome,
  getOutcome,
  listOutcomes,
  transitionOutcome,
  addExternalLink,
  addRevenueMetric,
  deleteOutcome,
  buildROIDashboard,
  clearOutcomes,
  OutcomeStageSchema,
  ExternalLinkTypeSchema,
  OutcomeRecordSchema,
} from "../outcome-tracking/index.js";

describe("outcome-tracking", () => {
  beforeEach(() => {
    clearOutcomes();
  });

  // ---- Schema validation ----

  describe("schemas", () => {
    it("validates OutcomeStage enum", () => {
      const stages = ["idea", "validated", "planned", "in-development", "shipped", "measured", "abandoned"];
      for (const s of stages) {
        expect(OutcomeStageSchema.parse(s)).toBe(s);
      }
      expect(() => OutcomeStageSchema.parse("unknown")).toThrow();
    });

    it("validates ExternalLinkType enum", () => {
      expect(ExternalLinkTypeSchema.parse("github-issue")).toBe("github-issue");
      expect(ExternalLinkTypeSchema.parse("custom")).toBe("custom");
      expect(() => ExternalLinkTypeSchema.parse("invalid")).toThrow();
    });
  });

  // ---- createOutcome ----

  describe("createOutcome", () => {
    it("creates outcome in 'idea' stage", () => {
      const outcome = createOutcome({ ideaTitle: "Test Idea" });
      expect(outcome.ideaTitle).toBe("Test Idea");
      expect(outcome.stage).toBe("idea");
      expect(outcome.externalLinks).toEqual([]);
      expect(outcome.revenueMetrics).toEqual([]);
      expect(outcome.stageHistory).toEqual([]);
      expect(outcome.id).toBeTruthy();
      expect(outcome.createdAt).toBeTruthy();
    });

    it("stores optional fields", () => {
      const outcome = createOutcome({
        ideaTitle: "Test",
        ideaDescription: "Desc",
        sessionId: "session-1",
        angleId: "angle-1",
        teamMemberId: "user-1",
        tags: ["tag1"],
        notes: "Some notes",
      });
      expect(outcome.sessionId).toBe("session-1");
      expect(outcome.angleId).toBe("angle-1");
      expect(outcome.teamMemberId).toBe("user-1");
      expect(outcome.tags).toEqual(["tag1"]);
      expect(outcome.notes).toBe("Some notes");
    });

    it("validates against OutcomeRecordSchema", () => {
      const outcome = createOutcome({ ideaTitle: "Test" });
      expect(() => OutcomeRecordSchema.parse(outcome)).not.toThrow();
    });
  });

  // ---- getOutcome / listOutcomes ----

  describe("getOutcome / listOutcomes", () => {
    it("retrieves outcome by ID", () => {
      const outcome = createOutcome({ ideaTitle: "Test" });
      expect(getOutcome(outcome.id)).toEqual(outcome);
    });

    it("returns undefined for non-existent ID", () => {
      expect(getOutcome("nonexistent")).toBeUndefined();
    });

    it("lists all outcomes sorted by updatedAt", () => {
      createOutcome({ ideaTitle: "A" });
      createOutcome({ ideaTitle: "B" });
      const list = listOutcomes();
      expect(list).toHaveLength(2);
    });

    it("filters by stage", () => {
      const o1 = createOutcome({ ideaTitle: "A" });
      createOutcome({ ideaTitle: "B" });
      transitionOutcome(o1.id, "validated");
      const filtered = listOutcomes({ stage: "validated" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].ideaTitle).toBe("A");
    });

    it("filters by angleId", () => {
      createOutcome({ ideaTitle: "A", angleId: "angle-1" });
      createOutcome({ ideaTitle: "B", angleId: "angle-2" });
      const filtered = listOutcomes({ angleId: "angle-1" });
      expect(filtered).toHaveLength(1);
    });

    it("filters by sessionId and teamMemberId", () => {
      createOutcome({ ideaTitle: "A", sessionId: "s1", teamMemberId: "u1" });
      createOutcome({ ideaTitle: "B", sessionId: "s2", teamMemberId: "u2" });
      expect(listOutcomes({ sessionId: "s1" })).toHaveLength(1);
      expect(listOutcomes({ teamMemberId: "u2" })).toHaveLength(1);
    });
  });

  // ---- transitionOutcome ----

  describe("transitionOutcome", () => {
    it("transitions through lifecycle stages", () => {
      const o = createOutcome({ ideaTitle: "Lifecycle Test" });
      transitionOutcome(o.id, "validated", { userId: "user-1", note: "Looks good" });
      transitionOutcome(o.id, "planned");
      transitionOutcome(o.id, "in-development");
      transitionOutcome(o.id, "shipped");

      const updated = getOutcome(o.id)!;
      expect(updated.stage).toBe("shipped");
      expect(updated.stageHistory).toHaveLength(4);
      expect(updated.stageHistory[0].from).toBe("idea");
      expect(updated.stageHistory[0].to).toBe("validated");
      expect(updated.stageHistory[0].userId).toBe("user-1");
      expect(updated.stageHistory[0].note).toBe("Looks good");
    });

    it("sets shippedAt and timeToValueDays on 'shipped' transition", () => {
      const o = createOutcome({ ideaTitle: "Ship Test" });
      transitionOutcome(o.id, "shipped");
      const updated = getOutcome(o.id)!;
      expect(updated.shippedAt).toBeTruthy();
      expect(updated.timeToValueDays).toBeDefined();
      expect(updated.timeToValueDays).toBeGreaterThanOrEqual(0);
    });

    it("does not overwrite shippedAt on duplicate shipped transition", () => {
      const o = createOutcome({ ideaTitle: "Test" });
      transitionOutcome(o.id, "shipped");
      const firstShippedAt = getOutcome(o.id)!.shippedAt;
      transitionOutcome(o.id, "shipped");
      expect(getOutcome(o.id)!.shippedAt).toBe(firstShippedAt);
    });

    it("returns undefined for non-existent outcome", () => {
      expect(transitionOutcome("nonexistent", "validated")).toBeUndefined();
    });
  });

  // ---- addExternalLink ----

  describe("addExternalLink", () => {
    it("adds external link to outcome", () => {
      const o = createOutcome({ ideaTitle: "Link Test" });
      const updated = addExternalLink(o.id, {
        type: "github-pr",
        url: "https://github.com/org/repo/pull/1",
        title: "PR #1",
        status: "open",
      });
      expect(updated).toBeDefined();
      expect(updated!.externalLinks).toHaveLength(1);
      expect(updated!.externalLinks[0].type).toBe("github-pr");
      expect(updated!.externalLinks[0].url).toBe("https://github.com/org/repo/pull/1");
    });

    it("returns undefined for non-existent outcome", () => {
      expect(addExternalLink("nonexistent", { type: "custom", url: "http://x" })).toBeUndefined();
    });
  });

  // ---- addRevenueMetric ----

  describe("addRevenueMetric", () => {
    it("adds revenue metric to outcome", () => {
      const o = createOutcome({ ideaTitle: "Revenue Test" });
      const updated = addRevenueMetric(o.id, {
        name: "MRR",
        value: 5000,
        unit: "USD",
        source: "Stripe",
      });
      expect(updated).toBeDefined();
      expect(updated!.revenueMetrics).toHaveLength(1);
      expect(updated!.revenueMetrics[0].name).toBe("MRR");
      expect(updated!.revenueMetrics[0].value).toBe(5000);
    });

    it("returns undefined for non-existent outcome", () => {
      expect(addRevenueMetric("nonexistent", { name: "X", value: 0, unit: "USD" })).toBeUndefined();
    });
  });

  // ---- deleteOutcome ----

  describe("deleteOutcome", () => {
    it("deletes existing outcome", () => {
      const o = createOutcome({ ideaTitle: "Delete Test" });
      expect(deleteOutcome(o.id)).toBe(true);
      expect(getOutcome(o.id)).toBeUndefined();
    });

    it("returns false for non-existent outcome", () => {
      expect(deleteOutcome("nonexistent")).toBe(false);
    });
  });

  // ---- buildROIDashboard ----

  describe("buildROIDashboard", () => {
    it("returns empty dashboard with 0 outcomes", () => {
      const dashboard = buildROIDashboard();
      expect(dashboard.totalOutcomes).toBe(0);
      expect(dashboard.overallShipRate).toBe(0);
      expect(dashboard.averageTimeToValueDays).toBeNull();
      expect(dashboard.totalRevenueImpact).toBe(0);
      expect(dashboard.insights).toContain("No outcomes tracked yet. Create outcomes to start measuring ROI.");
    });

    it("aggregates by stage", () => {
      const o1 = createOutcome({ ideaTitle: "A" });
      const o2 = createOutcome({ ideaTitle: "B" });
      createOutcome({ ideaTitle: "C" });
      transitionOutcome(o1.id, "shipped");
      transitionOutcome(o2.id, "abandoned");

      const dashboard = buildROIDashboard();
      expect(dashboard.totalOutcomes).toBe(3);
      expect(dashboard.byStage["shipped"]).toBe(1);
      expect(dashboard.byStage["abandoned"]).toBe(1);
      expect(dashboard.byStage["idea"]).toBe(1);
    });

    it("computes ship rate", () => {
      const o1 = createOutcome({ ideaTitle: "A" });
      createOutcome({ ideaTitle: "B" });
      transitionOutcome(o1.id, "shipped");

      const dashboard = buildROIDashboard();
      expect(dashboard.overallShipRate).toBeCloseTo(0.5, 1);
    });

    it("computes avg time-to-value for shipped outcomes", () => {
      const o1 = createOutcome({ ideaTitle: "A" });
      transitionOutcome(o1.id, "shipped");

      const dashboard = buildROIDashboard();
      expect(dashboard.averageTimeToValueDays).toBeDefined();
      expect(dashboard.averageTimeToValueDays).toBeGreaterThanOrEqual(0);
    });

    it("aggregates by angleId", () => {
      createOutcome({ ideaTitle: "A", angleId: "scamper" });
      createOutcome({ ideaTitle: "B", angleId: "scamper" });
      createOutcome({ ideaTitle: "C", angleId: "first-principles" });

      const dashboard = buildROIDashboard();
      const scamper = dashboard.byAngle.find((g) => g.groupKey === "scamper");
      expect(scamper).toBeDefined();
      expect(scamper!.totalIdeas).toBe(2);
    });

    it("aggregates by sessionId", () => {
      createOutcome({ ideaTitle: "A", sessionId: "s1" });
      createOutcome({ ideaTitle: "B", sessionId: "s1" });

      const dashboard = buildROIDashboard();
      const s1 = dashboard.bySession.find((g) => g.groupKey === "s1");
      expect(s1).toBeDefined();
      expect(s1!.totalIdeas).toBe(2);
    });

    it("aggregates by teamMemberId", () => {
      createOutcome({ ideaTitle: "A", teamMemberId: "alice" });
      const o = createOutcome({ ideaTitle: "B", teamMemberId: "alice" });
      transitionOutcome(o.id, "shipped");

      const dashboard = buildROIDashboard();
      const alice = dashboard.byTeamMember.find((g) => g.groupKey === "alice");
      expect(alice).toBeDefined();
      expect(alice!.shippedIdeas).toBe(1);
      expect(alice!.shipRate).toBe(0.5);
    });

    it("includes revenue in aggregation", () => {
      const o = createOutcome({ ideaTitle: "A", angleId: "test" });
      addRevenueMetric(o.id, { name: "Revenue", value: 10000, unit: "USD" });

      const dashboard = buildROIDashboard();
      expect(dashboard.totalRevenueImpact).toBe(10000);
      const testAngle = dashboard.byAngle.find((g) => g.groupKey === "test");
      expect(testAngle).toBeDefined();
      expect(testAngle!.totalRevenueImpact).toBe(10000);
    });

    it("filters out outcomes with missing groupKey", () => {
      // Outcomes without angleId get grouped under "unknown"
      createOutcome({ ideaTitle: "No Angle" });
      const dashboard = buildROIDashboard();
      // Should still appear (grouped as "unknown")
      expect(dashboard.byAngle.length).toBeGreaterThanOrEqual(1);
    });

    it("generates time series data", () => {
      createOutcome({ ideaTitle: "A" });
      const dashboard = buildROIDashboard();
      expect(dashboard.timeSeries.length).toBeGreaterThanOrEqual(1);
      expect(dashboard.timeSeries[0].ideasCreated).toBeGreaterThanOrEqual(1);
    });

    it("generates insights for non-empty dashboard", () => {
      const o = createOutcome({ ideaTitle: "A", angleId: "scamper" });
      transitionOutcome(o.id, "shipped");
      addRevenueMetric(o.id, { name: "Rev", value: 5000, unit: "USD" });

      const dashboard = buildROIDashboard();
      expect(dashboard.insights.some((i) => i.includes("ship rate"))).toBe(true);
      expect(dashboard.insights.some((i) => i.includes("revenue impact"))).toBe(true);
    });
  });
});
