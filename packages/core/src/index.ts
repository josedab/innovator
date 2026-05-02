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
} from "./extension/index.js";
export type { SlashCommand, ChatResponse } from "./extension/index.js";

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
