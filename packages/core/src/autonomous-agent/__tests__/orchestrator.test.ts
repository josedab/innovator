import { describe, expect, it } from "vitest";
import {
  completeStep,
  createInvestigationPlan,
  decomposeObjective,
  getNextStep,
  planToMarkdown,
  selectAnglesForStep,
} from "../planning.js";
import {
  assessConfidence,
  generateStrategyDocument,
  strategyDocToExecutiveBrief,
  strategyDocToMarkdown,
} from "../strategy-report.js";
import type { AutonomousRun } from "../types.js";

describe("autonomous orchestrator", () => {
  it("decomposes objectives into investigation steps with angles", () => {
    const steps = decomposeObjective(
      "Design and validate an AI onboarding assistant for enterprise customers"
    );
    const angles = selectAnglesForStep({
      title: "Map customer demand",
      description: "Understand user needs and market context",
    });

    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps[0]?.status).toBe("pending");
    expect(steps[0]?.angles.length).toBeGreaterThan(0);
    expect(angles).toContain("perspectives");
  });

  it("creates plans, selects the next step, and completes work", () => {
    let plan = createInvestigationPlan(
      "Design and validate an AI onboarding assistant for enterprise customers"
    );

    let iterations = 0;
    while (iterations < 20) {
      const next = getNextStep(plan);
      if (!next) break;
      plan = completeStep(plan, next.id, `Completed ${next.title}`);
      iterations += 1;
    }

    const markdown = planToMarkdown(plan);

    expect(plan.status).toBe("completed");
    expect(plan.steps.every((step) => step.status === "completed")).toBe(true);
    expect(markdown).toContain("# Investigation Plan");
    expect(markdown).toContain("## Steps");
  });

  it("generates confidence-scored strategy documents", () => {
    const run: AutonomousRun = {
      id: "run-1",
      rootSubject: "AI onboarding assistant for enterprise customers",
      status: "completed",
      strategy: "adaptive",
      branches: [
        {
          id: "branch-1",
          parentId: null,
          subject: "Customer onboarding friction",
          depth: 0,
          status: "completed",
          summary: "Teams lose time collecting the same information repeatedly.",
          ideas: [
            {
              title: "Clinical Intake Copilot",
              description: "Guide onboarding teams through dynamic intake workflows.",
              potentialImpact: "Faster time to value",
              implementationHint: "Start with CRM-triggered intake playbooks",
              score: 88,
            },
            {
              title: "Customer Readiness Score",
              description: "Predict onboarding risk and trigger interventions.",
              potentialImpact: "Reduce churn during setup",
              implementationHint: "Combine setup milestones with support signals",
              score: 79,
            },
          ],
          subBranches: ["branch-2"],
          createdAt: "2024-04-16T10:00:00.000Z",
          completedAt: "2024-04-16T12:00:00.000Z",
        },
        {
          id: "branch-2",
          parentId: "branch-1",
          subject: "Implementation constraints",
          depth: 1,
          status: "completed",
          summary: "Security review and systems integration are the main blockers.",
          ideas: [
            {
              title: "Secure Workflow Templates",
              description: "Offer pre-approved onboarding workflows for regulated teams.",
              potentialImpact: "Shorter compliance review cycles",
              implementationHint: "Bundle policy defaults with workspace templates",
              score: 82,
            },
          ],
          subBranches: [],
          createdAt: "2024-04-16T12:00:00.000Z",
          completedAt: "2024-04-16T14:00:00.000Z",
        },
      ],
      decisions: [
        {
          id: "decision-1",
          branchId: "branch-1",
          action: "branch",
          reasoning: "Break onboarding into user pain and delivery feasibility.",
          newSubjects: ["Implementation constraints"],
          timestamp: "2024-04-16T11:00:00.000Z",
        },
      ],
      portfolio: {
        id: "portfolio-1",
        title: "Enterprise Onboarding Portfolio",
        summary: "Automation and compliance-aware delivery were the dominant themes.",
        topIdeas: [
          {
            title: "Clinical Intake Copilot",
            description: "Guide onboarding teams through dynamic intake workflows.",
            sourceSubject: "Customer onboarding friction",
            sourceBranchId: "branch-1",
            score: 88,
            feasibility: "high",
          },
          {
            title: "Secure Workflow Templates",
            description: "Offer pre-approved onboarding workflows for regulated teams.",
            sourceSubject: "Implementation constraints",
            sourceBranchId: "branch-2",
            score: 82,
            feasibility: "medium",
          },
        ],
        themes: ["automation", "compliance"],
        explorationMap: [
          { branchId: "branch-1", subject: "Customer onboarding friction", depth: 0, ideaCount: 2 },
          { branchId: "branch-2", subject: "Implementation constraints", depth: 1, ideaCount: 1 },
        ],
        totalBranches: 2,
        totalIdeas: 3,
        durationMs: 7200000,
        createdAt: "2024-04-16T15:00:00.000Z",
      },
      config: {
        maxBranches: 6,
        maxDepth: 3,
        pruneThreshold: 25,
      },
      startedAt: "2024-04-16T10:00:00.000Z",
      updatedAt: "2024-04-16T15:00:00.000Z",
      completedAt: "2024-04-16T15:00:00.000Z",
    };

    const confidence = assessConfidence(run);
    const doc = generateStrategyDocument(run);
    const markdown = strategyDocToMarkdown(doc);
    const brief = strategyDocToExecutiveBrief(doc);

    expect(confidence.overall).toBeGreaterThan(0.5);
    expect(doc.topRecommendations[0]?.title).toBe("Clinical Intake Copilot");
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Top Recommendations");
    expect(brief).toContain("# Executive Brief");
    expect(brief).toContain("Clinical Intake Copilot");
  });
});
