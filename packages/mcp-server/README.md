# @innovator/mcp-server

Model Context Protocol (MCP) server for Innovator. Exposes `investigate`, `innovate`, and `auto` as tools callable by any MCP-compatible client (Claude Desktop, Cursor, Windsurf, VS Code).

## Installation

```bash
npm install
npm run build
```

## Usage

### stdio transport (default)

```bash
npx @innovator/mcp-server
```

### SSE transport

```bash
npx @innovator/mcp-server --sse
# Server listens on port 3100 (configurable via MCP_PORT env var)
```

## MCP Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

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

Add to `.vscode/mcp.json`:

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

## Tools

| Tool                    | Description                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `investigate`           | Analyze a subject to identify key aspects, challenges, and opportunities              |
| `innovate`              | Generate ideas using a specific creativity angle                                      |
| `auto`                  | Run the full pipeline: investigate → generate → synthesize                            |
| `innovate-from-code`    | Analyze a codebase for architectural debt, feature gaps, and innovation opportunities |
| `innovate-file`         | Analyze a specific file for complexity, patterns, and innovation opportunities        |
| `innovate-architecture` | Analyze repository architecture and generate Innovation PRs with implementation plans |
