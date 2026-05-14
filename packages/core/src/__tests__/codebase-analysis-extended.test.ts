import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CodebaseAnalysis, InnovationPR } from "../codebase-analysis/index.js";

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
  generateInnovationPRs,
  deepAnalyze,
  innovationPRToMarkdown,
  generateSubjects,
} from "../codebase-analysis/index.js";

function makeAnalysis(overrides: Partial<CodebaseAnalysis> = {}): CodebaseAnalysis {
  return {
    rootPath: "/test",
    analyzedAt: new Date().toISOString(),
    fileCount: 10,
    totalLines: 1000,
    languages: ["TypeScript"],
    patterns: [],
    dependencies: [],
    layers: [],
    complexityHotspots: [],
    subjects: [],
    ...overrides,
  };
}

// ---- generateInnovationPRs ----

describe("generateInnovationPRs", () => {
  it("generates PRs from high-severity patterns", () => {
    const analysis = makeAnalysis({
      patterns: [
        {
          type: "tech-debt",
          name: "Technical debt markers",
          description: "Found TODO comments",
          locations: ["src/index.ts"],
          severity: "high",
          innovationPotential: 0.8,
        },
      ],
    });
    const prs = generateInnovationPRs(analysis);
    expect(prs.length).toBeGreaterThanOrEqual(1);
    const patternPR = prs.find((p) => p.title.includes("tech-debt"));
    expect(patternPR).toBeDefined();
    expect(patternPR!.priority).toBe("high");
    expect(patternPR!.category).toBe("maintainability");
    expect(patternPR!.affectedFiles).toContain("src/index.ts");
  });

  it("generates complexity hotspot PR when score > 60", () => {
    const analysis = makeAnalysis({
      complexityHotspots: [
        {
          path: "src/big.ts",
          lines: 1000,
          functions: 50,
          exports: 20,
          imports: 30,
          complexityScore: 75,
        },
      ],
    });
    const prs = generateInnovationPRs(analysis);
    const hotspotPR = prs.find((p) => p.title.includes("complexity"));
    expect(hotspotPR).toBeDefined();
    expect(hotspotPR!.category).toBe("maintainability");
    expect(hotspotPR!.affectedFiles).toContain("src/big.ts");
  });

  it("generates PRs from high-priority subjects", () => {
    const analysis = makeAnalysis({
      subjects: [
        {
          subject: "Improve testing",
          category: "testing",
          rationale: "Low coverage",
          relevantPatterns: ["tech-debt"],
          priority: "high",
          estimatedImpact: "Better reliability",
        },
      ],
    });
    const prs = generateInnovationPRs(analysis);
    const subjectPR = prs.find((p) => p.title.includes("Improve testing"));
    expect(subjectPR).toBeDefined();
    expect(subjectPR!.priority).toBe("high");
  });

  it("returns empty array for analysis with no high-severity items", () => {
    const analysis = makeAnalysis({
      patterns: [
        {
          type: "design-pattern",
          name: "Observer",
          description: "Observer pattern used",
          locations: ["src/observer.ts"],
          severity: "low",
          innovationPotential: 0.3,
        },
      ],
      complexityHotspots: [
        {
          path: "src/small.ts",
          lines: 50,
          functions: 3,
          exports: 2,
          imports: 1,
          complexityScore: 20,
        },
      ],
      subjects: [
        {
          subject: "Nice to have",
          category: "automation",
          rationale: "Minor improvement",
          relevantPatterns: [],
          priority: "low",
          estimatedImpact: "Minimal",
        },
      ],
    });
    const prs = generateInnovationPRs(analysis);
    expect(prs).toHaveLength(0);
  });

  it("returns empty array for empty codebase", () => {
    const prs = generateInnovationPRs(makeAnalysis());
    expect(prs).toHaveLength(0);
  });
});

// ---- deepAnalyze ----

