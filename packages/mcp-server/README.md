# @innovator/mcp-server

Model Context Protocol (MCP) server for Innovator. Exposes `investigate`, `innovate`, and `auto` as tools callable by any MCP-compatible client (Claude Desktop, Cursor, Windsurf, VS Code).

## Installation

```bash
npm install
npm run build
```

## Usage

### stdio transport

```bash
npx @innovator/mcp-server
```

stdio is the only supported transport. The legacy `--sse` flag fails closed with an error; there is no MCP HTTP listener or `MCP_PORT` setting.

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
| `nl-innovate`           | Run innovation pipeline from a natural language prompt                                |
| `memory-search`         | Search innovation memory graph for related past ideas                                 |
| `org-dna`               | Generate organizational innovation DNA report                                         |
| `persona-eval`          | Evaluate an idea through multiple stakeholder personas                                |

### Tool Parameter Schemas

#### `investigate`

```json
{
  "subject": { "type": "string", "minLength": 1, "maxLength": 500, "required": true },
  "model": { "type": "string", "required": false, "description": "LLM model override" }
}
```

#### `innovate`

```json
{
  "subject": { "type": "string", "minLength": 1, "maxLength": 500, "required": true },
  "investigation": {
    "type": "object",
    "required": true,
    "description": "Previously generated investigation context",
    "properties": {
      "summary": { "type": "string" },
      "keyAspects": [{ "title": "string", "description": "string" }],
      "currentState": { "type": "string" },
      "challenges": { "type": "string[]" },
      "opportunities": { "type": "string[]" }
    }
  },
  "angleId": {
    "type": "string",
    "required": true,
    "enum": [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision"
    ]
  },
  "model": { "type": "string", "required": false }
}
```

#### `auto`

```json
{
  "subject": { "type": "string", "minLength": 1, "maxLength": 500, "required": true },
  "model": { "type": "string", "required": false },
  "angles": { "type": "string[]", "required": false, "description": "Subset of angle IDs to use" }
}
```

#### `innovate-from-code`

```json
{
  "path": {
    "type": "string",
    "required": true,
    "description": "Path to the repository or directory"
  },
  "maxFiles": {
    "type": "number",
    "minimum": 1,
    "maximum": 1000,
    "required": false,
    "default": 200
  }
}
```

#### `innovate-file`

```json
{
  "path": {
    "type": "string",
    "required": true,
    "description": "Path to the specific file to analyze"
  }
}
```

#### `innovate-architecture`

```json
{
  "path": { "type": "string", "required": true, "description": "Path to the repository" }
}
```

#### `nl-innovate`

```json
{
  "prompt": { "type": "string", "minLength": 1, "maxLength": 5000, "required": true },
  "model": { "type": "string", "required": false }
}
```

#### `memory-search`

```json
{
  "query": { "type": "string", "minLength": 1, "maxLength": 2000, "required": true },
  "threshold": { "type": "number", "min": 0, "max": 1, "required": false, "default": 0.3 },
  "limit": { "type": "number", "min": 1, "max": 50, "required": false, "default": 10 }
}
```

#### `org-dna`

```json
{
  "format": { "type": "string", "enum": ["json", "markdown"], "required": false, "default": "json" }
}
```

#### `persona-eval`

```json
{
  "idea": { "type": "string", "minLength": 1, "maxLength": 5000, "required": true },
  "personaIds": {
    "type": "string[]",
    "minItems": 1,
    "maxItems": 12,
    "required": true,
    "description": "e.g., cto, end-user, investor, regulator"
  },
  "model": { "type": "string", "required": false }
}
```

### Response Formats

All tools return `content` as an array of text objects:

```json
{
  "content": [{ "type": "text", "text": "<JSON or Markdown result>" }]
}
```

**`investigate`** returns a JSON object:

```json
{
  "summary": "string",
  "keyAspects": [{ "title": "string", "description": "string" }],
  "currentState": "string",
  "challenges": ["string"],
  "opportunities": ["string"]
}
```

**`auto`** returns a JSON object with the final pipeline result and a progress log:

```json
{
  "finalResult": { "stage": "complete", "angleResults": [...], "synthesis": {...} },
  "progressLog": [{ "stage": "string", "completedAngles": [...], "totalAngles": 8 }]
}
```

**`innovate-from-code`** returns a JSON object:

