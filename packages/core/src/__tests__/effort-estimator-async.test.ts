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

const mockExecSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

import {
  estimateEffort,
  estimateEffortBatch,
  buildRoadmap,
  estimateWithCodebaseContext,
  analyzeCodebaseContext,
} from "../effort-estimator/index.js";
import type { InnovationIdea } from "../types.js";

const mockIdea: InnovationIdea = {
  title: "Test Idea",
  description: "Test description",
  potentialImpact: "High",
  implementationHint: "Start with MVP",
};

const validLlmResponse = {
  totalPersonWeeks: 8,
  confidence: 0.8,
  breakdown: [
    {
      phase: "research",
      personWeeks: 2,
      description: "Research",
      parallelizable: false,
    },
  ],
  requiredSkills: [
    {
      skill: "TypeScript",
      level: "senior",
      importance: "required",
      availability: "common",
    },
  ],
  techStack: [
    {
      category: "backend",
      technology: "Node.js",
      rationale: "Standard",
      alternatives: [],
      maturity: "mature",
    },
  ],
  risks: [
    {
      description: "Scope creep",
      probability: "medium",
      impact: "medium",
      mitigation: "Clear scope",
    },
  ],
  assumptions: ["Team has backend experience"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateEffort", () => {
  it("returns a valid estimate for a successful LLM response", async () => {
    mockGenerateText.mockResolvedValue("```json\n{}\n```");
    mockExtractJson.mockReturnValue(JSON.stringify(validLlmResponse));

    const result = await estimateEffort(mockIdea);

    expect(result.ideaTitle).toBe("Test Idea");
    expect(result.ideaId).toBe("test-idea");
    expect(result.totalPersonWeeks).toBe(8);
    expect(result.confidence).toBe(0.8);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].phase).toBe("research");
    expect(result.requiredSkills).toHaveLength(1);
    expect(result.techStack).toHaveLength(1);
    expect(result.risks).toHaveLength(1);
    expect(result.assumptions).toEqual(["Team has backend experience"]);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockExtractJson).toHaveBeenCalledTimes(1);
  });

  it("throws when LLM returns invalid JSON", async () => {
    mockGenerateText.mockResolvedValue("not json");
    mockExtractJson.mockReturnValue("not valid json");

    await expect(estimateEffort(mockIdea)).rejects.toThrow();
  });
});

describe("estimateEffortBatch", () => {
  it("estimates a batch of ideas and returns a roadmap", async () => {
    const idea2: InnovationIdea = {
      title: "Second Idea",
      description: "Another description",
      potentialImpact: "Medium",
      implementationHint: "Use existing infra",
    };

    const roadmapResponse = {
      roadmap: [
        {
          ideaTitle: "Test Idea",
          phase: 1,
          startWeek: 0,
          endWeek: 8,
          dependencies: [],
        },
        {
          ideaTitle: "Second Idea",
          phase: 2,
          startWeek: 8,
          endWeek: 14,
          dependencies: ["Test Idea"],
        },
      ],
    };

    let callCount = 0;
    mockGenerateText.mockImplementation(async () => {
      callCount++;
      return "response";
    });

    mockExtractJson.mockImplementation(() => {
      // First two calls are for estimateEffort (idea 1 and 2), third is for buildRoadmap
      if (callCount <= 2) {
        return JSON.stringify(validLlmResponse);
      }
      return JSON.stringify(roadmapResponse);
    });

    const result = await estimateEffortBatch([mockIdea, idea2]);

    expect(result.ideas).toHaveLength(2);
    expect(result.totalEffort).toBe(16);
    expect(result.prioritizedRoadmap).toHaveLength(2);
    expect(result.prioritizedRoadmap[0].ideaTitle).toBe("Test Idea");
    expect(result.prioritizedRoadmap[1].dependencies).toEqual(["Test Idea"]);
  });

  it("returns empty result for empty idea list", async () => {
    mockGenerateText.mockResolvedValue("response");
    mockExtractJson.mockReturnValue(JSON.stringify({ roadmap: [] }));

    const result = await estimateEffortBatch([]);

    expect(result.ideas).toHaveLength(0);
    expect(result.totalEffort).toBe(0);
    expect(result.prioritizedRoadmap).toHaveLength(0);
  });
});

