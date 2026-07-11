import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../prompts/investigation.js", () => ({
  buildInvestigationPrompt: vi.fn().mockReturnValue("investigation prompt"),
}));

import { generateText, extractJson } from "../copilot/client.js";
import { investigate } from "../innovation/investigate.js";
import type { TextGenerator } from "../copilot/structured-generation.js";
import type { Investigation } from "../types.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

describe("investigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue("raw response");
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_INVESTIGATION));
  });

  it("calls generateText with the investigation prompt", async () => {
    await investigate("test subject");

    expect(mockGenerateText).toHaveBeenCalledWith({
      prompt: "investigation prompt",
      model: undefined,
      serverMode: true,
      signal: undefined,
    });
  });

  it("passes model and signal to generateText", async () => {
    const controller = new AbortController();
    await investigate("test", "gpt-5", controller.signal);

    expect(mockGenerateText).toHaveBeenCalledWith({
      prompt: "investigation prompt",
      model: "gpt-5",
      serverMode: true,
      signal: controller.signal,
    });
  });

  it("uses an injected text generator instead of Copilot", async () => {
    const controller = new AbortController();
    const textGenerator = vi.fn<TextGenerator>().mockResolvedValue("injected response");

    await investigate("test", "gpt-5", controller.signal, textGenerator);

    expect(textGenerator).toHaveBeenCalledWith({
      prompt: "investigation prompt",
      model: "gpt-5",
      serverMode: true,
      signal: controller.signal,
    });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns parsed investigation", async () => {
    const result = await investigate("test");

    expect(result).toEqual(MOCK_INVESTIGATION);
  });

  it("sanitizes the LLM output before JSON extraction", async () => {
    mockGenerateText.mockResolvedValue("\u200Braw response");

    await investigate("test");

    expect(mockExtractJson).toHaveBeenCalledWith("raw response");
  });

  it("throws when JSON parsing fails", async () => {
    mockExtractJson.mockReturnValue("not valid json");

    await expect(investigate("test")).rejects.toThrow("Failed to parse investigation response");
  });

  it("throws when schema validation fails", async () => {
    mockExtractJson.mockReturnValue(JSON.stringify({ summary: "only summary" }));

    await expect(investigate("test")).rejects.toThrow();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("propagates generateText errors", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(investigate("test")).rejects.toThrow("LLM error");
  });

  it("retries transient network errors with the shared retry policy", async () => {
    vi.useFakeTimers();
    try {
      mockGenerateText
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValue("raw response");

      const resultPromise = investigate("test");
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toEqual(MOCK_INVESTIGATION);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
