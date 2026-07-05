---
id: copilot-extension
title: Copilot Extension Migration
sidebar_position: 8
---

# Copilot Extension Migration

GitHub retired server-side, GitHub App-based Copilot Extensions on **November 10, 2025**. The previous setup based on a GitHub App, webhook endpoint, and `@innovator` server-side agent is no longer available.

## Repository Status

`packages/copilot-extension` remains only as a compatibility and migration stub:

- `npm run start --workspace=packages/copilot-extension` exits non-zero.
- `CopilotExtensionServer.start()` throws a retirement error.
- The package does not listen on a port or process GitHub webhooks.
- `COPILOT_EXT_PORT` and `COPILOT_WEBHOOK_SECRET` are no longer runtime configuration.

This fail-closed behavior prevents an obsolete integration from appearing healthy.

## Migrate to MCP

Direct users should configure `@innovator/mcp-server` in their Copilot or MCP-compatible client:

```json
{
  "servers": {
    "innovator": {
      "command": "npx",
      "args": ["@innovator/mcp-server"],
      "env": {
        "MCP_ALLOWED_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

The MCP server uses stdio only. The old `--sse` network transport is disabled. See the [MCP Server guide](/docs/guides/mcp-server) for tools and filesystem safety limits.

## Existing Imports

Legacy code may still import the compatibility class:

```ts
import { CopilotExtensionServer } from "@innovator/copilot-extension";

const server = new CopilotExtensionServer();
await server.start(); // throws migration guidance
```

Replace the server process and webhook registration with MCP client configuration rather than catching and suppressing this error.

## VS Code Extension

The client-side VS Code extension is separate from GitHub's retired server-side Copilot Extensions platform and remains supported. See [`packages/vscode-extension`](https://github.com/josedab/innovator/tree/main/packages/vscode-extension).
