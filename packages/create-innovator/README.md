# create-innovator

Scaffold a new Innovator project with config, custom angles, and presets.

## Usage

```bash
# Interactive mode — prompts for all options
npx create-innovator

# Non-interactive — provide project name directly
npx create-innovator my-project
```

## Non-Interactive / CI Usage

When scripting project creation (e.g., in CI pipelines), provide the project name as a positional argument. The CLI will still prompt for remaining options interactively. To fully automate, pipe answers via stdin or use `yes`/`echo`:

```bash
# Provide project name as argument to skip the first prompt
npx create-innovator my-project

# Fully non-interactive using piped input
# Answers: provider=copilot, copilot-setup=no, presets=yes, custom-angle=no
echo -e "copilot\nn\ny\nn" | npx create-innovator my-project

# Using heredoc for clarity
npx create-innovator my-project <<EOF
copilot
n
y
n
EOF
```

### Prompt Order (for piped input)

When piping input, answers are consumed in this order:

| Order | Prompt                                 | Default                | Values                                     |
| ----- | -------------------------------------- | ---------------------- | ------------------------------------------ |
| 1     | Project name (skipped if arg provided) | `my-innovator-project` | Any valid directory name                   |
| 2     | Default LLM provider                   | `copilot`              | `copilot`, `openai`, `anthropic`, `ollama` |
| 3     | Set up GitHub Copilot token guidance?  | `N`                    | `y`/`n`                                    |
| 4     | Include domain presets?                | `N`                    | `y`/`n`                                    |
| 5     | Include sample custom angle?           | `N`                    | `y`/`n`                                    |

### Post-Generation Provider Configuration

After scaffolding, configure your LLM provider in `.innovator.config.json`:

```bash
cd my-project

# For OpenAI — set the API key environment variable
export OPENAI_API_KEY="sk-..."

# For Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# For Ollama — ensure the server is running
ollama serve

# For GitHub Copilot — authenticate via GitHub CLI
gh auth login
```

Then edit `.innovator.config.json` to enable your provider:

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": { "enabled": true, "apiKeyEnv": "OPENAI_API_KEY" }
  }
}
```

### Custom Templates

The scaffolding tool generates a standard project structure. To customize the generated output:

1. **Custom angles** — select "Include sample custom angle?" during setup, then edit `angles/sample.angle.json` as a starting point
2. **Model preferences** — edit the `models` section in `.innovator.config.json` to specify models per pipeline stage (`investigation`, `generation`, `synthesis`)

## Interactive Prompts

When run without arguments, the CLI asks:

1. **Project name** — directory to create (default: `my-innovator-project`)
2. **Default LLM provider** — `copilot`, `openai`, `anthropic`, or `ollama`
3. **Set up GitHub Copilot token guidance?** — adds auth instructions
4. **Include domain presets?** — pre-configured innovation presets
5. **Include sample custom angle?** — example angle definition

## Generated Structure

```
my-project/
├── .innovator.config.json    # Provider and model configuration
├── angles/
│   └── sample.angle.json     # Example custom angle (if selected)
├── README.md                 # Quick-start guide
└── .gitignore                # Standard exclusions
```

### `.innovator.config.json`

Provider configuration with model preferences:

```json
{
  "defaultProvider": "copilot",
  "providers": {
    "copilot": { "enabled": true },
    "openai": { "enabled": false, "apiKeyEnv": "OPENAI_API_KEY" },
    "anthropic": { "enabled": false, "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "ollama": { "enabled": false, "baseUrl": "http://localhost:11434" }
  },
  "models": {
    "investigation": "gpt-4.1",
    "generation": "gpt-4.1",
    "synthesis": "gpt-4.1"
  }
}
```

### Custom Angle Template

The generated `angles/sample.angle.json` provides a starting point for defining custom innovation angles:

```json
{
  "id": "my-angle",
  "name": "My Custom Angle",
  "description": "Describe the creative framework",
  "promptTemplate": "Analyze {{subject}} using ... Context: {{investigation}}",
  "outputFormat": {
    "angleId": "string",
    "ideas": [
      {
        "title": "string",
        "description": "string",
        "potentialImpact": "string",
        "implementationHint": "string"
      }
    ]
  },
  "icon": "🔧",
  "tags": ["custom"]
}
```

## Next Steps After Scaffolding

```bash
cd my-project

# Install the CLI
npm install -g @innovator/cli

# Run an investigation
innovator investigate "your subject"

# Run the full pipeline
innovator auto "your subject"
```
