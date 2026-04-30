import { validateEnv } from "./lib/env";
import { stopCopilotClient } from "@innovator/core";

export function register() {
  validateEnv();

  // Clean up CopilotClient resources on shutdown
  const cleanup = () => {
    stopCopilotClient().catch(() => {});
  };
  process.on("beforeExit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
