---
id: plugin-development
title: Plugin Development
sidebar_position: 17
---

# Plugin Development

This guide walks you through creating custom plugins for Innovator. Plugins let you extend the system with new innovation angles, export formats, and visualizations.

## Plugin Types

Innovator supports three plugin types:

| Type           | Interface          | What it adds                                      |
| -------------- | ------------------ | ------------------------------------------------- |
| **Angle**      | `AnglePlugin`      | A new innovation angle with a custom prompt       |
| **Exporter**   | `ExporterPlugin`   | A new export format (beyond Markdown/JSON/GitHub) |
| **Visualizer** | `VisualizerPlugin` | A custom visualization for idea data              |

All plugins share a common base interface:

```typescript
interface PluginBase {
  id: string; // Unique plugin identifier (e.g. "my-org.angle-pack")
  name: string; // Human-readable name
  version: string; // Semver version
  description?: string;
}
```

---

## Creating an Angle Plugin

Angle plugins add new innovation angles with custom prompt templates.

### 1. Define your angles

Each angle needs a prompt template with `{{subject}}` and `{{investigation}}` placeholders:

```typescript
import type { AnglePlugin, CustomAngle } from "@innovator/core/types";

const sustainabilityAngle: CustomAngle = {
  id: "sustainability-lens",
  name: "Sustainability Lens",
  description: "Evaluate ideas through environmental and social sustainability criteria",
  promptTemplate: `You are an innovation consultant specializing in sustainability.

Given the following subject: {{subject}}

And this investigation context:
{{investigation}}

Generate 3-5 innovative ideas that prioritize environmental sustainability,
social impact, and long-term viability. For each idea, provide:
- title: A concise title
- description: 2-3 sentence explanation
- sustainability_score: 1-10 rating
- feasibility: high, medium, or low

Respond with a JSON object containing an "ideas" array.`,
  icon: "🌱",
  author: "Your Name",
  version: "1.0.0",
  tags: ["sustainability", "esg", "green"],
};
```

### 2. Create the plugin object

```typescript
const myAnglePlugin: AnglePlugin = {
  id: "my-org.sustainability-angles",
  name: "Sustainability Angles",
  version: "1.0.0",
  description: "Innovation angles focused on sustainability",
  type: "angle",
  angles: [sustainabilityAngle],
};

export default myAnglePlugin;
```

### 3. Register the plugin

```typescript
import { registerPlugin } from "@innovator/core";

registerPlugin(myAnglePlugin);
```

### Angle ID requirements

Angle IDs must match `^[a-z0-9-]+$` (lowercase alphanumeric with hyphens) and be between 1 and 100 characters. The `CustomAngleSchema` validates this at runtime using Zod.

---

## Creating an Exporter Plugin

Exporter plugins add new output formats for innovation results.

### 1. Define export formats

```typescript
import type { ExporterPlugin, ExportData, ExportFormat } from "@innovator/core/types";

const csvFormat: ExportFormat = {
  id: "csv",
  name: "CSV Spreadsheet",
  extension: ".csv",
};
```

### 2. Implement the export function

```typescript
const csvExporter: ExporterPlugin = {
  id: "my-org.csv-exporter",
  name: "CSV Exporter",
  version: "1.0.0",
  type: "exporter",
  formats: [csvFormat],
  async export(data: ExportData, format: string): Promise<string> {
    if (format !== "csv") {
      throw new Error(`Unsupported format: ${format}`);
    }

    const header = "Angle,Title,Description,Feasibility,Impact\n";
    const rows = data.angleResults
      .flatMap((result) =>
        result.ideas.map(
          (idea) =>
            `"${result.angleId}","${idea.title}","${idea.description}","${idea.feasibility ?? ""}","${idea.impact ?? ""}"`
        )
      )
      .join("\n");

    return header + rows;
  },
};

export default csvExporter;
```

### ExportData structure

The `ExportData` object passed to your `export()` function contains:

| Field           | Type                       | Description                          |
| --------------- | -------------------------- | ------------------------------------ |
| `subject`       | `string`                   | The innovation subject               |
| `investigation` | `Investigation?`           | Investigation results (if available) |
| `angleResults`  | `AngleResult[]`            | Ideas from each angle                |
| `synthesis`     | `Synthesis?`               | Synthesis results (auto mode only)   |
| `metadata`      | `Record<string, unknown>?` | Additional context                   |

---

## Creating a Visualizer Plugin

Visualizer plugins render innovation data as HTML or SVG visualizations.

