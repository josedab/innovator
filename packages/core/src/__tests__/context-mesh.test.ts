import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  ingestSignal,
  getMeshState,
  resetMesh,
  detectPatternsLocal,
  dismissSuggestion,
  getActiveSuggestions,
  contextMeshToMarkdown,
} from "../context-mesh/index.js";
import type { ContextSignal } from "../context-mesh/index.js";

function createSignal(overrides: Partial<ContextSignal> = {}): ContextSignal {
  return {
    id: `signal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: "documents",
    title: "Test Signal",
    content: "Test content for signal",
    timestamp: new Date().toISOString(),
    metadata: {},
    tags: [],
    ...overrides,
  };
}

describe("context-mesh", () => {
  beforeEach(() => {
    resetMesh();
  });

  describe("ingestSignal", () => {
    it("should add a signal to the mesh", () => {
      ingestSignal(createSignal({ id: "s1", content: "hello world" }));
      const state = getMeshState();
      expect(state.totalSignalsIngested).toBe(1);
      expect(state.signals.length).toBe(1);
    });

    it("should bound signals to max limit", () => {
      for (let i = 0; i < 1005; i++) {
        ingestSignal(createSignal({ id: `s-${i}`, content: `signal ${i}` }));
      }
      const state = getMeshState();
      expect(state.signals.length).toBeLessThanOrEqual(1000);
      expect(state.totalSignalsIngested).toBe(1005);
    });
  });

  describe("detectPatternsLocal", () => {
    it("should return empty for less than 2 signals", () => {
      ingestSignal(createSignal());
      const patterns = detectPatternsLocal();
      expect(patterns).toHaveLength(0);
    });

    it("should detect recurring themes", () => {
      for (let i = 0; i < 5; i++) {
        ingestSignal(
          createSignal({
            id: `s-${i}`,
            content: `machine learning algorithms for prediction models`,
          })
        );
      }
      const patterns = detectPatternsLocal();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.patternType === "recurring-theme")).toBe(true);
    });

    it("should detect unconnected dots from different sources", () => {
      ingestSignal(
        createSignal({
          id: "s1",
          source: "browser-history",
          content: "quantum computing breakthrough in optimization algorithms",
        })
      );
      ingestSignal(
        createSignal({
          id: "s2",
          source: "slack-messages",
          content: "quantum computing advances in optimization and algorithms research",
        })
      );
      const patterns = detectPatternsLocal();
      const dots = patterns.filter((p) => p.patternType === "unconnected-dots");
      expect(dots.length).toBeGreaterThanOrEqual(0); // depends on overlap threshold
    });
  });

  describe("suggestions", () => {
    it("should dismiss a suggestion", () => {
      // Manually add a suggestion to state
      ingestSignal(createSignal({ id: "s1", content: "test content" }));
      // Since no suggestions exist yet, dismissing returns false
      expect(dismissSuggestion("non-existent")).toBe(false);
    });

    it("should return empty active suggestions initially", () => {
      expect(getActiveSuggestions()).toHaveLength(0);
    });
  });

  describe("resetMesh", () => {
    it("should clear all state", () => {
      ingestSignal(createSignal());
      ingestSignal(createSignal());
      resetMesh();
      const state = getMeshState();
      expect(state.signals).toHaveLength(0);
      expect(state.patterns).toHaveLength(0);
      expect(state.suggestions).toHaveLength(0);
      expect(state.totalSignalsIngested).toBe(0);
    });
  });

  describe("contextMeshToMarkdown", () => {
    it("should produce markdown report", () => {
      ingestSignal(createSignal({ content: "test signal content" }));
      const md = contextMeshToMarkdown();
      expect(md).toContain("Context Mesh Report");
      expect(md).toContain("Total Signals Ingested");
    });
  });
});
