import { describe, it, expect } from "vitest";
import { EntityExtractor } from "../knowledge-graph/entity-extractor.js";
import type { KnowledgeGraph, EntityNode, RelationshipEdge } from "../knowledge-graph/index.js";

const sampleInvestigation = {
  summary:
    "AI and machine learning are transforming healthcare. Google and OpenAI lead emerging research.",
  currentState:
    "NLP models like GPT enable clinical text analysis. Kubernetes powers scalable infrastructure.",
  keyAspects: [
    { title: "Clinical NLP", description: "Natural language processing for medical records" },
    { title: "Drug Discovery", description: "AI-driven drug candidate identification" },
  ],
  challenges: ["Regulatory compliance with HIPAA", "Data privacy concerns"],
  opportunities: ["Personalized medicine breakthroughs", "Cost reduction via automation"],
};

const sampleIdeas = [
  {
    title: "AI-driven diagnostics using GPT",
    description: "Use NLP to analyze patient symptoms with React dashboard",
    potentialImpact: "Faster diagnosis at scale",
  },
  {
    title: "Blockchain health records",
    description: "Decentralized medical data storage with smart contract governance",
    potentialImpact: "Patient data sovereignty",
  },
];

describe("entity-extractor", () => {
  const extractor = new EntityExtractor();

  describe("extractFromInvestigation", () => {
    it("extracts entities from investigation text", () => {
      const { entities } = extractor.extractFromInvestigation(sampleInvestigation, "session-1");
      expect(entities.length).toBeGreaterThan(0);
    });

    it("extracts technology entities from known patterns", () => {
      const { entities } = extractor.extractFromInvestigation(sampleInvestigation, "session-1");
      const techNames = entities
        .filter((e) => e.type === "technology")
        .map((e) => e.name.toLowerCase());
      expect(
        techNames.some(
          (n) =>
            n.includes("ai") || n.includes("nlp") || n.includes("gpt") || n.includes("kubernetes")
        )
      ).toBe(true);
    });

    it("extracts organization entities", () => {
      const { entities } = extractor.extractFromInvestigation(sampleInvestigation, "session-1");
      const orgNames = entities.filter((e) => e.type === "organization").map((e) => e.name);
      expect(orgNames.some((n) => n === "Google" || n === "OpenAI")).toBe(true);
    });

    it("creates domain entities from key aspects", () => {
      const { entities } = extractor.extractFromInvestigation(sampleInvestigation, "session-1");
      const labels = entities.map((e) => e.name.toLowerCase());
      expect(labels).toContain("clinical nlp");
    });

    it("builds relationships between extracted entities", () => {
      const { relationships } = extractor.extractFromInvestigation(
        sampleInvestigation,
        "session-1"
      );
      expect(relationships.length).toBeGreaterThan(0);
      for (const rel of relationships) {
        expect(rel.weight).toBeGreaterThan(0);
        expect(rel.weight).toBeLessThanOrEqual(1);
        expect(rel.sessions).toContain("session-1");
      }
    });

    it("entities have embeddings of length 32", () => {
      const { entities } = extractor.extractFromInvestigation(sampleInvestigation, "session-1");
      for (const entity of entities) {
        expect(entity.embedding).toHaveLength(32);
      }
    });
  });

  describe("extractFromIdeas", () => {
    it("extracts entities from idea text", () => {
      const { entities } = extractor.extractFromIdeas(sampleIdeas, "session-2");
      expect(entities.length).toBeGreaterThan(0);
    });

    it("extracts technology entities from ideas", () => {
      const { entities } = extractor.extractFromIdeas(sampleIdeas, "session-2");
      const techNames = entities
        .filter((e) => e.type === "technology")
        .map((e) => e.name.toLowerCase());
      expect(
        techNames.some(
          (n) =>
            n.includes("gpt") ||
            n.includes("nlp") ||
            n.includes("react") ||
            n.includes("blockchain")
        )
      ).toBe(true);
    });

    it("creates relationships between idea entities", () => {
      const { relationships } = extractor.extractFromIdeas(sampleIdeas, "session-2");
      expect(relationships.length).toBeGreaterThan(0);
      expect(relationships[0].type).toBe("related_to");
    });
  });

  describe("deduplicateEntities", () => {
    it("merges entities with same normalized stem", () => {
      const entities = [
        {
          id: "1",
          name: "Machine Learning",
          type: "technology" as const,
          mentions: 2,
          sessions: ["s1"],
          firstSeen: "2024-01-01",
          lastSeen: "2024-01-02",
          embedding: [],
        },
        {
          id: "2",
          name: "machine learning",
          type: "technology" as const,
          mentions: 3,
          sessions: ["s2"],
          firstSeen: "2024-01-03",
          lastSeen: "2024-01-04",
          embedding: [],
        },
      ];
      const result = extractor.deduplicateEntities(entities);
      expect(result.length).toBeLessThan(entities.length);
      const merged = result[0];
      expect(merged.mentions).toBe(5);
      expect(merged.sessions).toContain("s1");
      expect(merged.sessions).toContain("s2");
    });

    it("keeps distinct entities separate", () => {
      const entities = [
        {
          id: "1",
          name: "AI",
          type: "technology" as const,
          mentions: 1,
          sessions: ["s1"],
          firstSeen: "2024-01-01",
          lastSeen: "2024-01-01",
          embedding: [],
        },
        {
          id: "2",
          name: "Blockchain",
          type: "technology" as const,
          mentions: 1,
          sessions: ["s1"],
          firstSeen: "2024-01-01",
          lastSeen: "2024-01-01",
          embedding: [],
        },
      ];
      const result = extractor.deduplicateEntities(entities);
      expect(result).toHaveLength(2);
    });
  });

  describe("buildSubgraph", () => {
    it("returns neighborhood of a given entity", () => {
      const graph: KnowledgeGraph = {
        nodes: [
          {
            id: "a",
            label: "Node A",
            type: "concept",
            sourceSessionIds: ["s1"],
            firstSeen: "2024-01-01",
            lastSeen: "2024-01-01",
            occurrenceCount: 1,
          },
          {
            id: "b",
            label: "Node B",
            type: "technology",
            sourceSessionIds: ["s1"],
            firstSeen: "2024-01-01",
            lastSeen: "2024-01-01",
            occurrenceCount: 2,
          },
          {
            id: "c",
            label: "Node C",
            type: "domain",
            sourceSessionIds: ["s1"],
            firstSeen: "2024-01-01",
            lastSeen: "2024-01-01",
            occurrenceCount: 1,
          },
          {
            id: "d",
            label: "Node D",
            type: "concept",
            sourceSessionIds: ["s1"],
            firstSeen: "2024-01-01",
            lastSeen: "2024-01-01",
            occurrenceCount: 1,
          },
        ],
        edges: [
          {
            id: "e1",
            source: "a",
            target: "b",
            type: "related_to",
            weight: 0.8,
            sourceSessionIds: ["s1"],
          },
          {
            id: "e2",
            source: "b",
            target: "c",
            type: "enables",
            weight: 0.6,
            sourceSessionIds: ["s1"],
          },
          {
            id: "e3",
            source: "c",
            target: "d",
            type: "related_to",
            weight: 0.5,
            sourceSessionIds: ["s1"],
          },
        ],
        lastUpdated: "2024-01-01",
        sessionCount: 1,
      };

      const sub = extractor.buildSubgraph("a", 1, graph);
      expect(sub.nodes.map((n) => n.id)).toContain("a");
      expect(sub.nodes.map((n) => n.id)).toContain("b");
      // Depth 1: should not include "c" directly connected to "b" but not "a"
      expect(sub.nodes.map((n) => n.id)).not.toContain("d");
    });

    it("returns empty for non-existent entity", () => {
      const graph: KnowledgeGraph = {
        nodes: [],
        edges: [],
        lastUpdated: "2024-01-01",
        sessionCount: 0,
      };
      const sub = extractor.buildSubgraph("nonexistent", 1, graph);
      expect(sub.nodes).toHaveLength(0);
    });
  });
});
