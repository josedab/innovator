import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioItem } from "../portfolio/types.js";

const { mockListPortfolioItems } = vi.hoisted(() => ({
  mockListPortfolioItems: vi.fn(),
}));

vi.mock("../portfolio/index.js", () => ({
  listPortfolioItems: mockListPortfolioItems,
}));

import {
  DashboardMetricsSchema,
  ExecutiveReportSchema,
  aggregateDashboardMetrics,
  generateExecutiveReport,
  suggestPortfolioRebalance,
} from "../portfolio/dashboard.js";

function makeItem(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
  return {
    id: overrides.id ?? randomUUID(),
    title: overrides.title ?? "Test initiative",
    description: overrides.description ?? "Portfolio test initiative",
    sourceAngle: overrides.sourceAngle ?? "scamper",
    stage: overrides.stage ?? "ideation",
    transitions: overrides.transitions ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    tags: overrides.tags ?? [],
    assignee: overrides.assignee,
    impactScore: overrides.impactScore,
    sessionId: overrides.sessionId,
    outcome: overrides.outcome,
  };
}

describe("portfolio/dashboard", () => {
  beforeEach(() => {
    mockListPortfolioItems.mockReset();
  });

  it("aggregates dashboard metrics from portfolio items", () => {
    const now = Date.now();
    mockListPortfolioItems.mockReturnValue([
      makeItem({
        id: "idea-1",
        stage: "ideation",
        assignee: "alice",
        sourceAngle: "scamper",
        impactScore: 7,
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      makeItem({
        id: "idea-2",
        stage: "prototyping",
        assignee: "alice",
        sourceAngle: "first-principles",
        impactScore: 8,
        createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      makeItem({
        id: "idea-3",
        stage: "shipped",
        assignee: "bob",
        sourceAngle: "scamper",
        impactScore: 9,
        createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000).toISOString(),
        transitions: [
          {
            from: "prototyping",
            to: "shipped",
            timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
    ]);

    const metrics = aggregateDashboardMetrics();

    expect(DashboardMetricsSchema.parse(metrics)).toEqual(metrics);
    expect(metrics.totalInitiatives).toBe(3);
    expect(metrics.activeInitiatives).toBe(2);
    expect(metrics.completedInitiatives).toBe(1);
    expect(metrics.ideaVelocity.weekly).toBe(2);
    expect(metrics.stageDistribution.shipped).toBe(1);
    expect(metrics.angleEffectiveness[0]).toMatchObject({
      angleId: "scamper",
      usageCount: 2,
      successRate: 0.5,
    });
    expect(metrics.teamPatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: "alice", initiativeCount: 2 }),
        expect.objectContaining({ memberId: "bob", avgCompletionDays: 16 }),
      ])
    );
  });

  it("generates an executive report with actionable recommendations", () => {
    mockListPortfolioItems.mockReturnValue([
      makeItem({ id: "1", stage: "ideation", sourceAngle: "scamper", impactScore: 3, assignee: "alice" }),
      makeItem({ id: "2", stage: "ideation", sourceAngle: "scamper", impactScore: 4, assignee: "alice" }),
      makeItem({ id: "3", stage: "evaluation", sourceAngle: "scamper", impactScore: 2, assignee: "alice" }),
      makeItem({ id: "4", stage: "prototyping", sourceAngle: "first-principles", impactScore: 8, assignee: "bob" }),
    ]);

    const report = generateExecutiveReport("Q3");

    expect(ExecutiveReportSchema.parse(report)).toEqual(report);
    expect(report.period).toBe("Q3");
    expect(report.summary).toContain("4 tracked initiatives");
    expect(report.kpis).toHaveLength(4);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("suggests rebalancing steps when the portfolio is skewed", () => {
    const suggestions = suggestPortfolioRebalance({
      totalInitiatives: 5,
      activeInitiatives: 4,
      completedInitiatives: 0,
      ideaVelocity: { daily: 1, weekly: 4, monthly: 5 },
      angleEffectiveness: [
        { angleId: "scamper", usageCount: 4, successRate: 0, avgScore: 4 },
        { angleId: "jobs-to-be-done", usageCount: 1, successRate: 0, avgScore: 7 },
      ],
      stageDistribution: { ideation: 4, evaluation: 1, prototyping: 0, shipped: 0, abandoned: 0 },
      riskDistribution: { low: 1, medium: 1, high: 3 },
      teamPatterns: [{ memberId: "alice", initiativeCount: 5, avgCompletionDays: null, preferredAngles: ["scamper"] }],
    });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("review capacity"),
        expect.stringContaining("De-risk"),
        expect.stringContaining("Diversify"),
        expect.stringContaining("alice"),
      ])
    );
  });
});
