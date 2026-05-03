// Core types
export * from "./types.js";

// Copilot client
export {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "./copilot/client.js";

// Re-export GenerateOptions for consumers that need the type
export type { GenerateOptions } from "./copilot/client.js";

// Innovation engine
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
} from "./innovation/index.js";
export type { ComparativeProgress, ComparativeSynthesis } from "./innovation/index.js";

// Prompts (for advanced usage)
export { buildInvestigationPrompt, buildSynthesisPrompt } from "./prompts/investigation.js";
export { sanitizeUserInput, wrapUserInput, sanitizeLlmOutput } from "./prompts/sanitize.js";

// Retry utility
export { withRetry } from "./copilot/retry.js";
export type { RetryOptions } from "./copilot/retry.js";

// Plugin system
export {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  getPluginsByType,
  clearPlugins,
  loadPlugin,
} from "./plugins/index.js";

// Presets
export {
  BUILT_IN_PRESETS,
  getPresets,
  getPresetById,
  getPresetsByCategory,
  getPresetsByTag,
} from "./presets/index.js";

// History
export {
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  querySessions,
  compareSessions,
} from "./history/index.js";

// Export
export {
  exportToMarkdown,
  exportToJson,
  generateGitHubIssueBody,
  exportToClipboard,
} from "./export/index.js";
export type { ExportResult, IntegrationAdapter } from "./export/index.js";

// Models
export {
  getModelRegistry,
  registerModel,
  getModelCapability,
  getSmartRouting,
  compareModels,
  clearCustomModels,
} from "./models/index.js";

// Visualization
export { buildIdeaGraph, getAngleColor } from "./visualization/index.js";
export type { IdeaNode, IdeaEdge, IdeaGraph } from "./visualization/index.js";

// Extension
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
export type { SlashCommand, ChatResponse, CopilotAgentConfig, CopilotCommandDef } from "./extension/index.js";

// Collaboration
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

// Scoring
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

// Conversation
export {
  createConversation,
  getConversation,
  deleteConversation,
  listConversations,
  refineConversation,
  clearConversations,
  ConversationMessageSchema,
  RefinementResponseSchema,
} from "./conversation/index.js";
export type {
  ConversationMessage,
  ConversationContext,
  RefinementResponse,
} from "./conversation/index.js";

// Providers
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

// Workspaces
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

// Artifacts
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

// Knowledge Graph
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

// Benchmark
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

// Content Extractors
export {
  extractContent,
  buildSubjectFromContent,
  registerExtractor,
  UrlExtractor,
  FileExtractor,
  CodeRepoExtractor,
} from "./extractors/index.js";
export type { ExtractedContent, ExtractorOptions, ContentExtractor } from "./extractors/index.js";

// Validation
export {
  validateIdea,
  validateIdeas,
  registerValidator,
  unregisterValidator,
  listValidators,
  clearValidators,
  PatentValidator,
  MarketValidator,
  FeasibilityValidator,
  ValidationCheckSchema,
  ValidationResultSchema,
  ValidationScorecardSchema,
} from "./validation/index.js";
export type {
  ValidationCheck,
  ValidationResult,
  ValidationScorecard,
  IdeaValidator,
} from "./validation/index.js";

// Replay & A/B Testing
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
  PromptRecordSchema,
  RunRecordSchema,
  RunComparisonSchema,
} from "./replay/index.js";
export type { PromptRecord, RunRecord, RunComparison, ReplayOverrides } from "./replay/index.js";

// Audience-Adaptive Output
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

