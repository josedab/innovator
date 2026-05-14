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
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

import {
  buildTaxonomy,
  classifyIdea,
  classifyIdeas,
  identifyGaps,
  suggestNewCategories,
} from "../auto-taxonomy/index.js";
import type { TaxonomyTree } from "../auto-taxonomy/index.js";

function makeTaxonomy(): TaxonomyTree {
  return {
    root: {
      id: "root",
      label: "All Ideas",
      description: "Root",
      parentId: null,
      children: [
        {
          id: "cat-ai",
          label: "Artificial Intelligence",
          description: "AI ideas",
          parentId: "root",
          children: [],
          ideaCount: 5,
          level: 1,
          confidence: 0.9,
        },
        {
          id: "cat-web",
          label: "Web Development",
          description: "Web ideas",
          parentId: "root",
          children: [],
          ideaCount: 3,
          level: 1,
          confidence: 0.85,
        },
      ],
      ideaCount: 8,
      level: 0,
      confidence: 1,
    },
    totalNodes: 3,
    totalIdeas: 8,
    maxDepth: 1,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  mockGenerateText.mockReset();
  mockExtractJson.mockReset();
});

// ---- buildTaxonomy ----

describe("buildTaxonomy", () => {
  it("builds taxonomy with LLM labeling", async () => {
    mockGenerateText.mockResolvedValue("json-response");
    mockExtractJson.mockReturnValue(
      JSON.stringify({ label: "AI Cluster", description: "AI-related ideas" })
    );

    const ideas = [
      { title: "Machine learning model for predictions" },
      { title: "Deep learning image recognition" },
      { title: "Neural network optimization techniques" },
    ];

    const result = await buildTaxonomy(ideas, { useLLM: true });

    expect(result.root.id).toBe("root");
    expect(result.root.label).toBe("All Ideas");
    expect(result.totalIdeas).toBe(3);
    expect(result.createdAt).toBeDefined();
    expect(result.totalNodes).toBeGreaterThanOrEqual(1);
  });

  it("builds taxonomy without LLM when useLLM is false", async () => {
    const ideas = [
      { title: "Machine learning model for predictions" },
      { title: "Deep learning image recognition" },
      { title: "Building responsive web layouts" },
    ];

    const result = await buildTaxonomy(ideas, { useLLM: false });

    expect(result.root.id).toBe("root");
    expect(result.totalIdeas).toBe(3);
    // LLM should not be called when useLLM is false
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("handles empty ideas array", async () => {
    const result = await buildTaxonomy([], { useLLM: false });

    expect(result.root.id).toBe("root");
    expect(result.root.children).toHaveLength(0);
    expect(result.totalIdeas).toBe(0);
  });

  it("falls back gracefully when LLM fails during labeling", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const ideas = [
      { title: "Machine learning model for predictions" },
      { title: "Deep learning image recognition" },
      { title: "Neural network optimization techniques" },
    ];

    const result = await buildTaxonomy(ideas, { useLLM: true });

    // Should still produce a taxonomy; labelCluster catches the error
    expect(result.root.id).toBe("root");
    expect(result.totalIdeas).toBe(3);
    expect(result.totalNodes).toBeGreaterThanOrEqual(1);
  });
});

// ---- classifyIdea ----

describe("classifyIdea", () => {
  it("classifies idea using LLM response", async () => {
    mockGenerateText.mockResolvedValue("json-response");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        categoryPath: ["Artificial Intelligence"],
        confidence: 0.9,
        alternateCategories: [],
      })
    );

    const taxonomy = makeTaxonomy();
    const result = await classifyIdea({ title: "GPT-based chatbot", id: "idea-1" }, taxonomy);

    expect(result.ideaTitle).toBe("GPT-based chatbot");
    expect(result.ideaId).toBe("idea-1");
    expect(result.categoryPath).toEqual(["Artificial Intelligence"]);
    expect(result.confidence).toBe(0.9);
    expect(result.alternateCategories).toEqual([]);
  });

  it("falls back to TF-IDF when LLM fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const taxonomy = makeTaxonomy();
    const result = await classifyIdea(
      { title: "Artificial Intelligence chatbot", id: "idea-2" },
      taxonomy
    );

    expect(result.ideaTitle).toBe("Artificial Intelligence chatbot");
    expect(result.ideaId).toBe("idea-2");
    // Falls back to TF-IDF: should still return a classification
    expect(result.categoryPath).toBeDefined();
    expect(result.categoryPath.length).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.alternateCategories).toEqual([]);
  });

  it("handles idea with no matching category via TF-IDF fallback", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const taxonomy = makeTaxonomy();
    const result = await classifyIdea({ title: "Quantum physics experiment design" }, taxonomy);

    // Should return Uncategorized or closest match from TF-IDF
    expect(result.categoryPath).toBeDefined();
    expect(result.categoryPath.length).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---- classifyIdeas ----

describe("classifyIdeas", () => {
  it("batch classifies multiple ideas", async () => {
    mockGenerateText.mockResolvedValue("json-response");
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        categoryPath: ["Artificial Intelligence"],
        confidence: 0.85,
        alternateCategories: [],
      })
    );

    const taxonomy = makeTaxonomy();
    const ideas = [
      { title: "AI chatbot", id: "i1" },
      { title: "ML pipeline", id: "i2" },
    ];

    const results = await classifyIdeas(ideas, taxonomy);

    expect(results).toHaveLength(2);
    expect(results[0].ideaId).toBe("i1");
    expect(results[1].ideaId).toBe("i2");
    for (const r of results) {
      expect(r.categoryPath).toEqual(["Artificial Intelligence"]);
      expect(r.confidence).toBe(0.85);
    }
  });

  it("respects abort signal and stops early", async () => {
    const controller = new AbortController();
    let callCount = 0;

    mockGenerateText.mockImplementation(async () => {
      callCount++;
      // Abort after the first call so the second idea is skipped
      if (callCount === 1) controller.abort();
      return "json-response";
    });
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        categoryPath: ["Web Development"],
        confidence: 0.8,
        alternateCategories: [],
      })
    );

    const taxonomy = makeTaxonomy();
    const ideas = [
      { title: "React app", id: "i1" },
      { title: "Vue app", id: "i2" },
      { title: "Svelte app", id: "i3" },
    ];

    const results = await classifyIdeas(ideas, taxonomy, controller.signal);

    // Should have fewer results than total ideas due to abort
    expect(results.length).toBeLessThan(ideas.length);
  });
});

