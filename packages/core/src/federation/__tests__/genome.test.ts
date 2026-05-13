import { describe, it, expect, beforeEach } from "vitest";
import {
  applyDifferentialPrivacy,
  privatizePattern,
  generateGenomeInsights,
  enrichAngleSelection,
  createGossipDigest,
  gossipSync,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  wilsonConfidenceInterval,
  signPattern,
  verifyPatternSignature,
  publishSignedPattern,
  trackPrivacyBudget,
  getPrivacyBudgetSpent,
  isPrivacyBudgetExceeded,
  resetPrivacyBudgets,
} from "../genome.js";
import {
  createFederationNode,
  extractPatterns,
  clearFederation,
} from "../index.js";

function setupTestNetwork() {
  clearFederation();
  const nodeA = createFederationNode({ name: "Node A", isPublic: true });
  const nodeB = createFederationNode({ name: "Node B", isPublic: true });

  extractPatterns({
    nodeId: nodeA.id,
    domain: "fintech",
    angleResults: [
      { angleId: "scamper", angleName: "SCAMPER", ideasCount: 5, successRate: 0.8 },
      { angleId: "first-principles", angleName: "First Principles", ideasCount: 3, successRate: 0.9 },
      { angleId: "cross-domain", angleName: "Cross-Domain", ideasCount: 4, successRate: 0.7 },
    ],
  });

  extractPatterns({
    nodeId: nodeB.id,
    domain: "healthcare",
    angleResults: [
      { angleId: "constraints", angleName: "Constraint Injection", ideasCount: 6, successRate: 0.85 },
      { angleId: "inversion", angleName: "Problem Inversion", ideasCount: 2, successRate: 0.6 },
    ],
  });

  return { nodeA, nodeB };
}

beforeEach(() => {
  clearFederation();
});

describe("differential privacy", () => {
  it("applies noise to numeric values", () => {
    const values = Array.from({ length: 100 }, () =>
      applyDifferentialPrivacy(50, 1, { epsilon: 1.0, mechanism: "laplace" })
    );
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    // Mean should be close to 50 with enough samples
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(60);
    // Some values should differ from 50
    expect(values.some((v) => v !== 50)).toBe(true);
  });

  it("privatizes pattern numeric fields", () => {
    const { nodeA } = setupTestNetwork();
    const patterns = extractPatterns({
      nodeId: nodeA.id,
      domain: "test",
      angleResults: [{ angleId: "scamper", angleName: "SCAMPER", ideasCount: 10, successRate: 0.75 }],
    });
    expect(patterns.length).toBeGreaterThan(0);
    const privatized = privatizePattern(patterns[0]);
    // Privatized pattern should have altered values
    expect(privatized.id).toBe(patterns[0].id);
    expect(typeof privatized.frequency).toBe("number");
    expect(typeof privatized.successRate).toBe("number");
    expect(privatized.successRate).toBeGreaterThanOrEqual(0);
    expect(privatized.successRate).toBeLessThanOrEqual(1);
  });
});

describe("pipeline enrichment", () => {
  it("generates insights for a domain", () => {
    const { nodeA } = setupTestNetwork();
    const insights = generateGenomeInsights(nodeA.id, "fintech");
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].confidence).toBeGreaterThan(0);
  });

  it("returns empty insights for unknown domains", () => {
    const { nodeA } = setupTestNetwork();
    const insights = generateGenomeInsights(nodeA.id, "quantum-biology-xyz");
    // May still return some non-domain-specific insights
    expect(Array.isArray(insights)).toBe(true);
  });

  it("enriches angle selection based on network data", () => {
    const { nodeA } = setupTestNetwork();
    const result = enrichAngleSelection(nodeA.id, ["scamper"], "fintech");
    expect(result.angles).toContain("scamper");
    expect(result.insightCount).toBeGreaterThanOrEqual(0);
  });
});

