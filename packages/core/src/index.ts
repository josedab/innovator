// Core types
export * from "./types.js";

// Copilot client
export {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "./copilot/client.js";

// Re-export GenerateOptions for consumers that need the type
export type { GenerateOptions } from "./copilot/client.js";

// Innovation engine
export {
  ANGLES,
  getAngleById,
  investigate,
  generateForAngle,
  runAutoPipeline,
} from "./innovation/index.js";

// Prompts (for advanced usage)
export { buildInvestigationPrompt, buildSynthesisPrompt } from "./prompts/investigation.js";
export { sanitizeLlmOutput } from "./prompts/sanitize.js";

// Retry utility
export { withRetry } from "./copilot/retry.js";
export type { RetryOptions } from "./copilot/retry.js";