// ---- identifyGaps ----

describe("identifyGaps", () => {
  it("returns LLM-detected gaps", async () => {
    const gapsPayload = {
      gaps: [
        {
          parentCategory: "Artificial Intelligence",
          suggestedCategory: "Robotics",
          reasoning: "No robotics coverage despite strong AI presence",
          adjacentCategories: ["Artificial Intelligence"],
          gapScore: 0.8,
        },
      ],
    };

    mockGenerateText.mockResolvedValue("json-response");
    mockExtractJson.mockReturnValue(JSON.stringify(gapsPayload));

    const taxonomy = makeTaxonomy();
    const result = await identifyGaps(taxonomy, "technology innovation");

    expect(result).toHaveLength(1);
    expect(result[0].parentCategory).toBe("Artificial Intelligence");
    expect(result[0].suggestedCategory).toBe("Robotics");
    expect(result[0].reasoning).toBe("No robotics coverage despite strong AI presence");
    expect(result[0].adjacentCategories).toEqual(["Artificial Intelligence"]);
    expect(result[0].gapScore).toBe(0.8);
  });

  it("returns empty array on LLM failure", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const taxonomy = makeTaxonomy();
    const result = await identifyGaps(taxonomy);

    expect(result).toEqual([]);
  });
});

// ---- suggestNewCategories ----

describe("suggestNewCategories", () => {
  it("returns LLM suggestions for new categories", async () => {
    const suggestionsPayload = {
      suggestions: [
        {
          suggestedCategory: "Blockchain",
          parentPath: ["Artificial Intelligence"],
          ideas: ["Decentralized AI model training"],
        },
      ],
    };

    mockGenerateText.mockResolvedValue("json-response");
    mockExtractJson.mockReturnValue(JSON.stringify(suggestionsPayload));

    const taxonomy = makeTaxonomy();
    const ideas = [{ title: "Decentralized AI model training" }];

    const result = await suggestNewCategories(taxonomy, ideas);

    expect(result).toHaveLength(1);
    expect(result[0].suggestedCategory).toBe("Blockchain");
    expect(result[0].parentPath).toEqual(["Artificial Intelligence"]);
    expect(result[0].ideas).toEqual(["Decentralized AI model training"]);
  });

  it("returns empty array on LLM failure", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const taxonomy = makeTaxonomy();
    const ideas = [{ title: "Some new idea" }];

    const result = await suggestNewCategories(taxonomy, ideas);

    expect(result).toEqual([]);
  });
});
