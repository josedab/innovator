import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  addPatent,
  listPatents,
  removePatent,
  addMarketSignal,
  listMarketSignals,
  removeMarketSignal,
  clearIntelligenceData,
  intelligenceBriefToMarkdown,
  PatentEntrySchema,
  MarketSignalSchema,
  IntelligenceBriefSchema,
} from "../competitive-radar/intelligence-brief.js";

beforeEach(() => {
  clearIntelligenceData();
});

describe("Patent Monitoring", () => {
  it("adds and lists patents", () => {
    const patent = addPatent({
      title: "AI Method for Drug Discovery",
      applicant: "CompetitorX",
      filingDate: "2024-01-15",
      status: "filed",
      relevanceScore: 85,
      abstract: "A method for using AI in drug discovery.",
      domain: "healthcare",
      threatLevel: "high",
    });
    expect(patent.id).toBeDefined();
    expect(patent.title).toBe("AI Method for Drug Discovery");

    const all = listPatents();
    expect(all).toHaveLength(1);
  });

  it("filters patents by applicant", () => {
    addPatent({
      title: "Patent A",
      applicant: "CompetitorX",
      filingDate: "2024-01-15",
      status: "filed",
      relevanceScore: 80,
      abstract: "Abstract A",
      domain: "tech",
    });
    addPatent({
      title: "Patent B",
      applicant: "CompetitorY",
      filingDate: "2024-02-15",
      status: "published",
      relevanceScore: 60,
      abstract: "Abstract B",
      domain: "tech",
    });

    const filtered = listPatents({ applicant: "CompetitorX" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].applicant).toBe("CompetitorX");
  });

  it("filters patents by minimum relevance", () => {
    addPatent({
      title: "High Relevance",
      applicant: "A",
      filingDate: "2024-01-15",
      status: "filed",
      relevanceScore: 90,
      abstract: "High",
      domain: "tech",
    });
    addPatent({
      title: "Low Relevance",
      applicant: "B",
      filingDate: "2024-02-15",
      status: "filed",
      relevanceScore: 20,
      abstract: "Low",
      domain: "tech",
    });

    const filtered = listPatents({ minRelevance: 50 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("High Relevance");
  });

  it("removes patents", () => {
    const patent = addPatent({
      title: "ToRemove",
      applicant: "A",
      filingDate: "2024-01-01",
      status: "filed",
      relevanceScore: 50,
      abstract: "Remove me",
      domain: "tech",
    });
    expect(removePatent(patent.id)).toBe(true);
    expect(listPatents()).toHaveLength(0);
    expect(removePatent("nonexistent")).toBe(false);
  });

  it("validates patent schema", () => {
    expect(() =>
      PatentEntrySchema.parse({
        id: "1",
        title: "Test",
        applicant: "A",
        filingDate: "2024-01-01",
        status: "filed",
        relevanceScore: 85,
        abstract: "Test abstract",
        domain: "tech",
      })
    ).not.toThrow();
  });
});

describe("Market Signal Tracking", () => {
  it("adds and lists signals", () => {
    const signal = addMarketSignal({
      type: "funding",
      title: "CompetitorX raises $50M",
      description: "Series C funding round",
      date: "2024-06-01",
      impactScore: 75,
      relatedCompetitors: ["CompetitorX"],
      actionRequired: true,
    });
    expect(signal.id).toBeDefined();
    expect(signal.type).toBe("funding");

    const all = listMarketSignals();
    expect(all).toHaveLength(1);
  });

  it("filters signals by type", () => {
    addMarketSignal({
      type: "funding",
      title: "Funding A",
      description: "A",
      date: "2024-01-01",
      impactScore: 60,
      relatedCompetitors: [],
    });
    addMarketSignal({
      type: "acquisition",
      title: "Acquisition B",
      description: "B",
      date: "2024-02-01",
      impactScore: 80,
      relatedCompetitors: [],
    });

    const filtered = listMarketSignals({ type: "funding" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Funding A");
  });

  it("filters by action required", () => {
    addMarketSignal({
      type: "regulation",
      title: "GDPR Update",
      description: "New requirements",
      date: "2024-01-01",
      impactScore: 90,
      relatedCompetitors: [],
      actionRequired: true,
    });
    addMarketSignal({
      type: "partnership",
      title: "Partnership",
      description: "Info only",
      date: "2024-02-01",
      impactScore: 40,
      relatedCompetitors: [],
      actionRequired: false,
    });

    const actionable = listMarketSignals({ actionRequired: true });
    expect(actionable).toHaveLength(1);
    expect(actionable[0].title).toBe("GDPR Update");
  });

  it("removes signals", () => {
    const signal = addMarketSignal({
      type: "product_launch",
      title: "Prod",
      description: "D",
      date: "2024-01-01",
      impactScore: 50,
      relatedCompetitors: [],
    });
    expect(removeMarketSignal(signal.id)).toBe(true);
    expect(listMarketSignals()).toHaveLength(0);
  });
});

describe("intelligenceBriefToMarkdown", () => {
  it("generates formatted markdown", () => {
    const brief = IntelligenceBriefSchema.parse({
      id: "brief-1",
      period: "weekly",
      generatedAt: new Date().toISOString(),
      executiveSummary: "Competitive landscape is evolving.",
      sections: [
        {
          title: "Key Threats",
          content: "CompetitorX has increased R&D.",
          priority: "high",
          relatedCompetitors: ["CompetitorX"],
        },
      ],
      patents: [
        {
          id: "p1",
          title: "AI Patent",
          applicant: "CompetitorX",
          filingDate: "2024-01-01",
          status: "filed",
          relevanceScore: 80,
          abstract: "An AI patent",
          domain: "tech",
        },
      ],
      marketSignals: [
        {
          id: "s1",
          type: "funding",
          title: "Series C",
          description: "$50M raise",
          date: "2024-06-01",
          impactScore: 75,
          relatedCompetitors: ["CompetitorX"],
        },
      ],
      alerts: [{ title: "Major move", severity: "high", competitor: "CompetitorX" }],
      recommendations: [
        {
          action: "Accelerate feature development",
          priority: "high",
          rationale: "Competitor is closing the gap",
        },
      ],
      overallThreatLevel: "elevated",
    });

    const md = intelligenceBriefToMarkdown(brief);
    expect(md).toContain("Weekly Intelligence Brief");
    expect(md).toContain("Executive Summary");
    expect(md).toContain("ELEVATED");
    expect(md).toContain("Patent Activity");
    expect(md).toContain("Market Signals");
    expect(md).toContain("Recommendations");
    expect(md).toContain("AI Patent");
  });
});