```typescript
import type { VisualizerPlugin, ExportData } from "@innovator/core/types";

const radarVisualizer: VisualizerPlugin = {
  id: "my-org.radar-chart",
  name: "Radar Chart",
  version: "1.0.0",
  description: "Radar chart visualization of angle results",
  type: "visualizer",
  async render(data: ExportData): Promise<string> {
    const angleLabels = data.angleResults.map((r) => r.angleId);
    const ideaCounts = data.angleResults.map((r) => r.ideas.length);

    return `
      <div class="radar-chart" data-labels='${JSON.stringify(angleLabels)}'
           data-values='${JSON.stringify(ideaCounts)}'>
        <h3>Ideas per Angle — ${data.subject}</h3>
        <!-- Your chart rendering logic here -->
      </div>
    `;
  },
};

export default radarVisualizer;
```

---

## Plugin Lifecycle

### Registration

Plugins are registered with `registerPlugin()`. The registry validates that:

1. The plugin has `id`, `name`, and `type` fields
2. No plugin with the same `id` is already registered

```typescript
import { registerPlugin, unregisterPlugin, listPlugins, getPlugin } from "@innovator/core";

// Register
registerPlugin(myPlugin);

// Query
const plugin = getPlugin("my-org.sustainability-angles");
const allPlugins = listPlugins();

// Remove
unregisterPlugin("my-org.sustainability-angles");
```

### Dynamic loading

Load plugins from local files or npm packages:

```typescript
import { loadPlugin } from "@innovator/core";

// From a local file
const plugin = await loadPlugin("./my-plugin.js");

// From an npm package
const plugin = await loadPlugin("innovator-plugin-csv");
```

`loadPlugin()` calls `import()` on the source, then automatically registers the plugin.

### Type-safe queries

Use `getPluginsByType()` for type-narrowed results:

```typescript
import { getPluginsByType } from "@innovator/core";

const anglePlugins = getPluginsByType("angle"); // AnglePlugin[]
const exporters = getPluginsByType("exporter"); // ExporterPlugin[]
const visualizers = getPluginsByType("visualizer"); // VisualizerPlugin[]
```

---

## Testing Plugins

Use `clearPlugins()` in your test setup to ensure a clean registry:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { registerPlugin, getPlugin, clearPlugins } from "@innovator/core";
import myPlugin from "./my-plugin.js";

describe("My Plugin", () => {
  beforeEach(() => {
    clearPlugins();
  });

  it("registers successfully", () => {
    registerPlugin(myPlugin);
    expect(getPlugin(myPlugin.id)).toBeDefined();
    expect(getPlugin(myPlugin.id)?.name).toBe(myPlugin.name);
  });

  it("rejects duplicate registration", () => {
    registerPlugin(myPlugin);
    expect(() => registerPlugin(myPlugin)).toThrow("already registered");
  });
});
```

For exporter plugins, test the export output:

```typescript
import type { ExportData } from "@innovator/core/types";

it("exports CSV correctly", async () => {
  const data: ExportData = {
    subject: "test",
    angleResults: [
      {
        angleId: "scamper",
        ideas: [{ title: "Idea 1", description: "Description 1" }],
      },
    ],
  };

  const result = await myExporter.export(data, "csv");
  expect(result).toContain("Idea 1");
  expect(result).toContain("scamper");
});
```

---

## Publishing Plugins

### As an npm package

1. Create a new package with a `package.json`:

```json
{
  "name": "innovator-plugin-my-angles",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@innovator/core": "*"
  }
}
```

2. Export your plugin as the default export:

```typescript
// src/index.ts
import type { AnglePlugin } from "@innovator/core/types";

const plugin: AnglePlugin = {
  // ... plugin definition
};

export default plugin;
```

3. Users install and load it:

```bash
npm install innovator-plugin-my-angles
```

```typescript
import { loadPlugin } from "@innovator/core";
await loadPlugin("innovator-plugin-my-angles");
```

### Naming convention

Use the prefix `innovator-plugin-` for npm packages so they are discoverable (e.g., `innovator-plugin-csv-exporter`, `innovator-plugin-sustainability-angles`).

---

## Best Practices

- **Validate inputs** — Use Zod schemas to validate data before processing
- **Handle errors gracefully** — Throw descriptive `Error` objects; the plugin registry will surface them
- **Keep plugins focused** — One plugin per concern (don't mix angle and exporter logic)
- **Version your plugins** — Follow semver so consumers know when breaking changes occur
- **Test thoroughly** — Use `clearPlugins()` in `beforeEach` to isolate tests
- **Document your angles** — Include clear descriptions and example outputs so users know what to expect
