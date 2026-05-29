/**
 * @module copilot-extension
 *
 * Migration compatibility surface for the retired GitHub App-based
 * Copilot Extension. Use `@innovator/mcp-server` for active integrations.
 */

export {
  COPILOT_EXTENSION_RETIREMENT_MESSAGE,
  CopilotExtensionServer,
  type ServerConfig,
} from "./server.js";
export { handleWebhook, type WebhookPayload, type WebhookResponse } from "./webhook.js";
export { verifySignature } from "./verify.js";
export { EXTENSION_MANIFEST, type ExtensionManifest } from "./manifest.js";
