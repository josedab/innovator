import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();
vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

const {
  analyzeRepoHealth,
  generateBadgeMarkdown,
  registerGitHubAppConfig,
  getRepoHealthScore,
  clearGitHubHealthData,
  RepoHealthScoreSchema,
  GitHubAppConfigSchema,
} = await import("../github-health/index.js");

const mockHealthJson = JSON.stringify({
  dimensions: {
    architectureFreshness: {
      name: "Architecture Freshness",
      score: 80,
      grade: "B",
      details: "Modern patterns",
      suggestions: ["Adopt microservices"],
    },
    dependencyStaleness: {
      name: "Dependency Staleness",
      score: 70,
      grade: "B",
      details: "Some outdated",
      suggestions: ["Update lodash"],
    },
    contributionDiversity: {
      name: "Contribution Diversity",
      score: 60,
      grade: "C",
      details: "Bus factor risk",
      suggestions: ["Onboard contributors"],
    },
    issueVelocity: {
      name: "Issue Velocity",
      score: 75,
      grade: "B",
      details: "Good throughput",
      suggestions: ["Triage faster"],
    },
    competitiveLandscape: {
      name: "Competitive Landscape",
      score: 65,
      grade: "C",
      details: "Niche player",
      suggestions: ["Differentiate more"],
    },
  },
  topSuggestions: ["Focus on contributor diversity"],
  innovationOpportunities: [
    { title: "AI Integration", description: "Add AI features", effort: "medium", impact: "high" },
  ],
});

describe("github-health", () => {
  beforeEach(() => {
    clearGitHubHealthData();
    vi.clearAllMocks();
  });

  describe("getRepoHealthScore", () => {
    it("returns undefined initially", () => {
      expect(getRepoHealthScore("https://github.com/test/repo")).toBeUndefined();
    });
  });

  describe("analyzeRepoHealth", () => {
    it("calls LLM and returns valid RepoHealthScore", async () => {
      mockGenerateText.mockResolvedValue(mockHealthJson);
      mockExtractJson.mockReturnValue(mockHealthJson);

      const result = await analyzeRepoHealth({
        repositoryUrl: "https://github.com/test/repo",
        repositoryName: "test/repo",
        description: "A test repo",
      });

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(result.overallGrade);
      expect(result.badgeData.shieldUrl).toContain("img.shields.io");
      expect(result.repositoryName).toBe("test/repo");

      // Verify stored
      const stored = getRepoHealthScore("https://github.com/test/repo");
      expect(stored).toBeDefined();
      expect(stored!.overallScore).toBe(result.overallScore);
    });
  });

  describe("generateBadgeMarkdown", () => {
    it("returns markdown string with shield URL and Powered by Innovator", async () => {
      mockGenerateText.mockResolvedValue(mockHealthJson);
      mockExtractJson.mockReturnValue(mockHealthJson);

      const score = await analyzeRepoHealth({
        repositoryUrl: "https://github.com/test/repo",
        repositoryName: "test/repo",
      });

      const badge = generateBadgeMarkdown(score);
      expect(badge).toContain("img.shields.io");
      expect(badge).toContain("Powered by");
      expect(badge).toContain("Innovator");
      expect(typeof badge).toBe("string");
    });
  });

  describe("registerGitHubAppConfig", () => {
    it("stores config", () => {
      const config = GitHubAppConfigSchema.parse({
        appId: "app-123",
        installationId: "inst-456",
        repositoryFullName: "test/repo",
      });

      expect(() => registerGitHubAppConfig(config)).not.toThrow();
    });
  });

  describe("RepoHealthScoreSchema", () => {
    it("validates correct data", () => {
      const data = {
        repositoryUrl: "https://github.com/test/repo",
        repositoryName: "test/repo",
        analyzedAt: new Date().toISOString(),
        overallScore: 72,
        overallGrade: "B" as const,
        dimensions: {
          architectureFreshness: {
            name: "Architecture Freshness",
            score: 80,
            grade: "B" as const,
            details: "Good",
            suggestions: [],
          },
          dependencyStaleness: {
            name: "Dependency Staleness",
            score: 70,
            grade: "B" as const,
            details: "OK",
            suggestions: [],
          },
          contributionDiversity: {
            name: "Contribution Diversity",
            score: 60,
            grade: "C" as const,
            details: "Needs work",
            suggestions: [],
          },
          issueVelocity: {
            name: "Issue Velocity",
            score: 75,
            grade: "B" as const,
            details: "Fine",
            suggestions: [],
          },
          competitiveLandscape: {
            name: "Competitive Landscape",
            score: 65,
            grade: "C" as const,
            details: "Niche",
            suggestions: [],
          },
        },
        topSuggestions: ["Improve diversity"],
        innovationOpportunities: [],
        badgeData: {
          shieldUrl: "https://img.shields.io/badge/test-72%25-green",
          color: "green",
          label: "Innovation Health: 72%",
        },
      };

      const result = RepoHealthScoreSchema.parse(data);
      expect(result.overallScore).toBe(72);
      expect(result.overallGrade).toBe("B");
    });
  });
});
