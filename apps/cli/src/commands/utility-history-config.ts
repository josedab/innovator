import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  runAutoPipeline,
  ANGLES,
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
  querySessions,
  deleteSession,
  updateSession,
  exportToMarkdown,
  exportToJson,
  generateGitHubIssueBody,
  extractContent,
  runBenchmark,
  benchmarkToMarkdown,
  submitFeedback,
  getFeedbackSummary,
  getOfflineStatus,
  RECOMMENDED_MODELS,
} from "@innovator/core";
import { listProviders, loadConfig, saveConfig } from "@innovator/core/providers";
import type { AngleId, CustomAngle, ExportData } from "@innovator/core";
import type { CliContext } from "../cli-context.js";
import { createCommandHelpers } from "../command-helpers.js";
import { stripAnsi } from "../utils.js";

export function registerUtilityHistoryConfigCommands(program: Command, context: CliContext): void {
  const { validateSubjectWithLog, validateModelWithLog } = createCommandHelpers(context);

  // ---- feedback command ----
  // Collects and displays user quality feedback on generated ideas,
  // used to compute per-angle quality scores and improve future output.
  const feedbackCmd = program
    .command("feedback")
    .description("View and manage idea quality feedback");

  feedbackCmd
    .command("summary")
    .description("Show per-angle quality scores from collected feedback")
    /** Handler: display per-angle quality scores from collected feedback. */
    .action(() => {
      const summary = getFeedbackSummary();
      if (summary.totalFeedback === 0) {
        context.output.log(
          chalk.dim("No feedback collected yet. Use --rate with auto/innovate to rate ideas.")
        );
        return;
      }
      context.output.log(chalk.bold(`\n📊 Feedback Summary (${summary.totalFeedback} ratings)\n`));
      for (const score of summary.angleScores) {
        const bar =
          score.qualityScore >= 0.7
            ? chalk.green("■")
            : score.qualityScore >= 0.4
              ? chalk.yellow("■")
              : chalk.red("■");
        const trendIcon =
          score.recentTrend === "improving"
            ? "📈"
            : score.recentTrend === "declining"
              ? "📉"
              : "➡️";
        context.output.log(
          `  ${bar} ${chalk.bold(score.angleId)} — ${Math.round(score.qualityScore * 100)}% positive (${score.thumbsUp}👍 ${score.thumbsDown}👎) ${trendIcon}`
        );
        if (score.commonComplaints.length > 0) {
          context.output.log(
            chalk.dim(`    Complaints: ${score.commonComplaints.slice(0, 2).join("; ")}`)
          );
        }
      }
      if (summary.bestAngle)
        context.output.log(chalk.green(`\n  Best angle: ${summary.bestAngle}`));
      if (summary.worstAngle && summary.worstAngle !== summary.bestAngle)
        context.output.log(chalk.red(`  Needs improvement: ${summary.worstAngle}`));
      context.output.log();
    });

  feedbackCmd
    .command("rate")
    .description("Rate an idea from a session")
    .argument("<angleId>", "Angle ID the idea belongs to")
    .argument("<rating>", "Rating: up or down")
    .option("--idea <title>", "Idea title to rate", "general")
    .option("--comment <text>", "Optional comment on why")
    .option("--session <id>", "Session ID")
    /** Handler: record a thumbs-up/down rating for an idea. */
    .action(
      (
        angleId: string,
        rating: string,
        opts: { idea: string; comment?: string; session?: string }
      ) => {
        if (rating !== "up" && rating !== "down") {
          context.output.error(chalk.red("Rating must be 'up' or 'down'"));
          process.exitCode = 1;
          return;
        }
        const id = submitFeedback({
          angleId,
          rating: rating as "up" | "down",
          ideaTitle: opts.idea,
          comment: opts.comment,
          sessionId: opts.session,
        });
        context.output.log(chalk.green(`✅ Feedback recorded (${id.slice(0, 8)})`));
      }
    );

  // ---- angles command (utility) ----
  // Manages innovation angles: list built-in + custom angles, create/remove
  // custom angles, and export/import angle packs.
  const anglesCmd = program.command("angles").description("List and manage innovation angles");

  anglesCmd
    .command("list")
    .description("List all available innovation angles (built-in and custom)")
    /** Handler: list all built-in and custom innovation angles. */
    .action(() => {
      context.output.log(chalk.bold("\n💡 Built-in Innovation Angles\n"));
      for (const angle of ANGLES) {
        context.output.log(`  ${angle.icon} ${chalk.bold(angle.id.padEnd(20))} ${angle.name}`);
        context.output.log(`     ${chalk.dim(angle.shortDescription)}\n`);
      }

      const custom = loadCustomAngles();
      if (custom.length > 0) {
        context.output.log(chalk.bold("🎨 Custom Angles\n"));
        for (const angle of custom) {
          context.output.log(
            `  ${angle.icon ?? "🔧"} ${chalk.bold(angle.id.padEnd(20))} ${angle.name}`
          );
          context.output.log(`     ${chalk.dim(angle.description)}\n`);
        }
      }
    });

  // Default action: just listing (backwards compat)
  /** Default handler: delegates to the 'list' subcommand. */
  anglesCmd.action(() => {
    anglesCmd.commands.find((c) => c.name() === "list")?.parse([], { from: "user" });
  });

  anglesCmd
    .command("create")
    .description("Create a new custom innovation angle")
    .requiredOption("--id <id>", "Unique angle identifier (lowercase, hyphens)")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--description <desc>", "Short description of the angle")
    .requiredOption(
      "--template <template>",
      "Prompt template with {{subject}} and {{investigation}} placeholders"
    )
    .option("--icon <icon>", "Emoji icon", "🔧")
    .option("--author <author>", "Author name")
    .option("--tags <tags>", "Comma-separated tags")
    /** Handler: create and persist a new custom angle definition. */
    .action(
      (opts: {
        id: string;
        name: string;
        description: string;
        template: string;
        icon: string;
        author?: string;
        tags?: string;
      }) => {
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
          context.output.log(chalk.green(`✓ Custom angle "${opts.id}" created successfully`));
        } catch (err) {
          context.output.error(
            chalk.red(err instanceof Error ? err.message : "Failed to create angle")
          );
          process.exitCode = 1;
        }
      }
    );

  anglesCmd
    .command("remove <id>")
    .description("Remove a custom angle")
    /** Handler: remove a custom angle by ID. */
    .action((id: string) => {
      if (removeCustomAngle(id)) {
        context.output.log(chalk.green(`✓ Custom angle "${id}" removed`));
      } else {
        context.output.error(chalk.red(`Custom angle "${id}" not found`));
        process.exitCode = 1;
      }
    });

  anglesCmd
    .command("export")
    .description("Export custom angles to an angle pack file")
    .requiredOption("--name <name>", "Pack name")
    .option("--angles <ids>", "Comma-separated angle IDs (defaults to all)")
    .option("-o, --output <file>", "Output file path", "angles.angle.json")
    /** Handler: export custom angles to an angle-pack JSON file. */
    .action((opts: { name: string; angles?: string; output: string }) => {
      try {
        const angleIds = opts.angles?.split(",").map((a) => a.trim());
        const pack = exportAnglePack(opts.name, angleIds);
        writeFileSync(opts.output, JSON.stringify(pack, null, 2), "utf-8");
        context.output.log(
          chalk.green(`✓ Exported ${pack.angles.length} angle(s) to ${opts.output}`)
        );
      } catch (err) {
        context.output.error(chalk.red(err instanceof Error ? err.message : "Export failed"));
        process.exitCode = 1;
      }
    });

  anglesCmd
    .command("import <file>")
    .description("Import angles from an .angle.json pack file")
    /** Handler: import angles from an angle-pack file. */
    .action((file: string) => {
      try {
        const raw = readFileSync(file, "utf-8");
        const pack = JSON.parse(raw);
        const result = importAnglePack(pack);
        context.output.log(chalk.green(`✓ Imported ${result.imported} angle(s)`));
        if (result.skipped.length > 0) {
          context.output.log(
            chalk.yellow(`  Skipped (already exist): ${result.skipped.join(", ")}`)
          );
        }
      } catch (err) {
        context.output.error(chalk.red(err instanceof Error ? err.message : "Import failed"));
        process.exitCode = 1;
      }
    });

  // ---- export command ----
  // Exports a saved session to Markdown, JSON, or GitHub Issue body format.
  // Supports writing to a file or stdout.
  program
    .command("export <sessionId>")
    .description("Export a session to Markdown, JSON, or GitHub Issue format")
    .option("-f, --format <format>", "Export format: markdown, json, github-issue", "markdown")
    .option("-o, --output <file>", "Output file path (defaults to stdout)")
    /** Handler: export a saved session to Markdown, JSON, or GitHub Issue format. */
    .action((sessionId: string, opts: { format: string; output?: string }) => {
      const sessions = listSessions();
      const session = sessions.find((s) => s.id.startsWith(sessionId));
      if (!session) {
        context.output.error(chalk.red(`Session "${sessionId}" not found`));
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
      let _filename: string;
      switch (opts.format) {
        case "markdown": {
          const result = exportToMarkdown(data);
          output = result.content;
          _filename = result.filename;
          break;
        }
        case "json": {
          const result = exportToJson(data);
          output = result.content;
          _filename = result.filename;
          break;
        }
        case "github-issue": {
          const issue = generateGitHubIssueBody(data);
          output = `Title: ${issue.title}\nLabels: ${issue.labels.join(", ")}\n\n${issue.body}`;
          _filename = `issue-${session.subject
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 30)}.md`;
          break;
        }
        default:
          context.output.error(chalk.red(`Unknown format: ${opts.format}`));
          process.exitCode = 1;
          return;
      }

      if (opts.output) {
        writeFileSync(opts.output, output, "utf-8");
        context.output.log(chalk.green(`✓ Exported to ${opts.output}`));
      } else {
        context.output.log(output);
      }
    });

  // ---- history command ----
  // Browse, search, tag, and delete past innovation session history.
  const historyCmd = program
    .command("history")
    .description("Browse and manage innovation session history");

  historyCmd
    .command("list")
    .description("List recent sessions")
    .option("-n, --limit <n>", "Number of sessions to show", "10")
    .option("--search <query>", "Search by subject or content")
    .option("--tag <tag>", "Filter by tag")
    /** Handler: list recent sessions with optional search and tag filters. */
    .action((opts: { limit: string; search?: string; tag?: string }) => {
      const sessions = querySessions({
        search: opts.search,
        tags: opts.tag ? [opts.tag] : undefined,
        limit: parseInt(opts.limit, 10),
      });

      if (sessions.length === 0) {
        context.output.log(chalk.dim("No sessions found."));
        return;
      }

      context.output.log(chalk.bold("\n📚 Session History\n"));
      for (const s of sessions) {
        const date = new Date(s.createdAt).toLocaleDateString();
        const angleCount = s.angleResults.length;
        const tags = s.tags.length > 0 ? chalk.cyan(` [${s.tags.join(", ")}]`) : "";
        context.output.log(
          `  ${chalk.dim(s.id.slice(0, 8))} ${chalk.bold(s.subject)} ${chalk.dim(date)} ${chalk.dim(`(${angleCount} angles)`)}${tags}`
        );
      }
      context.output.log(
        chalk.dim(
          `\nShowing ${sessions.length} session(s). Use 'innovator history show <id>' for details.`
        )
      );
    });

  /** Handler: default action — delegates to the `list` subcommand. */
  historyCmd.action(() => {
    historyCmd.commands.find((c) => c.name() === "list")?.parse([], { from: "user" });
  });

  historyCmd
    .command("show <id>")
    .description("Show details of a session")
    /** Handler: display detailed information about a specific session. */
    .action((id: string) => {
      const sessions = listSessions();
      const session = sessions.find((s) => s.id.startsWith(id));
      if (!session) {
        context.output.error(chalk.red(`Session "${id}" not found`));
        process.exitCode = 1;
        return;
      }

      context.output.log(chalk.bold(`\n📋 Session: ${session.subject}\n`));
      context.output.log(`  ${chalk.dim("ID:")} ${session.id}`);
      context.output.log(`  ${chalk.dim("Created:")} ${session.createdAt}`);
      context.output.log(`  ${chalk.dim("Tags:")} ${session.tags.join(", ") || "none"}`);
      if (session.notes) context.output.log(`  ${chalk.dim("Notes:")} ${session.notes}`);

      if (session.investigation) {
        context.output.log(`\n${chalk.bold.blue("Summary:")}`);
        context.output.log(`  ${stripAnsi(session.investigation.summary)}`);
      }

      for (const angle of session.angleResults) {
        context.output.log(
          `\n${chalk.bold(stripAnsi(angle.angleName))} (${angle.ideas.length} ideas)`
        );
        for (const idea of angle.ideas) {
          context.output.log(`  ${chalk.cyan("•")} ${stripAnsi(idea.title)}`);
        }
      }

      if (session.synthesis) {
        context.output.log(`\n${chalk.bold.magenta("Recommendation:")}`);
        context.output.log(`  ${stripAnsi(session.synthesis.recommendation)}`);
      }
    });

  historyCmd
    .command("tag <id> <tags...>")
    .description("Add tags to a session")
    /** Handler: add tags to an existing session. */
    .action((id: string, tags: string[]) => {
      const sessions = listSessions();
      const session = sessions.find((s) => s.id.startsWith(id));
      if (!session) {
        context.output.error(chalk.red(`Session "${id}" not found`));
        process.exitCode = 1;
        return;
      }
      const newTags = [...new Set([...session.tags, ...tags])];
      updateSession(session.id, { tags: newTags });
      context.output.log(chalk.green(`✓ Tags updated: ${newTags.join(", ")}`));
    });

  historyCmd
    .command("delete <id>")
    .description("Delete a session")
    /** Handler: permanently delete a session by ID. */
    .action((id: string) => {
      const sessions = listSessions();
      const session = sessions.find((s) => s.id.startsWith(id));
      if (!session) {
        context.output.error(chalk.red(`Session "${id}" not found`));
        process.exitCode = 1;
        return;
      }
      deleteSession(session.id);
      context.output.log(chalk.green(`✓ Session deleted`));
    });

  // ---- presets command ----
  // Browse and execute domain-specific presets that pre-configure subjects,
  // angles, and pipeline settings for common innovation scenarios.
  const presetsCmd = program.command("presets").description("Browse and use domain presets");

  presetsCmd
    .command("list")
    .description("List all available presets")
    /** Handler: list all available domain presets with suggested subjects. */
    .action(() => {
      const presets = getPresets();
      context.output.log(chalk.bold("\n📋 Available Presets\n"));
      for (const preset of presets) {
        context.output.log(
          `  ${preset.icon} ${chalk.bold(preset.name)} ${chalk.dim(`(${preset.category})`)}`
        );
        context.output.log(`     ${chalk.dim(preset.description)}`);
        context.output.log(`     ${chalk.cyan("Angles:")} ${preset.selectedAngles.join(", ")}`);
        context.output.log(
          `     ${chalk.dim("Try:")} innovator presets run ${preset.id} "${preset.suggestedSubject}"\n`
        );
      }
    });

  /** Handler: default action — delegates to the `list` subcommand. */
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
    /** Handler: run the auto pipeline using a preset's angle configuration. */
    .action(
      async (
        presetId: string,
        subject: string,
        opts: { model?: string; score?: boolean; file?: string; url?: string }
      ) => {
        const preset = getPresetById(presetId);
        if (!preset) {
          context.output.error(chalk.red(`Preset "${presetId}" not found`));
          const presets = getPresets();
          context.output.log(chalk.dim(`Available: ${presets.map((p) => p.id).join(", ")}`));
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
            extractSpinner.succeed(
              `Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`
            );
          } catch (err) {
            extractSpinner.fail("Content extraction failed");
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exitCode = 1;
            return;
          }
        }

        context.output.log(chalk.bold(`\n${preset.icon} Using preset: ${preset.name}`));
        context.output.log(chalk.dim(preset.description));
        context.output.log(chalk.dim(`Angles: ${preset.selectedAngles.join(", ")}\n`));

        const spinner = ora("Starting pipeline with preset...").start();
        const controller = new AbortController();
        context.commandCleanup = async () => controller.abort();

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
            context.output.error(chalk.red(result.error ?? "Unknown error"));
            process.exitCode = 1;
            return;
          }

          spinner.succeed("Pipeline complete!\n");

          for (const angle of result.angleResults) {
            context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
            context.output.log(chalk.bold.blue(stripAnsi(angle.angleName)));
            for (const idea of angle.ideas) {
              context.output.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
              context.output.log(`  ${stripAnsi(idea.description)}`);
            }
          }

          if (result.synthesis) {
            context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
            context.output.log(chalk.bold.magenta("🏆 SYNTHESIS\n"));
            context.output.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
          }
        } catch (err) {
          spinner.fail("Preset run failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        } finally {
          context.commandCleanup = null;
        }
      }
    );

  // ---- plugin command ----
  // Manages innovator plugins: list registered plugins, load from local path
  // or npm, and scaffold new plugin projects.
  const pluginCmd = program.command("plugin").description("Manage innovator plugins");

  pluginCmd
    .command("list")
    .description("List all registered plugins")
    /** Handler: list all registered plugins with type and version. */
    .action(() => {
      const plugins = listPlugins();
      if (plugins.length === 0) {
        context.output.log(chalk.dim("No plugins registered."));
        return;
      }
      context.output.log(chalk.bold("\n🔌 Registered Plugins\n"));
      for (const p of plugins) {
        context.output.log(`  ${chalk.bold(p.id)} (${p.type}) v${p.version}`);
        context.output.log(`     ${chalk.dim(p.description ?? "No description")}\n`);
      }
    });

  pluginCmd
    .command("load <source>")
    .description("Load a plugin from a file path or npm package")
    /** Handler: dynamically load a plugin from a file path or npm package. */
    .action(async (source: string) => {
      try {
        const plugin = await loadPlugin(source);
        context.output.log(chalk.green(`✓ Loaded plugin "${plugin.id}" (${plugin.type})`));
      } catch (err) {
        context.output.error(
          chalk.red(err instanceof Error ? err.message : "Failed to load plugin")
        );
        process.exitCode = 1;
      }
    });

  pluginCmd
    .command("create <name>")
    .description("Scaffold a new plugin project")
    .option("--type <type>", "Plugin type: angle, exporter, or visualizer", "angle")
    /** Handler: scaffold a new plugin project directory. */
    .action((name: string, opts: { type: string }) => {
      const dir = name;
      if (existsSync(dir)) {
        context.output.error(chalk.red(`Directory "${dir}" already exists`));
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

      context.output.log(chalk.green(`✓ Plugin scaffolded in ./${dir}/`));
      context.output.log(chalk.dim(`  Edit ${dir}/src/index.ts to customize your plugin.`));
    });

  // ---- benchmark command ----
  // Compares innovation output quality across multiple LLM models by running
  // the same subject through each model and evaluating the results.
  program
    .command("benchmark")
    .description("Compare innovation quality across models")
    .argument("<subject>", "The subject to benchmark")
    .requiredOption("--models <models>", "Comma-separated model IDs to compare")
    .option(
      "--angles <angles>",
      "Comma-separated angle IDs (default: scamper,first-principles,cross-domain)"
    )
    .option("--judge <model>", "Model to use as evaluator/judge")
    .option("-o, --output <file>", "Output report file path")
    /** Handler: run innovation benchmark across multiple models and display results. */
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

        context.output.log(chalk.bold(`\n📊 Benchmarking: "${subject}"`));
        context.output.log(chalk.dim(`Models: ${models.join(", ")}`));
        if (angles) context.output.log(chalk.dim(`Angles: ${angles.join(", ")}`));
        context.output.log();

        const spinner = ora("Running benchmark...").start();

        try {
          const report = await runBenchmark(subject, models, angles, opts.judge, (status) => {
            spinner.text = status;
          });

          spinner.succeed("Benchmark complete!\n");

          // Display summary
          context.output.log(chalk.bold.blue("🏆 Results Summary\n"));
          context.output.log(`  Best Overall: ${chalk.bold.green(report.summary.bestOverall)}`);
          context.output.log(chalk.dim("\n  Ranking:"));
          for (const r of report.summary.ranking) {
            const bar = "█".repeat(Math.round(r.score));
            context.output.log(`    ${r.model.padEnd(25)} ${chalk.cyan(bar)} ${r.score}/10`);
          }

          context.output.log(chalk.dim("\n  Best by category:"));
          for (const [cat, model] of Object.entries(report.summary.bestByCategory)) {
            context.output.log(`    ${cat.padEnd(15)} → ${chalk.bold(model)}`);
          }

          // Save if output specified
          if (opts.output) {
            const md = benchmarkToMarkdown(report);
            writeFileSync(opts.output, md, "utf-8");
            context.output.log(chalk.green(`\n✓ Report saved to ${opts.output}`));
          }
        } catch (err) {
          spinner.fail("Benchmark failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- config command ----
  // Manages LLM provider configuration: show current settings, set active
  // provider, configure model assignments per pipeline stage, and set up
  // offline mode with Ollama.
  const configCmd = program.command("config").description("Manage LLM provider configuration");

  configCmd
    .command("show")
    .description("Show current configuration")
    /** Handler: display the current LLM provider configuration. */
    .action(() => {
      const config = loadConfig();
      context.output.log(chalk.bold("\n⚙️  Innovator Configuration\n"));
      context.output.log(chalk.dim("Default provider:"), chalk.bold(config.defaultProvider));
      if (config.providers) {
        context.output.log(chalk.dim("\nProviders:"));
        for (const [id, cfg] of Object.entries(config.providers)) {
          context.output.log(
            `  ${chalk.bold(id)}: ${cfg.enabled !== false ? chalk.green("enabled") : chalk.red("disabled")}`
          );
          if (cfg.baseUrl) context.output.log(`    ${chalk.dim("URL:")} ${cfg.baseUrl}`);
          if (cfg.defaultModel)
            context.output.log(`    ${chalk.dim("Model:")} ${cfg.defaultModel}`);
          if (cfg.apiKeyEnv)
            context.output.log(`    ${chalk.dim("API Key Env:")} ${cfg.apiKeyEnv}`);
        }
      }
      if (config.modelPreferences) {
        context.output.log(chalk.dim("\nModel preferences per stage:"));
        const prefs = config.modelPreferences;
        if (prefs.investigation)
          context.output.log(`  ${chalk.dim("Investigation:")} ${prefs.investigation}`);
        if (prefs.generation)
          context.output.log(`  ${chalk.dim("Generation:")} ${prefs.generation}`);
        if (prefs.synthesis) context.output.log(`  ${chalk.dim("Synthesis:")} ${prefs.synthesis}`);
      }
      context.output.log();
    });

  configCmd
    .command("set-provider <provider>")
    .description("Set the default LLM provider (copilot, openai, anthropic, ollama)")
    /** Handler: persist the default provider choice to config. */
    .action((provider: string) => {
      const config = loadConfig();
      config.defaultProvider = provider;
      saveConfig(config);
      context.output.log(chalk.green(`✓ Default provider set to "${provider}"`));
    });

  configCmd
    .command("set-model <stage> <model>")
    .description(
      "Set the preferred model for a pipeline stage (investigation, generation, synthesis)"
    )
    /** Handler: set the preferred LLM model for a specific pipeline stage. */
    .action((stage: string, model: string) => {
      if (!["investigation", "generation", "synthesis"].includes(stage)) {
        context.output.error(
          chalk.red(`Invalid stage. Use: investigation, generation, or synthesis`)
        );
        process.exitCode = 1;
        return;
      }
      const config = loadConfig();
      if (!config.modelPreferences) config.modelPreferences = {};
      (config.modelPreferences as Record<string, string>)[stage] = model;
      saveConfig(config);
      context.output.log(chalk.green(`✓ ${stage} model set to "${model}"`));
    });

  configCmd
    .command("providers")
    .description("List available LLM providers")
    /** Handler: initialize and display all registered LLM providers. */
    .action(() => {
      const providers = listProviders();
      context.output.log(chalk.bold("\n🔌 Available Providers\n"));
      for (const p of providers) {
        context.output.log(`  ${chalk.bold(p.id.padEnd(15))} ${p.name}`);
      }
      context.output.log();
    });

  /** Handler: default action — delegates to the `show` subcommand. */
  configCmd.action(() => {
    configCmd.commands.find((c) => c.name() === "show")?.parse([], { from: "user" });
  });

  configCmd
    .command("setup-offline")
    .description("Configure Ollama for offline / local-first innovation")
    /** Handler: detect and configure a local Ollama instance for offline use. */
    .action(async () => {
      context.output.log(chalk.bold("\n🔌 Offline Mode Setup\n"));

      const spinner = ora("Detecting Ollama instance...").start();
      const status = await getOfflineStatus();

      if (!status.ollama.available) {
        spinner.fail("Ollama not detected");
        context.output.log(chalk.dim("\nTo install Ollama:"));
        context.output.log(chalk.dim("  macOS: brew install ollama"));
        context.output.log(chalk.dim("  Linux: curl -fsSL https://ollama.ai/install.sh | sh"));
        context.output.log(chalk.dim("  Then start it: ollama serve\n"));
        context.output.log(chalk.dim("After Ollama is running, pull a model:"));
        context.output.log(chalk.dim("  ollama pull llama3:8b    (balanced, 8GB RAM)"));
        context.output.log(chalk.dim("  ollama pull mistral:7b   (fast, 8GB RAM)"));
        return;
      }

      spinner.succeed(`Ollama detected at ${status.ollama.baseUrl}`);
      context.output.log(
        chalk.dim(`  Available models: ${status.ollama.models.join(", ") || "none"}`)
      );

      if (status.ollama.models.length === 0) {
        context.output.log(chalk.yellow("\n⚠️  No models found. Pull a model first:"));
        context.output.log(chalk.dim("  ollama pull llama3:8b"));
        return;
      }

      context.output.log(chalk.bold("\n📋 Recommended Models:\n"));
      for (const rec of RECOMMENDED_MODELS) {
        const installed = status.ollama.models.some((m) => m.startsWith(rec.id.split(":")[0]));
        const indicator = installed ? chalk.green("✓") : chalk.dim("○");
        context.output.log(
          `  ${indicator} ${chalk.bold(rec.id.padEnd(20))} [${rec.useCase}] ${rec.description}`
        );
        context.output.log(chalk.dim(`    Min RAM: ${rec.minRamGb}GB`));
      }

      // Auto-configure if models are available
      const config = loadConfig();
      if (!config.providers) config.providers = {};
      config.providers.ollama = { enabled: true, baseUrl: status.ollama.baseUrl };

      if (status.recommendedModel) {
        config.providers.ollama.defaultModel = status.recommendedModel.id;
        context.output.log(
          chalk.green(`\n✓ Configured Ollama with model: ${status.recommendedModel.id}`)
        );
      }

      saveConfig(config);
      context.output.log(chalk.green("✓ Ollama provider enabled in config"));
      context.output.log(chalk.dim("\nTo use offline mode:"));
      context.output.log(chalk.dim("  innovator config set-provider ollama"));
      context.output.log(chalk.dim("  innovator auto 'your subject'\n"));

      if (status.isOnline) {
        context.output.log(
          chalk.dim("Network: 🟢 Online (will auto-switch to Ollama when offline)")
        );
      } else {
        context.output.log(chalk.yellow("Network: 🔴 Offline (using Ollama for all requests)"));
      }
    });
}
