import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDiffPrompt, DiffResultSchema, type DiffResult } from "../index.js";

// Mock LLM dependencies
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((_label: string, value: string) => value),
}));

// ---- Helpers ----

function makeDiffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    subjectA: "AI in 2020",
    subjectB: "AI in 2026",
    changed: [{ title: "Model size", description: "Models grew 100x", significance: "high" }],
    newOpportunities: [
      { title: "Edge AI", description: "Run models on devices", significance: "medium" },
    ],
    obsoleted: [
      { title: "Rule-based systems", description: "Replaced by ML", significance: "low" },
    ],
    emergingGaps: [
      { title: "AI Safety", description: "Alignment research needed", significance: "high" },
    ],
    summary: "Significant advances in AI capabilities",
    ...overrides,
  };
}

describe("diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- buildDiffPrompt ----
  describe("buildDiffPrompt", () => {
    it("includes both snapshots in prompt", () => {
      const prompt = buildDiffPrompt("AI in 2020", "AI in 2026");
      expect(prompt).toContain("AI in 2020");
      expect(prompt).toContain("AI in 2026");
      expect(prompt).toContain("snapshot A");
      expect(prompt).toContain("snapshot B");
    });

    it("includes all diff categories in instructions", () => {
      const prompt = buildDiffPrompt("A", "B");
      expect(prompt).toContain("Changed");
      expect(prompt).toContain("New Opportunities");
      expect(prompt).toContain("Obsoleted");
      expect(prompt).toContain("Emerging Gaps");
    });
  });

  // ---- runInnovationDiff (mocked LLM) ----
  describe("runInnovationDiff", () => {
    it("returns structured diff from LLM response", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(JSON.stringify(makeDiffResult()));

      const { runInnovationDiff } = await import("../index.js");
      const result = await runInnovationDiff("AI in 2020", "AI in 2026");

      expect(result.subjectA).toBe("AI in 2020");
      expect(result.subjectB).toBe("AI in 2026");
      expect(result.changed).toHaveLength(1);
      expect(result.newOpportunities).toHaveLength(1);
      expect(result.obsoleted).toHaveLength(1);
      expect(result.emergingGaps).toHaveLength(1);
      expect(result.summary).toBeTruthy();
    });

    it("detects emerging gaps present in after but not before", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify(
          makeDiffResult({
            emergingGaps: [
              { title: "AI Safety", description: "New concern in 2026", significance: "high" },
              { title: "Data Privacy", description: "Regulation gaps", significance: "medium" },
            ],
          })
        )
      );

      const { runInnovationDiff } = await import("../index.js");
      const result = await runInnovationDiff("AI in 2020", "AI in 2026");
      expect(result.emergingGaps).toHaveLength(2);
    });

    it("identical snapshots report no changes", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify(
          makeDiffResult({
            changed: [],
            newOpportunities: [],
            obsoleted: [],
            emergingGaps: [],
            summary: "No significant changes detected",
          })
        )
      );

      const { runInnovationDiff } = await import("../index.js");
      const result = await runInnovationDiff("same", "same");
      expect(result.changed).toHaveLength(0);
      expect(result.newOpportunities).toHaveLength(0);
      expect(result.obsoleted).toHaveLength(0);
      expect(result.emergingGaps).toHaveLength(0);
    });

    it("completely different snapshots flag all items as changed", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify(
          makeDiffResult({
            changed: [
              { title: "Everything", description: "Total change", significance: "high" },
              { title: "Domain", description: "New domain", significance: "high" },
            ],
            obsoleted: [{ title: "Old approach", description: "Obsolete", significance: "high" }],
            newOpportunities: [{ title: "New area", description: "All new", significance: "high" }],
          })
        )
      );

      const { runInnovationDiff } = await import("../index.js");
      const result = await runInnovationDiff("cooking", "quantum physics");
      expect(result.changed.length).toBeGreaterThan(0);
      expect(result.obsoleted.length).toBeGreaterThan(0);
      expect(result.newOpportunities.length).toBeGreaterThan(0);
    });

    it("throws for empty subjectA", async () => {
      const { runInnovationDiff } = await import("../index.js");
      await expect(runInnovationDiff("", "B")).rejects.toThrow("Snapshot A cannot be empty");
    });

    it("throws for empty subjectB", async () => {
      const { runInnovationDiff } = await import("../index.js");
      await expect(runInnovationDiff("A", "")).rejects.toThrow("Snapshot B cannot be empty");
    });

    it("throws for whitespace-only subjects", async () => {
      const { runInnovationDiff } = await import("../index.js");
      await expect(runInnovationDiff("   ", "B")).rejects.toThrow("Snapshot A cannot be empty");
    });

    it("throws for subjects exceeding 2000 characters", async () => {
      const { runInnovationDiff } = await import("../index.js");
      const longSubject = "x".repeat(2001);
      await expect(runInnovationDiff(longSubject, "B")).rejects.toThrow("under 2000 characters");
    });
  });

  // ---- DiffResultSchema validation ----
  describe("DiffResultSchema", () => {
    it("accepts valid diff result", () => {
      const result = DiffResultSchema.safeParse(makeDiffResult());
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = DiffResultSchema.safeParse({ subjectA: "A" });
      expect(result.success).toBe(false);
    });

    it("accepts empty arrays for all categories", () => {
      const result = DiffResultSchema.safeParse(
        makeDiffResult({
          changed: [],
          newOpportunities: [],
          obsoleted: [],
          emergingGaps: [],
        })
      );
      expect(result.success).toBe(true);
    });
  });
});
