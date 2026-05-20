import { CopilotClient } from "@github/copilot-sdk";
import type { PermissionRequest } from "@github/copilot-sdk";
import { AbortError, LlmError, LlmTimeoutError, LlmParseError } from "../errors.js";
import { LRUCache } from "../cache/index.js";
import { Semaphore } from "../concurrency/index.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";

const DEFAULT_MODEL = process.env.INNOVATOR_DEFAULT_MODEL || "gpt-4.1";

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const llmSemaphore = new Semaphore(positiveIntegerFromEnv("INNOVATOR_LLM_MAX_CONCURRENCY", 2), {
  maxWaiters: positiveIntegerFromEnv("INNOVATOR_LLM_MAX_QUEUE", 16),
});

/** Error codes that indicate the connection was already closed (client disconnect, broken pipe). */
const EXPECTED_DISCONNECT_CODES = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED"]);

/** Check whether an error is an expected connection-close during session disconnect. */
function isExpectedDisconnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && EXPECTED_DISCONNECT_CODES.has(code)) return true;
  return /aborted|socket hang up|broken pipe/i.test(err.message);
}

/** Disconnect a Copilot session, suppressing expected connection-close errors. */
async function safeDisconnect(session: { disconnect(): Promise<void> }): Promise<void> {
  try {
    await session.disconnect();
  } catch (err) {
    if (!isExpectedDisconnectError(err)) throw err;
  }
}

function createSessionCleanup(
  client: CopilotClient,
  session: { sessionId: string; disconnect(): Promise<void> }
): {
  disconnect(): Promise<void>;
  cleanup(): Promise<void>;
} {
  let disconnected = false;
  let deleted = false;

  const disconnect = async () => {
    if (disconnected) return;
    disconnected = true;
    await safeDisconnect(session);
  };

  return {
    disconnect,
    async cleanup() {
      await disconnect();
      if (!deleted) {
        deleted = true;
        await client.deleteSession(session.sessionId);
      }
    },
  };
}

let clientPromise: Promise<CopilotClient> | null = null;
let clientInstance: CopilotClient | null = null;
let liveLlmCallers = 0;
const activeLlmOperations = new Set<symbol>();
let zombieResetPromise: Promise<void> | null = null;

/**
 * Get or create the shared {@link CopilotClient} singleton.
 * The client is lazily initialized on first call and reused for subsequent calls.
 *
 * @returns A started CopilotClient instance
 * @throws If the client fails to start (e.g. missing GitHub CLI auth)
 */
export async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientPromise) {
    const client = new CopilotClient();
    clientInstance = client;
    clientPromise = client.start().then(
      () => client,
      (error) => {
        if (clientInstance === client) {
          clientInstance = null;
          clientPromise = null;
        }
        throw error;
      }
    );
  }
  return clientPromise;
}

function finishLlmOperation(operationId: symbol): void {
  if (activeLlmOperations.delete(operationId)) {
    llmSemaphore.release();
  }
}

