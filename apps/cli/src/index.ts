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
  MAX_CONCURRENCY,
  loadCustomAngles,
  addCustomAngle,
  removeCustomAngle,
  exportAnglePack,
  importAnglePack,
  listPlugins,
  loadPlugin,
  getPresets,
  getPresetById,
  listSessions,
  getSession,
  querySessions,
  deleteSession,
  updateSession,
  exportToMarkdown,
  exportToJson,
  generateGitHubIssueBody,
  scoreIdeas,
  computePriorityScore,
  getQuadrant,
  rankIdeas,
  extractContent,
  buildSubjectFromContent,
  runBenchmark,
  benchmarkToMarkdown,
  loadConfig,
  saveConfig,
  initializeProviders,
  listProviders,
  setActiveProvider,
  createConversation,
  refineConversation,
} from "@innovator/core";
import type { AngleId, CustomAngle, ExportData, IdeaScore, InnovatorConfig } from "@innovator/core";
import { stripAnsi, validateSubject, validateModel, MAX_SUBJECT_LENGTH } from "./utils.js";

const program = new Command();

let verbose = false;
let commandCleanup: (() => Promise<void>) | null = null;

// Graceful shutdown on SIGINT/SIGTERM — runs per-command cleanup first
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    const cleanup = commandCleanup ? commandCleanup() : Promise.resolve();
    cleanup.finally(() => stopCopilotClient().finally(() => process.exit(0)));
  });
}

/** Validate subject length and log an error message to stderr on failure. */
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