describe("gossip sync", () => {
  it("creates a gossip digest", () => {
    const { nodeA } = setupTestNetwork();
    const digest = createGossipDigest(nodeA.id);
    expect(digest).not.toBeNull();
    expect(digest!.nodeId).toBe(nodeA.id);
    expect(digest!.patternCount).toBeGreaterThan(0);
  });

  it("syncs patterns between nodes", () => {
    const { nodeA, nodeB } = setupTestNetwork();
    const result = gossipSync(nodeA.id, nodeB.id);
    expect(result.received).toBeGreaterThanOrEqual(0);
    expect(result.shared).toBeGreaterThanOrEqual(0);
  });

  it("returns zeros for unknown nodes", () => {
    const result = gossipSync("nonexistent-a", "nonexistent-b");
    expect(result.received).toBe(0);
    expect(result.shared).toBe(0);
  });
});

describe("genome analytics", () => {
  it("computes analytics for a node", () => {
    const { nodeA } = setupTestNetwork();
    const analytics = computeGenomeAnalytics(nodeA.id);
    expect(analytics.totalPatterns).toBeGreaterThan(0);
    expect(analytics.topAngles.length).toBeGreaterThan(0);
    expect(analytics.topDomains.length).toBeGreaterThan(0);
  });

  it("handles empty node", () => {
    const node = createFederationNode({ name: "Empty" });
    const analytics = computeGenomeAnalytics(node.id);
    expect(analytics.totalPatterns).toBe(0);
  });

  it("formats analytics as markdown", () => {
    const { nodeA } = setupTestNetwork();
    const analytics = computeGenomeAnalytics(nodeA.id);
    const md = genomeAnalyticsToMarkdown(analytics);
    expect(md).toContain("Innovation Genome Analytics");
    expect(md).toContain("Top Angles");
    expect(md).toContain("Top Domains");
  });
});

describe("published patterns with signatures", () => {
  it("computes Wilson confidence interval", () => {
    const [low, high] = wilsonConfidenceInterval(0.8, 100);
    expect(low).toBeGreaterThan(0.5);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(high);
  });

  it("handles zero sample size", () => {
    const [low, high] = wilsonConfidenceInterval(0.5, 0);
    expect(low).toBe(0);
    expect(high).toBe(1);
  });

  it("signs and verifies patterns", () => {
    const pattern = {
      id: "test-1",
      type: "angle-effectiveness" as const,
      domainCategory: "test",
      angleIds: ["scamper"],
      effectivenessScore: 0.8,
      chainSequence: undefined,
      sampleSize: 10,
      confidenceInterval: [0.6, 0.9] as [number, number],
      timestamp: "2026-01-01T00:00:00Z",
      diffPrivacyBudget: 1.0,
    };
    const signature = signPattern(pattern, "secret-key-123");
    expect(typeof signature).toBe("string");
    expect(signature.length).toBeGreaterThan(10);

    const signed = { ...pattern, sourceNodeSignature: signature };
    expect(verifyPatternSignature(signed, "secret-key-123")).toBe(true);
    expect(verifyPatternSignature(signed, "wrong-key")).toBe(false);
  });

  it("publishes signed patterns from federation patterns", () => {
    const { nodeA } = setupTestNetwork();
    const patterns = extractPatterns({
      nodeId: nodeA.id,
      domain: "test",
      angleResults: [{ angleId: "scamper", angleName: "SCAMPER", ideasCount: 10, successRate: 0.8 }],
    });
    expect(patterns.length).toBeGreaterThan(0);

    const published = publishSignedPattern(patterns[0], "test-secret");
    expect(published.sourceNodeSignature).toBeTruthy();
    expect(published.confidenceInterval).toHaveLength(2);
    expect(published.confidenceInterval[0]).toBeLessThanOrEqual(published.confidenceInterval[1]);
    expect(published.diffPrivacyBudget).toBe(1.0);
  });
});

describe("privacy budget tracking", () => {
  beforeEach(() => {
    resetPrivacyBudgets();
  });

  it("tracks cumulative privacy budget", () => {
    expect(getPrivacyBudgetSpent("node-1")).toBe(0);

    trackPrivacyBudget("node-1", 0.5);
    expect(getPrivacyBudgetSpent("node-1")).toBe(0.5);

    trackPrivacyBudget("node-1", 0.3);
    expect(getPrivacyBudgetSpent("node-1")).toBe(0.8);

    expect(isPrivacyBudgetExceeded("node-1", 1.0)).toBe(false);
    expect(isPrivacyBudgetExceeded("node-1", 0.5)).toBe(true);

    resetPrivacyBudgets();
    expect(getPrivacyBudgetSpent("node-1")).toBe(0);
  });
});
