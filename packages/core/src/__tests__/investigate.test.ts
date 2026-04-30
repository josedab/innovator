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

  it("returns parsed investigation", async () => {
    const result = await investigate("test");

    expect(result).toEqual(MOCK_INVESTIGATION);
  });

  it("throws when JSON parsing fails", async () => {
    mockExtractJson.mockReturnValue("not valid json");

    await expect(investigate("test")).rejects.toThrow("Failed to parse investigation response");
  });

  it("throws when schema validation fails", async () => {
    mockExtractJson.mockReturnValue(JSON.stringify({ summary: "only summary" }));

    await expect(investigate("test")).rejects.toThrow();
  });

  it("propagates generateText errors", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(investigate("test")).rejects.toThrow("LLM error");
  });
});
