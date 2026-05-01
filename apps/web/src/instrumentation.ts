import { validateEnv } from "./lib/env";
import { stopCopilotClient } from "@innovator/core";

/**
 * Next.js instrumentation hook that runs once when the server starts.
 *
 * - Validates required environment variables via {@link validateEnv}.
 * - Registers process cleanup handlers (`beforeExit`, `SIGINT`, `SIGTERM`)
 *   that gracefully shut down the {@link stopCopilotClient | CopilotClient}
 *   before the process exits.
 */
export function register() {
  validateEnv();

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
}
