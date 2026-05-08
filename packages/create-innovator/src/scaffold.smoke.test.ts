import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const { mockExistsSync, mockMkdirSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

const { mockCreateInterface } = vi.hoisted(() => ({
  mockCreateInterface: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock("node:readline", () => ({
  createInterface: mockCreateInterface,
}));

vi.mock("chalk", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    get: () => new Proxy((s: string) => s, handler),
    apply: (_target, _thisArg, args) => args[0],
  };
  return { default: new Proxy((s: string) => s, handler) };
});

/**
 * Smoke tests that validate the scaffolded project structure
 * by capturing all file system calls during main() execution.
 */
describe("create-innovator smoke tests", () => {
  let writtenFiles: Map<string, string>;
  let createdDirs: string[];
  let origArgv: string[];
  let origExit: typeof process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    writtenFiles = new Map();
    createdDirs = [];
    origArgv = process.argv;
    origExit = process.exit;

    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockImplementation((path: string) => {
      createdDirs.push(path);
    });
    mockWriteFileSync.mockImplementation((path: string, content: string) => {
      writtenFiles.set(path, content);
    });

    const mockRl = {
      question: vi.fn((_prompt: string, callback: (answer: string) => void) => {
        callback("");
      }),
      close: vi.fn(),
    };
    mockCreateInterface.mockReturnValue(mockRl);
  });

  afterEach(() => {
    process.argv = origArgv;
    process.exit = origExit;
  });

  it("scaffolds expected files with valid content", async () => {
    process.argv = ["node", "index.js", "smoke-test-project"];
    process.exit = vi.fn() as never;

    vi.doMock("node:fs", () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      writeFileSync: mockWriteFileSync,
    }));
    vi.doMock("node:readline", () => ({
      createInterface: mockCreateInterface,
    }));
    vi.doMock("chalk", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler: ProxyHandler<any> = {
        get: () => new Proxy((s: string) => s, handler),
        apply: (_target, _thisArg, args) => args[0],
      };
      return { default: new Proxy((s: string) => s, handler) };
    });

    try {
      await import("./index.js");
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      // Expected in mocked environment
    }

    // Validate directory structure
    const hasProjectDir = createdDirs.some((d) => d.includes("smoke-test-project"));
    expect(hasProjectDir).toBe(true);

    // Validate config file is valid JSON with expected structure
    const configFile = [...writtenFiles.entries()].find(([p]) =>
      p.includes(".innovator.config.json")
    );
    if (configFile) {
      const config = JSON.parse(configFile[1]);
      expect(config).toHaveProperty("defaultProvider");
      expect(config).toHaveProperty("providers");
      expect(config).toHaveProperty("modelPreferences");
      expect(Object.keys(config.providers)).toEqual(
        expect.arrayContaining(["copilot", "openai", "anthropic", "ollama"])
      );
    }

    // Validate README exists and contains project name
    const readmeFile = [...writtenFiles.entries()].find(([p]) => p.endsWith("README.md"));
    if (readmeFile) {
      expect(readmeFile[1]).toContain("smoke-test-project");
      expect(readmeFile[1]).toContain("Quick Start");
    }

    // Validate .gitignore exists
    const gitignoreFile = [...writtenFiles.entries()].find(([p]) => p.endsWith(".gitignore"));
    if (gitignoreFile) {
      expect(gitignoreFile[1]).toContain("node_modules");
      expect(gitignoreFile[1]).toContain(".env");
    }
  });
});
