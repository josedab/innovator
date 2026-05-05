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
  CAPTURE_SOURCE_TYPES,
  RELEVANCE_CATEGORIES,
  generateContentFingerprint,
  isDuplicate,
  addCapturedSignal,
  getCapturedSignal,
  listCapturedSignals,
  removeCapturedSignal,
  getTopicClusters,
  getInvestigationDrafts,
  updateDraftStatus,
  updateCaptureSettings,
  getCaptureSettings,
  clearAmbientCaptureData,
} = await import("../ambient-capture/index.js");

function makeSignal(id = "sig-1", relevanceScore = 80) {
  return {
    id,
    title: "AI Trend Article",
    excerpt: "New developments in AI...",
    sourceType: "article" as const,
    capturedAt: new Date().toISOString(),
    relevanceScore,
    tags: ["ai"],
    fingerprint: `fp-${id}`,
  };
}

describe("ambient-capture", () => {
  beforeEach(() => {
    clearAmbientCaptureData();
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("CAPTURE_SOURCE_TYPES has 10 items", () => {
      expect(CAPTURE_SOURCE_TYPES).toHaveLength(10);
    });

    it("RELEVANCE_CATEGORIES has 10 items", () => {
      expect(RELEVANCE_CATEGORIES).toHaveLength(10);
    });
  });

  describe("generateContentFingerprint", () => {
    it("returns consistent string for same input", () => {
      const fp1 = generateContentFingerprint("test content");
      const fp2 = generateContentFingerprint("test content");
      expect(fp1).toBe(fp2);
      expect(typeof fp1).toBe("string");
    });

    it("returns different strings for different input", () => {
      const fp1 = generateContentFingerprint("content A");
      const fp2 = generateContentFingerprint("content B");
      expect(fp1).not.toBe(fp2);
    });
  });

  describe("isDuplicate", () => {
    it("returns false initially", () => {
      expect(isDuplicate("fp-new")).toBe(false);
    });
  });

  describe("addCapturedSignal / getCapturedSignal", () => {
    it("adds signal successfully and retrieves it", () => {
      const signal = makeSignal();
      const added = addCapturedSignal(signal);
      expect(added).toBe(true);
      const retrieved = getCapturedSignal("sig-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe("AI Trend Article");
    });

    it("rejects duplicate fingerprint", () => {
      addCapturedSignal(makeSignal("sig-1"));
      const dup = makeSignal("sig-2");
      dup.fingerprint = "fp-sig-1";
      const added = addCapturedSignal(dup);
      expect(added).toBe(false);
    });

    it("rejects low relevance below minRelevanceScore", () => {
      const signal = makeSignal("sig-low", 10);
      const added = addCapturedSignal(signal);
      expect(added).toBe(false);
    });
  });

  describe("listCapturedSignals", () => {
    it("returns all signals", () => {
      addCapturedSignal(makeSignal("s1"));
      addCapturedSignal(makeSignal("s2"));
      expect(listCapturedSignals()).toHaveLength(2);
    });

    it("filters by sourceType", () => {
      addCapturedSignal(makeSignal("s1"));
      const webSig = {
        ...makeSignal("s2"),
        sourceType: "webpage" as const,
        fingerprint: "fp-s2-web",
      };
      addCapturedSignal(webSig);
      expect(listCapturedSignals({ sourceType: "article" })).toHaveLength(1);
      expect(listCapturedSignals({ sourceType: "webpage" })).toHaveLength(1);
    });

    it("filters by minRelevance", () => {
      addCapturedSignal(makeSignal("s1", 90));
      addCapturedSignal(makeSignal("s2", 50));
      expect(listCapturedSignals({ minRelevance: 80 })).toHaveLength(1);
    });
  });

  describe("removeCapturedSignal", () => {
    it("removes signal and returns true", () => {
      addCapturedSignal(makeSignal("sig-1"));
      expect(removeCapturedSignal("sig-1")).toBe(true);
      expect(getCapturedSignal("sig-1")).toBeUndefined();
    });

    it("returns false for non-existent signal", () => {
      expect(removeCapturedSignal("nope")).toBe(false);
    });
  });

  describe("getTopicClusters", () => {
    it("returns empty initially", () => {
      expect(getTopicClusters()).toHaveLength(0);
    });
  });

  describe("getInvestigationDrafts", () => {
    it("returns empty initially", () => {
      expect(getInvestigationDrafts()).toHaveLength(0);
    });
  });

  describe("updateCaptureSettings / getCaptureSettings", () => {
    it("getCaptureSettings returns defaults", () => {
      const settings = getCaptureSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.autoCapture).toBe(true);
      expect(settings.minRelevanceScore).toBe(30);
    });

    it("updateCaptureSettings updates and returns new settings", () => {
      const updated = updateCaptureSettings({ minRelevanceScore: 50, autoCapture: false });
      expect(updated.minRelevanceScore).toBe(50);
      expect(updated.autoCapture).toBe(false);
      expect(getCaptureSettings().minRelevanceScore).toBe(50);
    });
  });
});
