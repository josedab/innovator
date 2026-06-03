import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "commander";

vi.mock("@innovator/core", () => ({
  ANGLES: [
    {
      id: "scamper",
      name: "SCAMPER",
      icon: "S",
      shortDescription: "Transform ideas with SCAMPER prompts",
    },
  ],
  ANGLE_IDS: ["scamper"],
  KNOWN_MODELS: [],
  MAX_CONCURRENCY: 4,
  loadCustomAngles: vi.fn(() => []),
  stopCopilotClient: vi.fn(async () => undefined),
}));

import { parseCli, program } from "../program.js";

let stdout = "";
let stderr = "";
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];

async function execute(...args: string[]): Promise<unknown> {
  try {
    await parseCli(args);
    return undefined;
  } catch (err) {
    return err;
  }
}

function overrideExits(command: Command): void {
  command.exitOverride();
  command.commands.forEach(overrideExits);
}

describe("CLI smoke tests", () => {
  beforeEach(() => {
    stdout = "";
    stderr = "";
    consoleOutput = [];
    consoleErrors = [];
    process.exitCode = undefined;

    overrideExits(program);
    program.configureOutput({
      writeOut: (text) => {
        stdout += text;
      },
      writeErr: (text) => {
        stderr += text;
      },
    });

    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints help with --help", async () => {
    const error = await execute("--help");

    expect(error).toMatchObject({ code: "commander.helpDisplayed" });
    expect(stdout).toContain("innovator");
    expect(stdout).toContain("investigate");
    expect(stdout).toContain("innovate");
    expect(stdout).toContain("auto");
    expect(stdout).toContain("angles");
  });

  it("prints the package version with --version", async () => {
    const error = await execute("--version");

    expect(error).toMatchObject({ code: "commander.version" });
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("lists available angles", async () => {
    const error = await execute("angles");

    expect(error).toBeUndefined();
    expect(consoleOutput.join("\n")).toContain("scamper");
    expect(consoleOutput.join("\n")).toContain("Innovation Angles");
  });

  it("rejects innovate without --angles", async () => {
    const error = await execute("innovate", "test-subject");

    expect(error).toMatchObject({ code: "commander.missingMandatoryOptionValue" });
    expect(stderr).toContain("--angles");
  });

  it("rejects unknown angle IDs", async () => {
    const error = await execute("innovate", "test-subject", "--angles", "nonexistent-angle");

    expect(error).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(consoleErrors.join("\n")).toContain("Unknown angles");
  });
});
