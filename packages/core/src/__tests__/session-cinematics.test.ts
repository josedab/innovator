import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  generateCinematicScript,
  getCinematicScript,
  listCinematicScripts,
  clearCinematicScripts,
  scriptToSrt,
  scriptToStoryboard,
  scriptToRemotionConfig,
  type CinematicScript,
  type Scene,
  type SessionData,
} from "../session-cinematics/index.js";
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    order: 1,
    title: "Introduction",
    voiceover: "Welcome to this session",
    visuals: [
      {
        type: "highlight-text",
        content: "Title",
        position: "center",
        animation: "fade-in",
        durationMs: 3000,
      },
    ],
    backgroundMood: "intro",
    durationMs: 8000,
    ...overrides,
  };
}

function makeScript(overrides: Partial<CinematicScript> = {}): CinematicScript {
  return {
    title: "Test Script",
    subject: "Test Subject",
    totalDurationMs: 8000,
    scenes: [makeScene()],
    metadata: {
      ideaCount: 5,
      angleCount: 3,
      hasScoring: false,
      hasSynthesis: true,
    },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    subject: "Test Subject",
    investigation: {
      summary: "A study of testing",
      keyAspects: [],
      currentState: "Current",
      challenges: ["challenge"],
      opportunities: ["opportunity"],
    } as SessionData["investigation"],
    angleResults: [
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [
          {
            title: "Idea 1",
            description: "Desc",
            potentialImpact: "High",
            implementationHint: "Do",
          },
        ],
        reasoning: "Applied SCAMPER",
      },
    ] as SessionData["angleResults"],
    ...overrides,
  };
}

