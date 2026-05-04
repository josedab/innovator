/** Core domain types — Investigation, AngleResult, Synthesis, PipelineProgress, and all shared interfaces. */
export * from "./types.js";

/** GitHub Copilot LLM client — text generation, streaming, and JSON extraction. */
export {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "./copilot/client.js";

/** Options for {@link generateText} and {@link generateTextStream}. */
export type { GenerateOptions } from "./copilot/client.js";

/** Innovation engine — angles, investigation, generation, synthesis, custom angles, and angle packs. */
export {
  ANGLES,
  getAngleById,
  investigate,
  generateForAngle,
  runAutoPipeline,
  loadCustomAngles,
  addCustomAngle,
  removeCustomAngle,
  getCustomAngle,
  updateCustomAngle,
  exportAnglePack,
  importAnglePack,
  buildCustomAnglePrompt,
  runComparativePipeline,
  buildComparativeSynthesisPrompt,
  runParallelInvestigation,
} from "./innovation/index.js";
/** Types for comparative pipeline runs across multiple models. */
export type {
  ComparativeProgress,
  ComparativeSynthesis,
  ParallelInvestigationResult,
  CompetitiveMap,
} from "./innovation/index.js";

/** Prompt builders for investigation and synthesis LLM calls. */
export { buildInvestigationPrompt, buildSynthesisPrompt } from "./prompts/investigation.js";
/** Prompt sanitization — defense against prompt injection attacks. */
export { sanitizeUserInput, wrapUserInput, sanitizeLlmOutput } from "./prompts/sanitize.js";

/** Retry utility with exponential backoff for unreliable async operations. */
export { withRetry } from "./copilot/retry.js";
/** Configuration options for {@link withRetry}. */
export type { RetryOptions } from "./copilot/retry.js";

/** Plugin system — register, discover, and load angle/exporter/visualizer plugins. */
export {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  getPluginsByType,
  clearPlugins,
  loadPlugin,
} from "./plugins/index.js";

/** Domain presets — pre-configured angle sets for common innovation domains. */
export {
  BUILT_IN_PRESETS,
  getPresets,
  getPresetById,
  getPresetsByCategory,
  getPresetsByTag,
} from "./presets/index.js";

/** Session history — save, query, and compare innovation sessions. */
export {
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  querySessions,
  compareSessions,
} from "./history/index.js";

/** Export — render sessions as Markdown, JSON, GitHub Issues, PowerPoint, Jira, Confluence, Notion, and Google Slides. */
export {
  exportToMarkdown,
  exportToJson,
  generateGitHubIssueBody,
  exportToClipboard,
  exportToPowerPoint,
  exportToJira,
  exportToConfluence,
  exportToNotion,
  exportToGoogleSlides,
  getAvailableFormats,
} from "./export/index.js";
export type { ExportResult, IntegrationAdapter } from "./export/index.js";

/** LLM model registry — capabilities, smart routing, and model comparison. */
export {
  getModelRegistry,
  registerModel,
  getModelCapability,
  getSmartRouting,
  compareModels,
  clearCustomModels,
} from "./models/index.js";

/** Visualization — build idea relationship graphs with nodes and edges. */
export { buildIdeaGraph, getAngleColor } from "./visualization/index.js";
export type { IdeaNode, IdeaEdge, IdeaGraph } from "./visualization/index.js";

/** Copilot Extension — slash commands, chat formatters, and agent manifests for GitHub Copilot integration. */
export {
  parseSlashCommand,
  formatInvestigationForChat,
  formatAngleResultsForChat,
  formatSynthesisForChat,
  formatProgressForChat,
  formatAnglesForChat,
  formatPresetsForChat,
  formatHelpForChat,
  GITHUB_APP_MANIFEST,
  getCopilotAgentManifest,
  handleCopilotRequest,
  formatWithCollapsible,
  buildStreamingResponse,
} from "./extension/index.js";
export type {
  SlashCommand,
  ChatResponse,
  CopilotAgentConfig,
  CopilotCommandDef,
  CopilotAgentContext,
} from "./extension/index.js";

/** Collaborative sessions — real-time multi-user brainstorming with voting and merging. */
export {
  createSession as createCollaborativeSession,
  findSessionByCode,
  getCollaborativeSession,
  joinSession,
  leaveSession,
  assignAngles,
  startSession,
  submitIdea,
  voteForIdea,
  addComment,
  mergeIdeas,
  completeSession,
  onSessionEvent,
  getRankedIdeas,
  deleteCollaborativeSession,
  clearAllSessions,
} from "./collaboration/index.js";

/** Idea scoring — novelty, feasibility, impact scoring and priority quadrant classification. */
export {
  scoreIdeas,
  computePriorityScore,
  getQuadrant,
  rankIdeas,
  IdeaScoreSchema,
  ScoringResultSchema,
  TIME_TO_IMPLEMENT_ORDER,
} from "./scoring/index.js";
export type { IdeaScore, ScoringResult } from "./scoring/index.js";

/** Interactive refinement conversations — iterative deepening with branching exploration trees. */
export {
  createConversation,
  getConversation,
  deleteConversation,
  listConversations,
  refineConversation,
  clearConversations,
  createExplorationTree,
  getExplorationTree,
  drillDown,
  getExplorationPath,
  getNodeBranches,
  ConversationMessageSchema,
  RefinementResponseSchema,
  ExplorationNodeSchema,
  ExplorationTreeSchema,
} from "./conversation/index.js";
export type {
  ConversationMessage,
  ConversationContext,
  RefinementResponse,
  ExplorationNode,
  ExplorationTree,
} from "./conversation/index.js";

/** LLM provider abstraction — Copilot, OpenAI, Anthropic, and Ollama backends. */
export {
  CopilotProvider,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  loadConfig,
  saveConfig,
  registerProvider,
  getProvider,
  getActiveProvider,
  setActiveProvider,
  listProviders,
  initializeProviders,
  clearProviders,
  InnovatorConfigSchema,
} from "./providers/index.js";
export type {
  LLMProvider,
  LLMGenerateOptions,
  LLMModelInfo,
  InnovatorConfig,
} from "./providers/index.js";

/** Workspaces — team-scoped containers for sessions, presets, and shared angles. */
export {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listWorkspaces,
  listUserWorkspaces,
  addMember,
  removeMember,
  updateMemberRole,
  hasPermission,
  addSessionToWorkspace,
  searchWorkspaceSessions,
  getActivityFeed,
  sharePreset,
  shareAngle,
  WorkspaceSchema,
  WorkspaceMemberSchema,
  ActivityEventSchema,
} from "./workspaces/index.js";
export type { Workspace, WorkspaceMember, MemberRole, ActivityEvent } from "./workspaces/index.js";

/** Artifact generation — PRDs, tech specs, pitch decks, and other structured documents from ideas. */
export {
  generateArtifact,
  generateArtifactStream,
  artifactToMarkdown,
  artifactToGitHubIssue,
  getArtifactTypeLabel,
  ArtifactSchema,
  ARTIFACT_TYPES,
} from "./artifacts/index.js";
export type { Artifact, ArtifactType, ArtifactContext } from "./artifacts/index.js";

/** Knowledge graph — ingest investigations and query cross-subject entity relationships. */
export {
  ingestInvestigation,
  queryRelatedSubjects,
  getKnowledgeGraph,
  getGraphStats,
  filterGraphNodes,
  clearKnowledgeGraph,
  EntityNodeSchema,
  RelationshipEdgeSchema,
  KnowledgeGraphSchema,
} from "./knowledge-graph/index.js";
export type { EntityNode, RelationshipEdge, KnowledgeGraph } from "./knowledge-graph/index.js";

/** Benchmark — evaluate and compare innovation quality across LLM models. */
export {
  runBenchmark,
  evaluateAngleResult,
  benchmarkToMarkdown,
  EVALUATION_CRITERIA,
  IdeaEvaluationSchema,
  ModelBenchmarkSchema,
  BenchmarkReportSchema,
} from "./benchmark/index.js";
export type {
  IdeaEvaluation,
  ModelBenchmark,
  BenchmarkReport,
  EvaluationCriterion,
} from "./benchmark/index.js";

/** Content extractors — pull context from URLs, files, and code repositories. */
export {
  extractContent,
  buildSubjectFromContent,
  registerExtractor,
  UrlExtractor,
  FileExtractor,
  CodeRepoExtractor,
} from "./extractors/index.js";
export type { ExtractedContent, ExtractorOptions, ContentExtractor } from "./extractors/index.js";

/** Idea validation — patent, market, feasibility, market sizing, and regulatory checks. */
export {
  validateIdea,
  validateIdeas,
  validateComprehensive,
  registerValidator,
  unregisterValidator,
  listValidators,
  clearValidators,
  PatentValidator,
  MarketValidator,
  FeasibilityValidator,
  MarketSizingValidator,
  RegulatoryValidator,
  ValidationCheckSchema,
  ValidationResultSchema,
  ValidationScorecardSchema,
  ComprehensiveValidationSchema,
} from "./validation/index.js";
export type {
  ValidationCheck,
  ValidationResult,
  ValidationScorecard,
  IdeaValidator,
  ComprehensiveValidation,
} from "./validation/index.js";

/** Replay and A/B testing — record, replay, and compare pipeline runs. */
export {
  startRunRecord,
  recordPrompt,
  completeRunRecord,
  getRunRecord,
  listRunRecords,
  deleteRunRecord,
  clearRunRecords,
  setRecordingEnabled,
  isRecordingEnabled,
  previewReplay,
  replayRun,
  compareRuns,
  comparisonToMarkdown,
  buildTimeline,
  getSnapshot,
  createBranchFromSnapshot,
  forkRun,
  listBranchesForRun,
  getExplorationTree as getReplayExplorationTree,
  timeTravel,
  clearTimeline,
  PromptRecordSchema,
  RunRecordSchema,
  RunComparisonSchema,
  TimelineSnapshotSchema,
  TimelineBranchSchema,
} from "./replay/index.js";
export type { PromptRecord, RunRecord, RunComparison, ReplayOverrides, TimelineSnapshot, TimelineBranch } from "./replay/index.js";

/** Audience-adaptive output — transform results for executive, technical, pitch, or research audiences. */
export {
  transformForAudience,
  transformForAllAudiences,
  OUTPUT_MODES,
  OUTPUT_MODE_DEFINITIONS,
  OutputModeSchema,
  getOutputMode,
  AudienceOutputSchema,
} from "./audience/index.js";
export type { OutputMode, OutputModeDefinition, AudienceOutput } from "./audience/index.js";

/** Idea dependency graph — map prerequisite, synergy, and conflict relationships between ideas. */
export {
  buildIdeaDependencyGraph,
  dependencyGraphToMarkdown,
  dependencyGraphToMermaid,
  IdeaDependencyNodeSchema,
  IdeaDependencyEdgeSchema,
  IdeaDependencyGraphSchema,
  RelationshipTypeSchema,
} from "./dependency-graph/index.js";
export type {
  IdeaDependencyNode,
  IdeaDependencyEdge,
  IdeaDependencyGraph,
  RelationshipType,
} from "./dependency-graph/index.js";

/** Market signals — fetch trends from Product Hunt, Hacker News, Google Trends, arXiv, and patent databases. */
export {
  fetchMarketSignals,
  buildMarketSignalContext,
  registerSignalProvider,
  unregisterSignalProvider,
  listSignalProviders,
  getAvailableProviders,
  clearSignalProviders,
  ProductHuntProvider,
  HackerNewsProvider,
  GoogleTrendsProvider,
  ArxivProvider,
  PatentFilingProvider,
  MarketSignalSchema,
  MarketSignalReportSchema,
} from "./market-signals/index.js";
export type {
  MarketSignal,
  MarketSignalReport,
  MarketSignalProvider,
} from "./market-signals/index.js";

/** Sprint mode — time-boxed innovation sprints with phased progression and retrospectives. */
export {
  createSprint,
  getSprint,
  listSprints,
  deleteSprint,
  clearSprints,
  startSprint,
  pauseSprint,
  canAdvancePhase,
  advancePhase,
  updateSprintData,
  getPhasePrompt,
  generateRetrospective,
  getProgressionSuggestions,
  SPRINT_PHASES,
  SPRINT_PHASE_DEFINITIONS,
  SprintPhaseSchema,
  SprintStatusSchema,
  SprintCheckpointSchema,
  SprintRetrospectiveSchema,
  SprintSchema,
} from "./sprint/index.js";
export type {
  Sprint,
  SprintPhase,
  SprintStatus,
  SprintCheckpoint,
  SprintRetrospective,
  SprintPhaseDefinition,
} from "./sprint/index.js";

/** Idea deduplication — cluster and merge semantically similar ideas. */
export {
  deduplicateIdeas,
  EmbeddedIdeaSchema,
  IdeaClusterSchema,
  DeduplicationResultSchema,
} from "./deduplication/index.js";
export type {
  EmbeddedIdea,
  IdeaCluster,
  DeduplicationResult,
  DeduplicationConfig,
} from "./deduplication/index.js";

/** Sharing — publish, fork, and share investigations via unique URLs. */
export {
  shareInvestigation,
  getSharedInvestigation,
  listSharedInvestigations,
  deleteSharedInvestigation,
  clearSharedInvestigations,
  updateSharedInvestigation,
  forkInvestigation,
  buildShareUrl,
  SharedInvestigationSchema,
  ShareOptionsSchema,
  ForkResultSchema,
} from "./sharing/index.js";
export type { SharedInvestigation, ShareOptions, ForkResult } from "./sharing/index.js";

/** Voice interface — parse voice commands and build narration segments for TTS. */
export {
  parseVoiceCommand,
  buildNarrationSegments,
  getVoiceCommandHelp,
  registerSTTProvider,
  registerTTSProvider,
  getSTTProvider,
  getTTSProvider,
  listSTTProviders,
  listTTSProviders,
  clearVoiceProviders,
  VOICE_COMMANDS,
  VoiceCommandSchema,
  VoiceConfigSchema,
  VoiceTranscriptSchema,
  ParsedVoiceCommandSchema,
  NarrationSegmentSchema,
} from "./voice/index.js";
export type {
  VoiceCommand,
  VoiceConfig,
  VoiceTranscript,
  ParsedVoiceCommand,
  NarrationSegment,
  SpeechRecognitionProvider,
  TextToSpeechProvider,
} from "./voice/index.js";

/** Compliance and IP guard rails — screen ideas for regulatory and intellectual property risks. */
export {
  screenIdea,
  screenIdeas,
  getIndustryRegulations,
  listRegulatedIndustries,
  complianceReportToMarkdown,
  INDUSTRY_REGULATIONS,
  IPRiskIndicatorSchema,
  RegulatoryConstraintSchema,
  IPScreeningResultSchema,
  IPComplianceReportSchema,
  RiskLevelSchema,
} from "./compliance/index.js";
export type {
  IPRiskIndicator,
  RegulatoryConstraint,
  IPScreeningResult,
  IPComplianceReport,
  RiskLevel,
} from "./compliance/index.js";

/** Depth tiers — shallow, standard, and deep investigation configurations with sub-topic analysis. */
export {
  DepthSchema,
  DEPTH_CONFIGS,
  getDepthConfig,
  buildShallowInvestigationPrompt,
  buildSubTopicPrompt,
  buildDeepDivePrompt,
  buildDeepSynthesisPrompt,
  SubTopicSchema,
  DeepDiveResultSchema,
  suggestDepth,
} from "./depth/index.js";
export type { Depth, DepthConfig, SubTopicResult, DeepDiveResult } from "./depth/index.js";

/** Angle chaining — compose multi-step angle sequences for deeper innovation. */
export {
  DEFAULT_CHAINS,
  AngleChainSchema,
  AngleChainStepSchema,
  runChain,
  getChainById,
  listChains,
} from "./chaining/index.js";
export type { AngleChain, AngleChainStep, ChainProgress } from "./chaining/index.js";

/** Feedback — collect and aggregate idea quality ratings to improve angle selection. */
export {
  submitFeedback,
  loadAllFeedback,
  getSessionFeedback,
  computeAngleScores,
  getFeedbackSummary,
  buildFeedbackHint,
  FeedbackRatingSchema,
  IdeaFeedbackSchema,
} from "./feedback/index.js";
export type {
  FeedbackRating,
  IdeaFeedback,
  AngleQualityScore,
  FeedbackSummary,
} from "./feedback/index.js";

/** Internationalization — language detection and prompt localization. */
export {
  detectLanguage,
  localizePrompt,
  listLanguages,
  getLanguageConfig,
  SUPPORTED_LANGUAGES,
  SupportedLanguageSchema,
} from "./i18n/index.js";
export type { SupportedLanguage, LanguageConfig } from "./i18n/index.js";

/** Idea fitness tracker — track ideas through external platforms (Jira, Linear, GitHub) with status sync. */
export {
  trackIdea,
  loadTrackedIdeas,
  updateTrackedIdeaStatus,
  getTrackedIdea,
  buildDashboard,
  TrackedIdeaSchema,
  ExternalStatusSchema,
  TrackerPlatformSchema,
} from "./tracker/index.js";
export type {
  TrackedIdea,
  ExternalStatus,
  TrackerPlatform,
  TrackerDashboard,
} from "./tracker/index.js";

/** Offline / local-first — Ollama detection, network status, and recommended local models. */
export {
  detectOllama,
  checkNetworkStatus,
  getOfflineStatus,
  getRecommendedModel,
  RECOMMENDED_MODELS,
} from "./offline/index.js";
export type { OllamaStatus, OfflineStatus, RecommendedModel } from "./offline/index.js";

/** RAG / knowledge grounding — document loading, chunking, embedding, similarity search, and source connectors. */
export {
  KnowledgeBase,
  loadDocument,
  chunkText,
  generateEmbedding,
  cosineSimilarity,
  GitHubConnector,
  ConfluenceConnector,
  NotionConnector,
  LocalFileConnector,
  registerConnector,
  listConnectors,
  syncConnector,
  removeConnector,
  buildContextInjection,
  clearConnectors,
  DocumentTypeSchema,
  DocumentChunkSchema,
  KnowledgeDocumentSchema,
  KnowledgeBaseConfigSchema,
  ConnectorTypeSchema,
  ConnectorConfigSchema,
  ConnectorStatusSchema,
  DEFAULT_CHUNKING_OPTIONS,
} from "./rag/index.js";
export type {
  DocumentType,
  DocumentChunk,
  KnowledgeDocument,
  KnowledgeBaseConfig,
  SearchResult,
  ChunkingOptions,
  ConnectorType,
  ConnectorConfig,
  ConnectorStatus,
  KnowledgeConnector,
} from "./rag/index.js";

/** Cost tracking and budget management — estimate, track, and cap LLM spend. */
export {
  CostTracker,
  getCostTracker,
  resetCostTracker,
  estimateTokenCount,
  setModelPricing,
  getModelPricing,
  listModelPricing,
  estimateCost,
  TokenUsageSchema,
} from "./cost/index.js";
export type { TokenUsage, CostSummary, BudgetConfig, ModelPricing } from "./cost/index.js";

/** Deep research — multi-step research agent that iteratively investigates sub-questions. */
export {
  ResearchAgent,
  deepInvestigate,
  ResearchDepthSchema,
  ResearchFindingSchema,
  ResearchStepSchema,
  ResearchBriefSchema,
  DEPTH_STEP_LIMITS,
} from "./research/index.js";
export type {
  ResearchDepth,
  ResearchFinding,
  ResearchStep,
  ResearchBrief,
  ResearchProgress,
  ResearchConfig,
} from "./research/index.js";

/** Portfolio — idea lifecycle management with stage transitions and portfolio-level metrics. */
export {
  addPortfolioItem,
  getPortfolioItem,
  transitionItem,
  updatePortfolioItem,
  deletePortfolioItem,
  listPortfolioItems,
  getPortfolioMetrics,
  generatePortfolioInsights,
  buildDashboardData,
} from "./portfolio/index.js";
export type { InnovationDashboardData } from "./portfolio/index.js";
export {
  IdeaLifecycleStageSchema,
  StatusTransitionSchema,
  PortfolioItemSchema,
} from "./portfolio/types.js";
export type {
  IdeaLifecycleStage,
  StatusTransition,
  PortfolioItem,
  PortfolioMetrics,
  PortfolioInsight,
} from "./portfolio/types.js";

/** Theming / white-label — customizable themes with CSS variables and prompt preambles. */
export {
  loadTheme,
  clearThemeCache,
  setTheme,
  themeToCssVars,
  getPromptPreamble,
} from "./theming/index.js";
export { ThemeConfigSchema, DEFAULT_THEME } from "./theming/types.js";
export type { ThemeConfig } from "./theming/types.js";

/** Event bus, webhooks, and workflow automation — publish/subscribe pipeline events with webhook delivery, dead-letter queue, and automation chains. */
export {
  EventBus,
  getEventBus,
  resetEventBus,
  WebhookManager,
  EventTypeSchema,
  PipelineEventSchema,
  WebhookConfigSchema,
  createAutomationRule,
  getAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
  createHighScoreChain,
  createPipelineNotificationChain,
  clearAutomation,
  getWebhookTemplate,
  listWebhookTemplates,
  WEBHOOK_TEMPLATES,
  SLACK_TEMPLATE,
  GITHUB_ISSUES_TEMPLATE,
  JIRA_TEMPLATE,
  EMAIL_TEMPLATE,
  TriggerConditionSchema,
  ActionTypeSchema,
  AutomationActionSchema,
  AutomationRuleSchema,
  AutomationLogEntrySchema,
} from "./events/index.js";
export type {
  EventType,
  PipelineEvent,
  WebhookConfig,
  WebhookDelivery,
  DeadLetterEntry,
  TriggerCondition,
  ActionType,
  AutomationAction,
  AutomationRule,
  AutomationLogEntry,
  WebhookTemplate,
} from "./events/index.js";

/** Analytics — track usage events, generate summaries, and surface insights. */
export {
  trackEvent,
  readEvents,
  generateSummary,
  generateInsights,
  clearAnalytics,
  ANALYTICS_EVENT_TYPES,
  AnalyticsEventSchema,
} from "./analytics/index.js";
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsSummary,
  AnalyticsInsight,
} from "./analytics/index.js";

