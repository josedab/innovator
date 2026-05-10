import { vi, describe, it, expect, beforeEach } from "vitest";

// ---- Mocks (before other imports) ----

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(
    JSON.stringify({
      gaps: [
        {
          capability: "AI",
          ourStatus: "behind",
          competitorStatus: "has it",
          opportunityScore: 80,
          marketDemand: "high",
          recommendation: "Invest now",
        },
      ],
      overallPosition: "competitive",
      topOpportunities: ["AI integration"],
      urgentThreats: [],
      summary: "Test gap analysis",
    })
  ),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../../competitive-autopilot/index.js", () => ({
  getCompetitiveEvents: vi.fn().mockReturnValue([]),
}));

// In-memory filesystem mock
let memFs: Record<string, string> = {};

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (memFs[filePath] !== undefined) return memFs[filePath];
    throw new Error("ENOENT");
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => {
    memFs[filePath] = data;
  }),
}));

import {
  addCompetitor,
  updateCompetitor,
  getCompetitor,
  listCompetitors,
  gapReportToMarkdown,
  radarDashboardToMarkdown,
  runGapAnalysis,
  runMultiCompetitorGapAnalysis,
  generateRadarDashboard,
  checkForAlerts,
  getCompetitiveContext,
  type CompetitorProfile,
  type GapAnalysisReport,
  type RadarDashboard,
} from "../index.js";
import { getCompetitiveEvents } from "../../competitive-autopilot/index.js";

// ---- Helpers ----

function makeCompetitor(overrides: Partial<CompetitorProfile> = {}): CompetitorProfile {
  return {
    id: overrides.id ?? "comp-1",
    name: overrides.name ?? "Acme Corp",
    description: overrides.description ?? "A rival company",
    capabilities: overrides.capabilities ?? ["AI", "Cloud"],
    strengths: overrides.strengths ?? ["Brand recognition"],
    weaknesses: overrides.weaknesses ?? ["Slow iteration"],
    recentMoves: overrides.recentMoves ?? [],
    threatLevel: overrides.threatLevel ?? "medium",
    lastUpdated: overrides.lastUpdated ?? "2024-01-01T00:00:00.000Z",
    ...(overrides.website !== undefined ? { website: overrides.website } : {}),
  };
}

function makeGapReport(overrides: Partial<GapAnalysisReport> = {}): GapAnalysisReport {
  return {
    competitor: overrides.competitor ?? "Acme Corp",
    gaps: overrides.gaps ?? [
      {
        capability: "AI",
        ourStatus: "behind",
        competitorStatus: "has it",
        opportunityScore: 80,
        marketDemand: "high",
        recommendation: "Invest now",
      },
    ],
    overallPosition: overrides.overallPosition ?? "competitive",
    topOpportunities: overrides.topOpportunities ?? ["AI integration"],
    urgentThreats: overrides.urgentThreats ?? ["Market share loss"],
    summary: overrides.summary ?? "Test summary",
  };
}

// ---- Tests ----

