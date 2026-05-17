/**
 * @module copilot
 *
 * Copilot SDK integration layer — provides LLM text generation, streaming,
 * JSON extraction, automatic retry with exponential backoff, and timeout utilities.
 */
export * from "./client.js";
export * from "./retry.js";
export { withTimeout } from "./timeout.js";
