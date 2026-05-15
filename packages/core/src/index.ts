/** Core domain types — Investigation, AngleResult, Synthesis, PipelineProgress, and all shared interfaces. */
export * from "./types.js";

/** GitHub Copilot LLM client — text generation, streaming, and JSON extraction. */
export {
  /** Initialize and return a shared Copilot LLM client instance. */
  getCopilotClient,
  /** Shut down the Copilot LLM client and release resources. */
  stopCopilotClient,
  /** Generate a complete text response from the LLM. */
  generateText,
  /** Stream text tokens from the LLM via an async iterable. */
  generateTextStream,
  /** Extract and parse a JSON object from an LLM text response. */
  extractJson,
} from "./copilot/client.js";

/** Options for {@link generateText} and {@link generateTextStream}. */
export type { GenerateOptions } from "./copilot/client.js";

/** Innovation engine — angles, investigation, generation, synthesis, custom angles, and angle packs. */
export {
  /** Built-in innovation angle definitions (SCAMPER, First Principles, etc.). */
  ANGLES,
  /** Look up a built-in angle by its ID. */
  getAngleById,
  /** Run an LLM investigation on a subject, producing structured findings. */
  investigate,
  /** Generate innovation ideas for a single angle given an investigation. */
  generateForAngle,
  /** Execute the full auto pipeline: investigate → generate → synthesize. */
  runAutoPipeline,
  /** Load user-defined custom angles from the local store. */
  loadCustomAngles,
  /** Persist a new custom angle definition. */
  addCustomAngle,
  /** Delete a custom angle by ID. */
  removeCustomAngle,
  /** Retrieve a single custom angle by ID. */
  getCustomAngle,
  /** Update an existing custom angle definition. */
  updateCustomAngle,
  /** Serialize custom angles to a portable angle-pack JSON structure. */
  exportAnglePack,
  /** Import angles from an angle-pack, skipping duplicates. */
  importAnglePack,
  /** Build the LLM prompt for a custom angle template. */
  buildCustomAnglePrompt,
  /** Run the same subject through multiple models and compare results. */
  runComparativePipeline,
  /** Build the synthesis prompt for comparative pipeline results. */
  buildComparativeSynthesisPrompt,
  /** Investigate a subject with multiple angles in parallel. */
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
export {
  /** Build the structured prompt sent to the LLM for subject investigation. */
  buildInvestigationPrompt,
  /** Build the prompt that synthesizes multiple angle results into top ideas. */
  buildSynthesisPrompt,
} from "./prompts/investigation.js";
/** Prompt sanitization — defense against prompt injection attacks. */
export {
  /** Strip potentially dangerous tokens from user-supplied text before LLM calls. */
  sanitizeUserInput,
  /** Wrap user input in delimiters to reduce prompt injection risk. */
  wrapUserInput,
  /** Sanitize LLM output before displaying to users. */
  sanitizeLlmOutput,
} from "./prompts/sanitize.js";

/** Retry utility with exponential backoff for unreliable async operations. */
export { withRetry } from "./copilot/retry.js";
/** Configuration options for {@link withRetry}. */
export type { RetryOptions } from "./copilot/retry.js";

/** Plugin system — register, discover, and load angle/exporter/visualizer plugins. */
export {
  /** Register a plugin instance in the global plugin registry. */
  registerPlugin,
  /** Remove a plugin from the registry by ID. */
  unregisterPlugin,
  /** Retrieve a registered plugin by ID. */
  getPlugin,
  /** List all currently registered plugins. */
  listPlugins,
  /** Filter registered plugins by type (angle, exporter, visualizer). */
  getPluginsByType,
  /** Remove all plugins from the registry. */
  clearPlugins,
  /** Dynamically load a plugin from a file path or npm package name. */
  loadPlugin,
} from "./plugins/index.js";

/** Domain presets — pre-configured angle sets for common innovation domains. */
export {
  /** All built-in preset definitions. */
  BUILT_IN_PRESETS,
  /** Retrieve all available presets (built-in + user-defined). */
  getPresets,
  /** Look up a single preset by its ID. */
  getPresetById,
  /** Filter presets by category (e.g. "product", "sustainability"). */
  getPresetsByCategory,
  /** Filter presets by tag. */
  getPresetsByTag,
} from "./presets/index.js";

/** Session history — save, query, and compare innovation sessions. */
export {
  /** Persist an innovation session to the local store. */
  saveSession,
  /** Retrieve a session by ID. */
  getSession,
  /** Update metadata (tags, notes) on an existing session. */
  updateSession,
  /** Delete a session by ID. */
  deleteSession,
  /** List all saved sessions ordered by creation date. */
  listSessions,
  /** Search sessions by subject, tags, or content. */
  querySessions,
  /** Compare two sessions side-by-side. */
  compareSessions,
} from "./history/index.js";

/** Export — render sessions as Markdown, JSON, GitHub Issues, PowerPoint, Jira, Confluence, Notion, and Google Slides. */
export {
  /** Export a session to a Markdown document. */
  exportToMarkdown,
  /** Export a session to a JSON file. */
  exportToJson,
  /** Generate a GitHub Issue body from session data. */
  generateGitHubIssueBody,
  /** Copy session output to the system clipboard. */
  exportToClipboard,
  /** Export a session as a PowerPoint (.pptx) presentation. */
  exportToPowerPoint,
  /** Export a session to Jira via the integration adapter. */
  exportToJira,
  /** Export a session to Confluence via the integration adapter. */
  exportToConfluence,
  /** Export a session to Notion via the integration adapter. */
  exportToNotion,
  /** Export a session to Google Slides via the integration adapter. */
  exportToGoogleSlides,
  /** List all supported export format identifiers. */
  getAvailableFormats,
} from "./export/index.js";
export type { ExportResult, IntegrationAdapter } from "./export/index.js";

/** LLM model registry — capabilities, smart routing, and model comparison. */
export {
  /** Return the full model registry (built-in + custom models). */
  getModelRegistry,
  /** Register a custom model definition. */
  registerModel,
  /** Query a model's capabilities (context window, streaming, etc.). */
  getModelCapability,
  /** Get the recommended model for a given task based on smart routing rules. */
  getSmartRouting,
  /** Compare two or more models by capability matrix. */
  compareModels,
  /** Remove all user-registered custom models. */
  clearCustomModels,
} from "./models/index.js";

/** Visualization — build idea relationship graphs with nodes and edges. */
export {
  /** Build a graph of idea nodes and edges from angle results. */
  buildIdeaGraph,
  /** Get the display color associated with a given angle ID. */
  getAngleColor,
} from "./visualization/index.js";
export type { IdeaNode, IdeaEdge, IdeaGraph } from "./visualization/index.js";

/** Fitness Landscape — 3D idea plotting, terrain mesh, clustering, gap detection. */
export {
  generateFitnessLandscape,
  addEvolutionTrail,
  getGapInvestigationSuggestions,
} from "./visualization/fitness-landscape.js";
export type {
  FitnessPoint,
  TerrainVertex,
  LandscapeCluster,
  EvolutionTrail,
  GapRegion,
  FitnessLandscape,
} from "./visualization/fitness-landscape.js";

/** Copilot Extension — slash commands, chat formatters, and agent manifests for GitHub Copilot integration. */
export {
  /** Parse a slash command string into a structured command object. */
  parseSlashCommand,
  /** Format investigation results for GitHub Copilot chat display. */
  formatInvestigationForChat,
  /** Format angle results for GitHub Copilot chat display. */
  formatAngleResultsForChat,
  /** Format synthesis output for GitHub Copilot chat display. */
  formatSynthesisForChat,
  /** Format pipeline progress updates for GitHub Copilot chat display. */
  formatProgressForChat,
  /** Format the available angles list for GitHub Copilot chat display. */
  formatAnglesForChat,
  /** Format the presets list for GitHub Copilot chat display. */
  formatPresetsForChat,
  /** Format the help text for GitHub Copilot chat display. */
  formatHelpForChat,
  /** GitHub App manifest template for Copilot extension registration. */
  GITHUB_APP_MANIFEST,
  /** Generate the Copilot agent manifest JSON for a given configuration. */
  getCopilotAgentManifest,
  /** Main request handler for incoming Copilot extension requests. */
  handleCopilotRequest,
  /** Wrap content in a collapsible details/summary block. */
  formatWithCollapsible,
  /** Build an SSE streaming response for Copilot chat. */
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
  /** Create a new collaborative brainstorming session. */
  createSession as createCollaborativeSession,
  /** Look up a collaborative session by its short join code. */
  findSessionByCode,
  /** Retrieve a collaborative session by ID. */
  getCollaborativeSession,
  /** Add a participant to a collaborative session. */
  joinSession,
  /** Remove a participant from a collaborative session. */
  leaveSession,
  /** Assign innovation angles to session participants. */
  assignAngles,
  /** Transition a collaborative session to the active/running state. */
  startSession,
  /** Submit a new idea to a collaborative session. */
  submitIdea,
  /** Cast an upvote for an idea in a collaborative session. */
  voteForIdea,
  /** Add a comment to an idea in a collaborative session. */
  addComment,
  /** Merge two or more ideas into a combined idea. */
  mergeIdeas,
  /** Mark a collaborative session as complete. */
  completeSession,
  /** Register a listener for real-time session events. */
  onSessionEvent,
  /** Return ideas ranked by vote count. */
  getRankedIdeas,
  /** Delete a collaborative session and all its data. */
  deleteCollaborativeSession,
  /** Remove all collaborative sessions (useful for testing). */
  clearAllSessions,
} from "./collaboration/index.js";

/** Idea scoring — novelty, feasibility, impact scoring and priority quadrant classification. */
export {
  /** Score a set of ideas across configured dimensions. */
  scoreIdeas,
  /** Compute a weighted priority score from individual dimension scores. */
  computePriorityScore,
  /** Classify an idea into a priority quadrant (quick-win, strategic, etc.). */
  getQuadrant,
  /** Rank ideas by composite score. */
  rankIdeas,
  /** Score ideas using a configurable scoring engine with custom dimensions. */
  scoreWithEngine,
  /** Record user calibration feedback to improve future scoring accuracy. */
  recordCalibrationFeedback,
  /** Reset all calibration data. */
  clearCalibration,
  /** Default scoring dimension definitions (novelty, feasibility, impact). */
  DEFAULT_SCORING_DIMENSIONS,
  /** Zod schema for a single idea score. */
  IdeaScoreSchema,
  /** Zod schema for a full scoring result. */
  ScoringResultSchema,
  /** Zod schema for a scoring dimension definition. */
  ScoringDimensionSchema,
  /** Zod schema for scoring engine configuration. */
  ScoringEngineConfigSchema,
  /** Zod schema for a multi-dimensional score. */
  MultiDimensionalScoreSchema,
  /** Ordered list of time-to-implement categories for sorting. */
  TIME_TO_IMPLEMENT_ORDER,
} from "./scoring/index.js";
export type {
  IdeaScore,
  ScoringResult,
  ScoringDimension,
  ScoringEngineConfig,
  MultiDimensionalScore,
} from "./scoring/index.js";

/** Interactive refinement conversations — iterative deepening with branching exploration trees. */
export {
  /** Start a new refinement conversation for an idea or topic. */
  createConversation,
  /** Retrieve a conversation by ID. */
  getConversation,
  /** Delete a conversation by ID. */
  deleteConversation,
  /** List all active conversations. */
  listConversations,
  /** Send a follow-up message to deepen or redirect a conversation. */
  refineConversation,
  /** Remove all conversations. */
  clearConversations,
  /** Create a branching exploration tree rooted at an idea. */
  createExplorationTree,
  /** Retrieve an exploration tree by ID. */
  getExplorationTree,
  /** Expand a node in the exploration tree with a deeper investigation. */
  drillDown,
  /** Get the path from root to a specific exploration node. */
  getExplorationPath,
  /** List the child branches of an exploration node. */
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
  generateTraceableArtifact,
  generateProjectBoard,
  projectBoardToMarkdown,
  ArtifactSchema,
  ARTIFACT_TYPES,
} from "./artifacts/index.js";
export type {
  Artifact,
  ArtifactType,
  ArtifactContext,
  TraceableArtifact,
  ProjectBoard,
  ProjectBoardColumn,
} from "./artifacts/index.js";

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

/** Cross-Session Knowledge Intelligence — entity resolution, temporal evolution, contextual retrieval. */
export {
  resolveEntities,
  getTemporalEvolution,
  findRelevantDiscoveries,
  generateKnowledgeInsights,
  clusterEntities,
} from "./knowledge-graph/index.js";
export type {
  TemporalEvolution,
  ContextualMatch,
  KnowledgeInsight,
  EntityCluster,
} from "./knowledge-graph/index.js";

/** Benchmark — evaluate and compare innovation quality across LLM models. */
export {
  runBenchmark,
  evaluateAngleResult,
  benchmarkToMarkdown,
  EVALUATION_CRITERIA,
  CANONICAL_SUBJECTS,
  IdeaEvaluationSchema,
  ModelBenchmarkSchema,
  BenchmarkReportSchema,
  BenchmarkMetricsSchema,
  StatisticalSignificanceSchema,
  RadarChartAxisSchema,
  RadarChartSeriesSchema,
  RadarChartDataSchema,
  ComparativeReportSchema,
  BenchmarkSuiteResultSchema,
  computeBenchmarkMetrics,
  computeStatisticalSignificance,
  generateRadarChartData,
  generateComparativeReport,
  runBenchmarkSuite,
} from "./benchmark/index.js";
export type {
  IdeaEvaluation,
  ModelBenchmark,
  BenchmarkReport,
  EvaluationCriterion,
  BenchmarkMetrics,
  StatisticalSignificance,
  RadarChartAxis,
  RadarChartSeries,
  RadarChartData,
  ComparativeReport,
  BenchmarkSuiteResult,
} from "./benchmark/index.js";

/** Benchmark Problems — standardized problems, rubrics, leaderboard, comparison reports. */
export {
  BENCHMARK_PROBLEMS,
  getBenchmarkProblems,
  filterBenchmarkProblems,
  getBenchmarkProblem,
  recordBenchmarkResult,
  getBenchmarkResults,
  getAllBenchmarkResults,
  scoreBenchmarkRun,
  submitToLeaderboard,
  getLeaderboardEntries,
  benchmarkComparisonReport,
  clearBenchmarkState,
} from "./benchmark/problems.js";
export type {
  BenchmarkDomain,
  ScoringRubric as BenchmarkScoringRubric,
  BenchmarkProblem,
  BenchmarkRunResult,
  LeaderboardEntry as BenchmarkLeaderboardEntry,
} from "./benchmark/problems.js";

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
  persistRunRecord,
  persistBranch,
  loadPersistedRuns,
  loadPersistedBranches,
  buildBranchDiff,
  PromptRecordSchema,
  RunRecordSchema,
  RunComparisonSchema,
  TimelineSnapshotSchema,
  TimelineBranchSchema,
} from "./replay/index.js";
export type {
  PromptRecord,
  RunRecord,
  RunComparison,
  ReplayOverrides,
  TimelineSnapshot,
  TimelineBranch,
  BranchDiffView,
} from "./replay/index.js";

/** Replay Events — structured event emission, deterministic replay, scoring overlays. */
export {
  emitReplayEvent,
  onReplayEvent,
  getReplayEvents,
  clearReplayEvents,
  createReplaySession,
  advanceReplaySession,
  pauseReplaySession,
  resumeReplaySession,
  setReplaySpeed,
  seekReplaySession,
  buildScoringOverlay,
  scoringOverlayToMarkdown,
} from "./replay/replay-events.js";
export type {
  ReplayEventType,
  ReplayEvent as ReplayPipelineEvent,
  ReplaySpeed,
  ReplaySession as ReplayPipelineSession,
  ScoringOverlay,
} from "./replay/replay-events.js";

/** Replay Decisions — decision-point recording, branching, and session tree visualization. */
export {
  recordDecisionPoint,
  getDecisionPoints,
  getDecisionPoint,
  branchFromDecision,
  getSessionTree,
  adoptBranch,
  compareBranches,
  branchComparisonToMarkdown,
  buildTimelineView,
  timelineViewToMarkdown,
  persistDecisionPoint,
  persistDecisionBranch,
  loadPersistedDecisionPoints,
  loadPersistedDecisionBranches,
  clearDecisionData,
  DecisionPointSchema as ReplayDecisionPointSchema,
  DecisionBranchSchema,
  BranchComparisonSchema,
  SessionTreeSchema,
  TimelineViewSchema,
} from "./replay-decisions/index.js";
export type {
  DecisionPoint as ReplayDecisionPoint,
  DecisionBranch,
  BranchComparison,
  SessionTree,
  TimelineView,
} from "./replay-decisions/index.js";

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

