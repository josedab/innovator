import { describe, it, expect, vi, afterEach } from "vitest";

const { mockRunAutonomousAgent } = vi.hoisted(() => ({
  mockRunAutonomousAgent: vi.fn(),
}));

vi.mock("./agent.js", () => ({
  runAutonomousAgent: mockRunAutonomousAgent,
  autonomousRunToMarkdown: vi.fn(() => "# Mock Markdown"),
}));

import {
  listAgentRuns,
  getAgentRun,
  injectTopics,
  stopAgentRun,
  getLatestCheckpoint,
  exportRunPortfolio,
  removeAgentRun,
  clearAgentRuns,
} from "./manager.js";

afterEach(() => {
  clearAgentRuns();
});

describe("agent manager", () => {
  it("listAgentRuns returns empty initially", () => {
    expect(listAgentRuns()).toEqual([]);
  });

  it("getAgentRun returns undefined for unknown id", () => {
    expect(getAgentRun("nonexistent")).toBeUndefined();
  });

  it("injectTopics returns false for unknown run", () => {
    expect(injectTopics("nonexistent", ["topic"])).toBe(false);
  });

  it("stopAgentRun returns false for unknown run", () => {
    expect(stopAgentRun("nonexistent")).toBe(false);
  });

  it("getLatestCheckpoint returns undefined for unknown run", () => {
    expect(getLatestCheckpoint("nonexistent")).toBeUndefined();
  });

  it("exportRunPortfolio returns null for unknown run", () => {
    expect(exportRunPortfolio("nonexistent")).toBeNull();
  });

  it("removeAgentRun returns false for unknown run", () => {
    expect(removeAgentRun("nonexistent")).toBe(false);
  });

  it("clearAgentRuns clears all runs", () => {
    clearAgentRuns();
    expect(listAgentRuns()).toEqual([]);
  });
});
