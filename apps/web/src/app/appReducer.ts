import type { Investigation, AngleResult, Synthesis, AngleId } from "@innovator/core/types";

export type AppStage = "input" | "investigating" | "explored" | "innovating" | "results" | "auto";

export interface AppState {
  stage: AppStage;
  subject: string;
  investigation: Investigation | null;
  selectedAngles: AngleId[];
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
  error: string | null;
}

export type AppAction =
  | { type: "START_INVESTIGATE"; subject: string }
  | { type: "INVESTIGATION_SUCCESS"; investigation: Investigation }
  | { type: "INVESTIGATION_ERROR"; error: string }
  | { type: "START_INNOVATE"; angles: AngleId[] }
  | { type: "INNOVATION_SUCCESS"; angleResults: AngleResult[]; synthesis: Synthesis | null }
  | { type: "INNOVATION_ERROR"; error: string }
  | { type: "START_AUTO"; subject: string }
  | { type: "AUTO_COMPLETE"; angleResults: AngleResult[]; synthesis: Synthesis | null }
  | { type: "RESET" };

export const initialState: AppState = {
  stage: "input",
  subject: "",
  investigation: null,
  selectedAngles: [],
  angleResults: [],
  synthesis: null,
  error: null,
};

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
    case "RESET":
      return initialState;
    default:
      return state;
  }
}
