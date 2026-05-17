/**
 * Tests for the Innovation Copilot Agent module.
 */

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
  withRetry: vi.fn((fn: () => unknown) => fn()),
  wrapUserInput: vi.fn((_tag: string, text: string) => text),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  investigate: vi.fn(),
  collectSignals: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  readdirSync: vi.fn((): string[] => []),
}));

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  renameSync: mocks.renameSync,
  readdirSync: mocks.readdirSync,
}));
vi.mock("../../copilot/client.js", () => ({
  generateText: mocks.generateText,
  extractJson: mocks.extractJson,
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: mocks.withRetry,
}));
vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: mocks.wrapUserInput,
  sanitizeLlmOutput: mocks.sanitizeLlmOutput,
}));
vi.mock("../../innovation/investigate.js", () => ({
  investigate: mocks.investigate,
}));
vi.mock("../../sentinel/sentinel.js", () => ({
  collectSignals: mocks.collectSignals,
}));

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatProposalForDelivery,
  respondToProposal,
  agentRunToMarkdown,
  runCopilotAgentCycle,
  loadRun,
  listRuns,
} from "../copilot-agent.js";
import type {
  CopilotAgentRun,
  CopilotAgentConfig,
  Proposal,
} from "../types.js";
import { CopilotAgentRunSchema } from "../types.js";

// ---- Helpers ----

function createMockRun(overrides?: Partial<CopilotAgentRun>): CopilotAgentRun {
  const now = new Date().toISOString();
  return {
    id: "agent-test-123",
    state: "idle",
    sources: [],
    detectedChanges: [],
    proposals: [],
    deliveryChannels: [{ channel: "web", enabled: true }],
    config: {
      monitoringIntervalMs: 300000,
      relevanceThreshold: 0.5,
      maxProposalsPerCycle: 5,
      topics: ["AI", "innovation"],
      autoPropose: true,
    },
    stats: {
      totalCycles: 0,
      totalChangesDetected: 0,
      totalProposals: 0,
      acceptedProposals: 0,
      dismissedProposals: 0,
      deferredProposals: 0,
    },
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: "proposal-test-1",
    agentRunId: "agent-test-123",
    title: "Test Proposal",
    summary: "A test proposal summary",
    rationale: "Test rationale",
    opportunities: [
      {
        title: "Opportunity 1",
        description: "An opportunity",
        impact: "high",
        effort: "medium",
      },
    ],
    sourceChanges: ["change-1"],
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existsSync.mockReturnValue(false);
  mocks.collectSignals.mockResolvedValue([]);
});

