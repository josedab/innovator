import { describe, it, expect, beforeEach } from "vitest";

import {
  registerIntegration,
  getIntegration,
  listIntegrations,
  removeIntegration,
  linkItem,
  updateLinkedItemStatus,
  getLinkedItems,
  syncIntegration,
  computeROI,
  getROIMetric,
  listROIMetrics,
  generateROISummary,
  roiSummaryToMarkdown,
  clearIntegrationData,
} from "../impact-tracker/integrations.js";

beforeEach(() => {
  clearIntegrationData();
});

describe("Integration Management", () => {
  it("registers and retrieves an integration", () => {
    const config = registerIntegration({
      type: "jira",
      name: "Project Jira",
      baseUrl: "https://company.atlassian.net",
      projectKey: "INNOV",
    });
    expect(config.id).toBeDefined();
    expect(config.type).toBe("jira");

    const retrieved = getIntegration(config.id);
    expect(retrieved?.name).toBe("Project Jira");
  });

  it("lists all integrations", () => {
    registerIntegration({ type: "jira", name: "Jira" });
    registerIntegration({ type: "linear", name: "Linear" });
    registerIntegration({ type: "github", name: "GitHub" });

    const all = listIntegrations();
    expect(all).toHaveLength(3);
  });

  it("removes an integration", () => {
    const config = registerIntegration({ type: "github", name: "GH" });
    expect(removeIntegration(config.id)).toBe(true);
    expect(getIntegration(config.id)).toBeUndefined();
  });
});

describe("Linked Items", () => {
  it("links an item to an idea", () => {
    const integration = registerIntegration({ type: "jira", name: "Jira" });
    const item = linkItem({
      ideaId: "idea-1",
      integrationId: integration.id,
      externalId: "INNOV-123",
      externalUrl: "https://jira.example.com/INNOV-123",
      type: "story",
      title: "Implement AI Chatbot",
      status: "open",
      metadata: {},
    });
    expect(item.id).toBeDefined();
    expect(item.ideaId).toBe("idea-1");
  });

  it("updates linked item status", () => {
    const integration = registerIntegration({ type: "linear", name: "Linear" });
    const item = linkItem({
      ideaId: "idea-2",
      integrationId: integration.id,
      externalId: "LIN-456",
      type: "task",
      title: "Build API",
      status: "open",
      metadata: {},
    });

    const updated = updateLinkedItemStatus(item.id, "done");
    expect(updated?.status).toBe("done");
    expect(updated?.completedAt).toBeDefined();
  });

  it("gets linked items for an idea", () => {
    const integration = registerIntegration({ type: "github", name: "GH" });
    linkItem({
      ideaId: "idea-3",
      integrationId: integration.id,
      externalId: "PR-1",
      type: "pr",
      title: "PR 1",
      status: "open",
      metadata: {},
    });
    linkItem({
      ideaId: "idea-3",
      integrationId: integration.id,
      externalId: "PR-2",
      type: "pr",
      title: "PR 2",
      status: "done",
      metadata: {},
    });
    linkItem({
      ideaId: "idea-4",
      integrationId: integration.id,
      externalId: "PR-3",
      type: "pr",
      title: "Other PR",
      status: "open",
      metadata: {},
    });

    const items = getLinkedItems("idea-3");
    expect(items).toHaveLength(2);
  });
});

describe("Sync Integration", () => {
  it("syncs and updates timestamp", () => {
    const integration = registerIntegration({ type: "jira", name: "Jira" });
    linkItem({
      ideaId: "idea-1",
      integrationId: integration.id,
      externalId: "JIRA-1",
      type: "story",
      title: "Story 1",
      status: "done",
      metadata: {},
    });

    const result = syncIntegration(integration.id);
    expect(result.synced).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.integration?.lastSyncAt).toBeDefined();
  });

  it("returns zero for non-existent integration", () => {
    const result = syncIntegration("nonexistent");
    expect(result.synced).toBe(0);
    expect(result.integration).toBeUndefined();
  });
});

