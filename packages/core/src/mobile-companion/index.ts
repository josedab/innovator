/**
 * @module mobile-companion
 *
 * Core types and logic for the mobile-first innovation companion app.
 * Supports voice-to-investigation (Whisper transcription), camera-to-subject
 * (whiteboard OCR), quick text capture, offline queue, push notifications,
 * swipeable idea cards, and bi-directional sync protocol.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Capture Types ----

export const MOBILE_CAPTURE_TYPES = [
  "voice",
  "camera",
  "text",
  "screenshot",
  "link",
  "clipboard",
] as const;

export type MobileCaptureType = (typeof MOBILE_CAPTURE_TYPES)[number];

export const MobileCaptureSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(MOBILE_CAPTURE_TYPES),
  content: z.string().max(50_000),
  rawInput: z
    .string()
    .max(100_000)
    .optional()
    .describe("Original voice transcript, OCR text, etc."),
  subject: z.string().max(500).optional().describe("Extracted investigation subject"),
  timestamp: z.string(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0).optional(),
    })
    .optional(),
  deviceId: z.string().max(200).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type MobileCapture = z.infer<typeof MobileCaptureSchema>;

// ---- Offline Queue ----

export const QueueItemStatusSchema = z.enum(["pending", "syncing", "synced", "failed", "conflict"]);

export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>;

export const OfflineQueueItemSchema = z.object({
  id: z.string().max(200),
  action: z.enum(["create-capture", "submit-investigation", "score-idea", "sync-results"]),
  payload: z.unknown(),
  status: QueueItemStatusSchema,
  createdAt: z.string(),
  lastAttempt: z.string().optional(),
  attempts: z.number().int().min(0).max(100).default(0),
  errorMessage: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(50),
});

export type OfflineQueueItem = z.infer<typeof OfflineQueueItemSchema>;

// ---- Sync Protocol ----

export const SyncOperationSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["push", "pull", "conflict-resolve"]),
  entityType: z.enum(["capture", "investigation", "idea", "score", "session"]),
  entityId: z.string().max(200),
  timestamp: z.string(),
  version: z.number().int().min(0),
  data: z.unknown(),
  checksum: z.string().max(200).optional(),
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncStateSchema = z.object({
  deviceId: z.string().max(200),
  lastSyncAt: z.string().optional(),
  lastSyncVersion: z.number().int().min(0).default(0),
  pendingOperations: z.number().int().min(0).default(0),
  conflicts: z.number().int().min(0).default(0),
  status: z.enum(["idle", "syncing", "error", "offline"]).default("idle"),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncResultSchema = z.object({
  deviceId: z.string().max(200),
  syncedAt: z.string(),
  pushed: z.number().int().min(0),
  pulled: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  errors: z.array(z.string().max(500)).max(50),
  newVersion: z.number().int().min(0),
});

export type SyncResult = z.infer<typeof SyncResultSchema>;

// ---- Push Notifications ----

export const NOTIFICATION_TYPES = [
  "pipeline-complete",
  "new-ideas",
  "score-update",
  "collaboration-invite",
  "weekly-digest",
  "bias-alert",
  "capture-processed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PushNotificationSchema = z.object({
  id: z.string().max(200),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().max(200),
  body: z.string().max(1000),
  data: z.record(z.string().max(100), z.unknown()).optional(),
  timestamp: z.string(),
  read: z.boolean().default(false),
  actionUrl: z.string().max(1000).optional(),
});

export type PushNotification = z.infer<typeof PushNotificationSchema>;

// ---- Swipeable Idea Card ----

export const IdeaCardSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(2000),
  sourceAngle: z.string().max(200),
  score: z.number().min(0).max(100).optional(),
  tags: z.array(z.string().max(100)).max(10),
  swipeAction: z.enum(["none", "like", "dismiss", "save", "investigate"]).default("none"),
});

export type IdeaCard = z.infer<typeof IdeaCardSchema>;

// ---- Device Configuration ----

export const MobileConfigSchema = z.object({
  deviceId: z.string().max(200),
  userId: z.string().max(200),
  pushToken: z.string().max(1000).optional(),
  enableVoiceCapture: z.boolean().default(true),
  enableCameraCapture: z.boolean().default(true),
  enableLocationCapture: z.boolean().default(false),
  enableOfflineMode: z.boolean().default(true),
  syncInterval: z.number().int().min(30).max(86400).default(300).describe("Seconds between syncs"),
  notificationPreferences: z.record(z.enum(NOTIFICATION_TYPES), z.boolean()).optional(),
  maxOfflineQueueSize: z.number().int().min(10).max(10_000).default(500),
});

export type MobileConfig = z.infer<typeof MobileConfigSchema>;

// ---- In-Memory Store ----

const captures = new Map<string, MobileCapture>();
const offlineQueue: OfflineQueueItem[] = [];
const notifications: PushNotification[] = [];
const syncStates = new Map<string, SyncState>();
const deviceConfigs = new Map<string, MobileConfig>();

let captureIdCounter = 0;

// ---- Voice / Camera Processing ----

/** Process a voice capture into an investigation subject using LLM. */
export async function processVoiceCapture(
  transcript: string,
  model?: string,
  signal?: AbortSignal
): Promise<MobileCapture> {
  if (!transcript.trim()) throw new Error("Empty transcript");

  const prompt = `Extract an innovation investigation subject from this voice memo transcript. 
Identify the core topic, clean up speech artifacts, and suggest a clear investigation subject.

Transcript: "${transcript.slice(0, 5000)}"

Respond in JSON:
{ "subject": "clear investigation subject", "content": "cleaned and structured version of the transcript", "tags": ["relevant", "tags"] }`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  const capture: MobileCapture = {
    id: `voice-${++captureIdCounter}-${Date.now()}`,
    type: "voice",
    content: parsed.content ?? transcript,
    rawInput: transcript,
    subject: parsed.subject,
    timestamp: new Date().toISOString(),
  };

  const validated = MobileCaptureSchema.parse(capture);
  captures.set(validated.id, validated);
  return validated;
}

