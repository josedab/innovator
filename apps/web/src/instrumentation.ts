import { validateEnv } from "./lib/env";

/**
 * Next.js instrumentation entry point.
 *
 * Validates configuration in every runtime and loads process-level lifecycle
 * handlers only for the Node.js server runtime.
 */
export async function register() {
  validateEnv();

  if (process.env.NEXT_RUNTIME === "edge") return;

  const { registerNodeInstrumentation } = await import("./instrumentation-node");
  await registerNodeInstrumentation();
}
