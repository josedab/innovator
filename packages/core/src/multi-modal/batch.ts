/**
 * @module multi-modal/batch
 *
 * Batch processing pipeline for multi-modal inputs with progress tracking,
 * parallel processing, error recovery, and voice transcription integration.
 */

import { randomUUID } from "node:crypto";
import { parseAttachment, buildMultiModalContext, validateAttachment } from "./multi-modal.js";
import type { Attachment, ParseResult, InvestigationInput, MultiModalContext } from "./types.js";

// ---- Types ----

export type BatchStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface BatchItem {
  id: string;
  attachment: Attachment;
  status: BatchStatus;
  result?: ParseResult;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
}

export interface BatchProgress {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentage: number;
  currentItem?: string;
  estimatedRemainingMs?: number;
}

export interface BatchResult {
  batchId: string;
  items: BatchItem[];
  context: MultiModalContext;
  totalDurationMs: number;
  successCount: number;
  failureCount: number;
}

export interface BatchConfig {
  maxConcurrency?: number;
  maxRetries?: number;
  timeoutMs?: number;
  model?: string;
  signal?: AbortSignal;
}

// ---- Batch Processor ----

/**
 * Process multiple attachments in parallel with progress tracking.
 */
export async function processBatch(
  input: InvestigationInput,
  config: BatchConfig = {},
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult> {
  const batchId = randomUUID();
  const maxConcurrency = config.maxConcurrency ?? 3;
  const maxRetries = config.maxRetries ?? 2;
  const startTime = Date.now();

  const items: BatchItem[] = (input.attachments ?? []).map((attachment) => ({
    id: randomUUID(),
    attachment,
    status: "queued" as BatchStatus,
    retryCount: 0,
  }));

  // Validate all attachments first
  for (const item of items) {
    const errors = validateAttachment(item.attachment);
    if (errors.length > 0) {
      item.status = "failed";
      item.error = errors.join("; ");
    }
  }

  const queue = items.filter((i) => i.status === "queued");
  const active = new Set<string>();

  const emitProgress = (): void => {
    const completed = items.filter((i) => i.status === "completed").length;
    const failed = items.filter((i) => i.status === "failed").length;
    const elapsed = Date.now() - startTime;
    const rate = completed > 0 ? elapsed / completed : 0;
    const remaining = items.length - completed - failed;

    onProgress?.({
      batchId,
      total: items.length,
      completed,
      failed,
      inProgress: active.size,
      percentage: items.length > 0 ? ((completed + failed) / items.length) * 100 : 0,
      currentItem: items.find((i) => i.status === "processing")?.attachment.name,
      estimatedRemainingMs: remaining > 0 ? rate * remaining : 0,
    });
  };

  // Process with bounded concurrency
  const processItem = async (item: BatchItem): Promise<void> => {
    item.status = "processing";
    item.startedAt = new Date().toISOString();
    active.add(item.id);
    emitProgress();

    try {
      const result = await parseAttachment(item.attachment, {
        model: config.model,
        signal: config.signal,
      });
      item.result = result;
      item.status = "completed";
    } catch (err) {
      item.retryCount++;
      if (item.retryCount <= maxRetries) {
        // Retry
        item.status = "queued";
        queue.push(item);
      } else {
        item.status = "failed";
        item.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      item.completedAt = new Date().toISOString();
      active.delete(item.id);
      emitProgress();
    }
  };

  // Process queue with concurrency limit
  while (queue.length > 0 || active.size > 0) {
    if (config.signal?.aborted) {
      for (const item of items) {
        if (item.status === "queued") item.status = "cancelled";
      }
      break;
    }

    while (queue.length > 0 && active.size < maxConcurrency) {
      const item = queue.shift()!;
      processItem(item); // intentionally not awaited
    }

    if (active.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Wait for any remaining active items
  while (active.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Build context from successful results
  const parseResults = items.filter((i) => i.result).map((i) => i.result!);

  const context = buildMultiModalContext(input, parseResults);

  return {
    batchId,
    items,
    context,
    totalDurationMs: Date.now() - startTime,
    successCount: items.filter((i) => i.status === "completed").length,
    failureCount: items.filter((i) => i.status === "failed").length,
  };
}

// ---- Voice Transcription Pipeline ----

export interface TranscriptionConfig {
  language?: string;
  model?: string;
  chunkDurationMs?: number;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  segments: TranscriptionSegment[];
  durationMs: number;
}

export interface TranscriptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/**
 * Build an Attachment from a voice recording buffer for processing.
 */
export function createVoiceAttachment(
  name: string,
  base64Audio: string,
  mimeType: string = "audio/webm"
): Attachment {
  return {
    id: randomUUID(),
    type: "audio",
    name,
    mimeType,
    base64Data: base64Audio,
    status: "pending",
  };
}

/**
 * Build an Attachment from a document file buffer.
 */
export function createDocumentAttachment(
  name: string,
  base64Data: string,
  mimeType: string = "application/pdf"
): Attachment {
  return {
    id: randomUUID(),
    type: mimeType === "application/pdf" ? "pdf" : "image",
    name,
    mimeType,
    base64Data,
    status: "pending",
  };
}

/**
 * Build an Attachment from a URL for web content extraction.
 */
export function createURLAttachment(url: string, name?: string): Attachment {
  return {
    id: randomUUID(),
    type: "url",
    name: name ?? new URL(url).hostname,
    sourceUrl: url,
    status: "pending",
  };
}

// ---- Convenience Utilities ----

/**
 * Create an InvestigationInput from a subject string and a mix of files/URLs.
 */
export function buildInvestigationInput(
  subject: string,
  attachments: Attachment[],
  contextNotes?: string,
  focusAreas?: string[]
): InvestigationInput {
  return {
    subject,
    attachments,
    contextNotes,
    focusAreas,
  };
}
