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
export type {
  CanvasPosition,
  CanvasSize,
  CanvasNode,
  CanvasEdge,
  CanvasCluster,
  CanvasAnnotation,
  InnovationCanvas,
} from "./canvas/index.js";
export type {
  OutcomeStage,
  ExternalLinkType,
  ExternalLink,
  RevenueMetric,
  StageTransition,
  OutcomeRecord as ROIOutcomeRecord,
  ROISummary,
  ROITimeSeriesPoint,
  ROIDashboard,
} from "./outcome-tracking/index.js";
export type {
  CoachMessageRole,
  CoachSessionStatus,
  CoachMessage,
  CoachDomain,
  CoachSession,
} from "./coaching/coach-session.js";
export type {
  FederationPatternType,
  FederationPattern,
  FederationNode,
  PeerNode,
  NetworkTrend,
  NetworkDashboard,
} from "./federation/index.js";
export type {
  SprintTemplateId,
  SprintTemplate,
  FacilitatedSprint,
  SprintParticipant,
  SprintPhaseConfig,
} from "./sprint/facilitation.js";
export type {
  KnowledgeEntity,
  RegulatoryItem,
  TrendItem,
  ScoringRubric,
  PersonaPrompt,
  KnowledgePack,
} from "./knowledge-packs/index.js";
export type { ApiEndpoint, SdkLanguage } from "./api-gateway/api-spec.js";
export type {
  LifecycleStage,
  EvidenceType,
  EvidenceItem,
  LifecycleIdea,
  KanbanColumn,
  KanbanBoard,
} from "./lifecycle/index.js";
export type {
  MultiModalInputType,
  MultiModalInput,
  ProcessedInput,
  MultiModalContext,
} from "./vision/multi-modal.js";
export type {
  GuardrailType,
  GuardrailSeverity,
  Guardrail,
  GuardrailResult,
  RegulatoryCheck,
  BiasCheck,
  ComplianceAuditEntry,
  ComplianceDashboard,
} from "./compliance/governance.js";
export type {
  ChallengeStatus,
  CommunitySubmission,
  CommunityChallenge,
  Badge,
  CommunityLeaderboardEntry,
} from "./gamification/challenges.js";