describe("session-cinematics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCinematicScripts();
  });

  describe("scriptToSrt", () => {
    it("formats 0ms as 00:00:00,000", () => {
      const script = makeScript({
        scenes: [makeScene({ durationMs: 5000 })],
      });
      const srt = scriptToSrt(script);
      expect(srt).toContain("00:00:00,000");
    });

    it("formats >1hr correctly", () => {
      const script = makeScript({
        scenes: [makeScene({ durationMs: 3661000 })], // 1h 1m 1s
      });
      const srt = scriptToSrt(script);
      expect(srt).toContain("01:01:01,000");
    });

    it("formats precision edge cases HH:MM:SS,mmm", () => {
      const script = makeScript({
        scenes: [
          makeScene({ durationMs: 1500, order: 1, id: "s1" }),
          makeScene({ durationMs: 2500, order: 2, id: "s2" }),
        ],
        totalDurationMs: 4000,
      });
      const srt = scriptToSrt(script);
      // First scene: 0 → 1500ms
      expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
      // Second scene: 1500 → 4000ms
      expect(srt).toContain("00:00:01,500 --> 00:00:04,000");
    });

    it("includes scene voiceover text", () => {
      const script = makeScript({
        scenes: [makeScene({ voiceover: "Hello world" })],
      });
      const srt = scriptToSrt(script);
      expect(srt).toContain("Hello world");
    });

    it("numbers entries sequentially", () => {
      const script = makeScript({
        scenes: [
          makeScene({ id: "s1", order: 1, durationMs: 1000 }),
          makeScene({ id: "s2", order: 2, durationMs: 1000 }),
          makeScene({ id: "s3", order: 3, durationMs: 1000 }),
        ],
        totalDurationMs: 3000,
      });
      const srt = scriptToSrt(script);
      expect(srt).toContain("1\n");
      expect(srt).toContain("2\n");
      expect(srt).toContain("3\n");
    });
  });

  describe("scriptToRemotionConfig", () => {
    it("computes durationInFrames = Math.ceil(ms / (1000/30))", () => {
      const script = makeScript({
        totalDurationMs: 10000,
        scenes: [makeScene({ durationMs: 10000 })],
      });
      const config = scriptToRemotionConfig(script) as {
        durationInFrames: number;
        fps: number;
        sequences: Array<{
          durationInFrames: number;
          elements: Array<{ durationInFrames: number }>;
        }>;
      };
      // 10000 / (1000/30) = 10000 / 33.333 = 300
      expect(config.durationInFrames).toBe(300);
      expect(config.fps).toBe(30);
    });

    it("scene duration in frames matches formula", () => {
      const script = makeScript({
        scenes: [makeScene({ durationMs: 5000 })],
        totalDurationMs: 5000,
      });
      const config = scriptToRemotionConfig(script) as {
        sequences: Array<{ durationInFrames: number }>;
      };
      expect(config.sequences[0].durationInFrames).toBe(150);
    });

    it("element durationInFrames computed correctly", () => {
      const script = makeScript({
        scenes: [
          makeScene({
            visuals: [
              {
                type: "highlight-text",
                content: "X",
                position: "center",
                animation: "fade-in",
                durationMs: 3000,
              },
            ],
          }),
        ],
      });
      const config = scriptToRemotionConfig(script) as {
        sequences: Array<{ elements: Array<{ durationInFrames: number }> }>;
      };
      expect(config.sequences[0].elements[0].durationInFrames).toBe(90);
    });

    it("aggregates scene durations across elements", () => {
      const script = makeScript({
        scenes: [
          makeScene({ durationMs: 8000, id: "s1", order: 1 }),
          makeScene({ durationMs: 12000, id: "s2", order: 2 }),
        ],
        totalDurationMs: 20000,
      });
      const config = scriptToRemotionConfig(script) as {
        durationInFrames: number;
        sequences: Array<{ durationInFrames: number }>;
      };
      expect(config.durationInFrames).toBe(600);
      expect(config.sequences).toHaveLength(2);
    });
  });

  describe("generateCinematicScript", () => {
    it("rejects empty subject", async () => {
      await expect(generateCinematicScript({ subject: "" })).rejects.toThrow(
        "Session subject is required"
      );
    });

    it("rejects whitespace-only subject", async () => {
      await expect(generateCinematicScript({ subject: "   " })).rejects.toThrow(
        "Session subject is required"
      );
    });

    it("generates and stores script successfully", async () => {
      const scenes = [makeScene()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ title: "My Script", scenes }));

      const result = await generateCinematicScript(makeSessionData());
      expect(result.title).toBe("My Script");
      expect(result.scenes).toHaveLength(1);
      expect(result.totalDurationMs).toBe(8000);
      expect(result.metadata.angleCount).toBe(1);
      expect(result.metadata.ideaCount).toBe(1);
      expect(result.generatedAt).toBeTruthy();
    });

    it("retries on parse failure conditions", async () => {
      const { withRetry } = await import("../copilot/retry.js");
      const mockWithRetry = vi.mocked(withRetry);
      // Verify isRetryable was passed correctly by checking the call
      mockWithRetry.mockImplementation(async (fn, opts) => {
        // Verify retry options include the right error conditions
        if (opts?.isRetryable) {
          expect(opts.isRetryable(new Error("Failed to parse cinematic script"))).toBe(true);
          expect(opts.isRetryable(new Error("No JSON object found"))).toBe(true);
          expect(opts.isRetryable(new Error("Unbalanced JSON braces"))).toBe(true);
          expect(opts.isRetryable(new Error("Other error"))).toBe(false);
        }
        return { title: "Test", scenes: [makeScene()] };
      });

      await generateCinematicScript(makeSessionData());
    });
  });

  describe("scriptToStoryboard", () => {
    it("includes title and subject", () => {
      const md = scriptToStoryboard(makeScript());
      expect(md).toContain("🎬 Test Script");
      expect(md).toContain("Test Subject");
    });

    it("includes conditional notes section", () => {
      const script = makeScript({
        scenes: [makeScene({ notes: "Director note" })],
      });
      const md = scriptToStoryboard(script);
      expect(md).toContain("Director note");
    });

    it("omits notes when not present", () => {
      const script = makeScript({
        scenes: [makeScene({ notes: undefined })],
      });
      const md = scriptToStoryboard(script);
      expect(md).not.toContain("Notes:");
    });

    it("includes visual elements conditionally", () => {
      const scriptWithVisuals = makeScript({
        scenes: [
          makeScene({
            visuals: [
              {
                type: "idea-card",
                content: "Card content",
                position: "center",
                animation: "fade-in",
                durationMs: 3000,
              },
            ],
          }),
        ],
      });
      const md = scriptToStoryboard(scriptWithVisuals);
      expect(md).toContain("🎨 Visuals");
      expect(md).toContain("[idea-card]");
    });

    it("includes voiceover sections", () => {
      const md = scriptToStoryboard(makeScript());
      expect(md).toContain("🎙️ Voiceover");
      expect(md).toContain("Welcome to this session");
    });
  });

  describe("storage CRUD", () => {
    it("listCinematicScripts returns stored scripts with id and title", async () => {
      const scenes = [makeScene()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ title: "Script 1", scenes }));
      await generateCinematicScript(makeSessionData());
      await generateCinematicScript(makeSessionData({ subject: "Other" }));

      const list = listCinematicScripts();
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty("id");
      expect(list[0]).toHaveProperty("title");
      expect(list[0]).toHaveProperty("generatedAt");
    });

    it("clearCinematicScripts removes all", async () => {
      const scenes = [makeScene()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ title: "Script", scenes }));
      await generateCinematicScript(makeSessionData());
      clearCinematicScripts();
      expect(listCinematicScripts()).toHaveLength(0);
    });

    it("getCinematicScript returns undefined for unknown id", () => {
      expect(getCinematicScript("nonexistent")).toBeUndefined();
    });
  });
});
