import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // Allow `@/` imports in web app tests to resolve to apps/web/src
    alias: {
      "@": resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    globals: true,
    // Run tests in both packages and apps workspaces
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    // Use jsdom environment for web app tests (React components need DOM APIs)
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
      // Baseline thresholds — raise as coverage improves
      thresholds: {
        lines: 35,
        functions: 35,
        branches: 35,
      },
    },
  },
});
