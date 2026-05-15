/**
 * @module copilot-agent
 *
 * Innovation Copilot Agent — autonomous multi-step agent that proactively
 * discovers innovation opportunities by monitoring repos, news feeds, and
 * team activity. State machine: idle → monitoring → analyzing → proposing
 * → waiting-for-feedback.
 */
export {
  runCopilotAgentCycle,
  respondToProposal,
  formatProposalForDelivery,
  agentRunToMarkdown,
  loadRun,
  listRuns,
} from "./copilot-agent.js";

export {
  CopilotAgentStateSchema,
  MonitoringSourceTypeSchema,
  MonitoringSourceSchema,
  DetectedChangeSchema,
  ProposalStatusSchema,
  ProposalSchema,
  DeliveryChannelSchema,
  DeliveryConfigSchema,
  CopilotAgentRunSchema,
} from "./types.js";

export type {
  CopilotAgentState,
  MonitoringSourceType,
  MonitoringSource,
  DetectedChange,
  ProposalStatus,
  Proposal,
  DeliveryChannel,
  DeliveryConfig,
  CopilotAgentRun,
  CopilotAgentProgress,
  CopilotAgentConfig,
} from "./types.js";
