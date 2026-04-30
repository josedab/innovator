#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  investigate,
  generateForAngle,
  runAutoPipeline,
  stopCopilotClient,
  ANGLES,
  ANGLE_IDS,
  KNOWN_MODELS,
} from "@innovator/core";
import type { AngleId } from "@innovator/core";
import { stripAnsi, validateSubject, validateModel, MAX_SUBJECT_LENGTH } from "./utils.js";

const program = new Command();

let verbose = false;

// Graceful shutdown on SIGINT/SIGTERM
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopCopilotClient().finally(() => process.exit(0));
  });
}

function validateSubjectWithLog(subject: string): boolean {
  if (!validateSubject(subject)) {
    console.error(
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
    console.error(chalk.red(`Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

function debugLog(label: string, ...args: unknown[]) {
  if (!verbose) return;
  const timestamp = new Date().toISOString();
  const truncatedArgs = args.map((arg) => {
    if (typeof arg === "string" && arg.length > 500) {
      return arg.slice(0, 500) + `... [truncated, ${arg.length} chars total]`;
    }
    return arg;
  });
  console.error(chalk.dim(`[${timestamp}] ${chalk.bold(label)}`), ...truncatedArgs);
}

function timeStart(label: string): () => void {
  if (!verbose) return () => {};
  const start = performance.now();
  debugLog("START", label);
  return () => {
    const elapsed = (performance.now() - start).toFixed(0);
    debugLog("END", `${label} (${elapsed}ms)`);
  };
}

program
  .name("innovator")
  .description("AI-Powered Innovation Engine — explore any subject from multiple innovation angles")
  .version("0.1.0")
  .option("--verbose", "Enable verbose logging (prompts, responses, timing)")
  .hook("preAction", () => {
    verbose = program.opts().verbose ?? false;
  });

// ---- investigate command ----
program
  .command("investigate")
  .description("Investigate a subject to identify key aspects, challenges, and opportunities")
  .argument("<subject>", "The subject to investigate")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;
    const spinner = ora(`Investigating "${subject}"...`).start();
    debugLog("COMMAND", "investigate", { subject, model: opts.model });
    const endTimer = timeStart("investigate");

    try {
      const result = await investigate(subject, opts.model);
      endTimer();
      spinner.succeed("Investigation complete!\n");
      debugLog("RESPONSE", JSON.stringify(result, null, 2));

      console.log(chalk.bold.blue("📋 Summary"));
      console.log(`   ${stripAnsi(result.summary)}\n`);

      console.log(chalk.bold.blue("🔑 Key Aspects"));
      for (const aspect of result.keyAspects) {
        console.log(`   ${chalk.bold(stripAnsi(aspect.title))}: ${stripAnsi(aspect.description)}`);
      }
      console.log();

      console.log(chalk.bold.blue("🎯 Current State"));
      console.log(`   ${stripAnsi(result.currentState)}\n`);

      console.log(chalk.bold.yellow("⚠️  Challenges"));
      for (const c of result.challenges) {
        console.log(`   ${chalk.yellow("•")} ${stripAnsi(c)}`);
      }
      console.log();

      console.log(chalk.bold.green("✨ Opportunities"));
      for (const o of result.opportunities) {
        console.log(`   ${chalk.green("•")} ${stripAnsi(o)}`);
      }
      console.log();

      console.log(chalk.dim("Available angles:"));
      for (const angle of ANGLES) {
        console.log(`   ${angle.icon} ${chalk.bold(angle.id)} — ${angle.shortDescription}`);
      }
      console.log(
        chalk.dim(`\nRun: innovator innovate "${subject}" --angles scamper,first-principles`)
      );
    } catch (err) {
      spinner.fail("Investigation failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Investigation failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      await stopCopilotClient();
    }
  });

// ---- innovate command ----
program
  .command("innovate")
  .description("Generate innovations for a subject using selected angles")
  .argument("<subject>", "The subject to innovate on")
  .requiredOption(
    "-a, --angles <angles>",
    "Comma-separated angle IDs (e.g., scamper,inversion,what-if)"
  )
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { angles: string; model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;
    const angleIds = opts.angles.split(",").map((a) => a.trim()) as AngleId[];
    const invalid = angleIds.filter((a) => !(ANGLE_IDS as readonly string[]).includes(a));
    if (invalid.length) {
      console.error(chalk.red(`Unknown angles: ${invalid.join(", ")}`));
      console.log(chalk.dim(`Valid angles: ${ANGLE_IDS.join(", ")}`));
      process.exitCode = 1;
      return;
    }

    const spinner = ora(`Investigating "${subject}"...`).start();
    debugLog("COMMAND", "innovate", { subject, angles: angleIds, model: opts.model });

    try {
      const endInvestigate = timeStart("investigate");
      const investigation = await investigate(subject, opts.model);
      endInvestigate();
      spinner.succeed("Investigation complete");
      debugLog("RESPONSE", "investigation", JSON.stringify(investigation, null, 2));

      for (const angleId of angleIds) {
        const angle = ANGLES.find((a) => a.id === angleId)!;
        spinner.start(`${angle.icon} Generating: ${angle.name}...`);

        const endAngle = timeStart(`generate:${angleId}`);
        const result = await generateForAngle(subject, investigation, angleId, opts.model);
        endAngle();
        spinner.succeed(`${angle.icon} ${angle.name}`);
        debugLog("RESPONSE", angleId, JSON.stringify(result, null, 2));

        console.log(chalk.dim(`   Reasoning: ${stripAnsi(result.reasoning)}`));
        for (const idea of result.ideas) {
          console.log(`\n   ${chalk.bold.cyan(stripAnsi(idea.title))}`);
          console.log(`   ${stripAnsi(idea.description)}`);
          console.log(`   ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
          console.log(`   ${chalk.dim("How to start:")} ${stripAnsi(idea.implementationHint)}`);
        }
        console.log();
      }
    } catch (err) {
      spinner.fail("Innovation generation failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Innovation generation failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      await stopCopilotClient();
    }
  });

// ---- auto command ----
program
  .command("auto")
  .description("Run full innovation pipeline automatically (all angles + synthesis)")
  .argument("<subject>", "The subject to innovate on")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;
    const spinner = ora("Starting auto pipeline...").start();
    debugLog("COMMAND", "auto", { subject, model: opts.model });
    const endTimer = timeStart("auto-pipeline");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    process.on("SIGINT", onAbort);
    process.on("SIGTERM", onAbort);

    try {
      const result = await runAutoPipeline(
        subject,
        (progress) => {
          debugLog("PIPELINE", progress.stage, {
            completedAngles: progress.completedAngles.length,
            totalAngles: progress.totalAngles,
          });
          if (progress.stage === "investigating") {
            spinner.text = "🔍 Investigating subject...";
          } else if (progress.stage === "generating") {
            const done = progress.completedAngles.length;
            const total = progress.totalAngles;
            spinner.text = `⚡ Generating innovations... (${done}/${total})`;
          } else if (progress.stage === "synthesizing") {
            spinner.text = "🧪 Synthesizing results...";
          }
        },
        opts.model,
        undefined,
        controller.signal
      );

      if (result.stage === "error") {
        endTimer();
        spinner.fail("Pipeline failed");
        if (verbose) {
          console.error(chalk.red(result.error));
        } else {
          console.error(chalk.red("Pipeline failed. Use --verbose for details."));
        }
        process.exitCode = 1;
        return;
      }

      endTimer();
      spinner.succeed("Pipeline complete!\n");
      debugLog("RESPONSE", "pipeline complete", {
        anglesCompleted: result.angleResults.length,
        hasSynthesis: !!result.synthesis,
      });

      // Print angle results
      for (const angle of result.angleResults) {
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.blue(`${stripAnsi(angle.angleName)}`));
        console.log(chalk.dim(stripAnsi(angle.reasoning)));

        for (const idea of angle.ideas) {
          console.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
          console.log(`  ${stripAnsi(idea.description)}`);
          console.log(`  ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
          console.log(`  ${chalk.dim("Start:")} ${stripAnsi(idea.implementationHint)}`);
        }
      }

      // Print synthesis
      if (result.synthesis) {
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.magenta("🏆 SYNTHESIS & TOP IDEAS\n"));

        for (const idea of result.synthesis.topIdeas) {
          const feasColor =
            idea.feasibility === "high"
              ? chalk.green
              : idea.feasibility === "medium"
                ? chalk.yellow
                : chalk.red;
          console.log(
            `  ${chalk.bold(stripAnsi(idea.title))} ${feasColor(`[${idea.feasibility}]`)}`
          );
          console.log(`  ${stripAnsi(idea.description)}`);
          console.log(
            `  ${chalk.dim("From:")} ${stripAnsi(idea.sourceAngle)} • ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}\n`
          );
        }

        console.log(chalk.bold("\n🔗 Themes:"));
        for (const theme of result.synthesis.themes) {
          console.log(`  ${chalk.magenta("•")} ${stripAnsi(theme)}`);
        }

        console.log(chalk.bold("\n📌 Recommendation:"));
        console.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
      }
    } catch (err) {
      spinner.fail("Auto mode failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Auto mode failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      process.removeListener("SIGINT", onAbort);
      process.removeListener("SIGTERM", onAbort);
      await stopCopilotClient();
    }
  });

// ---- angles command (utility) ----
program
  .command("angles")
  .description("List all available innovation angles")
  .action(() => {
    console.log(chalk.bold("\n💡 Available Innovation Angles\n"));
    for (const angle of ANGLES) {
      console.log(`  ${angle.icon} ${chalk.bold(angle.id.padEnd(20))} ${angle.name}`);
      console.log(`     ${chalk.dim(angle.shortDescription)}\n`);
    }
  });

program.parse();
