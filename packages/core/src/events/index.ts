/**
 * @module events
 *
 * Event bus, webhook delivery, and workflow automation — typed pipeline events,
 * in-process event emitter, webhook delivery with retry and HMAC signing,
 * and event-driven automation chains with triggers and actions.
 */
export { EventBus, getEventBus, resetEventBus } from "./emitter.js";
export type { EventFilter, FilteredSubscriptionOptions } from "./emitter.js";
export { WebhookManager } from "./webhooks.js";
export { EventTypeSchema, PipelineEventSchema, WebhookConfigSchema } from "./types.js";
export type {
  EventType,
  PipelineEvent,
  WebhookConfig,
  WebhookDelivery,
  DeadLetterEntry,
} from "./types.js";
export {
  createAutomationRule,
  getAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
  createHighScoreChain,
  createPipelineNotificationChain,
  clearAutomation,
  TriggerConditionSchema,
  ActionTypeSchema,
  AutomationActionSchema,
  AutomationRuleSchema,
  AutomationLogEntrySchema,
} from "./automation.js";
export type {
  TriggerCondition,
  ActionType,
  AutomationAction,
  AutomationRule,
  AutomationLogEntry,
} from "./automation.js";

// Webhook templates
export {
  getWebhookTemplate,
  listWebhookTemplates,
  WEBHOOK_TEMPLATES,
  SLACK_TEMPLATE,
  GITHUB_ISSUES_TEMPLATE,
  JIRA_TEMPLATE,
  EMAIL_TEMPLATE,
} from "./templates.js";
export type { WebhookTemplate } from "./templates.js";
