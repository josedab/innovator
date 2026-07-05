---
id: mcp-server
title: MCP Server
sidebar_position: 3
---

# MCP Server

The Innovator MCP (Model Context Protocol) server exposes Innovator tools to MCP-compatible clients such as VS Code, Cursor, Windsurf, and Claude Desktop.

## Transport

The server supports **stdio only**:

```bash
npx @innovator/mcp-server
```

The legacy `--sse` flag fails closed with an error. Innovator does not start an MCP HTTP/SSE listener and does not use `MCP_PORT`.

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "innovator": {
      "command": "npx",
      "args": ["@innovator/mcp-server"],
      "env": {
        "MCP_ALLOWED_ROOT": "/absolute/path/to/repository"
      }
    }
  }
}
```

### VS Code / Cursor

Add to `.vscode/mcp.json`:

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

## Available Tools

Core tools include:

| Tool                    | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `investigate`           | Analyze a subject to identify key aspects, challenges, and opportunities |
| `innovate`              | Generate ideas with a selected creativity angle                          |
| `auto`                  | Run the investigate → generate → synthesize pipeline                     |
| `nl-innovate`           | Execute an innovation workflow from a natural-language prompt            |
| `innovate-from-code`    | Analyze a codebase for debt, gaps, bottlenecks, and opportunities        |
| `innovate-file`         | Analyze one file for complexity, patterns, and opportunities             |
| `innovate-architecture` | Analyze repository architecture and produce Innovation PR plans          |

The server also exposes additional research, memory, persona, swarm, network, resource, and prompt capabilities. Inspect the tools advertised by your MCP client for the installed version.

## Filesystem Restrictions

Filesystem analysis fails unless the requested real path remains inside `MCP_ALLOWED_ROOT`.

- Default root: the MCP process working directory
- Symlinks: resolved before the containment check
- `innovate-from-code.maxFiles`: default `200`, minimum `1`, maximum `1000`

Set the narrowest practical root. Do not point `MCP_ALLOWED_ROOT` at an entire home directory when only one repository is needed.

## Environment Variables

| Variable                   | Description                                             | Default                   |
| -------------------------- | ------------------------------------------------------- | ------------------------- |
| `MCP_ALLOWED_ROOT`         | Filesystem boundary for code-analysis tools             | Current working directory |
| `INNOVATOR_DEFAULT_MODEL`  | Default LLM model                                       | `gpt-4.1`                 |
| `INNOVATOR_LLM_TIMEOUT_MS` | LLM request timeout in milliseconds                     | `90000`                   |
| `GH_TOKEN`                 | Copilot authentication for non-interactive environments | _unset_                   |

For local interactive use, the Copilot provider can use an authenticated GitHub CLI session (`gh auth login`).

## Architecture

```text
MCP client
  ↕ stdio
@innovator/mcp-server
  ├── server.ts    → tools, resources, prompts, transport
  ├── handlers.ts  → validation and filesystem boundary checks
  └── schemas.ts   → Zod input schemas
        ↓
@innovator/core → GitHub Copilot
```

All business logic remains in `@innovator/core`; the MCP package is a transport and validation adapter.
