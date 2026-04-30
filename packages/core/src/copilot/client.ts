import { CopilotClient } from "@github/copilot-sdk";
import type { PermissionRequest } from "@github/copilot-sdk";

const DEFAULT_MODEL = process.env.INNOVATOR_DEFAULT_MODEL || "gpt-4.1";

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
 * Restricted permission handler for server-side use.
 * Only allows read operations — denies shell, write, and custom-tool requests.
 */
const serverPermissionHandler = (request: PermissionRequest) => {
  if (request.kind === "read") {
    return { kind: "approved" as const };
  }
  return { kind: "denied-by-rules" as const, rules: [`Server mode: ${request.kind} not allowed`] };
};

/**
 * Restricted permission handler for CLI use.
 * Approves read operations but denies shell, write, and custom-tool requests.
 */
const cliPermissionHandler = (request: PermissionRequest) => {
  if (request.kind === "read") {
    return { kind: "approved" as const };
  }
  return { kind: "denied-by-rules" as const, rules: [`CLI mode: ${request.kind} not allowed`] };
};

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

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Send a prompt and wait for the complete response.
 */
export async function generateText(options: GenerateOptions): Promise<string> {
  if (options.signal?.aborted) {
    throw new Error("Request was aborted");
  }

  const client = await getCopilotClient();
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    onPermissionRequest: options.serverMode ? serverPermissionHandler : cliPermissionHandler,
  });

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortHandler = () => {
    session.disconnect().catch(() => {});
  };

  try {
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    const response = await Promise.race([
      session.sendAndWait({ prompt: options.prompt }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`LLM request timed out after ${timeoutMs / 1000}s`)),
          timeoutMs
        );
      }),
      ...(options.signal
        ? [
            new Promise<never>((_, reject) => {
              if (options.signal!.aborted) reject(new Error("Request was aborted"));
              options.signal!.addEventListener(
                "abort",
                () => reject(new Error("Request was aborted")),
                { once: true }
              );
            }),
          ]
        : []),
    ]);
    return response?.data?.content ?? "";
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    await session.disconnect();
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
    throw new Error("Request was aborted");
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
    session.disconnect().catch(() => {});
  };

  try {
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    return await Promise.race([
      new Promise<string>((resolve, reject) => {
        session.on("assistant.message_delta", (event) => {
          const chunk = event.data.deltaContent;
          fullText += chunk;
          onChunk(chunk);
        });

        session.on("session.idle", () => {
          session
            .disconnect()
            .then(() => resolve(fullText))
            .catch(reject);
        });

        session.on("session.error", (err) => {
          session
            .disconnect()
            .then(() => reject(new Error(err.data.message)))
            .catch(reject);
        });

        session.send({ prompt: options.prompt }).catch(reject);
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          session.disconnect().catch(() => {});
          reject(new Error(`LLM streaming request timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
      }),
      ...(options.signal
        ? [
            new Promise<never>((_, reject) => {
              if (options.signal!.aborted) reject(new Error("Request was aborted"));
              options.signal!.addEventListener(
                "abort",
                () => reject(new Error("Request was aborted")),
                { once: true }
              );
            }),
          ]
        : []),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    await session.disconnect();
  }
}

/**
 * Extract JSON from an LLM response that may contain markdown or extra text.
 * Uses brace-balanced extraction instead of greedy regex.
 */
export function extractJson(raw: string): string {
  // Try fenced JSON block first
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    const trimmed = fenced[1].trim();
    if (trimmed.startsWith("{")) return trimmed;
  }

  // Brace-balanced extraction
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");

  let depth = 0;
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

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  throw new Error("Unbalanced JSON braces in response");
}
