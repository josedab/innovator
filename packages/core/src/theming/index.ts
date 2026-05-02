import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ThemeConfig } from "./types.js";
import { ThemeConfigSchema, DEFAULT_THEME } from "./types.js";

let cachedTheme: ThemeConfig | null = null;

/**
 * Load theme configuration from .innovator.theme.json.
 * Searches in the current working directory, then falls back to defaults.
 */
export function loadTheme(basePath?: string): ThemeConfig {
  if (cachedTheme) return cachedTheme;

  const searchPaths = [
    basePath ? join(basePath, ".innovator.theme.json") : null,
    join(process.cwd(), ".innovator.theme.json"),
  ].filter((p): p is string => p !== null);

  for (const path of searchPaths) {
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        const parsed = ThemeConfigSchema.parse(raw);
        cachedTheme = { ...DEFAULT_THEME, ...parsed };
        return cachedTheme;
      } catch {
        // Fall through to default
      }
    }
  }

  cachedTheme = DEFAULT_THEME;
  return cachedTheme;
}

/** Clear cached theme (useful for testing or hot-reload). */
export function clearThemeCache(): void {
  cachedTheme = null;
}

/** Set theme programmatically without a file. */
export function setTheme(theme: ThemeConfig): void {
  cachedTheme = { ...DEFAULT_THEME, ...theme };
}

/**
 * Generate CSS custom properties from a theme config.
 * Returns a string suitable for injection into a <style> block.
 */
export function themeToCssVars(theme: ThemeConfig): string {
  const vars: string[] = [];

  if (theme.colors) {
    for (const [key, value] of Object.entries(theme.colors)) {
      if (value) {
        const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
        vars.push(`  --innovator-${cssKey}: ${value};`);
      }
    }
  }

  if (theme.fonts) {
    if (theme.fonts.heading) vars.push(`  --innovator-font-heading: ${theme.fonts.heading};`);
    if (theme.fonts.body) vars.push(`  --innovator-font-body: ${theme.fonts.body};`);
    if (theme.fonts.mono) vars.push(`  --innovator-font-mono: ${theme.fonts.mono};`);
  }

  if (theme.borderRadius) {
    if (theme.borderRadius.sm) vars.push(`  --innovator-radius-sm: ${theme.borderRadius.sm};`);
    if (theme.borderRadius.md) vars.push(`  --innovator-radius-md: ${theme.borderRadius.md};`);
    if (theme.borderRadius.lg) vars.push(`  --innovator-radius-lg: ${theme.borderRadius.lg};`);
  }

  return `:root {\n${vars.join("\n")}\n}`;
}

/**
 * Get the prompt preamble from the current theme.
 * Returns empty string if no preamble is configured.
 */
export function getPromptPreamble(): string {
  const theme = loadTheme();
  return theme.promptPreamble ?? "";
}