describe("buildRoadmap", () => {
  it("returns roadmap items from LLM response", async () => {
    const estimates = [
      {
        ideaTitle: "Idea A",
        ideaId: "idea-a",
        totalPersonWeeks: 4,
        confidence: 0.9,
        breakdown: [],
        requiredSkills: [],
        techStack: [],
        risks: [],
        assumptions: [],
      },
    ];

    const roadmapResponse = {
      roadmap: [
        {
          ideaTitle: "Idea A",
          phase: 1,
          startWeek: 0,
          endWeek: 4,
          dependencies: [],
        },
      ],
    };

    mockGenerateText.mockResolvedValue("response");
    mockExtractJson.mockReturnValue(JSON.stringify(roadmapResponse));

    const result = await buildRoadmap(estimates);

    expect(result).toHaveLength(1);
    expect(result[0].ideaTitle).toBe("Idea A");
    expect(result[0].phase).toBe(1);
    expect(result[0].startWeek).toBe(0);
    expect(result[0].endWeek).toBe(4);
    expect(result[0].dependencies).toEqual([]);
  });

  it("returns empty array for empty estimates", async () => {
    mockGenerateText.mockResolvedValue("response");
    mockExtractJson.mockReturnValue(JSON.stringify({ roadmap: [] }));

    const result = await buildRoadmap([]);

    expect(result).toEqual([]);
  });
});

describe("estimateWithCodebaseContext", () => {
  it("returns estimate with codebase context included", async () => {
    mockGenerateText.mockResolvedValue("response");
    mockExtractJson.mockReturnValue(JSON.stringify(validLlmResponse));

    const codebaseContext = {
      languages: ["TypeScript", "JavaScript"],
      frameworks: ["React", "Express"],
      loc: 50000,
      testCoverage: 80,
      existingPatterns: ["Zod schema validation", "Unit testing"],
    };

    const result = await estimateWithCodebaseContext(mockIdea, codebaseContext);

    expect(result.ideaTitle).toBe("Test Idea");
    expect(result.totalPersonWeeks).toBe(8);
    expect(result.confidence).toBe(0.8);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);

    // Verify the prompt includes codebase context
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("Codebase Context");
    expect(callArgs.prompt).toContain("TypeScript");
    expect(callArgs.prompt).toContain("React");
  });
});

describe("analyzeCodebaseContext", () => {
  it("detects languages from file extensions", async () => {
    // LOC count
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("xargs wc -l")) {
        return "  1000 total";
      }
      if (cmd.includes("head -500")) {
        return "src/index.ts\nsrc/app.tsx\nlib/utils.js\nscript.py\n";
      }
      return "";
    });

    mockReadFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = await analyzeCodebaseContext("/fake/dir");

    expect(result.loc).toBe(1000);
    expect(result.languages).toContain("TypeScript");
    expect(result.languages).toContain("JavaScript");
    expect(result.languages).toContain("Python");
  });

  it("detects frameworks from package.json", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("xargs wc -l")) {
        return "  500 total";
      }
      if (cmd.includes("head -500")) {
        return "src/index.ts\n";
      }
      return "";
    });

    let readCallCount = 0;
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes("package.json")) {
        return JSON.stringify({
          dependencies: { react: "^18.0.0", express: "^4.0.0" },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", zod: "^3.0.0" },
        });
      }
      if (path.includes("coverage-summary.json")) {
        readCallCount++;
        // First call for coverage
        return JSON.stringify({
          total: { lines: { pct: 85 } },
        });
      }
      throw new Error("File not found");
    });

    const result = await analyzeCodebaseContext("/fake/dir");

    expect(result.frameworks).toContain("React");
    expect(result.frameworks).toContain("Express");
    expect(result.existingPatterns).toContain("Zod schema validation");
    expect(result.existingPatterns).toContain("Unit testing");
    expect(result.existingPatterns).toContain("TypeScript strict mode");
  });

  it("detects test coverage from coverage summary", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("xargs wc -l")) {
        return "  200 total";
      }
      if (cmd.includes("head -500")) {
        return "src/index.ts\n";
      }
      return "";
    });

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes("package.json")) {
        return JSON.stringify({ dependencies: {}, devDependencies: {} });
      }
      if (path.includes("coverage-summary.json")) {
        return JSON.stringify({
          total: { lines: { pct: 92.5 } },
        });
      }
      throw new Error("File not found");
    });

    const result = await analyzeCodebaseContext("/fake/dir");

    expect(result.testCoverage).toBe(92.5);
  });

  it("handles filesystem errors gracefully", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("Command failed");
    });

    mockReadFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = await analyzeCodebaseContext("/nonexistent/dir");

    expect(result.loc).toBe(0);
    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual([]);
    expect(result.existingPatterns).toEqual([]);
    expect(result.testCoverage).toBeUndefined();
  });
});
