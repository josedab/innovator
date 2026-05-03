import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunAutoPipeline = vi.fn();

vi.mock("@innovator/core", () => ({
  runAutoPipeline: (...args: unknown[]) => mockRunAutoPipeline(...args),
}));

import { InnovatorBot } from "../bot.js";
import type { BotPlatform, BotMessage, BotResponse, BotConfig } from "../types.js";
import type { PipelineProgress } from "@innovator/core";

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
        { title: "Idea1", description: "Description of idea 1", potentialImpact: "High", implementationHint: "Do it" },
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
    it("stops the platform", async () => {
      await bot.stop();
      expect(platform.stop).toHaveBeenCalled();
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

      const errorMsg = platform.sentMessages.find((m) => m.response.text.includes("Pipeline failed"));
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
          onProgress({ stage: "investigating", completedAngles: [], totalAngles: 1, angleResults: [] });
          onProgress({ stage: "generating", completedAngles: [], totalAngles: 1, angleResults: [] });
          onProgress({ stage: "synthesizing", completedAngles: ["scamper"], totalAngles: 1, angleResults: [] });
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

      expect(mockRunAutoPipeline).toHaveBeenCalledWith(
        "test",
        expect.any(Function),
        "gpt-5"
      );
    });
  });
});
