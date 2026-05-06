import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import {
  loadTheme,
  clearThemeCache,
  setTheme,
  themeToCssVars,
  getPromptPreamble,
} from "../theming/index.js";
import { DEFAULT_THEME } from "../theming/types.js";
import { existsSync, readFileSync } from "node:fs";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("theming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearThemeCache();
    mockExistsSync.mockReturnValue(false);
  });

  describe("loadTheme", () => {
    it("returns cached theme on 2nd call without re-reading file", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ brandName: "Custom" }));

      const first = loadTheme();
      const second = loadTheme();

      expect(first).toEqual(second);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it("clearThemeCache invalidates cache, forcing re-read", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ brandName: "Custom" }));

      loadTheme();
      clearThemeCache();

      mockReadFileSync.mockReturnValue(JSON.stringify({ brandName: "Updated" }));
      const reloaded = loadTheme();

      expect(reloaded.brandName).toBe("Updated");
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
    });

    it("searches basePath first, then cwd", () => {
      mockExistsSync.mockImplementation((p) => {
        return String(p).includes("/custom/path/");
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ brandName: "FromBasePath" }));

      const theme = loadTheme("/custom/path");
      expect(theme.brandName).toBe("FromBasePath");
    });

    it("falls back to DEFAULT_THEME on parse failure", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("invalid json{{{");

      const theme = loadTheme();
      expect(theme).toEqual(DEFAULT_THEME);
    });

    it("falls back to DEFAULT_THEME when no file found", () => {
      mockExistsSync.mockReturnValue(false);
      const theme = loadTheme();
      expect(theme).toEqual(DEFAULT_THEME);
    });

    it("merges partial theme with DEFAULT_THEME", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ brandName: "MyBrand" }));

      const theme = loadTheme();
      expect(theme.brandName).toBe("MyBrand");
      expect(theme.colors).toEqual(DEFAULT_THEME.colors);
      expect(theme.fonts).toEqual(DEFAULT_THEME.fonts);
    });
  });

  describe("themeToCssVars", () => {
    it("converts camelCase to kebab-case (primaryColor → --innovator-primary-color)", () => {
      const css = themeToCssVars({
        colors: { primary: "#ff0000" },
      });
      expect(css).toContain("--innovator-primary: #ff0000");
    });

    it("converts primaryForeground correctly", () => {
      const css = themeToCssVars({
        colors: { primaryForeground: "#ffffff" },
      });
      expect(css).toContain("--innovator-primary-foreground: #ffffff");
    });

    it("includes font variables", () => {
      const css = themeToCssVars({
        fonts: { heading: "Arial", body: "Georgia", mono: "Courier" },
      });
      expect(css).toContain("--innovator-font-heading: Arial");
      expect(css).toContain("--innovator-font-body: Georgia");
      expect(css).toContain("--innovator-font-mono: Courier");
    });

    it("includes border radius variables", () => {
      const css = themeToCssVars({
        borderRadius: { sm: "4px", md: "8px", lg: "12px" },
      });
      expect(css).toContain("--innovator-radius-sm: 4px");
      expect(css).toContain("--innovator-radius-md: 8px");
      expect(css).toContain("--innovator-radius-lg: 12px");
    });

    it("wraps in :root selector", () => {
      const css = themeToCssVars({ colors: { primary: "#000" } });
      expect(css).toMatch(/^:root \{/);
      expect(css).toMatch(/\}$/);
    });

    it("skips undefined/null color values", () => {
      const css = themeToCssVars({
        colors: { primary: "#000", secondary: undefined },
      });
      expect(css).toContain("primary");
      expect(css).not.toContain("secondary");
    });
  });

  describe("setTheme", () => {
    it("merges partial overrides with DEFAULT_THEME", () => {
      setTheme({ brandName: "Custom" });
      const theme = loadTheme();
      expect(theme.brandName).toBe("Custom");
      expect(theme.colors).toEqual(DEFAULT_THEME.colors);
    });

    it("overrides cached theme", () => {
      setTheme({ brandName: "First" });
      setTheme({ brandName: "Second" });
      const theme = loadTheme();
      expect(theme.brandName).toBe("Second");
    });
  });

  describe("getPromptPreamble", () => {
    it("returns empty string when not set", () => {
      const preamble = getPromptPreamble();
      expect(preamble).toBe("");
    });

    it("returns string when configured", () => {
      setTheme({ promptPreamble: "You are an enterprise AI assistant." });
      const preamble = getPromptPreamble();
      expect(preamble).toBe("You are an enterprise AI assistant.");
    });
  });
});