/** Process a camera capture (OCR text) into an investigation subject. */
export async function processCameraCapture(
  ocrText: string,
  model?: string,
  signal?: AbortSignal
): Promise<MobileCapture> {
  if (!ocrText.trim()) throw new Error("Empty OCR text");

  const prompt = `Extract an innovation investigation subject from this whiteboard/document OCR text.
Identify key ideas, structure the content, and suggest an investigation subject.

OCR Text: "${ocrText.slice(0, 5000)}"

Respond in JSON:
{ "subject": "investigation subject", "content": "structured interpretation of the OCR content" }`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  const capture: MobileCapture = {
    id: `camera-${++captureIdCounter}-${Date.now()}`,
    type: "camera",
    content: parsed.content ?? ocrText,
    rawInput: ocrText,
    subject: parsed.subject,
    timestamp: new Date().toISOString(),
  };

  const validated = MobileCaptureSchema.parse(capture);
  captures.set(validated.id, validated);
  return validated;
}

/** Create a quick text capture. */
export function createTextCapture(text: string, subject?: string): MobileCapture {
  if (!text.trim()) throw new Error("Empty text");

  const capture: MobileCapture = {
    id: `text-${++captureIdCounter}-${Date.now()}`,
    type: "text",
    content: text,
    subject,
    timestamp: new Date().toISOString(),
  };

  const validated = MobileCaptureSchema.parse(capture);
  captures.set(validated.id, validated);
  return validated;
}

/** Get all captures, optionally filtered by type. */
export function getMobileCaptures(type?: MobileCaptureType): MobileCapture[] {
  const all = Array.from(captures.values());
  return type ? all.filter((c) => c.type === type) : all;
}

// ---- Offline Queue Management ----

