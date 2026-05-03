import { describe, it, expect } from "vitest";
import {
  hashPrompt,
  estimateInputTokens,
  buildProvenanceRecords,
  createProvenanceChain,
  buildProvenanceTree,
  getIdeaProvenance,
  formatProvenance,
  type ProvenanceRecord,
  type ProvenanceChain,
} from "../index.js";
import type { AngleResult } from "../../types.js";

// ---- hashPrompt ----

describe("hashPrompt", () => {
  it("returns a consistent SHA-256 hex string", () => {
    const hash1 = hashPrompt("test prompt");
    const hash2 = hashPrompt("test prompt");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces different hashes for different input", () => {
    const hash1 = hashPrompt("prompt A");
    const hash2 = hashPrompt("prompt B");
    expect(hash1).not.toBe(hash2);
  });
});

// ---- estimateInputTokens ----

describe("estimateInputTokens", () => {
  it("returns roughly text.length / 4", () => {
    const text = "This is a test string for token estimation";
    const estimate = estimateInputTokens(text);
    expect(estimate).toBe(Math.ceil(text.length / 4));
  });

  it("returns 0 for empty string", () => {
    expect(estimateInputTokens("")).toBe(0);
  });
});

// ---- buildProvenanceRecords ----

function makeAngleResult(overrides: Partial<AngleResult> = {}): AngleResult {
  return {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Idea One",
        description: "Description",
        potentialImpact: "Impact",
        implementationHint: "Hint",
      },
    ],
    reasoning: "Applied SCAMPER",
    ...overrides,
  };
}

describe("buildProvenanceRecords", () => {
  it("creates one record per idea", () => {
    const angleResults = [
      makeAngleResult({
        ideas: [
          { title: "Idea A", description: "D", potentialImpact: "I", implementationHint: "H" },
          { title: "Idea B", description: "D", potentialImpact: "I", implementationHint: "H" },
        ],
      }),
    ];
    const records = buildProvenanceRecords({ angleResults });
    expect(records).toHaveLength(2);
    expect(records[0].ideaTitle).toBe("Idea A");
    expect(records[1].ideaTitle).toBe("Idea B");
  });

  it("sets model and prompt hash from params", () => {
    const records = buildProvenanceRecords({
      angleResults: [makeAngleResult()],
      model: "gpt-4",
      promptHashes: { scamper: "abc123" },
    });
    expect(records[0].modelUsed).toBe("gpt-4");
    expect(records[0].promptHash).toBe("abc123");
  });

  it("uses defaults when model and promptHashes are absent", () => {
    const records = buildProvenanceRecords({ angleResults: [makeAngleResult()] });
    expect(records[0].modelUsed).toBe("default");
    expect(records[0].promptHash).toBe("unknown");
  });

  it("returns empty array for empty angleResults", () => {
    const records = buildProvenanceRecords({ angleResults: [] });
    expect(records).toEqual([]);
  });
});

// ---- createProvenanceChain ----

describe("createProvenanceChain", () => {
  it("wraps records with session metadata", () => {
    const chain = createProvenanceChain({
      sessionId: "session-1",
      subject: "AI Innovation",
      angleResults: [makeAngleResult()],
      model: "gpt-4",
    });
    expect(chain.sessionId).toBe("session-1");
    expect(chain.subject).toBe("AI Innovation");
    expect(chain.records).toHaveLength(1);
    expect(chain.createdAt).toBeDefined();
  });
});

// ---- buildProvenanceTree ----

describe("buildProvenanceTree", () => {
  it("links evolved ideas to parents", () => {
    const parentRecord: ProvenanceRecord = {
      id: "parent-1",
      ideaTitle: "Parent Idea",
      ideaIndex: 0,
      angleId: "scamper",
      angleName: "SCAMPER",
      promptHash: "hash1",
      modelUsed: "gpt-4",
      timestamp: new Date().toISOString(),
    };
    const childRecord: ProvenanceRecord = {
      id: "child-1",
      ideaTitle: "Child Idea",
      ideaIndex: 0,
      angleId: "scamper",
      angleName: "SCAMPER",
      promptHash: "hash2",
      modelUsed: "gpt-4",
      timestamp: new Date().toISOString(),
      parentId: "parent-1",
    };

    const tree = buildProvenanceTree([parentRecord, childRecord]);
    expect(tree).toHaveLength(1);
    expect(tree[0].record.id).toBe("parent-1");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].record.id).toBe("child-1");
  });

  it("treats records without parents as roots", () => {
    const record: ProvenanceRecord = {
      id: "root-1",
      ideaTitle: "Root",
      ideaIndex: 0,
      angleId: "scamper",
      angleName: "SCAMPER",
      promptHash: "h",
      modelUsed: "m",
      timestamp: new Date().toISOString(),
    };
    const tree = buildProvenanceTree([record]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(0);
  });
});

// ---- getIdeaProvenance ----

describe("getIdeaProvenance", () => {
  it("returns matching records by title (case-insensitive)", () => {
    const chain: ProvenanceChain = {
      sessionId: "s1",
      subject: "test",
      records: [
        {
          id: "r1",
          ideaTitle: "Smart Widget",
          ideaIndex: 0,
          angleId: "scamper",
          angleName: "SCAMPER",
          promptHash: "h",
          modelUsed: "m",
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    expect(getIdeaProvenance(chain, "smart widget")).toHaveLength(1);
    expect(getIdeaProvenance(chain, "SMART WIDGET")).toHaveLength(1);
  });

  it("returns empty for unknown title", () => {
    const chain: ProvenanceChain = {
      sessionId: "s1",
      subject: "test",
      records: [],
      createdAt: new Date().toISOString(),
    };
    expect(getIdeaProvenance(chain, "nonexistent")).toEqual([]);
  });

  it("handles special characters in title", () => {
    const chain: ProvenanceChain = {
      sessionId: "s1",
      subject: "test",
      records: [
        {
          id: "r1",
          ideaTitle: 'Idea with "quotes" & <symbols>',
          ideaIndex: 0,
          angleId: "a",
          angleName: "A",
          promptHash: "h",
          modelUsed: "m",
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    expect(getIdeaProvenance(chain, 'idea with "quotes" & <symbols>')).toHaveLength(1);
  });
});

// ---- formatProvenance ----

describe("formatProvenance", () => {
  it("includes all fields in output", () => {
    const records: ProvenanceRecord[] = [
      {
        id: "r1",
        ideaTitle: "Widget",
        ideaIndex: 0,
        angleId: "scamper",
        angleName: "SCAMPER",
        promptHash: "abc123",
        modelUsed: "gpt-4",
        inputTokensEstimate: 500,
        timestamp: "2024-01-01T00:00:00Z",
      },
    ];
    const formatted = formatProvenance(records);
    expect(formatted).toContain("scamper");
    expect(formatted).toContain("Widget");
    expect(formatted).toContain("gpt-4");
    expect(formatted).toContain("abc123");
    expect(formatted).toContain("500");
  });

  it("returns fallback message for empty records", () => {
    expect(formatProvenance([])).toBe("No provenance data available.");
  });
});