/** Coaching — AI coach that asks clarifying questions, detects assumptions, and recommends pivots. */
export {
  generateClarificationQuestions,
  generateMidAngleIntervention,
  generatePostSynthesisDeepening,
  detectAssumptions,
  recommendPivots,
  CoachPersonalitySchema,
  CoachQuestionSchema,
  AssumptionSchema,
  PivotRecommendationSchema,
  CoachInterventionSchema,
} from "./coaching/index.js";
export type {
  CoachPersonality,
  CoachQuestion,
  Assumption,
  PivotRecommendation,
  CoachIntervention,
  CoachConfig,
} from "./coaching/index.js";

/** Smart angle recommendation — classify subjects and recommend optimal angle sets. */
export {
  classifySubject,
  recommendAngles,
  smartRecommend,
  recordAngleFeedback,
  getAngleFeedback,
  clearAngleFeedback,
  SubjectDomainSchema,
  ComplexityLevelSchema,
  InnovationIntentSchema,
  SubjectClassificationSchema,
  AngleRecommendationSchema,
  RecommendationResultSchema,
} from "./recommendation/index.js";
export type {
  SubjectDomain,
  ComplexityLevel,
  InnovationIntent,
  SubjectClassification,
  AngleRecommendation,
  RecommendationResult,
  AngleFeedbackEntry,
} from "./recommendation/index.js";