async function forceResetCopilotClient(): Promise<void> {
  const client = clientInstance;
  const operationsToRelease = [...activeLlmOperations];
  clientInstance = null;
  clientPromise = null;

  try {
    if (client) {
      await Promise.race([
        client.forceStop(),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  } finally {
    for (const operationId of operationsToRelease) {
      finishLlmOperation(operationId);
    }
  }
}

function beginClientReset(): Promise<void> {
  if (!zombieResetPromise) {
    zombieResetPromise = forceResetCopilotClient()
      .catch(() => {})
      .finally(() => {
        zombieResetPromise = null;
      });
  }
  return zombieResetPromise;
}

function scheduleZombieReset(): void {
  if (liveLlmCallers === 0 && activeLlmOperations.size > 0) {
    void beginClientReset();
  }
}

async function waitForClientReset(signal: AbortSignal): Promise<void> {
  const reset = zombieResetPromise;
  if (!reset) return;
  if (signal.aborted) {
    throw new AbortError("Request was aborted while client reset");
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new AbortError("Request was aborted while client reset"));
    signal.addEventListener("abort", onAbort, { once: true });
    reset.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * Stop the shared CopilotClient and release resources.
 * Safe to call even if no client has been created.
 */
export async function stopCopilotClient(): Promise<void> {
  if (zombieResetPromise) {
    await zombieResetPromise;
    return;
  }

  const client = clientInstance;
  try {
    if (client) {
      await client.stop();
    } else if (clientPromise) {
      await clientPromise.then((pendingClient) => pendingClient.stop());
    }
  } finally {
    clientInstance = null;
    clientPromise = null;
    for (const operationId of [...activeLlmOperations]) {
      finishLlmOperation(operationId);
    }
  }
}

/** Reset a failed shared client only when no live LLM callers are active. */
export async function resetCopilotClientIfIdle(): Promise<boolean> {
  if (liveLlmCallers > 0) return false;
  await beginClientReset();
  return true;
}

/**
 * Create a permission handler that denies every built-in tool request.
 */
function createPermissionHandler(mode: string) {
  return (request: PermissionRequest) => {
    return {
      kind: "denied-by-rules" as const,
      rules: [{ kind: `${mode}:${request.kind}`, argument: null }],
    };
  };
}

/** Permission handler for web/API routes — denies all built-in tools. */
const serverPermissionHandler = createPermissionHandler("Server");

/** Permission handler for CLI usage — denies all built-in tools. */
const cliPermissionHandler = createPermissionHandler("CLI");

export interface GenerateOptions {
  prompt: string;
  model?: string;
  /** Use restricted permissions (for server/API routes) */
  serverMode?: boolean;
  /** Timeout in milliseconds for the LLM call (default: 90000) */
  timeoutMs?: number;
  /** AbortSignal to cancel the request early */
  signal?: AbortSignal;
}

/** Default LLM request timeout in ms, configurable via INNOVATOR_LLM_TIMEOUT_MS env var. */
const DEFAULT_TIMEOUT_MS = (() => {
  const env = process.env.INNOVATOR_LLM_TIMEOUT_MS;
  if (env) {
    const parsed = Number(env);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 90_000;
})();

async function withLlmPermit<T>(
  options: GenerateOptions,
  operation: (permittedOptions: GenerateOptions) => Promise<T>
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  try {
    while (true) {
      await waitForClientReset(signal);
      await llmSemaphore.acquire({ signal });
      if (!zombieResetPromise) break;
      llmSemaphore.release();
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new AbortError("Request was aborted");
    }
    if (timeoutSignal.aborted) {
      throw new LlmTimeoutError(timeoutMs, { model: options.model });
    }
    throw error;
  }

  liveLlmCallers++;
  let releaseOnExit = true;
  try {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new LlmTimeoutError(timeoutMs, { model: options.model });
    }
    const permittedOptions = {
      ...options,
      signal,
      timeoutMs: remainingMs,
    };
    const operationPromise = operation(permittedOptions);
    const operationId = Symbol("llm-operation");
    releaseOnExit = false;
    activeLlmOperations.add(operationId);
    operationPromise.then(
      () => finishLlmOperation(operationId),
      () => finishLlmOperation(operationId)
    );

    return await new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(
          options.signal?.aborted
            ? new AbortError("Request was aborted")
            : new LlmTimeoutError(timeoutMs, { model: options.model })
        );
      };

      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
      operationPromise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  } finally {
    liveLlmCallers--;
    if (releaseOnExit) {
      llmSemaphore.release();
    }
    scheduleZombieReset();
  }
}

/**
 * Send a prompt and wait for the complete response.
 */
export async function generateText(options: GenerateOptions): Promise<string> {
  if (options.signal?.aborted) {
    throw new AbortError("Request was aborted");
  }

  return withLlmPermit(options, generateTextWithPermit);
}

async function generateTextWithPermit(options: GenerateOptions): Promise<string> {
  const client = await getCopilotClient();
  if (options.signal?.aborted) {
    throw new AbortError("Request was aborted during client startup");
  }
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    availableTools: [],
    infiniteSessions: { enabled: false },
    onPermissionRequest: options.serverMode ? serverPermissionHandler : cliPermissionHandler,
  });
  const sessionCleanup = createSessionCleanup(client, session);
  if (options.signal?.aborted) {
    await sessionCleanup.cleanup();
    throw new AbortError("Request was aborted during session setup");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortHandler = () => {
    sessionCleanup.disconnect().catch(() => {});
  };

  try {
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    const response = await Promise.race([
      session.sendAndWait({ prompt: options.prompt }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new LlmTimeoutError(timeoutMs, { model: options.model })),
          timeoutMs
        );
      }),
    ]);
    const content = response?.data?.content ?? "";
    if (!content) {
      throw new LlmParseError("LLM returned an empty response", "", { model: options.model });
    }
    return content;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    await sessionCleanup.cleanup();
  }
}

/**
 * Send a prompt and stream chunks via a callback.
 */
export async function generateTextStream(
  options: GenerateOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  if (options.signal?.aborted) {
    throw new AbortError("Request was aborted");
  }

  return withLlmPermit(options, (permittedOptions) =>
    generateTextStreamWithPermit(permittedOptions, onChunk)
  );
}

