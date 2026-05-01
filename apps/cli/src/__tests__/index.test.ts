import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CLI_PATH = resolve(__dirname, "../index.ts");
const TSX = resolve(__dirname, "../../../../node_modules/.bin/tsx");

function run(...args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(TSX, [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NODE_ENV: "test" },
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      status: e.status ?? 1,
    };
  }
}

describe("CLI smoke tests", () => {
  it("prints help with --help", () => {
    const { stdout, status } = run("--help");
    expect(status).toBe(0);
    expect(stdout).toContain("innovator");
    expect(stdout).toContain("investigate");
    expect(stdout).toContain("innovate");
    expect(stdout).toContain("auto");
    expect(stdout).toContain("angles");
  });

  it("prints version with --version", () => {
    const { stdout, status } = run("--version");
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("lists available angles", () => {
    const { stdout, status } = run("angles");
    expect(status).toBe(0);
    expect(stdout).toContain("scamper");
    expect(stdout).toContain("Innovation Angles");
  });

  it("rejects innovate without --angles", () => {
    const { stderr, status } = run("innovate", "test-subject");
    expect(status).not.toBe(0);
    expect(stderr).toContain("--angles");
  });

  it("rejects unknown angle IDs", () => {
    const { stderr, status } = run("innovate", "test-subject", "--angles", "nonexistent-angle");
    expect(status).not.toBe(0);
    expect(stderr).toContain("Unknown angle");
  });
});
