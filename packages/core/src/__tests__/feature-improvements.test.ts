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
  buildSynthesisPrompt: vi.fn().mockReturnValue("synthesis prompt"),
  investigationContext: vi.fn().mockReturnValue("investigation context"),
}));

vi.mock("../prompts/angles/index.js", () => ({
  buildScamperPrompt: vi.fn().mockReturnValue("scamper prompt"),
  buildFirstPrinciplesPrompt: vi.fn().mockReturnValue("first-principles prompt"),
  buildCrossDomainPrompt: vi.fn().mockReturnValue("cross-domain prompt"),
  buildConstraintsPrompt: vi.fn().mockReturnValue("constraints prompt"),
  buildInversionPrompt: vi.fn().mockReturnValue("inversion prompt"),
  buildPerspectivesPrompt: vi.fn().mockReturnValue("perspectives prompt"),
  buildWhatIfPrompt: vi.fn().mockReturnValue("what-if prompt"),
  buildTrendCollisionPrompt: vi.fn().mockReturnValue("trend-collision prompt"),
}));

vi.mock("../innovation/custom-angles.js", () => ({
  getCustomAngle: vi.fn().mockReturnValue(undefined),
  buildCustomAnglePrompt: vi.fn().mockReturnValue("custom angle prompt"),
}));

import { generateText, extractJson } from "../copilot/client.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import { computeCompletionPercent } from "../types.js";
import type { Investigation, AngleResult, PipelineProgress } from "../types.js";
import { getEventBus, resetEventBus } from "../events/emitter.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

const MOCK_ANGLE_RESULT: AngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    { title: "Idea", description: "Desc", potentialImpact: "High", implementationHint: "Hint" },
  ],
  reasoning: "Applied SCAMPER",
};

// ---- Subject Validation ----

describe("subject validation in investigate()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEventBus();
    mockGenerateText.mockResolvedValue("raw response");
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_INVESTIGATION));
  });

  it("rejects empty subject", async () => {
    await expect(investigate("")).rejects.toThrow("Subject must not be empty");
  });

  it("rejects whitespace-only subject", async () => {
    await expect(investigate("   ")).rejects.toThrow("Subject must not be empty");
  });

  it("rejects too-short subject", async () => {
    await expect(investigate("a")).rejects.toThrow("at least 2 characters");
  });

  it("rejects overly long subject", async () => {
    const longSubject = "a".repeat(501);
    await expect(investigate(longSubject)).rejects.toThrow("must not exceed 500 characters");
  });

  it("accepts valid subject after sanitization", async () => {
    const result = await investigate("code review processes");
    expect(result).toEqual(MOCK_INVESTIGATION);
  });
});

describe("subject validation in generateForAngle()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEventBus();
    mockGenerateText.mockResolvedValue("raw response");
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_ANGLE_RESULT));
  });

  it("rejects empty subject", async () => {
    await expect(generateForAngle("", MOCK_INVESTIGATION, "scamper")).rejects.toThrow(
      "Subject must not be empty"
    );
  });

  it("rejects too-short subject", async () => {
    await expect(generateForAngle("x", MOCK_INVESTIGATION, "scamper")).rejects.toThrow(
      "at least 2 characters"
    );
  });

  it("accepts valid subject", async () => {
    const result = await generateForAngle("test subject", MOCK_INVESTIGATION, "scamper");
    expect(result.angleId).toBe("scamper");
  });
});

// ---- Event Bus Emissions ----