async function generateTextStreamWithPermit(
  options: GenerateOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const client = await getCopilotClient();
  if (options.signal?.aborted) {
    throw new AbortError("Request was aborted during client startup");
  }
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    availableTools: [],
    infiniteSessions: { enabled: false },
    onPermissionRequest: options.serverMode ? serverPermissionHandler : cliPermissionHandler,
  });
  const sessionCleanup = createSessionCleanup(client, session);
  if (options.signal?.aborted) {
    await sessionCleanup.cleanup();
    throw new AbortError("Request was aborted during session setup");
  }

  let fullText = "";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortHandler = () => {
    sessionCleanup.disconnect().catch(() => {});
  };

  let unsubDelta: (() => void) | undefined;
  let unsubIdle: (() => void) | undefined;
  let unsubError: (() => void) | undefined;

  try {
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    const deltaListener = (event: { data: { deltaContent: string } }) => {
      const chunk = event.data.deltaContent;
      fullText += chunk;
      onChunk(chunk);
    };

    const idleListener = () => {
      idleResolve(fullText);
    };

    const errorListener = (err: { data: { message: string } }) => {
      idleReject(new LlmError(err.data.message, { model: options.model }));
    };

    let idleResolve: (value: string) => void;
    let idleReject: (reason: unknown) => void;

    return await Promise.race([
      new Promise<string>((resolve, reject) => {
        idleResolve = resolve;
        idleReject = reject;

        unsubDelta = session.on("assistant.message_delta", deltaListener);
        unsubIdle = session.on("session.idle", idleListener);
        unsubError = session.on("session.error", errorListener);

        session.send({ prompt: options.prompt }).catch(reject);
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          sessionCleanup.disconnect().catch(() => {});
          reject(new LlmTimeoutError(timeoutMs, { model: options.model }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    unsubDelta?.();
    unsubIdle?.();
    unsubError?.();
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    await sessionCleanup.cleanup();
  }
}

/**
 * LRU cache for extractJson — avoids re-parsing identical LLM responses.
 * Bounded to 128 entries with a 5-minute TTL to limit memory usage.
 */
const extractJsonCache = new LRUCache<string, string>({ maxSize: 128, ttlMs: 300_000 });

/**
 * Extract JSON from an LLM response that may contain markdown or extra text.
 * Supports both JSON objects (`{...}`) and JSON arrays (`[...]`).
 * Uses bracket-balanced extraction instead of greedy regex.
 * The raw input is sanitized (hidden chars stripped, injection patterns removed)
 * before extraction. Results are cached to avoid re-parsing identical responses.
 */
export function extractJson(raw: string): string {
  const sanitized = sanitizeLlmOutput(raw);
  const cached = extractJsonCache.get(sanitized);
  if (cached !== undefined) return cached;

  const result = extractJsonUncached(sanitized);
  extractJsonCache.set(sanitized, result);
  return result;
}

/** Expose cache stats for observability. */
export function extractJsonCacheStats() {
  return extractJsonCache.stats();
}

/**
 * Strip trailing commas before closing braces/brackets in JSON.
 * LLMs frequently produce JSON with trailing commas which is invalid per spec.
 * Tracks string literal boundaries to avoid corrupting values.
 */
function stripTrailingCommas(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      continue;
    }

    if (!inString && ch === ",") {
      // Look ahead: if only whitespace before a closing brace/bracket, skip the comma
      let j = i + 1;
      while (
        j < json.length &&
        (json[j] === " " || json[j] === "\t" || json[j] === "\n" || json[j] === "\r")
      ) {
        j++;
      }
      if (j < json.length && (json[j] === "}" || json[j] === "]")) {
        continue; // skip trailing comma
      }
    }

    result.push(ch);
  }

  return result.join("");
}

/**
 * Uncached JSON extraction implementation.
 */
function extractJsonUncached(raw: string): string {
  // Try fenced JSON block first
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    const trimmed = fenced[1].trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return stripTrailingCommas(trimmed);
  }

  // Find the first { or [ to determine JSON start
  const braceStart = raw.indexOf("{");
  const bracketStart = raw.indexOf("[");

  let start: number;

  if (braceStart === -1 && bracketStart === -1) {
    throw new LlmParseError("No JSON object found in response", raw);
  } else if (braceStart === -1) {
    start = bracketStart;
  } else if (bracketStart === -1) {
    start = braceStart;
  } else {
    start = Math.min(braceStart, bracketStart);
  }

  // Track depth for both bracket types to handle nested arrays in objects and vice versa
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;

    if (braceDepth === 0 && bracketDepth === 0) {
      return stripTrailingCommas(raw.slice(start, i + 1));
    }
  }

  throw new LlmParseError("Unbalanced JSON braces in response", raw);
}
