import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // Allow `@/` imports in web app tests to resolve to apps/web/src
    alias: {
      "@": resolve(__dirname, "apps/web/src"),
      // Stub mermaid for tests — it's an optional runtime dependency
      mermaid: resolve(__dirname, "apps/web/src/__tests__/__mocks__/mermaid.ts"),
      // VS Code only provides this module inside the extension host.
      vscode: resolve(__dirname, "packages/vscode-extension/src/__tests__/__mocks__/vscode.ts"),
    },
  },
  test: {
    globals: true,
    // Enable file-level parallelism for faster CI — tests should use temp directories
    // for any file I/O to avoid shared-state conflicts
    fileParallelism: true,
    // Limit worker pool to avoid overwhelming CI runners
    pool: "forks",
    maxForks: 4,
    // Run tests in both packages and apps workspaces
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    // Use jsdom environment for web app tests (React components need DOM APIs)
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/node_modules/**",
      ],
      // Coverage thresholds — ratcheted to current levels to prevent regression
      thresholds: {
        lines: 72,
        functions: 73,
        branches: 58,
      },
    },
  },
});
