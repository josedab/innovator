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
  transformForAudience,
  transformForAllAudiences,
  OUTPUT_MODES,
  OUTPUT_MODE_DEFINITIONS,
  OutputModeSchema,
  getOutputMode,
} from "../audience/index.js";
import type { Synthesis } from "../types.js";

const mockSynthesis: Synthesis = {
  topIdeas: [
    {
      title: "Idea A",
      description: "Desc A",
      potentialImpact: "High",
      sourceAngle: "scamper",
      feasibility: "high" as const,
    },
  ],
  themes: ["technology", "innovation"],
  recommendation: "Prototype the top idea first",
};

describe("audience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("re-exports", () => {
    it("OUTPUT_MODES is a non-empty array", () => {
      expect(Array.isArray(OUTPUT_MODES)).toBe(true);
      expect(OUTPUT_MODES.length).toBeGreaterThan(0);
    });

    it("OUTPUT_MODE_DEFINITIONS has entries", () => {
      expect(OUTPUT_MODE_DEFINITIONS.length).toBeGreaterThan(0);
      for (const def of OUTPUT_MODE_DEFINITIONS) {
        expect(def).toHaveProperty("name");
        expect(def).toHaveProperty("audience");
      }
    });

    it("getOutputMode returns definition for each mode", () => {
      for (const mode of OUTPUT_MODES) {
        const def = getOutputMode(mode);
        expect(def).toBeDefined();
        expect(def!.name).toBeTruthy();
      }
    });

    it("OutputModeSchema validates known modes", () => {
      for (const mode of OUTPUT_MODES) {
        expect(() => OutputModeSchema.parse(mode)).not.toThrow();
      }
    });

    it("OutputModeSchema rejects unknown mode", () => {
      expect(() => OutputModeSchema.parse("nonexistent-mode")).toThrow();
    });
  });

  describe("transformForAudience", () => {
    it("throws for unknown mode with valid modes list", async () => {
      await expect(
        transformForAudience(mockSynthesis, "nonexistent" as never, "AI")
      ).rejects.toThrow(/Unknown output mode.*Valid modes/);
    });

    it("returns correct fields with mock LLM", async () => {
      const mockContent = { headline: "AI in Healthcare", summary: "Big potential" };
      const json = JSON.stringify(mockContent);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await transformForAudience(mockSynthesis, OUTPUT_MODES[0], "AI in Healthcare");

      expect(result.mode).toBe(OUTPUT_MODES[0]);
      expect(result.modeName).toBeTruthy();
      expect(result.audience).toBeTruthy();
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.content).toEqual(mockContent);
      expect(result.subject).toBe("AI in Healthcare");
    });
  });

  describe("transformForAllAudiences", () => {
    it("iterates all OUTPUT_MODES", async () => {
      const mockContent = JSON.stringify({ summary: "test" });
      mockGenerateText.mockResolvedValue(mockContent);
      mockExtractJson.mockReturnValue(mockContent);

      const results = await transformForAllAudiences(mockSynthesis, "AI");

      expect(results.length).toBe(OUTPUT_MODES.length);
      const modes = results.map((r) => r.mode);
      for (const mode of OUTPUT_MODES) {
        expect(modes).toContain(mode);
      }
    });

    it("skips failed modes and continues", async () => {
      let callCount = 0;
      mockGenerateText.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("LLM failure");
        return JSON.stringify({ summary: "ok" });
      });
      mockExtractJson.mockImplementation((s: string) => s);

      const results = await transformForAllAudiences(mockSynthesis, "AI");

      expect(results.length).toBe(OUTPUT_MODES.length - 1);
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      const results = await transformForAllAudiences(
        mockSynthesis,
        "AI",
        undefined,
        undefined,
        controller.signal
      );

      expect(results).toHaveLength(0);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });
  });
});
