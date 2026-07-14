import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunAutoPipeline = vi.fn();
const mockDisposeRuntime = vi.fn().mockResolvedValue(undefined);

vi.mock("@innovator/core/innovation", () => ({
  runAutoPipeline: (...args: unknown[]) => mockRunAutoPipeline(...args),
}));

vi.mock("@innovator/core/runtime", () => ({
  createDefaultInnovatorRuntime: vi.fn(() => ({
    dispose: mockDisposeRuntime,
  })),
}));

import { InnovatorBot } from "../bot.js";
import type { BotPlatform, BotMessage, BotResponse, BotConfig } from "../types.js";
import type { PipelineProgress } from "@innovator/core/innovation";

function createMockPlatform(): BotPlatform & {
  handlers: Map<string, (message: BotMessage) => Promise<void>>;
  sentMessages: { channelId: string; response: BotResponse }[];
  sentUpdates: { channelId: string; response: BotResponse }[];
} {
  const handlers = new Map<string, (message: BotMessage) => Promise<void>>();
  const sentMessages: { channelId: string; response: BotResponse }[] = [];
  const sentUpdates: { channelId: string; response: BotResponse }[] = [];

  return {
    platformId: "test",
    platformName: "Test Platform",
    handlers,
    sentMessages,
    sentUpdates,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onCommand: vi.fn((command: string, handler: (message: BotMessage) => Promise<void>) => {
      handlers.set(command, handler);
    }),
    sendMessage: vi.fn(async (channelId: string, response: BotResponse) => {
      sentMessages.push({ channelId, response });
    }),
    sendUpdate: vi.fn(async (channelId: string, response: BotResponse) => {
      sentUpdates.push({ channelId, response });
    }),
  };
}

function makeMessage(text: string, overrides?: Partial<BotMessage>): BotMessage {
  return {
    channelId: "ch-1",
    userId: "user-1",
    userName: "Alice",
    text,
    threadId: "thread-1",
    ...overrides,
  };
}

const MOCK_COMPLETE_RESULT: PipelineProgress = {
  stage: "complete",
  completedAngles: ["scamper"],
  totalAngles: 1,
  angleResults: [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Idea1",
          description: "Description of idea 1",
          potentialImpact: "High",
          implementationHint: "Do it",
        },
      ],
      reasoning: "Applied SCAMPER",
    },
  ],
  synthesis: {
    topIdeas: [
      {
        title: "Top Idea",
        description: "Best idea description",
        sourceAngle: "scamper",
        potentialImpact: "Very high",
        feasibility: "high",
      },
    ],
    themes: ["automation"],
    recommendation: "Start with automation",
  },
};

