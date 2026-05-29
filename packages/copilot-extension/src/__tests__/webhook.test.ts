import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvestigate = vi.fn();
const mockGenerateForAngle = vi.fn();
const mockRunAutoPipeline = vi.fn();
const mockParseSlashCommand = vi.fn();
const mockFormatInvestigationForChat = vi.fn();
const mockFormatAngleResultsForChat = vi.fn();
const mockFormatSynthesisForChat = vi.fn();
const mockFormatAnglesForChat = vi.fn();
const mockFormatPresetsForChat = vi.fn();
const mockFormatHelpForChat = vi.fn();

vi.mock("@innovator/core", () => ({
  parseSlashCommand: (...args: unknown[]) => mockParseSlashCommand(...args),
  formatInvestigationForChat: (...args: unknown[]) => mockFormatInvestigationForChat(...args),
  formatAngleResultsForChat: (...args: unknown[]) => mockFormatAngleResultsForChat(...args),
  formatSynthesisForChat: (...args: unknown[]) => mockFormatSynthesisForChat(...args),
  formatAnglesForChat: (...args: unknown[]) => mockFormatAnglesForChat(...args),
  formatPresetsForChat: (...args: unknown[]) => mockFormatPresetsForChat(...args),
  formatHelpForChat: (...args: unknown[]) => mockFormatHelpForChat(...args),
  investigate: (...args: unknown[]) => mockInvestigate(...args),
  generateForAngle: (...args: unknown[]) => mockGenerateForAngle(...args),
  runAutoPipeline: (...args: unknown[]) => mockRunAutoPipeline(...args),
  ANGLES: {},
  ANGLE_IDS: [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ],
}));

import { handleWebhook, type WebhookPayload } from "../webhook.js";

function makePayload(content: string): WebhookPayload {
  return {
    messages: [{ role: "user", content }],
  };
}