/** Cross-investigation pattern mining — effectiveness heatmaps, correlations, and statistical analysis. */
export {
  ingestDataPoints,
  getDataPoints,
  clearMiningData,
  computeAngleEffectiveness,
  buildHeatmap,
  computeCorrelationMatrix,
  chiSquaredAngleEffectiveness,
  generateMiningReport,
  MiningDataPointSchema,
  AngleEffectivenessSchema,
  HeatmapCellSchema,
  CorrelationEntrySchema,
  StatisticalTestSchema,
  NarratedInsightSchema,
  MiningReportSchema,
} from "./mining/index.js";
export type {
  MiningDataPoint,
  AngleEffectiveness,
  HeatmapCell,
  CorrelationEntry,
  StatisticalTest,
  NarratedInsight,
  MiningReport,
} from "./mining/index.js";

/** Temporal innovation lens — generate ideas across near-term, mid-term, and far-future horizons. */
export {
  buildTemporalPrompt,
  generateForHorizon,
  runTemporalLens,
  getHorizonConfig,
  TimeHorizonSchema,
  TemporalIdeaSchema,
  TemporalHorizonResultSchema,
  TemporalLensResultSchema,
} from "./prompts/temporal/index.js";
export type {
  TimeHorizon,
  TemporalIdea,
  TemporalHorizonResult,
  TemporalLensResult,
  TemporalLensConfig,
} from "./prompts/temporal/index.js";

/** Simulation — stakeholder persona reactions and scenario modeling (adoption curves, sensitivity analysis). */
export {
  simulatePersonaReaction,
  simulateStakeholders,
  simulateStakeholdersBatch,
  buildConflictMatrix,
  computeReadinessScores,
  DEFAULT_PERSONAS,
  StakeholderPersonaSchema,
  StakeholderReactionSchema,
  StakeholderSimulationSchema,
  StakeholderConflictSchema,
  ConflictMatrixSchema,
  modelScenarios,
  modelScenariosBatch,
  scenarioToMarkdown,
  compareScenarioModels,
  ScenarioTypeSchema,
  AdoptionDataPointSchema,
  ScenarioProjectionSchema,
  SensitivityFactorSchema,
  ScenarioModelSchema,
} from "./simulation/index.js";
export type {
  StakeholderPersona,
  StakeholderReaction,
  StakeholderSimulation,
  StakeholderConflict,
  ConflictMatrix,
  ScenarioType,
  AdoptionDataPoint,
  ScenarioProjection,
  SensitivityFactor,
  ScenarioModel,
} from "./simulation/index.js";

/** Gallery — idea marketplace with publishing, upvoting, forking, and featured collections. */
export {
  publishToGallery,
  getGalleryListing,
  searchGallery,
  upvoteListing,
  addGalleryComment,
  getGalleryComments,
  forkGalleryListing,
  upsertContributorProfile,
  getContributorProfile,
  createFeaturedCollection,
  listFeaturedCollections,
  clearGallery,
  GalleryCategorySchema,
  GalleryListingSchema,
  GalleryCommentSchema,
  ContributorProfileSchema,
  GalleryFilterSchema,
  FeaturedCollectionSchema,
} from "./gallery/index.js";
export type {
  GalleryCategory,
  GalleryListing,
  GalleryComment,
  ContributorProfile,
  GalleryFilter,
  FeaturedCollection,
} from "./gallery/index.js";

