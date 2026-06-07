/** Error codes from expected client disconnects (browser navigating away, etc.). */
const CONNECTION_ERROR_CODES = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED"]);

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  return /aborted|socket hang up|broken pipe/i.test(err.message);
}

const globalForInstrumentation = globalThis as typeof globalThis & {
  __innovatorProcessHandlersRegistered?: boolean;
};

export async function registerNodeInstrumentation(): Promise<void> {
  if (globalForInstrumentation.__innovatorProcessHandlersRegistered) return;
  globalForInstrumentation.__innovatorProcessHandlersRegistered = true;

  const { stopCopilotClient } = await import("@innovator/core");

  const cleanup = () => stopCopilotClient().catch(() => {});
  process.on("beforeExit", cleanup);
  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());

  process.on("uncaughtException", (err) => {
    if (isConnectionError(err)) {
      console.warn(
        "[innovator] Connection closed by client (suppressed):",
        (err as NodeJS.ErrnoException).code ?? err.message
      );
      return;
    }
    console.error("[innovator] Uncaught exception:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    if (isConnectionError(reason)) {
      console.warn(
        "[innovator] Unhandled rejection from client disconnect (suppressed):",
        reason instanceof Error
          ? ((reason as NodeJS.ErrnoException).code ?? reason.message)
          : reason
      );
      return;
    }
    console.error("[innovator] Unhandled rejection:", reason);
    process.exit(1);
  });
}