/** Web Search Grounding — real-time market validation, prior art detection, and competitor monitoring. */
export {
  groundInnovation,
  detectPriorArt,
  monitorCompetitors,
  groundingToMarkdown,
  registerSearchProvider as registerWebSearchProvider,
  listSearchProviders,
  clearSearchProviders,
  SearchResultSchema as GroundingSearchResultSchema,
  PriorArtSchema,
  CompetitorSchema as WebCompetitorSchema,
  MarketValidationSchema,
  WebSearchGroundingSchema,
} from "./web-search/index.js";
export type {
  SearchResult as GroundingSearchResult,
  PriorArt,
  Competitor as WebCompetitor,
  MarketValidation,
  WebSearchGrounding,
  WebSearchProvider,
} from "./web-search/index.js";

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
  analyzeGaps,
  crossSessionDeduplication,
  EmbeddedIdeaSchema,
  IdeaClusterSchema,
  DeduplicationResultSchema,
  GapAnalysisSchema,
} from "./deduplication/index.js";
export type {
  EmbeddedIdea,
  IdeaCluster,
  DeduplicationResult,
  DeduplicationConfig,
  GapAnalysis,
  CrossSessionDedupConfig,
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
  VoiceSessionStateSchema,
  VoiceSessionSchema,
  createVoiceSession,
  getVoiceSession,
  transitionVoiceSession,
  addVoiceTranscript,
  queueNarration,
  dequeueNarration,
  structureThinkingAloud,
  endVoiceSession,
  listVoiceSessions,
  clearVoiceSessions,
} from "./voice/index.js";
export type {
  VoiceCommand,
  VoiceConfig,
  VoiceTranscript,
  ParsedVoiceCommand,
  NarrationSegment,
  VoiceSessionState,
  VoiceSession,
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

/** i18n UI Translations & Cultural Context. */
export {
  getTranslations,
  t as translate,
  getCulturalContext,
  culturalizePrompt,
} from "./i18n/index.js";
export type { UITranslations, CulturalContext } from "./i18n/index.js";

/** Extended i18n — 15 languages, RTL support, framework emphasis, artifact templates. */
export {
  EXTENDED_LANGUAGES,
  isRTL,
  getDirectionStyles,
  getLocalizedFramework,
  localizePromptExtended,
  getLocalizedArtifactTemplate,
  formatLocalizedReport,
  detectExtendedLanguage,
  listExtendedLanguages,
  getExtendedLanguageConfig,
} from "./i18n/extended.js";
export type { ExtendedLanguage, ExtendedLanguageConfig } from "./i18n/extended.js";

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
  ImpactLinkSchema,
  ImpactMetricsSchema,
  ImpactDashboardSchema,
  linkImplementation,
  getImpactLinks,
  setIdeaROI,
  autoDetectLinks,
  buildImpactDashboard,
  clearImpactTracking,
} from "./tracker/index.js";
export type {
  TrackedIdea,
  ExternalStatus,
  TrackerPlatform,
  TrackerDashboard,
  ImpactLink,
  ImpactMetrics,
  ImpactDashboard,
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

/** Offline Vault — sync queue, CRDT merge, encryption, secure export/import. */
export {
  setNodeId,
  getNodeId,
  queueSyncOperation,
  getQueuedOperations,
  getSyncQueue,
  markSynced,
  markFailed,
  retryFailedOperations,
  purgeSyncedOperations,
  compareTimestamps,
  crdtSet,
  crdtDelete,
  crdtGet,
  crdtMerge,
  getCRDTDocument,
  listCRDTDocuments,
  encryptData,
  decryptData,
  exportVault,
  importVault,
  clearVaultState,
} from "./offline/vault.js";
export type {
  SyncOperation as VaultSyncOperation,
  CRDTTimestamp,
  CRDTEntry,
  CRDTDocument,
  ConflictResolution,
  VaultExport,
  EncryptionConfig,
} from "./offline/vault.js";

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
  clusterSessionThemes,
  getConversionMetrics,
} from "./portfolio/index.js";
export type {
  InnovationDashboardData,
  ThemeCluster as PortfolioThemeCluster,
  ConversionMetrics,
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

/** Advanced Analytics — time-series, heatmaps, leaderboards, reports. */
export {
  getTimeSeries,
  getActivityHeatmap,
  getLeaderboard as getAnalyticsLeaderboard,
  generateReport as generateAnalyticsReport,
  reportToMarkdown as analyticsReportToMarkdown,
} from "./analytics/index.js";
export type {
  TimeSeriesDataPoint,
  TimeSeriesResult,
  HeatmapCell as AnalyticsHeatmapCell,
  LeaderboardEntry as AnalyticsLeaderboardEntry,
  AnalyticsReport,
} from "./analytics/index.js";

/** Innovation ROI — calculate return on innovation investment with configurable cost/value models. */
export {
  calculateROI as calculateInnovationROI,
  roiToMarkdown,
  ROIConfigSchema,
  ROIReportSchema,
} from "./analytics/roi.js";
export type { ROIConfig, ROIReport } from "./analytics/roi.js";

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

/** Innovation Profile & Proactive Coaching — persistent user profiles with learning paths. */
export {
  getInnovationProfile,
  recordCoachingSession,
  getProactiveCoaching,
  getCoachingHistory,
  clearCoachingProfiles,
} from "./coaching/index.js";
export type {
  InnovationProfile,
  CoachingSessionRecord,
  ProactiveCoachingSuggestion,
} from "./coaching/index.js";

/** Team Innovation Profile & Proactive Agent — team pattern learning and coaching insights. */
export {
  buildTeamProfile,
  getTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
  clearTeamProfiles,
} from "./coaching/index.js";
export type { TeamInnovationProfile, CoachingInsight } from "./coaching/index.js";

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
  bassDiffusion,
  runMonteCarloSimulation as runInnovationMonteCarloSimulation,
  runSensitivityAnalysis,
  compareMonteCarloScenarios,
  generateProbabilityFan,
  generateTornadoData,
  monteCarloToMarkdown,
  MonteCarloParamsSchema,
  MonteCarloResultSchema as InnovationMonteCarloResultSchema,
  TornadoEntrySchema,
  ScenarioComparisonSchema,
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
  BassDiffusionPoint,
  MonteCarloParams,
  PercentileSet,
  MonteCarloResult as InnovationMonteCarloResult,
  TornadoEntry,
  ScenarioComparison,
  SensitivityRanking,
  FanChartPoint,
  TornadoChartData,
} from "./simulation/index.js";

