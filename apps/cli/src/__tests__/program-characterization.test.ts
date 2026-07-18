import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command, Option } from "commander";

const coreMocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  disposeRuntime: vi.fn(async () => undefined),
  investigate: vi.fn(),
  runAutoPipeline: vi.fn(),
  querySessions: vi.fn(() => []),
  getPresets: vi.fn(() => []),
  loadConfig: vi.fn(() => ({ defaultProvider: "copilot" })),
  listMonitors: vi.fn(() => []),
  listRubrics: vi.fn(() => []),
  listAgentRuns: vi.fn(() => []),
  runMonteCarloComparison: vi.fn(() => ({ results: [], recommendation: "balanced" })),
  twinMonteCarloToMarkdown: vi.fn(() => "# Monte Carlo Report"),
}));

const spinner = vi.hoisted(() => ({
  text: "",
  start: vi.fn(),
  stop: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  info: vi.fn(),
}));

spinner.start.mockImplementation(() => spinner);

vi.mock("ora", () => ({
  default: vi.fn(() => spinner),
}));

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
  OUTPUT_MODES: [],
  RECOMMENDED_MODELS: {},
  DepthSchema: {
    safeParse: (value: string) =>
      ["shallow", "standard", "deep"].includes(value)
        ? { success: true, data: value }
        : { success: false },
  },
  SupportedLanguageSchema: {
    safeParse: (value: string) =>
      ["en", "es", "ja", "de", "pt"].includes(value)
        ? { success: true, data: value }
        : { success: false },
  },
  loadCustomAngles: vi.fn(() => []),
  investigate: coreMocks.investigate,
  runAutoPipeline: coreMocks.runAutoPipeline,
  querySessions: coreMocks.querySessions,
  getPresets: coreMocks.getPresets,
  listMonitors: coreMocks.listMonitors,
  listRubrics: coreMocks.listRubrics,
  listAgentRuns: coreMocks.listAgentRuns,
  runMonteCarloComparison: coreMocks.runMonteCarloComparison,
  twinMonteCarloToMarkdown: coreMocks.twinMonteCarloToMarkdown,
  getDepthConfig: vi.fn(() => ({
    label: "Standard",
    description: "Balanced investigation",
    estimatedTimeSeconds: 30,
    estimatedCalls: 1,
  })),
  suggestDepth: vi.fn(() => "standard"),
  detectLanguage: vi.fn(() => "en"),
}));

vi.mock("@innovator/core/runtime", () => ({
  createDefaultInnovatorRuntime: coreMocks.createRuntime.mockImplementation(() => ({
    dispose: coreMocks.disposeRuntime,
  })),
}));

vi.mock("@innovator/core/providers", () => ({
  listProviders: vi.fn(() => []),
  loadConfig: coreMocks.loadConfig,
  saveConfig: vi.fn(),
}));

import { createProgram, parseCli, program, runCli } from "../program.js";

const EXPECTED_COMMANDS: Array<[string, string[]]> = [
  ["investigate", []],
  ["innovate", []],
  ["auto", []],
  ["evolve", []],
  ["diff", []],
  ["run", []],
  ["chain", ["list", "run"]],
  ["feedback", ["summary", "rate"]],
  ["angles", ["list", "create", "remove", "export", "import"]],
  ["export", []],
  ["history", ["list", "show", "tag", "delete"]],
  ["presets", ["list", "run"]],
  ["plugin", ["list", "load", "create"]],
  ["benchmark", []],
  ["config", ["show", "set-provider", "set-model", "providers", "setup-offline"]],
  ["refine", []],
  ["connections", []],
  ["migrate", []],
  ["marketplace", ["search", "install", "publish"]],
  ["radar", ["watch", "list"]],
  ["scaffold", []],
  ["telemetry", []],
  ["context", ["add", "list", "sync"]],
  ["webhooks", ["templates", "list"]],
  ["monitor", ["create", "list", "signals"]],
  ["provenance", []],
  ["wargame", []],
  ["rubric", ["list", "show"]],
  ["cost-report", []],
  ["supply-chain", []],
  ["timing", []],
  ["idea", ["log", "branch", "diff"]],
  ["decode", []],
  ["diffusion", []],
  ["classify", []],
  ["market-test", []],
  ["flow-check", []],
  ["regulatory", []],
  ["innov-monitor", ["status", "sources", "digest", "signals"]],
  ["nl-innovate", []],
  ["memory", ["search", "org-dna", "lineage", "convergence"]],
  ["impact", ["funnel", "rank", "dashboard"]],
  ["comp-radar", ["competitors", "gap-analysis", "dashboard"]],
  ["recommend", []],
  ["persona-eval", []],
  ["iac", ["init", "save", "history", "diff", "issues", "validate"]],
  ["agent", ["start", "list", "export", "stop", "resume"]],
  ["novelty-check", []],
  ["genome", ["status", "analytics", "insights", "join", "leave"]],
  ["simulate", []],
];

