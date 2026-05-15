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
  readdirSync: vi.fn(() => []),
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
} from "../copilot-agent.js";
import type {
  CopilotAgentRun,
  Proposal,
} from "../types.js";

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
});
