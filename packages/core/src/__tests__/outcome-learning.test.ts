import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  createOutcome,
  tagIdeaOutcome,
  getIdeaOutcome,
  listIdeaOutcomes,
  updateIdeaOutcome,
  getOutcomesByStatus,
  clearIdeaOutcomes,
  clearOutcomes,
} from "../outcome-tracking/index.js";

describe("outcome tracking and learning loop enhancements", () => {
  let learningLoop: typeof import("../learning-loop/index.js");
  let testHome = "";

  beforeEach(async () => {
    clearOutcomes();
    clearIdeaOutcomes();
    vi.resetModules();
    testHome = mkdtempSync(join(process.cwd(), ".learning-loop-home-"));
    vi.doMock("node:os", () => ({ homedir: () => testHome }));
    learningLoop = await import("../learning-loop/index.js");
    learningLoop.clearLearningData();
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    vi.doUnmock("node:os");
  });

  it("tags and retrieves idea outcomes for existing ROI outcomes", () => {
    const outcome = createOutcome({ ideaTitle: "AI assistant for support" });
    const ideaOutcome = tagIdeaOutcome({
      outcomeId: outcome.id,
      status: "implemented",
      impactMetrics: { revenue: 12000 },
      lessonsLearned: ["Pilot with a narrow user segment first."],
    });

    expect(getIdeaOutcome(ideaOutcome.id)).toEqual(ideaOutcome);
    expect(ideaOutcome.timeline.completedAt).toBeTruthy();
    expect(listIdeaOutcomes({ outcomeId: outcome.id })).toHaveLength(1);
  });

  it("updates idea outcomes and returns counts by status", () => {
    const one = createOutcome({ ideaTitle: "Workflow automations" });
    const two = createOutcome({ ideaTitle: "Pricing experiments" });

    const first = tagIdeaOutcome({ outcomeId: one.id, status: "in-progress" });
    tagIdeaOutcome({
      outcomeId: two.id,
      status: "pivoted",
      pivotReason: "Customer interviews revealed a different pain point.",
    });

    const updated = updateIdeaOutcome(first.id, {
      status: "failed",
      lessonsLearned: ["Adoption stalled without onboarding."],
    });

    expect(updated?.status).toBe("failed");
    expect(getOutcomesByStatus()).toMatchObject({ failed: 1, pivoted: 1, implemented: 0 });
  });

  it("computes angle effectiveness and top angles for a domain", async () => {
    learningLoop.adjustAngleWeights("AI in healthcare", [
      { angleId: "scamper", success: true },
      { angleId: "scamper", success: true },
      { angleId: "constraints", success: false },
    ]);

    const effectiveness = learningLoop.getAngleEffectiveness("AI in healthcare");

    expect(effectiveness[0]).toMatchObject({ angleId: "scamper", sampleSize: 2 });
    expect(effectiveness[0].score).toBeGreaterThan(effectiveness[1].score);
    expect(learningLoop.getTopAnglesForDomain("AI in healthcare", 1)).toEqual(["scamper"]);
  });
});