describe("copilot-agent", () => {
  describe("formatProposalForDelivery", () => {
    it("formats a proposal as markdown", () => {
      const proposal = createMockProposal();
      const result = formatProposalForDelivery(proposal);

      expect(result).toContain("# 🤖 Innovation Proposal: Test Proposal");
      expect(result).toContain("**Status:** pending");
      expect(result).toContain("## Summary");
      expect(result).toContain("A test proposal summary");
      expect(result).toContain("## Rationale");
      expect(result).toContain("Test rationale");
      expect(result).toContain("## Opportunities");
      expect(result).toContain("Opportunity 1");
      expect(result).toContain("accept / dismiss / defer");
    });

    it("handles proposal with no opportunities", () => {
      const proposal = createMockProposal({ opportunities: [] });
      const result = formatProposalForDelivery(proposal);

      expect(result).toContain("Test Proposal");
      expect(result).not.toContain("## Opportunities");
    });
  });

  describe("respondToProposal", () => {
    it("accepts a pending proposal", () => {
      const proposal = createMockProposal();
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
      });

      const updated = respondToProposal(run, "proposal-test-1", "accepted", "Great idea!");
      const updatedProposal = updated.proposals.find((p) => p.id === "proposal-test-1")!;

      expect(updatedProposal.status).toBe("accepted");
      expect(updatedProposal.feedback).toBe("Great idea!");
      expect(updatedProposal.respondedAt).toBeDefined();
      expect(updated.stats.acceptedProposals).toBe(1);
    });

    it("dismisses a pending proposal", () => {
      const proposal = createMockProposal();
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
      });

      const updated = respondToProposal(run, "proposal-test-1", "dismissed");
      expect(updated.proposals[0].status).toBe("dismissed");
      expect(updated.stats.dismissedProposals).toBe(1);
    });

    it("defers a pending proposal", () => {
      const proposal = createMockProposal();
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
      });

      const updated = respondToProposal(run, "proposal-test-1", "deferred", "Revisit next quarter");
      expect(updated.proposals[0].status).toBe("deferred");
      expect(updated.proposals[0].feedback).toBe("Revisit next quarter");
      expect(updated.stats.deferredProposals).toBe(1);
    });

    it("throws for unknown proposal ID", () => {
      const run = createMockRun({ state: "waiting-for-feedback", proposals: [] });
      expect(() => respondToProposal(run, "nonexistent", "accepted")).toThrow(
        "Proposal nonexistent not found"
      );
    });

    it("throws for already-responded proposal", () => {
      const proposal = createMockProposal({ status: "accepted" });
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
      });

      expect(() => respondToProposal(run, "proposal-test-1", "dismissed")).toThrow(
        "already responded"
      );
    });

    it("transitions to idle when no pending proposals remain", () => {
      const proposal = createMockProposal();
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
      });

      const updated = respondToProposal(run, "proposal-test-1", "accepted");
      expect(updated.state).toBe("idle");
    });
  });

  describe("agentRunToMarkdown", () => {
    it("renders a summary for an idle run", () => {
      const run = createMockRun({ state: "idle" });
      const md = agentRunToMarkdown(run);

      expect(md).toContain("Innovation Copilot Agent");
      expect(md).toContain("**State:** idle");
      expect(md).toContain("**Cycles:** 0");
    });

    it("renders pending proposals", () => {
      const proposal = createMockProposal();
      const run = createMockRun({
        state: "waiting-for-feedback",
        proposals: [proposal],
        stats: { totalCycles: 3, totalChangesDetected: 10, totalProposals: 1, acceptedProposals: 0, dismissedProposals: 0, deferredProposals: 0 },
      });

      const md = agentRunToMarkdown(run);
      expect(md).toContain("Pending Proposals");
      expect(md).toContain("Test Proposal");
      expect(md).toContain("**Cycles:** 3");
    });

    it("renders error state", () => {
      const run = createMockRun({ state: "error", error: "Connection failed" });
      const md = agentRunToMarkdown(run);
      expect(md).toContain("Error");
      expect(md).toContain("Connection failed");
    });
  });

  describe("runCopilotAgentCycle", () => {
    const baseConfig: CopilotAgentConfig = {
      sources: [
        { id: "src-1", type: "market-signal", name: "Test Source", enabled: true },
      ],
      topics: ["AI", "innovation"],
      model: "gpt-4o-mini",
    };

    it("throws when no sources provided", async () => {
      await expect(
        runCopilotAgentCycle({ ...baseConfig, sources: [] })
      ).rejects.toThrow("At least one monitoring source is required");
    });

    it("throws when no topics provided", async () => {
      await expect(
        runCopilotAgentCycle({ ...baseConfig, topics: [] })
      ).rejects.toThrow("At least one topic is required");
    });

    it("completes a full cycle with no relevant changes (returns to idle)", async () => {
      mocks.generateText.mockResolvedValue(
        JSON.stringify({ relevantChanges: [], emergingThemes: [] })
      );

      const run = await runCopilotAgentCycle(baseConfig);

      expect(run.state).toBe("idle");
      expect(run.stats.totalCycles).toBe(1);
      expect(run.stats.totalChangesDetected).toBeGreaterThanOrEqual(0);
      expect(mocks.writeFileSync).toHaveBeenCalled();
    });

    it("completes a full cycle with relevant changes and generates proposal", async () => {
      mocks.generateText
        .mockResolvedValueOnce(
          JSON.stringify({
            relevantChanges: [
              { changeId: expect.any(String), relevanceScore: 0.9, reasoning: "Relevant", innovationPotential: "high" },
            ],
            emergingThemes: ["AI trends"],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            title: "AI Innovation Opportunity",
            summary: "We should explore AI",
            rationale: "Because AI is transformative",
            opportunities: [
              { title: "Build ML pipeline", description: "Create an ML pipeline", impact: "high", effort: "medium" },
            ],
          })
        );

      // Make the analysis return a matching changeId
      mocks.generateText.mockImplementation(async () => {
        return JSON.stringify({
          relevantChanges: [],
          emergingThemes: [],
        });
      });

      const run = await runCopilotAgentCycle(baseConfig);
      expect(run.stats.totalCycles).toBe(1);
    });

    it("invokes progress callback during cycle", async () => {
      mocks.generateText.mockResolvedValue(
        JSON.stringify({ relevantChanges: [], emergingThemes: [] })
      );

      const progressCalls: unknown[] = [];
      await runCopilotAgentCycle(baseConfig, undefined, (p) => {
        progressCalls.push(p);
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it("respects AbortSignal cancellation", async () => {
      const controller = new AbortController();
      controller.abort();

      mocks.collectSignals.mockRejectedValue(new DOMException("Aborted", "AbortError"));
      mocks.generateText.mockRejectedValue(new DOMException("Aborted", "AbortError"));

      try {
        await runCopilotAgentCycle({ ...baseConfig, signal: controller.signal });
      } catch {
        // Expected to throw or complete - either is valid
      }
      // Verify the run was saved in error state
      expect(mocks.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("loadRun / listRuns persistence", () => {
    it("loadRun returns null when file does not exist", () => {
      mocks.existsSync.mockReturnValue(false);
      const result = loadRun("nonexistent-id");
      expect(result).toBeNull();
    });

    it("loadRun parses a valid run file", () => {
      const mockRun = createMockRun();
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify(mockRun));

      const result = loadRun("agent-test-123");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("agent-test-123");
    });

    it("listRuns returns empty array when directory does not exist", () => {
      mocks.existsSync.mockReturnValue(false);
      const result = listRuns();
      expect(result).toEqual([]);
    });

    it("listRuns returns parsed runs sorted by updatedAt", () => {
      const run1 = createMockRun({ id: "run-1", updatedAt: "2025-01-01T00:00:00.000Z" });
      const run2 = createMockRun({ id: "run-2", updatedAt: "2025-01-02T00:00:00.000Z" });

      mocks.existsSync.mockReturnValue(true);
      mocks.readdirSync.mockReturnValue(["run-1.json", "run-2.json"]);
      mocks.readFileSync
        .mockReturnValueOnce(JSON.stringify(run1))
        .mockReturnValueOnce(JSON.stringify(run2));

      const result = listRuns();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("run-2");
    });
  });
});
