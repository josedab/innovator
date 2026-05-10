import { describe, it, expect, beforeEach } from "vitest";
import {
  createFederationNode,
  getNode,
  listNodes,
  extractPatterns,
  publishPatterns,
  discoverPeers,
  fetchRemotePatterns,
  mergePatterns,
  getNetworkDashboard,
  clearFederation,
  createActivity,
  receiveActivity,
  getInbox,
  getOutbox,
  privatizeCount,
  privatizeRate,
  createPrivateSummary,
  getInnovationPulse,
  FederationPatternSchema,
  PeerNodeSchema,
  FederationNodeSchema,
  type FederationPattern,
} from "../index.js";

describe("federation", () => {
  beforeEach(() => {
    clearFederation();
  });

  // ---- createFederationNode ----

  describe("createFederationNode", () => {
    it("creates a node with required fields", () => {
      const node = createFederationNode({ name: "Test Node" });
      expect(typeof node.id).toBe("string");
      expect(node.id.length).toBeGreaterThan(0);
      expect(node.name).toBe("Test Node");
      expect(node.isPublic).toBe(false);
      expect(node.peers).toEqual([]);
      expect(node.localPatterns).toEqual([]);
      expect(node.receivedPatterns).toEqual([]);
      expect(node.sharingEnabled).toBe(true);
      expect(node.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(node.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("accepts optional fields", () => {
      const node = createFederationNode({
        name: "Public Node",
        description: "A test node",
        endpoint: "https://node.example.com",
        isPublic: true,
      });
      expect(node.isPublic).toBe(true);
      expect(node.description).toBe("A test node");
      expect(node.endpoint).toBe("https://node.example.com");
    });

    it("stores node retrievable by getNode", () => {
      const node = createFederationNode({ name: "Stored" });
      expect(getNode(node.id)).toEqual(node);
    });

    it("creates unique IDs for each node", () => {
      const a = createFederationNode({ name: "A" });
      const b = createFederationNode({ name: "B" });
      expect(a.id).not.toBe(b.id);
    });
  });

  // ---- listNodes ----

  describe("listNodes", () => {
    it("returns empty array when no nodes", () => {
      expect(listNodes()).toEqual([]);
    });

    it("returns all created nodes", () => {
      createFederationNode({ name: "A" });
      createFederationNode({ name: "B" });
      expect(listNodes()).toHaveLength(2);
    });
  });

  // ---- extractPatterns ----

  describe("extractPatterns", () => {
    it("extracts trending-angle patterns from angle results", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns = extractPatterns({
        nodeId: node.id,
        domain: "fintech",
        angleResults: [
          { angleId: "a1", angleName: "First Principles", ideasCount: 5, successRate: 0.8 },
        ],
      });

      expect(patterns.length).toBeGreaterThanOrEqual(1);
      const trendingPattern = patterns.find((p) => p.type === "trending-angle");
      expect(trendingPattern).toMatchObject({
        type: "trending-angle",
        anonymizedDomain: "Financial Technology Domain",
      });
      expect(trendingPattern!.anonymizedDomain).toBe("Financial Technology Domain");
    });

    it("creates successful-combination pattern when 2+ angles", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns = extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [
          { angleId: "a1", angleName: "First Principles", ideasCount: 5, successRate: 0.9 },
          { angleId: "a2", angleName: "Biomimicry", ideasCount: 3, successRate: 0.7 },
        ],
      });

      const combPattern = patterns.find((p) => p.type === "successful-combination");
      expect(combPattern).toMatchObject({
        type: "successful-combination",
        anonymizedDomain: "Intelligent Systems Domain",
      });
      expect(combPattern!.angleIds.length).toBeGreaterThanOrEqual(2);
    });

    it("stores patterns on the node", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "healthcare",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 3 }],
      });

      const updated = getNode(node.id);
      expect(updated!.localPatterns.length).toBeGreaterThan(0);
    });

    it("returns empty array for non-existent node", () => {
      const patterns = extractPatterns({
        nodeId: "nonexistent",
        domain: "ai",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 5 }],
      });
      expect(patterns).toEqual([]);
    });

    it("skips angle results with 0 ideas", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns = extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 0 }],
      });
      const trending = patterns.filter((p) => p.type === "trending-angle");
      expect(trending).toHaveLength(0);
    });

    it("deduplicates by using unique IDs", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns = extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [
          { angleId: "a1", angleName: "A1", ideasCount: 3 },
          { angleId: "a2", angleName: "A2", ideasCount: 3 },
          { angleId: "a3", angleName: "A3", ideasCount: 3 },
        ],
      });
      const ids = patterns.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ---- publishPatterns ----

  describe("publishPatterns", () => {
    it("returns local patterns when sharing is enabled", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 5 }],
      });

      const published = publishPatterns(node.id);
      expect(published.length).toBeGreaterThan(0);
      expect(published[0]).toMatchObject({
        type: expect.any(String),
        title: expect.any(String),
        lastSeenAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it("returns empty array for non-existent node", () => {
      expect(publishPatterns("nonexistent")).toEqual([]);
    });
  });

  // ---- discoverPeers ----

  describe("discoverPeers", () => {
    it("returns public nodes except self", () => {
      const nodeA = createFederationNode({ name: "A", isPublic: true, endpoint: "https://a.com" });
      const nodeB = createFederationNode({ name: "B", isPublic: true, endpoint: "https://b.com" });
      createFederationNode({ name: "C", isPublic: false });

      const peers = discoverPeers(nodeA.id);
      expect(peers).toHaveLength(1);
      expect(peers[0].id).toBe(nodeB.id);
      expect(peers[0].trustLevel).toBe("untrusted");
    });

    it("returns empty array when no other public nodes", () => {
      const node = createFederationNode({ name: "Solo", isPublic: true });
      expect(discoverPeers(node.id)).toEqual([]);
    });

    it("returns empty array for non-existent node", () => {
      expect(discoverPeers("nonexistent")).toEqual([]);
    });

    it("filters out non-public nodes", () => {
      const nodeA = createFederationNode({ name: "A", isPublic: true });
      createFederationNode({ name: "Private", isPublic: false });

      const peers = discoverPeers(nodeA.id);
      expect(peers).toHaveLength(0);
    });
  });

  // ---- mergePatterns ----

  describe("mergePatterns", () => {
    it("merges new patterns into received patterns", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns: FederationPattern[] = [
        {
          id: "p1",
          type: "trending-angle",
          title: "Pattern 1",
          description: "Desc",
          anonymizedDomain: "General Innovation Domain",
          angleIds: ["a1"],
          frequency: 1,
          successRate: 0.8,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ];

      const merged = mergePatterns(node.id, patterns);
      expect(merged).toBe(1);
      expect(getNode(node.id)!.receivedPatterns).toHaveLength(1);
    });

    it("deduplicates by title (increments frequency)", () => {
      const node = createFederationNode({ name: "Test" });
      const makePattern = (title: string): FederationPattern => ({
        id: `p-${Math.random()}`,
        type: "trending-angle",
        title,
        description: "Desc",
        anonymizedDomain: "General",
        angleIds: ["a1"],
        frequency: 1,
        successRate: 0.5,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });

      mergePatterns(node.id, [makePattern("Same Title")]);
      const merged2 = mergePatterns(node.id, [makePattern("Same Title")]);
      expect(merged2).toBe(0);

      const received = getNode(node.id)!.receivedPatterns;
      expect(received).toHaveLength(1);
      expect(received[0].frequency).toBe(2);
    });

    it("returns 0 for non-existent node", () => {
      expect(mergePatterns("nonexistent", [])).toBe(0);
    });
  });

  // ---- ActivityPub ----

  describe("ActivityPub", () => {
    it("creates activity with correct structure", () => {
      const node = createFederationNode({ name: "Test" });
      const activity = createActivity(node.id, "Create", "New pattern discovered", ["ai"]);

      expect(activity["@context"]).toBe("https://www.w3.org/ns/activitystreams");
      expect(activity.type).toBe("Create");
      expect(activity.object.content).toBe("New pattern discovered");
      expect(activity.object.tags).toEqual(["ai"]);
      expect(activity.published).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("stores activity in outbox", () => {
      const node = createFederationNode({ name: "Test" });
      createActivity(node.id, "Create", "Content");

      const outbox = getOutbox(node.id);
      expect(outbox).toHaveLength(1);
    });

    it("receives activity into inbox", () => {
      const node = createFederationNode({ name: "Test" });
      const activity = createActivity(node.id, "Share", "Shared pattern");

      const received = receiveActivity(node.id, activity);
      expect(received).toBe(true);
      expect(getInbox(node.id)).toHaveLength(1);
    });

    it("returns false when receiving to non-existent node", () => {
      const activity = createActivity("fake", "Create", "Content");
      expect(receiveActivity("nonexistent", activity)).toBe(false);
    });

    it("returns empty inbox for node with no messages", () => {
      const node = createFederationNode({ name: "Test" });
      expect(getInbox(node.id)).toEqual([]);
    });
  });

  // ---- Differential Privacy ----

  describe("privatizeCount", () => {
    it("returns a non-negative integer", () => {
      for (let i = 0; i < 20; i++) {
        const result = privatizeCount(10);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it("applies clipping bound", () => {
      // With default clippingBound=10, a value of 100 is clipped to 10
      const results: number[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(privatizeCount(100, { clippingBound: 10, epsilon: 100 }));
      }
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      // With high epsilon (low noise) and clipping at 10, avg should be near 10
      expect(avg).toBeLessThan(20);
    });

    it("handles zero count", () => {
      const result = privatizeCount(0, { epsilon: 100 });
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe("privatizeRate", () => {
    it("returns value clamped to [0, 1]", () => {
      for (let i = 0; i < 50; i++) {
        const result = privatizeRate(0.5, 100);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it("handles rate of 0", () => {
      const result = privatizeRate(0, 100, { epsilon: 100 });
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it("handles rate of 1", () => {
      const result = privatizeRate(1, 100, { epsilon: 100 });
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it("handles sample size of 1", () => {
      const result = privatizeRate(0.5, 1);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe("createPrivateSummary", () => {
    it("returns anonymized summary structure", () => {
      const patterns: FederationPattern[] = [
        {
          id: "p1",
          type: "trending-angle",
          title: "Pattern",
          description: "Desc",
          anonymizedDomain: "General Innovation Domain",
          angleIds: ["a1", "a2"],
          frequency: 3,
          successRate: 0.8,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ];

      const summary = createPrivateSummary(patterns);
      expect(summary.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(summary.avgSuccessRate).toBeGreaterThanOrEqual(0);
      expect(summary.avgSuccessRate).toBeLessThanOrEqual(1);
      expect(summary.trendingAngles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ angleId: expect.any(String), count: expect.any(Number) }),
        ])
      );
      expect(summary.topDomains).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ domain: expect.any(String), count: expect.any(Number) }),
        ])
      );
    });

    it("handles empty pattern set", () => {
      const summary = createPrivateSummary([]);
      expect(summary.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(summary.trendingAngles).toEqual([]);
      expect(summary.topDomains).toEqual([]);
    });
  });

  // ---- getNetworkDashboard ----

  describe("getNetworkDashboard", () => {
    it("returns dashboard with correct structure", () => {
      const node = createFederationNode({ name: "Test" });
      const dashboard = getNetworkDashboard(node.id);

      expect(dashboard.totalNodes).toBeGreaterThanOrEqual(1);
      expect(dashboard.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(dashboard.networkHealth).toBe("healthy");
      expect(Array.isArray(dashboard.trendingAngles)).toBe(true);
      expect(Array.isArray(dashboard.topPatterns)).toBe(true);
    });

    it("reports offline when no nodes", () => {
      const dashboard = getNetworkDashboard("nonexistent");
      expect(dashboard.networkHealth).toBe("offline");
    });
  });

  // ---- getInnovationPulse ----

  describe("getInnovationPulse", () => {
    it("returns pulse structure", () => {
      const pulse = getInnovationPulse();
      expect(pulse.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(pulse.healthScore).toBeGreaterThanOrEqual(0);
      expect(pulse.healthScore).toBeLessThanOrEqual(100);
      expect(pulse.geographicSpread).toEqual([]);
    });

    it("returns non-zero health with nodes and patterns", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 5 }],
      });

      const pulse = getInnovationPulse();
      expect(pulse.healthScore).toBeGreaterThan(0);
    });
  });

  // ---- Schema validation ----

  describe("schema validation", () => {
    it("FederationPatternSchema validates correct pattern", () => {
      const result = FederationPatternSchema.safeParse({
        id: "p1",
        type: "trending-angle",
        title: "Test",
        description: "Desc",
        anonymizedDomain: "Domain",
        angleIds: ["a1"],
        frequency: 1,
        successRate: 0.5,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("FederationPatternSchema rejects invalid type", () => {
      const result = FederationPatternSchema.safeParse({
        id: "p1",
        type: "invalid-type",
        title: "Test",
        description: "Desc",
        anonymizedDomain: "Domain",
        angleIds: ["a1"],
        frequency: 1,
        successRate: 0.5,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });

  // ---- Additional: privatizeCount Laplace noise bounds ----

  describe("privatizeCount — noise bounds", () => {
    it("output is always >= 0 even for zero input", () => {
      for (let i = 0; i < 100; i++) {
        expect(privatizeCount(0)).toBeGreaterThanOrEqual(0);
      }
    });

    it("with high epsilon (low noise), output clusters near input", () => {
      const results: number[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(privatizeCount(5, { epsilon: 100, clippingBound: 10 }));
      }
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      expect(avg).toBeGreaterThan(3);
      expect(avg).toBeLessThan(7);
    });
  });

  // ---- Additional: extractPatterns return shape ----

  describe("extractPatterns — return shape", () => {
    it("returns patterns with all required fields populated", () => {
      const node = createFederationNode({ name: "Test" });
      const patterns = extractPatterns({
        nodeId: node.id,
        domain: "healthcare",
        angleResults: [
          { angleId: "a1", angleName: "First Principles", ideasCount: 5, successRate: 0.7 },
        ],
      });
      for (const p of patterns) {
        expect(p).toMatchObject({
          id: expect.any(String),
          type: expect.any(String),
          title: expect.any(String),
          description: expect.any(String),
          anonymizedDomain: expect.any(String),
          angleIds: expect.any(Array),
          frequency: expect.any(Number),
          successRate: expect.any(Number),
          firstSeenAt: expect.stringMatching(/^\d{4}/),
          lastSeenAt: expect.stringMatching(/^\d{4}/),
          sourceNodeId: node.id,
        });
      }
    });
  });

  // ---- Additional: publishPatterns anonymization ----

  describe("publishPatterns — anonymization", () => {
    it("published patterns use anonymized domain names", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "fintech startup",
        angleResults: [{ angleId: "a1", angleName: "A", ideasCount: 3, successRate: 0.8 }],
      });
      const published = publishPatterns(node.id);
      for (const p of published) {
        expect(p.anonymizedDomain).not.toContain("fintech startup");
        expect(p.anonymizedDomain).toBe("Financial Technology Domain");
      }
    });
  });

  // ---- Additional: mergePatterns deduplication/conflict ----

  describe("mergePatterns — deduplication and conflict", () => {
    it("merging same-titled pattern 3 times yields frequency 3", () => {
      const node = createFederationNode({ name: "Test" });
      const pattern: FederationPattern = {
        id: "p1",
        type: "trending-angle",
        title: "Repeated Pattern",
        description: "Desc",
        anonymizedDomain: "Domain",
        angleIds: ["a1"],
        frequency: 1,
        successRate: 0.5,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      mergePatterns(node.id, [pattern]);
      mergePatterns(node.id, [{ ...pattern, id: "p2" }]);
      mergePatterns(node.id, [{ ...pattern, id: "p3" }]);

      const received = getNode(node.id)!.receivedPatterns;
      expect(received).toHaveLength(1);
      expect(received[0].frequency).toBe(3);
    });

    it("merges patterns with different titles as separate entries", () => {
      const node = createFederationNode({ name: "Test" });
      mergePatterns(node.id, [
        {
          id: "p1",
          type: "trending-angle",
          title: "A",
          description: "D",
          anonymizedDomain: "D",
          angleIds: ["a1"],
          frequency: 1,
          successRate: 0.5,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        {
          id: "p2",
          type: "trending-angle",
          title: "B",
          description: "D",
          anonymizedDomain: "D",
          angleIds: ["a2"],
          frequency: 1,
          successRate: 0.6,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ]);
      expect(getNode(node.id)!.receivedPatterns).toHaveLength(2);
    });
  });

  // ---- Additional: getNetworkDashboard aggregation ----

  describe("getNetworkDashboard — aggregation", () => {
    it("totalPatterns reflects both local and received", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [{ angleId: "a1", angleName: "Angle", ideasCount: 3 }],
      });
      mergePatterns(node.id, [
        {
          id: "r1",
          type: "domain-insight",
          title: "Remote",
          description: "D",
          anonymizedDomain: "D",
          angleIds: ["a2"],
          frequency: 1,
          successRate: 0.7,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ]);
      const dashboard = getNetworkDashboard(node.id);
      expect(dashboard.totalPatterns).toBeGreaterThanOrEqual(2);
    });

    it("trending angles are sorted by frequency desc", () => {
      const node = createFederationNode({ name: "Test" });
      extractPatterns({
        nodeId: node.id,
        domain: "ai",
        angleResults: [
          { angleId: "popular", angleName: "Popular", ideasCount: 10, successRate: 0.9 },
          { angleId: "rare", angleName: "Rare", ideasCount: 1, successRate: 0.3 },
        ],
      });
      const dashboard = getNetworkDashboard(node.id);
      if (dashboard.trendingAngles.length >= 2) {
        expect(dashboard.trendingAngles[0].frequency).toBeGreaterThanOrEqual(
          dashboard.trendingAngles[1].frequency
        );
      }
    });
  });

  // ---- Additional: getInnovationPulse with zero/single/many nodes ----

  describe("getInnovationPulse — node counts", () => {
    it("zero nodes: health score is bounded", () => {
      const pulse = getInnovationPulse();
      expect(pulse.healthScore).toBeGreaterThanOrEqual(0);
      expect(pulse.healthScore).toBeLessThanOrEqual(100);
    });

    it("single node: health score > 0", () => {
      createFederationNode({ name: "Single" });
      const pulse = getInnovationPulse();
      expect(pulse.healthScore).toBeGreaterThan(0);
    });

    it("many nodes with patterns: high health score", () => {
      for (let i = 0; i < 5; i++) {
        const node = createFederationNode({ name: `Node-${i}` });
        extractPatterns({
          nodeId: node.id,
          domain: "ai",
          angleResults: [{ angleId: `a${i}`, angleName: `Angle${i}`, ideasCount: 3 }],
        });
      }
      const pulse = getInnovationPulse();
      expect(pulse.healthScore).toBeGreaterThanOrEqual(60);
    });

    it("pulse structure includes required fields", () => {
      const pulse = getInnovationPulse();
      expect(pulse).toMatchObject({
        timestamp: expect.stringMatching(/^\d{4}/),
        networkSize: expect.any(Number),
        totalActivities: expect.any(Number),
        patternsSharedLast24h: expect.any(Number),
        trendingTopics: expect.any(Array),
        methodologyEffectiveness: expect.any(Array),
        geographicSpread: [],
        healthScore: expect.any(Number),
      });
    });
  });
});
