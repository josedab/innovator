# Migration Guide

This document covers upgrade paths, breaking changes, and data migration steps for Innovator.

## Version Compatibility

| Innovator Version | Node.js | npm | Notes                                    |
| ----------------- | ------- | --- | ---------------------------------------- |
| 1.x (current)     | 20+     | 10+ | Initial release, stateless design        |
| 2.x (planned)     | 20+     | 10+ | Persistence layer, SQLite for workspaces |

## Upgrading

### General Upgrade Steps

1. **Check the [CHANGELOG](CHANGELOG.md)** for breaking changes in the target version
2. **Update your branch**:

   ```bash
   git pull origin main
   ```

3. **Clean install dependencies**:

   ```bash
   npm run clean:all
   npm install
   ```

4. **Rebuild all packages**:

   ```bash
   npm run build
   ```

5. **Run tests** to verify nothing is broken:

   ```bash
   npm run check
   ```

6. **Verify your environment**:

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

## Breaking Changes

### Unreleased → v1.0.0

The initial release. No breaking changes from prior versions since this is the first public release.

**Key conventions established in v1:**

- `@innovator/core` uses subpath exports: `@innovator/core` (server) and `@innovator/core/types` (client)
- All LLM output is validated with Zod schemas
- Plugin IDs must match `^[a-z0-9-]+$`
- Custom angle IDs follow the same format
- File-based workspace persistence in `~/.innovator/workspaces/`

## Planned Migrations

### Workspace Storage: JSON → SQLite (v2)

The workspace module (`packages/core/src/workspaces/`) currently uses file-based JSON persistence in `~/.innovator/workspaces/`. A migration to SQLite is planned for v2 to support:

- Better concurrent access
- Indexed queries across workspaces
- Atomic transactions for multi-step operations

**What you need to do:** Nothing yet. When the migration ships, a CLI migration command will be provided to convert existing JSON workspace files to the SQLite database automatically:

```bash
# Planned for v2
npx innovator migrate workspaces
```

**Data location:** `~/.innovator/workspaces/*.json` → `~/.innovator/innovator.db`

### Environment Variable Changes

No environment variables have been renamed or removed. If future versions deprecate variables, they will be listed here with the replacement.

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
