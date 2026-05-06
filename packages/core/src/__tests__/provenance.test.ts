import { describe, it, expect } from "vitest";
import {
  hashPrompt,
  estimateInputTokens,
  buildProvenanceRecords,
  createProvenanceChain,
  buildProvenanceTree,
  getIdeaProvenance,
  formatProvenance,
  computeRecordHash,
  computeChainHash,
  verifyChainIntegrity,
  provenanceToJsonLd,
  buildLineageGraph,
  provenanceToMarkdown,
} from "../provenance/index.js";
import type { ProvenanceRecord, ProvenanceChain } from "../provenance/index.js";

function makeRecord(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    id: "rec-1",
    ideaTitle: "Test Idea",
    ideaIndex: 0,
    angleId: "scamper",
    angleName: "SCAMPER",
    promptHash: "abc123",
    modelUsed: "gpt-4",
    inputTokensEstimate: 100,
    investigationSnippet: "Summary of investigation",
    timestamp: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeChain(records?: ProvenanceRecord[]): ProvenanceChain {
  return {
    sessionId: "session-1",
    subject: "AI Innovation",
    records: records ?? [
      makeRecord({ id: "rec-1", ideaTitle: "Idea A", angleId: "scamper", angleName: "SCAMPER" }),
      makeRecord({
        id: "rec-2",
        ideaTitle: "Idea B",
        angleId: "inversion",
        angleName: "Inversion",
      }),
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

describe("provenance", () => {
  describe("computeRecordHash", () => {
    it("returns deterministic hash for same input", () => {
      const record = makeRecord();
      const hash1 = computeRecordHash(record);
      const hash2 = computeRecordHash(record);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });

    it("returns different hash for different records", () => {
      const hash1 = computeRecordHash(makeRecord({ ideaTitle: "A" }));
      const hash2 = computeRecordHash(makeRecord({ ideaTitle: "B" }));
      expect(hash1).not.toBe(hash2);
    });

    it("handles null optional fields", () => {
      const record = makeRecord({
        inputTokensEstimate: undefined,
        investigationSnippet: undefined,
      });
      const hash = computeRecordHash(record);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  describe("computeChainHash", () => {
    it("returns deterministic Merkle chain hash", () => {
      const chain = makeChain();
      const hash1 = computeChainHash(chain);
      const hash2 = computeChainHash(chain);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("differs when a record is modified", () => {
      const chain1 = makeChain();
      const chain2 = makeChain();
      chain2.records[0].ideaTitle = "Tampered";
      expect(computeChainHash(chain1)).not.toBe(computeChainHash(chain2));
    });

    it("returns empty string hash for empty chain", () => {
      const chain = makeChain([]);
      const hash = computeChainHash(chain);
      // With no records, running hash stays ""
      expect(hash).toBe("");
    });

    it("single record chain produces valid hash", () => {
      const chain = makeChain([makeRecord()]);
      const hash = computeChainHash(chain);
      expect(hash.length).toBe(64);
    });

    it("order of records matters (Merkle property)", () => {
      const rec1 = makeRecord({ id: "r1", ideaTitle: "First" });
      const rec2 = makeRecord({ id: "r2", ideaTitle: "Second" });
      const chain1 = makeChain([rec1, rec2]);
      const chain2 = makeChain([rec2, rec1]);
      expect(computeChainHash(chain1)).not.toBe(computeChainHash(chain2));
    });
  });

  describe("verifyChainIntegrity", () => {
    it("returns true for valid chain", () => {
      const chain = makeChain();
      const hash = computeChainHash(chain);
      expect(verifyChainIntegrity(chain, hash)).toBe(true);
    });

    it("returns false for tampered chain", () => {
      const chain = makeChain();
      const hash = computeChainHash(chain);
      chain.records[0].ideaTitle = "Tampered Title";
      expect(verifyChainIntegrity(chain, hash)).toBe(false);
    });

    it("returns false for wrong hash", () => {
      const chain = makeChain();
      expect(verifyChainIntegrity(chain, "wrong-hash")).toBe(false);
    });

    it("returns true for empty chain with correct hash", () => {
      const chain = makeChain([]);
      const hash = computeChainHash(chain);
      expect(verifyChainIntegrity(chain, hash)).toBe(true);
    });
  });

  describe("provenanceToJsonLd", () => {
    it("returns valid JSON-LD structure", () => {
      const chain = makeChain();
      const jsonLd = provenanceToJsonLd(chain);
      expect(jsonLd["@context"]).toBeDefined();
      expect(jsonLd["@type"]).toBe("prov:Bundle");
      expect(jsonLd["@id"]).toContain("session-1");
      expect(jsonLd["prov:generatedAtTime"]).toBe(chain.createdAt);
      expect(jsonLd["innovator:subject"]).toBe("AI Innovation");
      expect(jsonLd["innovator:integrityHash"]).toBeDefined();
    });

    it("includes activities for each record", () => {
      const chain = makeChain();
      const jsonLd = provenanceToJsonLd(chain);
      const activities = jsonLd["prov:wasGeneratedBy"] as unknown[];
      expect(activities).toHaveLength(2);
    });

    it("includes prov:wasInformedBy for records with parentId", () => {
      const chain = makeChain([makeRecord({ id: "r1" }), makeRecord({ id: "r2", parentId: "r1" })]);
      const jsonLd = provenanceToJsonLd(chain);
      const activities = jsonLd["prov:wasGeneratedBy"] as Record<string, unknown>[];
      const child = activities[1];
      expect(child["prov:wasInformedBy"]).toBeDefined();
    });

    it("includes prov:used for records with investigationSnippet", () => {
      const chain = makeChain([makeRecord({ investigationSnippet: "Some context" })]);
      const jsonLd = provenanceToJsonLd(chain);
      const activities = jsonLd["prov:wasGeneratedBy"] as Record<string, unknown>[];
      expect(activities[0]["prov:used"]).toBeDefined();
    });
  });

  describe("buildLineageGraph", () => {
    it("builds graph with investigation, angle, and idea nodes", () => {
      const chain = makeChain();
      const { nodes, edges } = buildLineageGraph(chain);

      const types = nodes.map((n) => n.type);
      expect(types).toContain("investigation");
      expect(types).toContain("angle");
      expect(types).toContain("idea");

      // Investigation → Angle edges
      const producedEdges = edges.filter((e) => e.relationship === "produced");
      expect(producedEdges.length).toBeGreaterThanOrEqual(2);
    });

    it("creates one angle node per unique angle", () => {
      const chain = makeChain([
        makeRecord({ id: "r1", angleId: "scamper", angleName: "SCAMPER" }),
        makeRecord({ id: "r2", angleId: "scamper", angleName: "SCAMPER" }),
      ]);
      const { nodes } = buildLineageGraph(chain);
      const angleNodes = nodes.filter((n) => n.type === "angle");
      expect(angleNodes).toHaveLength(1);
    });

    it("adds evolved edges for parent-child ideas", () => {
      const chain = makeChain([makeRecord({ id: "r1" }), makeRecord({ id: "r2", parentId: "r1" })]);
      const { edges } = buildLineageGraph(chain);
      const evolvedEdges = edges.filter((e) => e.relationship === "evolved");
      expect(evolvedEdges).toHaveLength(1);
      expect(evolvedEdges[0].source).toBe("idea-r1");
      expect(evolvedEdges[0].target).toBe("idea-r2");
    });

    it("handles empty chain", () => {
      const chain = makeChain([]);
      const { nodes, edges } = buildLineageGraph(chain);
      expect(nodes).toHaveLength(1); // just investigation node
      expect(edges).toHaveLength(0);
    });
  });

  describe("provenanceToMarkdown", () => {
    it("generates markdown with session info", () => {
      const chain = makeChain();
      const md = provenanceToMarkdown(chain);
      expect(md).toContain("# Provenance Chain");
      expect(md).toContain("**Session:** session-1");
      expect(md).toContain("**Subject:** AI Innovation");
      expect(md).toContain("**Records:** 2");
      expect(md).toContain("**Integrity Hash:**");
    });

    it("groups records by angle", () => {
      const chain = makeChain();
      const md = provenanceToMarkdown(chain);
      expect(md).toContain("### SCAMPER");
      expect(md).toContain("### Inversion");
    });

    it("includes idea details", () => {
      const chain = makeChain();
      const md = provenanceToMarkdown(chain);
      expect(md).toContain("**Idea A**");
      expect(md).toContain("Model: gpt-4");
    });

    it("includes parentId info for evolved ideas", () => {
      const chain = makeChain([
        makeRecord({ id: "r1", ideaTitle: "Parent" }),
        makeRecord({ id: "r2", ideaTitle: "Child", parentId: "r1" }),
      ]);
      const md = provenanceToMarkdown(chain);
      expect(md).toContain("Evolved from: r1");
    });

    it("handles empty chain", () => {
      const chain = makeChain([]);
      const md = provenanceToMarkdown(chain);
      expect(md).toContain("**Records:** 0");
    });
  });

  describe("hashPrompt", () => {
    it("returns deterministic hash", () => {
      expect(hashPrompt("test")).toBe(hashPrompt("test"));
    });

    it("returns different hash for different inputs", () => {
      expect(hashPrompt("a")).not.toBe(hashPrompt("b"));
    });

    it("returns 16-char hex string", () => {
      expect(hashPrompt("test")).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("estimateInputTokens", () => {
    it("estimates ~4 chars per token", () => {
      expect(estimateInputTokens("abcd")).toBe(1);
      expect(estimateInputTokens("12345678")).toBe(2);
    });

    it("handles empty string", () => {
      expect(estimateInputTokens("")).toBe(0);
    });
  });

  describe("buildProvenanceRecords", () => {
    it("creates records from angle results", () => {
      const records = buildProvenanceRecords({
        angleResults: [
          {
            angleId: "scamper",
            angleName: "SCAMPER",
            ideas: [
              { title: "Idea1", description: "D", potentialImpact: "P", implementationHint: "H" },
            ],
            reasoning: "R",
          },
        ],
        model: "gpt-4",
      });
      expect(records).toHaveLength(1);
      expect(records[0].angleName).toBe("SCAMPER");
      expect(records[0].modelUsed).toBe("gpt-4");
    });
  });

  describe("createProvenanceChain", () => {
    it("creates chain with sessionId and subject", () => {
      const chain = createProvenanceChain({
        sessionId: "s1",
        subject: "Test",
        angleResults: [],
      });
      expect(chain.sessionId).toBe("s1");
      expect(chain.subject).toBe("Test");
      expect(chain.createdAt).toBeDefined();
    });
  });

  describe("buildProvenanceTree", () => {
    it("nests child records under parents", () => {
      const parent = makeRecord({ id: "p1" });
      const child = makeRecord({ id: "c1", parentId: "p1" });
      const roots = buildProvenanceTree([parent, child]);
      expect(roots).toHaveLength(1);
      expect(roots[0].children).toHaveLength(1);
    });

    it("handles flat records (all roots)", () => {
      const roots = buildProvenanceTree([makeRecord({ id: "a" }), makeRecord({ id: "b" })]);
      expect(roots).toHaveLength(2);
    });
  });

  describe("getIdeaProvenance", () => {
    it("finds records by title (case-insensitive)", () => {
      const chain = makeChain([
        makeRecord({ id: "r1", ideaTitle: "Solar Paint" }),
        makeRecord({ id: "r2", ideaTitle: "Other Idea" }),
      ]);
      const found = getIdeaProvenance(chain, "solar paint");
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe("r1");
    });
  });

  describe("formatProvenance", () => {
    it("formats records as readable string", () => {
      const formatted = formatProvenance([makeRecord()]);
      expect(formatted).toContain("Test Idea");
      expect(formatted).toContain("gpt-4");
    });

    it("returns message for empty records", () => {
      expect(formatProvenance([])).toBe("No provenance data available.");
    });
  });
});