/** Gamification — achievements, challenges, leaderboards, and activity feeds. */
export {
  awardAchievement,
  getUserAchievements,
  getUserPoints,
  createChallenge,
  startChallenge,
  completeChallenge,
  getUserChallenges,
  getLeaderboard,
  addActivity,
  getActivityFeedItems,
  getGamificationConfig,
  updateGamificationConfig,
  clearGamification,
  ACHIEVEMENTS,
  AchievementSchema,
  EarnedAchievementSchema,
  ChallengeTypeSchema,
  ChallengeSchema,
  LeaderboardEntrySchema,
  ActivityItemSchema,
  GamificationConfigSchema,
} from "./gamification/index.js";
export type {
  Achievement,
  EarnedAchievement,
  ChallengeType,
  Challenge,
  LeaderboardEntry,
  ActivityItem,
  GamificationConfig,
} from "./gamification/index.js";

/** Sustainability / ESG assessment — environmental, social, and governance scoring for ideas. */
export {
  scoreSustainability,
  scorePortfolioSustainability,
  getIndicator,
  sustainabilityToMarkdown,
  TrafficLightSchema,
  EnvironmentalScoreSchema,
  SocialScoreSchema,
  GovernanceScoreSchema,
  ESGRiskFlagSchema,
  ImprovementSuggestionSchema,
  SustainabilityScorecardSchema,
  PortfolioSustainabilitySchema,
} from "./sustainability/index.js";
export type {
  TrafficLight,
  EnvironmentalScore,
  SocialScore,
  GovernanceScore,
  ESGRiskFlag,
  ImprovementSuggestion,
  SustainabilityScorecard,
  PortfolioSustainability,
} from "./sustainability/index.js";

/** Semantic idea versioning — branch, commit, diff, and merge idea versions. */
export {
  createVersion,
  commitVersion,
  createBranch,
  getVersionLog,
  getVersion,
  listBranches,
  semanticDiff,
  mergeVersions,
  clearVersionHistory,
  SemanticChangeSchema,
  SemanticDiffSchema,
  IdeaVersionSchema,
  BranchSchema,
  MergeResultSchema,
} from "./versioning/index.js";
export type {
  SemanticChange,
  SemanticDiff,
  IdeaVersion,
  Branch,
  MergeResult,
} from "./versioning/index.js";

/** Idea fingerprint (DNA) — novelty vectors, domain blends, and similarity search. */
export {
  generateFingerprint,
  findSimilar,
  searchFingerprints,
  storeFingerprint,
  getFingerprint,
  listFingerprints,
  clearFingerprints,
  cosineSimilarity as fingerprintCosineSimilarity,
  fingerprintDistance,
  NoveltyVectorSchema,
  DomainBlendSchema,
  ConstraintProfileSchema,
  FeasibilitySignatureSchema,
  IdeaFingerprintSchema,
  SimilarityMatchSchema,
} from "./fingerprint/index.js";
export type {
  NoveltyVector,
  DomainBlend,
  ConstraintProfile,
  FeasibilitySignature,
  IdeaFingerprint,
  SimilarityMatch,
} from "./fingerprint/index.js";

/** Red team — adversarial attack/defense analysis to find and address idea weaknesses. */
export {
  attackIdea,
  defendIdea,
  runRedTeamSession,
  getRedTeamSession,
  listRedTeamSessions,
  clearRedTeamSessions,
  countSevereFindings,
  defenseEffectiveness,
  AttackFindingSchema,
  DefenseRebuttalSchema,
  RedTeamAttackSchema,
  DefenseRoundSchema,
  RedTeamSessionSchema,
} from "./redteam/index.js";
export type {
  AttackFinding,
  DefenseRebuttal,
  RedTeamAttack,
  DefenseRound,
  RedTeamSession,
} from "./redteam/index.js";

/** Industry vertical packs — HealthTech, FinTech, EdTech, CleanTech, and GovTech domain configs. */
export {
  getVerticalPack,
  listVerticalPacks,
  registerVerticalPack,
  unregisterVerticalPack,
  loadVerticalPackFromJson,
  getVerticalPromptContext,
  validateIdeaForVertical,
  searchVerticalPacks,
  resetVerticalPacks,
  HEALTHTECH_PACK,
  FINTECH_PACK,
  EDTECH_PACK,
  CLEANTECH_PACK,
  GOVTECH_PACK,
  RegulatoryContextSchema,
  MarketDataSchema,
  ValidationRuleSchema,
  VerticalAngleSchema,
  VerticalPackSchema,
} from "./verticals/index.js";
export type {
  RegulatoryContext,
  MarketData,
  ValidationRule,
  VerticalAngle,
  VerticalPack,
} from "./verticals/index.js";

/** Memory and preference learning — track user signals, build preference profiles, run A/B tests. */
export {
  recordSignal,
  getUserSignals,
  buildPreferenceProfile,
  getPreferenceProfile,
  buildPreferenceContext,
  assignABTest,
  getABTestVariant,
  clearMemory,
  recordOutcome,
  getOutcomes,
  getModelPerformanceStats,
  compareModelPerformance,
  autoTuneParameters,
  UserSignalSchema,
  PreferenceWeightsSchema,
  UserPreferenceProfileSchema,
  ABTestAssignmentSchema,
  ABTestResultSchema,
  OutcomeRecordSchema,
  ModelPerformanceSchema,
  TunedParametersSchema,
} from "./memory/index.js";
export type {
  UserSignal,
  PreferenceWeights,
  UserPreferenceProfile,
  ABTestAssignment,
  ABTestResult,
  OutcomeRecord,
  ModelPerformance,
  TunedParameters,
} from "./memory/index.js";

/** Hypothesis-driven innovation — parse, analyze, and track structured hypotheses with experiment cards. */
export {
  parseHypothesis,
  analyzeHypothesis,
  createHypothesisSession,
  getHypothesisSession,
  listHypothesisSessions,
  updateHypothesisStatus,
  attachAnalysis,
  clearHypothesisSessions,
  ParsedHypothesisSchema,
  ExperimentCardSchema,
  CounterEvidenceSchema,
  AlternativeHypothesisSchema,
  PivotSuggestionSchema,
  HypothesisAnalysisSchema,
  HypothesisSessionSchema,
} from "./hypothesis/index.js";
export type {
  ParsedHypothesis,
  ExperimentCard,
  CounterEvidence,
  AlternativeHypothesis,
  PivotSuggestion,
  HypothesisAnalysis,
  HypothesisSession,
} from "./hypothesis/index.js";

/** Workflow — define innovation sprints as YAML and execute them as multi-stage pipelines. */
export {
  parseWorkflowYaml,
  validateWorkflow,
  runWorkflow,
  createSampleWorkflow,
  WorkflowFilterSchema,
  WorkflowStageSchema,
  SynthesisRulesSchema,
  OutputFormatSchema,
  WorkflowConfigSchema,
  WorkflowCheckpointSchema,
  WorkflowRunResultSchema,
} from "./workflow/index.js";
export type {
  WorkflowFilter,
  WorkflowStage,
  SynthesisRules,
  OutputFormat,
  WorkflowConfig,
  WorkflowCheckpoint,
  WorkflowRunResult,
  WorkflowProgressCallback,
} from "./workflow/index.js";

/** Competitive intelligence — analyze competitors, identify gaps, and generate positioning strategies. */
export {
  analyzeCompetitors,
  getCompetitiveAnalysis,
  listCompetitiveAnalyses,
  clearCompetitiveAnalyses,
  rankGaps,
  rankStrategies,
  generatePositioningMatrix,
  createMonitor,
  listMonitors,
  getMonitor,
  deleteMonitor,
  recordSignal,
  getSignals,
  detectTrends,
  generateInvestigationSuggestions,
  clearMonitoring,
  CompetitorProfileSchema,
  CompetitiveGapSchema,
  DifferentiationStrategySchema,
  FlankingOpportunitySchema,
  CompetitiveAnalysisSchema,
  CompetitiveSignalSchema,
  MonitorConfigSchema,
  MonitorReportSchema,
} from "./competitive/index.js";
export type {
  CompetitorProfile,
  CompetitiveGap,
  DifferentiationStrategy,
  FlankingOpportunity,
  CompetitiveAnalysis,
  CompetitiveSignal,
  MonitorConfig,
  MonitorReport,
} from "./competitive/index.js";

/** Impact simulator — model ROI, resource requirements, timelines, and go/no-go milestones. */
export {
  simulateImpact,
  getSimulation,
  listSimulations,
  clearSimulations,
  calculateTotalResourceCost,
  getGoNoGoMilestones,
  calculateExpectedROI,
  generateTimeline,
  runMonteCarloSimulation,
  MonthlyDataPointSchema,
  MilestoneSchema,
  ResourceRequirementSchema,
  DecisionPointSchema,
  ScenarioSimulationSchema,
  ImpactSimulationSchema,
  MonteCarloInputSchema,
  MonteCarloResultSchema,
} from "./impact-simulator/index.js";
export type {
  MonthlyDataPoint,
  Milestone,
  ResourceRequirement,
  DecisionPoint,
  ScenarioSimulation,
  ImpactSimulation,
  MonteCarloInput,
  MonteCarloResult,
} from "./impact-simulator/index.js";

