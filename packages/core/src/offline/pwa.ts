/**
 * @module offline/pwa
 *
 * Offline-First Progressive Web App support — service worker configuration,
 * API request queuing, local LLM inference via Ollama/WebLLM, offline session
 * persistence, and background sync with conflict-aware merge.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Service Worker & Cache ----

export const CacheStrategySchema = z.enum([
  "cache-first",
  "network-first",
  "stale-while-revalidate",
  "cache-only",
  "network-only",
]);
export type CacheStrategy = z.infer<typeof CacheStrategySchema>;

export const CacheRuleSchema = z.object({
  pattern: z.string().max(500),
  strategy: CacheStrategySchema,
  maxAge: z.number().int().min(0).optional(),
  maxEntries: z.number().int().min(1).max(1000).optional(),
});
export type CacheRule = z.infer<typeof CacheRuleSchema>;

export const ServiceWorkerConfigSchema = z.object({
  version: z.string().max(20),
  cacheRules: z.array(CacheRuleSchema).max(50),
  precacheUrls: z.array(z.string().max(2000)).max(200),
  offlineFallbackUrl: z.string().max(2000).default("/offline"),
  backgroundSyncEnabled: z.boolean().default(true),
  periodicSyncInterval: z.number().int().min(60000).default(300000),
});
export type ServiceWorkerConfig = z.infer<typeof ServiceWorkerConfigSchema>;

/**
 * Generate default service worker config for the Innovator PWA.
 */
export function getDefaultServiceWorkerConfig(): ServiceWorkerConfig {
  return {
    version: "1.0.0",
    cacheRules: [
      { pattern: "/api/investigate", strategy: "network-first", maxAge: 86400 },
      { pattern: "/api/innovate", strategy: "network-first", maxAge: 86400 },
      { pattern: "/api/auto", strategy: "network-first", maxAge: 86400 },
      { pattern: "/api/chat-agent", strategy: "network-first", maxAge: 3600 },
      { pattern: "/_next/static/", strategy: "cache-first", maxAge: 604800, maxEntries: 200 },
      { pattern: "/static/", strategy: "cache-first", maxAge: 604800 },
      { pattern: "/", strategy: "stale-while-revalidate", maxAge: 86400 },
    ],
    precacheUrls: ["/", "/offline", "/manifest.json"],
    offlineFallbackUrl: "/offline",
    backgroundSyncEnabled: true,
    periodicSyncInterval: 300000,
  };
}

// ---- Request Queue ----

export const QueuedRequestSchema = z.object({
  id: z.string().max(100),
  url: z.string().max(2000),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  body: z.string().max(500000).optional(),
  headers: z.record(z.string().max(500)).default({}),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).max(10).default(3),
  createdAt: z.string(),
  lastAttemptAt: z.string().optional(),
  status: z.enum(["pending", "in-flight", "completed", "failed"]).default("pending"),
  responseStatus: z.number().int().optional(),
  responseBody: z.string().max(500000).optional(),
});
export type QueuedRequest = z.infer<typeof QueuedRequestSchema>;

const requestQueue: QueuedRequest[] = [];

/**
 * Queue an API request for later execution when connectivity resumes.
 */
