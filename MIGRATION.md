# Migration Guide

This document covers upgrade paths and breaking changes for Innovator.

## Version Compatibility

| Innovator Version | Node.js | npm | Notes                             |
| ----------------- | ------- | --- | --------------------------------- |
| 0.1.0             | 20+     | 10+ | Initial release, stateless design |
| 0.2.0 (current)   | 20+     | 10+ | Extended engine, multi-provider   |

## Upgrading from v0.1.0 to v0.2.0

### What Changed

v0.2.0 is a feature release with no breaking API changes. Existing code using `investigate()`, `generateForAngle()`, and `runAutoPipeline()` continues to work without modification.

**Key additions:**

- Alternative LLM providers (OpenAI, Anthropic, Ollama) — configure via environment variables or `~/.innovator/config.json`
- `runAutoPipeline()` now accepts an optional `modelRouting` parameter for per-stage model overrides
- 50+ new modules (collaboration, scoring, knowledge graph, etc.) — all additive, no existing exports removed

### Upgrade Steps

1. **Update your branch**:

   ```bash
   git pull origin main
   ```

2. **Clean install dependencies**:

   ```bash
   npm run clean:all
   npm install
   ```

3. **Rebuild all packages**:

   ```bash
   npm run build
   ```

4. **Run tests** to verify nothing is broken:

   ```bash
   npm run check
   ```

5. **Verify your environment**:

   ```bash
   npm run doctor
   ```

### Upgrading `create-innovator` Projects

If you scaffolded a project with `npx create-innovator`:

```bash
# Update the core dependency
npm install @innovator/core@latest

# Rebuild
npm run build
```

### New Environment Variables (Optional)

v0.2.0 introduces several optional environment variables. None are required — existing `.env.local` files work without changes. See [Configuration](/docs/configuration) for the full list.

| Variable            | Purpose                       |
| ------------------- | ----------------------------- |
| `OPENAI_API_KEY`    | Direct OpenAI provider        |
| `ANTHROPIC_API_KEY` | Direct Anthropic provider     |
| `OLLAMA_BASE_URL`   | Local Ollama instance         |
| `MCP_PORT`          | MCP server SSE transport port |

## Breaking Changes

### v0.1.0 → v0.2.0

No breaking changes. All v0.1.0 APIs are preserved.

**Key conventions established in v0.1.0 (still apply):**

- `@innovator/core` uses subpath exports: `@innovator/core` (server) and `@innovator/core/types` (client)
- All LLM output is validated with Zod schemas
- Plugin IDs must match `^[a-z0-9-]+$`
- Custom angle IDs follow the same format
- File-based workspace persistence in `~/.innovator/workspaces/`

## Roadmap

Future versions may include:

- **Workspace storage migration** — JSON to SQLite for better concurrent access and indexed queries. A CLI migration command will be provided when this ships.
- **Environment variable changes** — No variables have been renamed or removed. If future versions deprecate variables, they will be listed here with replacements.

## Troubleshooting Upgrades

### Build failures after upgrade

```bash
# Clean everything and start fresh
npm run clean:all
rm -rf node_modules
npm install
npm run build
```

### Type errors after upgrade

If you see TypeScript errors after upgrading `@innovator/core`:

1. Check if any exported types were renamed in the [CHANGELOG](CHANGELOG.md)
2. Rebuild the core package: `npm run build --workspace=packages/core`
3. Restart your IDE's TypeScript server

### Plugin compatibility

Plugins built for one major version may not work with the next. Check the plugin's `peerDependencies` for the supported `@innovator/core` version range. If a plugin breaks after upgrade, contact the plugin author or pin to a compatible version.
