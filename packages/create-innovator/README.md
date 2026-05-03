# create-innovator

Scaffold a new Innovator project with config, custom angles, and presets.

## Usage

```bash
# Interactive mode — prompts for all options
npx create-innovator

# Non-interactive — provide project name directly
npx create-innovator my-project
```

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