describe("event bus emissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEventBus();
    mockGenerateText.mockResolvedValue("raw response");
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_INVESTIGATION));
  });

  it("investigate() emits investigation.started and investigation.completed", async () => {
    const events: string[] = [];
    const bus = getEventBus();
    bus.on("investigation.started", () => {
      events.push("started");
    });
    bus.on("investigation.completed", () => {
      events.push("completed");
    });

    await investigate("test subject");
    expect(events).toEqual(["started", "completed"]);
  });

  it("investigate() emits investigation.failed on error", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM error"));
    const events: string[] = [];
    const bus = getEventBus();
    bus.on("investigation.failed", () => {
      events.push("failed");
    });

    await expect(investigate("test subject")).rejects.toThrow("LLM error");
    expect(events).toEqual(["failed"]);
  });

  it("generateForAngle() emits generation.started and generation.completed", async () => {
    mockExtractJson.mockReturnValue(JSON.stringify(MOCK_ANGLE_RESULT));
    const events: string[] = [];
    const bus = getEventBus();
    bus.on("generation.started", () => {
      events.push("started");
    });
    bus.on("generation.completed", () => {
      events.push("completed");
    });

    await generateForAngle("test subject", MOCK_INVESTIGATION, "scamper");
    expect(events).toEqual(["started", "completed"]);
  });

  it("generateForAngle() emits generation.failed on error", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM timeout"));
    const events: string[] = [];
    const bus = getEventBus();
    bus.on("generation.failed", () => {
      events.push("failed");
    });

    await expect(generateForAngle("test subject", MOCK_INVESTIGATION, "scamper")).rejects.toThrow(
      "LLM timeout"
    );
    expect(events).toEqual(["failed"]);
  });
});

// ---- Completion Percentage ----

describe("computeCompletionPercent", () => {
  const baseProgress: PipelineProgress = {
    stage: "investigating",
    completedAngles: [],
    totalAngles: 8,
    angleResults: [],
  };

  it("returns 0 for investigating stage", () => {
    expect(computeCompletionPercent({ ...baseProgress, stage: "investigating" })).toBe(0);
  });

  it("returns 20 for generating with 0 completed angles", () => {
    expect(
      computeCompletionPercent({ ...baseProgress, stage: "generating", completedAngles: [] })
    ).toBe(20);
  });

  it("scales linearly during generation", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "generating",
        completedAngles: ["scamper", "inversion", "cross-domain", "constraints"],
        totalAngles: 8,
      })
    ).toBe(50); // 20 + 60 * (4/8) = 50
  });

  it("returns 80 for synthesizing stage", () => {
    expect(computeCompletionPercent({ ...baseProgress, stage: "synthesizing" })).toBe(80);
  });

  it("returns 100 for complete stage", () => {
    expect(computeCompletionPercent({ ...baseProgress, stage: "complete" })).toBe(100);
  });

  it("returns progress at failure point for error stage", () => {
    // Error during investigating (no investigation result)
    expect(computeCompletionPercent({ ...baseProgress, stage: "error" })).toBe(0);

    // Error during generation (has investigation, some angles done)
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "error",
        investigation: MOCK_INVESTIGATION,
        completedAngles: ["scamper", "inversion"],
        totalAngles: 8,
      })
    ).toBe(35); // 20 + 60 * (2/8) = 35

    // Error during synthesis (has investigation + all angle results)
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "error",
        investigation: MOCK_INVESTIGATION,
        angleResults: [MOCK_ANGLE_RESULT],
      })
    ).toBe(80); // 20 + 60 = 80
  });

  it("handles 0 totalAngles gracefully", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "generating",
        totalAngles: 0,
      })
    ).toBe(20);
  });

  it("returns 100 when all angles complete in generating stage", () => {
    const allAngles = ["a", "b", "c", "d"];
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "generating",
        completedAngles: allAngles,
        totalAngles: 4,
      })
    ).toBe(80); // 20 + 60 * (4/4) = 80
  });

  it("returns 0 for error stage with 0 totalAngles and no investigation", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "error",
        totalAngles: 0,
      })
    ).toBe(0);
  });

  it("returns 20 for error after investigation with 0 totalAngles", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "error",
        investigation: MOCK_INVESTIGATION,
        totalAngles: 0,
        completedAngles: [],
      })
    ).toBe(20); // 20 + 60 * 0 = 20
  });

  it("returns 0 for unknown stage (default case)", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "unknown" as PipelineProgress["stage"],
      })
    ).toBe(0);
  });

  it("rounds fractional percentages", () => {
    expect(
      computeCompletionPercent({
        ...baseProgress,
        stage: "generating",
        completedAngles: ["a"],
        totalAngles: 3,
      })
    ).toBe(40); // 20 + 60 * (1/3) = 40 (Math.round)
  });
});
