import { validateEnv } from "./lib/env";

/** Error codes from expected client disconnects (browser navigating away, etc.) */
const CONNECTION_ERROR_CODES = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED"]);

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  return /aborted|socket hang up|broken pipe/i.test(err.message);
}

// Prevent duplicate handler registration during Next.js dev reloads
const globalForInstrumentation = globalThis as typeof globalThis & {
  __innovatorProcessHandlersRegistered?: boolean;
};

/**
 * Next.js instrumentation hook that runs once when the server starts.
 *
 * - Validates required environment variables via {@link validateEnv}.
 * - In the Node.js runtime, registers process cleanup handlers
 *   (`beforeExit`, `SIGINT`, `SIGTERM`) that gracefully shut down
 *   the CopilotClient before the process exits.
 * - Registers `uncaughtException` and `unhandledRejection` handlers
 *   that suppress expected connection-close errors (ECONNRESET, etc.)
 *   from the CopilotClient subprocess while still crashing on real errors.
 *
 * `@innovator/core` is imported dynamically inside the Node.js runtime
 * guard because it transitively depends on `@github/copilot-sdk`, which
 * requires `node:child_process` — unavailable in the Edge runtime.
 */
export async function register() {
  validateEnv();

  if (process.env.NEXT_RUNTIME === "nodejs" && !globalForInstrumentation.__innovatorProcessHandlersRegistered) {
    globalForInstrumentation.__innovatorProcessHandlersRegistered = true;

    const { stopCopilotClient } = await import("@innovator/core");

    // Clean up CopilotClient resources on shutdown
    const cleanup = () => {
      return stopCopilotClient().catch(() => {});
    };
    process.on("beforeExit", cleanup);
    process.on("SIGINT", () => {
      cleanup().finally(() => process.exit(0));
    });
    process.on("SIGTERM", () => {
      cleanup().finally(() => process.exit(0));
    });

    // Suppress expected connection-close errors from the CopilotClient subprocess.
    // These occur when browsers disconnect mid-stream (SSE, navigation, tab close).
    process.on("uncaughtException", (err) => {
      if (isConnectionError(err)) {
        console.warn("[innovator] Connection closed by client (suppressed):", (err as NodeJS.ErrnoException).code ?? err.message);
        return;
      }
      console.error("[innovator] Uncaught exception:", err);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      if (isConnectionError(reason)) {
        console.warn("[innovator] Unhandled rejection from client disconnect (suppressed):", reason instanceof Error ? ((reason as NodeJS.ErrnoException).code ?? reason.message) : reason);
        return;
      }
      console.error("[innovator] Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
