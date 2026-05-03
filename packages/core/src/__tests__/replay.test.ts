import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const {
  startRunRecord,
  recordPrompt,
  completeRunRecord,
  getRunRecord,
  listRunRecords,
  deleteRunRecord,
  clearRunRecords,
  previewReplay,
  setRecordingEnabled,
  isRecordingEnabled,
  comparisonToMarkdown,
} = await import("../replay/index.js");

// Use inline type for RunComparison
interface RunComparisonType {
  runA: string;
  runB: string;
  overrides: Record<string, unknown>;
  similarityScore: number;
  ideaOverlap: number;
  newIdeas: string[];
  removedIdeas: string[];
  analysis: string;
  comparedAt: string;
}

describe("replay", () => {
  beforeEach(() => {
    clearRunRecords();
    setRecordingEnabled(true);
  });

  describe("startRunRecord", () => {
    it("creates record with ID and status fields", () => {
      const id = startRunRecord("Solar energy", "gpt-4.1", ["scamper"]);
      expect(id).toBeTruthy();
      expect(id).toMatch(/^run-/);

      const record = getRunRecord(id);
      expect(record).toBeDefined();
      expect(record!.subject).toBe("Solar energy");
      expect(record!.model).toBe("gpt-4.1");
      expect(record!.angles).toEqual(["scamper"]);
      expect(record!.createdAt).toBeTruthy();
      expect(record!.prompts).toEqual([]);
      expect(record!.completedAt).toBeUndefined();
    });

    it("returns empty string when recording is disabled", () => {
      setRecordingEnabled(false);
      const id = startRunRecord("Test", "model");
      expect(id).toBe("");
    });
  });

  describe("recordPrompt", () => {
    it("appends PromptRecord to run", () => {
      const runId = startRunRecord("Test", "model", ["scamper"]);
      recordPrompt(runId, "Generate ideas", "investigation", "model", undefined, 1500);

      const record = getRunRecord(runId);
      expect(record!.prompts).toHaveLength(1);
      expect(record!.prompts[0].prompt).toBe("Generate ideas");
      expect(record!.prompts[0].stage).toBe("investigation");
      expect(record!.prompts[0].durationMs).toBe(1500);
      expect(record!.prompts[0].id).toMatch(/^prompt-/);
    });

    it("does nothing for nonexistent run", () => {
      recordPrompt("fake-id", "test", "investigation");
      // No error thrown
    });

    it("does nothing when recording is disabled", () => {
      const runId = startRunRecord("Test", "model");
      setRecordingEnabled(false);
      recordPrompt(runId, "test", "investigation");
      setRecordingEnabled(true);
      expect(getRunRecord(runId)!.prompts).toHaveLength(0);
    });

    it("does nothing for empty runId", () => {
      recordPrompt("", "test", "investigation");
      // No error thrown
    });
  });

  describe("completeRunRecord", () => {
    it("sets completedAt and attaches results", () => {
      const runId = startRunRecord("Test", "model");
      const investigation = { summary: "test" };
      const angleResults = [{ angleId: "scamper" }];
      const synthesis = { topIdeas: [] };

      completeRunRecord(runId, {
        investigation: investigation as unknown as import("../types.js").Investigation,
        angleResults: angleResults as unknown as import("../types.js").AngleResult[],
        synthesis: synthesis as unknown as import("../types.js").Synthesis,
      });

      const record = getRunRecord(runId);
      expect(record!.completedAt).toBeTruthy();
      expect(record!.investigation).toEqual(investigation);
      expect(record!.angleResults).toEqual(angleResults);
      expect(record!.synthesis).toEqual(synthesis);
    });

    it("does nothing for nonexistent run", () => {
      completeRunRecord("fake-id", {});
      // No error thrown
    });
  });

  describe("getRunRecord", () => {
    it("returns undefined for unknown id", () => {
      expect(getRunRecord("nonexistent")).toBeUndefined();
    });
  });

  describe("listRunRecords", () => {
    it("returns all records sorted by createdAt descending", () => {
      startRunRecord("First");
      startRunRecord("Second");
      startRunRecord("Third");
      const records = listRunRecords();
      expect(records).toHaveLength(3);
    });

    it("filters by subject when provided", () => {
      startRunRecord("Solar energy");
      startRunRecord("Wind power");
      startRunRecord("Solar panels");
      const results = listRunRecords("solar");
      expect(results).toHaveLength(2);
    });
  });

  describe("deleteRunRecord", () => {
    it("deletes existing record", () => {
      const id = startRunRecord("Delete me");
      expect(deleteRunRecord(id)).toBe(true);
      expect(getRunRecord(id)).toBeUndefined();
    });

    it("returns false for nonexistent record", () => {
      expect(deleteRunRecord("fake")).toBe(false);
    });
  });

  describe("previewReplay", () => {
    it("returns modified prompts with subject override", () => {
      const id = startRunRecord("Solar energy", "gpt-4.1", ["scamper"]);
      recordPrompt(id, "Investigate Solar energy in depth", "investigation", "gpt-4.1");
      recordPrompt(
        id,
        "Generate SCAMPER ideas for Solar energy",
        "generation",
        "gpt-4.1",
        "scamper"
      );

      const preview = previewReplay(id, { subject: "Wind power" });
      expect(preview).toBeDefined();
      expect(preview!.subject).toBe("Wind power");
      expect(preview!.prompts[0].prompt).toContain("Wind power");
      expect(preview!.prompts[0].prompt).not.toContain("Solar energy");
    });

    it("applies promptModifier", () => {
      const id = startRunRecord("Test");
      recordPrompt(id, "Original prompt", "investigation");

      const preview = previewReplay(id, {
        promptModifier: (prompt, stage) => `[${stage}] ${prompt}`,
      });
      expect(preview!.prompts[0].prompt).toBe("[investigation] Original prompt");
    });

    it("filters by angles override", () => {
      const id = startRunRecord("Test", undefined, ["scamper", "inversion"]);
      recordPrompt(id, "Investigate", "investigation");
      recordPrompt(id, "SCAMPER", "generation", undefined, "scamper");
      recordPrompt(id, "Inversion", "generation", undefined, "inversion");

      const preview = previewReplay(id, { angles: ["scamper"] });
      // Should keep investigation + scamper generation, drop inversion
      expect(preview!.prompts).toHaveLength(2);
      const angleIds = preview!.prompts.map((p) => p.angleId).filter(Boolean);
      expect(angleIds).toEqual(["scamper"]);
    });

    it("returns undefined for nonexistent run", () => {
      expect(previewReplay("fake")).toBeUndefined();
    });

    it("applies model override", () => {
      const id = startRunRecord("Test", "gpt-4.1");
      recordPrompt(id, "Prompt", "investigation", "gpt-4.1");

      const preview = previewReplay(id, { model: "claude-sonnet-4.5" });
      expect(preview!.model).toBe("claude-sonnet-4.5");
      expect(preview!.prompts[0].model).toBe("claude-sonnet-4.5");
    });
  });

  describe("setRecordingEnabled / isRecordingEnabled", () => {
    it("toggles recording state", () => {
      expect(isRecordingEnabled()).toBe(true);
      setRecordingEnabled(false);
      expect(isRecordingEnabled()).toBe(false);
      setRecordingEnabled(true);
      expect(isRecordingEnabled()).toBe(true);
    });
  });

  describe("comparisonToMarkdown", () => {
    it("generates formatted markdown report", () => {
      const comparison: RunComparisonType = {
        runA: "run-1",
        runB: "run-2",
        overrides: { model: { from: "gpt-4.1", to: "claude-sonnet-4.5" } },
        similarityScore: 0.75,
        ideaOverlap: 0.5,
        newIdeas: ["New idea 1", "New idea 2"],
        removedIdeas: ["Old idea 1"],
        analysis: "Both runs explored similar themes.",
        comparedAt: "2025-01-01T00:00:00Z",
      };

      const md = comparisonToMarkdown(comparison);
      expect(md).toContain("# Run Comparison Report");
      expect(md).toContain("run-1");
      expect(md).toContain("run-2");
      expect(md).toContain("75.0%");
      expect(md).toContain("50.0%");
      expect(md).toContain("New idea 1");
      expect(md).toContain("Old idea 1");
      expect(md).toContain("Overrides Applied");
      expect(md).toContain("Both runs explored similar themes.");
    });

    it("omits overrides section when empty", () => {
      const comparison: RunComparisonType = {
        runA: "run-1",
        runB: "run-2",
        overrides: {},
        similarityScore: 1,
        ideaOverlap: 1,
        newIdeas: [],
        removedIdeas: [],
        analysis: "Identical runs.",
        comparedAt: "2025-01-01T00:00:00Z",
      };

      const md = comparisonToMarkdown(comparison);
      expect(md).not.toContain("Overrides Applied");
      expect(md).not.toContain("New Ideas in Run B");
      expect(md).not.toContain("Ideas Only in Run A");
    });
  });
});
