/**
 * @module copilot-extension/server
 *
 * Compatibility stub for the retired GitHub App-based Copilot Extension protocol.
 */

export interface ServerConfig {
  port?: number;
  host?: string;
  githubToken?: string;
  /** @deprecated Retained only for source compatibility with the retired protocol. */
  webhookSecret?: string;
  model?: string;
  skipVerification?: boolean;
}

export const COPILOT_EXTENSION_RETIREMENT_MESSAGE =
  "GitHub App-based Copilot Extensions were retired by GitHub on November 10, 2025. " +
  "Use @innovator/mcp-server for GitHub Copilot and other MCP-compatible clients.";

/**
 * @deprecated GitHub retired server-side Copilot Extensions. Use `@innovator/mcp-server`.
 */
export class CopilotExtensionServer {
  constructor(_config: ServerConfig = {}) {}

  async start(): Promise<never> {
    throw new Error(COPILOT_EXTENSION_RETIREMENT_MESSAGE);
  }

  async stop(): Promise<void> {}
}
