import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  trackIdea,
  updateIdeaStatus,
  linkPR,
  linkIssue,
  getTrackedIdea,
  listTrackedIdeas,
  recordOutcome,
  getOutcomes,
  autoDetectOutcomes,
  calculateImpactScore,
  rankByImpact,
  getInnovationFunnel,
  getTeamComparisons,
  generateImpactDashboard,
  dashboardToMarkdown,
  clearImpactTrackerData,
  type TrackedIdea,
  type OutcomeRecord,
  type ImpactDashboard,
} from "../index.js";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue('{"summary":"Test executive summary"}'),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<string>) => fn()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdea(overrides: Partial<TrackedIdea> = {}): TrackedIdea {
  return {
    id: overrides.id ?? `idea-${Date.now()}-${Math.random()}`,
    title: overrides.title ?? "Test Idea",
    description: overrides.description ?? "A test idea description",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    status: overrides.status ?? "proposed",
    linkedPRs: overrides.linkedPRs ?? [],
    linkedIssues: overrides.linkedIssues ?? [],
    customOutcomes: overrides.customOutcomes ?? [],
    tags: overrides.tags ?? [],
  };
}

function makeOutcome(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    id: overrides.id ?? `outcome-${Date.now()}-${Math.random()}`,
    ideaId: overrides.ideaId ?? "idea-1",
    type: overrides.type ?? "pr-merged",
    title: overrides.title ?? "Test Outcome",
    source: overrides.source ?? "manual",
    detectedAt: overrides.detectedAt ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
    ...(overrides.value !== undefined ? { value: overrides.value } : {}),
    ...(overrides.unit !== undefined ? { unit: overrides.unit } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("impact-tracker", () => {
  beforeEach(() => {
    clearImpactTrackerData();
  });

  // ---- trackIdea ----

  describe("trackIdea", () => {
    it("tracks an idea and returns it with its ID", () => {
      const idea = trackIdea(makeIdea({ id: "idea-1", title: "My Idea" }));
      expect(idea.id).toBe("idea-1");
      expect(idea.title).toBe("My Idea");
      expect(idea.status).toBe("proposed");
    });

    it("persists the idea so it can be retrieved", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const retrieved = getTrackedIdea("idea-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("idea-1");
    });

    it("validates required fields — rejects empty id", () => {
      expect(() => trackIdea(makeIdea({ id: "" }))).toThrow();
    });

    it("validates required fields — rejects empty title", () => {
      expect(() => trackIdea(makeIdea({ title: "" }))).toThrow();
    });

    it("defaults status to proposed", () => {
      const idea = trackIdea(makeIdea({ id: "idea-default" }));
      expect(idea.status).toBe("proposed");
    });

    it("defaults linkedPRs and linkedIssues to empty arrays", () => {
      const idea = trackIdea(makeIdea({ id: "idea-arrays" }));
      expect(idea.linkedPRs).toEqual([]);
      expect(idea.linkedIssues).toEqual([]);
    });

    it("preserves tags", () => {
      const idea = trackIdea(
        makeIdea({ id: "idea-tags", tags: ["team-a", "frontend"] }),
      );
      expect(idea.tags).toEqual(["team-a", "frontend"]);
    });
  });

  // ---- updateIdeaStatus ----

  describe("updateIdeaStatus", () => {
    it("updates the status of an existing idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const updated = updateIdeaStatus("idea-1", "in-progress");
      expect(updated.status).toBe("in-progress");
    });

    it("reflects the new status on subsequent retrieval", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      updateIdeaStatus("idea-1", "shipped");
      expect(getTrackedIdea("idea-1")!.status).toBe("shipped");
    });

    it("throws for an unknown idea ID", () => {
      expect(() => updateIdeaStatus("nonexistent", "shipped")).toThrow(
        "Tracked idea not found: nonexistent",
      );
    });
  });

  // ---- linkPR ----

  describe("linkPR", () => {
    it("links a PR URL to an idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const updated = linkPR("idea-1", "https://github.com/org/repo/pull/1");
      expect(updated.linkedPRs).toContain(
        "https://github.com/org/repo/pull/1",
      );
    });

    it("does not duplicate an already-linked PR", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      linkPR("idea-1", "https://github.com/org/repo/pull/1");
      linkPR("idea-1", "https://github.com/org/repo/pull/1");
      expect(getTrackedIdea("idea-1")!.linkedPRs).toHaveLength(1);
    });

    it("throws for an unknown idea", () => {
      expect(() =>
        linkPR("nonexistent", "https://github.com/org/repo/pull/1"),
      ).toThrow("Tracked idea not found: nonexistent");
    });
  });

  // ---- linkIssue ----

  describe("linkIssue", () => {
    it("links an issue URL to an idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const updated = linkIssue(
        "idea-1",
        "https://github.com/org/repo/issues/42",
      );
      expect(updated.linkedIssues).toContain(
        "https://github.com/org/repo/issues/42",
      );
    });

    it("does not duplicate an already-linked issue", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      linkIssue("idea-1", "https://github.com/org/repo/issues/42");
      linkIssue("idea-1", "https://github.com/org/repo/issues/42");
      expect(getTrackedIdea("idea-1")!.linkedIssues).toHaveLength(1);
    });

    it("throws for an unknown idea", () => {
      expect(() =>
        linkIssue("nonexistent", "https://github.com/org/repo/issues/42"),
      ).toThrow("Tracked idea not found: nonexistent");
    });
  });

  // ---- getTrackedIdea ----

  describe("getTrackedIdea", () => {
    it("returns undefined for a non-existent idea", () => {
      expect(getTrackedIdea("nonexistent")).toBeUndefined();
    });

    it("returns the tracked idea by ID", () => {
      trackIdea(makeIdea({ id: "idea-1", title: "Found" }));
      const idea = getTrackedIdea("idea-1");
      expect(idea).toBeDefined();
      expect(idea!.title).toBe("Found");
    });
  });

  // ---- listTrackedIdeas ----

  describe("listTrackedIdeas", () => {
    it("returns an empty array when no ideas exist", () => {
      expect(listTrackedIdeas()).toEqual([]);
    });

    it("returns all tracked ideas", () => {
      trackIdea(makeIdea({ id: "a", createdAt: "2024-01-01T00:00:00Z" }));
      trackIdea(makeIdea({ id: "b", createdAt: "2024-02-01T00:00:00Z" }));
      const ideas = listTrackedIdeas();
      expect(ideas).toHaveLength(2);
    });

    it("sorts by createdAt descending", () => {
      trackIdea(makeIdea({ id: "old", createdAt: "2024-01-01T00:00:00Z" }));
      trackIdea(makeIdea({ id: "new", createdAt: "2024-06-01T00:00:00Z" }));
      const ideas = listTrackedIdeas();
      expect(ideas[0].id).toBe("new");
      expect(ideas[1].id).toBe("old");
    });

    it("filters by status", () => {
      trackIdea(makeIdea({ id: "a", status: "proposed" }));
      trackIdea(makeIdea({ id: "b", status: "shipped" }));
      const shipped = listTrackedIdeas({ status: "shipped" });
      expect(shipped).toHaveLength(1);
      expect(shipped[0].id).toBe("b");
    });

    it("filters by tag", () => {
      trackIdea(makeIdea({ id: "a", tags: ["frontend"] }));
      trackIdea(makeIdea({ id: "b", tags: ["backend"] }));
      const frontend = listTrackedIdeas({ tag: "frontend" });
      expect(frontend).toHaveLength(1);
      expect(frontend[0].id).toBe("a");
    });

    it("filters by both status and tag", () => {
      trackIdea(
        makeIdea({ id: "a", status: "shipped", tags: ["frontend"] }),
      );
      trackIdea(
        makeIdea({ id: "b", status: "proposed", tags: ["frontend"] }),
      );
      trackIdea(
        makeIdea({ id: "c", status: "shipped", tags: ["backend"] }),
      );
      const result = listTrackedIdeas({ status: "shipped", tag: "frontend" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
    });
  });

  // ---- recordOutcome / getOutcomes ----

  describe("recordOutcome", () => {
    it("records an outcome for a tracked idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const outcome = recordOutcome(
        makeOutcome({ id: "o1", ideaId: "idea-1" }),
      );
      expect(outcome.id).toBe("o1");
      expect(outcome.ideaId).toBe("idea-1");
    });

    it("throws when the idea does not exist", () => {
      expect(() =>
        recordOutcome(makeOutcome({ ideaId: "nonexistent" })),
      ).toThrow("Tracked idea not found: nonexistent");
    });

    it("allows multiple outcomes for the same idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      recordOutcome(makeOutcome({ id: "o1", ideaId: "idea-1" }));
      recordOutcome(makeOutcome({ id: "o2", ideaId: "idea-1" }));
      expect(getOutcomes("idea-1")).toHaveLength(2);
    });
  });

  describe("getOutcomes", () => {
    it("returns an empty array when no outcomes exist", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      expect(getOutcomes("idea-1")).toEqual([]);
    });

    it("returns outcomes for the specified idea", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      trackIdea(makeIdea({ id: "idea-2" }));
      recordOutcome(makeOutcome({ id: "o1", ideaId: "idea-1" }));
      recordOutcome(makeOutcome({ id: "o2", ideaId: "idea-2" }));
      const outcomes = getOutcomes("idea-1");
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].id).toBe("o1");
    });
  });

  // ---- autoDetectOutcomes ----

  describe("autoDetectOutcomes", () => {
    it("returns detected: false when no PRs are linked", async () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const result = await autoDetectOutcomes("idea-1");
      expect(result.detected).toBe(false);
      expect(result.outcomes).toHaveLength(0);
    });

    it("creates pr-merged outcomes for linked PRs", async () => {
      trackIdea(
        makeIdea({
          id: "idea-1",
          linkedPRs: ["https://github.com/org/repo/pull/1"],
        }),
      );
      const result = await autoDetectOutcomes("idea-1");
      expect(result.detected).toBe(true);
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0].type).toBe("pr-merged");
    });

    it("throws for an unknown idea", async () => {
      await expect(autoDetectOutcomes("nonexistent")).rejects.toThrow(
        "Tracked idea not found: nonexistent",
      );
    });
  });

  // ---- calculateImpactScore ----

  describe("calculateImpactScore", () => {
    it("throws for an unknown idea", () => {
      expect(() => calculateImpactScore("nonexistent")).toThrow(
        "Tracked idea not found: nonexistent",
      );
    });

    it("returns a baseline score for an idea with no outcomes", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const score = calculateImpactScore("idea-1");
      expect(score.ideaId).toBe("idea-1");
      expect(score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
    });

    it("gives a higher implementation score when PRs are linked", () => {
      trackIdea(
        makeIdea({
          id: "no-pr",
        }),
      );
      trackIdea(
        makeIdea({
          id: "with-pr",
          linkedPRs: ["https://github.com/org/repo/pull/1"],
        }),
      );
      const nopr = calculateImpactScore("no-pr");
      const withpr = calculateImpactScore("with-pr");
      expect(withpr.implementationScore).toBeGreaterThan(
        nopr.implementationScore,
      );
    });

    it("increases score when idea is shipped", () => {
      trackIdea(makeIdea({ id: "idea-1", status: "proposed" }));
      const proposedScore = calculateImpactScore("idea-1");
      updateIdeaStatus("idea-1", "shipped");
      const shippedScore = calculateImpactScore("idea-1");
      expect(shippedScore.implementationScore).toBeGreaterThan(
        proposedScore.implementationScore,
      );
    });

    it("computes adoption score from user-adoption outcomes", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      recordOutcome(
        makeOutcome({
          id: "o1",
          ideaId: "idea-1",
          type: "user-adoption",
          value: 50,
        }),
      );
      const score = calculateImpactScore("idea-1");
      expect(score.adoptionScore).toBe(50);
    });

    it("computes business score from revenue-impact outcomes", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      recordOutcome(
        makeOutcome({
          id: "o1",
          ideaId: "idea-1",
          type: "revenue-impact",
          value: 40,
        }),
      );
      const score = calculateImpactScore("idea-1");
      expect(score.businessScore).toBe(40);
    });

    it("caps scores at 100", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      for (let i = 0; i < 10; i++) {
        recordOutcome(
          makeOutcome({
            id: `o-adopt-${i}`,
            ideaId: "idea-1",
            type: "user-adoption",
            value: 50,
          }),
        );
      }
      const score = calculateImpactScore("idea-1");
      expect(score.adoptionScore).toBeLessThanOrEqual(100);
    });

    it("confidence increases with more outcomes", () => {
      trackIdea(makeIdea({ id: "idea-1" }));
      const scoreBefore = calculateImpactScore("idea-1");
      recordOutcome(
        makeOutcome({ id: "o1", ideaId: "idea-1", type: "pr-merged" }),
      );
      recordOutcome(
        makeOutcome({ id: "o2", ideaId: "idea-1", type: "feature-shipped" }),
      );
      const scoreAfter = calculateImpactScore("idea-1");
      expect(scoreAfter.confidence).toBeGreaterThan(scoreBefore.confidence);
    });
  });

  // ---- rankByImpact ----

  describe("rankByImpact", () => {
    it("returns empty array when no ideas exist", () => {
      expect(rankByImpact()).toEqual([]);
    });

    it("ranks ideas by composite score descending", () => {
      trackIdea(makeIdea({ id: "low", status: "proposed" }));
      trackIdea(
        makeIdea({
          id: "high",
          status: "shipped",
          linkedPRs: ["https://github.com/org/repo/pull/1"],
        }),
      );
      recordOutcome(
        makeOutcome({
          id: "o1",
          ideaId: "high",
          type: "pr-merged",
        }),
      );
      const ranked = rankByImpact();
      expect(ranked).toHaveLength(2);
      expect(ranked[0].ideaId).toBe("high");
    });

    it("filters by status", () => {
      trackIdea(makeIdea({ id: "a", status: "proposed" }));
      trackIdea(makeIdea({ id: "b", status: "shipped" }));
      const shipped = rankByImpact({ status: "shipped" });
      expect(shipped).toHaveLength(1);
      expect(shipped[0].ideaId).toBe("b");
    });

    it("respects the limit option", () => {
      trackIdea(makeIdea({ id: "a" }));
      trackIdea(makeIdea({ id: "b" }));
      trackIdea(makeIdea({ id: "c" }));
      const ranked = rankByImpact({ limit: 2 });
      expect(ranked).toHaveLength(2);
    });
  });

  // ---- getInnovationFunnel ----

  describe("getInnovationFunnel", () => {
    it("returns zeroed funnel when no ideas exist", () => {
      const funnel = getInnovationFunnel();
      expect(funnel.totalIdeas).toBe(0);
      expect(funnel.inProgress).toBe(0);
      expect(funnel.shipped).toBe(0);
      expect(funnel.abandoned).toBe(0);
      expect(funnel.conversionRate).toBe(0);
      expect(funnel.avgTimeToShip).toBe(0);
    });

    it("counts ideas by status", () => {
      trackIdea(makeIdea({ id: "a", status: "proposed" }));
      trackIdea(makeIdea({ id: "b", status: "in-progress" }));
      trackIdea(makeIdea({ id: "c", status: "shipped" }));
      trackIdea(makeIdea({ id: "d", status: "abandoned" }));
      const funnel = getInnovationFunnel();
      expect(funnel.totalIdeas).toBe(4);
      expect(funnel.inProgress).toBe(1);
      expect(funnel.shipped).toBe(1);
      expect(funnel.abandoned).toBe(1);
    });

    it("computes conversion rate", () => {
      trackIdea(makeIdea({ id: "a", status: "proposed" }));
      trackIdea(makeIdea({ id: "b", status: "shipped" }));
      const funnel = getInnovationFunnel();
      expect(funnel.conversionRate).toBe(0.5);
    });

    it("groups ideas by tag in byTeam", () => {
      trackIdea(makeIdea({ id: "a", tags: ["team-x"] }));
      trackIdea(makeIdea({ id: "b", tags: ["team-x"] }));
      trackIdea(makeIdea({ id: "c", tags: ["team-y"] }));
      const funnel = getInnovationFunnel();
      expect(funnel.byTeam["team-x"]).toBe(2);
      expect(funnel.byTeam["team-y"]).toBe(1);
    });

    it("filters by tag", () => {
      trackIdea(makeIdea({ id: "a", tags: ["team-x"] }));
      trackIdea(makeIdea({ id: "b", tags: ["team-y"] }));
      const funnel = getInnovationFunnel({ tag: "team-x" });
      expect(funnel.totalIdeas).toBe(1);
    });
  });

  // ---- getTeamComparisons ----

  describe("getTeamComparisons", () => {
    it("returns empty when no ideas exist", () => {
      expect(getTeamComparisons()).toEqual([]);
    });

    it("returns per-team comparison metrics", () => {
      trackIdea(makeIdea({ id: "a", tags: ["alpha"], status: "shipped" }));
      trackIdea(makeIdea({ id: "b", tags: ["alpha"], status: "proposed" }));
      trackIdea(makeIdea({ id: "c", tags: ["beta"], status: "shipped" }));
      const comparisons = getTeamComparisons();
      expect(comparisons.length).toBe(2);
      const alpha = comparisons.find((c) => c.teamId === "alpha");
      expect(alpha).toBeDefined();
      expect(alpha!.ideasGenerated).toBe(2);
      expect(alpha!.ideasShipped).toBe(1);
    });

    it("sorts teams by avgImpactScore descending", () => {
      trackIdea(
        makeIdea({
          id: "a",
          tags: ["low-team"],
          status: "proposed",
        }),
      );
      trackIdea(
        makeIdea({
          id: "b",
          tags: ["high-team"],
          status: "shipped",
          linkedPRs: ["https://github.com/org/repo/pull/1"],
        }),
      );
      recordOutcome(
        makeOutcome({ id: "o1", ideaId: "b", type: "pr-merged" }),
      );
      const comparisons = getTeamComparisons();
      expect(comparisons[0].teamId).toBe("high-team");
    });

    it("sets topIdea for each team", () => {
      trackIdea(makeIdea({ id: "a", tags: ["t1"] }));
      const comparisons = getTeamComparisons();
      expect(comparisons[0].topIdea).toBe("a");
    });
  });

  // ---- generateImpactDashboard ----

  describe("generateImpactDashboard", () => {
    it("returns a complete dashboard with executive summary", async () => {
      trackIdea(
        makeIdea({
          id: "idea-1",
          status: "shipped",
          tags: ["team-a"],
          createdAt: "2024-03-01T00:00:00Z",
        }),
      );
      const dashboard = await generateImpactDashboard();
      expect(dashboard.funnel).toBeDefined();
      expect(dashboard.topPerformers).toBeDefined();
      expect(dashboard.teamComparisons).toBeDefined();
      expect(dashboard.trends).toBeDefined();
      expect(dashboard.executiveSummary).toBeDefined();
    });

    it("works with an empty tracker", async () => {
      const dashboard = await generateImpactDashboard();
      expect(dashboard.funnel.totalIdeas).toBe(0);
      expect(dashboard.topPerformers).toEqual([]);
      expect(dashboard.teamComparisons).toEqual([]);
    });
  });

  // ---- dashboardToMarkdown ----

  describe("dashboardToMarkdown", () => {
    it("produces a markdown string with expected sections", () => {
      const dashboard: ImpactDashboard = {
        funnel: {
          totalIdeas: 10,
          inProgress: 3,
          shipped: 4,
          abandoned: 1,
          conversionRate: 0.4,
          avgTimeToShip: 86_400_000 * 7,
          byTeam: { alpha: 5, beta: 5 },
        },
        topPerformers: [
          {
            ideaId: "top-1",
            implementationScore: 80,
            adoptionScore: 70,
            businessScore: 60,
            compositeScore: 70,
            confidence: 0.8,
          },
        ],
        teamComparisons: [
          {
            teamId: "alpha",
            ideasGenerated: 5,
            ideasShipped: 3,
            avgImpactScore: 65,
            topIdea: "top-1",
          },
        ],
        trends: [
          {
            period: "2024-03",
            ideasCreated: 5,
            ideasShipped: 2,
            avgImpactScore: 55,
          },
        ],
        executiveSummary: "Portfolio is doing well.",
      };

      const md = dashboardToMarkdown(dashboard);
      expect(md).toContain("# Innovation Impact Dashboard");
      expect(md).toContain("## Executive Summary");
      expect(md).toContain("Portfolio is doing well.");
      expect(md).toContain("## Innovation Funnel");
      expect(md).toContain("Total Ideas | 10");
      expect(md).toContain("Shipped | 4");
      expect(md).toContain("40%");
      expect(md).toContain("## Top Performers");
      expect(md).toContain("top-1");
      expect(md).toContain("## Team Comparisons");
      expect(md).toContain("alpha");
      expect(md).toContain("## Trends");
      expect(md).toContain("2024-03");
    });

    it("omits top performers section when empty", () => {
      const dashboard: ImpactDashboard = {
        funnel: {
          totalIdeas: 0,
          inProgress: 0,
          shipped: 0,
          abandoned: 0,
          conversionRate: 0,
          avgTimeToShip: 0,
          byTeam: {},
        },
        topPerformers: [],
        teamComparisons: [],
        trends: [],
        executiveSummary: "Nothing to report.",
      };
      const md = dashboardToMarkdown(dashboard);
      expect(md).toContain("## Executive Summary");
      expect(md).toContain("## Innovation Funnel");
      expect(md).not.toContain("## Top Performers");
      expect(md).not.toContain("## Team Comparisons");
      expect(md).not.toContain("## Trends");
    });
  });
});
