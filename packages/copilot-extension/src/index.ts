/**
 * @module copilot-extension
 *
 * GitHub Copilot Extension webhook server.
 * Handles @innovator commands in Copilot Chat (VS Code, GitHub.com, CLI).
 * Publishes as a GitHub App with Copilot Extension capabilities.
 *
 * Supports: /investigate, /innovate, /auto, /angles, /presets, /help
 */

export { CopilotExtensionServer, type ServerConfig } from "./server.js";
export { handleWebhook, type WebhookPayload, type WebhookResponse } from "./webhook.js";
export { verifySignature } from "./verify.js";
export { EXTENSION_MANIFEST, type ExtensionManifest } from "./manifest.js";
