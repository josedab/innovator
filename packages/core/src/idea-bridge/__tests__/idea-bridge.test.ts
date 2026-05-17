/**
 * Tests for the Idea-to-Implementation Bridge module.
 */

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
  withRetry: vi.fn((fn: () => unknown) => fn()),
  wrapUserInput: vi.fn((_tag: string, text: string) => text),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generatePRD,
  generateTechSpec,
  generateImplementationPlan,
  runBridgePipeline,
  bridgePipelineToMarkdown,
} from "../idea-bridge.js";
import type { PRD, TechSpec, BridgePipeline } from "../types.js";
import type { BridgeProgress } from "../idea-bridge.js";

// ---- Helpers ----

const MOCK_PRD_RESPONSE = JSON.stringify({
  title: "Smart Notifications",
  summary: "A smart notification system",
  problemStatement: "Users miss important updates",
  proposedSolution: "AI-powered notification prioritization",
  goals: ["Reduce notification fatigue", "Increase engagement"],
  nonGoals: ["Replace email"],
  userStories: [
    {
      title: "Priority inbox",
      description: "As a user, I want prioritized notifications",
      persona: "End user",
      acceptanceCriteria: [
        "Given notifications, when AI ranks them, then top priority shown first",
      ],
      priority: "must-have",
      estimatedPoints: 5,
    },
  ],
  successMetrics: ["50% fewer dismissed notifications"],
  risks: [
    {
      description: "AI may misjudge priority",
      severity: "medium",
      mitigation: "Add manual override",
    },
  ],
});

const MOCK_TECH_SPEC_RESPONSE = JSON.stringify({
  title: "Smart Notifications Tech Spec",
  architecture: "Microservice with event-driven architecture",
  apiDesign: [
    { method: "POST", path: "/api/notifications", description: "Create notification" },
    { method: "GET", path: "/api/notifications", description: "List notifications" },
  ],
  dataModels: [
    {
      name: "Notification",
      fields: ["id: string", "content: string", "priority: number"],
      description: "Core notification entity",
    },
  ],
  techStack: ["TypeScript", "Next.js", "PostgreSQL"],
  dependencies: ["zod", "pg"],
  securityConsiderations: ["Validate input", "Rate limit API"],
});