/** Vision — multi-modal input: extract innovation subjects from images using visual analysis. */
export {
  extractFromImage,
  validateImage,
  detectImageFormat,
  extractionToSubject,
  extractionToContext,
  imageToDataUrl,
  VisualElementSchema,
  ImageExtractionSchema,
  ImageMetadataSchema,
} from "./vision/index.js";
export type { VisualElement, ImageExtraction, ImageMetadata } from "./vision/index.js";

/** Retrospective engine — track idea outcomes, analyze success/failure patterns, and detect diminishing returns. */
export {
  trackOutcome,
  getOutcome,
  listOutcomes,
  updateOutcome,
  analyzeSuccessPatterns,
  analyzeFailureModes,
  calculateVelocityTrends,
  detectDiminishingReturns,
  generateRetrospectiveReport,
  getRetrospectiveReport,
  listRetrospectiveReports,
  clearRetrospectiveData,
  IdeaOutcomeSchema,
  SuccessPatternSchema,
  FailureModeSchema,
  VelocityTrendSchema,
  DiminishingReturnsSchema,
  RetrospectiveReportSchema,
} from "./retrospective/index.js";
export type {
  IdeaOutcome,
  SuccessPattern,
  FailureMode,
  VelocityTrend,
  DiminishingReturns,
  RetrospectiveReport,
} from "./retrospective/index.js";

/** Natural language pipeline builder — parse English descriptions into pipeline configs, compile to DAGs, and execute. */
export {
  parsePipelineRequest,
  resolvePhases,
  resolveAngles,
  compilePipelineDAG,
  executePipelineDAG,
  dagToText,
  PipelineConfigSchema,
  PipelinePhaseSchema,
  OutputFormatSchema as PipelineOutputFormatSchema,
  DAGNodeSchema,
  PipelineDAGSchema,
} from "./pipeline-builder/index.js";
export type {
  PipelineConfig,
  PipelinePhase,
  OutputFormat as PipelineOutputFormat,
  DAGNode,
  PipelineDAG,
} from "./pipeline-builder/index.js";

/** Innovation diff — compare two subject snapshots and identify emerged, disappeared, and evolved ideas. */
export {
  runInnovationDiff,
  buildDiffPrompt,
  DiffResultSchema,
  DiffItemSchema,
} from "./diff/index.js";
export type { DiffResult, DiffItem } from "./diff/index.js";

/** Idea provenance — trace idea origins through prompt chains with content hashes. */
export {
  buildProvenanceRecords,
  createProvenanceChain,
  buildProvenanceTree,
  getIdeaProvenance,
  formatProvenance,
  computeRecordHash,
  computeChainHash,
  verifyChainIntegrity,
  provenanceToJsonLd,
  buildLineageGraph,
  provenanceToMarkdown,
  hashPrompt,
  estimateInputTokens,
  ProvenanceRecordSchema,
  ProvenanceChainSchema,
} from "./provenance/index.js";
export type { ProvenanceRecord, ProvenanceChain, ProvenanceTreeNode, LineageNode, LineageEdge } from "./provenance/index.js";

/** Interactive Idea Negotiation — multi-turn structured dialogue for collaborative idea refinement. */
export {
  startNegotiation,
  negotiateStep,
  getNegotiation,
  listNegotiations,
  completeNegotiation,
  computeIdeaDeltaScore,
  clearNegotiations,
  NegotiationPhaseSchema,
  NegotiationMessageSchema,
  IdeaDeltaSchema,
  NegotiationSessionSchema,
} from "./negotiation/index.js";
export type {
  NegotiationPhase,
  NegotiationMessage,
  IdeaDelta,
  NegotiationSession,
} from "./negotiation/index.js";

/** Constraint satisfaction — evaluate ideas against budget, timeline, and custom constraints. */
export {
  evaluateConstraints,
  flattenIdeas,
  parseConstraintString,
  ConstraintSchema,
  ConstraintTypeSchema,
  ConstraintOperatorSchema,
  ConstraintEvaluationSchema,
  ConstraintResultSchema,
} from "./constraints/index.js";
export type {
  Constraint,
  ConstraintType,
  ConstraintOperator,
  ConstraintEvaluation,
  ConstraintResult,
} from "./constraints/index.js";

/** Cross-session serendipity — discover unexpected connections between past investigations. */
export {
  findSerendipitousConnections,
  embedSession,
  SerendipitousConnectionSchema,
  SerendipityResultSchema,
} from "./serendipity/index.js";
export type { SerendipitousConnection, SerendipityResult } from "./serendipity/index.js";

/** Investigation confidence scoring — measure coverage, depth, and identify knowledge gaps. */
export {
  scoreInvestigationQuality,
  formatGapSuggestions,
  meetsConfidenceThreshold,
  ConfidenceScoreSchema,
  ConfidenceDimensionSchema,
  KnowledgeGapSchema,
} from "./confidence/index.js";
export type { ConfidenceScore, ConfidenceDimension, KnowledgeGap } from "./confidence/index.js";

/** Embeddable widget SDK — generate embed code for third-party websites. */
export { generateEmbedCode, getWidgetSource, WIDGET_SOURCE } from "./widget/index.js";

/** Idea genealogy — track how ideas evolve across investigation runs. */
export {
  compareInvestigationRuns,
  findPreviousInvestigation,
  IdeaStatusSchema,
  IdeaEvolutionSchema,
  GenealogyResultSchema,
} from "./genealogy/index.js";
export type { IdeaStatus, IdeaEvolution, GenealogyResult } from "./genealogy/index.js";

/** LLM output quality gate — detect hallucinated statistics, vague platitudes, duplications, and contradictions. */
export {
  runQualityGate,
  checkHallucinatedStatistics,
  checkVaguePlatitudes,
  checkCrossAngleDuplication,
  checkSelfContradictions,
  QualityCheckTypeSchema,
  QualityIssueSchema,
  QualityReportSchema,
} from "./quality-gate/index.js";
export type {
  QualityCheckType,
  QualityIssue,
  QualityReport,
  QualityGateConfig,
} from "./quality-gate/index.js";

/** Debate engine — structured pro/con debates with verdicts and quality scoring. */
export {
  runDebate,
  debateIdeas,
  debateToMarkdown,
  DEFAULT_PRO_PERSONA,
  DEFAULT_CON_PERSONA,
  DebaterPersonaSchema,
  DebateArgumentSchema,
  DebateRoundSchema,
  DebateVerdictSchema,
  DebateQualitySchema,
  DebateResultSchema,
} from "./debate/index.js";
export type {
  DebaterPersona,
  DebateArgument,
  DebateRound,
  DebateVerdict,
  DebateQuality,
  DebateResult,
  DebateConfig,
} from "./debate/index.js";

/** Evolution engine — genetic-algorithm-inspired crossover, mutation, and selection of ideas. */
export {
  crossover,
  mutate,
  select,
  runEvolution,
  evolutionToMarkdown,
  MutationTypeSchema,
  AncestryNodeSchema,
  EvolvedIdeaSchema,
  GenerationResultSchema,
  EvolutionResultSchema,
} from "./evolution/index.js";
export type {
  MutationType,
  AncestryNode,
  EvolvedIdea,
  GenerationResult,
  EvolutionResult,
  EvolutionConfig,
  EvolutionProgress,
} from "./evolution/index.js";

/** API gateway — API key management, usage tracking, billing tiers, rate limiting, webhooks, and multi-tenant SaaS. */
export {
  createApiKey,
  getApiKey,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  updateApiKeyTier,
  deleteApiKey,
  recordUsage,
  getUsageSummary,
  checkDailyLimit,
  checkTokenBucket,
  registerWebhook,
  getWebhooks,
  removeWebhook,
  getOpenApiSpec,
  clearApiGateway,
  createTenant,
  getTenant,
  findTenantBySlug,
  listTenants,
  updateTenantTier,
  suspendTenant,
  addTenantApiKey,
  getDeveloperPortalInfo,
  createDemoKey,
  TIER_LIMITS,
  BillingTierSchema,
  ApiKeySchema,
  UsageRecordSchema,
  UsageSummarySchema,
  WebhookEventSchema,
  TenantSchema,
  DeveloperPortalInfoSchema,
} from "./api-gateway/index.js";
export type {
  BillingTier,
  ApiKey,
  UsageRecord,
  UsageSummary,
  WebhookEvent,
  Tenant,
  DeveloperPortalInfo,
} from "./api-gateway/index.js";

/** Decision packet — executive-ready decision documents with options, risks, and resource asks. */
export {
  generateDecisionPacket,
  decisionPacketToMarkdown,
  decisionPacketToSlidesJson,
  DecisionPacketSchema,
  OptionSchema,
  RiskAssessmentSchema,
  ResourceAskSchema,
} from "./decision/index.js";
export type {
  DecisionPacket,
  Option,
  RiskAssessment,
  ResourceAsk,
  DecisionPacketConfig,
} from "./decision/index.js";

