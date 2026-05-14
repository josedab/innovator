import { describe, it, expect, beforeEach } from "vitest";
import {
  trackIdea,
  advanceIdea,
  setIdeaROI,
  getTrackedIdea,
  listTrackedIdeas,
  computeFunnelMetrics,
  computeAngleEffectiveness,
  computeTeamLeaderboard,
  calculateROI,
  buildDashboard,
  registerIntegration,
  listIntegrations,
  removeIntegration,
  clearMetricsDashboard,
} from "../metrics-dashboard/index.js";
import type { ProjectTrackerIntegration } from "../metrics-dashboard/index.js";

describe("metrics-dashboard", () => {
  beforeEach(() => {
    clearMetricsDashboard();
  });

  // ---- trackIdea ----

  describe("trackIdea", () => {
    it("creates a tracked idea with default stage 'ideated'", () => {
      const idea = trackIdea({ id: "i1", title: "Test", description: "desc" });
      expect(idea.id).toBe("i1");
      expect(idea.stage).toBe("ideated");
      expect(idea.tags).toEqual([]);
      expect(idea.stageHistory).toHaveLength(1);
      expect(idea.stageHistory[0].stage).toBe("ideated");
      expect(idea.stageHistory[0].exitedAt).toBeUndefined();
      expect(idea.createdAt).toBeTruthy();
      expect(idea.updatedAt).toBeTruthy();
    });

    it("stores optional fields", () => {
      const idea = trackIdea({
        id: "i2",
        title: "Idea",
        description: "d",
        angleId: "scamper",
        sessionId: "s1",
        owner: "alice",
        teamId: "team-a",
        tags: ["ai", "ux"],
      });
      expect(idea.angleId).toBe("scamper");
      expect(idea.sessionId).toBe("s1");
      expect(idea.owner).toBe("alice");
      expect(idea.teamId).toBe("team-a");
      expect(idea.tags).toEqual(["ai", "ux"]);
    });

    it("is retrievable via getTrackedIdea", () => {
      trackIdea({ id: "i3", title: "T", description: "d" });
      expect(getTrackedIdea("i3")).toBeDefined();
      expect(getTrackedIdea("nonexistent")).toBeUndefined();
    });
  });

  // ---- advanceIdea ----

  describe("advanceIdea", () => {
    it("advances an idea to a new stage", () => {
      trackIdea({ id: "a1", title: "T", description: "d" });
      const updated = advanceIdea("a1", "shortlisted");
      expect(updated).toBeDefined();
      expect(updated!.stage).toBe("shortlisted");
      expect(updated!.stageHistory).toHaveLength(2);
      expect(updated!.stageHistory[0].exitedAt).toBeTruthy();
      expect(updated!.stageHistory[1].stage).toBe("shortlisted");
    });

    it("returns undefined for non-existent idea", () => {
      expect(advanceIdea("nonexistent", "shipped")).toBeUndefined();
    });
  });

  // ---- setIdeaROI ----

  describe("setIdeaROI", () => {
    it("sets estimated and actual ROI", () => {
      trackIdea({ id: "r1", title: "T", description: "d" });
      expect(setIdeaROI("r1", 100, 150)).toBe(true);
      const idea = getTrackedIdea("r1");
      expect(idea!.estimatedROI).toBe(100);
      expect(idea!.actualROI).toBe(150);
    });

    it("sets only estimated ROI when actual is undefined", () => {
      trackIdea({ id: "r2", title: "T", description: "d" });
      setIdeaROI("r2", 50);
      const idea = getTrackedIdea("r2");
      expect(idea!.estimatedROI).toBe(50);
      expect(idea!.actualROI).toBeUndefined();
    });

    it("returns false for non-existent idea", () => {
      expect(setIdeaROI("nonexistent", 100)).toBe(false);
    });
  });

  // ---- listTrackedIdeas ----

  describe("listTrackedIdeas", () => {
    it("filters by stage, teamId, owner, and angleId", () => {
      trackIdea({
        id: "f1",
        title: "T",
        description: "d",
        teamId: "team-a",
        owner: "alice",
        angleId: "scamper",
      });
      trackIdea({
        id: "f2",
        title: "T",
        description: "d",
        teamId: "team-b",
        owner: "bob",
        angleId: "inversion",
      });
      advanceIdea("f2", "shipped");

      expect(listTrackedIdeas({ stage: "ideated" })).toHaveLength(1);
      expect(listTrackedIdeas({ teamId: "team-a" })).toHaveLength(1);
      expect(listTrackedIdeas({ owner: "bob" })).toHaveLength(1);
      expect(listTrackedIdeas({ angleId: "scamper" })).toHaveLength(1);
    });

    it("returns all ideas when no filters are provided", () => {
      trackIdea({ id: "f3", title: "T", description: "d" });
      trackIdea({ id: "f4", title: "T", description: "d" });
      expect(listTrackedIdeas()).toHaveLength(2);
    });
  });

  // ---- computeFunnelMetrics ----

  describe("computeFunnelMetrics", () => {
    it("returns zero counts for empty store", () => {
      const metrics = computeFunnelMetrics();
      expect(metrics.totalIdeas).toBe(0);
      expect(metrics.stages.every((s) => s.count === 0)).toBe(true);
      expect(metrics.stages.every((s) => s.percentage === 0)).toBe(true);
    });

    it("counts ideas that reached each stage cumulatively", () => {
      trackIdea({ id: "c1", title: "T", description: "d" });
      advanceIdea("c1", "shortlisted");
      advanceIdea("c1", "validated");

      trackIdea({ id: "c2", title: "T", description: "d" });

      const metrics = computeFunnelMetrics();
      expect(metrics.totalIdeas).toBe(2);
      const ideatedStage = metrics.stages.find((s) => s.stage === "ideated");
      expect(ideatedStage!.count).toBe(2);
      expect(ideatedStage!.percentage).toBe(100);

      const shortlistedStage = metrics.stages.find((s) => s.stage === "shortlisted");
      expect(shortlistedStage!.count).toBe(1);
    });

    it("computes conversion rates between adjacent stages", () => {
      trackIdea({ id: "cv1", title: "T", description: "d" });
      trackIdea({ id: "cv2", title: "T", description: "d" });
      advanceIdea("cv1", "shortlisted");

      const metrics = computeFunnelMetrics();
      const firstRate = metrics.conversionRates[0];
      expect(firstRate.from).toBe("ideated");
      expect(firstRate.to).toBe("shortlisted");
      expect(firstRate.rate).toBe(50);
    });

    it("filters by teamId", () => {
      trackIdea({ id: "t1", title: "T", description: "d", teamId: "alpha" });
      trackIdea({ id: "t2", title: "T", description: "d", teamId: "beta" });

      const metrics = computeFunnelMetrics("alpha");
      expect(metrics.totalIdeas).toBe(1);
    });

    it("handles all ideas in same stage", () => {
      trackIdea({ id: "s1", title: "T", description: "d" });
      trackIdea({ id: "s2", title: "T", description: "d" });
      trackIdea({ id: "s3", title: "T", description: "d" });

      const metrics = computeFunnelMetrics();
      expect(metrics.totalIdeas).toBe(3);
      const ideated = metrics.stages.find((s) => s.stage === "ideated");
      expect(ideated!.count).toBe(3);
      expect(ideated!.percentage).toBe(100);
      // All other stages should be 0
      const shipped = metrics.stages.find((s) => s.stage === "shipped");
      expect(shipped!.count).toBe(0);
    });

    it("computes average time in stage when exits exist", () => {
      trackIdea({ id: "time1", title: "T", description: "d" });
      advanceIdea("time1", "shortlisted");

      const metrics = computeFunnelMetrics();
      expect(metrics.averageTimeInStage.ideated).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- calculateROI ----

  describe("calculateROI", () => {
    it("calculates basic ROI", () => {
      const roi = calculateROI({
        ideaId: "roi-1",
        title: "Test",
        developmentCost: 10000,
        monthlyRevenue: 5000,
        timeToMarketMonths: 2,
        probabilityOfSuccess: 0.8,
        projectionMonths: 12,
      });
      expect(roi.ideaId).toBe("roi-1");
      expect(roi.estimatedCost).toBe(10000);
      expect(roi.estimatedRevenue).toBe(50000); // 5000 * (12 - 2)
      expect(roi.estimatedROI).toBe(400); // ((50000 - 10000) / 10000) * 100
      expect(roi.riskAdjustedROI).toBe(320); // 400 * 0.8
    });

    it("handles zero cost (no division error)", () => {
      const roi = calculateROI({
        ideaId: "roi-2",
        title: "Free",
        developmentCost: 0,
        monthlyRevenue: 1000,
        timeToMarketMonths: 1,
        probabilityOfSuccess: 1,
      });
      expect(roi.estimatedROI).toBe(0);
      expect(roi.estimatedCost).toBe(0);
    });

    it("handles zero revenue", () => {
      const roi = calculateROI({
        ideaId: "roi-3",
        title: "No revenue",
        developmentCost: 5000,
        monthlyRevenue: 0,
        timeToMarketMonths: 1,
        probabilityOfSuccess: 0.5,
      });
      expect(roi.estimatedRevenue).toBe(0);
      expect(roi.paybackMonths).toBe(Infinity);
      expect(roi.estimatedROI).toBe(-100);
    });

    it("uses default 12-month projection when not specified", () => {
      const roi = calculateROI({
        ideaId: "roi-4",
        title: "Default",
        developmentCost: 1000,
        monthlyRevenue: 500,
        timeToMarketMonths: 0,
        probabilityOfSuccess: 1,
      });
      expect(roi.estimatedRevenue).toBe(6000); // 500 * 12
    });

    it("handles timeToMarket exceeding projection period", () => {
      const roi = calculateROI({
        ideaId: "roi-5",
        title: "Slow",
        developmentCost: 5000,
        monthlyRevenue: 1000,
        timeToMarketMonths: 15,
        probabilityOfSuccess: 1,
        projectionMonths: 12,
      });
      expect(roi.estimatedRevenue).toBe(0);
    });

    it("computes negative ROI correctly", () => {
      const roi = calculateROI({
        ideaId: "roi-neg",
        title: "Negative ROI",
        developmentCost: 10000,
        monthlyRevenue: 100,
        timeToMarketMonths: 10,
        probabilityOfSuccess: 1,
        projectionMonths: 12,
      });
      // Revenue: 100 * (12 - 10) = 200, Cost: 10000, ROI: ((200-10000)/10000)*100 = -98%
      expect(roi.estimatedROI).toBeLessThan(0);
    });
  });

  // ---- computeAngleEffectiveness ----

  describe("computeAngleEffectiveness", () => {
    it("returns empty array when no ideas have angleId", () => {
      trackIdea({ id: "ae1", title: "T", description: "d" });
      expect(computeAngleEffectiveness()).toEqual([]);
    });

    it("groups ideas by angle and computes conversion rate", () => {
      trackIdea({ id: "ae2", title: "T", description: "d", angleId: "scamper" });
      trackIdea({ id: "ae3", title: "T", description: "d", angleId: "scamper" });
      advanceIdea("ae2", "shipped");
      setIdeaROI("ae2", undefined, 200);

      const result = computeAngleEffectiveness();
      expect(result).toHaveLength(1);
      expect(result[0].angleId).toBe("scamper");
      expect(result[0].totalIdeas).toBe(2);
      expect(result[0].shippedIdeas).toBe(1);
      expect(result[0].conversionRate).toBe(50);
      expect(result[0].averageROI).toBe(200);
      expect(result[0].topIdeas.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- computeTeamLeaderboard ----

  describe("computeTeamLeaderboard", () => {
    it("returns empty array when no ideas have teamId", () => {
      trackIdea({ id: "tl1", title: "T", description: "d" });
      expect(computeTeamLeaderboard()).toEqual([]);
    });

    it("computes team metrics sorted by actual ROI", () => {
      trackIdea({ id: "tl2", title: "T", description: "d", teamId: "alpha" });
      trackIdea({ id: "tl3", title: "T", description: "d", teamId: "alpha" });
      trackIdea({ id: "tl4", title: "T", description: "d", teamId: "beta" });
      setIdeaROI("tl2", 100, 500);
      setIdeaROI("tl4", 200, 1000);
      advanceIdea("tl2", "shipped");

      const leaderboard = computeTeamLeaderboard();
      expect(leaderboard).toHaveLength(2);
      // beta first (higher actual ROI)
      expect(leaderboard[0].teamId).toBe("beta");
      expect(leaderboard[0].totalActualROI).toBe(1000);
      expect(leaderboard[1].teamId).toBe("alpha");
      expect(leaderboard[1].shippedIdeas).toBe(1);
      expect(leaderboard[1].activeIdeas).toBe(1);
    });

    it("single idea team", () => {
      trackIdea({ id: "st1", title: "T", description: "d", teamId: "solo" });
      const lb = computeTeamLeaderboard();
      expect(lb).toHaveLength(1);
      expect(lb[0].totalIdeas).toBe(1);
      expect(lb[0].conversionRate).toBe(0);
    });

    it("handles tie-breaking: teams with same ROI", () => {
      trackIdea({ id: "tie1", title: "T", description: "d", teamId: "alpha" });
      trackIdea({ id: "tie2", title: "T", description: "d", teamId: "beta" });
      setIdeaROI("tie1", 100, 500);
      setIdeaROI("tie2", 100, 500);
      const lb = computeTeamLeaderboard();
      expect(lb).toHaveLength(2);
      // Both teams have same ROI — both should appear
      expect(lb[0].totalActualROI).toBe(500);
      expect(lb[1].totalActualROI).toBe(500);
    });
  });

  // ---- buildDashboard ----

  describe("buildDashboard", () => {
    it("returns complete dashboard structure for empty store", () => {
      const dashboard = buildDashboard();
      expect(dashboard.funnel.totalIdeas).toBe(0);
      expect(dashboard.angleEffectiveness).toEqual([]);
      expect(dashboard.teamLeaderboard).toEqual([]);
      expect(dashboard.recentActivity).toEqual([]);
      expect(dashboard.kpis).toEqual({
        totalIdeas: 0,
        shippedIdeas: 0,
        overallConversionRate: 0,
        totalROI: 0,
        averageTimeToShip: 0,
      });
    });

    it("populates dashboard with tracked ideas", () => {
      trackIdea({ id: "d1", title: "Idea 1", description: "d", teamId: "t", angleId: "a1" });
      advanceIdea("d1", "shipped");
      setIdeaROI("d1", undefined, 500);

      const dashboard = buildDashboard();
      expect(dashboard.kpis.totalIdeas).toBe(1);
      expect(dashboard.kpis.shippedIdeas).toBe(1);
      expect(dashboard.kpis.overallConversionRate).toBe(100);
      expect(dashboard.kpis.totalROI).toBe(500);
      expect(dashboard.recentActivity.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by teamId when provided", () => {
      trackIdea({ id: "d2", title: "T", description: "d", teamId: "alpha" });
      trackIdea({ id: "d3", title: "T", description: "d", teamId: "beta" });

      const dashboard = buildDashboard("alpha");
      expect(dashboard.funnel.totalIdeas).toBe(1);
      expect(dashboard.kpis.totalIdeas).toBe(1);
    });
  });

  // ---- registerIntegration / clearMetricsDashboard ----

  describe("registerIntegration", () => {
    it("registers and lists integrations", () => {
      const integration: ProjectTrackerIntegration = {
        id: "jira-1",
        name: "Jira",
        type: "jira",
        apiUrl: "https://jira.example.com",
        syncDirection: "bidirectional",
        fieldMapping: { title: "summary" },
      };
      registerIntegration(integration);
      expect(listIntegrations()).toHaveLength(1);
      expect(listIntegrations()[0].id).toBe("jira-1");
    });

    it("removes an integration", () => {
      registerIntegration({
        id: "gh-1",
        name: "GitHub",
        type: "github",
        apiUrl: "https://api.github.com",
        syncDirection: "push",
        fieldMapping: {},
      });
      expect(removeIntegration("gh-1")).toBe(true);
      expect(removeIntegration("gh-1")).toBe(false);
      expect(listIntegrations()).toHaveLength(0);
    });
  });

  describe("clearMetricsDashboard", () => {
    it("clears both ideas and integrations", () => {
      trackIdea({ id: "cl1", title: "T", description: "d" });
      registerIntegration({
        id: "int1",
        name: "Linear",
        type: "linear",
        apiUrl: "https://linear.app",
        syncDirection: "pull",
        fieldMapping: {},
      });

      clearMetricsDashboard();
      expect(listTrackedIdeas()).toHaveLength(0);
      expect(listIntegrations()).toHaveLength(0);
    });
  });
});