/** Portfolio Monte Carlo Simulation — multi-idea portfolio optimization with probability distributions. */
export {
  sampleDistribution,
  runPortfolioSimulation,
  portfolioSimToMarkdown,
  DistributionTypeSchema,
  DistributionSchema,
  PortfolioIdeaSchema,
  PortfolioSimConfigSchema,
  IdeaAllocationSchema,
  FrontierPointSchema,
  PortfolioSimResultSchema,
} from "./simulation/index.js";
export type {
  DistributionType,
  Distribution,
  PortfolioIdea,
  PortfolioSimConfig,
  IdeaAllocation,
  FrontierPoint,
  PortfolioSimResult,
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
  cherryPickVersion,
  detectConflicts,
  buildTimeline as buildVersionTimeline,
  compareSideBySide,
  revertToVersion,
  tagVersion,
  getVersionsByTag,
  buildVersionGraph,
  SemanticChangeSchema,
  SemanticDiffSchema,
  IdeaVersionSchema,
  BranchSchema,
  MergeResultSchema,
  ConflictReportSchema,
  TimelineEntrySchema,
  SideBySideFieldSchema,
  SideBySideComparisonSchema,
  VersionGraphSchema,
} from "./versioning/index.js";
export type {
  SemanticChange,
  SemanticDiff,
  IdeaVersion,
  Branch,
  MergeResult,
  ConflictReport,
  TimelineEntry,
  SideBySideField,
  SideBySideComparison,
  VersionGraph,
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

/** Innovation Memory Graph — persistent semantic memory connecting ideas across sessions, teams, and time. */
export {
  autoIndexSession,
  retrieveRelatedMemories,
  detectConvergence,
  generateOrgDNA,
  getIdeaLineage,
  orgDNAToMarkdown,
  getMemoryGraph,
  clearMemoryGraph,
  MemoryNodeSchema,
  MemoryEdgeSchema,
  ThemeClusterSchema,
  BlindSpotSchema as MemoryBlindSpotSchema,
  ConvergencePatternSchema,
  IdeaLineageSchema,
  OrgDNAReportSchema,
  MemoryGraphSchema,
} from "./memory-graph/index.js";
export type {
  MemoryNode,
  MemoryEdge,
  MemoryGraph,
  ThemeCluster,
  BlindSpot as MemoryBlindSpot,
  ConvergencePattern,
  IdeaLineage,
  OrgDNAReport,
  RetrievalOptions,
} from "./memory-graph/index.js";

/** Innovation Learning Loop — cross-session learning that auto-tunes the pipeline based on historical outcome signals. */
export {
  recordOutcome as recordLearningOutcome,
  recordBatchOutcomes,
  getRecommendations as getLearningRecommendations,
  getAnglePerformance as getLearningAnglePerformance,
  getDomainProfile,
  listDomainProfiles,
  getLearningData,
  learningInsightsToMarkdown,
  clearLearningData,
  OutcomeSignalSchema,
  AnglePerformanceSchema as LearningAnglePerformanceSchema,
  DomainProfileSchema,
  LearningRecommendationSchema,
  LearningDataSchema,
} from "./learning-loop/index.js";
export type {
  OutcomeSignal,
  AnglePerformance as LearningAnglePerformance,
  DomainProfile,
  LearningRecommendation,
  LearningData,
} from "./learning-loop/index.js";

/** Innovation Memory Service — stores and retrieves innovation memories with vector similarity search. */
export {
  InnovationMemoryService,
  getMemoryService as getInnovationMemoryService,
  cosineSimilarity as memoryCosineSimilarity,
  InnovationMemoryEntrySchema,
  MemoryQueryOptionsSchema,
  AngleEffectivenessSchema as MemoryAngleEffectivenessSchema,
  BiasEntrySchema,
  RecommendationSchema as InnovationRecommendationSchema,
  MidSessionNudgeSchema,
} from "./learning-loop/memory-service.js";
export type {
  InnovationMemoryEntry,
  MemoryQueryOptions,
  AngleEffectiveness as MemoryAngleEffectiveness,
  BiasEntry,
  Recommendation as InnovationRecommendation,
  MidSessionNudge,
  SessionContext,
} from "./learning-loop/memory-service.js";

/** Pipeline Instrumenter — records timing and quality metrics for innovation pipeline stages. */
export {
  PipelineInstrumenter,
  getInstrumenter,
  PipelineEventSchema as InstrumenterPipelineEventSchema,
  PipelineStageSchema as InstrumenterPipelineStageSchema,
  QualityMetricsSchema as InstrumenterQualityMetricsSchema,
  AggregateOptionsSchema,
  AggregateMetricsSchema as InstrumenterAggregateMetricsSchema,
} from "./learning-loop/pipeline-instrumenter.js";
export type {
  PipelineEvent as InstrumenterPipelineEvent,
  PipelineStage as InstrumenterPipelineStage,
  QualityMetrics as InstrumenterQualityMetrics,
  AggregateOptions,
  AggregateMetrics as InstrumenterAggregateMetrics,
} from "./learning-loop/pipeline-instrumenter.js";
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

/** Automated Innovation Experiments — A/B prompt testing with statistical analysis. */
export {
  createExperiment as createInnovationExperiment,
  getExperiment as getInnovationExperiment,
  listExperiments as listInnovationExperiments,
  deleteExperiment as deleteInnovationExperiment,
  clearExperiments as clearInnovationExperiments,
  runExperiment as runInnovationExperiment,
  generateStatisticalReport,
  compareVariants,
  experimentToMarkdown,
  ExperimentStatusSchema as InnovationExperimentStatusSchema,
  PromptVariantSchema as InnovationPromptVariantSchema,
  ExperimentResultSchema as InnovationExperimentResultSchema,
  ExperimentHypothesisSchema,
  StatisticalReportSchema,
  ExperimentSchema as InnovationExperimentSchema,
} from "./experiments/index.js";
export type {
  ExperimentStatus as InnovationExperimentStatus,
  PromptVariant as InnovationPromptVariant,
  ExperimentResult as InnovationExperimentResult,
  ExperimentHypothesis,
  StatisticalReport,
  Experiment as InnovationExperiment,
  ExperimentConfig as InnovationExperimentConfig,
  ExperimentProgressCallback as InnovationExperimentProgressCallback,
} from "./experiments/index.js";

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

/** Workflow DAG Templates — 5 starter templates for common innovation workflows. */
export {
  listWorkflowTemplates as listWorkflowStarterTemplates,
  getWorkflowTemplate as getWorkflowStarterTemplate,
  getTemplatesByCategory as getStarterTemplatesByCategory,
  WORKFLOW_TEMPLATES,
} from "./workflow/templates.js";
export type { WorkflowTemplate as WorkflowStarterTemplate } from "./workflow/templates.js";

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
  recordCompetitiveSignal,
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
  analyzeAnglePerformance,
  testPatternSignificance,
  generateAutoConfig,
  linkOutcomeToImplementation,
  getImplementationLinks,
  predictIdeaSuccess,
  compareRetrospectives,
  retrospectiveToMarkdown,
  IdeaOutcomeSchema,
  SuccessPatternSchema,
  FailureModeSchema,
  VelocityTrendSchema,
  DiminishingReturnsSchema,
  RetrospectiveReportSchema,
  AnglePerformanceSchema,
  AutoConfigSchema,
  ImplementationLinkSchema,
  IdeaPredictionSchema,
  RetrospectiveComparisonSchema,
} from "./retrospective/index.js";
export type {
  IdeaOutcome,
  SuccessPattern,
  FailureMode,
  VelocityTrend,
  DiminishingReturns,
  RetrospectiveReport,
  AnglePerformance,
  AutoConfig,
  ImplementationLink,
  IdeaPrediction,
  RetrospectiveComparison,
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

/** Innovation Diff & Merge — semantic session comparison and merge operations. */
export {
  runSemanticDiff,
  autoMerge,
  resolveConflict,
  diffReportToMarkdown,
  mergeResultToMarkdown,
  SemanticDiffItemSchema,
  SemanticDiffReportSchema,
  MergeConflictSchema,
  MergedIdeaSchema,
  MergeResultSchema as DiffMergeMergeResultSchema,
  SessionSnapshotSchema,
} from "./diff-merge/index.js";
export type {
  SemanticDiffItem,
  SemanticDiffReport,
  MergeConflict,
  MergedIdea,
  MergeResult as DiffMergeMergeResult,
  SessionSnapshot,
} from "./diff-merge/index.js";

/** Innovation-as-Code — version-controlled innovation workflows with .innovator/ directory. */
export {
  createIaCSession,
  sessionFileName,
  diffSessions,
  formatSessionDiff,
  ideaToGitHubIssue,
  listIaCSessions,
  validateIaCSession,
  validateIaCConfig,
  iacSessionToRecord,
  recordToIaCSession,
  IaCConfigSchema,
  IaCSessionSchema,
  IaCSessionMetadataSchema,
  DEFAULT_IAC_CONFIG,
  DEFAULT_CONFIG_YAML,
  DEFAULT_ANGLES_YAML,
} from "./innovation-as-code/index.js";
export type {
  IaCConfig,
  IaCSession,
  IaCSessionMetadata,
  SessionDiff,
  SessionDiffEntry,
} from "./innovation-as-code/index.js";

/** Novelty Oracle — prior art search, novelty scoring, patent candidate identification. */
export {
  assessNovelty,
  generateNoveltyReport,
  noveltyReportToMarkdown,
  registerPriorArtProvider,
  addPriorArt,
  clearPriorArt,
  getPriorArtCount,
  PriorArtSourceSchema,
  PriorArtEntrySchema,
  NoveltyAssessmentSchema,
  NoveltyReportSchema,
} from "./novelty-oracle/index.js";
export type {
  PriorArtSource,
  PriorArtEntry,
  NoveltyAssessment,
  NoveltyReport,
  PriorArtProvider,
} from "./novelty-oracle/index.js";

/** Novelty Oracle — external prior art search providers (USPTO, Semantic Scholar). */
export {
  USPTOProvider,
  SemanticScholarProvider,
  CompositeProvider,
  createDefaultProviders,
} from "./novelty-oracle/index.js";

/** Novelty Oracle — pipeline enrichment for auto-scoring ideas. */
export {
  enrichSynthesisWithNovelty,
  enrichAngleResultsWithNovelty,
} from "./novelty-oracle/index.js";
export type { NoveltyEnrichedIdea, NoveltyEnrichedSynthesis } from "./novelty-oracle/index.js";

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
export type {
  ProvenanceRecord,
  ProvenanceChain,
  ProvenanceTreeNode,
  LineageNode,
  LineageEdge,
} from "./provenance/index.js";

/** Interactive Idea Negotiation — multi-turn structured dialogue for collaborative idea refinement. */
export {
  startNegotiation,
  negotiateStep,
  getNegotiation,
  listNegotiations,
  completeNegotiation,
  computeIdeaDeltaScore,
  cleanupExpiredNegotiations,
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
export {
  generateEmbedCode,
  getWidgetSource,
  WIDGET_SOURCE,
  createMicroApp,
  getMicroApp,
  listMicroApps,
  deleteMicroApp,
  clearMicroApps,
  generateInstallCode,
  MicroAppTypeSchema,
  MicroAppConfigSchema,
} from "./widget/index.js";
export type { MicroAppType, MicroAppConfig } from "./widget/index.js";

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

/** Innovation Governance Board — approval workflows, stage gates, SLA tracking, bottleneck detection. */
export {
  createStageGate,
  getStageGate,
  listStageGates,
  registerGovReviewer,
  getGovReviewer,
  listGovReviewers,
  checkQualityGate,
  createApprovalRequest,
  submitEvaluation,
  batchDecision,
  escalateRequest,
  getApprovalRequest,
  listApprovalRequests,
  computeGovernanceMetrics,
  governanceSummaryToMarkdown,
  clearGovernanceState,
} from "./governance/board.js";
export type {
  ApprovalStatus,
  WorkflowType,
  StageGate,
  GovReviewer,
  EvaluationForm,
  ApprovalRequest,
  GovernanceMetrics,
} from "./governance/board.js";

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
  WebhookSubscriptionSchema,
  createWebhookSubscription,
  listWebhookSubscriptions,
  getWebhookSubscription,
  deleteWebhookSubscription,
  toggleWebhookSubscription,
  dispatchWebhookEvent,
  ApiVersionSchema,
  API_VERSIONS,
  getApiVersionInfo,
  listApiVersions,
  RateLimitConfigSchema,
  getEndpointRateLimit,
  checkUsageRateLimit,
} from "./api-gateway/index.js";
export type {
  BillingTier,
  ApiKey,
  UsageRecord,
  UsageSummary,
  WebhookEvent,
  Tenant,
  DeveloperPortalInfo,
  WebhookSubscription,
  ApiVersion,
  RateLimitConfig,
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

/** Adaptive Innovation Methodology — ML-driven learning of optimal angles, prompts, and configs per domain. */
export {
  recordEffectiveness,
  getEffectivenessHistory,
  getAngleRecommendations,
  getPipelineRecommendation,
  explainRecommendation,
  recordFeedback,
  recalculateProfiles,
  createMethodologyExperiment,
  getExperimentResults,
  generateMethodologyInsights,
  insightsToMarkdown,
  clearAdaptiveMethodology,
  MethodologyProfileSchema,
  AngleRecommendationSchema as AdaptiveAngleRecommendationSchema,
  PipelineRecommendationSchema,
  EffectivenessRecordSchema,
  ABTestConfigSchema as AdaptiveABTestConfigSchema,
  MethodologyInsightSchema,
  FeedbackRecordSchema,
  ExperimentResultsSchema,
  OptimalConfigSchema,
} from "./adaptive-methodology/index.js";
export type {
  MethodologyProfile,
  AngleRecommendation as AdaptiveAngleRecommendation,
  PipelineRecommendation,
  EffectivenessRecord,
  ABTestConfig as AdaptiveABTestConfig,
  MethodologyInsight,
  FeedbackRecord,
  ExperimentResults,
} from "./adaptive-methodology/index.js";

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
  InMemoryStorageProvider,
} from "./storage/index.js";
export type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
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
export {
  runConsensus,
  consensusToMarkdown,
  runJuryScoring,
  computeKrippendorffsAlpha,
  computeWeightedConsensus,
  analyzeModelDivergence,
  synthesizeJuryVerdict,
} from "./consensus/index.js";
export type {
  ModelResult,
  ConsensusResult,
  ConsensusIdea,
  ConsensusOptions,
  JuryScoringOptions,
  JuryScore,
  JuryVerdict,
  JuryReport,
  DivergenceDetail,
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

/** Enterprise SSO & Governance — SAML/OIDC SSO, compliance, admin dashboard. */
export {
  configureSSOProvider,
  getSSOConfig,
  listSSOConfigs,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  revokeAllUserSessions,
  listManagedUsers,
  suspendUser,
  reactivateUser,
  updateUserRole,
  setComplianceConfig,
  getComplianceConfig,
  generateComplianceReport,
  getOrgStats,
  clearEnterpriseData,
} from "./rbac/index.js";
export type {
  SSOProvider,
  IdentityProvider,
  SSOConfig,
  SSOSession,
  ComplianceFramework,
  DataResidency,
  ComplianceConfig,
  ComplianceReport,
  ComplianceCheck as EnterpriseComplianceCheck,
  OrgStats,
  UserManagementEntry,
} from "./rbac/index.js";

/** SOC 2 Readiness & Enterprise Compliance Policies. */
export {
  initSOC2Tracker,
  getSOC2Readiness,
  updateSOC2Control,
  setDataResidencyPolicy,
  getDataResidencyPolicy,
  setRetentionPolicy,
  getRetentionPolicy,
  setIPPolicy,
  getIPPolicy,
  checkIPAccess,
  setDLPPolicy,
  getDLPPolicy,
  scanForDLPViolations,
  setBrandingConfig as setEnterpriseBrandingConfig,
  getBrandingConfig as getEnterpriseBrandingConfig,
} from "./rbac/index.js";
export type {
  SOC2Category,
  SOC2ControlStatus,
  SOC2Control,
  SOC2Readiness,
  DataResidencyRegion,
  DataResidencyPolicy,
  RetentionPolicy,
  IPRule,
  IPPolicy,
  DLPRuleType,
  DLPRule,
  DLPPolicy,
  BrandingConfig as EnterpriseBrandingConfig,
} from "./rbac/index.js";

/** SCIM Provisioning & Data Residency — SCIM 2.0 user/group lifecycle and data residency controls. */
export {
  scimCreateUser,
  scimGetUser,
  scimUpdateUser,
  scimDeleteUser,
  scimListUsers,
  scimCreateGroup,
  scimGetGroup,
  scimUpdateGroup,
  scimListGroups,
  getDataResidency,
  setDataResidency,
  checkDataResidency,
  setScimToken,
  validateScimToken,
  clearScimData,
  ScimUserSchema,
  ScimGroupSchema,
  DataResidencyConfigSchema,
} from "./rbac/scim.js";
export type { ScimUser, ScimGroup, DataResidencyConfig } from "./rbac/scim.js";

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

/** Collaborative Canvas — CRDT-based shared canvas with voting, cursors, and AI clustering. */
export {
  createCollaborativeCanvas,
  applyOperation,
  mergeRemoteOperation,
  getNodeVotes,
  getTopVotedNodes,
  autoClusterByAngle,
  detectConsensus,
  getActiveCursors,
  serializeCollaborativeState,
  createCanvasRoom,
  getCanvasRoom,
  getCanvasRoomBySession,
  applyRoomOperation,
  deleteCanvasRoom,
  clearCanvasRooms,
  generateVotingHeatMap,
} from "./canvas/index.js";
export type {
  CanvasOperationType,
  CanvasOperation,
  CanvasVote,
  CursorState,
  CollaborativeCanvasState,
  CanvasRoom,
  HeatMapCell,
  VotingHeatMap,
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
  getSeedPackages,
  seedMarketplace,
} from "./marketplace/index.js";
export type {
  PluginCategory,
  MarketplacePlugin,
  InstalledPlugin,
  MarketplaceSearchOptions,
  PluginReview,
  PluginManifest,
  SeedPackage,
} from "./marketplace/index.js";

/** Marketplace Creator Tools — scaffolding, validation, and statistics. */
export {
  scaffoldPlugin,
  validatePluginManifest,
  getPluginVersions,
  getMarketplaceStats as getPluginMarketplaceStats,
} from "./marketplace/index.js";

/** Marketplace Template System — template packages, dependency resolution, collections, diffing, and bundles. */
export {
  resolveDependencies,
  checkDependencyConflicts,
  publishTemplate,
  searchTemplates,
  installTemplate,
  getTemplate,
  createTemplateFromDirectory,
  testTemplate,
  updateTemplate,
  createCollection,
  listCollections,
  getCollection,
  diffTemplates,
  exportBundle,
  importBundle,
} from "./marketplace/index.js";

/** Marketplace Template Types — template package format, collections, and bundles. */
export type {
  TemplateType,
  TemplatePackage,
  TemplateCollection,
  TemplateBundle,
} from "./marketplace/index.js";

/** Marketplace Reputation & Discovery — reputation system, prompt packs, and curated collections. */
export {
  getReputation,
  updateReputation,
  listTopCreators,
  addReview as addMarketplaceReview,
  getItemReviews,
  markReviewHelpful,
  publishPromptPack,
  getPromptPack,
  searchPromptPacks,
  downloadPromptPack,
  createCollection as createCuratedCollection,
  getCollection as getCuratedCollection,
  listCollections as listCuratedCollections,
  addToCollection,
  viewCollection,
  clearMarketplaceExtData,
  CreatorReputationSchema,
  ReviewSchema as MarketplaceReviewSchema,
  PromptPackSchema,
  CuratedCollectionSchema,
  ReputationLevelSchema,
} from "./marketplace/reputation.js";
export type {
  CreatorReputation,
  Review as MarketplaceReview,
  PromptPack,
  CuratedCollection,
  ReputationLevel,
} from "./marketplace/reputation.js";

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
  ActivityTypeSchema,
  FederatedActivitySchema,
  createActivity,
  receiveActivity,
  getInbox,
  getOutbox,
  privatizeCount,
  privatizeRate,
  createPrivateSummary,
  InnovationPulseSchema,
  getInnovationPulse,
} from "./federation/index.js";
export type {
  FederationPatternType,
  FederationPattern,
  FederationNode,
  PeerNode,
  NetworkTrend,
  NetworkDashboard,
  ActivityType,
  FederatedActivity,
  DifferentialPrivacyConfig,
  InnovationPulse,
} from "./federation/index.js";

/** Innovation Genome Network — differential privacy, enrichment, gossip sync, analytics. */
export {
  applyDifferentialPrivacy,
  privatizePattern,
  generateGenomeInsights,
  enrichAngleSelection,
  createGossipDigest,
  gossipSync,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  wilsonConfidenceInterval,
  signPattern,
  verifyPatternSignature,
  publishSignedPattern,
  trackPrivacyBudget,
  getPrivacyBudgetSpent,
  isPrivacyBudgetExceeded,
  resetPrivacyBudgets,
} from "./federation/index.js";
export type {
  DiffPrivacyConfig,
  GenomeInsight,
  GossipDigest,
  GenomeAnalytics,
  PublishedPattern,
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

/** External Integrations — export ideas to Jira, Linear, Notion with structured formatting. */
export {
  registerIntegration as registerExternalIntegration,
  getIntegration as getExternalIntegration,
  listIntegrations as listExternalIntegrations,
  removeIntegration as removeExternalIntegration,
  formatJiraIssue,
  exportToJira as exportIdeaToJira,
  formatLinearIssue,
  exportToLinear,
  formatNotionPage,
  exportToNotion as exportIdeaToNotion,
  clearIntegrations as clearExternalIntegrations,
} from "./integrations/index.js";
export type {
  IntegrationConfig as ExternalIntegrationConfig,
  IntegrationStatus as ExternalIntegrationStatus,
  ExportResult as IntegrationExportResult,
  IdeaExportPayload,
  JiraExportOptions,
  LinearExportOptions,
  NotionExportOptions,
} from "./integrations/index.js";

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

/** Regulatory Innovation Sandbox — constraint sets, compliance screening, and sandbox experiments. */
export {
  listConstraintSets,
  getConstraintSet,
  createConstraintSet,
  screenIdea as screenIdeaCompliance,
  screenIdeaInSandbox,
  createExperiment as createSandboxExperiment,
  getExperiment as getSandboxExperiment,
  listExperiments as listSandboxExperiments,
  revokeExperiment,
  getScreeningResult,
  listScreeningResults,
  screeningResultToMarkdown,
  clearSandboxData,
  ConstraintSetSchema,
  ConstraintSchema as SandboxConstraintSchema,
  ScreeningResultSchema,
  SandboxExperimentSchema,
  ConstraintCategorySchema,
} from "./compliance/regulatory-sandbox.js";
export type {
  ConstraintSet,
  Constraint as SandboxConstraint,
  ConstraintCategory,
  ConstraintViolation,
  ScreeningResult,
  SandboxExperiment,
} from "./compliance/regulatory-sandbox.js";

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
  InnovationPRSchema,
  generateInnovationPRs,
  innovationPRToMarkdown,
  deepAnalyze,
} from "./codebase-analysis/index.js";
export type {
  CodePattern,
  DependencyAnalysis,
  ArchitecturalLayer,
  FileComplexity,
  CodebaseSubject,
  CodebaseAnalysis,
  CodebaseAnalysisOptions,
  InnovationPR,
  DeepCodeAnalysis,
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
export type { PRConfig, GitCommand, PRWorkflowPlan, PRResult } from "./innovation-pr/index.js";

/** Implementation Plan & Feedback Loop — idea → plan → PR → review → refine. */
export {
  generateImplementationPlan,
  refineIdeaFromFeedback,
  planToGitHubIssues,
  ImplementationStepSchema,
  ImplementationPlanSchema,
  FeedbackItemSchema,
  RefinedIdeaSchema,
} from "./innovation-pr/index.js";
export type {
  ImplementationStep,
  ImplementationPlan,
  FeedbackItem,
  RefinedIdea,
} from "./innovation-pr/index.js";

/** Innovation Impact Tracker — connect ideas to real-world outcomes with composite scoring. */
export {
  trackIdea as trackImpactIdea,
  updateIdeaStatus,
  linkPR,
  linkIssue,
  getTrackedIdea as getImpactTrackedIdea,
  listTrackedIdeas,
  recordOutcome as recordImpactOutcome,
  getOutcomes as getImpactOutcomes,
  autoDetectOutcomes,
  calculateImpactScore,
  rankByImpact,
  getInnovationFunnel,
  getTeamComparisons,
  generateImpactDashboard,
  dashboardToMarkdown,
  clearImpactTrackerData,
  TrackedIdeaSchema as ImpactTrackedIdeaSchema,
  OutcomeRecordSchema as ImpactOutcomeRecordSchema,
  ImpactScoreSchema,
  InnovationFunnelSchema,
  ImpactDashboardSchema as ImpactTrackerDashboardSchema,
  TeamComparisonSchema,
  TrendRecordSchema,
  IdeaStatusSchema as ImpactIdeaStatusSchema,
} from "./impact-tracker/index.js";
export type {
  TrackedIdea as ImpactTrackedIdea,
  OutcomeRecord as ImpactOutcomeRecord,
  ImpactScore,
  InnovationFunnel,
  ImpactDashboard as ImpactTrackerDashboard,
  TeamComparison,
  TrendRecord,
  IdeaStatus as ImpactIdeaStatus,
} from "./impact-tracker/index.js";

/** Impact Tracker Integrations — Jira/Linear/GitHub connectors with ROI attribution. */
export {
  registerIntegration as registerImpactIntegration,
  getIntegration,
  listIntegrations as listImpactIntegrations,
  updateIntegration,
  removeIntegration as removeImpactIntegration,
  linkItem,
  updateLinkedItemStatus,
  getLinkedItems,
  getLinkedItemsByIntegration,
  syncIntegration,
  computeROI,
  getROIMetric,
  listROIMetrics,
  generateROISummary,
  roiSummaryToMarkdown,
  clearIntegrationData,
  IntegrationConfigSchema as ImpactIntegrationConfigSchema,
  LinkedItemSchema,
  ROIMetricSchema,
  ROISummarySchema,
} from "./impact-tracker/integrations.js";
export type {
  IntegrationType,
  IntegrationConfig as ImpactIntegrationConfig,
  LinkedItem,
  LinkedItemStatus,
  ROIMetric,
  ROISummary as ImpactROISummary,
} from "./impact-tracker/integrations.js";

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

/** Cross-Org Benchmarking — anonymous metrics comparison with differential privacy. */
export {
  submitMetrics,
  submitMetricsWithPrivacy,
  compareToPeers,
  getNetworkStats,
  benchmarkToMarkdown as crossOrgBenchmarkToMarkdown,
  clearBenchmarkData,
  setDifferentialPrivacy,
  getDifferentialPrivacy,
  OrgMetricsSchema,
  BenchmarkComparisonSchema,
  NetworkStatsSchema,
} from "./cross-org-benchmark/index.js";
export type {
  OrgMetrics,
  BenchmarkComparison,
  NetworkStats,
  DifferentialPrivacyConfig as BenchmarkPrivacyConfig,
} from "./cross-org-benchmark/index.js";

/** Cross-Repository Innovation Graph — multi-repo scanning, graph building, and opportunity detection. */
export {
  scanRepository,
  scanRepositories,
  buildInnovationGraph,
  resolveEntities as resolveGraphEntities,
  detectCrossRepoOpportunities,
  graphToMarkdown,
  graphToJson,
  graphToDot,
  RepoDependencySchema,
  RepoInfoSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  RepoClusterSchema,
  InnovationGapSchema,
  CrossRepoGraphSchema,
  CrossRepoOpportunitySchema,
} from "./cross-repo/index.js";
export type {
  RepoDependency,
  RepoInfo,
  GraphNode,
  GraphEdge,
  RepoCluster,
  InnovationGap,
  CrossRepoGraph,
  CrossRepoOpportunity,
} from "./cross-repo/index.js";

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
export type { MemberProfile, BlindSpot, TeamDNA, MemberActivity } from "./team-dna/index.js";

/** Team DNA Coaching — coaching recommendations and composition optimization. */
export {
  generateCoachingRecommendations,
  analyzeComposition,
  compositionToMarkdown,
  CoachingRecommendationSchema,
  CompositionScoreSchema,
  CompositionRecommendationSchema,
} from "./team-dna/coaching.js";
export type {
  CoachingRecommendation as TeamCoachingRecommendation,
  CompositionScore,
  CompositionRecommendation,
} from "./team-dna/coaching.js";

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
export type { SupplyChainItem, SupplyChainGap, SupplyChainMap } from "./supply-chain/index.js";

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

/** Innovation Portfolio Optimizer — Markowitz portfolio theory with Monte Carlo simulation. */
export {
  ideasToAssets,
  computeCorrelationMatrix as computePortfolioCorrelationMatrix,
  computePortfolioMetrics,
  computeEfficientFrontier,
  runMonteCarloOptimization,
  optimizePortfolio,
  portfolioOptimizationToMarkdown,
  PortfolioAssetSchema,
  EfficientFrontierPointSchema,
  MonteCarloPortfolioResultSchema,
  PortfolioOptimizationSchema,
} from "./portfolio-optimizer/index.js";
export type {
  PortfolioAsset,
  EfficientFrontierPoint,
  MonteCarloPortfolioResult,
  PortfolioOptimization,
  PortfolioOptimizerConfig,
} from "./portfolio-optimizer/index.js";

/** Predictive Innovation Timing Engine — market signal analysis for optimal execution windows. */
export {
  analyzeTimings,
  getTimingAnalysis,
  listTimingAnalyses,
  getActionableIdeas,
  timingToMarkdown,
  clearTimingData,
  TimingSignalSchema,
  TimingClassificationSchema,
  IdeaTimingSchema,
  TimingAnalysisSchema,
} from "./timing/index.js";
export type {
  TimingSignal,
  TimingClassification,
  IdeaTiming,
  TimingAnalysis,
} from "./timing/index.js";

/** Privacy-Preserving Cross-Org Innovation — differential privacy and encrypted matching. */
export {
  privatizeIdea,
  findCrossOrgMatches,
  getPrivacyBudget,
  consumeBudget,
  storePrivateIdea,
  loadPrivateIdeas,
  clearPrivacyData,
  laplaceMechanism,
  gaussianMechanism,
  PrivateIdeaSchema,
  CrossOrgMatchSchema,
  PrivacyBudgetSchema,
  MatchingResultSchema,
  NoiseMechanismSchema,
} from "./privacy/index.js";
export type {
  PrivateIdea,
  CrossOrgMatch,
  PrivacyBudget,
  MatchingResult,
  CrossOrgConfig,
  NoiseMechanism,
} from "./privacy/index.js";

/** Self-Healing Pipeline — circuit breakers, provider switching, adaptive recovery. */
export {
  getCircuitBreaker,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  classifyError,
  selectRecoveryStrategy,
  withSelfHealing,
  getPipelineHealth,
  getRecentFailures,
  resetSelfHealing,
  CircuitStateSchema,
  PipelineFailureSchema,
  CircuitBreakerSchema,
  RecoveryStrategySchema,
  PipelineHealthSchema,
} from "./self-healing/index.js";
export type {
  CircuitState,
  PipelineFailure,
  CircuitBreaker,
  RecoveryStrategy,
  PipelineHealth,
  SelfHealingConfig,
} from "./self-healing/index.js";

/** Combinatorial Idea Synthesis — morphological analysis combining ideas across angles. */
export {
  runCombinatorialSynthesis,
  combinatorialToMarkdown,
  generateAnglePairs,
  buildMorphologicalMatrix,
  CombinatorialIdeaSchema,
  PairwiseResultSchema,
  CombinatorialResultSchema,
} from "./combinatorial/index.js";
export type {
  CombinatorialConfig,
  CombinatorialProgress,
  CombinatorialResult,
  CombinatorialIdea,
  PairwiseResult,
  AnglePair,
  MorphologicalCell,
} from "./combinatorial/index.js";

/** Autonomous Innovation Agent — self-directed exploration with branching investigations. */
export {
  runAutonomousAgent,
  autonomousRunToMarkdown,
  ExplorationStrategySchema,
  AgentStatusSchema,
  InvestigationBranchSchema,
  AgentDecisionSchema,
  InnovationPortfolioSchema,
  AutonomousRunSchema,
} from "./autonomous-agent/index.js";
export type {
  ExplorationStrategy,
  AgentStatus,
  InvestigationBranch,
  AgentDecision,
  InnovationPortfolio,
  AutonomousRun,
  AutonomousProgress,
  AutonomousAgentConfig,
} from "./autonomous-agent/index.js";

/** Agent Lifecycle Manager — persistence, budget tracking, injection, resume. */
export {
  startAgentRun,
  stopAgentRun,
  getAgentRun,
  listAgentRuns,
  injectTopics,
  getLatestCheckpoint,
  exportRunPortfolio,
  removeAgentRun,
  clearAgentRuns,
  resumeAgentRun,
  AgentBudgetSchema,
} from "./autonomous-agent/index.js";
export type { AgentBudget, ManagedAgentRun, AgentCheckpoint } from "./autonomous-agent/index.js";

/** Innovation Loops — multi-day persistent agents with research→ideate→test→pivot cycles and human gates. */
export {
  startInnovationLoop,
  approveGate,
  cancelInnovationLoop,
  getInnovationLoop,
  listInnovationLoops,
  removeInnovationLoop,
  clearInnovationLoops,
  innovationLoopToMarkdown,
  LoopPhaseSchema,
  LoopStatusSchema,
  HumanGateSchema,
  InnovationLoopConfigSchema,
  TestResultSchema as LoopTestResultSchema,
  LoopIterationSchema,
  InnovationLoopSchema,
} from "./autonomous-agent/index.js";
export type {
  LoopPhase,
  LoopStatus,
  HumanGate,
  InnovationLoopConfig,
  TestResult as LoopTestResult,
  LoopIteration,
  InnovationLoop,
  LoopProgress,
} from "./autonomous-agent/index.js";

/** Innovation Monitor — long-running domain monitoring with opportunity detection and digest generation. */
export {
  addMonitorSource,
  removeMonitorSource,
  listMonitorSources,
  updateMonitorSource,
  detectOpportunities,
  scoreSignal,
  getRecentSignals,
  generateDigest as generateMonitorDigest,
  digestToMarkdown as monitorDigestToMarkdown,
  digestToHtml,
  startMonitor,
  stopMonitor,
  getMonitorState,
  clearMonitorData,
  MonitorSourceSchema,
  OpportunitySignalSchema,
  ScoredOpportunitySchema,
  DigestStatsSchema,
  InnovationDigestSchema as MonitorInnovationDigestSchema,
  MonitorConfigSchema as InnovationMonitorConfigSchema,
  MonitorStateSchema,
} from "./innovation-monitor/index.js";
export type {
  MonitorSource,
  OpportunitySignal,
  ScoredOpportunity,
  DigestStats,
  InnovationDigest as MonitorInnovationDigest,
  MonitorConfig as InnovationMonitorConfig,
  MonitorState,
} from "./innovation-monitor/index.js";

/** Patent Scanner — prior art detection and freedom-to-operate assessment. */
export {
  assessPriorArt,
  runPatentScan,
  patentScanToMarkdown,
  PatentDatabaseSchema,
  PatentReferenceSchema,
  PriorArtAssessmentSchema,
  PatentScanResultSchema,
} from "./patent-scanner/index.js";
export type {
  PatentDatabase,
  PatentReference,
  PriorArtAssessment,
  PatentScanResult,
  PatentScanProgress,
  PatentScanConfig,
} from "./patent-scanner/index.js";

/** Process Mining — Alpha/Inductive mining on innovation session data. */
export {
  mineProcess,
  analyticsToProcessEvents,
  processMiningToMarkdown,
  ProcessEventSchema,
  TransitionSchema,
  BottleneckSchema,
  ProcessNodeSchema,
  ProcessEdgeSchema,
  ProcessMiningResultSchema,
} from "./process-mining/index.js";
export type {
  ProcessEvent,
  Transition,
  Bottleneck,
  ProcessNode,
  ProcessEdge,
  ProcessMiningResult,
  ProcessMiningConfig,
} from "./process-mining/index.js";

/** Innovation Climate Assessment — 12-dimension org culture diagnostic. */
export {
  assessClimate,
  quickAssess,
  getSurveyQuestions,
  climateToMarkdown,
  CLIMATE_DIMENSIONS,
  ClimateDimensionSchema,
  DimensionScoreSchema as ClimateDimensionScoreSchema,
  BenchmarkComparisonSchema as ClimateBenchmarkSchema,
  InterventionSchema,
  ClimateAssessmentSchema,
} from "./climate/index.js";
export type {
  ClimateDimension,
  DimensionScore as ClimateDimensionScore,
  BenchmarkComparison as ClimateBenchmarkComparison,
  Intervention,
  ClimateAssessment,
  ClimateSurveyResponse,
  ClimateAssessmentConfig,
} from "./climate/index.js";

/** NL Data Visualization — natural language to D3.js chart generation. */
export {
  generateVisualization,
  generateSimpleBarChart,
  extractInnovationData,
  ChartTypeSchema,
  DataSeriesSchema,
  ChartConfigSchema,
  D3SpecSchema,
  VisualizationResultSchema,
} from "./nl-visualization/index.js";
export type {
  ChartType,
  DataSeries,
  ChartConfig,
  D3Spec,
  VisualizationResult,
  NLVisualizationConfig,
} from "./nl-visualization/index.js";

/** Innovation Social Network — follow, like, share, trending, discussions. */
export {
  getProfile,
  followUser,
  unfollowUser,
  shareIdea,
  likeIdea,
  unlikeIdea,
  commentOnIdea,
  repostIdea,
  getTrendingIdeas,
  getUserFeed,
  getGlobalFeed,
  publishStory,
  getStories,
  searchIdeas,
  clearSocialData,
  SocialProfileSchema,
  SharedIdeaSchema,
  SocialCommentSchema,
  FeedEventSchema,
  InnovationStorySchema,
  TrendingIdeaSchema,
} from "./social/index.js";
export type {
  SocialProfile,
  SharedIdea,
  SocialComment,
  FeedEvent,
  InnovationStory,
  TrendingIdea,
} from "./social/index.js";

/** Innovation Digital Twin — ecosystem modeling, strategy simulation, and comparison. */
export {
  registerEcosystem,
  getEcosystem,
  listEcosystems,
  removeEcosystem,
  computeEcosystemHealth,
  simulateStrategy,
  compareStrategies,
  getSimulationResult,
  clearDigitalTwinData,
  EcosystemSnapshotSchema,
  TeamMemberSchema,
  IdeaPipelineEntrySchema,
  MarketContextSchema,
  BudgetConstraintsSchema,
  TwinAngleEffectivenessSchema,
  StrategySchema,
  SimulationResultSchema,
  StrategyComparisonSchema,
} from "./digital-twin/index.js";
export type {
  EcosystemSnapshot,
  TeamMember,
  IdeaPipelineEntry,
  MarketContext,
  BudgetConstraints,
  TwinAngleEffectiveness,
  Strategy,
  SimulationResult,
  StrategyComparison,
} from "./digital-twin/index.js";

/** Digital Twin Monte Carlo Simulation — statistical portfolio simulation engine. */
export {
  runMonteCarloSimulation as runTwinMonteCarloSimulation,
  runMonteCarloComparison,
  monteCarloToMarkdown as twinMonteCarloToMarkdown,
  MonteCarloConfigSchema as TwinMonteCarloConfigSchema,
} from "./digital-twin/index.js";
export type {
  MonteCarloConfig as TwinMonteCarloConfig,
  MonteCarloResult as TwinMonteCarloResult,
  MonteCarloComparison,
  DistributionStats,
} from "./digital-twin/index.js";

/** Idea-to-Content Pipeline — transform ideas into blog posts, threads, articles, pitch decks, memos, press releases. */
export {
  CONTENT_FORMATS,
  CONTENT_TONES,
  CONTENT_AUDIENCES,
  generateContent,
  reviseContent,
  generateContentBundle,
  getContentPiece,
  listContentPieces,
  clearContentPipeline,
  getContentFormatLabel,
  ContentPieceSchema,
  ContentSectionSchema,
  RevisionRequestSchema,
} from "./content-pipeline/index.js";
export type {
  ContentFormat,
  ContentTone,
  ContentAudience,
  ContentPiece,
  ContentSection,
  ContentContext,
  RevisionRequest,
} from "./content-pipeline/index.js";

/** Innovation Health GitHub App — repo health scoring, weekly digest, badges. */
export {
  analyzeRepoHealth,
  generateWeeklyDigest,
  registerGitHubAppConfig,
  getRepoHealthScore,
  generateBadgeMarkdown,
  clearGitHubHealthData,
  RepoHealthScoreSchema,
  HealthDimensionSchema,
  WeeklyDigestSchema,
  GitHubAppConfigSchema,
  ArchitectureFreshnessSchema,
  DependencyStalenessSchema,
  ContributionDiversitySchema,
  IssueVelocitySchema,
  CompetitiveLandscapeSchema,
} from "./github-health/index.js";
export type {
  RepoHealthScore,
  HealthDimension,
  WeeklyDigest,
  GitHubAppConfig,
  ArchitectureFreshness,
  DependencyStaleness,
  ContributionDiversity,
  IssueVelocity,
  CompetitiveLandscape,
} from "./github-health/index.js";

/** Cognitive Bias Calibration Engine — detect biases, counter-prompts, debiasing challenges. */
export {
  COGNITIVE_BIASES,
  BIAS_DEFINITIONS,
  recordBiasActivity,
  recordBiasActivities,
  getUserActivities,
  analyzeBiases,
  getBiasAnalysis,
  getCounterPrompt,
  generateDebiasingChallenges,
  completeDebiasingChallenge,
  buildTeamBiasDashboard,
  clearBiasCalibrationData,
  BiasDefinitionSchema,
  UserActivitySchema,
  BiasDetectionSchema,
  BiasAnalysisSchema,
  DebiasingChallengeSchema,
  TeamBiasDashboardSchema,
} from "./bias-calibration/index.js";
export type {
  CognitiveBiasId,
  BiasDefinition,
  UserActivity,
  BiasDetection,
  BiasAnalysis,
  DebiasingChallenge,
  TeamBiasDashboard,
} from "./bias-calibration/index.js";

/** White-Label Platform SDK — tenant config, branding, feature toggles, partner portal. */
export {
  registerTenant,
  updateTenant,
  getTenantConfig,
  listWhiteLabelTenants,
  removeTenant,
  setDefaultTenant,
  resolveTenant,
  isFeatureEnabled,
  applyTerminology,
  generateBrandingCss,
  registerPartner,
  getPartner,
  listPartners,
  clearWhiteLabelData,
  TenantConfigSchema,
  BrandingConfigSchema,
  TerminologyMapSchema,
  FeatureTogglesSchema,
  BillingPlanSchema,
  PartnerProfileSchema,
} from "./white-label/index.js";
export type {
  TenantConfig,
  BrandingConfig,
  TerminologyMap,
  FeatureToggles,
  BillingPlan,
  PartnerProfile,
  TenantResolutionResult,
} from "./white-label/index.js";

/** Meeting Intelligence — transcript extraction, signal classification, auto-investigation. */
export {
  MEETING_PLATFORMS,
  SIGNAL_TYPES,
  ingestTranscript,
  getTranscript,
  listTranscripts,
  extractSignals,
  getExtractionResult,
  getHighConfidenceSignals,
  getSuggestedInvestigations,
  registerMeetingConnector,
  getMeetingConnector,
  passesFilters,
  clearMeetingIntelligenceData,
  MeetingTranscriptSchema,
  MeetingSignalSchema,
  ExtractionResultSchema,
  MeetingConnectorConfigSchema,
} from "./meeting-intelligence/index.js";
export type {
  MeetingPlatform,
  MeetingTranscript,
  SignalType,
  MeetingSignal,
  ExtractionResult,
  MeetingConnectorConfig,
} from "./meeting-intelligence/index.js";

/** Live Meeting Copilot — real-time innovation moment detection and knowledge graph suggestions. */
export {
  startLiveSession,
  getLiveSession,
  listLiveSessions,
  feedTranscriptSegment,
  endLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  registerKnownIdeas,
  clearKnownIdeas,
  liveSessionToMarkdown,
  clearLiveSessions,
  InnovationMomentTypeSchema,
  InnovationMomentSchema,
  LiveSuggestionSchema,
  LiveSessionSchema,
} from "./meeting-intelligence/live-copilot.js";
export type {
  InnovationMomentType,
  InnovationMoment,
  LiveSuggestion,
  LiveSession,
} from "./meeting-intelligence/live-copilot.js";

/** Innovation Orchestration as Code — declarative YAML config, plan/apply/drift engine. */
export {
  parseOrchestrationConfig,
  validateOrchestrationConfig,
  planOrchestration,
  applyOrchestration,
  detectDrift,
  getAppliedConfig,
  getPlanHistory,
  createSampleOrchestrationConfig,
  clearOrchestrationData,
  OrchestrationConfigSchema,
  OrchestrationPipelineStageSchema,
  QualityGateSchema,
  TeamAssignmentSchema,
  ScheduleSchema,
  IntegrationConfigSchema,
  PlanChangeSchema,
  OrchestrationPlanSchema,
  ApplyResultSchema,
  DriftReportSchema,
} from "./orchestration/index.js";
export type {
  OrchestrationConfig,
  OrchestrationPipelineStage,
  QualityGate,
  TeamAssignment,
  Schedule,
  IntegrationConfig,
  PlanChange,
  OrchestrationPlan,
  ApplyResult,
  DriftReport,
} from "./orchestration/index.js";

/** DAG execution engine for multi-stage innovation workflows. */
export {
  executeDAG,
  validateDAG,
  serializeDAGState,
  DAGNodeSchema as WorkflowDAGNodeSchema,
  DAGWorkflowSchema,
  DAGConditionSchema,
  getWorkflowTemplates,
  getWorkflowTemplate,
  registerWorkflowTemplate,
  unregisterWorkflowTemplate,
  getTemplatesByCategory,
  clearCustomTemplates,
} from "./orchestration/index.js";
export type {
  DAGNode as WorkflowDAGNode,
  DAGWorkflow,
  DAGCondition,
  DAGNodeStatus,
  DAGNodeResult,
  DAGExecutionState,
  DAGProgressCallback,
  DAGGateHandler,
  DAGNodeExecutor,
  WorkflowTemplate,
  WorkflowDSL,
  WorkflowStepDSL,
} from "./orchestration/index.js";

/** Workflow DSL — simplified YAML/JSON format and built-in templates. */
export {
  WorkflowDSLSchema,
  WorkflowStepDSLSchema,
  dslToDAG,
  dagToDSL,
  BUILTIN_WORKFLOW_DSLS,
  getBuiltinDSL,
  listBuiltinDSLs,
  QUICK_EXPLORE_DSL,
  DEEP_DIVE_DSL,
  COMPETITIVE_ANALYSIS_DSL,
  PRODUCT_LAUNCH_DSL,
  PATENT_SCAN_DSL,
} from "./orchestration/index.js";

/** Visual Workflow Editor — DAG editor schemas, templates, and approval gates. */
export {
  NodePositionSchema,
  VisualNodeTypeSchema,
  ApprovalGateSchema,
  ConditionalBranchSchema,
  LoopConfigSchema,
  VisualDAGNodeSchema,
  VisualEdgeSchema,
  VisualWorkflowSchema,
  VisualWorkflowTemplateSchema,
  VISUAL_TEMPLATES,
  getVisualTemplate,
  listVisualTemplates,
} from "./orchestration/index.js";
export type {
  NodePosition,
  VisualNodeType,
  ApprovalGate,
  ConditionalBranch,
  LoopConfig,
  VisualDAGNode,
  VisualEdge,
  VisualWorkflow,
  VisualWorkflowTemplate,
} from "./orchestration/index.js";
/** Hosted Playground / SaaS — session management, usage limits, shareable URLs. */
export {
  createPlaygroundSession,
  getPlaygroundSession,
  getSessionByShareId,
  updatePlaygroundSession,
  getUserSessions,
  getUserUsage,
  checkUsageLimit,
  isFeatureAvailable,
  cleanupExpiredSessions,
  clearPlaygroundData,
  TIER_LIMITS as PLAYGROUND_TIER_LIMITS,
  PlaygroundSessionSchema,
  UsageLimitSchema,
  createWorkspace as createPlaygroundWorkspace,
  getWorkspace as getPlaygroundWorkspace,
  addWorkspaceMember as addPlaygroundWorkspaceMember,
  listUserWorkspaces as listPlaygroundWorkspaces,
  addSessionToWorkspace as addPlaygroundSessionToWorkspace,
} from "./playground/index.js";
export type {
  PlaygroundSession,
  UsageLimit,
  UserUsage,
  Workspace as PlaygroundWorkspace,
} from "./playground/index.js";

/** Ambient Innovation Capture — signal classification, dedup, topic clustering, investigation drafts. */
export {
  CAPTURE_SOURCE_TYPES,
  RELEVANCE_CATEGORIES,
  generateContentFingerprint,
  isDuplicate,
  addCapturedSignal,
  getCapturedSignal,
  listCapturedSignals,
  removeCapturedSignal,
  clusterSignals,
  getTopicClusters,
  generateInvestigationDrafts,
  getInvestigationDrafts,
  updateDraftStatus,
  updateCaptureSettings,
  getCaptureSettings,
  clearAmbientCaptureData,
  CapturedSignalSchema,
  TopicClusterSchema,
  InvestigationDraftSchema,
  CaptureSettingsSchema,
} from "./ambient-capture/index.js";
export type {
  CaptureSourceType,
  RelevanceCategory,
  CapturedSignal,
  TopicCluster,
  InvestigationDraft,
  CaptureSettings,
} from "./ambient-capture/index.js";

/** Mobile-First Innovation Companion — capture, offline queue, sync, push notifications. */
export {
  MOBILE_CAPTURE_TYPES,
  NOTIFICATION_TYPES,
  processVoiceCapture,
  processCameraCapture,
  createTextCapture,
  getMobileCaptures,
  enqueueOfflineAction,
  getPendingQueueItems,
  markQueueItemSynced,
  markQueueItemFailed,
  getSyncState,
  updateSyncState,
  createNotification,
  getUnreadNotifications,
  markNotificationRead,
  registerDevice,
  getDeviceConfig,
  clearMobileCompanionData,
  MobileCaptureSchema,
  OfflineQueueItemSchema,
  SyncOperationSchema,
  SyncStateSchema,
  SyncResultSchema,
  PushNotificationSchema,
  IdeaCardSchema,
  MobileConfigSchema,
} from "./mobile-companion/index.js";
export type {
  MobileCaptureType,
  MobileCapture,
  QueueItemStatus,
  OfflineQueueItem,
  SyncOperation,
  SyncState,
  SyncResult,
  NotificationType,
  PushNotification,
  IdeaCard,
  MobileConfig,
} from "./mobile-companion/index.js";

/** Innovation Curriculum Generator — learning paths, modules, quizzes, progress, certificates. */
export {
  INNOVATION_SKILLS,
  DIFFICULTY_LEVELS,
  generateLearningPath,
  getLearningModule,
  getLearningPath,
  getUserLearningPaths,
  startModule,
  completeModule,
  getModuleProgress,
  getCurriculumProgress,
  getLearnerProfile,
  getWeakestSkills,
  generateCertificate,
  getUserCertificates,
  clearCurriculumData,
  LearningModuleSchema,
  LearningPathSchema,
  ModuleProgressSchema,
  LearnerProfileSchema,
  CertificateSchema,
  QuizQuestionSchema,
  PracticeExerciseSchema,
} from "./curriculum/index.js";
export type {
  InnovationSkill,
  DifficultyLevel,
  LearningModule,
  LearningPath,
  ModuleProgress,
  LearnerProfile,
  Certificate,
  QuizQuestion,
  PracticeExercise,
} from "./curriculum/index.js";

/** Inverse Innovation Decoder — analyze products and reverse-engineer innovation recipes. */
export {
  analyzeProduct,
  getRecipe,
  listRecipes,
  clearRecipes,
  recipeToMarkdown,
  InnovationPatternSchema,
  ThinkingStepSchema,
  ProductAnalysisSchema,
  InnovationRecipeSchema,
} from "./inverse-decoder/index.js";
export type {
  InnovationPattern,
  ThinkingStep,
  ProductAnalysis,
  InnovationRecipe,
  AnalyzeProductOptions,
} from "./inverse-decoder/index.js";

/** Idea Diffusion & Adoption Simulator — Bass diffusion models and Monte Carlo simulation. */
export {
  simulateDiffusion,
  computeBassCurve,
  runMonteCarloDiffusion,
  getDiffusionSimulation,
  listDiffusionSimulations,
  clearDiffusionSimulations,
  diffusionToMarkdown,
  DiffusionParametersSchema,
  DiffusionDataPointSchema,
  NetworkNodeSchema as DiffusionNetworkNodeSchema,
  DiffusionStrategySchema,
  MonteCarloResultSchema as DiffusionMonteCarloResultSchema,
  DiffusionSimulationSchema,
} from "./diffusion-simulator/index.js";
export type {
  DiffusionParameters,
  DiffusionDataPoint,
  NetworkNode as DiffusionNetworkNode,
  DiffusionStrategy,
  MonteCarloResult as DiffusionMonteCarloResult,
  DiffusionSimulation,
  DiffusionSimulationOptions,
} from "./diffusion-simulator/index.js";

/** Innovation Knowledge Distillation — pattern extraction, training datasets, model routing. */
export {
  extractPattern,
  buildDataset,
  generateFineTuneConfig,
  routeRequest,
  getCostDashboard,
  getPatterns,
  getDataset,
  listDatasets,
  clearDistillationData,
  exportDatasetJsonl,
  InvestigationPatternSchema as DistillationPatternSchema,
  TrainingExampleSchema,
  DistillationDatasetSchema,
  FineTuneConfigSchema,
  RoutingDecisionSchema as DistillationRoutingDecisionSchema,
  CostDashboardSchema,
} from "./knowledge-distillation/index.js";
export type {
  InvestigationPattern as DistillationPattern,
  TrainingExample,
  DistillationDataset,
  FineTuneConfig,
  RoutingDecision as DistillationRoutingDecision,
  CostDashboard,
} from "./knowledge-distillation/index.js";

/** Adaptive Investigation Auto-Scaling — complexity classification and adaptive execution planning. */
export {
  classifyComplexityHeuristic,
  classifyComplexity,
  generateExecutionPlan,
  recordExecution as recordAdaptiveExecution,
  getExecutionStats,
  clearExecutionHistory,
  getModeConfig,
  listModes,
  ComplexityClassificationSchema,
  ExpertiseProfileSchema,
  BudgetConstraintSchema,
  AdaptiveExecutionPlanSchema,
} from "./adaptive-scaling/index.js";
export type {
  ComplexityClassification,
  ExpertiseProfile,
  BudgetConstraint,
  AdaptiveExecutionPlan,
  ClassifyComplexityOptions,
  InnovationMode,
  ModeConfig,
} from "./adaptive-scaling/index.js";

/** Synthetic Market Testing Arena — agent-based consumer persona simulation. */
export {
  runMarketTest,
  generatePersonas,
  getMarketTest,
  listMarketTests,
  clearMarketTests,
  marketTestToMarkdown,
  ConsumerPersonaSchema,
  InteractionOutcomeSchema,
  SegmentAnalysisSchema,
  PricingSensitivityPointSchema,
  MarketTestResultSchema,
} from "./market-testing-arena/index.js";
export type {
  ConsumerPersona,
  InteractionOutcome,
  SegmentAnalysis,
  PricingSensitivityPoint,
  MarketTestResult,
  MarketTestOptions,
} from "./market-testing-arena/index.js";

/** Innovation Session Cinematics — auto-generate narrated video walkthrough scripts. */
export {
  generateCinematicScript,
  getCinematicScript,
  listCinematicScripts,
  clearCinematicScripts,
  scriptToStoryboard,
  scriptToSrt,
  scriptToRemotionConfig,
  VisualElementSchema as CinematicVisualElementSchema,
  SceneSchema,
  CinematicScriptSchema,
  ExportConfigSchema as CinematicExportConfigSchema,
} from "./session-cinematics/index.js";
export type {
  VisualElement as CinematicVisualElement,
  Scene,
  CinematicScript,
  ExportConfig as CinematicExportConfig,
  SessionData,
  GenerateScriptOptions,
} from "./session-cinematics/index.js";

/** Innovation Flow State Engine — cognitive load monitoring and creative interventions. */
export {
  assessFlowState,
  selectIntervention,
  generateCustomIntervention,
  recordFlowEntry,
  getFlowTimeline,
  getInterventionLibrary,
  clearFlowData,
  CognitiveLoadIndicatorsSchema,
  FlowStateSchema,
  InterventionSchema as FlowInterventionSchema,
  FlowTimelineEntrySchema,
} from "./flow-state/index.js";
export type {
  CognitiveLoadIndicators,
  FlowState,
  Intervention as FlowIntervention,
  FlowTimelineEntry,
  GenerateInterventionOptions,
} from "./flow-state/index.js";

/** 3D Innovation Embedding Explorer — dimensionality reduction, clustering, white space detection. */
export {
  buildEmbeddingSpace,
  generateInWhiteSpace,
  getEmbeddingSpace,
  listEmbeddingSpaces,
  clearEmbeddingSpaces,
  Point3DSchema,
  EmbeddedIdeaSchema as ExplorerEmbeddedIdeaSchema,
  IdeaClusterSchema as ExplorerIdeaClusterSchema,
  WhiteSpaceSchema,
  EmbeddingSpaceSchema,
} from "./embedding-explorer/index.js";
export type {
  Point3D,
  EmbeddedIdea as ExplorerEmbeddedIdea,
  IdeaCluster as ExplorerIdeaCluster,
  WhiteSpace,
  EmbeddingSpace,
  IdeaInput,
  BuildEmbeddingSpaceOptions,
  GenerateInGapOptions,
} from "./embedding-explorer/index.js";

/** Multi-Jurisdiction Regulatory Simulator — regulatory compliance simulation across jurisdictions. */
export {
  simulateRegulatory,
  getRegulatoryFrameworks,
  getRegulatorySimulation,
  listRegulatorySimulations,
  clearRegulatorySimulations,
  regulatoryToMarkdown,
  REGULATORY_FRAMEWORKS,
  RegulatoryFrameworkSchema,
  ComplianceCheckSchema,
  JurisdictionResultSchema,
  RegulatorySimulationSchema,
} from "./regulatory-simulator/index.js";
export type {
  RegulatoryFramework,
  ComplianceCheck,
  JurisdictionResult,
  RegulatorySimulation,
  RegulatorySimulationOptions,
} from "./regulatory-simulator/index.js";

/** Idea Exchange & Licensing Platform — cross-organization idea marketplace. */
export {
  publishListing,
  searchListings,
  getListing,
  createTransaction,
  completeTransaction,
  cancelTransaction,
  createInquiry,
  getListingInquiries,
  getOrgTransactions,
  getMarketplaceStats,
  clearExchangeData,
  anonymizeText,
  generateOrgAlias,
  IdeaListingSchema,
  TransactionSchema,
  InquirySchema,
  SearchFiltersSchema,
  AnonymizationLevelSchema,
} from "./idea-exchange/index.js";
export type {
  AnonymizationLevel,
  IdeaListing,
  Transaction,
  Inquiry,
  SearchFilters,
} from "./idea-exchange/index.js";

/** Contextual Innovation Triggers — monitor external sources for relevant innovation events. */
export {
  createTriggerPipeline,
  matchEventToInterests,
  triggerEventToMarkdown,
  TriggerPipeline,
  RSSAdapter,
  GitHubReleasesAdapter,
  HackerNewsAdapter,
  ArxivAdapter,
  PatentAdapter,
  TriggerSourceSchema,
  TriggerFilterSchema,
  FrequencyCapSchema,
  TriggerConfigSchema,
  TriggerEventSchema,
  InnovationInterestSchema,
} from "./triggers/index.js";
export type {
  TriggerSource,
  TriggerFilter,
  FrequencyCap,
  TriggerConfig,
  TriggerEvent,
  InnovationInterest,
  TriggerSourceAdapter,
  TriggerCallback,
} from "./triggers/index.js";

/** Context-Aware Signal Collectors — GitHub, Slack, Calendar signal collection and pattern detection. */
export {
  GitHubIssuesCollector,
  GitHubPRsCollector,
  GitHubDiscussionsCollector,
  SlackMessagesCollector,
  SlackReactionsCollector,
  CalendarCollector,
  classifySignals,
  detectPatternsHeuristic,
  formatNotifications,
  getStoredTriggers,
  dismissTrigger,
  markTriggerActedOn,
  getPendingTriggers,
  clearTriggerState,
} from "./triggers/signal-collectors.js";
export type {
  SignalSource as ContextSignalSource,
  Signal as TriggerContextSignal,
  InnovationTrigger,
  TriggerThreshold,
  NotificationChannel as TriggerNotificationChannel,
  NotificationConfig as TriggerNotificationConfig,
  SignalCollector,
  TriggerNotification,
} from "./triggers/signal-collectors.js";

/** Structured innovation report generation — templates, section generators, and renderers. */
export {
  ReportSectionIdSchema,
  ReportBrandingSchema,
  ReportFormatSchema,
  ReportTemplateSchema,
  REPORT_TEMPLATES,
  generateExecutiveSummary,
  generateMethodologySection,
  generateIdeaCards,
  generateRoadmap,
  generateRiskMatrix,
  generateAppendices,
  buildReport,
  renderReportHTML,
  renderReportMarkdown,
  renderReport,
  generateShareablePayload,
} from "./reports/index.js";
export type {
  ReportSectionId,
  ReportBranding,
  ReportFormat,
  ReportTemplate,
  ReportSection,
  Report,
  ReportOptions,
} from "./reports/index.js";

/** NL Pipeline — conversational refinement, dry-run cost estimation, iterative editing, and Markdown export. */
export {
  parseNLIntent,
  refinePipeline,
  NLPipelineSession,
  dryRunPipeline,
  validatePipelineConfig,
  suggestPipelineFromGoal,
  pipelineSessionToMarkdown,
  NLIntentActionSchema,
  NLIntentSchema,
  RefinementSchema,
  DryRunResultSchema,
  NodeTokenEstimateSchema,
  ValidationResultSchema as NLValidationResultSchema,
  ConversationTurnSchema,
} from "./nl-pipeline/index.js";

/** NL Pipeline Composer — multi-step conversational instructions, streaming DAG execution, templates. */
export {
  parseMultiStepInstruction,
  evaluateConditional,
  executeComposerDAG,
  getConversationalTemplates,
  getConversationalTemplate,
  filterTemplatesByCategory,
  instantiateTemplate,
  composerDAGToText,
  CONVERSATIONAL_TEMPLATES,
} from "./nl-pipeline/composer.js";
export type {
  ConditionalOperator,
  Conditional,
  ComposerStep,
  ComposerDAG,
  StreamEvent as ComposerStreamEvent,
  ConversationalTemplate,
} from "./nl-pipeline/composer.js";
export type {
  NLIntentAction,
  NLIntent,
  Refinement,
  DryRunResult,
  NodeTokenEstimate,
  ValidationResult as NLValidationResult,
  ConversationTurn,
} from "./nl-pipeline/index.js";

/** Natural Language Innovation API — conversational pipeline orchestration with streaming execution. */
export {
  parseInnovationIntent,
  generateExecutionPlan as generateNLExecutionPlan,
  executeWithStreaming,
  applyCorrection,
  ConversationSession,
  conversationToMarkdown,
  getSmartDefaults,
  generateFollowUps,
  createConversationSession,
  getConversationSession,
  clearConversationSessions,
  ConversationMessageSchema as NLApiConversationMessageSchema,
  ExecutionStepSchema,
  ExecutionPlanSchema,
  StreamEventSchema,
  ConversationSessionSchema,
  PlanGenerationResultSchema,
} from "./nl-innovation-api/index.js";
export type {
  ConversationMessage as NLApiConversationMessage,
  ExecutionStep,
  ExecutionPlan,
  StreamEvent,
  ConversationSessionState,
  PlanGenerationResult,
  SmartDefaults,
  FollowUpSuggestion,
} from "./nl-innovation-api/index.js";

/** Peer Review Network — expertise profiles, review matching, reputation scoring, and leaderboards. */
export {
  upsertExpertiseProfile,
  getExpertiseProfile,
  listAvailableReviewers,
  submitReviewRequest,
  getReviewRequest,
  listReviewRequests,
  matchReviewers,
  computeMatchScore,
  submitReview,
  closeReviewRequest,
  getReviewerReputation,
  getLeaderboard as getPeerReviewLeaderboard,
  getNotifications as getPeerReviewNotifications,
  markNotificationsRead as markPeerReviewNotificationsRead,
  generateReviewGuidance,
  clearPeerReviewData,
  ExpertiseDomainSchema as PeerReviewExpertiseDomainSchema,
  ExpertiseProfileSchema as PeerReviewExpertiseProfileSchema,
  ReviewDimensionSchema,
  ReviewFormSchema,
  ReviewStatusSchema,
  ReviewRequestSchema,
  ReviewerBadgeSchema,
  ReviewerReputationSchema,
  LeaderboardEntrySchema as PeerReviewLeaderboardEntrySchema,
  ReviewNotificationSchema,
} from "./peer-review/index.js";
export type {
  ExpertiseDomain as PeerReviewExpertiseDomain,
  ExpertiseProfile as PeerReviewExpertiseProfile,
  ReviewDimension,
  ReviewForm,
  ReviewStatus,
  ReviewRequest,
  ReviewerBadge,
  ReviewerReputation,
  LeaderboardEntry as PeerReviewLeaderboardEntry,
  ReviewNotification,
} from "./peer-review/index.js";

/** Adaptive Model Router — intelligent per-prompt model selection with Thompson sampling. */
export {
  registerRoutingPolicy,
  getRoutingPolicy,
  listRoutingPolicies,
  routeModel,
  recordQualityObservation,
  getModelStats,
  getRoutingAnalytics,
  getBestModel,
  clearAdaptiveRouterData,
  CostBudgetSchema,
  RoutingPolicySchema,
  QualityObservationSchema,
  RoutingDecisionSchema as AdaptiveRoutingDecisionSchema,
  ModelStatsSchema as AdaptiveModelStatsSchema,
  RoutingAnalyticsSchema,
} from "./adaptive-router/index.js";
export type {
  CostBudget,
  RoutingPolicy,
  QualityObservation,
  RoutingDecision as AdaptiveRoutingDecision,
  ModelStats as AdaptiveModelStats,
  RoutingAnalytics,
} from "./adaptive-router/index.js";

/** Trend Radar — topic extraction, trend detection, pattern clustering, radar visualization, and newsletters. */
export {
  extractTopics,
  detectTrends as detectRadarTrends,
  clusterTopics as clusterRadarTopics,
  generateRadarSnapshot,
  generateNewsletter,
  getTrends as getRadarTrends,
  getTopicClusters as getRadarTopicClusters,
  getRadarSnapshots,
  getRadarBlipDetails,
  getNewsletters,
  clearTrendRadarData,
  ExtractedTopicSchema,
  TrendDirectionSchema as RadarTrendDirectionSchema,
  TrendSchema as RadarTrendSchema,
  TopicClusterSchema as RadarTopicClusterSchema,
  RadarRingSchema,
  RadarQuadrantSchema,
  RadarBlipSchema,
  RadarSnapshotSchema,
  NewsletterFormatSchema,
  NewsletterSchema,
} from "./trend-radar/index.js";
export type {
  ExtractedTopic,
  TrendDirection as RadarTrendDirection,
  Trend as RadarTrend,
  TopicCluster as RadarTopicCluster,
  RadarRing,
  RadarQuadrant,
  RadarBlip,
  RadarSnapshot,
  NewsletterFormat,
  Newsletter,
  SessionData as TrendRadarSessionData,
} from "./trend-radar/index.js";

/** Outcome Prediction Engine — ML-based outcome prediction with calibrated probabilities. */
export {
  extractFeatureVector,
  addTrainingData,
  trainModel,
  predictOutcome,
  getTrainingDataCount,
  getPredictionCard,
  isModelReady,
  clearOutcomePredictionData,
  IdeaFeaturesSchema,
  TimeToMarketSchema as PredictionTimeToMarketSchema,
  ImpactMagnitudeSchema,
  ConfidenceIntervalSchema,
  PredictionCardSchema,
  TrainingDataPointSchema,
  ModelMetricsSchema,
} from "./outcome-prediction/index.js";
export type {
  IdeaFeatures,
  TimeToMarket as PredictionTimeToMarket,
  ImpactMagnitude,
  ConfidenceInterval,
  PredictionCard,
  TrainingDataPoint,
  ModelMetrics,
} from "./outcome-prediction/index.js";

/** Multi-Modal Innovation Input — image, PDF, URL, and audio parsing for innovation subjects. */
export {
  validateAttachment,
  parseImage,
  parsePDF,
  parseURL,
  parseAudio,
  parseAttachment,
  buildMultiModalContext as buildExtendedMultiModalContext,
  buildMultiModalPrompt as buildExtendedMultiModalPrompt,
  processMultiModalInput as processExtendedMultiModalInput,
  AttachmentTypeSchema,
  AttachmentSchema,
  InvestigationInputSchema as ExtendedInvestigationInputSchema,
  ParseResultSchema,
  MultiModalContextSchema as ExtendedMultiModalContextSchema,
} from "./multi-modal/index.js";
export type {
  AttachmentType,
  Attachment,
  InvestigationInput as ExtendedInvestigationInput,
  ParseResult,
  MultiModalContext as ExtendedMultiModalContext,
} from "./multi-modal/index.js";

/** Sprint Automation — time-boxed sprints with phases, templates, voting, and retrospectives. */
export {
  SPRINT_TEMPLATES as AUTO_SPRINT_TEMPLATES,
  getSprintTemplates as getAutoSprintTemplates,
  getSprintTemplate as getAutoSprintTemplate,
  createAutomatedSprint,
  startAutomatedSprint,
  joinAutomatedSprint,
  submitSprintIdea,
  openVotingRound,
  castVote,
  closeVotingRound,
  advanceSprintPhase,
  isPhaseExpired,
  getAutomatedSprint,
  listAutomatedSprints,
  generateFacilitatorMessage,
  generateRetrospective as generateAutoRetrospective,
  getRetrospective as getAutoRetrospective,
  clearSprintAutomationData,
  SprintPhaseSchema as AutoSprintPhaseSchema,
  SprintStatusSchema as AutoSprintStatusSchema,
  PhaseConfigSchema,
  SprintTemplateSchema as AutoSprintTemplateSchema,
  VoteSchema as SprintVoteSchema,
  VotingRoundSchema,
  SprintParticipantSchema as AutoSprintParticipantSchema,
  SprintIdeaSchema as AutoSprintIdeaSchema,
  AutomatedSprintSchema,
  RetrospectiveReportSchema as AutoRetrospectiveReportSchema,
} from "./sprint-automation/index.js";
export type {
  SprintPhase as AutoSprintPhase,
  SprintStatus as AutoSprintStatus,
  PhaseConfig,
  SprintTemplate as AutoSprintTemplate,
  Vote as SprintVote,
  VotingRound,
  SprintParticipant as AutoSprintParticipant,
  SprintIdea as AutoSprintIdea,
  AutomatedSprint,
  RetrospectiveReport as AutoRetrospectiveReport,
} from "./sprint-automation/index.js";

/** Competitive Intelligence Auto-Pilot — continuous competitor monitoring with auto-triggered sessions. */
export {
  registerConnector as registerCompetitiveConnector,
  getConnector as getCompetitiveConnector,
  listConnectors as listCompetitiveConnectors,
  toggleConnector as toggleCompetitiveConnector,
  scoreCompetitiveEvent,
  recordCompetitiveEvent,
  getCompetitiveEvents,
  registerAutoTriggerRule,
  listAutoTriggerRules,
  evaluateTriggerRules,
  getTriggeredSessions,
  generateLandscape,
  generateTimeline as generateCompetitiveTimeline,
  clearCompetitiveAutopilotData,
  CompetitiveSourceSchema,
  ThreatLevelSchema,
  EventClassificationSchema,
  CompetitiveEventSchema,
  ConnectorConfigSchema as CompetitiveConnectorConfigSchema,
  AutoTriggerRuleSchema,
  TriggeredSessionSchema,
  LandscapeEntrySchema,
  TimelineEntrySchema as CompetitiveTimelineEntrySchema,
} from "./competitive-autopilot/index.js";
export type {
  CompetitiveSource,
  ThreatLevel,
  EventClassification,
  CompetitiveEvent,
  ConnectorConfig as CompetitiveConnectorConfig,
  AutoTriggerRule,
  TriggeredSession,
  LandscapeEntry,
  TimelineEntry as CompetitiveTimelineEntry,
} from "./competitive-autopilot/index.js";

/** Competitive Intelligence Radar — competitor profiling, gap analysis, and radar visualization. */
export {
  addCompetitor,
  updateCompetitor,
  getCompetitor,
  listCompetitors,
  runGapAnalysis,
  runMultiCompetitorGapAnalysis,
  gapReportToMarkdown,
  generateRadarDashboard,
  checkForAlerts,
  radarDashboardToMarkdown,
  getCompetitiveContext,
  CompetitorProfileSchema as RadarCompetitorProfileSchema,
  GapAnalysisItemSchema,
  GapAnalysisReportSchema,
  RadarQuadrantSchema as CompetitiveRadarQuadrantSchema,
  RadarDashboardSchema,
  CompetitiveAlertSchema,
  RadarEntrySchema,
  clearCompetitorData,
} from "./competitive-radar/index.js";
export type {
  CompetitorProfile as RadarCompetitorProfile,
  GapAnalysisItem,
  GapAnalysisReport,
  RadarQuadrant as CompetitiveRadarQuadrant,
  RadarDashboard,
  CompetitiveAlert,
  RadarEntry,
} from "./competitive-radar/index.js";

/** Intelligence Briefs — automated weekly/daily intelligence reports with patent monitoring and market signals. */
export {
  addPatent,
  listPatents,
  removePatent,
  addMarketSignal,
  listMarketSignals,
  removeMarketSignal,
  generateIntelligenceBrief,
  getIntelligenceBrief,
  listIntelligenceBriefs,
  intelligenceBriefToMarkdown,
  clearIntelligenceData,
  PatentEntrySchema,
  MarketSignalSchema as IntelMarketSignalSchema,
  IntelligenceBriefSchema,
  BriefSectionSchema,
} from "./competitive-radar/intelligence-brief.js";
export type {
  PatentEntry,
  PatentStatus,
  MarketSignal as IntelMarketSignal,
  MarketSignalType,
  IntelligenceBrief,
  BriefSection,
} from "./competitive-radar/intelligence-brief.js";

/** ROI Calculator & Business Case Generator — NPV/IRR, resource allocation, and executive documents. */
export {
  calculateNPV,
  calculateIRR,
  calculatePaybackPeriod,
  calculateROI,
  riskAdjustNPV,
  generateRiskMatrix as generateROIRiskMatrix,
  calculateTotalInvestment,
  generateBusinessCase,
  getBusinessCase,
  listBusinessCases,
  aggregatePortfolioROI,
  businessCaseToMarkdown,
  clearROICalculatorData,
  CashFlowSchema,
  ResourceAllocationSchema,
  RiskFactorSchema,
  FinancialMetricsSchema,
  BusinessCaseSchema,
  PortfolioROISchema,
} from "./roi-calculator/index.js";
export type {
  CashFlow,
  ResourceAllocation,
  RiskFactor as ROIRiskFactor,
  FinancialMetrics,
  BusinessCase,
  PortfolioROI,
} from "./roi-calculator/index.js";

/** Data Connectors — plug-and-play Jira, GitHub, Notion, Confluence connectors with sync. */
export {
  registerDataConnector,
  getDataConnectorImpl,
  listRegisteredConnectorTypes,
  upsertConnectorConfig as upsertDataConnectorConfig,
  getConnectorConfig as getDataConnectorConfig,
  listConnectorConfigs as listDataConnectorConfigs,
  deleteConnectorConfig as deleteDataConnectorConfig,
  syncConnector as syncDataConnector,
  testConnectorConnection,
  listConflicts as listDataConflicts,
  resolveConflict as resolveDataConflict,
  getNormalizedItems,
  getSyncHistory,
  registerBuiltInConnectors,
  clearDataConnectorData,
  createJiraConnector,
  createGitHubIssuesConnector,
  createNotionConnector,
  createConfluenceConnector,
  ConnectorTypeSchema as DataConnectorTypeSchema,
  SyncDirectionSchema,
  SyncStatusSchema,
  OAuth2CredentialsSchema,
  DataConnectorConfigSchema,
  NormalizedItemSchema,
  SyncResultSchema as DataSyncResultSchema,
  ConflictEntrySchema,
} from "./data-connectors/index.js";
export type {
  ConnectorType as DataConnectorType,
  SyncDirection,
  SyncStatus,
  OAuth2Credentials,
  DataConnectorConfig,
  NormalizedItem,
  SyncResult as DataSyncResult,
  ConflictEntry,
  DataConnector,
} from "./data-connectors/index.js";

/** Maturity Assessment — ISO 56002-based innovation maturity questionnaire, benchmarking, and roadmap. */
export {
  ASSESSMENT_QUESTIONS,
  getAssessmentQuestions,
  getQuestionsByDimension,
  scoreAssessment,
  benchmarkAssessment,
  generateRoadmap as generateMaturityRoadmap,
  getAssessmentHistory,
  isReassessmentDue,
  getAssessmentResult,
  getRoadmap as getMaturityRoadmap,
  clearMaturityAssessmentData,
  MaturityLevelSchema,
  AssessmentDimensionSchema,
  QuestionSchema as MaturityQuestionSchema,
  QuestionResponseSchema as MaturityQuestionResponseSchema,
  DimensionScoreSchema as MaturityDimensionScoreSchema,
  AssessmentResultSchema,
  BenchmarkDataSchema,
  ImprovementRecommendationSchema,
  RoadmapSchema as MaturityRoadmapSchema,
  ProgressEntrySchema,
} from "./maturity-assessment/index.js";
export type {
  MaturityLevel,
  AssessmentDimension,
  Question as MaturityQuestion,
  QuestionResponse as MaturityQuestionResponse,
  DimensionScore as MaturityDimensionScore,
  AssessmentResult,
  BenchmarkData,
  ImprovementRecommendation,
  Roadmap as MaturityRoadmap,
  ProgressEntry,
} from "./maturity-assessment/index.js";

/** Observability — structured logging, Prometheus metrics, health checks, pipeline instrumentation. */
export {
  logger,
  log,
  setLogLevel,
  getLogLevel,
  getLogBuffer,
  clearLogBuffer,
  incrementCounter,
  setGauge,
  observeHistogram,
  recordPipelineExecution,
  recordLLMLatency,
  setActivePipelines,
  recordIdeasGenerated,
  renderPrometheusMetrics,
  getAllMetrics,
  clearMetrics,
  registerHealthCheck,
  unregisterHealthCheck,
  getHealthReport,
  clearHealthChecks,
  createProviderHealthCheck,
  createStorageHealthCheck,
  beginStage,
  endStage,
  addStageEvent,
  getActiveStages,
  clearActiveStages,
  generateGrafanaDashboard,
  LogLevelSchema,
  LogEntrySchema,
  MetricTypeSchema,
  PrometheusMetricSchema,
  HealthStatusSchema,
  ComponentHealthSchema,
  HealthReportSchema,
  PipelineStageNameSchema,
  InstrumentedStageSchema,
} from "./observability/index.js";
export type {
  LogLevel,
  LogEntry,
  MetricType,
  PrometheusMetric,
  HealthStatus,
  ComponentHealth,
  HealthReport,
  PipelineStageName,
  InstrumentedStage,
  GrafanaDashboard,
  GrafanaPanel,
  GrafanaTarget,
} from "./observability/index.js";

/** Scheduler — cron-based automated periodic innovation runs with CRUD and run history. */
export {
  parseCron,
  cronMatches,
  getNextRunTime,
  naturalLanguageToCron,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedules,
  getDueSchedules,
  recordScheduleRun,
  getScheduleRuns,
  clearSchedules,
  setScheduleExecutionHandler,
  startScheduleWorker,
  stopScheduleWorker,
  ScheduleStatusSchema,
  ScheduleActionSchema,
  ScheduleRunSchema,
  DeliveryChannelSchema as SchedulerDeliveryChannelSchema,
  ScheduleSchema as CronScheduleSchema,
} from "./scheduler/index.js";
export type {
  ScheduleStatus,
  ScheduleAction,
  ScheduleRun,
  DeliveryChannel as SchedulerDeliveryChannel,
  Schedule as CronSchedule,
  ParsedCron,
  CronField,
} from "./scheduler/index.js";

/** Resilience — circuit breakers, failover chains, cost guardrails, and cost forecasting. */
export {
  CircuitBreaker as LLMCircuitBreaker,
  executeWithFailover,
  CostGuardrailManager,
  forecastPipelineCost,
  getCircuitBreaker as getLLMCircuitBreaker,
  getProviderHealthDashboard,
  clearCircuitBreakers,
  createFailoverChain,
  CircuitStateSchema as LLMCircuitStateSchema,
  CostGuardrailSchema,
} from "./resilience/index.js";
export type {
  CircuitState as LLMCircuitState,
  CircuitBreakerConfig,
  FailoverChainConfig,
  CostGuardrail,
} from "./resilience/index.js";

/** Prompt Auto-Optimizer — self-improving prompts using genetic algorithm principles. */
export {
  registerVariant,
  getVariant,
  getVariantsByAngle,
  getBestVariant,
  recordVariantScore,
  createMicroExperiment,
  completeMicroExperiment,
  getExperiment as getOptimizerExperiment,
  listExperiments as listOptimizerExperiments,
  mutatePrompt,
  crossoverPrompts,
  evolveGeneration,
  getEvolutionHistory,
  getPromptFitnessDashboard,
  clearPromptOptimizer,
  PromptVariantSchema as PromptOptimizerVariantSchema,
  ScoreRecordSchema,
  MicroExperimentSchema,
  EvolutionConfigSchema as PromptEvolutionConfigSchema,
  GenerationStatsSchema,
} from "./prompt-optimizer/index.js";
export type {
  PromptVariant as OptimizerPromptVariant,
  ScoreRecord,
  MicroExperiment,
  EvolutionConfig as PromptEvolutionConfig,
  GenerationStats,
} from "./prompt-optimizer/index.js";

/** Decision Journal — structured decision log linking ideas to decisions with rationale tracking. */
export {
  createDecision,
  getDecision,
  updateDecisionStatus,
  updateDecision,
  deleteDecision,
  listDecisions,
  scheduleRevisit,
  getDueRevisits,
  dismissRevisit,
  getDecisionVelocity,
  clearDecisions,
  DecisionStatusSchema,
  DecisionRationaleSchema,
  DecisionHistoryEntrySchema,
  RevisitReminderSchema,
  DecisionSchema,
} from "./decision-journal/index.js";
export type {
  DecisionStatus,
  DecisionRationale,
  DecisionHistoryEntry,
  RevisitReminder,
  Decision,
} from "./decision-journal/index.js";

/** Tournament — gamified head-to-head idea competition with brackets and Elo rating. */
export {
  createTournament,
  getTournament,
  listTournaments,
  deleteTournament,
  startTournament,
  resolveMatch,
  voteInMatch,
  updateElo,
  getLeaderboard as getTournamentLeaderboard,
  getBracketData,
  clearTournaments,
  TournamentFormatSchema,
  TournamentStateSchema,
  MatchResultSchema,
  TournamentParticipantSchema,
  MatchSchema as TournamentMatchSchema,
  TournamentSchema,
} from "./tournament/index.js";
export type {
  TournamentFormat,
  TournamentState,
  MatchResult as TournamentMatchResult,
  TournamentParticipant,
  Match as TournamentMatch,
  Tournament,
} from "./tournament/index.js";

/** Token Budget Manager — context window management with compression and flow visualization. */
export {
  TokenBudgetManager,
  countTokens,
  countTokensRefined,
  compressContext,
  buildTokenFlowDiagram,
  suggestModelChanges,
  BUDGET_PROFILES,
  TokenBudgetProfileSchema,
  StageTokenAccountSchema,
  TokenFlowNodeSchema,
  TokenFlowLinkSchema,
  TokenFlowDiagramSchema,
  ModelSuggestionSchema,
} from "./token-manager/index.js";
export type {
  TokenBudgetProfile,
  StageTokenAccount,
  TokenFlowNode,
  TokenFlowLink,
  TokenFlowDiagram,
  ModelSuggestion,
} from "./token-manager/index.js";

/** Database drivers — filesystem, SQLite, and PostgreSQL backends with migrations. */
export {
  FilesystemDriver,
  PostgreSQLDriver,
  QueryOperatorSchema,
  CORE_MIGRATIONS,
} from "./storage/drivers/index.js";
export type {
  DatabaseDriver,
  QueryOperator,
  QueryCondition,
  QueryOptions,
  InsertOptions,
  UpdateOptions,
  DeleteOptions,
  Migration,
  MigrationStatus,
  PostgreSQLConfig,
} from "./storage/drivers/index.js";

/** Agentic Innovation Swarms — multi-agent collective intelligence for breakthrough ideas. */
export {
  runSwarm,
  swarmToMarkdown,
  detectPersonalityConflicts,
  AgentPersonalitySchema,
  SwarmAgentStatusSchema,
  BlackboardEntrySchema,
  BlackboardSchema,
  SwarmAgentSchema,
  SwarmStageSchema,
  SwarmIdeaSchema,
  SwarmResultSchema,
  PERSONALITY_DESCRIPTIONS,
} from "./swarm/index.js";
export type {
  AgentPersonality,
  SwarmAgentStatus,
  BlackboardEntry,
  Blackboard,
  SwarmAgent,
  SwarmConfig,
  SwarmStage,
  SwarmProgress,
  SwarmIdea,
  SwarmResult,
} from "./swarm/index.js";

/** Synthetic User Panels — AI persona-based idea evaluation and debate. */
export {
  runPanel,
  panelToMarkdown,
  computeInterRaterAgreement,
  storePersona,
  getStoredPersona,
  listStoredPersonas,
  clearPersonaStore,
  PersonaArchetypeSchema,
  SyntheticPersonaSchema,
  PersonaEvaluationSchema,
  PanelDebateEntrySchema,
  PanelConsensusSchema,
  PanelResultSchema,
  InterRaterAgreementSchema,
  ARCHETYPE_PROFILES,
} from "./synthetic-panels/index.js";
export type {
  PersonaArchetype,
  SyntheticPersona,
  PersonaEvaluation,
  PanelDebateEntry,
  PanelConsensus,
  PanelResult,
  PanelConfig,
  PanelProgress,
  InterRaterAgreement,
} from "./synthetic-panels/index.js";

/** Innovation Failure Pattern Library — curated failure patterns with semantic matching. */
export {
  getAllPatterns,
  findSimilarPatterns,
  analyzeFailureRisk,
  reportFailure,
  getPatternsByCategory,
  failureAnalysisToMarkdown,
  CANONICAL_FAILURE_PATTERNS,
  FailureCategorySchema,
  FailurePatternSchema,
  FailureMatchSchema,
  FailureAnalysisResultSchema,
  UserReportedFailureSchema,
} from "./failure-library/index.js";
export type {
  FailureCategory,
  FailurePattern,
  FailureMatch,
  FailureAnalysisResult,
  UserReportedFailure,
  FailureLibraryConfig,
} from "./failure-library/index.js";

/** Explainable Innovation (XAI) — reasoning chain visualization and counterfactual analysis. */
export {
  explainIdea,
  captureDecisionPoints,
  explainabilityToMarkdown,
  XaiDecisionPointTypeSchema,
  XaiDecisionPointSchema,
  ReasoningStepSchema,
  ReasoningChainSchema,
  XaiConfidenceDimensionSchema,
  ConfidenceDecompositionSchema,
  CounterfactualSchema,
  ExplainabilityReportSchema,
} from "./explainability/index.js";
export type {
  XaiDecisionPointType,
  XaiDecisionPoint,
  ReasoningStep,
  ReasoningChain,
  XaiConfidenceDimension,
  ConfidenceDecomposition,
  Counterfactual,
  ExplainabilityReport,
  ExplainabilityConfig,
  ExplainabilityProgress,
} from "./explainability/index.js";

/** Innovation Narrative Engine — audience-adapted compelling narrative generation. */
export {
  generateNarrative,
  generateNarrativeBundle,
  narrativeBundleToMarkdown,
  AudienceTypeSchema,
  NarrativeFormatSchema,
  NarrativeArchetypeSchema,
  NarrativeSchema,
  NarrativeBundleSchema,
  AUDIENCE_PROFILES,
  ARCHETYPE_STRUCTURES,
} from "./narrative/index.js";
export type {
  AudienceType,
  NarrativeFormat,
  NarrativeArchetype,
  Narrative,
  NarrativeBundle,
  NarrativeConfig,
  NarrativeProgress,
} from "./narrative/index.js";

/** Biomimicry & Nature-Inspired Innovation — biological strategies mapped to technical problems. */
export {
  runBiomimicryAnalysis,
  findRelevantEntries,
  biomimicryToMarkdown,
  BIOMIMICRY_TAXONOMY,
  BiologicalFunctionSchema,
  BiomimicryEntrySchema,
  BiomimicryTransferSchema,
  BiomimicryResultSchema,
} from "./biomimicry/index.js";
export type {
  BiologicalFunction,
  BiomimicryEntry,
  BiomimicryTransfer,
  BiomimicryResult,
  BiomimicryConfig,
  BiomimicryProgress,
} from "./biomimicry/index.js";

/** Innovation Constraint Ladder — dynamic difficulty scaling for forced creativity. */
export {
  runConstraintLadder,
  constraintLadderToMarkdown,
  LadderDifficultyLevelSchema,
  LadderConstraintTypeSchema,
  LadderConstraintSchema,
  ConstrainedIdeaSchema,
  LadderStepSchema,
  LadderResultSchema,
  DIFFICULTY_CONFIGS,
  DIFFICULTY_BADGES,
} from "./constraint-ladder/index.js";
export type {
  LadderDifficultyLevel,
  LadderConstraintType,
  LadderConstraint,
  ConstrainedIdea,
  LadderStep,
  LadderResult,
  ConstraintLadderConfig,
  ConstraintLadderProgress,
} from "./constraint-ladder/index.js";

/** Innovation Time Capsule — schedule ideas for future re-evaluation. */
export {
  createTimeCapsule,
  getTimeCapsule,
  listTimeCapsules,
  getDueCapsules,
  deleteTimeCapsule,
  openTimeCapsule,
  openingCeremonyToMarkdown,
  CapsuleStatusSchema,
  FutureContextSchema,
  IdeaSnapshotSchema,
  ReEvaluationSchema,
  TimeCapsuleSchema,
  OpeningCeremonySchema,
} from "./time-capsule/index.js";
export type {
  CapsuleStatus,
  FutureContext,
  IdeaSnapshot,
  ReEvaluation,
  TimeCapsule,
  OpeningCeremony,
  TimeCapsuleConfig,
  TimeCapsuleProgress,
} from "./time-capsule/index.js";

/** Dynamic Stakeholder Simulation — multi-stakeholder debate and political feasibility scoring. */
export {
  runStakeholderSimulation,
  stakeholderSimToMarkdown,
  detectCoalitions,
  StakeholderRoleSchema,
  SimStakeholderReactionSchema,
  DebateTurnSchema,
  StakeholderSimResultSchema,
  STAKEHOLDER_PROFILES,
} from "./stakeholder-sim/index.js";
export type {
  StakeholderRole,
  SimStakeholderReaction,
  DebateTurn,
  StakeholderSimResult,
  StakeholderSimConfig,
  StakeholderSimProgress,
} from "./stakeholder-sim/index.js";

/** Persona Evaluation — configurable persona templates, multi-persona scoring, and conflict mediation. */
export {
  createPersona,
  getPersona,
  listPersonas,
  evaluateWithPersona,
  evaluateWithMultiplePersonas,
  buildAlignmentMatrix,
  detectConflicts as detectPersonaConflicts,
  suggestMediation,
  generateStakeholderAssessment,
  assessmentToMarkdown,
  BUILT_IN_PERSONAS,
  PersonaTemplateSchema,
  PersonaScorecardSchema,
  AlignmentMatrixSchema,
  MediationSuggestionSchema,
  StakeholderAssessmentSchema,
  clearCustomPersonas,
} from "./persona-evaluation/index.js";
export type {
  PersonaTemplate,
  PersonaScorecard,
  AlignmentMatrix,
  MediationSuggestion,
  StakeholderAssessment,
} from "./persona-evaluation/index.js";

/** Innovation Context Mesh — ambient context ingestion and proactive suggestion engine. */
export {
  ingestSignal,
  ingestFromAdapter,
  getMeshState,
  resetMesh,
  detectPatternsLocal,
  detectPatternsLLM,
  analyzeAndSuggest,
  dismissSuggestion,
  getActiveSuggestions,
  contextMeshToMarkdown,
  ContextSourceTypeSchema,
  ContextSignalSchema,
  DetectedPatternSchema,
  ProactiveSuggestionSchema,
  ContextMeshStateSchema,
} from "./context-mesh/index.js";
export type {
  ContextSourceType,
  ContextSignal,
  DetectedPattern,
  ProactiveSuggestion,
  ContextMeshState,
  ContextAdapter,
  ContextMeshConfig,
  ContextMeshProgress,
} from "./context-mesh/index.js";

/** API metering — per-key quotas, rate-limit tiers, and usage tracking. */
export {
  ApiMeter,
  getApiMeter,
  resetApiMeter,
  RATE_LIMIT_TIERS,
  getTierForKey,
  setKeyTier,
  removeKeyTier,
  listKeyTiers,
  AlertConfigSchema,
} from "./metering/index.js";
export type {
  MeteringRecord,
  ApiUsageSummary,
  RateLimitTier,
  TierConfig,
  QuotaStatus,
  MeteringAlert,
  AlertConfig,
} from "./metering/index.js";

/** Session templates — wizard-based pipeline configuration. */
export {
  WIZARD_QUESTIONS,
  generateConfig,
  saveTemplate,
  getSessionTemplate,
  listTemplates,
  deleteTemplate,
  updateSessionTemplate,
  WizardAnswersSchema,
  SaveTemplateSchema,
} from "./session-templates/index.js";
export type {
  WizardQuestion,
  WizardAnswers,
  GeneratedConfig,
  SessionTemplate,
} from "./session-templates/index.js";

/** Citation engine — source management, claim extraction, and verification. */
export {
  getCitationContext,
  addSource,
  removeSource,
  extractCitations,
  verifyCitation,
  groundIdeas,
  resetCitationContext,
  listCitationSessions,
  AddSourceSchema,
  VerifyCitationSchema,
} from "./citations/index.js";
export type {
  CitationSource,
  Citation,
  CitationContext,
  CitationStatus,
  SourceType,
  GroundedIdea,
} from "./citations/index.js";

/** Session handoff — portable bundles for cross-instance sharing. */
export {
  createBundle,
  importSessionBundle,
  getBundle,
  listBundles,
  deleteBundle,
  shareBundle,
  getShareInfo,
  SESSION_BUNDLE_VERSION,
  CreateBundleSchema,
  ImportBundleSchema,
} from "./session-handoff/index.js";
export type { SessionBundle, SessionMetadata, SessionShareInfo } from "./session-handoff/index.js";

/** Progressive refinement — Concept → Plan → Specification with convergence detection. */
export {
  startRefinementSession,
  refineIdea,
  getRefinementSession,
  listRefinementSessions,
  deleteRefinementSession,
  getIdeaHistory,
  StartRefinementSchema,
  RefineIdeaSchema,
} from "./refinement-loop/index.js";
export type {
  RefinementTier,
  RefinementStatus,
  RefinableIdea,
  RefinementIteration,
  RefinementOutput,
  RefinementSession,
} from "./refinement-loop/index.js";

/** Innovation Health Score — composite codebase health metrics. */
export { computeHealthScore, HEALTH_AXES, HealthScoreInputSchema } from "./health-score/index.js";
export type { HealthAxis, AxisScore, HealthScore, HealthScoreInput } from "./health-score/index.js";

/** Hybrid search — BM25 + semantic similarity with faceted filtering. */
export {
  indexSearchDocument,
  removeSearchDocument,
  hybridSearch,
  getSearchSuggestions,
  getSearchIndexStats,
  clearSearchIndex,
  IdeaSearchSchema,
  IndexDocumentSchema,
} from "./hybrid-search/index.js";
export type {
  SearchableDocument,
  SearchFacets,
  IdeaSearchResult,
  SearchResponse,
} from "./hybrid-search/index.js";

/** Team metrics — innovation velocity tracking and leaderboards. */
export {
  recordInnovationEvent,
  getTeamMetrics,
  getTeamLeaderboard,
  getTeamEvents,
  clearTeamEvents,
  RecordEventSchema,
} from "./team-metrics/index.js";
export type {
  InnovationEventType,
  InnovationEvent,
  TeamMetrics as TeamInnovationMetrics,
  LeaderboardEntry as TeamLeaderboardEntry,
} from "./team-metrics/index.js";

/** Graph database backend — Neo4j/Memgraph driver for persistent knowledge graph. */
export {
  Neo4jDriver,
  MemgraphDriver,
  GraphQueryBuilder,
  createGraphDriver,
  GraphDatabaseConfigSchema,
} from "./knowledge-graph/graph-database.js";
export type {
  GraphDatabaseConfig,
  GraphDatabaseConfigInput,
} from "./knowledge-graph/graph-database.js";

/** Fine-tuning pipeline — self-improving innovation models from ideation data. */
export {
  collectTrainingData,
  buildFineTuningDataset,
  exportDatasetAsJSONL,
  exportDatasetAsChatFormat,
  createFineTuningJob,
  evaluateFineTunedModel,
  getDatasetStats,
  splitDataset,
  augmentTrainingData,
  validateDatasetQuality,
  getFineTuningRecommendations,
  TrainingExampleSchema as FineTuningTrainingExampleSchema,
  FineTuningDatasetSchema,
  FineTuningJobSchema,
  QualityFilterSchema,
  ModelEvaluationSchema,
  DatasetStatsSchema,
} from "./fine-tuning/index.js";
export type {
  TrainingExample as FineTuningTrainingExample,
  FineTuningDataset,
  FineTuningJob,
  QualityFilter,
  ModelEvaluation,
  DatasetStats,
} from "./fine-tuning/index.js";

/** Market validation — real-time web search for idea validation. */
export {
  validateIdea as validateIdeaMarket,
  validateIdeas as validateIdeasMarket,
  searchPriorArt,
  assessCompetitiveLandscape,
  estimateMarketViability,
  buildValidationContext,
  generateValidationReport,
  registerSearchProvider,
  unregisterSearchProvider,
  getSearchProvider,
  WebSearchResultSchema,
  PriorArtFindingSchema,
  CompetitiveLandscapeSchema as MarketCompetitiveLandscapeSchema,
  MarketValidationResultSchema,
  ValidationConfigSchema,
  MarketValidationReportSchema,
} from "./market-validation/index.js";
export type {
  WebSearchResult,
  PriorArtFinding,
  CompetitiveLandscape as MarketCompetitiveLandscape,
  MarketValidationResult,
  ValidationConfig,
  MarketValidationReport,
} from "./market-validation/index.js";

/** Workspace persistence — Postgres-backed named innovation projects. */
export {
  createProject,
  getProject,
  updateProject,
  archiveProject,
  deleteProject,
  listProjects,
  addSessionToProject,
  getProjectSessions,
  searchProjects,
  addTeamMember,
  removeTeamMember,
  createSnapshot,
  getProjectTimeline,
  exportProject,
  importProject,
  getProjectStore,
  setProjectStore,
  PostgresProjectStore,
  InMemoryProjectStore,
  InnovationProjectSchema,
  ProjectSessionSchema,
  ProjectSettingsSchema,
  TeamContextSchema,
  ProjectSnapshotSchema,
  ProjectSearchQuerySchema,
  PROJECT_MIGRATIONS,
} from "./workspace-persistence/index.js";
export type {
  InnovationProject,
  ProjectSession,
  ProjectSettings,
  TeamContext,
  ProjectSnapshot,
  ProjectSearchQuery,
  ExportFormat as ProjectExportFormat,
} from "./workspace-persistence/index.js";

/** Auto-taxonomy — hierarchical idea clustering and gap analysis. */
export {
  buildTaxonomy,
  classifyIdea,
  classifyIdeas,
  identifyGaps,
  mergeTaxonomies,
  refineTaxonomy,
  exportTaxonomyAsMarkdown,
  getTaxonomyStats,
  flattenTaxonomy,
  suggestNewCategories,
  TaxonomyNodeSchema,
  TaxonomyTreeSchema,
  IdeaClassificationSchema,
  TaxonomyGapSchema,
  TaxonomyConfigSchema,
  ClusterResultSchema,
} from "./auto-taxonomy/index.js";
export type {
  TaxonomyNode as AutoTaxonomyNode,
  TaxonomyTree,
  IdeaClassification,
  TaxonomyGap,
  TaxonomyConfig,
  ClusterResult,
} from "./auto-taxonomy/index.js";

/** A/B testing — statistical framework for innovation pipeline experiments. */
export {
  createABTest,
  getABTest,
  listABTests,
  deleteABTest,
  clearABTests,
  runABTest,
  recordTestResult,
  analyzeResults,
  computePValue,
  computeEffectSize,
  computeConfidenceInterval,
  computePowerAnalysis,
  applyMultipleTestingCorrection,
  checkEarlyStop,
  getTestSummary,
  compareModelPerformance as compareModelPerformanceAB,
  compareAngleStrategies,
  exportTestReport,
  ABTestSchema,
  ABTestConfigSchema,
  TestVariantSchema,
  TestMetricSchema,
  TestResultSchema,
  StatisticalAnalysisSchema,
  PairwiseComparisonSchema,
  PowerAnalysisSchema,
} from "./ab-testing/index.js";
export type {
  ABTest,
  ABTestConfig,
  ABTestStatus,
  TestVariant,
  TestMetric,
  TestResult,
  StatisticalAnalysis,
  PairwiseComparison,
  PowerAnalysis,
} from "./ab-testing/index.js";

/** Effort estimator — person-weeks, skills, and tech stack estimation. */
export {
  estimateEffort,
  estimateEffortBatch,
  buildRoadmap,
  estimateWithCodebaseContext,
  analyzeCodebaseContext,
  formatEstimateMarkdown,
  formatRoadmapMarkdown,
  compareEstimates,
  calibrateEstimate,
  getEffortDistribution,
  EffortEstimateSchema,
  EstimatorConfigSchema,
  CodebaseContextSchema,
  RoadmapItemSchema as EffortRoadmapItemSchema,
  BatchEstimateResultSchema,
  PhaseEstimateSchema,
  SkillRequirementSchema,
  TechRecommendationSchema,
  ImplementationRiskSchema,
} from "./effort-estimator/index.js";
export type {
  EffortEstimate,
  EstimatorConfig,
  CodebaseContext,
  RoadmapItem as EffortRoadmapItem,
  BatchEstimateResult,
  PhaseEstimate,
  SkillRequirement,
  TechRecommendation,
  ImplementationRisk,
} from "./effort-estimator/index.js";

/** Notifications — cross-platform notification delivery. */
export {
  sendNotification,
  sendDigest,
  registerChannel,
  removeChannel,
  getChannels,
  testChannel,
  updatePreferences,
  getPreferences,
  notifySessionComplete,
  notifyHighScoreIdea,
  notifyCollaborationEvent,
  getDeliveryHistory,
  retryFailedDeliveries,
  formatForSlack,
  formatForTeams,
  formatForEmail,
  SlackNotificationProvider,
  EmailNotificationProvider,
  TeamsNotificationProvider,
  PushNotificationProvider,
  WebhookNotificationProvider,
  NotificationChannelSchema,
  NotificationPayloadSchema,
  NotificationPreferencesSchema,
  NotificationDeliverySchema,
  DigestConfigSchema,
  SlackChannelConfigSchema,
  EmailChannelConfigSchema,
  TeamsChannelConfigSchema,
  PushChannelConfigSchema,
} from "./notifications/index.js";
export type {
  ChannelType,
  NotificationChannel,
  NotificationPayload,
  NotificationPriority,
  NotificationCategory,
  NotificationPreferences,
  NotificationDelivery,
  DigestConfig,
  SlackChannelConfig,
  EmailChannelConfig,
  TeamsChannelConfig,
  PushChannelConfig,
} from "./notifications/index.js";

/** API playground — interactive OpenAPI spec and Swagger UI. */
export {
  generateOpenAPISpec,
  getEndpointRegistry,
  registerEndpoint,
  getPlaygroundExamples,
  generateExampleRequest,
  generateExampleResponse,
  getCategorizedEndpoints,
  exportAsSwaggerJSON,
  exportAsSwaggerYAML,
  getSwaggerUIHTML,
  validateRequest,
  APIEndpointSchema,
  PlaygroundExampleSchema,
  PlaygroundConfigSchema,
  EndpointCategorySchema,
  OpenAPISpecSchema,
} from "./api-playground/index.js";
export type {
  APIEndpoint,
  PlaygroundExample,
  PlaygroundConfig,
  EndpointCategory,
  OpenAPISpec,
} from "./api-playground/index.js";

/** Provenance visualization — Sankey diagrams of idea lineage. */
export {
  buildProvenanceChain,
  generateSankeyDiagram,
  traceIdeaProvenance,
  getFlowMetrics,
  findHighImpactPaths,
  collapseSmallFlows,
  exportSankeyAsJSON,
  exportSankeyAsSVG,
  exportSankeyAsHTML,
  formatProvenanceMarkdown,
  compareProvenanceChains,
  mergeProvenanceDiagrams,
  SankeyNodeSchema,
  SankeyLinkSchema,
  SankeyDiagramSchema,
  ProvenanceConnectionSchema,
  VisualizationProvenanceChainSchema,
  ProvenanceVisualizationConfigSchema,
  ProvenanceQuerySchema,
  FlowMetricsSchema,
} from "./provenance-visualization/index.js";
export type {
  SankeyNode,
  SankeyLink,
  SankeyDiagram,
  ProvenanceConnection,
  VisualizationProvenanceChain,
  ProvenanceVisualizationConfig,
  ProvenanceQuery,
  FlowMetrics,
} from "./provenance-visualization/index.js";

// ---- Next-Gen Feature Modules ----

/** SaaS tier — multi-tenancy, plans, usage metering, billing integration, API key management. */
export {
  type PlanId,
  type PlanDefinition,
  type PlanLimits,
  type Tenant as SaasTenant,
  type UsageRecord as SaasUsageRecord,
  type SaasApiKey,
  type LimitCheckResult,
  type BillingProvider,
  type Invoice,
  type BillingEvent,
  PLANS,
  createTenant as createSaasTenant,
  getTenant as getSaasTenant,
  getTenantBySlug,
  updateTenantPlan,
  suspendTenant as suspendSaasTenant,
  getUsage,
  incrementUsage,
  checkLimit,
  createApiKey as createSaasApiKey,
  validateApiKey as validateSaasApiKey,
  revokeApiKey as revokeSaasApiKey,
  listTenantApiKeys,
  clearSaasData,
  getPlan,
  listPlans,
} from "./saas/index.js";

/** SaaS Workspaces and Shareable Results. */
export {
  createWorkspace as createSaasWorkspace,
  getWorkspace as getSaasWorkspace,
  listTenantWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
  createSharedResult,
  getSharedResult,
  listSharedResults,
  WorkspaceSchema as SaasWorkspaceSchema,
  SharedResultSchema,
} from "./saas/index.js";
export type { Workspace as SaasWorkspace, SharedResult } from "./saas/index.js";

/** SaaS Auth — GitHub OAuth, session tokens, Stripe billing, storage adapters. */
export {
  type GitHubUser,
  type OAuthState,
  type OAuthConfig,
  type StorageAdapter,
  type PostgresConfig,
  getAuthorizationUrl,
  validateState,
  exchangeCodeForUser,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  getAuthenticatedUser,
  clearAuthData,
  StripeBillingProvider,
  getStripeBilling,
  InMemoryStorageAdapter,
  PostgresStorageAdapter,
  getStorage as getSaasStorage,
  setStorage as setSaasStorage,
  POSTGRES_MIGRATION,
} from "./saas/index.js";

/** Knowledge Graph NL Query — natural language queries, suggestions, and visualization data. */
export {
  type NLQueryResult,
  type GraphSuggestion,
  type SubjectContext,
  type GraphVisualizationData,
  parseNLQuery,
  executeNLQuery,
  generateSuggestions,
  buildSubjectContext,
  toVisualizationData,
} from "./knowledge-graph/index.js";

/** Canvas Workshop Mode — timed rounds, facilitator controls, and session replay. */
export {
  type WorkshopPhase,
  type WorkshopConfig,
  type WorkshopParticipant,
  type WorkshopTimer,
  type WorkshopEvent,
  type WorkshopSession,
  type WorkshopSummary,
  DEFAULT_WORKSHOP_CONFIG,
  createWorkshop,
  getWorkshop as getWorkshopSession,
  joinWorkshop,
  leaveWorkshop,
  advanceWorkshopPhase,
  pauseTimer,
  resumeTimer,
  extendTimer,
  submitWorkshopIdea,
  castWorkshopVote,
  generateWorkshopSummary,
  getWorkshopReplay,
  deleteWorkshop,
  clearWorkshops,
  listWorkshops,
} from "./canvas/index.js";

/** Metrics Dashboard — funnel tracking, angle effectiveness, ROI calculator, team leaderboards. */
export {
  type FunnelStage,
  type FunnelMetrics,
  type AngleEffectivenessData,
  type TeamMetrics,
  type ROICalculation,
  type ProjectTrackerIntegration,
  type SyncResult as MetricsSyncResult,
  type DashboardData,
  FUNNEL_STAGES,
  trackIdea as trackMetricIdea,
  advanceIdea,
  setIdeaROI as setMetricIdeaROI,
  getTrackedIdea as getMetricTrackedIdea,
  listTrackedIdeas as listMetricTrackedIdeas,
  computeFunnelMetrics,
  computeAngleEffectiveness as computeMetricAngleEffectiveness,
  computeTeamLeaderboard,
  calculateROI as calculateMetricROI,
  registerIntegration,
  listIntegrations,
  removeIntegration,
  buildDashboard as buildMetricsDashboard,
  clearMetricsDashboard,
} from "./metrics-dashboard/index.js";

/** Multi-Modal Batch Processing — parallel attachment processing, voice transcription pipeline. */
export {
  type BatchStatus,
  type BatchItem,
  type BatchProgress,
  type BatchResult,
  type BatchConfig,
  type TranscriptionResult,
  type TranscriptionSegment,
  processBatch,
  createVoiceAttachment,
  createDocumentAttachment,
  createURLAttachment,
  buildInvestigationInput as buildMultiModalInput,
} from "./multi-modal/index.js";

/** Domain-Specific Innovation Packs — curated preset packs for industry verticals. */
export {
  type InnovationPack,
  type EvaluationRubric,
  HEALTHTECH_PACK as HEALTHTECH_INNOVATION_PACK,
  CLEANTECH_PACK as CLEANTECH_INNOVATION_PACK,
  FINTECH_PACK as FINTECH_INNOVATION_PACK,
  EDTECH_PACK as EDTECH_INNOVATION_PACK,
  DEVTOOLS_PACK as DEVTOOLS_INNOVATION_PACK,
  registerPack,
  getPack,
  listPacks,
  getPacksByCategory,
  searchPacks,
  unregisterPack,
  clearPacks,
} from "./presets/index.js";

/** Guided Coaching Flows — structured coaching scripts for common innovation scenarios. */
export {
  type FlowStepType,
  type FlowStep,
  type GuidedFlow,
  type FlowSession,
  PRODUCT_LAUNCH_FLOW,
  PROCESS_IMPROVEMENT_FLOW,
  MARKET_ENTRY_FLOW,
  registerFlow,
  getFlow,
  listFlows,
  getFlowsByCategory,
  searchFlows,
  unregisterFlow,
  clearFlows,
  startFlowSession,
  getCurrentStep,
  submitStepResponse,
  getFlowSession,
  clearFlowSessions,
} from "./coaching/index.js";

/** Tournament LLM Judge & Evolutionary Tournament — AI-judged matches with cross-round evolution. */
export {
  type JudgingCriterion,
  type MatchJudgment,
  type JudgeConfig,
  type AutoJudgeProgress,
  type EvolutionaryTournamentConfig,
  type EvolutionaryTournamentResult,
  DEFAULT_JUDGING_CRITERIA,
  judgeMatch,
  autoJudgeTournament,
  runEvolutionaryTournament,
  evolutionaryTournamentToMarkdown,
} from "./tournament/index.js";

/** Enhanced Audit Trail — immutable hash-chained audit log with search, export, and real-time streaming. */
export {
  type AuditCategory,
  type AuditSeverity,
  type AuditEntry as EnhancedAuditEntry,
  type AuditQuery,
  type AuditExport,
  type AuditStats,
  recordAuditEvent,
  queryAuditTrail,
  verifyAuditChainIntegrity,
  exportAuditTrail,
  getAuditStats,
  onAuditEvent,
  auditAuth,
  auditAdmin,
  auditDataAccess,
  clearAuditTrail,
} from "./rbac/index.js";

/** Analytics — standardized events and dashboard service. */
export {
  STANDARD_EVENT_TYPES,
  EventAggregator,
  getEventAggregator,
} from "./analytics/standard-events.js";
export type {
  StandardEventType,
  StandardEvent as StandardAnalyticsEvent,
  QualityMetrics as StandardQualityMetrics,
  Granularity,
  VelocityMetrics,
} from "./analytics/standard-events.js";

export { DashboardService, getDashboardService } from "./analytics/dashboard-service.js";
export type {
  DateRange,
  DashboardOverview,
  VelocityChartData,
  QualityHeatmapData,
  TeamComparisonData,
  SessionDrillDown,
  ROISummaryData,
  ReportOptions as DashboardReportOptions,
  ExecutiveSummaryReport,
} from "./analytics/dashboard-service.js";

/** Real-time — CRDT shared state, presence, and consensus. */
export { SharedStateManager } from "./realtime/shared-state.js";
export type {
  SharedDocument,
  CRDTOperation,
  Conflict,
  ConflictResolutionStrategy,
} from "./realtime/shared-state.js";

export { PresenceManager } from "./realtime/presence.js";
export type { PresenceStatus, UserPresence, RoomPresenceState } from "./realtime/presence.js";

export { ConsensusManager } from "./realtime/consensus.js";
export type {
  IdeaCard as ConsensusIdeaCard,
  IdeaCardComment,
  ConsensusEvent,
  ConsensusSession,
} from "./realtime/consensus.js";

/** Multi-modal — upload processing and visual output generation. */
export {
  UploadedFileSchema,
  ProcessingResultSchema,
  resolveFileType,
  validateUploadedFile,
  UploadProcessor,
} from "./multi-modal/upload-processor.js";
export type { UploadedFile, ProcessingResult } from "./multi-modal/upload-processor.js";

export { VisualArtifactSchema, VisualOutputGenerator } from "./multi-modal/visual-output.js";
export type {
  VisualArtifact,
  IdeaNode as VisualIdeaNode,
  IdeaMapData,
  ChartDataPoint,
  IdeaInput as VisualIdeaInput,
  SynthesisInput as VisualSynthesisInput,
  AngleResultInput as VisualAngleResultInput,
} from "./multi-modal/visual-output.js";

/** API Gateway — OpenAPI spec and webhook registry. */
export {
  getOpenAPISpec,
  getOpenAPISpecJSON,
  getOpenAPISpecYAML,
} from "./api-gateway/openapi-spec.js";

export { WebhookRegistry, getWebhookRegistry } from "./api-gateway/webhooks.js";
export type {
  WebhookRegistration,
  WebhookDelivery as WebhookDeliveryRecord,
} from "./api-gateway/webhooks.js";

/** Integrations — Jira, Linear, Slack, Confluence, Notion. */
export { JiraIntegration } from "./integrations/jira.js";
export { LinearIntegration } from "./integrations/linear.js";
export { SlackIntegration } from "./integrations/slack.js";
export { ConfluenceIntegration } from "./integrations/confluence.js";
export { NotionIntegration } from "./integrations/notion.js";

/** Knowledge Graph — entity extraction and graph visualization. */
export { EntityExtractor } from "./knowledge-graph/entity-extractor.js";
export type { ExtractedEntity, ExtractedRelationship } from "./knowledge-graph/entity-extractor.js";

export { GraphVisualizer } from "./knowledge-graph/graph-visualizer.js";
export type {
  GraphNode as VisualizerGraphNode,
  GraphEdge as VisualizerGraphEdge,
  GraphCluster,
  GraphLayout,
  LayoutOptions,
} from "./knowledge-graph/graph-visualizer.js";

/** Coaching — innovation profiles, proactive coaching, skill trees. */
export {
  InnovationProfileBuilder,
  getInnovationProfileBuilder,
} from "./coaching/innovation-profile-builder.js";
export type {
  InnovationProfileDetailed,
  ProfileMetrics as CoachingProfileMetrics,
  GrowthTrajectory,
  TeamComparison as CoachingTeamComparison,
} from "./coaching/innovation-profile-builder.js";

export { ProactiveCoachingEngine, getProactiveCoachingEngine } from "./coaching/proactive-coach.js";
export type {
  CoachingRecommendation,
  SessionContext as CoachingSessionContext,
  PostSessionAnalysis,
  PersonalizedChallenge,
} from "./coaching/proactive-coach.js";

export { SkillTreeManager, getSkillTreeManager } from "./coaching/skill-tree.js";
export type {
  SkillCategory as CoachingSkillCategory,
  SkillLevel,
  SkillNode as CoachingSkillNode,
  SkillAchievement,
  SkillTree as CoachingSkillTree,
} from "./coaching/skill-tree.js";

/** Orchestration — workflow schema definition. */
export {
  WorkflowStepType as WorkflowStepTypeSchema,
  WorkflowStepSchema,
  WorkflowConnectionSchema,
  WorkflowGateSchema,
  WorkflowDefinitionSchema,
  WorkflowExecutionSchema,
} from "./orchestration/workflow-schema.js";
export type {
  WorkflowStep as WorkflowSchemaStep,
  WorkflowConnection,
  WorkflowGate,
  WorkflowDefinition as WorkflowSchemaDefinition,
  WorkflowExecution,
} from "./orchestration/workflow-schema.js";

/** Verticals — pack schema and industry-specific packs. */
export {
  VerticalPackRegistry,
  EvaluationRubricSchema as VerticalRubricSchema,
  ComplianceRuleSchema as VerticalComplianceSchema,
  ExtendedVerticalPackSchema,
} from "./verticals/pack-schema.js";
export type {
  EvaluationRubric as VerticalEvaluationRubric,
  ComplianceRule as VerticalComplianceRule,
  ExtendedVerticalPack,
} from "./verticals/pack-schema.js";

export { HEALTHCARE_PACK } from "./verticals/healthcare-pack.js";
export { CLIMATE_PACK } from "./verticals/climate-pack.js";

// ---- Missing exports needed by apps/web API routes ----

/** Multi-modal vision functions for image analysis. */
export { analyzeImage, visionToSubject } from "./multi-modal/vision.js";
export { buildMultiModalContext } from "./multi-modal/index.js";
export { validateImage as validateBase64Image } from "./multi-modal/vision.js";

/** Multi-Modal Media Processing — video, whiteboard, and meeting recording analysis. */
export {
  processVideo,
  processWhiteboard,
  processMeetingRecording,
  getMediaAnalysis,
  listMediaAnalyses,
  clearMediaAnalyses,
  mediaAnalysisToMarkdown,
  MediaTypeSchema,
  MediaSegmentSchema,
  WhiteboardRegionSchema,
  MediaAnalysisResultSchema,
} from "./multi-modal/media-processor.js";
export type {
  MediaType,
  MediaSegment,
  WhiteboardRegion,
  MediaAnalysisResult,
} from "./multi-modal/media-processor.js";

/** Canvas AI functions. */
export { autoClusterNodes, suggestConnections, synthesizeCanvas } from "./canvas/ai-canvas.js";

/** Federation cross-org insights. */
export {
  checkDataResidencyCompliance,
  detectIndustryTrends,
  generateBenchmarks,
  generateAggregateInsights,
  getAggregateInsights,
  setDataResidency as setFederationDataResidency,
} from "./federation/cross-org-insights.js";

/** RBAC team management — aliased to match web app import names. */
export {
  createTeam as createRBACTeam,
  getTeam as getRBACTeam,
  listTeams as listRBACTeams,
  updateTeam as updateRBACTeam,
  addTeamMember as addRBACTeamMember,
  removeTeamMember as removeRBACTeamMember,
  getAdminDashboard,
  getQuota,
  setQuotaLimits,
  getTeamHierarchy,
} from "./rbac/team-management.js";

/** Reports — aliased to match web app import names. */
export { generateReport, reportToMarkdown } from "./analytics/advanced.js";

// ---- Moonshot Features ----

/** Adversarial Idea Gauntlet — multi-agent stress-testing for ideas. */
export { runGauntlet, gauntletToMarkdown, computeSurvivabilityIndex } from "./gauntlet/index.js";
export {
  AdversaryRoleSchema,
  AttackSchema,
  GauntletResultSchema,
  GauntletTranscriptEntrySchema,
  ADVERSARY_DESCRIPTIONS,
  ADVERSARY_ATTACK_CATEGORIES,
} from "./gauntlet/index.js";
export type {
  AdversaryRole,
  Attack as GauntletAttack,
  GauntletConfig,
  GauntletResult,
  GauntletProgress,
  GauntletTranscriptEntry,
} from "./gauntlet/index.js";

/** Innovation Provenance Ledger — tamper-evident audit trail. */
export {
  loadLedger,
  appendEntry as appendLedgerEntry,
  recordInvestigation as recordLedgerInvestigation,
  recordGeneration as recordLedgerGeneration,
  recordGauntlet as recordLedgerGauntlet,
  recordHumanDecision as recordLedgerHumanDecision,
  verifyLedger,
  getSessionEntries as getLedgerSessionEntries,
  getActorEntries as getLedgerActorEntries,
  getEntriesInRange as getLedgerEntriesInRange,
  exportForActor as exportLedgerForActor,
  redactActor as redactLedgerActor,
  ledgerToMarkdown,
} from "./provenance-ledger/index.js";
export {
  LedgerEntryTypeSchema,
  LedgerEntrySchema,
  LedgerSchema,
} from "./provenance-ledger/index.js";
export type {
  LedgerEntryType,
  LedgerEntry,
  Ledger,
  LedgerVerification,
  GdprExport,
  LedgerConfig,
} from "./provenance-ledger/index.js";

/** Temporal Innovation Memory — persistent temporal knowledge graph. */
export {
  loadTemporalGraph,
  ingestSession as ingestTemporalSession,
  detectRecurrences,
  searchNodes as searchTemporalNodes,
  getConceptTimeline,
  getNeighbors as getTemporalNeighbors,
  queryTemporalMemory,
  computeVelocity as computeInnovationVelocity,
  exportGraph as exportTemporalGraph,
  deleteSessionData as deleteTemporalSessionData,
  pruneGraph as pruneTemporalGraph,
  temporalMemoryToMarkdown,
} from "./temporal-memory/index.js";
export {
  TemporalNodeTypeSchema,
  TemporalNodeSchema,
  TemporalEdgeTypeSchema,
  TemporalEdgeSchema,
  TemporalGraphSchema,
} from "./temporal-memory/index.js";
export type {
  TemporalNodeType,
  TemporalNode,
  TemporalEdgeType,
  TemporalEdge,
  TemporalGraph,
  TemporalQuery,
  TemporalQueryResult,
  ConceptRecurrence,
  InnovationVelocity,
  SessionIngestion,
} from "./temporal-memory/index.js";

/** Sentinel — Always-On Innovation Agent. */
export {
  runSentinel,
  collectSignals,
  loadState as loadSentinelState,
  briefToMarkdown as sentinelBriefToMarkdown,
  loadBriefs as loadSentinelBriefs,
} from "./sentinel/index.js";
export {
  SignalSourceTypeSchema,
  SignalSourceSchema,
  DetectedSignalSchema,
  OpportunitySchema,
  DailyBriefSchema,
  SentinelStateSchema,
} from "./sentinel/index.js";
export type {
  SignalSourceType,
  SignalSource,
  DetectedSignal,
  Opportunity as SentinelOpportunity,
  DailyBrief,
  SentinelConfig,
  SentinelState,
  SentinelProgress,
} from "./sentinel/index.js";

/** Idea Genome Sequencer — structural decomposition and similarity. */
export {
  sequenceIdea,
  computeGenomeSimilarity,
  findSimilar as findSimilarGenomes,
  recombine as recombineGenomes,
  loadLibrary as loadGenomeLibrary,
  getAllGenomes,
  getGenome,
  searchGenomes,
  genomeToMarkdown,
} from "./genome-sequencer/index.js";
export {
  GenomeTraitTypeSchema,
  GenomeTraitSchema,
  IdeaGenomeSchema,
  GenomeLibrarySchema,
} from "./genome-sequencer/index.js";
export type {
  GenomeTraitType,
  GenomeTrait,
  IdeaGenome,
  GenomeSimilarity,
  RecombinantIdea,
  GenomeLibrary,
} from "./genome-sequencer/index.js";

/** Federation DP — differential privacy for innovation pattern sharing. */
export {
  laplaceMechanism as federationLaplaceMechanism,
  laplaceConfidenceInterval as federationLaplaceCI,
  loadPrivacyBudget as loadFederationPrivacyBudget,
  spendBudget as spendFederationBudget,
  getRemainingBudget as getRemainingFederationBudget,
  extractAnonymizedPatterns,
  loadSharedPatterns,
  generateRecommendations as generateFederationRecommendations,
  detectAntiPatterns as detectFederationAntiPatterns,
  computeNetworkStats as computeFederationNetworkStats,
} from "./federation-dp/index.js";
export {
  DPConfigSchema,
  PrivacyBudgetSchema as FederationPrivacyBudgetSchema,
  AnonymizedPatternSchema,
  PatternRecommendationSchema,
} from "./federation-dp/index.js";
export type {
  DPConfig,
  PrivacyBudget as FederationPrivacyBudget,
  AnonymizedPattern,
  PatternRecommendation,
  FederationNetworkStats,
} from "./federation-dp/index.js";

// ---- Copilot Agent ----
export {
  runCopilotAgentCycle,
  respondToProposal,
  formatProposalForDelivery,
  agentRunToMarkdown,
  loadRun as loadCopilotAgentRun,
  listRuns as listCopilotAgentRuns,
} from "./copilot-agent/index.js";
export {
  CopilotAgentStateSchema,
  MonitoringSourceTypeSchema,
  MonitoringSourceSchema,
  DetectedChangeSchema as CopilotDetectedChangeSchema,
  ProposalStatusSchema,
  ProposalSchema as CopilotProposalSchema,
  DeliveryChannelSchema as CopilotDeliveryChannelSchema,
  DeliveryConfigSchema,
  CopilotAgentRunSchema,
} from "./copilot-agent/index.js";
export type {
  CopilotAgentState,
  MonitoringSourceType,
  MonitoringSource,
  DetectedChange as CopilotDetectedChange,
  ProposalStatus,
  Proposal as CopilotProposal,
  DeliveryChannel as CopilotDeliveryChannel,
  DeliveryConfig,
  CopilotAgentRun,
  CopilotAgentProgress,
  CopilotAgentConfig as CopilotAgentRunConfig,
} from "./copilot-agent/index.js";

// ---- Innovation Memory & Learning Loop ----
export {
  loadMemoryGraph,
  ingestConcepts,
  trackEvent as trackInnovationEvent,
  loadEvents as loadInnovationEvents,
  computeDomainProfile as computeMemoryDomainProfile,
  generatePreSessionRecommendations,
  generateMidSessionNudges,
  findRelatedConcepts,
  getMemoryStats,
} from "./innovation-memory/index.js";
export {
  MemoryNodeTypeSchema as InnovationMemoryNodeTypeSchema,
  MemoryNodeSchema as InnovationMemoryNodeSchema,
  MemoryEdgeTypeSchema as InnovationMemoryEdgeTypeSchema,
  MemoryEdgeSchema as InnovationMemoryEdgeSchema,
  MemoryGraphSchema as InnovationMemoryGraphSchema,
  RecommendationTypeSchema,
  MemoryRecommendationSchema,
  InnovationEventTypeSchema as InnovationMemoryEventTypeSchema,
  InnovationEventSchema as InnovationMemoryEventSchema,
  DomainProfileSchema as InnovationMemoryDomainProfileSchema,
} from "./innovation-memory/index.js";
export type {
  MemoryNodeType as InnovationMemoryNodeType,
  MemoryNode as InnovationMemoryNode,
  MemoryEdgeType as InnovationMemoryEdgeType,
  MemoryEdge as InnovationMemoryEdge,
  MemoryGraph as InnovationMemoryGraph,
  RecommendationType,
  MemoryRecommendation,
  InnovationEventType as InnovationMemoryEventType,
  InnovationEvent as InnovationMemoryEvent,
  DomainProfile as InnovationMemoryDomainProfile,
} from "./innovation-memory/index.js";

// ---- Idea-to-Implementation Bridge ----
export {
  generatePRD,
  generateTechSpec,
  generateImplementationPlan as generateBridgeImplementationPlan,
  runBridgePipeline,
  bridgePipelineToMarkdown,
} from "./idea-bridge/index.js";
export {
  BridgeStageSchema,
  UserStorySchema,
  PRDSchema,
  TechSpecSchema,
  ImplementationTaskSchema as BridgeImplementationTaskSchema,
  ImplementationPlanSchema as BridgeImplementationPlanSchema,
  IssueProviderSchema,
  CreatedIssueSchema,
  BridgePipelineSchema,
} from "./idea-bridge/index.js";
export type {
  BridgeStage,
  UserStory,
  PRD,
  TechSpec,
  ImplementationTask as BridgeImplementationTask,
  ImplementationPlan as BridgeImplementationPlan,
  IssueProvider,
  CreatedIssue,
  BridgePipeline,
  BridgeConfig,
  BridgeProgress,
} from "./idea-bridge/index.js";