```json
{
  "summary": { "files": 0, "lines": 0, "languages": [], "patterns": 0, "subjects": 0 },
  "architecturalDebt": [...],
  "featureGaps": [...],
  "performanceBottlenecks": [...],
  "innovationOpportunities": [...],
  "innovationPRs": [{ "title": "", "category": "", "priority": "", "effort": "" }]
}
```

**`innovate-architecture`** returns a Markdown report with an analysis summary and Innovation PR details.

## Filesystem Safety

`innovate-from-code`, `innovate-file`, and `innovate-architecture` resolve real filesystem paths and reject any target outside `MCP_ALLOWED_ROOT`.

- `MCP_ALLOWED_ROOT` defaults to the MCP process working directory.
- Symlink targets must remain inside the allowed root.
- `innovate-from-code.maxFiles` accepts `1`–`1000` files and defaults to `200`.

Set an explicit root when the MCP client starts outside the repository you want to analyze:

```bash
MCP_ALLOWED_ROOT=/absolute/path/to/repository npx @innovator/mcp-server
```

## Authentication

The MCP server uses your **GitHub Copilot subscription** via the GitHub CLI for LLM access. No separate API keys are required for default usage.

**Prerequisites:**

1. Active GitHub Copilot subscription
2. GitHub CLI authenticated: `gh auth login`

**Alternative providers** — Set environment variables to use non-Copilot LLM providers:

| Variable            | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `OPENAI_API_KEY`    | Direct OpenAI API access                                  |
| `ANTHROPIC_API_KEY` | Direct Anthropic API access                               |
| `OLLAMA_BASE_URL`   | Local Ollama instance (default: `http://localhost:11434`) |

## Environment Variables

| Variable                   | Description                                              | Default                   |
| -------------------------- | -------------------------------------------------------- | ------------------------- |
| `MCP_ALLOWED_ROOT`         | Maximum filesystem root available to code-analysis tools | Current working directory |
| `INNOVATOR_DEFAULT_MODEL`  | Default LLM model                                        | `gpt-4.1`                 |
| `INNOVATOR_LLM_TIMEOUT_MS` | LLM request timeout in milliseconds                      | `90000`                   |
| `GH_TOKEN`                 | Copilot authentication for non-interactive environments  | _unset_                   |

## Error Handling

When a tool call fails, the server returns an error response:

```json
{
  "content": [{ "type": "text", "text": "Error: <message>" }],
  "isError": true
}
```

Common errors:

| Error                              | Cause                                                          | Resolution                                                   |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `ZodError`                         | Invalid or missing parameters                                  | Check required fields and types against the parameter schema |
| `Path does not exist`              | `innovate-from-code`/`innovate-file` given an invalid path     | Provide an absolute path to an existing file or directory    |
| `Path is outside MCP_ALLOWED_ROOT` | Requested path resolves outside the configured filesystem root | Move the target under `MCP_ALLOWED_ROOT` or change the root  |
| Copilot token errors               | GitHub CLI not authenticated or no Copilot subscription        | Run `gh auth login` and verify Copilot access                |
| LLM timeout                        | LLM request exceeded the timeout threshold                     | Increase `INNOVATOR_LLM_TIMEOUT_MS` or simplify the subject  |

## Troubleshooting

| Issue                                              | Solution                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server starts but tools don't appear in client** | Ensure your MCP client config points to the correct command (`npx @innovator/mcp-server`). Restart the client after config changes.                      |
| **"Cannot find module" errors on startup**         | Run `npm run build` first. The MCP server requires compiled output in `dist/`.                                                                           |
| **Claude Desktop doesn't connect**                 | Check `claude_desktop_config.json` syntax — JSON must be valid. Verify the path in `command` is accessible. Restart Claude Desktop after config changes. |
| **`--sse` exits with an error**                    | This is expected. Network transports are disabled; configure the client to launch the stdio command instead.                                             |
| **`gh auth` / Copilot token errors**               | Run `gh auth login` and ensure your account has an active Copilot subscription. In CI, set `GH_TOKEN` env var.                                           |
| **Slow responses or timeouts**                     | LLM calls can take 30–120s for complex subjects. Increase `INNOVATOR_LLM_TIMEOUT_MS` (default: 90000). Use a simpler subject to test connectivity.       |
| **`innovate-from-code` returns empty results**     | Ensure the path is inside `MCP_ALLOWED_ROOT` and contains source files. The tool scans `maxFiles` files (default: 200, maximum: 1000).                   |
| **stdio transport garbles output**                 | Don't mix stdio MCP output with other stdout logging. The MCP server uses stdout exclusively for JSON-RPC messages in stdio mode.                        |
