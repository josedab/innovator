---
id: mcp-server
title: MCP Server
sidebar_position: 3
---

# MCP Server

The Innovator MCP (Model Context Protocol) server exposes Innovator's capabilities as tools callable by any MCP-compatible AI client — Claude Desktop, Cursor, Windsurf, VS Code, and others.

## Installation

From the monorepo root:

```bash
npm install
npm run build -w packages/mcp-server
```

## Usage

### stdio transport (default)

```bash
npx @innovator/mcp-server
```

The server communicates over stdin/stdout, which is the standard MCP transport for local tool integrations.

### SSE transport

```bash
npx @innovator/mcp-server --sse
```

Starts an HTTP server on port **3100** (configurable via `MCP_PORT` environment variable) that exposes MCP tools over Server-Sent Events.

```bash
MCP_PORT=4000 npx @innovator/mcp-server --sse
```

## Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "innovator": {
      "command": "npx",
      "args": ["@innovator/mcp-server"]
    }
  }
}
```

### VS Code / Cursor

Add to `.vscode/mcp.json` in your project:

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

## Available Tools

| Tool          | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `investigate` | Analyze a subject to identify key aspects, challenges, and opportunities |
| `innovate`    | Generate ideas using a specific creativity angle                         |
| `auto`        | Run the full pipeline: investigate → generate → synthesize               |

### `investigate`

Analyzes a subject and returns structured findings including key aspects, state of the art, challenges, and opportunities.

**Parameters:**

- `subject` (string, required) — the topic to investigate
- `model` (string, optional) — LLM model override

### `innovate`

Generates innovation ideas using a specified angle (e.g., SCAMPER, First Principles).

**Parameters:**

- `subject` (string, required) — the topic to innovate on
- `angle` (string, required) — one of the 8 innovation angles
- `investigation` (object, optional) — prior investigation results for context
- `model` (string, optional) — LLM model override

### `auto`

Runs the complete pipeline: investigate → generate ideas across all angles → synthesize.

**Parameters:**

- `subject` (string, required) — the topic to analyze
- `model` (string, optional) — LLM model override

## Environment Variables

| Variable                  | Description            | Default   |
| ------------------------- | ---------------------- | --------- |
| `MCP_PORT`                | Port for SSE transport | `3100`    |
| `INNOVATOR_DEFAULT_MODEL` | Default LLM model      | `gpt-4.1` |

The MCP server uses the same LLM provider configuration as the rest of Innovator. See [Configuration](/docs/configuration) for all environment variables.

## Architecture

```
AI Client (Claude Desktop / Cursor / VS Code)
  ↕ stdio or SSE
MCP Server
  ├── index.ts      → transport selection and server setup
  ├── handlers.ts   → tool implementations wrapping @innovator/core
  └── schemas.ts    → Zod input validation schemas
        ↓
  @innovator/core → LLM Provider → LLM
```

The MCP server is a thin wrapper around `@innovator/core`. All business logic lives in the core package.