describe("handleWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatHelpForChat.mockReturnValue({ markdown: "# Help" });
    mockFormatAnglesForChat.mockReturnValue({ markdown: "# Angles" });
    mockFormatPresetsForChat.mockReturnValue({ markdown: "# Presets" });
  });

  describe("command routing", () => {
    it("routes /investigate command", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "investigate", args: "solar energy" });
      mockInvestigate.mockResolvedValue({ summary: "Solar is great" });
      mockFormatInvestigationForChat.mockReturnValue({ markdown: "# Investigation" });

      const result = await handleWebhook(makePayload("/investigate solar energy"));
      expect(result.status).toBe("success");
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(mockInvestigate).toHaveBeenCalledWith("solar energy", undefined, undefined);
    });

    it("returns help when investigate has no args", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "investigate", args: "" });

      const result = await handleWebhook(makePayload("/investigate"));
      expect(result.status).toBe("success");
      expect(result.chunks[0]).toContain("provide a subject");
    });

    it("routes /innovate command with --angles", async () => {
      mockParseSlashCommand.mockReturnValue({
        command: "innovate",
        args: "solar energy --angles scamper,first-principles",
      });
      mockInvestigate.mockResolvedValue({ summary: "test" });
      mockGenerateForAngle.mockResolvedValue({ angleId: "scamper", ideas: [] });
      mockFormatAngleResultsForChat.mockReturnValue({ markdown: "# Results" });

      const result = await handleWebhook(
        makePayload("/innovate solar energy --angles scamper,first-principles")
      );
      expect(result.status).toBe("success");
      expect(mockInvestigate).toHaveBeenCalled();
      expect(mockGenerateForAngle).toHaveBeenCalled();
    });

    it("returns help when innovate has no args", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "innovate", args: "" });

      const result = await handleWebhook(makePayload("/innovate"));
      expect(result.chunks[0]).toContain("provide a subject");
    });

    it("routes /angles command", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "angles", args: "" });

      const result = await handleWebhook(makePayload("/angles"));
      expect(result.status).toBe("success");
      expect(mockFormatAnglesForChat).toHaveBeenCalled();
    });

    it("routes /presets command", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "presets", args: "" });

      const result = await handleWebhook(makePayload("/presets"));
      expect(result.status).toBe("success");
      expect(mockFormatPresetsForChat).toHaveBeenCalled();
    });

    it("routes /help command", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "help", args: "" });

      const result = await handleWebhook(makePayload("/help"));
      expect(result.status).toBe("success");
      expect(mockFormatHelpForChat).toHaveBeenCalled();
    });

    it("defaults to help for unknown commands", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "unknown", args: "" });

      const result = await handleWebhook(makePayload("/unknown"));
      expect(result.status).toBe("success");
      expect(mockFormatHelpForChat).toHaveBeenCalled();
    });
  });

  describe("empty/invalid payloads", () => {
    it("returns help when no user messages", async () => {
      const result = await handleWebhook({ messages: [] });
      expect(result.status).toBe("success");
      expect(mockFormatHelpForChat).toHaveBeenCalled();
    });

    it("returns help when only assistant messages", async () => {
      const result = await handleWebhook({
        messages: [{ role: "assistant", content: "hello" }],
      });
      expect(result.status).toBe("success");
    });

    it("uses last user message", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "help", args: "" });

      const result = await handleWebhook({
        messages: [
          { role: "user", content: "/investigate old" },
          { role: "user", content: "/help" },
        ],
      });
      expect(result.status).toBe("success");
      expect(mockParseSlashCommand).toHaveBeenCalledWith("/help");
    });
  });

  describe("error handling", () => {
    it("catches and formats errors from investigate", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "investigate", args: "test" });
      mockInvestigate.mockRejectedValue(new Error("LLM unavailable"));

      const result = await handleWebhook(makePayload("/investigate test"));
      expect(result.status).toBe("error");
      expect(result.error).toBe("LLM unavailable");
      expect(result.chunks.some((c) => c.includes("Error"))).toBe(true);
    });

    it("catches non-Error thrown values", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "investigate", args: "test" });
      mockInvestigate.mockRejectedValue("string error");

      const result = await handleWebhook(makePayload("/investigate test"));
      expect(result.status).toBe("error");
      expect(result.error).toBe("string error");
    });
  });

  describe("auto command", () => {
    it("routes /auto command and returns progress", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "auto", args: "AI testing" });
      mockRunAutoPipeline.mockImplementation(
        async (
          _subject: string,
          onProgress: (progress: {
            stage: string;
            completedAngles: string[];
            totalAngles: number;
          }) => void
        ) => {
          onProgress({
            stage: "generating",
            completedAngles: ["scamper"],
            totalAngles: 2,
          });
        }
      );

      const result = await handleWebhook(makePayload("/auto AI testing"));

      expect(result.status).toBe("success");
      expect(result.chunks.some((chunk) => chunk.includes("generating"))).toBe(true);
      expect(mockRunAutoPipeline).toHaveBeenCalledWith(
        "AI testing",
        expect.any(Function),
        undefined,
        undefined,
        undefined
      );
    });

    it("returns help when auto has no args", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "auto", args: "" });

      const result = await handleWebhook(makePayload("/auto"));
      expect(result.chunks[0]).toContain("provide a subject");
    });
  });

  describe("AbortSignal", () => {
    it("passes signal through to investigate", async () => {
      mockParseSlashCommand.mockReturnValue({ command: "investigate", args: "test" });
      mockInvestigate.mockResolvedValue({ summary: "ok" });
      mockFormatInvestigationForChat.mockReturnValue({ markdown: "result" });

      const controller = new AbortController();
      await handleWebhook(makePayload("/investigate test"), {
        signal: controller.signal,
      });
      expect(mockInvestigate).toHaveBeenCalledWith("test", undefined, controller.signal);
    });
  });
});