/** Investigation ontology — extract entities, relationships, and taxonomies for knowledge accumulation. */
export {
  extractOntology,
  getOntology,
  listOntologies,
  queryEntities,
  buildInvestigationPrompt as buildOntologyEnrichedPrompt,
  clearOntologies,
  EntityTypeSchema,
  OntologyEntitySchema,
  OntologyRelationshipSchema,
  OntologyVersionSchema,
  OntologyGraphSchema,
} from "./ontology/index.js";
export type {
  EntityType,
  OntologyEntity,
  OntologyRelationship,
  TaxonomyNode,
  OntologyVersion,
  OntologyGraph,
  OntologyConfig,
} from "./ontology/index.js";

/** Stress testing — generate extreme scenarios and assess idea resilience. */
export {
  generateStressScenarios,
  stressTestIdeas,
  stressTestToMarkdown,
  ScenarioTypeSchema as StressScenarioTypeSchema,
  StressScenarioSchema,
  ImpactAssessmentSchema,
  VulnerabilitySchema,
  HedgingStrategySchema,
  StressTestResultSchema,
} from "./stress-testing/index.js";
export type {
  ScenarioType as StressScenarioType,
  StressScenario,
  ImpactAssessment,
  Vulnerability,
  HedgingStrategy,
  StressTestResult,
  StressTestConfig,
} from "./stress-testing/index.js";

/** Angle effectiveness learning — track angle performance over time with A/B testing and domain affinity. */
export {
  recordAngleEvent,
  getAngleEvents,
  computeAngleEffectiveness as computeAngleLearning,
  getWeightedAngles,
  buildAvoidanceHints,
  assignABVariant,
  getABTestResults,
  clearAngleLearning,
  AngleEventTypeSchema,
  AngleEventSchema,
  AngleQualityScoreSchema,
  DomainAffinitySchema,
  EffectivenessReportSchema,
} from "./angle-learning/index.js";
export type {
  AngleEventType,
  AngleEvent,
  AngleQualityScore as AngleLearningScore,
  DomainAffinity,
  EffectivenessReport,
} from "./angle-learning/index.js";

/** Prompt observatory — record, timeline, diff, and A/B-compare all LLM prompt calls. */
export {
  setObservatoryEnabled,
  isObservatoryEnabled,
  recordPromptCall,
  observeCall,
  getCallTimeline,
  getPromptCallById,
  getObservatoryStats,
  diffPromptCalls,
  createABComparison,
  clearObservatory,
  PromptCallSchema,
  PromptDiffSchema,
  ObservatoryStatsSchema,
  ABComparisonSchema,
} from "./observatory/index.js";
export type {
  PromptCall,
  PromptDiff,
  ObservatoryStats,
  ABComparison,
} from "./observatory/index.js";

/** Team innovation rituals — scheduled cadences with participant management and digest generation. */
export {
  createRitual,
  getRitual,
  listRituals,
  deleteRitual,
  setRitualEnabled,
  addParticipant,
  removeParticipant,
  addBacklogItem,
  getNextBacklogSubject,
  recordExecution,
  getNextAngles,
  isRitualDue,
  getDueRituals,
  compileDigest,
  clearRituals,
  CadenceSchema,
  ParticipantSchema,
  SubjectBacklogItemSchema,
  RitualExecutionSchema,
  RitualDigestSchema,
  InnovationRitualSchema,
} from "./rituals/index.js";
export type {
  Cadence,
  Participant,
  SubjectBacklogItem,
  RitualExecution,
  RitualDigest,
  InnovationRitual,
} from "./rituals/index.js";

/** Innovation playbook generator — polished documents with executive summary, roadmap, and risk assessment. */
export {
  generatePlaybook,
  generatePlaybookFromPipeline,
  PlaybookFormatSchema,
  PlaybookSchema,
  PlaybookSectionsSchema,
  RoadmapItemSchema,
  RiskItemSchema,
} from "./playbook/index.js";
export type {
  Playbook,
  PlaybookFormat,
  PlaybookSections,
  RoadmapItem,
  RiskItem,
} from "./playbook/index.js";

/** Storage provider abstraction — pluggable persistence layer (in-memory, SQLite, Turso). */
export {
  getStorage,
  setStorage,
  initializeStorage,
  closeStorage,
  createSQLiteStorage,
  InMemoryStorageProvider,
  SQLiteStorageProvider,
  createBetterSqliteDB,
} from "./storage/index.js";
export type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
  SQLiteDB,
  TursoConfig,
} from "./storage/index.js";

/** Migration tool — import file-based data into a StorageProvider. */
export { migrateFileDataToStorage } from "./storage/migrate.js";
export type { MigrationResult } from "./storage/migrate.js";

/** Real-time collaboration — WebSocket room management, presence, and message handling. */
export { RealtimeRoomManager, getRealtimeManager, resetRealtimeManager } from "./realtime/index.js";
export type {
  RealtimeUser,
  RealtimeRoom,
  RealtimeMessage,
  RealtimeResponse,
  RealtimeMessageType,
  SendToUser,
  BroadcastToRoom,
} from "./realtime/index.js";

/** Multi-model consensus — run angles across multiple LLMs and synthesize agreements/divergences. */
export { runConsensus, consensusToMarkdown } from "./consensus/index.js";
export type {
  ModelResult,
  ConsensusResult,
  ConsensusIdea,
  ConsensusOptions,
} from "./consensus/index.js";

/** Idea-to-Code scaffolding — generate implementation boilerplate from innovation ideas. */
export { generateScaffold, scaffoldToFileMap, scaffoldToMarkdown } from "./scaffolding/index.js";
export type {
  ScaffoldFile,
  ScaffoldIssue,
  IdeaScaffold,
  ScaffoldOptions,
} from "./scaffolding/index.js";

/** Innovation Radar — scheduled re-investigations with change detection and alerts. */
export {
  createWatch,
  getWatch,
  listWatches,
  updateWatch,
  deleteWatch,
  getDueWatches,
  diffInvestigations,
  runRadarScan,
  getScanHistory,
  buildAlerts,
  deliverWebhookAlert,
} from "./radar/index.js";
export type {
  WatchFrequency,
  AlertChannel,
  WatchSubject,
  RadarScanResult,
  RadarChange,
  RadarAlert,
} from "./radar/index.js";

/** RBAC — role-based access control with granular permissions and audit logging. */
export {
  PERMISSIONS,
  roleHasPermission,
  getRolePermissions,
  isRoleAtLeast,
  checkPermission,
  requirePermission,
  logAction,
  getAuditLog,
  clearAuditLog,
} from "./rbac/index.js";
export type {
  Permission,
  ExtendedRole,
  AuthContext,
  PermissionCheckResult,
  AuditLogEntry,
} from "./rbac/index.js";

/** Innovation Canvas — spatial idea arrangement with nodes, edges, clusters, and SVG export. */
export {
  createCanvasFromResults,
  addCanvasEdge,
  addCanvasAnnotation,
  moveCanvasNode,
  createCluster,
  canvasToSvg,
} from "./canvas/index.js";
export type {
  CanvasPosition,
  CanvasSize,
  CanvasNode,
  CanvasEdge,
  CanvasCluster,
  CanvasAnnotation,
  InnovationCanvas,
} from "./canvas/index.js";

/** Plugin Marketplace — publish, discover, install, and review community plugins. */
export {
  publishPlugin,
  searchPlugins,
  getMarketplacePlugin,
  getFeaturedPlugins,
  getCategories,
  installPlugin as installMarketplacePlugin,
  uninstallPlugin as uninstallMarketplacePlugin,
  listInstalledPlugins,
  togglePlugin,
  addReview,
  getReviews,
  verifyPlugin,
  clearMarketplace,
} from "./marketplace/index.js";
export type {
  PluginCategory,
  MarketplacePlugin,
  InstalledPlugin,
  MarketplaceSearchOptions,
  PluginReview,
} from "./marketplace/index.js";

/** Innovation Embeddings & Semantic Search — TF-IDF vector search, similarity clustering, and cross-investigation discovery. */
export {
  indexDocument,
  indexDocuments,
  removeDocument,
  semanticSearch,
  findSimilar as findSimilarDocuments,
  clusterDocuments,
  discoverConnections,
  getIndexSize,
  clearEmbeddingsIndex,
  EmbeddingDocumentSchema,
  SearchResultSchema,
  ClusterSchema,
  SemanticSearchResultSchema,
  CrossDiscoveryResultSchema,
} from "./embeddings/index.js";
export type {
  EmbeddingDocument,
  SearchResult as EmbeddingSearchResult,
  Cluster as EmbeddingCluster,
  SemanticSearchResult,
  CrossDiscoveryResult,
} from "./embeddings/index.js";

/** Innovation Telemetry & Quality Metrics — diversity scoring, prompt effectiveness, hallucination detection, span tracing, metrics aggregation. */
export {
  scoreIdeaDiversity,
  recordPromptEffectiveness,
  getPromptEffectivenessByAngle,
  detectHallucinations,
  detectHallucinationsInResults,
  getQualityTrends,
  clearTelemetry,
  startSpan,
  endSpan,
  addSpanEvent,
  getSpans,
  recordPipelineMetric,
  getAggregatedMetrics,
  buildTelemetryDashboard,
  getMetrics,
  DiversityScoreSchema,
  PromptEffectivenessSchema,
  HallucinationCheckSchema,
  QualityTrendSchema,
  TelemetrySpanSchema,
  PipelineMetricSchema,
} from "./telemetry/index.js";
export type {
  DiversityScore,
  PromptEffectiveness,
  HallucinationCheck,
  QualityTrend,
  TelemetrySpan,
  PipelineMetric,
} from "./telemetry/index.js";