describe("InnovatorBot", () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let bot: InnovatorBot;

  beforeEach(() => {
    vi.clearAllMocks();
    platform = createMockPlatform();
    bot = new InnovatorBot({ platform });
  });

  describe("start", () => {
    it("registers innovate command and starts platform", async () => {
      await bot.start();

      expect(platform.onCommand).toHaveBeenCalledWith("innovate", expect.any(Function));
      expect(platform.start).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("stops the platform and disposes its runtime", async () => {
      await bot.stop();
      expect(platform.stop).toHaveBeenCalled();
      expect(mockDisposeRuntime).toHaveBeenCalledOnce();
    });
  });

  describe("innovate command", () => {
    beforeEach(async () => {
      await bot.start();
    });

    it("returns error message for empty subject", async () => {
      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage(""));

      expect(platform.sentMessages).toHaveLength(1);
      expect(platform.sentMessages[0].response.text).toContain("Please provide a subject");
    });

    it("returns error message for whitespace-only subject", async () => {
      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("   "));

      expect(platform.sentMessages).toHaveLength(1);
      expect(platform.sentMessages[0].response.text).toContain("Please provide a subject");
    });

    it("rejects subject > 500 chars", async () => {
      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("x".repeat(501)));

      expect(platform.sentMessages).toHaveLength(1);
      expect(platform.sentMessages[0].response.text).toContain("too long");
    });

    it("accepts subject at exactly 500 chars", async () => {
      mockRunAutoPipeline.mockResolvedValue(MOCK_COMPLETE_RESULT);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("x".repeat(500)));

      // Should start pipeline, not error
      expect(platform.sentMessages.length).toBeGreaterThanOrEqual(2);
      expect(platform.sentMessages[0].response.text).toContain("Starting innovation pipeline");
    });

    it("returns formatted results on successful pipeline", async () => {
      mockRunAutoPipeline.mockResolvedValue(MOCK_COMPLETE_RESULT);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test subject"));

      const finalMsg = platform.sentMessages.find((m) => m.response.isFinal);
      expect(finalMsg).toBeDefined();
      expect(finalMsg!.response.text).toContain("Innovation Results");
      expect(finalMsg!.response.text).toContain("Top Idea");
      expect(finalMsg!.response.text).toContain("automation");
      expect(finalMsg!.response.text).toContain("Start with automation");
    });

    it("returns error message when pipeline returns error stage", async () => {
      mockRunAutoPipeline.mockResolvedValue({
        ...MOCK_COMPLETE_RESULT,
        stage: "error",
        error: "Something went wrong",
      });

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const errorMsg = platform.sentMessages.find((m) =>
        m.response.text.includes("Pipeline failed")
      );
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.response.text).toContain("Something went wrong");
    });

    it("returns error message when pipeline throws", async () => {
      mockRunAutoPipeline.mockRejectedValue(new Error("Network error"));

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const errorMsg = platform.sentMessages.find((m) => m.response.text.includes("Error"));
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.response.text).toContain("Network error");
    });

    it("sends stage updates during pipeline execution", async () => {
      mockRunAutoPipeline.mockImplementation(
        async (subject: string, onProgress: (p: PipelineProgress) => void) => {
          onProgress({
            stage: "investigating",
            completedAngles: [],
            totalAngles: 1,
            angleResults: [],
          });
          onProgress({
            stage: "generating",
            completedAngles: [],
            totalAngles: 1,
            angleResults: [],
          });
          onProgress({
            stage: "synthesizing",
            completedAngles: ["scamper"],
            totalAngles: 1,
            angleResults: [],
          });
          return MOCK_COMPLETE_RESULT;
        }
      );

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      expect(platform.sentUpdates.length).toBeGreaterThanOrEqual(1);
    });

    it("formats results without synthesis", async () => {
      const noSynthesis: PipelineProgress = {
        ...MOCK_COMPLETE_RESULT,
        synthesis: undefined,
      };
      mockRunAutoPipeline.mockResolvedValue(noSynthesis);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const finalMsg = platform.sentMessages.find((m) => m.response.isFinal);
      expect(finalMsg).toBeDefined();
      expect(finalMsg!.response.text).toContain("1 angles processed");
    });

    it("preserves threadId in responses", async () => {
      mockRunAutoPipeline.mockResolvedValue(MOCK_COMPLETE_RESULT);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test", { threadId: "thread-42" }));

      for (const msg of platform.sentMessages) {
        expect(msg.response.threadId).toBe("thread-42");
      }
    });

    it("uses defaultModel when configured", async () => {
      bot = new InnovatorBot({ platform, defaultModel: "gpt-5" });
      await bot.start();

      mockRunAutoPipeline.mockResolvedValue(MOCK_COMPLETE_RESULT);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      expect(mockRunAutoPipeline).toHaveBeenCalledWith("test", expect.any(Function), "gpt-5");
    });

    it("continues pipeline despite sendUpdate failure (silent error swallowing)", async () => {
      platform.sendUpdate = vi.fn().mockRejectedValue(new Error("Send failed"));

      mockRunAutoPipeline.mockImplementation(
        async (subject: string, onProgress: (p: PipelineProgress) => void) => {
          onProgress({
            stage: "investigating",
            completedAngles: [],
            totalAngles: 1,
            angleResults: [],
          });
          onProgress({
            stage: "generating",
            completedAngles: [],
            totalAngles: 1,
            angleResults: [],
          });
          return MOCK_COMPLETE_RESULT;
        }
      );

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      // Pipeline should complete despite sendUpdate failures
      const finalMsg = platform.sentMessages.find((m) => m.response.isFinal);
      expect(finalMsg).toBeDefined();
      expect(finalMsg!.response.text).toContain("Innovation Results");
    });

    it("formats stage with correct emojis", async () => {
      mockRunAutoPipeline.mockImplementation(
        async (subject: string, onProgress: (p: PipelineProgress) => void) => {
          onProgress({
            stage: "investigating",
            completedAngles: [],
            totalAngles: 2,
            angleResults: [],
          });
          onProgress({
            stage: "generating",
            completedAngles: ["scamper"],
            totalAngles: 2,
            angleResults: [],
          });
          onProgress({
            stage: "synthesizing",
            completedAngles: ["scamper", "inversion"],
            totalAngles: 2,
            angleResults: [],
          });
          return MOCK_COMPLETE_RESULT;
        }
      );

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const updates = platform.sentUpdates;
      expect(updates.some((u) => u.response.text.includes("🔬"))).toBe(true);
      expect(updates.some((u) => u.response.text.includes("💡"))).toBe(true);
      expect(updates.some((u) => u.response.text.includes("🧬"))).toBe(true);
    });

    it("formats results with empty synthesis themes", async () => {
      const noThemes: PipelineProgress = {
        ...MOCK_COMPLETE_RESULT,
        synthesis: {
          ...MOCK_COMPLETE_RESULT.synthesis!,
          themes: [],
        },
      };
      mockRunAutoPipeline.mockResolvedValue(noThemes);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const finalMsg = platform.sentMessages.find((m) => m.response.isFinal);
      expect(finalMsg).toBeDefined();
      // Should not contain themes line when empty
      expect(finalMsg!.response.text).not.toContain("Themes:");
    });

    it("truncates very long results", async () => {
      // Generate enough content to exceed 3500 chars
      // formatResults slices descriptions to 200 and recommendation to 500
      // So we need many ideas + long themes to push over the limit
      const longResult: PipelineProgress = {
        ...MOCK_COMPLETE_RESULT,
        synthesis: {
          topIdeas: Array.from({ length: 5 }, (_, i) => ({
            title: `Really Long Idea Title Number ${i} With Lots of Extra Detail Text Here`,
            description: "A".repeat(1000),
            sourceAngle: "scamper-angle-with-longer-name",
            potentialImpact: "Very High",
            feasibility: "high",
          })),
          themes: Array.from(
            { length: 50 },
            (_, i) => `very-long-theme-name-number-${i}-with-detail`
          ),
          recommendation: "R".repeat(2000),
        },
        angleResults: Array.from({ length: 20 }, (_, i) => ({
          angleId: `angle-${i}`,
          angleName: `Angle ${i}`,
          ideas: Array.from({ length: 20 }, (_, j) => ({
            title: `Idea ${j}`,
            description: "desc",
            potentialImpact: "high",
            implementationHint: "hint",
          })),
          reasoning: "reasoning",
        })),
      };
      mockRunAutoPipeline.mockResolvedValue(longResult);

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const finalMsg = platform.sentMessages.find((m) => m.response.isFinal);
      // Either it's truncated or within limit - both are acceptable
      if (finalMsg!.response.text.length > 3500) {
        expect(finalMsg!.response.text).toContain("[truncated]");
      }
    });

    it("handles error stage with undefined error message", async () => {
      mockRunAutoPipeline.mockResolvedValue({
        ...MOCK_COMPLETE_RESULT,
        stage: "error",
        error: undefined,
      });

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const errorMsg = platform.sentMessages.find((m) =>
        m.response.text.includes("Pipeline failed")
      );
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.response.text).toContain("Unknown error");
    });

    it("handles non-Error thrown values", async () => {
      mockRunAutoPipeline.mockRejectedValue("string error");

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const errorMsg = platform.sentMessages.find((m) => m.response.text.includes("Error"));
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.response.text).toContain("string error");
    });

    it("only sends stage update when stage changes", async () => {
      mockRunAutoPipeline.mockImplementation(
        async (subject: string, onProgress: (p: PipelineProgress) => void) => {
          onProgress({
            stage: "investigating",
            completedAngles: [],
            totalAngles: 2,
            angleResults: [],
          });
          onProgress({
            stage: "investigating",
            completedAngles: [],
            totalAngles: 2,
            angleResults: [],
          });
          onProgress({
            stage: "generating",
            completedAngles: [],
            totalAngles: 2,
            angleResults: [],
          });
          return MOCK_COMPLETE_RESULT;
        }
      );

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      // Should only have 2 stage updates (investigating + generating), not 3
      expect(platform.sentUpdates.length).toBe(2);
    });

    it("shows angle progress in generating stage format", async () => {
      mockRunAutoPipeline.mockImplementation(
        async (subject: string, onProgress: (p: PipelineProgress) => void) => {
          onProgress({
            stage: "generating",
            completedAngles: ["scamper"],
            totalAngles: 3,
            angleResults: [],
          });
          return MOCK_COMPLETE_RESULT;
        }
      );

      const handler = platform.handlers.get("innovate")!;
      await handler(makeMessage("test"));

      const genUpdate = platform.sentUpdates.find((u) => u.response.text.includes("1/3"));
      expect(genUpdate).toBeDefined();
    });
  });

  describe("double stop", () => {
    it("calling stop twice reuses one shutdown", async () => {
      await bot.stop();
      await expect(bot.stop()).resolves.toBeUndefined();
      expect(platform.stop).toHaveBeenCalledOnce();
      expect(mockDisposeRuntime).toHaveBeenCalledOnce();
    });
  });
});
