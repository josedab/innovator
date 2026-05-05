import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverFiles,
  analyzeFile,
  detectPatterns,
  analyzeDependencies,
  discoverLayers,
  analyzeCodebaseSync,
  analysisToMarkdown,
} from "../codebase-analysis/index.js";

const testDir = join(tmpdir(), `innovator-codebase-test-${Date.now()}`);

describe("codebase-analysis", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, "src", "utils"), { recursive: true });
    mkdirSync(join(testDir, "src", "services"), { recursive: true });
    mkdirSync(join(testDir, "__tests__"), { recursive: true });

    writeFileSync(
      join(testDir, "src", "index.ts"),
      `import express from "express";\nimport { helper } from "./utils/helper.js";\n\nexport function main() {\n  // TODO: implement\n  console.log("hello");\n  console.log("world");\n  console.log("test");\n  console.log("debug");\n  console.log("info");\n  console.log("extra");\n  return true;\n}\n`
    );

    writeFileSync(
      join(testDir, "src", "utils", "helper.ts"),
      `export function helper(): string {\n  return "help";\n}\n`
    );

    writeFileSync(
      join(testDir, "src", "services", "api.ts"),
      `import { helper } from "../utils/helper.js";\n\nexport async function fetchData(): any {\n  const result: any = await fetch("/api");\n  const data: any = result.json();\n  const extra: any = null;\n  return data;\n}\n`
    );

    writeFileSync(
      join(testDir, "__tests__", "index.test.ts"),
      `import { main } from "../src/index.js";\n\ntest("main works", () => {\n  expect(main()).toBe(true);\n});\n`
    );

    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        dependencies: { express: "^4.18.0", zod: "^3.23.0" },
        devDependencies: { typescript: "^5.6.0", vitest: "^2.0.0" },
      })
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("discoverFiles", () => {
    it("finds source files recursively", () => {
      const files = discoverFiles(testDir);
      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f) => f.endsWith("index.ts"))).toBe(true);
      expect(files.some((f) => f.endsWith("helper.ts"))).toBe(true);
    });

    it("excludes node_modules by default", () => {
      mkdirSync(join(testDir, "node_modules", "pkg"), { recursive: true });
      writeFileSync(join(testDir, "node_modules", "pkg", "index.js"), "module.exports = {};");
      const files = discoverFiles(testDir);
      expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
    });

    it("respects maxFiles limit", () => {
      const files = discoverFiles(testDir, undefined, 2);
      expect(files.length).toBeLessThanOrEqual(2);
    });
  });

  describe("analyzeFile", () => {
    it("returns complexity metrics for a valid file", () => {
      const result = analyzeFile(join(testDir, "src", "index.ts"));
      expect(result).not.toBeNull();
      expect(result!.lines).toBeGreaterThan(0);
      expect(result!.functions).toBeGreaterThanOrEqual(1);
      expect(result!.complexityScore).toBeGreaterThanOrEqual(0);
    });

    it("returns null for non-existent file", () => {
      const result = analyzeFile(join(testDir, "nonexistent.ts"));
      expect(result).toBeNull();
    });
  });

  describe("detectPatterns", () => {
    it("detects tech debt markers", () => {
      const files = discoverFiles(testDir);
      const patterns = detectPatterns(files, testDir);
      const techDebt = patterns.find((p) => p.type === "tech-debt");
      expect(techDebt).toBeDefined();
    });

    it("detects excessive any usage", () => {
      const files = discoverFiles(testDir);
      const patterns = detectPatterns(files, testDir);
      // The test fixture has 4 `: any` occurrences in api.ts which exceeds the 3 threshold
      const anyPattern = patterns.find((p) => p.name.toLowerCase().includes("any"));
      expect(anyPattern).toBeDefined();
    });
  });

  describe("analyzeDependencies", () => {
    it("reads dependencies from package.json", () => {
      const deps = analyzeDependencies(testDir);
      expect(deps.length).toBeGreaterThanOrEqual(2);
      expect(deps.find((d) => d.name === "express")).toBeDefined();
      expect(deps.find((d) => d.name === "typescript")).toBeDefined();
    });

    it("categorizes dependencies correctly", () => {
      const deps = analyzeDependencies(testDir);
      const ts = deps.find((d) => d.name === "typescript");
      expect(ts?.category).toBe("type-system");
      expect(ts?.type).toBe("development");
    });
  });

  describe("discoverLayers", () => {
    it("identifies top-level directories as layers", () => {
      const files = discoverFiles(testDir);
      const layers = discoverLayers(testDir, files);
      expect(layers.some((l) => l.name === "src")).toBe(true);
      expect(layers.some((l) => l.name === "__tests__")).toBe(true);
    });
  });

  describe("analyzeCodebaseSync", () => {
    it("performs full synchronous analysis", () => {
      const analysis = analyzeCodebaseSync(testDir);
      expect(analysis.fileCount).toBeGreaterThan(0);
      expect(analysis.totalLines).toBeGreaterThan(0);
      expect(analysis.languages).toContain("TypeScript");
      expect(analysis.patterns.length).toBeGreaterThan(0);
      expect(analysis.dependencies.length).toBeGreaterThan(0);
      expect(analysis.layers.length).toBeGreaterThan(0);
    });

    it("throws for non-existent path", () => {
      expect(() => analyzeCodebaseSync("/nonexistent/path")).toThrow("Root path does not exist");
    });
  });

  describe("analysisToMarkdown", () => {
    it("generates markdown report", () => {
      const analysis = analyzeCodebaseSync(testDir);
      const md = analysisToMarkdown(analysis);
      expect(md).toContain("# Codebase Innovation Analysis");
      expect(md).toContain("TypeScript");
    });
  });
});
