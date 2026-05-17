import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  extractOntology,
  getOntology,
  listOntologies,
  queryEntities,
  buildInvestigationPrompt,
  clearOntologies,
  OntologyGraphSchema,
  OntologyEntitySchema,
  OntologyRelationshipSchema,
  TaxonomyNodeSchema,
  EntityTypeSchema,
  type OntologyGraph,
  type OntologyEntity,
  type OntologyRelationship,
  type TaxonomyNode,
} from "../ontology/index.js";
import type { Investigation } from "../types.js";

const MOCK_INVESTIGATION: Investigation = {
  summary: "AI in healthcare is transforming diagnostics",
  keyAspects: [{ title: "Machine Learning", description: "ML models for diagnosis" }],
  currentState: "Early adoption in radiology",
  challenges: ["Data privacy", "Regulatory compliance"],
  opportunities: ["Faster diagnosis", "Cost reduction"],
};

function makeOntologyJson() {
  return JSON.stringify({
    entities: [
      { id: "ai-ml", name: "Machine Learning", type: "technology", description: "ML algorithms" },
      { id: "healthcare", name: "Healthcare", type: "market", description: "Healthcare industry" },
      { id: "radiology", name: "Radiology", type: "concept", description: "Medical imaging" },
    ],
    relationships: [
      {
        sourceId: "ai-ml",
        targetId: "radiology",
        type: "enables",
        strength: 0.9,
        description: "ML enables automated radiology",
      },
      { sourceId: "radiology", targetId: "healthcare", type: "part-of", strength: 1.0 },
    ],
    taxonomies: [
      {
        name: "Healthcare AI",
        children: [
          { name: "Diagnostics", children: [{ name: "Radiology", children: [] }] },
          { name: "Treatment", children: [] },
        ],
      },
    ],
  });
}

