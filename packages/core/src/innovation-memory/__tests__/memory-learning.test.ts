import { describe, expect, it } from "vitest";
import {
  buildInnovationProfile,
  digestToMarkdown,
  findSerendipitousConnections,
  generateWeeklyDigest,
  profileToMarkdown,
} from "../serendipity.js";
import {
  autoWeightAngles,
  computeAngleWeights,
  selectTopAngles,
} from "../angle-weighting.js";
import type { InnovationEvent, MemoryGraph } from "../types.js";

const graph: MemoryGraph = {
  nodes: [
    {
      id: "concept-ai",
      type: "concept",
      label: "AI Diagnostics",
      description: "Clinical triage models for hospitals",
      sessionIds: ["session-a"],
      firstSeenAt: "2024-04-10T00:00:00.000Z",
      lastSeenAt: "2024-04-18T00:00:00.000Z",
      occurrenceCount: 2,
    },
    {
      id: "concept-ops",
      type: "concept",
      label: "Workflow Automation",
      description: "Automation for care navigation and staffing",
      sessionIds: ["session-b"],
      firstSeenAt: "2024-04-12T00:00:00.000Z",
      lastSeenAt: "2024-04-18T00:00:00.000Z",
      occurrenceCount: 2,
    },
    {
      id: "concept-triage",
      type: "pattern",
      label: "Clinical Triage",
      description: "Care navigation and escalation pattern",
      sessionIds: ["session-a", "session-b"],
      firstSeenAt: "2024-04-11T00:00:00.000Z",
      lastSeenAt: "2024-04-18T00:00:00.000Z",
      occurrenceCount: 3,
    },
  ],
  edges: [
    {
      source: "concept-ai",
      target: "concept-ops",
      type: "synergy",
      weight: 0.9,
      evidence: "Both sessions surfaced automation as the bottleneck unlock.",
      sessionIds: ["session-a", "session-b"],
      createdAt: "2024-04-18T00:00:00.000Z",
    },
    {
      source: "concept-ai",
      target: "concept-triage",
      type: "related",
      weight: 0.7,
      sessionIds: ["session-a"],
      createdAt: "2024-04-16T00:00:00.000Z",
    },
    {
      source: "concept-ops",
      target: "concept-triage",
      type: "related",
      weight: 0.8,
      sessionIds: ["session-b"],
      createdAt: "2024-04-17T00:00:00.000Z",
    },
  ],
  lastUpdatedAt: "2024-04-18T00:00:00.000Z",
  totalSessions: 3,
};

const events: InnovationEvent[] = [
  {
    id: "evt-1",
    type: "angle.generated",
    sessionId: "session-prev",
    userId: "user-1",
    timestamp: "2024-04-10T12:00:00.000Z",
    metadata: {
      subject: "Healthcare intake automation",
      domain: "Healthcare",
      angleId: "scamper",
      qualityScore: 78,
    },
  },
  {
    id: "evt-2",
    type: "angle.generated",
    sessionId: "session-a",
    userId: "user-1",
    timestamp: "2024-04-16T10:00:00.000Z",
    metadata: {
      subject: "AI diagnostics for hospitals",
      domain: "Healthcare",
      angleId: "scamper",
      qualityScore: 88,
    },
  },
  {
    id: "evt-3",
    type: "idea.created",
    sessionId: "session-a",
    userId: "user-1",
    timestamp: "2024-04-16T10:15:00.000Z",
    metadata: {
      subject: "AI diagnostics for hospitals",
      domain: "Healthcare",
    },
  },
  {
    id: "evt-4",
    type: "angle.rated",
    sessionId: "session-b",
    userId: "user-1",
    timestamp: "2024-04-17T10:00:00.000Z",
    metadata: {
      subject: "Workflow automation for clinics",
      domain: "Healthcare",
      angleId: "scamper",
      qualityScore: 92,
    },
  },
  {
    id: "evt-5",
    type: "idea.accepted",
    sessionId: "session-b",
    userId: "user-1",
    timestamp: "2024-04-17T10:30:00.000Z",
    metadata: {
      subject: "Workflow automation for clinics",
      domain: "Healthcare",
      ideaCount: 1,
    },
  },
  {
    id: "evt-6",
    type: "angle.generated",
    sessionId: "session-c",
    userId: "user-1",
    timestamp: "2024-04-18T11:00:00.000Z",
    metadata: {
      subject: "Retail loyalty lessons for care journeys",
      domain: "Retail",
      angleId: "cross-domain",
      qualityScore: 84,
    },
  },
];

describe("memory learning", () => {
  it("finds cross-session serendipitous connections", () => {
    const connections = findSerendipitousConnections(graph, 5);

    expect(connections.length).toBeGreaterThan(0);
    expect(["complementary", "cross-domain", "analogy", "contrarian", "emergent"]).toContain(connections[0].connectionType);
    expect(connections[0].sourceSessionId).not.toBe(connections[0].targetSessionId);
    expect(connections[0].explanation.length).toBeGreaterThan(10);
  });

  it("builds weekly digests and markdown exports", () => {
    const digest = generateWeeklyDigest(events, graph);
    const markdown = digestToMarkdown(digest);

    expect(digest.totalSessions).toBe(3);
    expect(digest.totalIdeas).toBe(2);
    expect(digest.topConnections.length).toBeGreaterThan(0);
    expect(digest.trendingTopics.some((topic) => topic.topic === "Healthcare")).toBe(true);
    expect(markdown).toContain("# Weekly Innovation Digest");
    expect(markdown).toContain("## Recommendations");
  });

  it("builds innovation profiles and markdown exports", () => {
    const profile = buildInnovationProfile(events, graph, "user-1");
    const markdown = profileToMarkdown(profile);

    expect(profile.totalSessions).toBe(4);
    expect(profile.totalIdeas).toBe(2);
    expect(profile.topDomains[0]?.domain).toBe("Healthcare");
    expect(profile.preferredAngles[0]?.angleId).toBe("scamper");
    expect(markdown).toContain("# Innovation Profile: user-1");
    expect(markdown).toContain("SCAMPER");
  });

  it("weights angles based on past effectiveness", () => {
    const weighting = computeAngleWeights(events, "Healthcare automation for hospitals", "exploit");
    const selected = selectTopAngles(weighting.weights, 2);
    const autoSelected = selectTopAngles(autoWeightAngles(events, "Healthcare"), 1);

    expect(weighting.domain).toBe("Healthcare");
    expect(selected[0]?.angleId).toBe("scamper");
    expect(selected[0]?.effectiveWeight).toBeGreaterThan(selected[1]?.effectiveWeight ?? 0);
    expect(autoSelected[0]?.angleId).toBe("scamper");
  });
});
