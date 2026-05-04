import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "apps/web/src"),
    },
  },
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
        lines: 35,
        functions: 35,
        branches: 35,
      },
    },
  },
});