describe("deepAnalyze", () => {
  it("detects tech-debt and anti-pattern as architectural debt", () => {
    const analysis = makeAnalysis({
      patterns: [
        {
          type: "tech-debt",
          name: "TODO markers",
          description: "Found TODO comments",
          locations: ["src/index.ts"],
          severity: "high",
          innovationPotential: 0.8,
        },
        {
          type: "anti-pattern",
          name: "God class",
          description: "Large class with too many responsibilities",
          locations: ["src/app.ts"],
          severity: "high",
          innovationPotential: 0.7,
        },
      ],
    });
    const result = deepAnalyze(analysis);
    expect(result.architecturalDebt.length).toBe(2);
    expect(result.architecturalDebt[0].description).toContain("TODO");
    expect(result.architecturalDebt[1].description).toContain("Large class");
  });

  it("detects circular dependencies between layers", () => {
    const analysis = makeAnalysis({
      layers: [
        {
          name: "src",
          path: "src",
          fileCount: 5,
          responsibilities: ["Source"],
          dependencies: ["utils"],
        },
        {
          name: "utils",
          path: "utils",
          fileCount: 3,
          responsibilities: ["Utilities"],
          dependencies: ["src"],
        },
      ],
    });
    const result = deepAnalyze(analysis);
    const circularDebt = result.architecturalDebt.filter((d) => d.description.includes("Circular"));
    expect(circularDebt.length).toBeGreaterThanOrEqual(1);
    expect(circularDebt[0].severity).toBe("high");
  });

  it("detects feature gaps from thin layers (fileCount <= 1)", () => {
    const analysis = makeAnalysis({
      layers: [
        {
          name: "auth",
          path: "src/auth",
          fileCount: 1,
          responsibilities: ["Authentication"],
          dependencies: [],
        },
      ],
    });
    const result = deepAnalyze(analysis);
    expect(result.featureGaps.length).toBe(1);
    expect(result.featureGaps[0].gap).toContain("auth");
    expect(result.featureGaps[0].gap).toContain("minimal implementation");
  });

  it("detects performance bottlenecks from complexity > 70", () => {
    const analysis = makeAnalysis({
      complexityHotspots: [
        {
          path: "src/big.ts",
          lines: 1000,
          functions: 50,
          exports: 20,
          imports: 30,
          complexityScore: 75,
        },
      ],
    });
    const result = deepAnalyze(analysis);
    expect(result.performanceBottlenecks.length).toBe(1);
    expect(result.performanceBottlenecks[0].location).toBe("src/big.ts");
    expect(result.performanceBottlenecks[0].issue).toContain("75");
  });

  it("maps subjects to innovation opportunities", () => {
    const analysis = makeAnalysis({
      subjects: [
        {
          subject: "Improve testing",
          category: "testing",
          rationale: "Low coverage",
          relevantPatterns: ["tech-debt"],
          priority: "high",
          estimatedImpact: "Better reliability",
        },
      ],
    });
    const result = deepAnalyze(analysis);
    expect(result.innovationOpportunities.length).toBe(1);
    expect(result.innovationOpportunities[0].opportunity).toBe("Improve testing");
    expect(result.innovationOpportunities[0].grounding).toBe("Low coverage");
    expect(result.innovationOpportunities[0].estimatedValue).toBe("Better reliability");
  });

  it("returns empty arrays for empty analysis", () => {
    const result = deepAnalyze(makeAnalysis());
    expect(result.architecturalDebt).toHaveLength(0);
    expect(result.featureGaps).toHaveLength(0);
    expect(result.performanceBottlenecks).toHaveLength(0);
    expect(result.innovationOpportunities).toHaveLength(0);
  });
});

// ---- innovationPRToMarkdown ----

describe("innovationPRToMarkdown", () => {
  const samplePR: InnovationPR = {
    title: "Refactor: Address tech-debt — TODO markers",
    description: "Found TODO comments across the codebase",
    category: "maintainability",
    priority: "high",
    estimatedEffort: "1-2 days",
    implementationPlan: [
      { step: 1, description: "Address tech-debt in src/index.ts", files: ["src/index.ts"] },
      { step: 2, description: "Address tech-debt in src/app.ts", files: ["src/app.ts"] },
    ],
    affectedFiles: ["src/index.ts", "src/app.ts"],
    risks: ["Potential regression in 2 file(s)"],
    metrics: ["Reduce tech-debt occurrences by 100%"],
  };

  it("includes title, category, and priority", () => {
    const md = innovationPRToMarkdown(samplePR);
    expect(md).toContain("## Refactor: Address tech-debt — TODO markers");
    expect(md).toContain("maintainability");
    expect(md).toContain("high");
    expect(md).toContain("1-2 days");
  });

  it("includes implementation plan steps", () => {
    const md = innovationPRToMarkdown(samplePR);
    expect(md).toContain("### Implementation Plan");
    expect(md).toContain("1. Address tech-debt in src/index.ts");
    expect(md).toContain("`src/index.ts`");
    expect(md).toContain("2. Address tech-debt in src/app.ts");
  });

  it("includes risks and metrics", () => {
    const md = innovationPRToMarkdown(samplePR);
    expect(md).toContain("### Risks");
    expect(md).toContain("⚠️ Potential regression in 2 file(s)");
    expect(md).toContain("### Success Metrics");
    expect(md).toContain("📊 Reduce tech-debt occurrences by 100%");
  });
});

// ---- generateSubjects ----

describe("generateSubjects", () => {
  const analysisInput = {
    patterns: [
      {
        type: "tech-debt" as const,
        name: "TODO markers",
        description: "Found TODO comments",
        locations: ["src/index.ts"],
        severity: "high" as const,
        innovationPotential: 0.8,
      },
    ],
    dependencies: [],
    layers: [],
    complexityHotspots: [],
    fileCount: 10,
    totalLines: 1000,
    languages: ["TypeScript"],
  };

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockExtractJson.mockReset();
  });

  it("returns LLM-generated subjects on success", async () => {
    const llmSubjects = [
      {
        subject: "Add comprehensive error handling",
        category: "reliability",
        rationale: "Missing try-catch blocks",
        relevantPatterns: ["tech-debt"],
        priority: "high",
        estimatedImpact: "Reduced runtime errors",
      },
    ];
    mockGenerateText.mockResolvedValue("raw llm output");
    mockExtractJson.mockReturnValue(JSON.stringify({ subjects: llmSubjects }));

    const subjects = await generateSubjects(analysisInput);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].subject).toBe("Add comprehensive error handling");
    expect(subjects[0].category).toBe("reliability");
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it("falls back to heuristic subjects on LLM failure", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const subjects = await generateSubjects(analysisInput);
    expect(subjects.length).toBeGreaterThanOrEqual(1);
    // Heuristic subjects are generated from patterns with innovationPotential >= 0.6
    expect(subjects[0].subject).toContain("TODO markers");
  });
});
