import type { Investigation, AngleResult, Synthesis, AngleId } from "@innovator/core/types";

/**
 * Stages of the application lifecycle.
 *
 * Valid transitions:
 * - `input` → `investigating` (START_INVESTIGATE) or `auto` (START_AUTO)
 * - `investigating` → `explored` (INVESTIGATION_SUCCESS) or `input` (INVESTIGATION_ERROR)
 * - `explored` → `innovating` (START_INNOVATE)
 * - `innovating` → `results` (INNOVATION_SUCCESS) or `explored` (INNOVATION_ERROR)
 * - `auto` → `results` (AUTO_COMPLETE)
 * - Any stage → `input` (RESET)
 */
export type AppStage = "input" | "investigating" | "explored" | "innovating" | "results" | "auto";

/** The complete UI state managed by {@link appReducer}. */
export interface AppState {
  stage: AppStage;
  subject: string;
  investigation: Investigation | null;
  selectedAngles: AngleId[];
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
  error: string | null;
}

/** Discriminated union of all actions the reducer handles. */
export type AppAction =
  | { type: "START_INVESTIGATE"; subject: string }
  | { type: "INVESTIGATION_SUCCESS"; investigation: Investigation }
  | { type: "INVESTIGATION_ERROR"; error: string }
  | { type: "START_INNOVATE"; angles: AngleId[] }
  | { type: "INNOVATION_SUCCESS"; angleResults: AngleResult[]; synthesis: Synthesis | null }
  | { type: "INNOVATION_ERROR"; error: string }
  | { type: "START_AUTO"; subject: string }
  | { type: "AUTO_COMPLETE"; angleResults: AngleResult[]; synthesis: Synthesis | null }
  | {
      type: "RESTORE_SESSION";
      subject: string;
      angleResults: AngleResult[];
      synthesis: Synthesis | null;
    }
  | { type: "RESET" };

/** Default state: clean input form with no data. */
export const initialState: AppState = {
  stage: "input",
  subject: "",
  investigation: null,
  selectedAngles: [],
  angleResults: [],
  synthesis: null,
  error: null,
};

/**
 * Pure reducer that drives the application state machine.
 *
 * Uses an exhaustive switch with a `never` default to guarantee every
 * action type is handled at compile time.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "START_INVESTIGATE":
      return { ...initialState, stage: "investigating", subject: action.subject };
    case "INVESTIGATION_SUCCESS":
      return { ...state, stage: "explored", investigation: action.investigation, error: null };
    case "INVESTIGATION_ERROR":
      return { ...state, stage: "input", error: action.error };
    case "START_INNOVATE":
      return {
        ...state,
        stage: "innovating",
        selectedAngles: action.angles,
        angleResults: [],
        error: null,
      };
    case "INNOVATION_SUCCESS":
      return {
        ...state,
        stage: "results",
        angleResults: action.angleResults,
        synthesis: action.synthesis,
      };
    case "INNOVATION_ERROR":
      return { ...state, stage: "explored", error: action.error };
    case "START_AUTO":
      return { ...initialState, stage: "auto", subject: action.subject };
    case "AUTO_COMPLETE":
      return {
        ...state,
        stage: "results",
        angleResults: action.angleResults,
        synthesis: action.synthesis,
      };
    case "RESTORE_SESSION":
      return {
        ...initialState,
        stage: "results",
        subject: action.subject,
        angleResults: action.angleResults,
        synthesis: action.synthesis,
      };
    case "RESET":
      return initialState;
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
