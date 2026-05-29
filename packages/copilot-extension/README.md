# @innovator/copilot-extension

Compatibility and migration stub for the retired GitHub App-based Copilot Extensions platform.

## Status

GitHub retired server-side, GitHub App-based Copilot Extensions on **November 10, 2025**. This package no longer starts an HTTP server, accepts webhooks, or exposes an `@innovator` Copilot Chat agent.

Running the package fails intentionally:

```bash
npm run start --workspace=packages/copilot-extension
```

The command exits non-zero and directs users to `@innovator/mcp-server`. `CopilotExtensionServer.start()` throws the same retirement error so old integrations fail closed instead of appearing to run.

## Migration

Use the MCP server for direct integration with GitHub Copilot and other MCP-compatible clients:

```json
{
  "servers": {
    "innovator": {
      "command": "npx",
      "args": ["@innovator/mcp-server"]
    }
  }
}
```

The MCP server supports **stdio only**. See the [MCP Server README](../mcp-server/README.md) for client configuration, available tools, and filesystem restrictions.

## Compatibility API

The package keeps minimal exports so existing imports can produce a clear migration error:

```ts
import {
  CopilotExtensionServer,
  COPILOT_EXTENSION_RETIREMENT_MESSAGE,
} from "@innovator/copilot-extension";

const server = new CopilotExtensionServer();
await server.start(); // throws COPILOT_EXTENSION_RETIREMENT_MESSAGE
```

Webhook helpers are compatibility stubs and must not be used to build a new server-side Copilot Extension.
The deprecated `verifySignature(payload, signature, secret)` export and
`ServerConfig.webhookSecret` field remain only so legacy TypeScript imports compile during migration.

## VS Code Extension

The client-side [`packages/vscode-extension`](../vscode-extension/README.md) is a separate integration and remains supported. GitHub's retirement of the server-side GitHub App platform does not retire the VS Code extension.

## License

MIT — see [LICENSE](../../LICENSE).
