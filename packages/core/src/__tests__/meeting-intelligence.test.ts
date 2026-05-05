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
  MEETING_PLATFORMS,
  SIGNAL_TYPES,
  ingestTranscript,
  getTranscript,
  listTranscripts,
  getExtractionResult,
  getHighConfidenceSignals,
  getSuggestedInvestigations,
  registerMeetingConnector,
  getMeetingConnector,
  passesFilters,
  clearMeetingIntelligenceData,
} = await import("../meeting-intelligence/index.js");

function makeTranscript(id = "meeting-1") {
  return {
    id,
    platform: "zoom" as const,
    title: "Innovation Sprint Sync",
    date: "2025-01-15",
    duration: 45,
    participants: [
      { name: "Alice", role: "PM" },
      { name: "Bob", role: "Engineer" },
    ],
    segments: [
      { speaker: "Alice", timestamp: "00:01", text: "Let's discuss the new feature opportunity" },
      {
        speaker: "Bob",
        timestamp: "00:05",
        text: "I noticed our competitor launched something similar",
      },
    ],
  };
}

describe("meeting-intelligence", () => {
  beforeEach(() => {
    clearMeetingIntelligenceData();
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("MEETING_PLATFORMS has 4 items", () => {
      expect(MEETING_PLATFORMS).toHaveLength(4);
    });

    it("SIGNAL_TYPES has 8 items", () => {
      expect(SIGNAL_TYPES).toHaveLength(8);
    });
  });

  describe("ingestTranscript / getTranscript", () => {
    it("stores transcript and retrieves it", () => {
      const transcript = makeTranscript();
      ingestTranscript(transcript);
      const retrieved = getTranscript("meeting-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe("Innovation Sprint Sync");
    });
  });

  describe("listTranscripts", () => {
    it("returns all transcripts", () => {
      ingestTranscript(makeTranscript("m-1"));
      ingestTranscript(makeTranscript("m-2"));
      expect(listTranscripts()).toHaveLength(2);
    });
  });

  describe("getExtractionResult", () => {
    it("returns undefined before extraction", () => {
      expect(getExtractionResult("meeting-1")).toBeUndefined();
    });
  });

  describe("getHighConfidenceSignals", () => {
    it("returns empty initially", () => {
      expect(getHighConfidenceSignals()).toHaveLength(0);
    });
  });

  describe("getSuggestedInvestigations", () => {
    it("returns empty initially", () => {
      expect(getSuggestedInvestigations()).toHaveLength(0);
    });
  });

  describe("registerMeetingConnector / getMeetingConnector", () => {
    it("stores config and retrieves it", () => {
      const config = { platform: "zoom" as const, enabled: true };
      registerMeetingConnector(config);
      const retrieved = getMeetingConnector("zoom");
      expect(retrieved).toBeDefined();
      expect(retrieved!.platform).toBe("zoom");
      expect(retrieved!.enabled).toBe(true);
    });
  });

  describe("passesFilters", () => {
    it("returns true with no filters", () => {
      const transcript = makeTranscript();
      const config = { platform: "zoom" as const, enabled: true };
      expect(passesFilters(transcript, config)).toBe(true);
    });

    it("returns false for short meetings (duration < minDuration)", () => {
      const transcript = { ...makeTranscript(), duration: 3 };
      const config = { platform: "zoom" as const, enabled: true, filters: { minDuration: 10 } };
      expect(passesFilters(transcript, config)).toBe(false);
    });

    it("returns false when title matches excludePatterns", () => {
      const transcript = makeTranscript();
      const config = {
        platform: "zoom" as const,
        enabled: true,
        filters: { excludePatterns: ["Sprint"] },
      };
      expect(passesFilters(transcript, config)).toBe(false);
    });

    it("returns false when title doesn't match titlePatterns", () => {
      const transcript = makeTranscript();
      const config = {
        platform: "zoom" as const,
        enabled: true,
        filters: { titlePatterns: ["Standup"] },
      };
      expect(passesFilters(transcript, config)).toBe(false);
    });
  });
});