/** Prompt A/B Testing Lab — experiment framework for prompt variations with statistical analysis and versioning. */
export {
  createExperiment,
  startExperiment,
  getExperiment,
  listExperiments,
  assignVariant,
  recordExperimentScore,
  welchTTest,
  analyzeExperiment,
  commitPromptVersion,
  activatePromptVersion,
  getActivePromptVersion,
  getPromptVersionHistory,
  rollbackPromptVersion,
  clearPromptLab,
  PromptVariantSchema,
  AllocationStrategySchema,
  PromptExperimentSchema,
  ExperimentResultSchema,
  StatisticalTestResultSchema,
  PromptVersionSchema,
} from "./prompt-lab/index.js";
export type {
  PromptVariant,
  AllocationStrategy,
  PromptExperiment,
  ExperimentResult,
  StatisticalTestResult,
  PromptVersion,
} from "./prompt-lab/index.js";

/** Outcome Tracking & ROI Dashboard — track ideas from generation through implementation to business outcome. */
export {
  createOutcome as createROIOutcome,
  getOutcome as getROIOutcome,
  listOutcomes as listROIOutcomes,
  transitionOutcome,
  addExternalLink,
  addRevenueMetric,
  deleteOutcome as deleteROIOutcome,
  buildROIDashboard,
  clearOutcomes,
  OutcomeStageSchema,
  ExternalLinkTypeSchema,
  ExternalLinkSchema,
  RevenueMetricSchema,
  StageTransitionSchema,
  OutcomeRecordSchema as ROIOutcomeRecordSchema,
} from "./outcome-tracking/index.js";
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

/** AI Innovation Coach — conversational coaching with domain detection and learning feedback. */
export {
  startCoachSession,
  sendCoachMessage,
  getCoachSession,
  listCoachSessions,
  endCoachSession,
  clearCoachSessions,
  CoachMessageRoleSchema,
  CoachSessionStatusSchema,
  CoachMessageSchema,
  CoachDomainSchema,
  CoachSessionSchema,
} from "./coaching/coach-session.js";
export type {
  CoachMessageRole,
  CoachSessionStatus,
  CoachMessage,
  CoachDomain,
  CoachSession,
  CoachSessionConfig,
} from "./coaching/coach-session.js";

/** Federated Innovation Networks — anonymized pattern sharing across organizations. */
export {
  createFederationNode,
  getNode,
  listNodes,
  extractPatterns,
  publishPatterns,
  discoverPeers,
  fetchRemotePatterns,
  mergePatterns,
  getNetworkDashboard,
  clearFederation,
  FederationPatternTypeSchema,
  FederationPatternSchema,
  FederationNodeSchema,
  PeerNodeSchema,
  NetworkDashboardSchema,
} from "./federation/index.js";
export type {
  FederationPatternType,
  FederationPattern,
  FederationNode,
  PeerNode,
  NetworkTrend,
  NetworkDashboard,
} from "./federation/index.js";

/** Innovation Sprints with Facilitation Engine — time-boxed sessions with automated facilitation. */
export {
  SPRINT_TEMPLATES,
  getSprintTemplate,
  createFacilitatedSprint,
  autoAdvancePhase,
  generatePhasePrompts,
  generatePhaseSummary,
  generateSprintReport,
  SprintTemplateIdSchema,
  SprintTemplateSchema,
  FacilitatedSprintSchema,
  SprintParticipantSchema,
  SprintPhaseConfigSchema,
  SprintReportSchema as FacilitatedSprintReportSchema,
} from "./sprint/facilitation.js";
export type {
  SprintTemplateId,
  SprintTemplate,
  FacilitatedSprint,
  SprintParticipant,
  SprintPhaseConfig,
  SprintReport as FacilitatedSprintReport,
} from "./sprint/facilitation.js";

/** Domain Knowledge Packs — curated knowledge bases for specific verticals. */
export {
  registerKnowledgePack,
  getKnowledgePack,
  listKnowledgePacks,
  searchEntities,
  validatePackSchema,
  getPackEnrichmentContext,
  removeKnowledgePack,
  clearKnowledgePacks,
  BUILT_IN_PACKS,
  KnowledgeEntitySchema,
  RegulatoryItemSchema,
  TrendItemSchema,
  ScoringRubricSchema,
  PersonaPromptSchema,
  KnowledgePackSchema,
} from "./knowledge-packs/index.js";
export type {
  KnowledgeEntity,
  RegulatoryItem,
  TrendItem,
  ScoringRubric,
  PersonaPrompt,
  KnowledgePack,
} from "./knowledge-packs/index.js";

/** Innovation API Specification — OpenAPI 3.1 spec generation and SDK embed helpers. */
export {
  generateOpenApiSpec,
  generateSdkSnippet,
  getApiEndpoints,
  ApiEndpointSchema,
  SdkLanguageSchema,
} from "./api-gateway/api-spec.js";
export type { ApiEndpoint, SdkLanguage } from "./api-gateway/api-spec.js";

/** Idea Maturity Lifecycle — formal stage-gate process with evidence requirements. */
export {
  createLifecycleIdea,
  getLifecycleIdea,
  listLifecycleIdeas,
  advanceLifecycleStage,
  addEvidence,
  getKanbanBoard,
  getStaleIdeas,
  deleteLifecycleIdea,
  clearLifecycle,
  LIFECYCLE_STAGES,
  LifecycleStageSchema,
  EvidenceTypeSchema,
  EvidenceItemSchema,
  LifecycleIdeaSchema,
  KanbanColumnSchema,
} from "./lifecycle/index.js";
export type {
  LifecycleStage,
  EvidenceType,
  EvidenceItem,
  LifecycleIdea,
  KanbanColumn,
  KanbanBoard,
} from "./lifecycle/index.js";

/** Multi-Modal Innovation — process images, PDFs, and voice as investigation inputs. */
export {
  processMultiModalInput,
  batchProcessInputs,
  MultiModalInputTypeSchema,
  MultiModalInputSchema,
  ProcessedInputSchema,
  MultiModalContextSchema,
} from "./vision/multi-modal.js";
export type {
  MultiModalInputType,
  MultiModalInput,
  ProcessedInput,
  MultiModalContext,
} from "./vision/multi-modal.js";

/** Innovation Governance & Compliance Engine — configurable guardrails, regulatory screening, audit trails. */
export {
  createGuardrail,
  listGuardrails,
  evaluateGuardrails,
  runRegulatoryPreScreening,
  detectBias,
  getComplianceAuditTrail,
  addAuditEntry,
  getComplianceDashboard,
  clearGovernance,
  GuardrailTypeSchema,
  GuardrailSeveritySchema,
  GuardrailSchema,
  GuardrailResultSchema,
  RegulatoryCheckSchema,
  BiasCheckSchema,
  ComplianceAuditEntrySchema,
} from "./compliance/governance.js";
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

/** Community Innovation Challenges — challenge boards, submissions, voting, and leaderboards. */
export {
  createCommunityChallenge,
  getCommunityChallenge,
  listCommunityChallenges,
  submitEntry,
  voteForEntry,
  getEntryRankings,
  awardBadge,
  getUserBadges,
  getCommunityLeaderboard,
  closeCommunityChallenge,
  clearCommunityChallenges,
  ChallengeStatusSchema,
  CommunitySubmissionSchema,
  CommunityChallengeSchema,
  BadgeSchema,
  CommunityLeaderboardEntrySchema,
} from "./gamification/challenges.js";
export type {
  ChallengeStatus,
  CommunitySubmission,
  CommunityChallenge,
  Badge,
  CommunityLeaderboardEntry,
} from "./gamification/challenges.js";

/** Codebase analysis — AST-based code pattern detection and innovation subject generation. */
export {
  analyzeCodebase,
  analyzeCodebaseSync,
  discoverFiles,
  analyzeFile,
  detectPatterns,
  analyzeDependencies,
  discoverLayers,
  generateSubjects,
  analysisToMarkdown,
  CodePatternSchema,
  DependencyAnalysisSchema,
  ArchitecturalLayerSchema,
  FileComplexitySchema,
  CodebaseSubjectSchema,
  CodebaseAnalysisSchema,
} from "./codebase-analysis/index.js";
export type {
  CodePattern,
  DependencyAnalysis,
  ArchitecturalLayer,
  FileComplexity,
  CodebaseSubject,
  CodebaseAnalysis,
  CodebaseAnalysisOptions,
} from "./codebase-analysis/index.js";