/** Validate that the model is in the known list and log an error on failure. */
function validateModelWithLog(model: string | undefined): boolean {
  if (!validateModel(model, KNOWN_MODELS)) {
    console.error(chalk.red(`Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Log a debug message to stderr when verbose mode is enabled. Long strings are truncated to 500 chars. */
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

/** Start a named timer and return a function that logs the elapsed time when called. No-op when verbose is off. */
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
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .action(async (subject: string, opts: { model?: string; score?: boolean; file?: string; url?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    // Handle --file or --url input
    let enrichedSubject = subject;
    if (opts.file || opts.url) {
      const source = opts.file ?? opts.url!;
      const extractSpinner = ora(`Extracting content from ${source}...`).start();
      try {
        const extracted = await extractContent(source);
        enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
        extractSpinner.succeed(`Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`);
      } catch (err) {
        extractSpinner.fail("Content extraction failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
        return;
      }
    }

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
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .action(async (subject: string, opts: { angles: string; model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    // Handle --file or --url input
    let enrichedSubject = subject;
    if (opts.file || opts.url) {
      const source = opts.file ?? opts.url!;
      const extractSpinner = ora(`Extracting content from ${source}...`).start();
      try {
        const extracted = await extractContent(source);
        enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
        extractSpinner.succeed(`Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`);
      } catch (err) {
        extractSpinner.fail("Content extraction failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
        return;
      }
    }

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

      for (let i = 0; i < angleIds.length; i += MAX_CONCURRENCY) {
        const batch = angleIds.slice(i, i + MAX_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (angleId) => {
            const angle = ANGLES.find((a) => a.id === angleId);
            if (!angle) {
              throw new Error(`Unknown angle: ${angleId}`);
            }
            spinner.start(`${angle.icon} Generating: ${angle.name}...`);

            const endAngle = timeStart(`generate:${angleId}`);
            const result = await generateForAngle(subject, investigation, angleId, opts.model);
            endAngle();
            debugLog("RESPONSE", angleId, JSON.stringify(result, null, 2));
            return { angle, result };
          })
        );
        for (const { angle, result } of batchResults) {
          spinner.succeed(`${angle.icon} ${angle.name}`);
          console.log(chalk.dim(`   Reasoning: ${stripAnsi(result.reasoning)}`));
          for (const idea of result.ideas) {
            console.log(`\n   ${chalk.bold.cyan(stripAnsi(idea.title))}`);
            console.log(`   ${stripAnsi(idea.description)}`);
            console.log(`   ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
            console.log(`   ${chalk.dim("How to start:")} ${stripAnsi(idea.implementationHint)}`);
          }
          console.log();
        }
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
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .action(async (subject: string, opts: { model?: string; score?: boolean; file?: string; url?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    // Handle --file or --url input
    let enrichedSubject = subject;
    if (opts.file || opts.url) {
      const source = opts.file ?? opts.url!;
      const extractSpinner = ora(`Extracting content from ${source}...`).start();
      try {
        const extracted = await extractContent(source);
        enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
        extractSpinner.succeed(`Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`);
      } catch (err) {
        extractSpinner.fail("Content extraction failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
        return;
      }
    }

    const spinner = ora("Starting auto pipeline...").start();
    debugLog("COMMAND", "auto", { subject, model: opts.model });
    const endTimer = timeStart("auto-pipeline");

    const controller = new AbortController();
    commandCleanup = async () => controller.abort();

    try {
      const result = await runAutoPipeline(
        enrichedSubject,
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

      // Score ideas if --score flag is set
      if (opts.score && result.angleResults.length > 0) {
        const scoreSpinner = ora("📊 Scoring ideas...").start();
        try {
          const scoring = await scoreIdeas(
            subject,
            result.angleResults,
            result.investigation,
            opts.model
          );
          scoreSpinner.succeed("Ideas scored!\n");

          const ranked = rankIdeas(scoring.scores);
          console.log(chalk.bold.blue("📊 PRIORITY MATRIX\n"));
          console.log(
            chalk.dim(
              "  " +
                "Idea".padEnd(40) +
                "Feasibility".padEnd(14) +
                "Impact".padEnd(9) +
                "Novelty".padEnd(10) +
                "Time".padEnd(10) +
                "Quadrant"
            )
          );
          console.log(chalk.dim("  " + "─".repeat(90)));
          for (const score of ranked) {
            const quadrant = getQuadrant(score);
            const quadrantColor =
              quadrant === "quick-wins"
                ? chalk.green
                : quadrant === "strategic-bets"
                  ? chalk.yellow
                  : quadrant === "low-hanging-fruit"
                    ? chalk.cyan
                    : chalk.dim;
            const title = stripAnsi(score.ideaTitle).slice(0, 38).padEnd(40);
            console.log(
              `  ${title}${String(score.feasibility).padEnd(14)}${String(score.impact).padEnd(9)}${String(score.novelty).padEnd(10)}${score.timeToImplement.padEnd(10)}${quadrantColor(quadrant)}`
            );
          }
          console.log();
        } catch (err) {
          scoreSpinner.fail("Scoring failed");
          if (verbose) {
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          }
        }
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
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

// ---- angles command (utility) ----
const anglesCmd = program
  .command("angles")
  .description("List and manage innovation angles");

anglesCmd
  .command("list")
  .description("List all available innovation angles (built-in and custom)")
  .action(() => {
    console.log(chalk.bold("\n💡 Built-in Innovation Angles\n"));
    for (const angle of ANGLES) {
      console.log(`  ${angle.icon} ${chalk.bold(angle.id.padEnd(20))} ${angle.name}`);
      console.log(`     ${chalk.dim(angle.shortDescription)}\n`);
    }

    const custom = loadCustomAngles();
    if (custom.length > 0) {
      console.log(chalk.bold("🎨 Custom Angles\n"));
      for (const angle of custom) {
        console.log(`  ${angle.icon ?? "🔧"} ${chalk.bold(angle.id.padEnd(20))} ${angle.name}`);
        console.log(`     ${chalk.dim(angle.description)}\n`);
      }
    }
  });

// Default action: just listing (backwards compat)
anglesCmd.action(() => {
  anglesCmd.commands.find((c) => c.name() === "list")?.parse([], { from: "user" });
});

anglesCmd
  .command("create")
  .description("Create a new custom innovation angle")
  .requiredOption("--id <id>", "Unique angle identifier (lowercase, hyphens)")
  .requiredOption("--name <name>", "Display name")
  .requiredOption("--description <desc>", "Short description of the angle")
  .requiredOption("--template <template>", "Prompt template with {{subject}} and {{investigation}} placeholders")
  .option("--icon <icon>", "Emoji icon", "🔧")
  .option("--author <author>", "Author name")
  .option("--tags <tags>", "Comma-separated tags")
  .action((opts: { id: string; name: string; description: string; template: string; icon: string; author?: string; tags?: string }) => {
    try {
      const angle: CustomAngle = {
        id: opts.id,
        name: opts.name,
        description: opts.description,
        promptTemplate: opts.template,
        icon: opts.icon,
        author: opts.author,
        tags: opts.tags?.split(",").map((t) => t.trim()),
      };
      addCustomAngle(angle);
      console.log(chalk.green(`✓ Custom angle "${opts.id}" created successfully`));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : "Failed to create angle"));
      process.exitCode = 1;
    }
  });

anglesCmd
  .command("remove <id>")
  .description("Remove a custom angle")
  .action((id: string) => {
    if (removeCustomAngle(id)) {
      console.log(chalk.green(`✓ Custom angle "${id}" removed`));
    } else {
      console.error(chalk.red(`Custom angle "${id}" not found`));
      process.exitCode = 1;
    }
  });

anglesCmd
  .command("export")
  .description("Export custom angles to an angle pack file")
  .requiredOption("--name <name>", "Pack name")
  .option("--angles <ids>", "Comma-separated angle IDs (defaults to all)")
  .option("-o, --output <file>", "Output file path", "angles.angle.json")
  .action((opts: { name: string; angles?: string; output: string }) => {
    try {
      const angleIds = opts.angles?.split(",").map((a) => a.trim());
      const pack = exportAnglePack(opts.name, angleIds);
      const { writeFileSync } = require("node:fs");
      writeFileSync(opts.output, JSON.stringify(pack, null, 2), "utf-8");
      console.log(chalk.green(`✓ Exported ${pack.angles.length} angle(s) to ${opts.output}`));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : "Export failed"));
      process.exitCode = 1;
    }
  });

anglesCmd
  .command("import <file>")
  .description("Import angles from an .angle.json pack file")
  .action((file: string) => {
    try {
      const { readFileSync } = require("node:fs");
      const raw = readFileSync(file, "utf-8");
      const pack = JSON.parse(raw);
      const result = importAnglePack(pack);
      console.log(chalk.green(`✓ Imported ${result.imported} angle(s)`));
      if (result.skipped.length > 0) {
        console.log(chalk.yellow(`  Skipped (already exist): ${result.skipped.join(", ")}`));
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : "Import failed"));
      process.exitCode = 1;
    }
  });

// ---- export command ----
program
  .command("export <sessionId>")
  .description("Export a session to Markdown, JSON, or GitHub Issue format")
  .option("-f, --format <format>", "Export format: markdown, json, github-issue", "markdown")
  .option("-o, --output <file>", "Output file path (defaults to stdout)")
  .action((sessionId: string, opts: { format: string; output?: string }) => {
    const sessions = listSessions();
    const session = sessions.find((s) => s.id.startsWith(sessionId));
    if (!session) {
      console.error(chalk.red(`Session "${sessionId}" not found`));
      process.exitCode = 1;
      return;
    }

    const data: ExportData = {
      subject: session.subject,
      investigation: session.investigation,
      angleResults: session.angleResults,
      synthesis: session.synthesis,
    };

    let output: string;
    let filename: string;
    switch (opts.format) {
      case "markdown": {
        const result = exportToMarkdown(data);
        output = result.content;
        filename = result.filename;
        break;
      }
      case "json": {
        const result = exportToJson(data);
        output = result.content;
        filename = result.filename;
        break;
      }
      case "github-issue": {
        const issue = generateGitHubIssueBody(data);
        output = `Title: ${issue.title}\nLabels: ${issue.labels.join(", ")}\n\n${issue.body}`;
        filename = `issue-${session.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.md`;
        break;
      }
      default:
        console.error(chalk.red(`Unknown format: ${opts.format}`));
        process.exitCode = 1;
        return;
    }

    if (opts.output) {
      const { writeFileSync } = require("node:fs");
      writeFileSync(opts.output, output, "utf-8");
      console.log(chalk.green(`✓ Exported to ${opts.output}`));
    } else {
      console.log(output);
    }
  });

// ---- history command ----
const historyCmd = program
  .command("history")
  .description("Browse and manage innovation session history");

historyCmd
  .command("list")
  .description("List recent sessions")
  .option("-n, --limit <n>", "Number of sessions to show", "10")
  .option("--search <query>", "Search by subject or content")
  .option("--tag <tag>", "Filter by tag")
  .action((opts: { limit: string; search?: string; tag?: string }) => {
    const sessions = querySessions({
      search: opts.search,
      tags: opts.tag ? [opts.tag] : undefined,
      limit: parseInt(opts.limit, 10),
    });

    if (sessions.length === 0) {
      console.log(chalk.dim("No sessions found."));
      return;
    }

    console.log(chalk.bold("\n📚 Session History\n"));
    for (const s of sessions) {
      const date = new Date(s.createdAt).toLocaleDateString();
      const angleCount = s.angleResults.length;
      const tags = s.tags.length > 0 ? chalk.cyan(` [${s.tags.join(", ")}]`) : "";
      console.log(`  ${chalk.dim(s.id.slice(0, 8))} ${chalk.bold(s.subject)} ${chalk.dim(date)} ${chalk.dim(`(${angleCount} angles)`)}${tags}`);
    }
    console.log(chalk.dim(`\nShowing ${sessions.length} session(s). Use 'innovator history show <id>' for details.`));
  });

historyCmd.action(() => {
  historyCmd.commands.find((c) => c.name() === "list")?.parse([], { from: "user" });
});

historyCmd
  .command("show <id>")
  .description("Show details of a session")
  .action((id: string) => {
    const sessions = listSessions();
    const session = sessions.find((s) => s.id.startsWith(id));
    if (!session) {
      console.error(chalk.red(`Session "${id}" not found`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.bold(`\n📋 Session: ${session.subject}\n`));
    console.log(`  ${chalk.dim("ID:")} ${session.id}`);
    console.log(`  ${chalk.dim("Created:")} ${session.createdAt}`);
    console.log(`  ${chalk.dim("Tags:")} ${session.tags.join(", ") || "none"}`);
    if (session.notes) console.log(`  ${chalk.dim("Notes:")} ${session.notes}`);

    if (session.investigation) {
      console.log(`\n${chalk.bold.blue("Summary:")}`);
      console.log(`  ${stripAnsi(session.investigation.summary)}`);
    }

    for (const angle of session.angleResults) {
      console.log(`\n${chalk.bold(stripAnsi(angle.angleName))} (${angle.ideas.length} ideas)`);
      for (const idea of angle.ideas) {
        console.log(`  ${chalk.cyan("•")} ${stripAnsi(idea.title)}`);
      }
    }

    if (session.synthesis) {
      console.log(`\n${chalk.bold.magenta("Recommendation:")}`);
      console.log(`  ${stripAnsi(session.synthesis.recommendation)}`);
    }
  });

historyCmd
  .command("tag <id> <tags...>")
  .description("Add tags to a session")
  .action((id: string, tags: string[]) => {
    const sessions = listSessions();
    const session = sessions.find((s) => s.id.startsWith(id));
    if (!session) {
      console.error(chalk.red(`Session "${id}" not found`));
      process.exitCode = 1;
      return;
    }
    const newTags = [...new Set([...session.tags, ...tags])];
    updateSession(session.id, { tags: newTags });
    console.log(chalk.green(`✓ Tags updated: ${newTags.join(", ")}`));
  });

historyCmd
  .command("delete <id>")
  .description("Delete a session")
  .action((id: string) => {
    const sessions = listSessions();
    const session = sessions.find((s) => s.id.startsWith(id));
    if (!session) {
      console.error(chalk.red(`Session "${id}" not found`));
      process.exitCode = 1;
      return;
    }
    deleteSession(session.id);
    console.log(chalk.green(`✓ Session deleted`));
  });

// ---- presets command ----
const presetsCmd = program
  .command("presets")
  .description("Browse and use domain presets");

presetsCmd
  .command("list")
  .description("List all available presets")
  .action(() => {
    const presets = getPresets();
    console.log(chalk.bold("\n📋 Available Presets\n"));
    for (const preset of presets) {
      console.log(`  ${preset.icon} ${chalk.bold(preset.name)} ${chalk.dim(`(${preset.category})`)}`);
      console.log(`     ${chalk.dim(preset.description)}`);
      console.log(`     ${chalk.cyan("Angles:")} ${preset.selectedAngles.join(", ")}`);
      console.log(`     ${chalk.dim("Try:")} innovator presets run ${preset.id} "${preset.suggestedSubject}"\n`);
    }
  });

presetsCmd.action(() => {
  presetsCmd.commands.find((c) => c.name() === "list")?.parse([], { from: "user" });
});

presetsCmd
  .command("run <presetId> <subject>")
  .description("Run the auto pipeline with a preset's configuration")
  .option("-m, --model <model>", "LLM model to use")
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .action(async (presetId: string, subject: string, opts: { model?: string }) => {
    const preset = getPresetById(presetId);
    if (!preset) {
      console.error(chalk.red(`Preset "${presetId}" not found`));
      const presets = getPresets();
      console.log(chalk.dim(`Available: ${presets.map((p) => p.id).join(", ")}`));
      process.exitCode = 1;
      return;
    }
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    // Handle --file or --url input
    let enrichedSubject = subject;
    if (opts.file || opts.url) {
      const source = opts.file ?? opts.url!;
      const extractSpinner = ora(`Extracting content from ${source}...`).start();
      try {
        const extracted = await extractContent(source);
        enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
        extractSpinner.succeed(`Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`);
      } catch (err) {
        extractSpinner.fail("Content extraction failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
        return;
      }
    }


    console.log(chalk.bold(`\n${preset.icon} Using preset: ${preset.name}`));
    console.log(chalk.dim(preset.description));
    console.log(chalk.dim(`Angles: ${preset.selectedAngles.join(", ")}\n`));

    const spinner = ora("Starting pipeline with preset...").start();
    const controller = new AbortController();
    commandCleanup = async () => controller.abort();

    try {
      const result = await runAutoPipeline(
        enrichedSubject,
        (progress) => {
          if (progress.stage === "investigating") spinner.text = "🔍 Investigating subject...";
          else if (progress.stage === "generating") {
            spinner.text = `⚡ Generating (${progress.completedAngles.length}/${progress.totalAngles})...`;
          } else if (progress.stage === "synthesizing") spinner.text = "🧪 Synthesizing...";
        },
        opts.model,
        preset.selectedAngles,
        controller.signal
      );

      if (result.stage === "error") {
        spinner.fail("Pipeline failed");
        console.error(chalk.red(result.error ?? "Unknown error"));
        process.exitCode = 1;
        return;
      }

      spinner.succeed("Pipeline complete!\n");

      for (const angle of result.angleResults) {
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.blue(stripAnsi(angle.angleName)));
        for (const idea of angle.ideas) {
          console.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
          console.log(`  ${stripAnsi(idea.description)}`);
        }
      }

      if (result.synthesis) {
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.magenta("🏆 SYNTHESIS\n"));
        console.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
      }
    } catch (err) {
      spinner.fail("Preset run failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    } finally {
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

// ---- plugin command ----
const pluginCmd = program
  .command("plugin")
  .description("Manage innovator plugins");

pluginCmd
  .command("list")
  .description("List all registered plugins")
  .action(() => {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      console.log(chalk.dim("No plugins registered."));
      return;
    }
    console.log(chalk.bold("\n🔌 Registered Plugins\n"));
    for (const p of plugins) {
      console.log(`  ${chalk.bold(p.id)} (${p.type}) v${p.version}`);
      console.log(`     ${chalk.dim(p.description ?? "No description")}\n`);
    }
  });

pluginCmd
  .command("load <source>")
  .description("Load a plugin from a file path or npm package")
  .action(async (source: string) => {
    try {
      const plugin = await loadPlugin(source);
      console.log(chalk.green(`✓ Loaded plugin "${plugin.id}" (${plugin.type})`));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : "Failed to load plugin"));
      process.exitCode = 1;
    }
  });

pluginCmd
  .command("create <name>")
  .description("Scaffold a new plugin project")
  .option("--type <type>", "Plugin type: angle, exporter, or visualizer", "angle")
  .action((name: string, opts: { type: string }) => {
    const { mkdirSync, writeFileSync, existsSync } = require("node:fs");
    const dir = name;
    if (existsSync(dir)) {
      console.error(chalk.red(`Directory "${dir}" already exists`));
      process.exitCode = 1;
      return;
    }
    mkdirSync(dir, { recursive: true });
    mkdirSync(`${dir}/src`, { recursive: true });

    writeFileSync(
      `${dir}/package.json`,
      JSON.stringify(
        {
          name: `innovator-plugin-${name}`,
          version: "0.1.0",
          type: "module",
          main: "./src/index.ts",
          peerDependencies: { "@innovator/core": "*" },
          keywords: ["innovator-plugin", opts.type],
        },
        null,
        2
      ) + "\n"
    );

    const template =
      opts.type === "angle"
        ? `import type { AnglePlugin } from "@innovator/core";

const plugin: AnglePlugin = {
  id: "${name}",
  name: "${name}",
  version: "0.1.0",
  type: "angle",
  description: "A custom angle plugin",
  angles: [
    {
      id: "${name}-angle",
      name: "${name} Angle",
      description: "Describe what this angle does",
      promptTemplate: "You are an expert. Analyze {{subject}} using this context: {{investigation}}",
    },
  ],
};

export default plugin;
`
        : opts.type === "exporter"
          ? `import type { ExporterPlugin, ExportData } from "@innovator/core";

const plugin: ExporterPlugin = {
  id: "${name}",
  name: "${name}",
  version: "0.1.0",
  type: "exporter",
  description: "A custom exporter plugin",
  formats: [{ id: "custom", name: "Custom Format", extension: ".txt" }],
  async export(data: ExportData, format: string): Promise<string> {
    return JSON.stringify(data, null, 2);
  },
};

export default plugin;
`
          : `import type { VisualizerPlugin, ExportData } from "@innovator/core";

const plugin: VisualizerPlugin = {
  id: "${name}",
  name: "${name}",
  version: "0.1.0",
  type: "visualizer",
  description: "A custom visualizer plugin",
  async render(data: ExportData): Promise<string> {
    return "<div>Visualization</div>";
  },
};

export default plugin;
`;

    writeFileSync(`${dir}/src/index.ts`, template);
    writeFileSync(
      `${dir}/README.md`,
      `# innovator-plugin-${name}\n\nA ${opts.type} plugin for Innovator.\n\n## Usage\n\n\`\`\`bash\ninnovator plugin load ./${dir}\n\`\`\`\n`
    );

    console.log(chalk.green(`✓ Plugin scaffolded in ./${dir}/`));
    console.log(chalk.dim(`  Edit ${dir}/src/index.ts to customize your plugin.`));
  });

// ---- benchmark command ----
program
  .command("benchmark")
  .description("Compare innovation quality across models")
  .argument("<subject>", "The subject to benchmark")
  .requiredOption("--models <models>", "Comma-separated model IDs to compare")
  .option("--angles <angles>", "Comma-separated angle IDs (default: scamper,first-principles,cross-domain)")
  .option("--judge <model>", "Model to use as evaluator/judge")
  .option("-o, --output <file>", "Output report file path")
  .action(
    async (
      subject: string,
      opts: { models: string; angles?: string; judge?: string; output?: string }
    ) => {
      if (!validateSubjectWithLog(subject)) return;

      const models = opts.models.split(",").map((m) => m.trim());
      const angles = opts.angles
        ? (opts.angles.split(",").map((a) => a.trim()) as AngleId[])
        : undefined;

      console.log(chalk.bold(`\n📊 Benchmarking: "${subject}"`));
      console.log(chalk.dim(`Models: ${models.join(", ")}`));
      if (angles) console.log(chalk.dim(`Angles: ${angles.join(", ")}`));
      console.log();

      const spinner = ora("Running benchmark...").start();

      try {
        const report = await runBenchmark(
          subject,
          models,
          angles,
          opts.judge,
          (status) => {
            spinner.text = status;
          }
        );

        spinner.succeed("Benchmark complete!\n");

        // Display summary
        console.log(chalk.bold.blue("🏆 Results Summary\n"));
        console.log(`  Best Overall: ${chalk.bold.green(report.summary.bestOverall)}`);
        console.log(chalk.dim("\n  Ranking:"));
        for (const r of report.summary.ranking) {
          const bar = "█".repeat(Math.round(r.score));
          console.log(`    ${r.model.padEnd(25)} ${chalk.cyan(bar)} ${r.score}/10`);
        }

        console.log(chalk.dim("\n  Best by category:"));
        for (const [cat, model] of Object.entries(report.summary.bestByCategory)) {
          console.log(`    ${cat.padEnd(15)} → ${chalk.bold(model)}`);
        }

        // Save if output specified
        if (opts.output) {
          const md = benchmarkToMarkdown(report);
          const { writeFileSync } = require("node:fs");
          writeFileSync(opts.output, md, "utf-8");
          console.log(chalk.green(`\n✓ Report saved to ${opts.output}`));
        }
      } catch (err) {
        spinner.fail("Benchmark failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        await stopCopilotClient();
      }
    }
  );

// ---- config command ----
const configCmd = program
  .command("config")
  .description("Manage LLM provider configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("\n⚙️  Innovator Configuration\n"));
    console.log(chalk.dim("Default provider:"), chalk.bold(config.defaultProvider));
    if (config.providers) {
      console.log(chalk.dim("\nProviders:"));
      for (const [id, cfg] of Object.entries(config.providers)) {
        console.log(`  ${chalk.bold(id)}: ${cfg.enabled !== false ? chalk.green("enabled") : chalk.red("disabled")}`);
        if (cfg.baseUrl) console.log(`    ${chalk.dim("URL:")} ${cfg.baseUrl}`);
        if (cfg.defaultModel) console.log(`    ${chalk.dim("Model:")} ${cfg.defaultModel}`);
        if (cfg.apiKeyEnv) console.log(`    ${chalk.dim("API Key Env:")} ${cfg.apiKeyEnv}`);
      }
    }
    if (config.modelPreferences) {
      console.log(chalk.dim("\nModel preferences per stage:"));
      const prefs = config.modelPreferences;
      if (prefs.investigation) console.log(`  ${chalk.dim("Investigation:")} ${prefs.investigation}`);
      if (prefs.generation) console.log(`  ${chalk.dim("Generation:")} ${prefs.generation}`);
      if (prefs.synthesis) console.log(`  ${chalk.dim("Synthesis:")} ${prefs.synthesis}`);
    }
    console.log();
  });

configCmd
  .command("set-provider <provider>")
  .description("Set the default LLM provider (copilot, openai, anthropic, ollama)")
  .action((provider: string) => {
    const config = loadConfig();
    config.defaultProvider = provider;
    saveConfig(config);
    console.log(chalk.green(`✓ Default provider set to "${provider}"`));
  });

configCmd
  .command("set-model <stage> <model>")
  .description("Set the preferred model for a pipeline stage (investigation, generation, synthesis)")
  .action((stage: string, model: string) => {
    if (!["investigation", "generation", "synthesis"].includes(stage)) {
      console.error(chalk.red(`Invalid stage. Use: investigation, generation, or synthesis`));
      process.exitCode = 1;
      return;
    }
    const config = loadConfig();
    if (!config.modelPreferences) config.modelPreferences = {};
    (config.modelPreferences as Record<string, string>)[stage] = model;
    saveConfig(config);
    console.log(chalk.green(`✓ ${stage} model set to "${model}"`));
  });

configCmd
  .command("providers")
  .description("List available LLM providers")
  .action(() => {
    initializeProviders();
    const providers = listProviders();
    console.log(chalk.bold("\n🔌 Available Providers\n"));
    for (const p of providers) {
      console.log(`  ${chalk.bold(p.id.padEnd(15))} ${p.name}`);
    }
    console.log();
  });

configCmd.action(() => {
  configCmd.commands.find((c) => c.name() === "show")?.parse([], { from: "user" });
});

// ---- refine command (interactive REPL) ----
program
  .command("refine")
  .description("Start an interactive refinement session on a completed auto pipeline")
  .argument("<subject>", "The subject to innovate on and refine")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    const spinner = ora("Running pipeline before refinement...").start();
    const controller = new AbortController();
    commandCleanup = async () => controller.abort();

    try {
      const result = await runAutoPipeline(
        subject,
        (progress) => {
          if (progress.stage === "investigating") spinner.text = "🔍 Investigating...";
          else if (progress.stage === "generating")
            spinner.text = `⚡ Generating (${progress.completedAngles.length}/${progress.totalAngles})...`;
          else if (progress.stage === "synthesizing") spinner.text = "🧪 Synthesizing...";
        },
        opts.model,
        undefined,
        controller.signal
      );

      if (result.stage === "error") {
        spinner.fail("Pipeline failed");
        console.error(chalk.red(result.error ?? "Unknown error"));
        process.exitCode = 1;
        return;
      }

      spinner.succeed("Pipeline complete! Starting conversation mode...\n");

      const ctx = createConversation({
        subject,
        investigation: result.investigation,
        angleResults: result.angleResults,
        synthesis: result.synthesis,
      });

      console.log(chalk.bold.blue("💬 Conversation Mode"));
      console.log(chalk.dim("Type your questions to refine ideas. Type 'exit' or 'quit' to end.\n"));

      if (result.synthesis) {
        console.log(chalk.dim("Top ideas:"));
        for (const idea of result.synthesis.topIdeas.slice(0, 5)) {
          console.log(chalk.dim(`  • ${idea.title}`));
        }
        console.log();
      }

      // Interactive REPL
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const askQuestion = (): Promise<string> =>
        new Promise((resolve) => {
          rl.question(chalk.cyan("You: "), (answer) => resolve(answer));
        });

      while (true) {
        const input = await askQuestion();
        if (!input.trim()) continue;
        if (input.trim().toLowerCase() === "exit" || input.trim().toLowerCase() === "quit") {
          console.log(chalk.dim("\nConversation ended."));
          rl.close();
          break;
        }

        const refineSpinner = ora("Thinking...").start();
        try {
          const response = await refineConversation(
            ctx.sessionId,
            input.trim(),
            undefined,
            opts.model
          );
          refineSpinner.stop();

          console.log(chalk.green("\nAssistant: ") + stripAnsi(response.response));

          if (response.updatedIdeas && response.updatedIdeas.length > 0) {
            console.log(chalk.bold("\n📝 Updated Ideas:"));
            for (const idea of response.updatedIdeas) {
              console.log(`  ${chalk.cyan("•")} ${chalk.bold(stripAnsi(idea.title))}`);
              console.log(`    ${stripAnsi(idea.description)}`);
            }
          }

          if (response.suggestions && response.suggestions.length > 0) {
            console.log(chalk.dim("\nSuggested follow-ups:"));
            for (const s of response.suggestions) {
              console.log(chalk.dim(`  → ${stripAnsi(s)}`));
            }
          }
          console.log();
        } catch (err) {
          refineSpinner.fail("Refinement failed");
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        }
      }
    } catch (err) {
      spinner.fail("Refine mode failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    } finally {
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

program.parse();