describe("ROI Attribution", () => {
  it("computes ROI for an idea", () => {
    const integration = registerIntegration({ type: "github", name: "GH" });
    const item = linkItem({
      ideaId: "idea-roi",
      integrationId: integration.id,
      externalId: "PR-1",
      type: "pr",
      title: "AI Feature",
      status: "open",
      metadata: {},
    });
    updateLinkedItemStatus(item.id, "done");

    const roi = computeROI("idea-roi", {
      investmentHours: 100,
      hourlyRate: 150,
      revenueGenerated: 50000,
      costSaved: 10000,
      usersImpacted: 1000,
    });

    expect(roi.investmentCost).toBe(15000);
    expect(roi.revenueGenerated).toBe(50000);
    expect(roi.roi).toBeGreaterThan(0);
    expect(roi.status).toBe("shipped");
    expect(roi.attributionConfidence).toBeGreaterThan(0);
  });

  it("computes zero ROI with no investment", () => {
    const integration = registerIntegration({ type: "jira", name: "Jira" });
    linkItem({
      ideaId: "idea-zero",
      integrationId: integration.id,
      externalId: "J-1",
      type: "task",
      title: "Task",
      status: "open",
      metadata: {},
    });

    const roi = computeROI("idea-zero", {});
    expect(roi.roi).toBe(0);
    expect(roi.status).toBe("tracking");
  });

  it("retrieves stored ROI metric", () => {
    const integration = registerIntegration({ type: "linear", name: "Lin" });
    linkItem({
      ideaId: "idea-stored",
      integrationId: integration.id,
      externalId: "L-1",
      type: "issue",
      title: "Issue",
      status: "open",
      metadata: {},
    });
    computeROI("idea-stored", { investmentCost: 5000, revenueGenerated: 15000 });

    const metric = getROIMetric("idea-stored");
    expect(metric).toBeDefined();
    expect(metric!.roi).toBeGreaterThan(0);
  });
});

describe("ROI Summary", () => {
  it("generates aggregate summary", () => {
    const integration = registerIntegration({ type: "github", name: "GH" });

    const item1 = linkItem({
      ideaId: "sum-1",
      integrationId: integration.id,
      externalId: "P-1",
      type: "pr",
      title: "Feature A",
      status: "open",
      metadata: {},
    });
    updateLinkedItemStatus(item1.id, "done");
    computeROI("sum-1", { investmentCost: 10000, revenueGenerated: 30000 });

    linkItem({
      ideaId: "sum-2",
      integrationId: integration.id,
      externalId: "P-2",
      type: "pr",
      title: "Feature B",
      status: "open",
      metadata: {},
    });
    computeROI("sum-2", { investmentCost: 5000 });

    const summary = generateROISummary();
    expect(summary.totalIdeasTracked).toBe(2);
    expect(summary.ideasShipped).toBe(1);
    expect(summary.totalInvestment).toBe(15000);
    expect(summary.totalReturn).toBe(30000);
    expect(summary.aggregateROI).toBeGreaterThan(0);
  });

  it("generates markdown", () => {
    const integration = registerIntegration({ type: "jira", name: "Jira" });
    const item = linkItem({
      ideaId: "md-1",
      integrationId: integration.id,
      externalId: "J-1",
      type: "story",
      title: "Story",
      status: "open",
      metadata: {},
    });
    updateLinkedItemStatus(item.id, "done");
    computeROI("md-1", {
      investmentCost: 8000,
      revenueGenerated: 25000,
      usersImpacted: 500,
    });

    const summary = generateROISummary();
    const md = roiSummaryToMarkdown(summary);
    expect(md).toContain("Innovation ROI Summary");
    expect(md).toContain("Ideas Shipped");
    expect(md).toContain("Aggregate ROI");
  });
});
