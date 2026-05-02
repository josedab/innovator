# Innovator GitHub Action

Run AI-powered innovation analysis directly in your GitHub workflows.

## Usage

### On issue label

```yaml
on:
  issues:
    types: [labeled]

jobs:
  innovate:
    if: github.event.label.name == 'needs-innovation'
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: josedab/innovator/action@main
        with:
          label: "needs-innovation"
          post-comment: "true"
```

### Manual trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      subject:
        description: "Subject to investigate"
        required: true

jobs:
  innovate:
    runs-on: ubuntu-latest
    steps:
      - uses: josedab/innovator/action@main
        with:
          subject: ${{ github.event.inputs.subject }}
          depth: "deep"
```

## Inputs

| Input          | Description                                | Default                             |
| -------------- | ------------------------------------------ | ----------------------------------- |
| `subject`      | Subject to investigate                     | Issue title (if triggered by issue) |
| `angles`       | Comma-separated angle IDs                  | All 8 angles                        |
| `depth`        | Investigation depth: shallow/standard/deep | `standard`                          |
| `label`        | Issue label trigger                        | `needs-innovation`                  |
| `model`        | LLM model to use                           | Default provider model              |
| `post-comment` | Post results as issue comment              | `true`                              |

## Outputs

| Output     | Description                        |
| ---------- | ---------------------------------- |
| `markdown` | Full results as formatted Markdown |

## Examples

See the [examples/](examples/) directory for complete workflow files.
