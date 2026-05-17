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

| Input           | Description                                                    | Default                             |
| --------------- | -------------------------------------------------------------- | ----------------------------------- |
| `subject`       | Subject to investigate                                         | Issue title (if triggered by issue) |
| `angles`        | Comma-separated angle IDs                                      | All 8 angles                        |
| `depth`         | Investigation depth: shallow/standard/deep                     | `standard`                          |
| `label`         | Issue label trigger                                            | `needs-innovation`                  |
| `model`         | LLM model to use                                               | Default provider model              |
| `post-comment`  | Post results as issue comment                                  | `true`                              |
| `config-path`   | Path to `.innovator/config.yaml` for project-specific defaults | `.innovator/config.yaml`            |
| `save-session`  | Save pipeline results to `.innovator/sessions/`                | `false`                             |
| `novelty-check` | Score ideas for novelty against prior art                      | `false`                             |

## Outputs

| Output     | Description                        |
| ---------- | ---------------------------------- |
| `markdown` | Full results as formatted Markdown |

## Examples

See the [examples/](examples/) directory for complete workflow files.

### Specific angles only

Run only a subset of innovation angles:

```yaml
- uses: josedab/innovator/action@main
  with:
    subject: "developer onboarding"
    angles: "scamper,first-principles,constraints"
    post-comment: "true"
```

### Deep investigation

Use `depth: "deep"` for more thorough analysis (takes longer but produces richer output):

```yaml
- uses: josedab/innovator/action@main
  with:
    subject: "CI/CD pipeline optimization"
    depth: "deep"
    post-comment: "true"
```

### Shallow investigation for quick triage

Use `depth: "shallow"` for a fast, lightweight analysis:

```yaml
- uses: josedab/innovator/action@main
  with:
    subject: ${{ github.event.issue.title }}
    depth: "shallow"
    angles: "scamper"
    post-comment: "true"
```

### Innovate from discussion or PR context

Extract context from GitHub discussions or PR descriptions and pass as the subject:

```yaml
on:
  discussion:
    types: [created]

jobs:
  innovate:
    runs-on: ubuntu-latest
    permissions:
      discussions: read
      issues: write
    steps:
      - uses: josedab/innovator/action@main
        with:
          subject: ${{ github.event.discussion.title }} — ${{ github.event.discussion.body }}
          depth: "standard"
          angles: "first-principles,cross-domain,trend-collision"
```

### Project-specific configuration

Use a `.innovator/config.yaml` file in your repository to set default angles, model, and other settings. The action reads this file automatically (or specify a custom path with `config-path`). Explicit inputs override config file defaults.

```yaml
- uses: josedab/innovator/action@main
  with:
    subject: "API gateway architecture"
    config-path: ".innovator/config.yaml"
    save-session: "true"
    novelty-check: "true"
```

```yaml
on:
  pull_request:
    types: [opened]

jobs:
  innovate:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: josedab/innovator/action@main
        with:
          subject: ${{ github.event.pull_request.title }}
          depth: "shallow"
          angles: "perspectives,what-if"
          post-comment: "true"
```

### Save output to a file

Use the `markdown` output to save results as an artifact:

```yaml
- uses: josedab/innovator/action@main
  id: innovate
  with:
    subject: "remote work tools"

- name: Save results
  run: echo "${{ steps.innovate.outputs.markdown }}" > innovation-report.md

- uses: actions/upload-artifact@v4
  with:
    name: innovation-report
    path: innovation-report.md
```

### Use Markdown output in downstream steps

Use the `markdown` output to feed results into other workflow steps:

```yaml
- uses: josedab/innovator/action@main
  id: innovate
  with:
    subject: "developer onboarding"

- name: Process results
  run: |
    echo '${{ steps.innovate.outputs.markdown }}'
```

## Troubleshooting

### "Authentication failed" in the action

The action requires GitHub Copilot access. Ensure:

- The repository has access to GitHub Copilot (org-level setting)
- The `GITHUB_TOKEN` has sufficient permissions — add `permissions: issues: write` for comment posting

### Action times out

Deep investigations with all 8 angles can take 3–5 minutes. If the action times out:

- Use `depth: "shallow"` for faster results
- Limit angles with the `angles` input (e.g. `"scamper,first-principles"`)
- Increase the job timeout: `timeout-minutes: 10`

### Empty or partial results

- Check that the `subject` input is descriptive enough (avoid single words)
- Try a different model via the `model` input
- Review the action logs for LLM response errors
