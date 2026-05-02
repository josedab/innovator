// Client-safe exports — no Node.js or Copilot SDK dependencies.
// Use this subpath (`@innovator/core/types`) in client components.

export * from "./types.js";
export { ANGLES, getAngleById } from "./innovation/angles.js";
export type {
  TrackedIdea,
  ExternalStatus,
  TrackerPlatform,
  TrackerDashboard,
} from "./tracker/index.js";
export type { AngleChain, AngleChainStep, ChainProgress } from "./chaining/index.js";
export type {
  FeedbackRating,
  IdeaFeedback,
  AngleQualityScore,
  FeedbackSummary,
} from "./feedback/index.js";
export type { Depth, DepthConfig } from "./depth/index.js";
export type { SupportedLanguage, LanguageConfig } from "./i18n/index.js";