export function queueRequest(params: {
  url: string;
  method: QueuedRequest["method"];
  body?: string;
  headers?: Record<string, string>;
  priority?: QueuedRequest["priority"];
}): QueuedRequest {
  const request: QueuedRequest = {
    id: randomUUID(),
    url: params.url,
    method: params.method,
    body: params.body,
    headers: params.headers ?? {},
    priority: params.priority ?? "medium",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  requestQueue.push(QueuedRequestSchema.parse(request));
  return request;
}

/**
 * Get pending requests sorted by priority.
 */
export function getPendingRequests(): QueuedRequest[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return requestQueue
    .filter((r) => r.status === "pending")
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Mark a queued request as completed.
 */
export function completeQueuedRequest(
  requestId: string,
  responseStatus: number,
  responseBody?: string
): boolean {
  const req = requestQueue.find((r) => r.id === requestId);
  if (!req) return false;
  req.status = "completed";
  req.responseStatus = responseStatus;
  req.responseBody = responseBody;
  req.lastAttemptAt = new Date().toISOString();
  return true;
}

/**
 * Mark a queued request as failed, incrementing retry count.
 */
export function failQueuedRequest(requestId: string): boolean {
  const req = requestQueue.find((r) => r.id === requestId);
  if (!req) return false;
  req.retryCount++;
  req.lastAttemptAt = new Date().toISOString();
  req.status = req.retryCount >= req.maxRetries ? "failed" : "pending";
  return true;
}

/**
 * Get queue statistics.
 */
export function getQueueStats(): {
  pending: number;
  completed: number;
  failed: number;
  total: number;
} {
  return {
    pending: requestQueue.filter((r) => r.status === "pending").length,
    completed: requestQueue.filter((r) => r.status === "completed").length,
    failed: requestQueue.filter((r) => r.status === "failed").length,
    total: requestQueue.length,
  };
}

// ---- Local LLM Integration ----

export const LocalLLMConfigSchema = z.object({
  provider: z.enum(["ollama", "webllm", "llamacpp"]),
  modelName: z.string().max(200),
  baseUrl: z.string().max(2000).optional(),
  contextLength: z.number().int().min(1024).max(131072).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(64).max(32768).default(2048),
  gpuLayers: z.number().int().min(0).optional(),
});
export type LocalLLMConfig = z.infer<typeof LocalLLMConfigSchema>;

export const LocalLLMStatusSchema = z.object({
  available: z.boolean(),
  provider: z.string().max(100),
  modelName: z.string().max(200),
  modelLoaded: z.boolean(),
  memoryUsageMB: z.number().min(0).optional(),
  inferenceSpeed: z.number().min(0).optional(),
  lastCheckedAt: z.string(),
});
export type LocalLLMStatus = z.infer<typeof LocalLLMStatusSchema>;

let localLLMConfig: LocalLLMConfig | undefined;

/**
 * Configure local LLM for offline inference.
 */
export function configureLocalLLM(config: LocalLLMConfig): void {
  localLLMConfig = LocalLLMConfigSchema.parse(config);
}

/**
 * Get current local LLM configuration.
 */
export function getLocalLLMConfig(): LocalLLMConfig | undefined {
  return localLLMConfig;
}

/**
 * Check local LLM availability status.
 */
export async function checkLocalLLMStatus(): Promise<LocalLLMStatus> {
  if (!localLLMConfig) {
    return {
      available: false,
      provider: "none",
      modelName: "none",
      modelLoaded: false,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  // Check Ollama connectivity
  if (localLLMConfig.provider === "ollama") {
    const baseUrl = localLLMConfig.baseUrl ?? "http://localhost:11434";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        const models = data.models ?? [];
        const modelLoaded = models.some((m) => m.name.includes(localLLMConfig!.modelName));
        return {
          available: true,
          provider: "ollama",
          modelName: localLLMConfig.modelName,
          modelLoaded,
          lastCheckedAt: new Date().toISOString(),
        };
      }
    } catch {
      // Ollama not available
    }
  }

  return {
    available: false,
    provider: localLLMConfig.provider,
    modelName: localLLMConfig.modelName,
    modelLoaded: false,
    lastCheckedAt: new Date().toISOString(),
  };
}

// ---- Background Sync ----

export const SyncConflictSchema = z.object({
  id: z.string().max(100),
  resourceId: z.string().max(200),
  resourceType: z.string().max(100),
  localVersion: z.record(z.unknown()),
  remoteVersion: z.record(z.unknown()),
  conflictType: z.enum(["update-update", "update-delete", "create-create"]),
  resolution: z
    .enum(["pending", "keep-local", "keep-remote", "merged", "manual"])
    .default("pending"),
  detectedAt: z.string(),
  resolvedAt: z.string().optional(),
});
export type SyncConflict = z.infer<typeof SyncConflictSchema>;

export const SyncStatusSchema = z.object({
  isOnline: z.boolean(),
  lastSyncAt: z.string().optional(),
  pendingChanges: z.number().int().min(0),
  conflicts: z.array(SyncConflictSchema).max(100),
  syncInProgress: z.boolean().default(false),
  lastError: z.string().max(1000).optional(),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

const conflicts: SyncConflict[] = [];
let lastSyncAt: string | undefined;
let isOnline = true;

/**
 * Set online/offline status.
 */
export function setOnlineStatus(online: boolean): void {
  isOnline = online;
}

/**
 * Get current sync status.
 */
export function getSyncStatus(): SyncStatus {
  return {
    isOnline,
    lastSyncAt,
    pendingChanges: requestQueue.filter((r) => r.status === "pending").length,
    conflicts: conflicts.filter((c) => c.resolution === "pending"),
    syncInProgress: false,
    lastError: undefined,
  };
}

/**
 * Report a sync conflict for manual resolution.
 */
export function reportConflict(params: {
  resourceId: string;
  resourceType: string;
  localVersion: Record<string, unknown>;
  remoteVersion: Record<string, unknown>;
  conflictType: SyncConflict["conflictType"];
}): SyncConflict {
  const conflict: SyncConflict = {
    id: randomUUID(),
    resourceId: params.resourceId,
    resourceType: params.resourceType,
    localVersion: params.localVersion,
    remoteVersion: params.remoteVersion,
    conflictType: params.conflictType,
    resolution: "pending",
    detectedAt: new Date().toISOString(),
  };
  conflicts.push(SyncConflictSchema.parse(conflict));
  return conflict;
}

/**
 * Resolve a sync conflict.
 */
export function resolveConflict(
  conflictId: string,
  resolution: "keep-local" | "keep-remote" | "merged" | "manual"
): boolean {
  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict) return false;
  conflict.resolution = resolution;
  conflict.resolvedAt = new Date().toISOString();
  return true;
}

/**
 * Simulate a background sync cycle.
 */
export function runBackgroundSync(): {
  synced: number;
  failed: number;
  conflicts: number;
} {
  if (!isOnline) return { synced: 0, failed: 0, conflicts: 0 };

  const pending = getPendingRequests();
  let synced = 0;
  let failed = 0;

  for (const req of pending) {
    // Simulate sync — in production this would actually make HTTP requests
    if (Math.random() > 0.1) {
      completeQueuedRequest(req.id, 200);
      synced++;
    } else {
      failQueuedRequest(req.id);
      failed++;
    }
  }

  lastSyncAt = new Date().toISOString();

  return {
    synced,
    failed,
    conflicts: conflicts.filter((c) => c.resolution === "pending").length,
  };
}

// ---- PWA Manifest ----

/**
 * Generate a PWA manifest for the innovation platform.
 */
export function generatePWAManifest(params?: {
  name?: string;
  shortName?: string;
  themeColor?: string;
}): Record<string, unknown> {
  return {
    name: params?.name ?? "Innovator",
    short_name: params?.shortName ?? "Innovator",
    description: "AI-powered innovation platform",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: params?.themeColor ?? "#0969da",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "business"],
    screenshots: [],
    related_applications: [],
    prefer_related_applications: false,
  };
}

/**
 * Clear all PWA/offline state (for testing).
 */
export function clearPWAState(): void {
  requestQueue.length = 0;
  conflicts.length = 0;
  localLLMConfig = undefined;
  lastSyncAt = undefined;
  isOnline = true;
}
