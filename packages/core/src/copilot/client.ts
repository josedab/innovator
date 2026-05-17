import { CopilotClient } from "@github/copilot-sdk";
import type { PermissionRequest } from "@github/copilot-sdk";
import { AbortError, LlmError, LlmTimeoutError, LlmParseError } from "../errors.js";

const DEFAULT_MODEL = process.env.INNOVATOR_DEFAULT_MODEL || "gpt-4.1";

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

let clientPromise: Promise<CopilotClient> | null = null;

/**
 * Get or create the shared {@link CopilotClient} singleton.
 * The client is lazily initialized on first call and reused for subsequent calls.
 *
 * @returns A started CopilotClient instance
 * @throws If the client fails to start (e.g. missing GitHub CLI auth)
 */
export async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new CopilotClient();
      try {
        await client.start();
        return client;
      } catch (err) {
        // Clear the cached promise so next call retries
        clientPromise = null;
        throw err;
      }
    })();
  }
  return clientPromise;
}

/**
 * Stop the shared CopilotClient and release resources.
 * Safe to call even if no client has been created.
 */
export async function stopCopilotClient(): Promise<void> {
  if (clientPromise) {
    try {
      const client = await clientPromise;
      await client.stop();
    } finally {
      clientPromise = null;
    }
  }
}

/**
 * Create a restricted permission handler that only allows read operations.
 * Denies shell, write, and custom-tool requests with a contextual error message.
 */
function createPermissionHandler(mode: string) {
  return (request: PermissionRequest) => {
    if (request.kind === "read") {
      return { kind: "approved" as const };
    }
    return {
      kind: "denied-by-rules" as const,
      rules: [`${mode} mode: ${request.kind} not allowed`],
    };
  };
}

/** Permission handler for web/API routes — restricts Copilot to read-only operations. */
const serverPermissionHandler = createPermissionHandler("Server");

/** Permission handler for CLI usage — restricts Copilot to read-only operations. */
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

/**
 * Send a prompt and wait for the complete response.
 */
export async function generateText(options: GenerateOptions): Promise<string> {
  if (options.signal?.aborted) {
    throw new AbortError("Request was aborted");
  }

  const client = await getCopilotClient();
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    onPermissionRequest: options.serverMode ? serverPermissionHandler : cliPermissionHandler,
  });

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortHandler = () => {
    safeDisconnect(session).catch(() => {});
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
    return response?.data?.content ?? "";
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    await safeDisconnect(session);
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

  const client = await getCopilotClient();
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    onPermissionRequest: options.serverMode ? serverPermissionHandler : cliPermissionHandler,
  });

  let fullText = "";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortHandler = () => {
    safeDisconnect(session).catch(() => {});
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
      safeDisconnect(session)
        .then(() => idleResolve(fullText))
        .catch(idleReject);
    };

    const errorListener = (err: { data: { message: string } }) => {
      safeDisconnect(session)
        .then(() => idleReject(new LlmError(err.data.message, { model: options.model })))
        .catch(idleReject);
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
          safeDisconnect(session).catch(() => {});
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
    await safeDisconnect(session);
  }
}

/**
 * Extract JSON from an LLM response that may contain markdown or extra text.
 * Supports both JSON objects (`{...}`) and JSON arrays (`[...]`).
 * Uses bracket-balanced extraction instead of greedy regex.
 */
export function extractJson(raw: string): string {
  // Try fenced JSON block first
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    const trimmed = fenced[1].trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
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
      return raw.slice(start, i + 1);
    }
  }

  throw new LlmParseError("Unbalanced JSON braces in response", raw);
}
