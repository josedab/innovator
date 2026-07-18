import chalk from "chalk";
import { KNOWN_MODELS } from "@innovator/core";
import type { CliContext } from "./cli-context.js";
import { MAX_SUBJECT_LENGTH, validateModel, validateSubject } from "./utils.js";

export function createCommandHelpers(context: CliContext) {
  function validateSubjectWithLog(subject: string): boolean {
    if (!validateSubject(subject)) {
      context.output.error(
        chalk.red(
          `Subject too long (${subject.length} chars). Maximum is ${MAX_SUBJECT_LENGTH} characters.`
        )
      );
      process.exitCode = 1;
      return false;
    }
    return true;
  }

  function validateModelWithLog(model: string | undefined): boolean {
    if (!validateModel(model, KNOWN_MODELS)) {
      context.output.error(chalk.red(`Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`));
      process.exitCode = 1;
      return false;
    }
    return true;
  }

  function debugLog(label: string, ...args: unknown[]): void {
    if (!context.verbose) return;
    const timestamp = new Date().toISOString();
    const truncatedArgs = args.map((arg) => {
      if (typeof arg === "string" && arg.length > 500) {
        return arg.slice(0, 500) + `... [truncated, ${arg.length} chars total]`;
      }
      return arg;
    });
    context.output.error(chalk.dim(`[${timestamp}] ${chalk.bold(label)}`), ...truncatedArgs);
  }

  function timeStart(label: string): () => void {
    if (!context.verbose) return () => {};
    const start = performance.now();
    debugLog("START", label);
    return () => {
      const elapsed = (performance.now() - start).toFixed(0);
      debugLog("END", `${label} (${elapsed}ms)`);
    };
  }

  return {
    validateSubjectWithLog,
    validateModelWithLog,
    debugLog,
    timeStart,
  };
}
