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
} from "@innovator/core";
import type { AngleId } from "@innovator/core";

const program = new Command();

program
  .name("innovator")
  .description("AI-Powered Innovation Engine — explore any subject from multiple innovation angles")
  .version("0.1.0");

// ---- investigate command ----
program
  .command("investigate")
  .description("Investigate a subject to identify key aspects, challenges, and opportunities")
  .argument("<subject>", "The subject to investigate")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    const spinner = ora(`Investigating "${subject}"...`).start();

    try {
      const result = await investigate(subject, opts.model);
      spinner.succeed("Investigation complete!\n");

      console.log(chalk.bold.blue("📋 Summary"));
      console.log(`   ${result.summary}\n`);

      console.log(chalk.bold.blue("🔑 Key Aspects"));
      for (const aspect of result.keyAspects) {
        console.log(`   ${chalk.bold(aspect.title)}: ${aspect.description}`);
      }
      console.log();

      console.log(chalk.bold.blue("🎯 Current State"));
      console.log(`   ${result.currentState}\n`);

      console.log(chalk.bold.yellow("⚠️  Challenges"));
      for (const c of result.challenges) {
        console.log(`   ${chalk.yellow("•")} ${c}`);
      }
      console.log();

      console.log(chalk.bold.green("✨ Opportunities"));
      for (const o of result.opportunities) {
        console.log(`   ${chalk.green("•")} ${o}`);
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
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
  .action(
    async (
      subject: string,
      opts: { angles: string; model?: string }
    ) => {
      const angleIds = opts.angles.split(",").map((a) => a.trim()) as AngleId[];
      const invalid = angleIds.filter(
        (a) => !(ANGLE_IDS as readonly string[]).includes(a)
      );
      if (invalid.length) {
        console.error(chalk.red(`Unknown angles: ${invalid.join(", ")}`));
        console.log(chalk.dim(`Valid angles: ${ANGLE_IDS.join(", ")}`));
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Investigating "${subject}"...`).start();

      try {
        const investigation = await investigate(subject, opts.model);
        spinner.succeed("Investigation complete");

        for (const angleId of angleIds) {
          const angle = ANGLES.find((a) => a.id === angleId)!;
          spinner.start(`${angle.icon} Generating: ${angle.name}...`);

          const result = await generateForAngle(
            subject,
            investigation,
            angleId,
            opts.model
          );
          spinner.succeed(`${angle.icon} ${angle.name}`);

          console.log(chalk.dim(`   Reasoning: ${result.reasoning}`));
          for (const idea of result.ideas) {
            console.log(`\n   ${chalk.bold.cyan(idea.title)}`);
            console.log(`   ${idea.description}`);
            console.log(`   ${chalk.dim("Impact:")} ${idea.potentialImpact}`);
            console.log(`   ${chalk.dim("How to start:")} ${idea.implementationHint}`);
          }
          console.log();
        }
      } catch (err) {
        spinner.fail("Innovation generation failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        await stopCopilotClient();
      }
    }
  );

// ---- auto command ----
program
  .command("auto")
  .description("Run full innovation pipeline automatically (all angles + synthesis)")
  .argument("<subject>", "The subject to innovate on")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    const spinner = ora("Starting auto pipeline...").start();

    try {
      const result = await runAutoPipeline(
        subject,
        (progress) => {
          if (progress.stage === "investigating") {
            spinner.text = '🔍 Investigating subject...';
          } else if (progress.stage === "generating") {
            const done = progress.completedAngles.length;
            const total = progress.totalAngles;
            spinner.text = `⚡ Generating innovations... (${done}/${total})`;
          } else if (progress.stage === "synthesizing") {
            spinner.text = "🧪 Synthesizing results...";
          }
        },
        opts.model
      );

      if (result.stage === "error") {
        spinner.fail("Pipeline failed");
        console.error(chalk.red(result.error));
        process.exitCode = 1;
        return;
      }

      spinner.succeed("Pipeline complete!\n");

      // Print angle results
      for (const angle of result.angleResults) {
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.blue(`${angle.angleName}`));
        console.log(chalk.dim(angle.reasoning));

        for (const idea of angle.ideas) {
          console.log(`\n  ${chalk.bold.cyan(idea.title)}`);
          console.log(`  ${idea.description}`);
          console.log(`  ${chalk.dim("Impact:")} ${idea.potentialImpact}`);
          console.log(`  ${chalk.dim("Start:")} ${idea.implementationHint}`);
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
            `  ${chalk.bold(idea.title)} ${feasColor(`[${idea.feasibility}]`)}`
          );
          console.log(`  ${idea.description}`);
          console.log(
            `  ${chalk.dim("From:")} ${idea.sourceAngle} • ${chalk.dim("Impact:")} ${idea.potentialImpact}\n`
          );
        }

        console.log(chalk.bold("\n🔗 Themes:"));
        for (const theme of result.synthesis.themes) {
          console.log(`  ${chalk.magenta("•")} ${theme}`);
        }

        console.log(chalk.bold("\n📌 Recommendation:"));
        console.log(`  ${result.synthesis.recommendation}`);
      }
    } catch (err) {
      spinner.fail("Auto mode failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    } finally {
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