/** Output contracts — custom Zod schemas for structured innovation output. */
export {
  registerContract,
  unregisterContract,
  getContract,
  listContracts,
  clearContracts,
  validateAgainstContract,
  transformToContract,
  registerBuiltInContracts,
  createContractFromBuilder,
  MinimalIdeaSchema,
  JiraIssueSchema,
  GitHubIssueSchema,
  SlackMessageSchema,
  OutputContractSchema,
  ContractValidationResultSchema,
  FieldMappingSchema,
  TransformConfigSchema,
} from "./output-contracts/index.js";
export type {
  OutputContract,
  ContractValidationResult,
  FieldMapping,
  TransformConfig,
  RegisteredContract,
} from "./output-contracts/index.js";

/** Innovation-as-PR — one-click workflow: top idea → branch → scaffold → PR. */
export {
  selectTopIdea,
  generateBranchName,
  generatePRBody,
  buildPRWorkflow,
  innovationToPR,
  workflowToScript,
  PRConfigSchema,
  GitCommandSchema,
  PRWorkflowPlanSchema,
  PRResultSchema,
} from "./innovation-pr/index.js";
export type {
  PRConfig,
  GitCommand,
  PRWorkflowPlan,
  PRResult,
} from "./innovation-pr/index.js";

/** Angle Studio — visual pipeline editor for angle composition. */
export {
  createPipeline as createStudioPipeline,
  getPipeline as getStudioPipeline,
  listPipelines as listStudioPipelines,
  deletePipeline as deleteStudioPipeline,
  clearPipelines as clearStudioPipelines,
  addNode as addStudioNode,
  removeNode as removeStudioNode,
  moveNode as moveStudioNode,
  updateNodeConfig,
  reorderNodes,
  addConnection as addStudioConnection,
  removeConnection as removeStudioConnection,
  validatePipeline,
  createFromTemplate,
  extractAngleOrder,
  serializePipeline,
  importPipeline,
  StudioPositionSchema,
  StudioNodeSchema,
  StudioConnectionSchema,
  AnglePipelineSchema,
  PipelineValidationSchema,
} from "./angle-studio/index.js";
export type {
  StudioPosition,
  StudioNode,
  StudioConnection,
  AnglePipeline,
  PipelineValidation,
} from "./angle-studio/index.js";

/** Innovation Digest — periodic AI-generated summaries via email, Slack, RSS. */
export {
  createSubscription as createDigestSubscription,
  getSubscription as getDigestSubscription,
  listSubscriptions as listDigestSubscriptions,
  updateSubscription as updateDigestSubscription,
  deleteSubscription as deleteDigestSubscription,
  generateDigest,
  getGeneratedDigests,
  digestToMarkdown,
  digestToSlack,
  digestToRSS,
  getDueSubscriptions,
  clearDigests,
  DigestFrequencySchema,
  DeliveryChannelSchema,
  DigestSubscriptionSchema,
  DigestIdeaSchema,
  DigestSectionSchema,
  InnovationDigestSchema,
  RSSItemSchema,
} from "./digest/index.js";
export type {
  DigestFrequency,
  DeliveryChannel,
  DigestSubscription,
  DigestIdea,
  DigestSection,
  InnovationDigest,
  RSSItem,
  DigestInput,
} from "./digest/index.js";

/** Evidence-Based Idea Enrichment — market data, competitors, trends. */
export {
  enrichIdea,
  enrichIdeaHeuristic,
  enrichIdeas,
  enrichmentToMarkdown,
  registerEnrichmentProvider,
  unregisterEnrichmentProvider,
  listEnrichmentProviders,
  clearEnrichmentProviders,
  EvidenceItemSchema as EnrichmentEvidenceItemSchema,
  MarketSizeSchema,
  CompetitorSchema,
  EnrichedIdeaSchema,
  EnrichmentConfigSchema,
} from "./enrichment/index.js";
export type {
  EvidenceItem as EnrichmentEvidenceItem,
  MarketSize,
  Competitor,
  EnrichedIdea,
  EnrichmentConfig,
  EnrichmentProvider,
} from "./enrichment/index.js";

/** Innovation Skill Trees — XP system, skill progression, unlockable features. */
export {
  awardXP,
  getUserProgress,
  getUserLevel,
  hasSkill,
  isFeatureUnlocked,
  getSkillTreeWithProgress,
  unlockSkill,
  getXPHistory,
  getXPLeaderboard,
  clearSkillTrees,
  SKILL_TREE,
  LEVELS,
  XP_REWARDS,
  SkillCategorySchema,
  SkillNodeSchema,
  XPEventSchema,
  UserSkillProgressSchema,
  LevelDefinitionSchema,
} from "./gamification/skill-trees.js";
export type {
  SkillCategory,
  SkillNode,
  XPEvent,
  UserSkillProgress,
  LevelDefinition,
} from "./gamification/skill-trees.js";

/** Cross-Org Benchmarking — anonymous metrics comparison across organizations. */
export {
  submitMetrics,
  compareToPeers,
  getNetworkStats,
  benchmarkToMarkdown as crossOrgBenchmarkToMarkdown,
  clearBenchmarkData,
  OrgMetricsSchema,
  BenchmarkComparisonSchema,
  NetworkStatsSchema,
} from "./cross-org-benchmark/index.js";
export type {
  OrgMetrics,
  BenchmarkComparison,
  NetworkStats,
} from "./cross-org-benchmark/index.js";

/** ML-based angle recommendation — historical learning for angle suggestions. */
export {
  recommendAnglesML,
  recordHistoricalSession,
  getHistoricalSessions,
  clearHistoricalSessions,
  getAngleEffectivenessStats,
} from "./recommendation/index.js";
export type { HistoricalSession } from "./recommendation/index.js";

/** Innovation Scenario Wargaming — adversarial competitive simulation with resilience scoring. */
export {
  runWargaming,
  getWargamingSession,
  listWargamingSessions,
  wargamingToMarkdown,
  clearWargamingSessions,
  CompetitorPersonaSchema,
  WargamingMoveSchema,
  WargamingRoundSchema,
  CounterStrategySchema,
  WargamingResultSchema,
} from "./wargaming/index.js";
export type {
  CompetitorPersona,
  WargamingMove,
  WargamingRound,
  CounterStrategy,
  WargamingResult,
  WargamingConfig,
} from "./wargaming/index.js";

/** Custom Scoring Rubric Builder — user-defined evaluation dimensions with reusable templates. */
export {
  createRubric,
  getRubric,
  listRubrics,
  updateRubric,
  deleteRubric,
  scoreWithRubric,
  clearRubrics,
  BUILT_IN_RUBRICS,
  RubricDimensionSchema,
  ScoringRubricSchema as CustomScoringRubricSchema,
  DimensionScoreSchema,
  RubricScoreSchema,
  RubricScoringResultSchema,
} from "./rubric/index.js";
export type {
  RubricDimension,
  ScoringRubric as CustomScoringRubric,
  DimensionScore,
  RubricScore,
  RubricScoringResult,
} from "./rubric/index.js";

/** LLM Cost-Performance Optimizer — Thompson Sampling model selection with cost tracking. */
export {
  recordMeasurement,
  selectModel as selectOptimalModel,
  getRoutingRecommendations,
  generateCostReport,
  getArmStats,
  costReportToMarkdown,
  clearOptimizerData,
  QualityMeasurementSchema,
  ArmStatsSchema,
  RoutingDecisionSchema,
  CostReportSchema,
} from "./cost-optimizer/index.js";
export type {
  QualityMeasurement,
  ArmStats,
  RoutingDecision,
  CostReport,
} from "./cost-optimizer/index.js";

/** Team Innovation DNA Profiler — behavioral analytics with Shannon entropy blind spot detection. */
export {
  recordActivity,
  recordActivities,
  buildMemberProfile,
  analyzeTeamDNA,
  teamDNAToMarkdown,
  shannonEntropy,
  clearTeamDNAData,
  MemberProfileSchema,
  BlindSpotSchema,
  TeamDNASchema,
} from "./team-dna/index.js";
export type {
  MemberProfile,
  BlindSpot,
  TeamDNA,
  MemberActivity,
} from "./team-dna/index.js";

/** Innovation Supply Chain Mapper — build/buy/partner classification with gap analysis. */
export {
  mapSupplyChain,
  getSupplyChainMap,
  listSupplyChainMaps,
  supplyChainToMarkdown,
  clearSupplyChainData,
  SupplyChainItemSchema,
  SupplyChainGapSchema,
  SupplyChainMapSchema,
} from "./supply-chain/index.js";
export type {
  SupplyChainItem,
  SupplyChainGap,
  SupplyChainMap,
} from "./supply-chain/index.js";

/** Adaptive Context Window Manager — smart prompt compression with relevance scoring. */
export {
  manageContext,
  createSegment,
  estimateTokens,
  getModelTokenLimit,
  computeRelevance,
  extractiveCompress,
  hierarchicalCompress,
  getCompressionHistory,
  clearContextManagerData,
  DEFAULT_BUDGETS,
  ContextBudgetSchema,
  ContextSegmentSchema,
  CompressionResultSchema,
  ContextStatusSchema,
} from "./context-manager/index.js";
export type {
  ContextBudget,
  ContextSegment,
  CompressionResult,
  ContextStatus,
} from "./context-manager/index.js";
