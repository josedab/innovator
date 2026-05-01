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
} from "./innovation/index.js";

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