/** Add an item to the offline queue. */
export function enqueueOfflineAction(
  item: Omit<OfflineQueueItem, "id" | "createdAt" | "attempts" | "status">
): OfflineQueueItem {
  const config = Array.from(deviceConfigs.values())[0];
  const maxSize = config?.maxOfflineQueueSize ?? 500;

  if (offlineQueue.length >= maxSize) {
    // Remove oldest synced items first
    const syncedIdx = offlineQueue.findIndex((i) => i.status === "synced");
    if (syncedIdx >= 0) offlineQueue.splice(syncedIdx, 1);
    else throw new Error("Offline queue is full");
  }

  const queueItem: OfflineQueueItem = {
    ...item,
    id: `queue-${Date.now()}-${offlineQueue.length}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    attempts: 0,
    priority: item.priority ?? 50,
  };

  const validated = OfflineQueueItemSchema.parse(queueItem);
  offlineQueue.push(validated);
  offlineQueue.sort((a, b) => b.priority - a.priority);
  return validated;
}

/** Get pending items from the offline queue. */
export function getPendingQueueItems(): OfflineQueueItem[] {
  return offlineQueue.filter((i) => i.status === "pending" || i.status === "failed");
}

/** Mark a queue item as synced. */
export function markQueueItemSynced(id: string): void {
  const item = offlineQueue.find((i) => i.id === id);
  if (item) {
    item.status = "synced";
    item.lastAttempt = new Date().toISOString();
  }
}

/** Mark a queue item as failed. */
export function markQueueItemFailed(id: string, error: string): void {
  const item = offlineQueue.find((i) => i.id === id);
  if (item) {
    item.status = "failed";
    item.attempts += 1;
    item.errorMessage = error;
    item.lastAttempt = new Date().toISOString();
  }
}

// ---- Sync State ----

/** Get or create sync state for a device. */
export function getSyncState(deviceId: string): SyncState {
  if (!syncStates.has(deviceId)) {
    syncStates.set(deviceId, SyncStateSchema.parse({ deviceId }));
  }
  return syncStates.get(deviceId)!;
}

/** Update sync state after a sync operation. */
export function updateSyncState(deviceId: string, result: SyncResult): SyncState {
  const state: SyncState = {
    deviceId,
    lastSyncAt: result.syncedAt,
    lastSyncVersion: result.newVersion,
    pendingOperations: getPendingQueueItems().length,
    conflicts: result.conflicts,
    status: result.errors.length > 0 ? "error" : "idle",
  };
  const validated = SyncStateSchema.parse(state);
  syncStates.set(deviceId, validated);
  return validated;
}

// ---- Notifications ----

/** Create a push notification. */
export function createNotification(
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>
): PushNotification {
  const notification: PushNotification = {
    id: `notif-${Date.now()}-${notifications.length}`,
    type,
    title,
    body,
    data,
    timestamp: new Date().toISOString(),
    read: false,
  };
  const validated = PushNotificationSchema.parse(notification);
  notifications.push(validated);
  // Bounded: keep last 500 notifications
  if (notifications.length > 500) notifications.splice(0, notifications.length - 500);
  return validated;
}

/** Get unread notifications. */
export function getUnreadNotifications(): PushNotification[] {
  return notifications.filter((n) => !n.read);
}

/** Mark a notification as read. */
export function markNotificationRead(id: string): void {
  const notif = notifications.find((n) => n.id === id);
  if (notif) notif.read = true;
}

// ---- Device Config ----

/** Register or update a device configuration. */
export function registerDevice(config: MobileConfig): void {
  MobileConfigSchema.parse(config);
  deviceConfigs.set(config.deviceId, config);
}

/** Get device configuration. */
export function getDeviceConfig(deviceId: string): MobileConfig | undefined {
  return deviceConfigs.get(deviceId);
}

/** Clear all mobile companion data. */
export function clearMobileCompanionData(): void {
  captures.clear();
  offlineQueue.length = 0;
  notifications.length = 0;
  syncStates.clear();
  deviceConfigs.clear();
  captureIdCounter = 0;
}
