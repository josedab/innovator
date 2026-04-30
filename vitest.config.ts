import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
      },
    },
  },
});
