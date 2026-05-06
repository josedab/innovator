# ADR-0012: Plugin System for Extensibility

## Status

Accepted

## Context

Innovator ships with 8 built-in innovation angles, Markdown/JSON export, and a default visualization. Users and organizations have requested the ability to:

- Add custom innovation angles with domain-specific prompts (e.g., "Regulatory Compliance Lens" for healthcare).
- Add custom export formats (e.g., CSV, Notion, internal tools).
- Add custom visualizations for specific use cases.

Building every possible angle, exporter, and visualizer into core would bloat the package and slow iteration. The team needed an extensibility mechanism that allows third-party contributions without modifying core.

## Decision

We implement a **plugin registry** in `packages/core/src/plugins/index.ts` supporting three plugin types:

```typescript
type InnovatorPlugin = AnglePlugin | ExporterPlugin | VisualizerPlugin;

interface AnglePlugin {
  type: "angle";
  id: string;
  name: string;
  generatePrompt(investigation: Investigation): string;
}

interface ExporterPlugin {
  type: "exporter";
  id: string;
  name: string;
  export(session: SessionRecord): Promise<ExportResult>;
}

interface VisualizerPlugin {
  type: "visualizer";
  id: string;
  name: string;
  render(data: IdeaGraph): VisualizationOutput;
}
```

### Registry API

- `registerPlugin(plugin)` — Register a plugin instance. Validates required fields and rejects duplicates.
- `unregisterPlugin(id)` — Remove a plugin.
- `getPlugin(id)` / `listPlugins()` / `getPluginsByType(type)` — Discovery and lookup.
- `loadPlugin(source)` — Dynamic import from a local file path or npm package name.
- `clearPlugins()` — Reset for testing.

### Loading Mechanism

Plugins are loaded via dynamic `import()`, supporting:

- **Local files**: `loadPlugin("./my-angle-plugin.js")`
- **npm packages**: `loadPlugin("innovator-plugin-healthcare")`

The loaded module must export a default object (or a top-level export) conforming to the `InnovatorPlugin` interface.

### Complementary: Custom Angles

A separate **custom angles** system (`innovation/custom-angles.ts`) provides a lighter-weight alternative for users who just want to add new angles without building a full plugin:

- `addCustomAngle()` / `removeCustomAngle()` — manage user-defined angles
- `exportAnglePack()` / `importAnglePack()` — share angle collections as JSON files

### Complementary: Presets

**Domain presets** (`presets/index.ts`) provide curated angle sets for common domains (e.g., "Product Strategy", "Engineering Excellence"), giving users a middle ground between raw angles and full plugins.

## Consequences

**Positive:**

- **Open for extension, closed for modification** — New capabilities are added by registering plugins, not by modifying core source code.
- **Ecosystem potential** — The plugin interface is simple enough for community contributions. An `innovator-plugin-*` npm naming convention enables discoverability.
- **Multiple extension paths** — Users can choose the right level of customization: presets (zero code) → custom angles (JSON config) → plugins (code).
- **Runtime extensibility** — Plugins can be loaded dynamically, enabling per-deployment customization without rebuilding.

**Negative:**

- **No sandboxing** — Plugins run with full Node.js privileges. A malicious plugin could access the filesystem, network, or environment variables. The `loadPlugin()` function performs no security validation beyond interface conformance.
- **In-memory registry** — Plugins are stored in a module-level `Map` and must be re-registered on every process restart. There's no persistent plugin configuration.
- **Limited plugin lifecycle** — No hooks for initialization, shutdown, or configuration. Plugins are passive objects that implement methods, not active agents with lifecycle management.
- **Discovery is manual** — There's no built-in plugin marketplace or registry. Users must find plugins via npm search or documentation.
