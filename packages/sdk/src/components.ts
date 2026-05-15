/**
 * @module sdk/components
 *
 * Framework-agnostic headless UI component definitions and React component
 * factories for embedding innovation capabilities in any application.
 * Provides IdeaCard, DebateViewer, InnovationTimeline, and AngleSelector.
 */

// ---------------------------------------------------------------------------
// Headless Component Data Types
// ---------------------------------------------------------------------------

/** An idea to display in IdeaCard. */
export interface IdeaCardData {
  title: string;
  description: string;
  angle?: string;
  score?: number;
  feasibility?: "low" | "medium" | "high";
  tags?: string[];
  sourceSubject?: string;
  potentialImpact?: string;
}

/** A debate entry for DebateViewer. */
export interface DebateEntry {
  persona: string;
  position: "support" | "oppose" | "neutral";
  argument: string;
  score?: number;
  rebuttal?: string;
}

/** A timeline event for InnovationTimeline. */
export interface TimelineEvent {
  id: string;
  type: "investigation" | "ideation" | "synthesis" | "gate" | "pivot" | "shipped";
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** An innovation angle for AngleSelector. */
export interface AngleOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  selected?: boolean;
}

/** Pipeline progress for ProgressTracker. */
export interface PipelineStage {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  progress?: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Event Emitter — framework-agnostic reactivity
// ---------------------------------------------------------------------------

type EventHandler<T = unknown> = (data: T) => void;

/** Lightweight event emitter for SDK reactivity. */
export class InnovatorEventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler);
    return () => set.delete(handler as EventHandler);
  }

  emit<T = unknown>(event: string, data: T): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch {
          // Don't let one handler crash others
        }
      }
    }
  }

  off(event: string): void {
    this.handlers.delete(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Headless Component State Machines
// ---------------------------------------------------------------------------

/** IdeaCard headless state. */
export interface IdeaCardState {
  idea: IdeaCardData;
  expanded: boolean;
  voted: boolean;
  bookmarked: boolean;
}

export function createIdeaCardState(idea: IdeaCardData): IdeaCardState {
  return { idea, expanded: false, voted: false, bookmarked: false };
}

export function toggleExpand(state: IdeaCardState): IdeaCardState {
  return { ...state, expanded: !state.expanded };
}

export function toggleVote(state: IdeaCardState): IdeaCardState {
  return { ...state, voted: !state.voted };
}

export function toggleBookmark(state: IdeaCardState): IdeaCardState {
  return { ...state, bookmarked: !state.bookmarked };
}

/** DebateViewer headless state. */
export interface DebateViewerState {
  entries: DebateEntry[];
  selectedPersona: string | null;
  sortBy: "position" | "score" | "persona";
  filter: "all" | "support" | "oppose" | "neutral";
}

export function createDebateViewerState(entries: DebateEntry[]): DebateViewerState {
  return {
    entries,
    selectedPersona: null,
    sortBy: "score",
    filter: "all",
  };
}

export function filterDebateEntries(state: DebateViewerState): DebateEntry[] {
  let filtered = state.entries;
  if (state.filter !== "all") {
    filtered = filtered.filter((e) => e.position === state.filter);
  }
  if (state.selectedPersona) {
    filtered = filtered.filter((e) => e.persona === state.selectedPersona);
  }
  return [...filtered].sort((a, b) => {
    switch (state.sortBy) {
      case "score":
        return (b.score ?? 0) - (a.score ?? 0);
      case "persona":
        return a.persona.localeCompare(b.persona);
      case "position":
        return a.position.localeCompare(b.position);
    }
  });
}

/** AngleSelector headless state. */
export interface AngleSelectorState {
  angles: AngleOption[];
  maxSelections: number;
}

export function createAngleSelectorState(
  angles: AngleOption[],
  maxSelections = 8
): AngleSelectorState {
  return { angles, maxSelections };
}

export function toggleAngle(state: AngleSelectorState, angleId: string): AngleSelectorState {
  const selectedCount = state.angles.filter((a) => a.selected).length;
  const target = state.angles.find((a) => a.id === angleId);
  if (!target) return state;

  // Don't allow selecting beyond max if not already selected
  if (!target.selected && selectedCount >= state.maxSelections) {
    return state;
  }

  return {
    ...state,
    angles: state.angles.map((a) => (a.id === angleId ? { ...a, selected: !a.selected } : a)),
  };
}

export function getSelectedAngles(state: AngleSelectorState): AngleOption[] {
  return state.angles.filter((a) => a.selected);
}

/** PipelineProgress tracker state. */
export interface PipelineTrackerState {
  stages: PipelineStage[];
  startedAt?: string;
  completedAt?: string;
}

export function createPipelineTracker(stages: PipelineStage[]): PipelineTrackerState {
  return { stages, startedAt: new Date().toISOString() };
}

export function updateStageStatus(
  state: PipelineTrackerState,
  stageId: string,
  status: PipelineStage["status"],
  detail?: string
): PipelineTrackerState {
  const stages = state.stages.map((s) => (s.id === stageId ? { ...s, status, detail } : s));
  const allDone = stages.every((s) => s.status === "completed" || s.status === "failed");
  return {
    ...state,
    stages,
    completedAt: allDone ? new Date().toISOString() : undefined,
  };
}

export function getOverallProgress(state: PipelineTrackerState): number {
  if (state.stages.length === 0) return 0;
  const completed = state.stages.filter((s) => s.status === "completed").length;
  return Math.round((completed / state.stages.length) * 100);
}

// ---------------------------------------------------------------------------
// React Component Render Props (framework-agnostic type definitions)
// ---------------------------------------------------------------------------

/** Props for rendering an IdeaCard. */
export interface IdeaCardRenderProps {
  state: IdeaCardState;
  onExpand: () => void;
  onVote: () => void;
  onBookmark: () => void;
  scoreColor: string;
  feasibilityLabel: string;
}

/** Build render props for an IdeaCard. */
export function buildIdeaCardProps(
  state: IdeaCardState,
  setState: (s: IdeaCardState) => void
): IdeaCardRenderProps {
  const score = state.idea.score ?? 0;
  return {
    state,
    onExpand: () => setState(toggleExpand(state)),
    onVote: () => setState(toggleVote(state)),
    onBookmark: () => setState(toggleBookmark(state)),
    scoreColor: score >= 70 ? "green" : score >= 40 ? "orange" : "red",
    feasibilityLabel:
      state.idea.feasibility === "high"
        ? "✅ High Feasibility"
        : state.idea.feasibility === "medium"
          ? "⚠️ Medium Feasibility"
          : "❌ Low Feasibility",
  };
}

/** Props for rendering a DebateViewer. */
export interface DebateViewerRenderProps {
  state: DebateViewerState;
  filteredEntries: DebateEntry[];
  onFilterChange: (filter: DebateViewerState["filter"]) => void;
  onSortChange: (sort: DebateViewerState["sortBy"]) => void;
  onSelectPersona: (persona: string | null) => void;
  supportCount: number;
  opposeCount: number;
  neutralCount: number;
}

/** Build render props for a DebateViewer. */
export function buildDebateViewerProps(
  state: DebateViewerState,
  setState: (s: DebateViewerState) => void
): DebateViewerRenderProps {
  return {
    state,
    filteredEntries: filterDebateEntries(state),
    onFilterChange: (filter) => setState({ ...state, filter }),
    onSortChange: (sortBy) => setState({ ...state, sortBy }),
    onSelectPersona: (persona) => setState({ ...state, selectedPersona: persona }),
    supportCount: state.entries.filter((e) => e.position === "support").length,
    opposeCount: state.entries.filter((e) => e.position === "oppose").length,
    neutralCount: state.entries.filter((e) => e.position === "neutral").length,
  };
}