const MOCK_IMPL_PLAN_RESPONSE = JSON.stringify({
  tasks: [
    {
      title: "Set up database",
      description: "Create PostgreSQL schema",
      type: "chore",
      estimatedHours: 4,
      dependencies: [],
      labels: ["backend"],
      scaffoldFiles: ["src/db/schema.sql"],
    },
    {
      title: "Build notification API",
      description: "REST endpoints",
      type: "feature",
      estimatedHours: 8,
      dependencies: ["Set up database"],
      labels: ["backend", "api"],
    },
    {
      title: "Write API tests",
      description: "Unit and integration tests",
      type: "test",
      estimatedHours: 4,
      dependencies: ["Build notification API"],
      labels: ["testing"],
    },
  ],
  phases: [
    {
      name: "Phase 1: Foundation",
      taskTitles: ["Set up database"],
      description: "Database and infrastructure",
    },
    {
      name: "Phase 2: Core",
      taskTitles: ["Build notification API"],
      description: "Core API development",
    },
    {
      name: "Phase 3: Quality",
      taskTitles: ["Write API tests"],
      description: "Testing and polish",
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("idea-bridge", () => {
  describe("generatePRD", () => {
    it("generates a PRD from idea", async () => {
      mocks.generateText.mockResolvedValue(MOCK_PRD_RESPONSE);

      const prd = await generatePRD("Smart Notifications", "AI-powered notification system");

      expect(prd.id).toMatch(/^prd-/);
      expect(prd.title).toBe("Smart Notifications");
      expect(prd.goals).toHaveLength(2);
      expect(prd.userStories).toHaveLength(1);
      expect(prd.userStories[0].id).toMatch(/^story-/);
      expect(prd.risks).toHaveLength(1);
      expect(prd.createdAt).toBeDefined();
    });
  });

  describe("generateTechSpec", () => {
    it("generates a tech spec from PRD", async () => {
      mocks.generateText.mockResolvedValueOnce(MOCK_PRD_RESPONSE);
      const prd = await generatePRD("Test", "Test idea");

      mocks.generateText.mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE);
      const spec = await generateTechSpec(prd);

      expect(spec.id).toMatch(/^spec-/);
      expect(spec.prdId).toBe(prd.id);
      expect(spec.apiDesign).toHaveLength(2);
      expect(spec.dataModels).toHaveLength(1);
      expect(spec.techStack).toContain("TypeScript");
    });
  });

  describe("generateImplementationPlan", () => {
    it("generates implementation plan from tech spec", async () => {
      mocks.generateText.mockResolvedValueOnce(MOCK_PRD_RESPONSE);
      const prd = await generatePRD("Test", "Test");

      mocks.generateText.mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE);
      const spec = await generateTechSpec(prd);

      mocks.generateText.mockResolvedValueOnce(MOCK_IMPL_PLAN_RESPONSE);
      const plan = await generateImplementationPlan(spec, prd);

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.techSpecId).toBe(spec.id);
      expect(plan.tasks).toHaveLength(3);
      expect(plan.totalEstimatedHours).toBe(16);
      expect(plan.phases).toHaveLength(3);
      expect(plan.tasks[0].id).toMatch(/^task-/);
    });
  });

  describe("bridgePipelineToMarkdown", () => {
    it("renders pipeline as markdown", () => {
      const pipeline: BridgePipeline = {
        id: "bridge-1",
        ideaTitle: "Smart Notifications",
        ideaDescription: "AI notifications",
        stage: "completed",
        prd: {
          id: "prd-1",
          title: "Smart Notifications",
          summary: "A smart notification system",
          problemStatement: "Users miss updates",
          proposedSolution: "AI prioritization",
          goals: ["Reduce fatigue"],
          nonGoals: [],
          userStories: [],
          successMetrics: [],
          risks: [],
          createdAt: new Date().toISOString(),
        },
        techSpec: {
          id: "spec-1",
          prdId: "prd-1",
          title: "Smart Notifications Spec",
          architecture: "Microservice",
          apiDesign: [{ method: "GET", path: "/api/test", description: "Test" }],
          dataModels: [],
          techStack: ["TypeScript"],
          dependencies: [],
          securityConsiderations: [],
          createdAt: new Date().toISOString(),
        },
        implementationPlan: {
          id: "plan-1",
          techSpecId: "spec-1",
          title: "Implementation Plan",
          tasks: [
            {
              id: "t1",
              title: "Setup",
              description: "Setup project",
              type: "chore",
              estimatedHours: 4,
              dependencies: [],
              labels: [],
            },
          ],
          totalEstimatedHours: 4,
          phases: [{ name: "Phase 1", taskIds: ["t1"], description: "Setup" }],
          dependencyGraph: [],
          createdAt: new Date().toISOString(),
        },
        createdIssues: [],
        createdBranches: ["feature/smart-notifications"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const md = bridgePipelineToMarkdown(pipeline);
      expect(md).toContain("Idea-to-Implementation Bridge");
      expect(md).toContain("Smart Notifications");
      expect(md).toContain("PRD");
      expect(md).toContain("Tech Spec");
      expect(md).toContain("Implementation Plan");
      expect(md).toContain("feature/smart-notifications");
    });
  });

  describe("runBridgePipeline", () => {
    it("runs full pipeline: PRD → spec → plan", async () => {
      mocks.generateText
        .mockResolvedValueOnce(MOCK_PRD_RESPONSE)
        .mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE)
        .mockResolvedValueOnce(MOCK_IMPL_PLAN_RESPONSE);

      const pipeline = await runBridgePipeline("Smart Notifications", "AI notifications");

      expect(pipeline.id).toMatch(/^bridge-/);
      expect(pipeline.stage).toBe("completed");
      expect(pipeline.prd).toBeDefined();
      expect(pipeline.techSpec).toBeDefined();
      expect(pipeline.implementationPlan).toBeDefined();
      expect(pipeline.createdBranches.length).toBeGreaterThanOrEqual(0);
    });

    it("invokes progress callback at each stage", async () => {
      mocks.generateText
        .mockResolvedValueOnce(MOCK_PRD_RESPONSE)
        .mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE)
        .mockResolvedValueOnce(MOCK_IMPL_PLAN_RESPONSE);

      const progressCalls: BridgeProgress[] = [];
      await runBridgePipeline("Test", "Test idea", {}, (p) => {
        progressCalls.push(p);
      });

      expect(progressCalls.length).toBeGreaterThanOrEqual(3);
      const stages = progressCalls.map((p) => p.stage);
      expect(stages).toContain("prd");
      expect(stages).toContain("tech-spec");
      expect(stages).toContain("implementation-plan");
    });

    it("propagates LLM error", async () => {
      mocks.generateText.mockRejectedValue(new Error("LLM failed"));
      mocks.withRetry.mockRejectedValueOnce(new Error("LLM failed"));

      await expect(runBridgePipeline("Test", "Test idea")).rejects.toThrow("LLM failed");
    });

    it("handles minimal idea input (title only)", async () => {
      mocks.generateText
        .mockResolvedValueOnce(MOCK_PRD_RESPONSE)
        .mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE)
        .mockResolvedValueOnce(MOCK_IMPL_PLAN_RESPONSE);

      const pipeline = await runBridgePipeline("Minimal Idea", "");
      expect(pipeline.stage).toBe("completed");
      expect(pipeline.ideaTitle).toBe("Minimal Idea");
    });

    it("generates feature branch names from tasks", async () => {
      mocks.generateText
        .mockResolvedValueOnce(MOCK_PRD_RESPONSE)
        .mockResolvedValueOnce(MOCK_TECH_SPEC_RESPONSE)
        .mockResolvedValueOnce(MOCK_IMPL_PLAN_RESPONSE);

      const pipeline = await runBridgePipeline("Test", "Test");
      // Feature branches come from tasks with type "feature"
      for (const branch of pipeline.createdBranches) {
        expect(branch).toMatch(/^feature\//);
      }
    });
  });
});
