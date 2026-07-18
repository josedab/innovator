import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import {
  createCliContext,
  executeCli,
  type CliContext,
  type CliDependencies,
} from "./cli-context.js";
import {
  registerAnalysisSimulationCommands,
  registerMonteCarloSimulationCommand,
} from "./commands/analysis-simulation.js";
import { registerCollaborationMonitoringCommands } from "./commands/collaboration-monitoring.js";
import { registerCorePipelineCommands } from "./commands/core-pipeline.js";
import { registerIacAgentGenomeCommands } from "./commands/iac-agent-genome.js";
import { registerUtilityHistoryConfigCommands } from "./commands/utility-history-config.js";

export type { CliDependencies } from "./cli-context.js";

const contexts = new WeakMap<Command, CliContext>();

export function createProgram(dependencies: CliDependencies = {}): Command {
  const program = new Command();
  const context = createCliContext(program, dependencies);
  contexts.set(program, context);

  if (dependencies.commanderOutput) {
    program.configureOutput(dependencies.commanderOutput);
  }

  program
    .name("innovator")
    .description(
      "AI-Powered Innovation Engine — explore any subject from multiple innovation angles"
    )
    .version(packageJson.version)
    .option("--verbose", "Enable verbose logging (prompts, responses, timing)")
    .hook("preAction", () => {
      context.verbose = program.opts().verbose ?? false;
    });

  registerCorePipelineCommands(program, context);
  registerUtilityHistoryConfigCommands(program, context);
  registerCollaborationMonitoringCommands(program, context);
  registerAnalysisSimulationCommands(program, context);
  registerIacAgentGenomeCommands(program, context);
  registerMonteCarloSimulationCommand(program, context);

  return program;
}

export const program = createProgram();

function getContext(command: Command): CliContext {
  const context = contexts.get(command);
  if (!context) throw new Error("CLI program context not found");
  return context;
}

export async function parseCli(
  args: readonly string[],
  cliProgram: Command = program
): Promise<void> {
  await executeCli(getContext(cliProgram), args, { from: "user" }, false);
}

export async function runCli(
  argv: readonly string[] = process.argv,
  cliProgram: Command = program
): Promise<void> {
  await executeCli(getContext(cliProgram), argv, undefined, true);
}
