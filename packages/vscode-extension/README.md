# Innovator VS Code Extension

GitHub Copilot Chat participant (`@innovator`) that brings AI-powered innovation
directly into your editor.

## Installation

### From VSIX (Local Build)

1. Build the extension:

   ```bash
   cd packages/vscode-extension
   npm run build
   npm run package
   ```

2. Install in VS Code:
   - Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run **Extensions: Install from VSIX...**
   - Select the generated `.vsix` file

### From Source (Development)

1. Open the monorepo root in VS Code
2. Run `npm install` at the root
3. Press **F5** to launch the Extension Development Host

### Prerequisites

- VS Code **1.93+**
- Active **GitHub Copilot** subscription (the extension uses Copilot Chat)

## Commands

The extension registers a `@innovator` chat participant with three slash commands:

| Command        | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| `/investigate` | Analyze a subject for key aspects, challenges, and opportunities |
| `/innovate`    | Generate innovation ideas using creativity angles                |
| `/score`       | Score and rank generated ideas by feasibility and impact         |

## Usage

Open **GitHub Copilot Chat** in VS Code and type:

```
@innovator /investigate quantum computing in healthcare
@innovator /innovate sustainable packaging
@innovator /score
```

### Workflow

1. **Investigate** — Start by investigating a subject to get structured findings
2. **Innovate** — Apply creativity angles (SCAMPER, First Principles, etc.) to generate ideas
3. **Score** — Rank the generated ideas by feasibility, impact, and novelty

### Tips

- You can type `@innovator` followed by a free-form message to get general innovation guidance
- Use `/investigate` first — the investigation context improves the quality of `/innovate` results
- `/score` uses the ideas from the most recent `/innovate` response in the conversation

## Settings

The extension does not add custom VS Code settings. Configuration is handled through environment variables inherited from the Copilot SDK:

| Variable                   | Description                              | Default   |
| -------------------------- | ---------------------------------------- | --------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used for innovation operations | `gpt-4.1` |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for LLM requests in milliseconds | `90000`   |

Set these in your shell profile or `.env.local` at the monorepo root before launching VS Code.

## Development

```bash
# Build the extension
npm run build

# Watch for changes
npm run watch

# Press F5 in VS Code to launch Extension Development Host
```

### Project Structure

```
packages/vscode-extension/
├── src/
│   └── extension.ts   # Chat participant registration and command handlers
├── package.json       # Extension manifest with chat participant contributions
└── tsconfig.json      # TypeScript configuration
```

## Packaging

```bash
npm run package
# Produces a .vsix file in the package directory
```

## Troubleshooting

| Issue                              | Solution                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@innovator` not appearing in chat | Ensure you have VS Code 1.93+ and an active Copilot subscription. Reload the window after install. |
| Commands return errors             | Run `gh auth login` in your terminal to refresh Copilot authentication.                            |
| Extension fails to activate        | Check the **Output** panel → **Extension Host** for error logs. Rebuild with `npm run build`.      |
| VSIX install fails                 | Ensure you built the extension first: `npm run build && npm run package`.                          |
| Slow responses                     | Increase `INNOVATOR_LLM_TIMEOUT_MS`. Complex subjects take longer to process.                      |
