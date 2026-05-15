import { describe, it, expect } from "vitest";

import {
  InnovatorEventEmitter,
  createIdeaCardState,
  toggleExpand,
  toggleVote,
  toggleBookmark,
  createDebateViewerState,
  filterDebateEntries,
  createAngleSelectorState,
  toggleAngle,
  getSelectedAngles,
  createPipelineTracker,
  updateStageStatus,
  getOverallProgress,
  buildIdeaCardProps,
  buildDebateViewerProps,
} from "../components.js";
import type { IdeaCardData, DebateEntry, AngleOption, PipelineStage } from "../components.js";

describe("InnovatorEventEmitter", () => {
  it("emits and receives events", () => {
    const emitter = new InnovatorEventEmitter();
    const received: string[] = [];
    emitter.on<string>("test", (data) => received.push(data));
    emitter.emit("test", "hello");
    emitter.emit("test", "world");
    expect(received).toEqual(["hello", "world"]);
  });

  it("unsubscribes correctly", () => {
    const emitter = new InnovatorEventEmitter();
    const received: number[] = [];
    const unsub = emitter.on<number>("count", (n) => received.push(n));
    emitter.emit("count", 1);
    unsub();
    emitter.emit("count", 2);
    expect(received).toEqual([1]);
  });

  it("handles errors in handlers gracefully", () => {
    const emitter = new InnovatorEventEmitter();
    const received: string[] = [];
    emitter.on("test", () => {
      throw new Error("boom");
    });
    emitter.on<string>("test", (d) => received.push(d));
    emitter.emit("test", "ok");
    expect(received).toEqual(["ok"]);
  });

  it("clears all handlers", () => {
    const emitter = new InnovatorEventEmitter();
    const received: string[] = [];
    emitter.on<string>("a", (d) => received.push(d));
    emitter.clear();
    emitter.emit("a", "nope");
    expect(received).toEqual([]);
  });
});

describe("IdeaCard state", () => {
  const idea: IdeaCardData = {
    title: "Test Idea",
    description: "A test idea",
    score: 75,
    feasibility: "high",
    tags: ["ai"],
  };

  it("creates initial state", () => {
    const state = createIdeaCardState(idea);
    expect(state.expanded).toBe(false);
    expect(state.voted).toBe(false);
    expect(state.bookmarked).toBe(false);
  });

  it("toggles expand", () => {
    const state = createIdeaCardState(idea);
    const expanded = toggleExpand(state);
    expect(expanded.expanded).toBe(true);
    expect(toggleExpand(expanded).expanded).toBe(false);
  });

  it("toggles vote", () => {
    const state = createIdeaCardState(idea);
    expect(toggleVote(state).voted).toBe(true);
  });

  it("toggles bookmark", () => {
    const state = createIdeaCardState(idea);
    expect(toggleBookmark(state).bookmarked).toBe(true);
  });
});

describe("DebateViewer state", () => {
  const entries: DebateEntry[] = [
    { persona: "CTO", position: "support", argument: "Good tech", score: 80 },
    { persona: "CFO", position: "oppose", argument: "Too expensive", score: 60 },
    { persona: "PM", position: "neutral", argument: "Needs research", score: 70 },
  ];

  it("creates initial state", () => {
    const state = createDebateViewerState(entries);
    expect(state.entries).toHaveLength(3);
    expect(state.filter).toBe("all");
    expect(state.sortBy).toBe("score");
  });

  it("filters by position", () => {
    const state = createDebateViewerState(entries);
    const supportState = { ...state, filter: "support" as const };
    const filtered = filterDebateEntries(supportState);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].persona).toBe("CTO");
  });

  it("sorts by score descending", () => {
    const state = createDebateViewerState(entries);
    const sorted = filterDebateEntries(state);
    expect(sorted[0].score).toBe(80);
    expect(sorted[1].score).toBe(70);
  });
});

describe("AngleSelector state", () => {
  const angles: AngleOption[] = [
    { id: "scamper", name: "SCAMPER", icon: "🔄", description: "Substitute, Combine..." },
    { id: "first-principles", name: "First Principles", icon: "🧱", description: "Break down..." },
    { id: "inversion", name: "Inversion", icon: "🔄", description: "What if opposite..." },
  ];

  it("toggles angle selection", () => {
    const state = createAngleSelectorState(angles);
    const toggled = toggleAngle(state, "scamper");
    expect(toggled.angles[0].selected).toBe(true);
    expect(getSelectedAngles(toggled)).toHaveLength(1);
  });

  it("respects max selections", () => {
    const state = createAngleSelectorState(angles, 1);
    const s1 = toggleAngle(state, "scamper");
    const s2 = toggleAngle(s1, "inversion");
    expect(getSelectedAngles(s2)).toHaveLength(1); // Still 1
  });

  it("allows deselecting even at max", () => {
    const state = createAngleSelectorState(angles, 1);
    const s1 = toggleAngle(state, "scamper");
    const s2 = toggleAngle(s1, "scamper"); // Deselect
    expect(getSelectedAngles(s2)).toHaveLength(0);
  });
});

describe("PipelineTracker state", () => {
  const stages: PipelineStage[] = [
    { id: "investigate", label: "Investigate", status: "pending" },
    { id: "generate", label: "Generate", status: "pending" },
    { id: "synthesize", label: "Synthesize", status: "pending" },
  ];

  it("creates tracker with start time", () => {
    const state = createPipelineTracker(stages);
    expect(state.startedAt).toBeDefined();
    expect(state.stages).toHaveLength(3);
  });

  it("updates stage status", () => {
    const state = createPipelineTracker(stages);
    const updated = updateStageStatus(state, "investigate", "completed");
    expect(updated.stages[0].status).toBe("completed");
  });

  it("computes overall progress", () => {
    let state = createPipelineTracker(stages);
    expect(getOverallProgress(state)).toBe(0);
    state = updateStageStatus(state, "investigate", "completed");
    expect(getOverallProgress(state)).toBe(33);
    state = updateStageStatus(state, "generate", "completed");
    expect(getOverallProgress(state)).toBe(67);
    state = updateStageStatus(state, "synthesize", "completed");
    expect(getOverallProgress(state)).toBe(100);
    expect(state.completedAt).toBeDefined();
  });
});

describe("buildIdeaCardProps", () => {
  it("builds render props with score color", () => {
    const idea: IdeaCardData = { title: "Test", description: "D", score: 75, feasibility: "high" };
    const state = createIdeaCardState(idea);
    let current = state;
    const props = buildIdeaCardProps(state, (s) => {
      current = s;
    });
    expect(props.scoreColor).toBe("green");
    expect(props.feasibilityLabel).toContain("High");
    props.onExpand();
    expect(current.expanded).toBe(true);
  });
});

describe("buildDebateViewerProps", () => {
  it("builds render props with counts", () => {
    const entries: DebateEntry[] = [
      { persona: "CTO", position: "support", argument: "Good" },
      { persona: "CFO", position: "oppose", argument: "Bad" },
    ];
    const state = createDebateViewerState(entries);
    let current = state;
    const props = buildDebateViewerProps(state, (s) => {
      current = s;
    });
    expect(props.supportCount).toBe(1);
    expect(props.opposeCount).toBe(1);
    props.onFilterChange("support");
    expect(current.filter).toBe("support");
  });
});
