import { describe, it, expect } from "vitest";

import {
  generateScaffold,
  scaffoldToFileMap,
  scaffoldToMarkdown,
} from "../scaffolding/index.js";
import type { ScaffoldOptions, IdeaScaffold } from "../scaffolding/index.js";
import type { InnovationIdea } from "../types.js";

const mockIdea: InnovationIdea = {
  title: "AI-Powered Dashboard",
  description: "Real-time analytics dashboard with AI insights",
  potentialImpact: "Saves teams 10 hours per week on reporting",
  implementationHint: "Use React + D3.js + OpenAI API",
};

describe("scaffolding", () => {
  // ---- generateScaffold ----

  describe("generateScaffold", () => {
    it("generates scaffold with default options (TypeScript/MIT)", () => {
      const scaffold = generateScaffold({ idea: mockIdea });

      expect(scaffold.repoName).toBe("ai-powered-dashboard");
      expect(scaffold.idea.title).toBe("AI-Powered Dashboard");
      expect(scaffold.techStack).toContain("TypeScript 5+");
      expect(scaffold.generatedAt).toBeTruthy();
      expect(scaffold.files.length).toBeGreaterThan(0);
      expect(scaffold.issues.length).toBeGreaterThan(0);
      expect(scaffold.architectureDiagram).toContain("mermaid");
    });

    it("generates TypeScript scaffold with correct files", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "typescript" });
      const paths = scaffold.files.map((f) => f.path);

      expect(paths).toContain("README.md");
      expect(paths).toContain("LICENSE");
      expect(paths).toContain(".gitignore");
      expect(paths).toContain(".github/workflows/ci.yml");
      expect(paths).toContain("src/index.ts");
      expect(paths).toContain("package.json");
      expect(paths).toContain("tsconfig.json");
    });

    it("generates Python scaffold", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "python" });
      const paths = scaffold.files.map((f) => f.path);

      expect(scaffold.techStack).toContain("Python 3.11+");
      expect(paths).toContain("src/main.py");
      expect(paths).toContain("requirements.txt");
      expect(paths).toContain("tests/test_main.py");

      const ci = scaffold.files.find((f) => f.path === ".github/workflows/ci.yml")!;
      expect(ci.content).toContain("pytest");
    });

    it("generates Go scaffold", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "go" });
      expect(scaffold.techStack).toContain("Go 1.21+");
      expect(scaffold.dependencies.some((d) => d.name.includes("gin"))).toBe(true);
    });

    it("generates Rust scaffold", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "rust" });
      expect(scaffold.techStack).toContain("Rust 1.75+");

      const gitignore = scaffold.files.find((f) => f.path === ".gitignore")!;
      expect(gitignore.content).toContain("target/");
    });

    it("defaults to TypeScript when stack not provided", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      expect(scaffold.techStack).toContain("TypeScript 5+");
    });
  });

  // ---- License generation ----

  describe("license", () => {
    it("generates MIT license with correct content", () => {
      const scaffold = generateScaffold({ idea: mockIdea, license: "MIT" });
      const license = scaffold.files.find((f) => f.path === "LICENSE")!;
      expect(license.content).toContain("MIT License");
      expect(license.content).toContain("Permission is hereby granted");
      expect(license.content).toContain(String(new Date().getFullYear()));
    });

    it("generates Apache-2.0 license", () => {
      const scaffold = generateScaffold({ idea: mockIdea, license: "Apache-2.0" });
      const license = scaffold.files.find((f) => f.path === "LICENSE")!;
      expect(license.content).toContain("Apache-2.0");
    });

    it("generates GPL-3.0 license", () => {
      const scaffold = generateScaffold({ idea: mockIdea, license: "GPL-3.0" });
      const license = scaffold.files.find((f) => f.path === "LICENSE")!;
      expect(license.content).toContain("GPL-3.0");
    });

    it("generates BSD-3-Clause license", () => {
      const scaffold = generateScaffold({ idea: mockIdea, license: "BSD-3-Clause" });
      const license = scaffold.files.find((f) => f.path === "LICENSE")!;
      expect(license.content).toContain("BSD-3-Clause");
    });

    it("generates ISC license", () => {
      const scaffold = generateScaffold({ idea: mockIdea, license: "ISC" });
      const license = scaffold.files.find((f) => f.path === "LICENSE")!;
      expect(license.content).toContain("ISC");
    });
  });

  // ---- Repo name / slugification ----

  describe("repo name", () => {
    it("slugifies idea title", () => {
      const scaffold = generateScaffold({ idea: { ...mockIdea, title: "My Cool Project!!" } });
      expect(scaffold.repoName).toBe("my-cool-project");
    });

    it("truncates slug at 50 chars max", () => {
      const longTitle = "A".repeat(100) + " " + "B".repeat(100);
      const scaffold = generateScaffold({ idea: { ...mockIdea, title: longTitle } });
      expect(scaffold.repoName.length).toBeLessThanOrEqual(50);
    });

    it("uses projectName override when provided", () => {
      const scaffold = generateScaffold({ idea: mockIdea, projectName: "custom-name" });
      expect(scaffold.repoName).toBe("custom-name");
    });
  });

  // ---- scaffoldToFileMap ----

  describe("scaffoldToFileMap", () => {
    it("converts files to flat map", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const map = scaffoldToFileMap(scaffold);

      expect(typeof map).toBe("object");
      expect(map["README.md"]).toBeTruthy();
      expect(map["LICENSE"]).toBeTruthy();
      expect(Object.keys(map).length).toBe(scaffold.files.length);
    });
  });

  // ---- scaffoldToMarkdown ----

  describe("scaffoldToMarkdown", () => {
    it("includes all sections in formatted output", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const md = scaffoldToMarkdown(scaffold);

      expect(md).toContain(`# ${scaffold.repoName}`);
      expect(md).toContain("## Tech Stack");
      expect(md).toContain(`## Files (${scaffold.files.length})`);
      expect(md).toContain("## Architecture");
      expect(md).toContain("## Dependencies");
      expect(md).toContain("## Issue Breakdown");
    });

    it("lists each file with path and description", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const md = scaffoldToMarkdown(scaffold);
      expect(md).toContain("`README.md`");
      expect(md).toContain("`LICENSE`");
    });

    it("lists dependencies", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const md = scaffoldToMarkdown(scaffold);
      expect(md).toContain("**express**");
      expect(md).toContain("**zod**");
    });
  });

  // ---- GitHub templates ----

  describe("GitHub templates", () => {
    it("includes issue templates", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const paths = scaffold.files.map((f) => f.path);
      expect(paths).toContain(".github/ISSUE_TEMPLATE/feature.md");
      expect(paths).toContain(".github/ISSUE_TEMPLATE/bug.md");
      expect(paths).toContain(".github/pull_request_template.md");
    });
  });

  // ---- CI workflow per stack ----

  describe("CI workflow", () => {
    it("generates Node.js CI for TypeScript", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "typescript" });
      const ci = scaffold.files.find((f) => f.path === ".github/workflows/ci.yml")!;
      expect(ci.content).toContain("npm ci");
      expect(ci.content).toContain("npm test");
    });

    it("generates Python CI for Python", () => {
      const scaffold = generateScaffold({ idea: mockIdea, stack: "python" });
      const ci = scaffold.files.find((f) => f.path === ".github/workflows/ci.yml")!;
      expect(ci.content).toContain("pip install");
      expect(ci.content).toContain("pytest");
    });
  });

  // ---- Issue breakdown ----

  describe("issue breakdown", () => {
    it("generates standard issue set", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      expect(scaffold.issues.length).toBeGreaterThanOrEqual(5);

      const titles = scaffold.issues.map((i) => i.title);
      expect(titles.some((t) => t.includes("setup"))).toBe(true);
      expect(titles.some((t) => t.includes("Core:"))).toBe(true);
      expect(titles.some((t) => t.includes("API"))).toBe(true);
    });

    it("includes idea title in core issue", () => {
      const scaffold = generateScaffold({ idea: mockIdea });
      const coreIssue = scaffold.issues.find((i) => i.title.includes("Core:"))!;
      expect(coreIssue.title).toContain("AI-Powered Dashboard");
    });
  });
});