describe("competitive-radar", () => {
  beforeEach(() => {
    memFs = {};
    vi.clearAllMocks();
  });

  // ---- addCompetitor / getCompetitor / listCompetitors ----

  describe("addCompetitor / getCompetitor / listCompetitors", () => {
    it("adds a competitor and retrieves it by ID", () => {
      const profile = makeCompetitor();
      const result = addCompetitor(profile);
      expect(result.id).toBe("comp-1");
      expect(result.name).toBe("Acme Corp");

      const fetched = getCompetitor("comp-1");
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe("Acme Corp");
    });

    it("lists all registered competitors", () => {
      addCompetitor(makeCompetitor({ id: "c1", name: "Alpha" }));
      addCompetitor(makeCompetitor({ id: "c2", name: "Beta" }));
      const list = listCompetitors();
      expect(list).toHaveLength(2);
      expect(list.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
    });

    it("returns undefined for unknown competitor ID", () => {
      expect(getCompetitor("nonexistent")).toBeUndefined();
    });

    it("returns an empty list when no competitors are registered", () => {
      expect(listCompetitors()).toHaveLength(0);
    });

    it("throws when adding a competitor with a duplicate ID", () => {
      addCompetitor(makeCompetitor({ id: "dup" }));
      expect(() => addCompetitor(makeCompetitor({ id: "dup" }))).toThrowError(
        /already exists/
      );
    });

    it("preserves optional website field", () => {
      addCompetitor(makeCompetitor({ id: "web", website: "https://acme.com" }));
      const fetched = getCompetitor("web");
      expect(fetched!.website).toBe("https://acme.com");
    });
  });

  // ---- updateCompetitor ----

  describe("updateCompetitor", () => {
    it("updates specific fields of an existing competitor", () => {
      addCompetitor(makeCompetitor({ id: "u1", name: "Old Name" }));
      const updated = updateCompetitor("u1", { name: "New Name", threatLevel: "high" });
      expect(updated.name).toBe("New Name");
      expect(updated.threatLevel).toBe("high");
      expect(updated.id).toBe("u1");
    });

    it("throws for an unknown competitor ID", () => {
      expect(() => updateCompetitor("ghost", { name: "X" })).toThrowError(
        /not found/
      );
    });

    it("sets lastUpdated when not explicitly provided", () => {
      addCompetitor(makeCompetitor({ id: "u2", lastUpdated: "2020-01-01T00:00:00.000Z" }));
      const updated = updateCompetitor("u2", { name: "Refreshed" });
      expect(updated.lastUpdated).not.toBe("2020-01-01T00:00:00.000Z");
    });

    it("preserves fields that are not updated", () => {
      addCompetitor(
        makeCompetitor({ id: "u3", name: "Stable", description: "Original desc" })
      );
      const updated = updateCompetitor("u3", { threatLevel: "critical" });
      expect(updated.name).toBe("Stable");
      expect(updated.description).toBe("Original desc");
      expect(updated.threatLevel).toBe("critical");
    });
  });

  // ---- gapReportToMarkdown ----

  describe("gapReportToMarkdown", () => {
    it("produces markdown with heading and summary", () => {
      const md = gapReportToMarkdown(makeGapReport());
      expect(md).toContain("# Gap Analysis: Acme Corp");
      expect(md).toContain("**Overall Position:** competitive");
      expect(md).toContain("## Summary");
      expect(md).toContain("Test summary");
    });

    it("includes top opportunities section", () => {
      const md = gapReportToMarkdown(makeGapReport({ topOpportunities: ["Opp A", "Opp B"] }));
      expect(md).toContain("## Top Opportunities");
      expect(md).toContain("- Opp A");
      expect(md).toContain("- Opp B");
    });

    it("includes urgent threats section", () => {
      const md = gapReportToMarkdown(makeGapReport({ urgentThreats: ["Threat X"] }));
      expect(md).toContain("## Urgent Threats");
      expect(md).toContain("- Threat X");
    });

    it("includes capability gaps table", () => {
      const md = gapReportToMarkdown(makeGapReport());
      expect(md).toContain("## Capability Gaps");
      expect(md).toContain("| AI | behind | has it | 80 | high | Invest now |");
    });

    it("omits opportunities section when empty", () => {
      const md = gapReportToMarkdown(makeGapReport({ topOpportunities: [] }));
      expect(md).not.toContain("## Top Opportunities");
    });

    it("omits threats section when empty", () => {
      const md = gapReportToMarkdown(makeGapReport({ urgentThreats: [] }));
      expect(md).not.toContain("## Urgent Threats");
    });

    it("omits gaps table when no gaps exist", () => {
      const md = gapReportToMarkdown(makeGapReport({ gaps: [] }));
      expect(md).not.toContain("## Capability Gaps");
    });
  });

  // ---- radarDashboardToMarkdown ----

  describe("radarDashboardToMarkdown", () => {
    const baseDashboard: RadarDashboard = {
      quadrants: [
        {
          name: "Tech",
          entries: [{ name: "Acme", x: 0.5, y: 0.8, description: "Strong" }],
        },
      ],
      competitors: [makeCompetitor({ id: "d1", name: "Acme" })],
      alerts: [
        {
          id: "a1",
          type: "new-feature",
          competitor: "Acme",
          title: "Launched AI",
          description: "They launched AI",
          severity: "high",
          detectedAt: "2024-06-01T00:00:00.000Z",
          actionRequired: true,
        },
      ],
      lastScanned: "2024-06-01T00:00:00.000Z",
      trendAnalysis: "Market is shifting",
    };

    it("produces dashboard heading and trend analysis", () => {
      const md = radarDashboardToMarkdown(baseDashboard);
      expect(md).toContain("# Competitive Radar Dashboard");
      expect(md).toContain("## Trend Analysis");
      expect(md).toContain("Market is shifting");
    });

    it("renders quadrant entries in a table", () => {
      const md = radarDashboardToMarkdown(baseDashboard);
      expect(md).toContain("### Tech");
      expect(md).toContain("| Acme | (0.50, 0.80) | Strong |");
    });

    it("shows *No entries* for empty quadrants", () => {
      const dashboard: RadarDashboard = {
        ...baseDashboard,
        quadrants: [{ name: "Empty Q", entries: [] }],
      };
      const md = radarDashboardToMarkdown(dashboard);
      expect(md).toContain("*No entries*");
    });

    it("includes competitors table", () => {
      const md = radarDashboardToMarkdown(baseDashboard);
      expect(md).toContain("## Competitors");
      expect(md).toContain("| Acme |");
    });

    it("renders alerts with severity icons", () => {
      const md = radarDashboardToMarkdown(baseDashboard);
      expect(md).toContain("## Active Alerts");
      expect(md).toContain("🟠");
      expect(md).toContain("⚠️ Action Required");
    });

    it("omits alerts section when empty", () => {
      const dashboard: RadarDashboard = { ...baseDashboard, alerts: [] };
      const md = radarDashboardToMarkdown(dashboard);
      expect(md).not.toContain("## Active Alerts");
    });

    it("renders critical alert with red icon", () => {
      const dashboard: RadarDashboard = {
        ...baseDashboard,
        alerts: [{ ...baseDashboard.alerts[0], severity: "critical" }],
      };
      const md = radarDashboardToMarkdown(dashboard);
      expect(md).toContain("🔴");
    });

    it("renders low severity alert with green icon", () => {
      const dashboard: RadarDashboard = {
        ...baseDashboard,
        alerts: [
          { ...baseDashboard.alerts[0], severity: "low", actionRequired: false },
        ],
      };
      const md = radarDashboardToMarkdown(dashboard);
      expect(md).toContain("🟢");
      expect(md).not.toContain("⚠️ Action Required");
    });
  });

  // ---- runGapAnalysis (LLM-dependent) ----

  describe("runGapAnalysis", () => {
    it("returns a gap analysis report for an existing competitor", async () => {
      addCompetitor(makeCompetitor({ id: "gap1" }));
      const report = await runGapAnalysis("gap1", ["Search", "Cloud"]);
      expect(report.competitor).toBe("Acme Corp");
      expect(report.gaps).toHaveLength(1);
      expect(report.gaps[0].capability).toBe("AI");
      expect(report.overallPosition).toBe("competitive");
    });

    it("throws for unknown competitor ID", async () => {
      await expect(runGapAnalysis("unknown", ["AI"])).rejects.toThrowError(/not found/);
    });
  });

  // ---- runMultiCompetitorGapAnalysis ----

  describe("runMultiCompetitorGapAnalysis", () => {
    it("returns reports for all specified competitors", async () => {
      addCompetitor(makeCompetitor({ id: "m1", name: "Multi A" }));
      addCompetitor(makeCompetitor({ id: "m2", name: "Multi B" }));
      const reports = await runMultiCompetitorGapAnalysis(["m1", "m2"], ["Cloud"]);
      expect(reports).toHaveLength(2);
      expect(reports[0].competitor).toBe("Multi A");
      expect(reports[1].competitor).toBe("Multi B");
    });

    it("returns empty array for empty competitor list", async () => {
      const reports = await runMultiCompetitorGapAnalysis([], ["Cloud"]);
      expect(reports).toHaveLength(0);
    });
  });

  // ---- generateRadarDashboard ----

  describe("generateRadarDashboard", () => {
    it("returns empty dashboard when no competitors exist", async () => {
      const dashboard = await generateRadarDashboard();
      expect(dashboard.competitors).toHaveLength(0);
      expect(dashboard.quadrants).toHaveLength(4);
      expect(dashboard.trendAnalysis).toContain("No competitors registered");
    });

    it("generates dashboard with registered competitors", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          quadrants: [
            { name: "Tech", entries: [{ name: "Acme", x: 0.5, y: 0.7, description: "Strong" }] },
          ],
          trendAnalysis: "AI is dominant",
        })
      );
      addCompetitor(makeCompetitor({ id: "rd1" }));
      const dashboard = await generateRadarDashboard();
      expect(dashboard.competitors).toHaveLength(1);
      expect(dashboard.lastScanned).toBeDefined();
    });

    it("accepts custom quadrant names", async () => {
      const dashboard = await generateRadarDashboard({
        quadrantNames: ["Alpha", "Beta"],
      });
      expect(dashboard.quadrants.map((q) => q.name)).toEqual(["Alpha", "Beta"]);
    });
  });

  // ---- checkForAlerts ----

  describe("checkForAlerts", () => {
    it("returns empty array when no recent events exist", async () => {
      const alerts = await checkForAlerts();
      expect(alerts).toHaveLength(0);
    });

    it("generates alerts from competitive events", async () => {
      (getCompetitiveEvents as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          id: "e1",
          source: "product-hunt",
          title: "Launched AI Tool",
          description: "Competitor launched an AI tool",
          competitorName: "Rival Inc",
          significanceScore: 0.9,
          threatLevel: "high",
          classification: "threat",
          domains: ["AI"],
          detectedAt: new Date().toISOString(),
        },
      ]);
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({
          alerts: [
            {
              type: "new-feature",
              competitor: "Rival Inc",
              title: "AI Tool Launch",
              description: "They launched an AI tool",
              severity: "high",
              actionRequired: true,
            },
          ],
        })
      );
      const alerts = await checkForAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].competitor).toBe("Rival Inc");
      expect(alerts[0].type).toBe("new-feature");
      expect(alerts[0].id).toBeDefined();
    });
  });

  // ---- getCompetitiveContext ----

  describe("getCompetitiveContext", () => {
    it("returns empty string when no competitors or events exist", async () => {
      const context = await getCompetitiveContext("AI strategy");
      expect(context).toBe("");
    });

    it("returns context when competitors are registered", async () => {
      const { generateText } = await import("../../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "  Acme Corp is a key competitor in the AI space.  "
      );
      addCompetitor(makeCompetitor({ id: "ctx1" }));
      const context = await getCompetitiveContext("AI strategy");
      expect(context).toBe("Acme Corp is a key competitor in the AI space.");
    });
  });
});
