import { z } from "zod";

/** All pipeline event types. */
export const EventTypeSchema = z.enum([
  "investigation.started",
  "investigation.completed",
  "investigation.failed",
  "angle.started",
  "angle.completed",
  "angle.failed",
  "generation.started",
  "generation.completed",
  "generation.failed",
  "synthesis.started",
  "synthesis.completed",
  "synthesis.failed",
  "pipeline.started",
  "pipeline.completed",
  "pipeline.failed",
  "idea.created",
  "idea.scored",
  "session.saved",
  "retry.attempt",
  "retry.exhausted",
]);

export type EventType = z.infer<typeof EventTypeSchema>;

/** Schema for a typed pipeline event. */
export const PipelineEventSchema = z.object({
  id: z.string(),
  type: EventTypeSchema,
  timestamp: z.string(),
  payload: z.record(z.unknown()),
  subject: z.string().optional(),
  sessionId: z.string().optional(),
});

export type PipelineEvent = z.infer<typeof PipelineEventSchema>;

/** Webhook registration configuration. */
export const WebhookConfigSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  events: z.array(EventTypeSchema).min(1),
  secret: z.string().min(16),
  active: z.boolean().default(true),
  createdAt: z.string(),
  description: z.string().optional(),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

/** Result of a webhook delivery attempt. */
export interface WebhookDelivery {
  webhookId: string;
  eventId: string;
  attempt: number;
  status: "success" | "failed" | "pending";
  statusCode?: number;
  error?: string;
  timestamp: string;
  durationMs: number;
}

/** Dead letter entry for failed webhook deliveries. */
export interface DeadLetterEntry {
  webhookId: string;
  event: PipelineEvent;
  lastAttempt: string;
  attempts: number;
  lastError: string;
}