describe("ontology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOntologies();
  });

  describe("extractOntology", () => {
    it("returns valid OntologyGraph with entities, relationships, and taxonomies", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const graph = await extractOntology(MOCK_INVESTIGATION, "AI Healthcare");

      expect(() => OntologyGraphSchema.parse(graph)).not.toThrow();
      expect(graph.entities).toHaveLength(3);
      expect(graph.relationships).toHaveLength(2);
      expect(graph.taxonomies).toHaveLength(1);
      expect(graph.subject).toBe("AI Healthcare");
    });

    it("stores ontology in memory store", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await extractOntology(MOCK_INVESTIGATION, "AI Healthcare");

      const stored = getOntology("AI Healthcare");
      expect(stored).toBeDefined();
      expect(stored!.entities).toHaveLength(3);
    });

    it("creates version 1 for new ontology", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const graph = await extractOntology(MOCK_INVESTIGATION, "New Topic");

      expect(graph.versions).toHaveLength(1);
      expect(graph.versions[0].version).toBe(1);
      expect(graph.versions[0].entityCount).toBe(3);
      expect(graph.versions[0].relationshipCount).toBe(2);
    });

    it("merges with existing ontology on re-extraction (deduplicates)", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await extractOntology(MOCK_INVESTIGATION, "Merge Test");

      // Extract again with same data → should deduplicate
      const graph2 = await extractOntology(MOCK_INVESTIGATION, "Merge Test");

      expect(graph2.entities).toHaveLength(3); // Deduplicated
      expect(graph2.versions).toHaveLength(2);
      expect(graph2.versions[1].version).toBe(2);
    });

    it("merges new entities into existing ontology", async () => {
      const json1 = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json1);
      mockExtractJson.mockReturnValue(json1);

      await extractOntology(MOCK_INVESTIGATION, "Merge New");

      // Second extraction with a new entity
      const json2 = JSON.stringify({
        entities: [
          { id: "ai-ml", name: "Machine Learning", type: "technology", description: "existing" },
          { id: "new-entity", name: "New Entity", type: "trend", description: "brand new" },
        ],
        relationships: [],
        taxonomies: [],
      });
      mockGenerateText.mockResolvedValue(json2);
      mockExtractJson.mockReturnValue(json2);

      const graph = await extractOntology(MOCK_INVESTIGATION, "Merge New");

      expect(graph.entities).toHaveLength(4); // 3 original + 1 new
    });

    it("passes model and signal config", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const controller = new AbortController();
      await extractOntology(MOCK_INVESTIGATION, "Config Test", {
        model: "gpt-5",
        signal: controller.signal,
      });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-5", signal: controller.signal })
      );
    });
  });

  describe("getOntology / listOntologies", () => {
    it("returns undefined for non-existent ontology", () => {
      expect(getOntology("nonexistent")).toBeUndefined();
    });

    it("lists all stored ontology subjects", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await extractOntology(MOCK_INVESTIGATION, "Topic A");
      await extractOntology(MOCK_INVESTIGATION, "Topic B");

      const subjects = listOntologies();
      expect(subjects).toHaveLength(2);
      expect(subjects).toContain("topic-a");
      expect(subjects).toContain("topic-b");
    });

    it("normalizes subject to kebab-case for storage", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await extractOntology(MOCK_INVESTIGATION, "AI & Machine Learning!");

      const stored = getOntology("AI & Machine Learning!");
      expect(stored).toBeDefined();
    });
  });

  describe("queryEntities", () => {
    beforeEach(async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);
      await extractOntology(MOCK_INVESTIGATION, "Query Test");
    });

    it("returns all entities when no type filter", () => {
      const entities = queryEntities();
      expect(entities).toHaveLength(3);
    });

    it("filters entities by type", () => {
      const techEntities = queryEntities("technology");
      expect(techEntities).toHaveLength(1);
      expect(techEntities[0].id).toBe("ai-ml");
    });

    it("returns empty for unmatched type", () => {
      const persons = queryEntities("person");
      expect(persons).toHaveLength(0);
    });
  });

  describe("buildInvestigationPrompt", () => {
    it("builds prompt with entity and relationship context", () => {
      const graph: OntologyGraph = {
        subject: "test",
        entities: [{ id: "e1", name: "Entity1", type: "concept", description: "Desc1" }],
        relationships: [{ sourceId: "e1", targetId: "e2", type: "enables", strength: 0.8 }],
        taxonomies: [],
        versions: [],
      };

      const prompt = buildInvestigationPrompt("test subject", graph);

      expect(prompt).toContain("Entity1");
      expect(prompt).toContain("concept");
      expect(prompt).toContain("e1");
      expect(prompt).toContain("enables");
      expect(prompt).toContain("test subject");
    });
  });

  describe("Schema validation", () => {
    it("TaxonomyNodeSchema validates recursive structure", () => {
      const node: TaxonomyNode = {
        name: "Root",
        children: [
          { name: "Child1", children: [{ name: "Grandchild", children: [] }] },
          { name: "Child2", children: [] },
        ],
      };

      expect(() => TaxonomyNodeSchema.parse(node)).not.toThrow();
    });

    it("EntityTypeSchema covers all expected types", () => {
      const types = EntityTypeSchema.options;
      expect(types).toContain("concept");
      expect(types).toContain("technology");
      expect(types).toContain("organization");
      expect(types).toContain("person");
      expect(types).toContain("market");
      expect(types).toContain("regulation");
      expect(types).toContain("trend");
      expect(types).toContain("product");
      expect(types).toHaveLength(8);
    });

    it("OntologyEntitySchema rejects invalid type", () => {
      expect(() =>
        OntologyEntitySchema.parse({
          id: "test",
          name: "Test",
          type: "invalid-type",
          description: "Desc",
        })
      ).toThrow();
    });

    it("OntologyRelationshipSchema validates strength range", () => {
      expect(() =>
        OntologyRelationshipSchema.parse({
          sourceId: "a",
          targetId: "b",
          type: "enables",
          strength: 1.5,
        })
      ).toThrow();

      expect(() =>
        OntologyRelationshipSchema.parse({
          sourceId: "a",
          targetId: "b",
          type: "enables",
          strength: -0.1,
        })
      ).toThrow();
    });
  });

  describe("clearOntologies", () => {
    it("removes all stored ontologies", async () => {
      const json = makeOntologyJson();
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await extractOntology(MOCK_INVESTIGATION, "Clear Test");
      expect(listOntologies()).toHaveLength(1);

      clearOntologies();
      expect(listOntologies()).toHaveLength(0);
    });
  });
});
