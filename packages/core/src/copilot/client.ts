import { CopilotClient, approveAll } from "@github/copilot-sdk";
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

export interface GenerateOptions {
  prompt: string;
  model?: string;
  /** Use restricted permissions (for server/API routes) */
  serverMode?: boolean;
}

/**
 * Send a prompt and wait for the complete response.
 */
export async function generateText(options: GenerateOptions): Promise<string> {
  const client = await getCopilotClient();
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    onPermissionRequest: options.serverMode ? serverPermissionHandler : approveAll,
  });

  try {
    const response = await session.sendAndWait({
      prompt: options.prompt,
    });
    return response?.data?.content ?? "";
  } finally {
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
  const client = await getCopilotClient();
  const session = await client.createSession({
    model: options.model || DEFAULT_MODEL,
    onPermissionRequest: options.serverMode ? serverPermissionHandler : approveAll,
  });

  let fullText = "";

  return new Promise<string>((resolve, reject) => {
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
  });
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
