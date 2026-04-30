import { validateEnv } from "./lib/env";
import { stopCopilotClient } from "@innovator/core";

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