// Idea Dependency Graph
export {
  buildIdeaDependencyGraph,
  dependencyGraphToMarkdown,
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

// Market Signals
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

// Sprint Mode
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

// Idea Deduplication & Clustering
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

// Sharing
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

// Voice
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

// Compliance & IP Guard Rails
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

// Depth Tiers
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

// Angle Chaining
export {
  DEFAULT_CHAINS,
  AngleChainSchema,
  AngleChainStepSchema,
  runChain,
  getChainById,
  listChains,
} from "./chaining/index.js";
export type { AngleChain, AngleChainStep, ChainProgress } from "./chaining/index.js";

// Feedback
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

// Internationalization
export {
  detectLanguage,
  localizePrompt,
  listLanguages,
  getLanguageConfig,
  SUPPORTED_LANGUAGES,
  SupportedLanguageSchema,
} from "./i18n/index.js";
export type { SupportedLanguage, LanguageConfig } from "./i18n/index.js";

// Idea Fitness Tracker
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

// Offline / Local-First
export {
  detectOllama,
  checkNetworkStatus,
  getOfflineStatus,
  getRecommendedModel,
  RECOMMENDED_MODELS,
} from "./offline/index.js";
export type { OllamaStatus, OfflineStatus, RecommendedModel } from "./offline/index.js";

// RAG / Knowledge Grounding
export {
  KnowledgeBase,
  loadDocument,
  chunkText,
  generateEmbedding,
  cosineSimilarity,
  DocumentTypeSchema,
  DocumentChunkSchema,
  KnowledgeDocumentSchema,
  KnowledgeBaseConfigSchema,
  DEFAULT_CHUNKING_OPTIONS,
} from "./rag/index.js";
export type {
  DocumentType,
  DocumentChunk,
  KnowledgeDocument,
  KnowledgeBaseConfig,
  SearchResult,
  ChunkingOptions,
} from "./rag/index.js";

// Cost Tracking & Budget Management
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

// Deep Research
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

// Portfolio
export {
  addPortfolioItem,
  getPortfolioItem,
  transitionItem,
  updatePortfolioItem,
  deletePortfolioItem,
  listPortfolioItems,
  getPortfolioMetrics,
  generatePortfolioInsights,
} from "./portfolio/index.js";
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

// Theming / White-Label
export {
  loadTheme,
  clearThemeCache,
  setTheme,
  themeToCssVars,
  getPromptPreamble,
} from "./theming/index.js";
export { ThemeConfigSchema, DEFAULT_THEME } from "./theming/types.js";
export type { ThemeConfig } from "./theming/types.js";

// Event Bus & Webhooks
export {
  EventBus,
  getEventBus,
  resetEventBus,
  WebhookManager,
  EventTypeSchema,
  PipelineEventSchema,
  WebhookConfigSchema,
} from "./events/index.js";
export type {
  EventType,
  PipelineEvent,
  WebhookConfig,
  WebhookDelivery,
  DeadLetterEntry,
} from "./events/index.js";

// Analytics
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

// Coaching
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

// Recommendation (Smart Angle Selection)
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

// Mining (Cross-Investigation Pattern Mining)
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

// Temporal Innovation Lens
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

// Simulation (Stakeholder + Scenario)
export {
  simulatePersonaReaction,
  simulateStakeholders,
  simulateStakeholdersBatch,
  DEFAULT_PERSONAS,
  StakeholderPersonaSchema,
  StakeholderReactionSchema,
  StakeholderSimulationSchema,
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
  ScenarioType,
  AdoptionDataPoint,
  ScenarioProjection,
  SensitivityFactor,
  ScenarioModel,
} from "./simulation/index.js";

// Gallery (Idea Marketplace)
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

// Gamification
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

// Sustainability (ESG Assessment)
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

// Versioning (Semantic Idea Version Control)
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

// Fingerprint (Idea DNA)
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

// Red Team (Adversarial Analysis)
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

// Industry Vertical Packs
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

// Memory & Learning
export {
  recordSignal,
  getUserSignals,
  buildPreferenceProfile,
  getPreferenceProfile,
  buildPreferenceContext,
  assignABTest,
  getABTestVariant,
  clearMemory,
  UserSignalSchema,
  PreferenceWeightsSchema,
  UserPreferenceProfileSchema,
  ABTestAssignmentSchema,
  ABTestResultSchema,
} from "./memory/index.js";
export type {
  UserSignal,
  PreferenceWeights,
  UserPreferenceProfile,
  ABTestAssignment,
  ABTestResult,
} from "./memory/index.js";

// Hypothesis-Driven Innovation
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

// Workflow (Innovation Sprints as Code)
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

// Competitive Intelligence
export {
  analyzeCompetitors,
  getCompetitiveAnalysis,
  listCompetitiveAnalyses,
  clearCompetitiveAnalyses,
  rankGaps,
  rankStrategies,
  generatePositioningMatrix,
  CompetitorProfileSchema,
  CompetitiveGapSchema,
  DifferentiationStrategySchema,
  FlankingOpportunitySchema,
  CompetitiveAnalysisSchema,
} from "./competitive/index.js";
export type {
  CompetitorProfile,
  CompetitiveGap,
  DifferentiationStrategy,
  FlankingOpportunity,
  CompetitiveAnalysis,
} from "./competitive/index.js";

// Impact Simulator
export {
  simulateImpact,
  getSimulation,
  listSimulations,
  clearSimulations,
  calculateTotalResourceCost,
  getGoNoGoMilestones,
  calculateExpectedROI,
  generateTimeline,
  MonthlyDataPointSchema,
  MilestoneSchema,
  ResourceRequirementSchema,
  DecisionPointSchema,
  ScenarioSimulationSchema,
  ImpactSimulationSchema,
} from "./impact-simulator/index.js";
export type {
  MonthlyDataPoint,
  Milestone,
  ResourceRequirement,
  DecisionPoint,
  ScenarioSimulation,
  ImpactSimulation,
} from "./impact-simulator/index.js";

// Vision (Multi-Modal Input)
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

// Retrospective Engine
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

// Natural Language Pipeline Builder
export {
  parsePipelineRequest,
  resolvePhases,
  resolveAngles,
  PipelineConfigSchema,
  PipelinePhaseSchema,
  OutputFormatSchema as PipelineOutputFormatSchema,
} from "./pipeline-builder/index.js";
export type {
  PipelineConfig,
  PipelinePhase,
  OutputFormat as PipelineOutputFormat,
} from "./pipeline-builder/index.js";

// Innovation Diff
export {
  runInnovationDiff,
  buildDiffPrompt,
  DiffResultSchema,
  DiffItemSchema,
} from "./diff/index.js";
export type { DiffResult, DiffItem } from "./diff/index.js";

// Idea Provenance
export {
  buildProvenanceRecords,
  createProvenanceChain,
  buildProvenanceTree,
  getIdeaProvenance,
  formatProvenance,
  hashPrompt,
  estimateInputTokens,
  ProvenanceRecordSchema,
  ProvenanceChainSchema,
} from "./provenance/index.js";
export type {
  ProvenanceRecord,
  ProvenanceChain,
  ProvenanceTreeNode,
} from "./provenance/index.js";

// Constraint Satisfaction Optimizer
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

// Cross-Session Serendipity Engine
export {
  findSerendipitousConnections,
  embedSession,
  SerendipitousConnectionSchema,
  SerendipityResultSchema,
} from "./serendipity/index.js";
export type {
  SerendipitousConnection,
  SerendipityResult,
} from "./serendipity/index.js";

// Investigation Confidence Scoring
export {
  scoreInvestigationQuality,
  formatGapSuggestions,
  meetsConfidenceThreshold,
  ConfidenceScoreSchema,
  ConfidenceDimensionSchema,
  KnowledgeGapSchema,
} from "./confidence/index.js";
export type {
  ConfidenceScore,
  ConfidenceDimension,
  KnowledgeGap,
} from "./confidence/index.js";

// Embeddable Widget SDK
export {
  generateEmbedCode,
  getWidgetSource,
  WIDGET_SOURCE,
} from "./widget/index.js";

// Idea Genealogy — Evolution Tracking
export {
  compareInvestigationRuns,
  findPreviousInvestigation,
  IdeaStatusSchema,
  IdeaEvolutionSchema,
  GenealogyResultSchema,
} from "./genealogy/index.js";
export type {
  IdeaStatus,
  IdeaEvolution,
  GenealogyResult,
} from "./genealogy/index.js";

// LLM Output Quality Gate
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

// Innovation Playbook Generator
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
