import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();
const mockGenerateTextStream = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
  generateTextStream: (...args: unknown[]) => mockGenerateTextStream(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

import {
  generateArtifact,
  generateArtifactStream,
  artifactToMarkdown,
  artifactToGitHubIssue,
  getArtifactTypeLabel,
  ARTIFACT_TYPES,
  ArtifactSchema,
  type ArtifactType,
  type ArtifactContext,
  type Artifact,
} from "../artifacts/index.js";
import type { InnovationIdea, Investigation } from "../types.js";

const TEST_IDEA: InnovationIdea = {
  title: "AI Code Review",
  description: "Automated code review using LLMs",
  potentialImpact: "50% faster reviews",
  implementationHint: "Integrate with PR workflows",
};

const TEST_CONTEXT: ArtifactContext = {
  subject: "developer productivity",
};

const TEST_CONTEXT_WITH_INVESTIGATION: ArtifactContext = {
  subject: "developer productivity",
  investigation: {
    summary: "Investigation summary",
    keyAspects: [{ title: "Aspect1", description: "Desc1" }],
    currentState: "Current state",
    challenges: ["Challenge1"],
    opportunities: ["Opportunity1"],
  },
};

function makeArtifactJson(type: ArtifactType): string {
  return JSON.stringify({
    type,
    title: `${type} for AI Code Review`,
    content: "Full content here",
    sections: [
      { heading: "Overview", body: "Overview body" },
      { heading: "Details", body: "Details body" },
    ],
  });
}

describe("artifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateArtifact", () => {
    for (const artifactType of ARTIFACT_TYPES) {
      it(`generates valid artifact for type: ${artifactType}`, async () => {
        const json = makeArtifactJson(artifactType);
        mockGenerateText.mockResolvedValue(json);
        mockExtractJson.mockReturnValue(json);

        const result = await generateArtifact(TEST_IDEA, artifactType, TEST_CONTEXT);

        expect(result.type).toBe(artifactType);
        expect(result.title).toBeTruthy();
        expect(result.sections.length).toBeGreaterThan(0);
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.ideaTitle).toBe(TEST_IDEA.title);
        expect(result.metadata!.generatedAt).toBeTruthy();
        // Validate against schema
        expect(() => ArtifactSchema.parse(result)).not.toThrow();
      });
    }

    it("throws on unknown artifact type", async () => {
      await expect(
        generateArtifact(TEST_IDEA, "invalid" as ArtifactType, TEST_CONTEXT)
      ).rejects.toThrow("Unknown artifact type");
    });

    it("includes investigation context in prompt when available", async () => {
      const json = makeArtifactJson("prd");
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      await generateArtifact(TEST_IDEA, "prd", TEST_CONTEXT_WITH_INVESTIGATION);

      const prompt = mockGenerateText.mock.calls[0][0].prompt;
      expect(prompt).toContain("Investigation summary");
    });

    it("passes model and signal through", async () => {
      const json = makeArtifactJson("prd");
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const controller = new AbortController();
      await generateArtifact(TEST_IDEA, "prd", TEST_CONTEXT, "gpt-5", controller.signal);

      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.model).toBe("gpt-5");
      expect(callArgs.signal).toBe(controller.signal);
    });

    it("handles empty sections array", async () => {
      const json = JSON.stringify({
        type: "prd",
        title: "Empty sections test",
        content: "Content",
        sections: [],
      });
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await generateArtifact(TEST_IDEA, "prd", TEST_CONTEXT);
      expect(result.sections).toHaveLength(0);
    });

    it("throws when JSON parsing fails", async () => {
      mockGenerateText.mockResolvedValue("not json");
      mockExtractJson.mockReturnValue("not json{");

      await expect(generateArtifact(TEST_IDEA, "prd", TEST_CONTEXT)).rejects.toThrow();
    });
  });

  describe("generateArtifactStream", () => {
    it("streams chunks and returns valid artifact", async () => {
      const json = makeArtifactJson("tech-spec");
      const chunks: string[] = [];

      mockGenerateTextStream.mockImplementation(
        async (_opts: unknown, onChunk: (c: string) => void) => {
          onChunk("chunk1");
          onChunk("chunk2");
          return json;
        }
      );
      mockExtractJson.mockReturnValue(json);

      const result = await generateArtifactStream(TEST_IDEA, "tech-spec", TEST_CONTEXT, (c) =>
        chunks.push(c)
      );

      expect(chunks).toEqual(["chunk1", "chunk2"]);
      expect(result.type).toBe("tech-spec");
      expect(result.metadata!.ideaTitle).toBe(TEST_IDEA.title);
    });

    it("throws on unknown artifact type", async () => {
      await expect(
        generateArtifactStream(TEST_IDEA, "invalid" as ArtifactType, TEST_CONTEXT, () => {})
      ).rejects.toThrow("Unknown artifact type");
    });
  });

  describe("artifactToMarkdown", () => {
    const artifact: Artifact = {
      type: "prd",
      title: "Test PRD",
      content: "Full content",
      sections: [
        { heading: "Overview", body: "Overview body" },
        { heading: "Goals", body: "Goals body" },
      ],
      metadata: {
        ideaTitle: "Test Idea",
        generatedAt: "2024-01-01T00:00:00Z",
      },
    };

    it("formats markdown with title and sections", () => {
      const md = artifactToMarkdown(artifact);
      expect(md).toContain("# Test PRD");
      expect(md).toContain("## Overview");
      expect(md).toContain("Overview body");
      expect(md).toContain("## Goals");
      expect(md).toContain("Goals body");
    });

    it("includes metadata", () => {
      const md = artifactToMarkdown(artifact);
      expect(md).toContain("prd");
      expect(md).toContain("2024-01-01");
    });

    it("handles missing metadata gracefully", () => {
      const noMeta: Artifact = { ...artifact, metadata: undefined };
      const md = artifactToMarkdown(noMeta);
      expect(md).toContain("unknown");
    });
  });

  describe("artifactToGitHubIssue", () => {
    const artifact: Artifact = {
      type: "user-story",
      title: "Test Story",
      content: "Content",
      sections: [{ heading: "Epic", body: "Epic body" }],
    };

    it("formats as GitHub issue with title, body, and labels", () => {
      const issue = artifactToGitHubIssue(artifact);
      expect(issue.title).toBe("📋 Test Story");
      expect(issue.body).toContain("# Test Story");
      expect(issue.labels).toContain("user-story");
      expect(issue.labels).toContain("feature");
    });

    it("assigns correct labels for each artifact type", () => {
      const labelTests: Record<ArtifactType, string[]> = {
        prd: ["prd", "product"],
        "user-story": ["user-story", "feature"],
        "tech-spec": ["tech-spec", "engineering"],
        "pitch-outline": ["pitch", "business"],
        okr: ["okr", "strategy"],
      };

      for (const [type, expectedLabels] of Object.entries(labelTests)) {
        const issue = artifactToGitHubIssue({ ...artifact, type: type as ArtifactType });
        expect(issue.labels).toEqual(expectedLabels);
      }
    });
  });

  describe("getArtifactTypeLabel", () => {
    it("returns human-readable labels for all types", () => {
      expect(getArtifactTypeLabel("prd")).toBe("Product Requirements Document");
      expect(getArtifactTypeLabel("user-story")).toBe("User Stories");
      expect(getArtifactTypeLabel("tech-spec")).toBe("Technical Specification");
      expect(getArtifactTypeLabel("pitch-outline")).toBe("Pitch Outline");
      expect(getArtifactTypeLabel("okr")).toBe("OKRs (Objectives & Key Results)");
    });
  });
});