let stdout = "";
let stderr = "";
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];

function overrideExits(command: Command): void {
  command.exitOverride();
  command.commands.forEach(overrideExits);
}

function findCommand(...path: string[]): Command {
  let current = program;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Command not found: ${path.join(" ")}`);
    current = next;
  }
  return current;
}

function findOption(command: Command, longFlag: string): Option {
  const option = command.options.find((candidate) => candidate.long === longFlag);
  if (!option) throw new Error(`Option not found: ${command.name()} ${longFlag}`);
  return option;
}

async function execute(...args: string[]): Promise<unknown> {
  try {
    await parseCli(args);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("CLI command surface characterization", () => {
  beforeEach(() => {
    stdout = "";
    stderr = "";
    consoleOutput = [];
    consoleErrors = [];
    process.exitCode = undefined;
    vi.clearAllMocks();

    coreMocks.createRuntime.mockImplementation(() => ({
      dispose: coreMocks.disposeRuntime,
    }));
    coreMocks.querySessions.mockReturnValue([]);
    coreMocks.getPresets.mockReturnValue([]);
    coreMocks.loadConfig.mockReturnValue({ defaultProvider: "copilot" });
    coreMocks.listMonitors.mockReturnValue([]);
    coreMocks.listRubrics.mockReturnValue([]);
    coreMocks.listAgentRuns.mockReturnValue([]);
    coreMocks.runMonteCarloComparison.mockReturnValue({
      results: [],
      recommendation: "balanced",
    });
    coreMocks.twinMonteCarloToMarkdown.mockReturnValue("# Monte Carlo Report");

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

  it("pins the complete top-level and nested command inventory in registration order", () => {
    expect(
      program.commands.map((command) => [
        command.name(),
        command.commands.map((subcommand) => subcommand.name()),
      ])
    ).toEqual(EXPECTED_COMMANDS);
    expect(program.commands).toHaveLength(50);
  });

  it("creates isolated command trees with injected output and runtime seams", async () => {
    const firstLogs: string[] = [];
    const firstErrors: string[] = [];
    let firstStdout = "";
    const firstRuntime = { dispose: vi.fn(async () => undefined) };
    const secondRuntime = { dispose: vi.fn(async () => undefined) };
    const first = createProgram({
      output: {
        log: (...args) => firstLogs.push(args.map(String).join(" ")),
        error: (...args) => firstErrors.push(args.map(String).join(" ")),
      },
      commanderOutput: {
        writeOut: (text) => {
          firstStdout += text;
        },
        writeErr: (text) => {
          firstErrors.push(text);
        },
      },
      createRuntime: () => firstRuntime,
    });
    const second = createProgram({
      output: { log: vi.fn(), error: vi.fn() },
      createRuntime: () => secondRuntime,
    });
    overrideExits(first);
    overrideExits(second);

    expect(first).not.toBe(second);
    expect(first.commands[0]).not.toBe(second.commands[0]);
    expect(first.commands.map((command) => command.name())).toEqual(
      EXPECTED_COMMANDS.map(([name]) => name)
    );
    expect(second.commands.map((command) => command.name())).toEqual(
      EXPECTED_COMMANDS.map(([name]) => name)
    );

    await parseCli(["angles"], first);
    expect(firstLogs.join("\n")).toContain("Built-in Innovation Angles");
    expect(firstErrors).toEqual([]);
    expect(firstRuntime.dispose).toHaveBeenCalledOnce();
    expect(secondRuntime.dispose).not.toHaveBeenCalled();

    const helpError = await (async () => {
      try {
        await parseCli(["--help"], first);
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(helpError).toMatchObject({ code: "commander.helpDisplayed" });
    expect(firstStdout).toContain("Usage: innovator [options] [command]");
    expect(firstRuntime.dispose).toHaveBeenCalledTimes(2);
  });

  it("keeps verbose state isolated per created program", async () => {
    const verboseErrors: string[] = [];
    const quietErrors: string[] = [];
    const verboseProgram = createProgram({
      output: {
        log: vi.fn(),
        error: (...args) => verboseErrors.push(args.map(String).join(" ")),
      },
    });
    const quietProgram = createProgram({
      output: {
        log: vi.fn(),
        error: (...args) => quietErrors.push(args.map(String).join(" ")),
      },
    });
    overrideExits(verboseProgram);
    overrideExits(quietProgram);
    coreMocks.investigate.mockRejectedValue(new Error("characterized failure"));

    await parseCli(["--verbose", "investigate", "verbose subject"], verboseProgram);
    process.exitCode = undefined;
    await parseCli(["investigate", "quiet subject"], quietProgram);

    expect(verboseErrors.join("\n")).toContain("characterized failure");
    expect(quietErrors.join("\n")).toContain("Investigation failed. Use --verbose for details.");
    expect(quietErrors.join("\n")).not.toContain("characterized failure");
  });

  it("pins root help identity, description, version, and output routing", async () => {
    const error = await execute("--help");

    expect(error).toMatchObject({ code: "commander.helpDisplayed", exitCode: 0 });
    expect(program.name()).toBe("innovator");
    expect(program.description()).toBe(
      "AI-Powered Innovation Engine — explore any subject from multiple innovation angles"
    );
    expect(program.version()).toBe("0.3.0");
    expect(stdout).toContain("Usage: innovator [options] [command]");
    expect(stdout.replace(/\s+/g, " ")).toContain(
      "AI-Powered Innovation Engine — explore any subject from multiple innovation angles"
    );
    expect(stdout.indexOf("investigate")).toBeLessThan(stdout.indexOf("innovate"));
    expect(stdout.indexOf("innovate")).toBeLessThan(stdout.indexOf("auto"));
    expect(stderr).toBe("");
    expect(consoleOutput).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  it("pins version output text", async () => {
    const error = await execute("--version");

    expect(error).toMatchObject({ code: "commander.version", exitCode: 0 });
    expect(stdout).toBe("0.3.0\n");
    expect(stderr).toBe("");
  });

  it("pins representative arguments, required options, and defaults", () => {
    const investigateCommand = findCommand("investigate");
    expect(
      investigateCommand.registeredArguments.map((argument) => ({
        name: argument.name(),
        required: argument.required,
        variadic: argument.variadic,
      }))
    ).toEqual([{ name: "subject", required: true, variadic: false }]);
    expect(findOption(investigateCommand, "--depth")).toMatchObject({
      flags: "--depth <depth>",
      defaultValue: "standard",
    });

    expect(findOption(findCommand("innovate"), "--angles")).toMatchObject({
      flags: "-a, --angles <angles>",
      mandatory: true,
    });
    expect(findOption(findCommand("angles", "create"), "--icon")).toMatchObject({
      defaultValue: "🔧",
    });
    expect(findOption(findCommand("angles", "create"), "--template")).toMatchObject({
      mandatory: true,
    });
    expect(findOption(findCommand("history", "list"), "--limit")).toMatchObject({
      defaultValue: "10",
    });
    expect(findOption(findCommand("monitor", "create"), "--frequency")).toMatchObject({
      defaultValue: "daily",
    });
    expect(findOption(findCommand("scaffold"), "--title")).toMatchObject({
      mandatory: true,
    });
    expect(findOption(findCommand("agent", "start"), "--max-branches")).toMatchObject({
      defaultValue: "10",
    });
    expect(findOption(findCommand("simulate"), "--iterations")).toMatchObject({
      defaultValue: "1000",
    });
    expect(findOption(findCommand("simulate"), "--weeks")).toMatchObject({
      defaultValue: "52",
    });
  });

  it("pins Commander parse errors, exit codes, and stderr routing", async () => {
    const unknownCommand = await execute("not-a-command");

    expect(unknownCommand).toMatchObject({
      code: "commander.unknownCommand",
      exitCode: 1,
    });
    expect(stderr).toContain("error: unknown command 'not-a-command'");
    expect(stdout).toBe("");
    expect(consoleErrors).toEqual([]);

    stdout = "";
    stderr = "";
    const missingOption = await execute("innovate", "test subject");

    expect(missingOption).toMatchObject({
      code: "commander.missingMandatoryOptionValue",
      exitCode: 1,
    });
    expect(stderr).toContain("required option '-a, --angles <angles>' not specified");
    expect(process.exitCode).toBeUndefined();
  });

  it("routes command output through console while Commander output stays configured", async () => {
    const error = await execute("angles");

    expect(error).toBeUndefined();
    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(consoleOutput.join("\n")).toContain("Built-in Innovation Angles");
    expect(consoleOutput.join("\n")).toContain("scamper");
  });

  it("preserves default actions for utility command groups", async () => {
    await execute("history");
    expect(coreMocks.querySessions).toHaveBeenCalledWith({
      search: undefined,
      tags: undefined,
      limit: 10,
    });
    expect(consoleOutput.join("\n")).toContain("No sessions found.");

    consoleOutput = [];
    await execute("presets");
    expect(coreMocks.getPresets).toHaveBeenCalledOnce();
    expect(consoleOutput.join("\n")).toContain("Available Presets");

    consoleOutput = [];
    await execute("config");
    expect(coreMocks.loadConfig).toHaveBeenCalledOnce();
    expect(consoleOutput.join("\n")).toContain("Innovator Configuration");
    expect(consoleOutput.join("\n")).toContain("copilot");
  });

  it("runs a representative core pipeline command with mocked core", async () => {
    coreMocks.investigate.mockResolvedValue({
      summary: "Characterized summary",
      keyAspects: [{ title: "Aspect", description: "Description" }],
      currentState: "Current state",
      challenges: ["Challenge"],
      opportunities: ["Opportunity"],
    });

    const error = await execute("investigate", "test subject");

    expect(error).toBeUndefined();
    expect(coreMocks.investigate).toHaveBeenCalledWith("test subject", undefined);
    expect(consoleOutput.join("\n")).toContain("Characterized summary");
    expect(consoleOutput.join("\n")).toContain("Available angles:");
  });

  it("runs representative collaboration, analysis, and agent commands with mocked core", async () => {
    await execute("monitor", "list");
    expect(coreMocks.listMonitors).toHaveBeenCalledOnce();
    expect(consoleOutput.join("\n")).toContain("No monitors configured.");

    consoleOutput = [];
    await execute("rubric", "list");
    expect(coreMocks.listRubrics).toHaveBeenCalledOnce();
    expect(consoleOutput.join("\n")).toContain("No rubrics found.");

    consoleOutput = [];
    await execute("agent", "list");
    expect(coreMocks.listAgentRuns).toHaveBeenCalledOnce();
    expect(consoleOutput.join("\n")).toContain("No agent runs found.");
  });

  it("runs the Monte Carlo simulation with characterized defaults and overrides", async () => {
    await execute("simulate", "--iterations", "7", "--weeks", "2", "--seed", "3");

    expect(coreMocks.runMonteCarloComparison).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cli-demo" }),
      expect.arrayContaining([
        expect.objectContaining({ id: "conservative", timeHorizonWeeks: 2 }),
      ]),
      { iterations: 7, timeHorizonWeeks: 2, randomSeed: 3 }
    );
    expect(consoleOutput).toContain("# Monte Carlo Report");
  });

  it("registers signals once and cleans up command, runtime, then exits on SIGINT", async () => {
    const handlers = new Map<string, () => void>();
    const events: string[] = [];
    let resolvePipeline:
      | ((value: { stage: "error"; error: string; angleResults: never[] }) => void)
      | undefined;

    const onSignal = vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    });
    const exit = vi.fn((code: string | number) => {
      events.push(`exit:${code}`);
    });

    let pipelineSignal: AbortSignal | undefined;
    coreMocks.runAutoPipeline.mockImplementation(
      (
        _subject: string,
        _progress: unknown,
        _model: unknown,
        _angles: unknown,
        signal: AbortSignal
      ) => {
        pipelineSignal = signal;
        return new Promise((resolve) => {
          resolvePipeline = resolve;
        });
      }
    );
    const dispose = vi.fn(async () => {
      expect(pipelineSignal?.aborted).toBe(true);
      events.push("dispose");
    });
    const signalProgram = createProgram({
      output: { log: vi.fn(), error: vi.fn() },
      createRuntime: () => ({ dispose }),
      onSignal,
      exit,
      getExitCode: () => undefined,
    });
    overrideExits(signalProgram);

    const runPromise = runCli(["node", "innovator", "auto", "signal subject"], signalProgram);
    await vi.waitFor(() => expect(coreMocks.runAutoPipeline).toHaveBeenCalledOnce());

    expect(onSignal.mock.calls.map(([signal]) => signal)).toEqual(["SIGINT", "SIGTERM"]);
    expect(handlers.get("SIGINT")).toBeTypeOf("function");

    handlers.get("SIGINT")?.();
    expect(pipelineSignal?.aborted).toBe(true);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    expect(events).toEqual(["dispose", "exit:130"]);

    resolvePipeline?.({ stage: "error", error: "aborted", angleResults: [] });
    await runPromise;

    expect(dispose).toHaveBeenCalledOnce();
    await runCli(["node", "innovator", "angles"], signalProgram);
    expect(onSignal).toHaveBeenCalledTimes(2);
  });
});
