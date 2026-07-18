import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  runAutoPipeline,
  createConversation,
  refineConversation,
  findSerendipitousMemoryConnections,
} from "@innovator/core";
import type { CliContext } from "../cli-context.js";
import { createCommandHelpers } from "../command-helpers.js";
import { stripAnsi } from "../utils.js";

export function registerCollaborationMonitoringCommands(
  program: Command,
  context: CliContext
): void {
  const { validateSubjectWithLog, validateModelWithLog } = createCommandHelpers(context);

  // ---- refine command (interactive REPL) ----
  // Starts a conversational refinement session where users iteratively
  // improve and explore innovation ideas through multi-turn dialogue.
  program
    .command("refine")
    .description("Start an interactive refinement session on a completed auto pipeline")
    .argument("<subject>", "The subject to innovate on and refine")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: run an interactive refinement conversation on pipeline results. */
    .action(async (subject: string, opts: { model?: string }) => {
      if (!validateSubjectWithLog(subject)) return;
      if (!validateModelWithLog(opts.model)) return;

      const spinner = ora("Running pipeline before refinement...").start();
      const controller = new AbortController();
      context.commandCleanup = async () => controller.abort();

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
          context.output.error(chalk.red(result.error ?? "Unknown error"));
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

        context.output.log(chalk.bold.blue("💬 Conversation Mode"));
        context.output.log(
          chalk.dim("Type your questions to refine ideas. Type 'exit' or 'quit' to end.\n")
        );

        if (result.synthesis) {
          context.output.log(chalk.dim("Top ideas:"));
          for (const idea of result.synthesis.topIdeas.slice(0, 5)) {
            context.output.log(chalk.dim(`  • ${idea.title}`));
          }
          context.output.log();
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
            context.output.log(chalk.dim("\nConversation ended."));
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

            context.output.log(chalk.green("\nAssistant: ") + stripAnsi(response.response));

            if (response.updatedIdeas && response.updatedIdeas.length > 0) {
              context.output.log(chalk.bold("\n📝 Updated Ideas:"));
              for (const idea of response.updatedIdeas) {
                context.output.log(`  ${chalk.cyan("•")} ${chalk.bold(stripAnsi(idea.title))}`);
                context.output.log(`    ${stripAnsi(idea.description)}`);
              }
            }

            if (response.suggestions && response.suggestions.length > 0) {
              context.output.log(chalk.dim("\nSuggested follow-ups:"));
              for (const s of response.suggestions) {
                context.output.log(chalk.dim(`  → ${stripAnsi(s)}`));
              }
            }
            context.output.log();
          } catch (err) {
            refineSpinner.fail("Refinement failed");
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          }
        }
      } catch (err) {
        spinner.fail("Refine mode failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        context.commandCleanup = null;
      }
    });

  // ---- connections command ----
  // Discovers serendipitous connections between past innovation sessions,
  // surfacing unexpected links and cross-pollination opportunities.
  program
    .command("connections")
    .description("Find serendipitous connections across past investigations")
    .option("--min-similarity <threshold>", "Minimum similarity threshold (0-1)", "0.3")
    .option("--max <count>", "Maximum connections to show", "10")
    .option("-m, --model <model>", "LLM model to use for explanations")
    /** Handler: discover unexpected connections across past investigations. */
    .action(async (opts: { minSimilarity?: string; max?: string; model?: string }) => {
      if (!validateModelWithLog(opts.model)) return;

      const minSim = parseFloat(opts.minSimilarity ?? "0.3");
      const maxConn = parseInt(opts.max ?? "10", 10);

      if (isNaN(minSim) || minSim < 0 || minSim > 1) {
        context.output.error(
          chalk.red("Invalid similarity threshold. Use a value between 0 and 1.")
        );
        process.exitCode = 1;
        return;
      }

      const spinner = ora("Analyzing past investigations for connections...").start();

      try {
        const result = await findSerendipitousMemoryConnections(minSim, maxConn, opts.model);
        spinner.succeed(
          `Found ${result.connections.length} connection(s) across ${result.totalSessionsAnalyzed} sessions\n`
        );

        if (result.connections.length === 0) {
          context.output.log(
            chalk.dim(
              "No serendipitous connections found. Run more investigations to build your knowledge base."
            )
          );
          return;
        }

        for (const conn of result.connections) {
          context.output.log(
            chalk.bold.magenta(`\n🔗 ${stripAnsi(conn.subjectA)} ↔ ${stripAnsi(conn.subjectB)}`)
          );
          context.output.log(
            chalk.dim(`   Similarity: ${(conn.similarityScore * 100).toFixed(0)}%`)
          );
          context.output.log(`   ${stripAnsi(conn.explanation)}`);

          if (conn.sharedPatterns.length > 0) {
            context.output.log(chalk.dim("   Shared patterns:"));
            for (const p of conn.sharedPatterns) {
              context.output.log(`     ${chalk.cyan("•")} ${stripAnsi(p)}`);
            }
          }
          if (conn.potentialInsight) {
            context.output.log(chalk.green(`   💡 ${stripAnsi(conn.potentialInsight)}`));
          }
        }
        context.output.log();
      } catch (err) {
        spinner.fail("Connection analysis failed");
        if (context.verbose) {
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        } else {
          context.output.error(chalk.red("Connection analysis failed. Use --verbose for details."));
        }
        process.exitCode = 1;
      }
    });

  // ── migrate ───────────────────────────────────────────────────────────
  // Migrates file-based data from ~/.innovator/ into a SQLite database
  // for improved query performance and data integrity.
  program
    .command("migrate")
    .description("Migrate file-based data (~/.innovator/) into a SQLite database")
    .option("--db <path>", "SQLite database file path", "~/.innovator/innovator.db")
    /** Handler: migrate file-based persistence data into a SQLite database. */
    .action(async (opts: { db: string }) => {
      const { createSQLiteStorage } = await import("@innovator/core/storage/sqlite");
      const { migrateFileDataToStorage } = await import("@innovator/core");
      const dbPath = opts.db.replace("~", process.env.HOME ?? "");
      const spinner = ora("Initializing SQLite database…").start();
      try {
        const storage = await createSQLiteStorage(dbPath);
        spinner.text = "Migrating data…";
        const result = await migrateFileDataToStorage(storage);
        await storage.close();
        spinner.succeed("Migration complete");
        context.output.log(
          chalk.green(
            `  Sessions: ${result.sessions}\n` +
              `  Workspaces: ${result.workspaces}\n` +
              `  Analytics events: ${result.analyticsEvents}\n` +
              `  Knowledge graph: ${result.knowledgeGraph ? "yes" : "no"}`
          )
        );
        if (result.errors.length > 0) {
          context.output.log(chalk.yellow(`  Errors (${result.errors.length}):`));
          for (const err of result.errors.slice(0, 10)) {
            context.output.log(chalk.yellow(`    - ${err}`));
          }
        }
      } catch (err) {
        spinner.fail(`Migration failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });

  // ── marketplace ──────────────────────────────────────────────────────
  // ---- marketplace command ----
  // Plugin marketplace: search, install, and publish innovator plugins.
  const marketplace = program.command("marketplace").description("Plugin marketplace commands");

  marketplace
    .command("search [query]")
    .description("Search the plugin marketplace")
    .option("--category <category>", "Filter by category")
    /** Handler: search the plugin marketplace with optional category filter. */
    .action(async (query: string | undefined, opts: { category?: string }) => {
      const { searchPlugins } = await import("@innovator/core");
      const results = searchPlugins({ query, category: opts.category as never });
      if (results.length === 0) {
        context.output.log(chalk.yellow("No plugins found."));
        return;
      }
      for (const p of results) {
        context.output.log(
          `  ${p.verified ? "✅" : "  "} ${chalk.bold(p.name)} ${chalk.dim(`v${p.version}`)} — ${p.description}`
        );
        context.output.log(
          `    ${chalk.dim(`by ${p.author.name} | ⬇ ${p.downloads} | ⭐ ${p.rating || "–"} | ${p.category}`)}`
        );
      }
    });

  marketplace
    .command("install <pluginId>")
    .description("Install a plugin from the marketplace")
    /** Handler: install a plugin by ID from the marketplace registry. */
    .action(async (pluginId: string) => {
      const { installMarketplacePlugin } = await import("@innovator/core");
      const result = installMarketplacePlugin(pluginId);
      if (result) {
        context.output.log(chalk.green(`✅ Installed ${result.name} v${result.version}`));
      } else {
        context.output.log(chalk.red(`Plugin ${pluginId} not found.`));
      }
    });

  marketplace
    .command("publish")
    .description("Publish a plugin to the marketplace")
    .requiredOption("--name <name>", "Plugin name")
    .requiredOption("--description <desc>", "Plugin description")
    .requiredOption("--category <category>", "Plugin category")
    .requiredOption("--source <source>", "npm package or git URL")
    .requiredOption("--version <version>", "Plugin version")
    .requiredOption("--author <author>", "Author name")
    /** Handler: publish a plugin to the marketplace registry. */
    .action(
      async (opts: {
        name: string;
        description: string;
        category: string;
        source: string;
        version: string;
        author: string;
      }) => {
        const { publishPlugin } = await import("@innovator/core");
        const plugin = publishPlugin({
          name: opts.name,
          description: opts.description,
          category: opts.category as never,
          source: opts.source,
          version: opts.version,
          author: { name: opts.author },
        });
        context.output.log(
          chalk.green(`✅ Published ${plugin.name} v${plugin.version} (${plugin.id})`)
        );
      }
    );

  // ── radar ────────────────────────────────────────────────────────────
  // Innovation Radar: watch subjects for landscape changes and receive
  // alerts when new developments or disruptions are detected.
  const radar = program
    .command("radar")
    .description("Innovation Radar — watch subjects for landscape changes");

  radar
    .command("watch <subject>")
    .description("Add a subject to the innovation radar")
    .option("--frequency <freq>", "Check frequency: daily, weekly, monthly", "weekly")
    .option("--webhook <url>", "Webhook URL for alerts")
    /** Handler: add a subject to the innovation radar for periodic monitoring. */
    .action(async (subject: string, opts: { frequency: string; webhook?: string }) => {
      const { createWatch } = await import("@innovator/core");
      const watch = createWatch({
        subject,
        frequency: opts.frequency as "daily" | "weekly" | "monthly",
        alertChannels: opts.webhook ? ["webhook"] : ["in-app"],
        webhookUrl: opts.webhook,
      });
      context.output.log(chalk.green(`✅ Watching "${subject}" (${opts.frequency})`));
      context.output.log(chalk.dim(`  ID: ${watch.id}`));
      context.output.log(chalk.dim(`  Next scan: ${watch.nextRunAt}`));
    });

  radar
    .command("list")
    .description("List watched subjects")
    /** Handler: display all currently watched innovation radar subjects. */
    .action(async () => {
      const { listWatches } = await import("@innovator/core");
      const watches = listWatches();
      if (watches.length === 0) {
        context.output.log(chalk.yellow("No watches configured."));
        return;
      }
      for (const w of watches) {
        const status = w.enabled ? chalk.green("●") : chalk.red("●");
        context.output.log(
          `  ${status} ${chalk.bold(w.subject)} — ${w.frequency} | Next: ${w.nextRunAt.split("T")[0]}`
        );
      }
    });

  // ── scaffold ─────────────────────────────────────────────────────────
  // Generates implementation scaffolding (project structure, boilerplate)
  // from an idea, supporting TypeScript, Python, Go, and Rust stacks.
  program
    .command("scaffold")
    .description("Generate implementation scaffolding from an idea")
    .requiredOption("--title <title>", "Idea title")
    .requiredOption("--description <desc>", "Idea description")
    .option("--impact <impact>", "Potential impact", "High impact innovation")
    .option("--stack <stack>", "Tech stack: typescript, python, go, rust", "typescript")
    .option("--name <name>", "Project name")
    /** Handler: scaffold a new project from an innovation idea. */
    .action(
      async (opts: {
        title: string;
        description: string;
        impact: string;
        stack: string;
        name?: string;
      }) => {
        const { generateScaffold, scaffoldToMarkdown } = await import("@innovator/core");
        const scaffold = generateScaffold({
          idea: {
            title: opts.title,
            description: opts.description,
            potentialImpact: opts.impact,
            implementationHint: "",
          },
          stack: opts.stack as "typescript" | "python" | "go" | "rust",
          projectName: opts.name,
        });
        context.output.log(scaffoldToMarkdown(scaffold));
      }
    );

  // ── telemetry ────────────────────────────────────────────────────────
  // Displays innovation pipeline telemetry: span counts, latency metrics,
  // quality trends, and cost summaries.
  program
    .command("telemetry")
    .description("View innovation pipeline telemetry and metrics")
    /** Handler: display pipeline telemetry including spans, latency, and cost. */
    .action(async () => {
      const {
        buildTelemetryDashboard,
        getSpans: _getSpans,
        getQualityTrends: _getQualityTrends,
      } = await import("@innovator/core");
      const dashboard = buildTelemetryDashboard();

      context.output.log(chalk.bold.blue("\n📊 INNOVATION TELEMETRY\n"));
      context.output.log(`  Pipelines run: ${dashboard.totalPipelines}`);
      context.output.log(`  Total spans:   ${dashboard.totalSpans}`);
      context.output.log(`  Quality trend: ${dashboard.qualityTrend.trend}\n`);

      if (Object.keys(dashboard.stageMetrics).length > 0) {
        context.output.log(chalk.bold("  Stage Metrics:"));
        context.output.log(
          chalk.dim(
            "  " +
              "Stage".padEnd(20) +
              "Count".padEnd(8) +
              "Avg Duration".padEnd(15) +
              "Tokens".padEnd(10) +
              "Cost".padEnd(10) +
              "Success"
          )
        );
        context.output.log(chalk.dim("  " + "─".repeat(75)));
        for (const [stage, m] of Object.entries(dashboard.stageMetrics)) {
          context.output.log(
            `  ${stage.padEnd(20)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${String(m.totalTokens).padEnd(10)}$${m.totalCostUsd.toFixed(4).padEnd(9)}${(m.successRate * 100).toFixed(0)}%`
          );
        }
        context.output.log();
      }

      if (Object.keys(dashboard.angleMetrics).length > 0) {
        context.output.log(chalk.bold("  Angle Performance:"));
        context.output.log(
          chalk.dim(
            "  " + "Angle".padEnd(25) + "Count".padEnd(8) + "Avg Duration".padEnd(15) + "Avg Ideas"
          )
        );
        context.output.log(chalk.dim("  " + "─".repeat(55)));
        for (const [angle, m] of Object.entries(dashboard.angleMetrics)) {
          context.output.log(
            `  ${angle.padEnd(25)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${m.avgIdeaCount}`
          );
        }
        context.output.log();
      }

      if (dashboard.recentSpans.length > 0) {
        context.output.log(chalk.bold("  Recent Spans (last 10):"));
        for (const span of dashboard.recentSpans.slice(-10)) {
          const statusIcon =
            span.status === "ok"
              ? chalk.green("✓")
              : span.status === "error"
                ? chalk.red("✗")
                : chalk.yellow("⋯");
          const dur = span.durationMs ? `${span.durationMs}ms` : "in progress";
          context.output.log(`  ${statusIcon} ${span.operationName.padEnd(30)} ${dur}`);
        }
      }

      if (dashboard.totalPipelines === 0 && dashboard.totalSpans === 0) {
        context.output.log(chalk.dim("  No telemetry data yet. Run some pipelines first.\n"));
      }
    });

  // ── context (RAG) ───────────────────────────────────────────────────
  // Manages knowledge sources for retrieval-augmented generation (RAG):
  // add connectors (GitHub, Confluence, Notion, local files), list, and sync.
  const contextCmd = program
    .command("context")
    .description("Manage knowledge sources for RAG context grounding");

  contextCmd
    .command("add")
    .description("Add a knowledge source connector")
    .requiredOption("--type <type>", "Connector type: github, confluence, notion, local-file")
    .requiredOption("--name <name>", "Connector name")
    .option("--repo <repo>", "GitHub repo (owner/repo)")
    .option("--path <path>", "Local file or directory path")
    .option("--url <url>", "Base URL (for Confluence)")
    .option("--space <space>", "Space key (for Confluence)")
    .option("--token <token>", "Auth token")
    /** Handler: register a knowledge source connector (GitHub, Confluence, local). */
    .action(
      async (opts: {
        type: string;
        name: string;
        repo?: string;
        path?: string;
        url?: string;
        space?: string;
        token?: string;
      }) => {
        const { registerConnector, ConnectorTypeSchema } = await import("@innovator/core");
        const typeParse = ConnectorTypeSchema.safeParse(opts.type);
        if (!typeParse.success) {
          context.output.error(
            chalk.red(
              `Invalid connector type: ${opts.type}. Use: github, confluence, notion, local-file`
            )
          );
          return;
        }
        const config: Record<string, string> = {};
        if (opts.repo) config.repo = opts.repo;
        if (opts.path) config.path = opts.path;
        if (opts.url) config.baseUrl = opts.url;
        if (opts.space) config.spaceKey = opts.space;
        if (opts.token) config.token = opts.token;

        const id = `${opts.type}-${Date.now()}`;
        registerConnector({
          id,
          type: typeParse.data,
          name: opts.name,
          enabled: true,
          syncIntervalMinutes: 60,
          config,
        });
        context.output.log(chalk.green(`✓ Registered connector: ${opts.name} (${id})`));
      }
    );

  contextCmd
    .command("list")
    .description("List registered knowledge source connectors")
    /** Handler: display all registered knowledge source connectors. */
    .action(async () => {
      const { listConnectors } = await import("@innovator/core");
      const connectors = listConnectors();
      if (connectors.length === 0) {
        context.output.log(
          chalk.dim("No connectors registered. Use `innovator context add` to add one.")
        );
        return;
      }
      context.output.log(chalk.bold.blue("\n📚 Knowledge Source Connectors\n"));
      for (const c of connectors) {
        const statusIcon =
          c.status.status === "connected"
            ? chalk.green("●")
            : c.status.status === "error"
              ? chalk.red("●")
              : chalk.yellow("●");
        context.output.log(
          `  ${statusIcon} ${chalk.bold(c.name)} (${c.type}) — ${c.status.documentsIndexed} docs indexed`
        );
        if (c.status.lastError) context.output.log(chalk.red(`    Error: ${c.status.lastError}`));
      }
      context.output.log();
    });

  contextCmd
    .command("sync <id>")
    .description("Sync a connector to fetch latest documents")
    /** Handler: trigger a sync for a specific knowledge connector. */
    .action(async (id: string) => {
      const { syncConnector } = await import("@innovator/core");
      const spinner = ora(`Syncing connector ${id}...`).start();
      try {
        const docs = await syncConnector(id);
        spinner.succeed(`Synced ${docs.length} documents from ${id}`);
      } catch (err) {
        spinner.fail(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  // ── webhooks ────────────────────────────────────────────────────────
  // Manages webhook registrations for innovation events: list templates,
  // register endpoints, and configure event delivery.
  const webhooksCmd = program
    .command("webhooks")
    .description("Manage webhook registrations for innovation events");

  webhooksCmd
    .command("templates")
    .description("List available webhook templates")
    /** Handler: display available webhook event templates. */
    .action(async () => {
      const { listWebhookTemplates } = await import("@innovator/core");
      const templates = listWebhookTemplates();
      context.output.log(chalk.bold.blue("\n🔗 Webhook Templates\n"));
      for (const t of templates) {
        context.output.log(`  ${chalk.bold(t.name)} (${t.id})`);
        context.output.log(`  ${chalk.dim(t.description)}`);
        context.output.log(`  URL pattern: ${chalk.cyan(t.urlPattern)}`);
        context.output.log(`  Events: ${t.events.join(", ")}\n`);
      }
    });

  webhooksCmd
    .command("list")
    .description("List registered webhooks")
    /** Handler: display all registered webhook endpoints. */
    .action(async () => {
      const { WebhookManager } = await import("@innovator/core");
      const mgr = new WebhookManager();
      const webhooks = mgr.listWebhooks();
      if (webhooks.length === 0) {
        context.output.log(chalk.dim("No webhooks registered."));
        return;
      }
      for (const w of webhooks) {
        const status = w.active ? chalk.green("●") : chalk.red("●");
        context.output.log(`  ${status} ${chalk.bold(w.id)} → ${w.url}`);
        context.output.log(`    Events: ${w.events.join(", ")}`);
      }
    });

  // ── monitor ─────────────────────────────────────────────────────────
  // ---- monitor command ----
  // Competitive intelligence monitoring: create monitors, track signals,
  // and generate periodic digests on competitors and market trends.
  const monitorCmd = program.command("monitor").description("Competitive intelligence monitoring");

  monitorCmd
    .command("create")
    .description("Create a competitive monitor")
    .requiredOption("--domain <domain>", "Domain to monitor (e.g., 'AI code generation')")
    .option("--competitors <list>", "Comma-separated competitor names")
    .option("--keywords <list>", "Comma-separated keywords")
    .option("--frequency <freq>", "Monitoring frequency: hourly, daily, weekly", "daily")
    /** Handler: create a competitive monitor for a specific domain. */
    .action(
      async (opts: {
        domain: string;
        competitors?: string;
        keywords?: string;
        frequency?: string;
      }) => {
        const { createMonitor } = await import("@innovator/core");
        const monitor = createMonitor({
          domain: opts.domain,
          competitors: opts.competitors ? opts.competitors.split(",").map((s) => s.trim()) : [],
          keywords: opts.keywords ? opts.keywords.split(",").map((s) => s.trim()) : [],
          enabled: true,
          frequency: (opts.frequency ?? "daily") as "hourly" | "daily" | "weekly",
        });
        context.output.log(chalk.green(`✓ Monitor created: ${monitor.id}`));
        context.output.log(
          chalk.dim(`  Domain: ${monitor.domain} | Frequency: ${monitor.frequency}`)
        );
      }
    );

  monitorCmd
    .command("list")
    .description("List active monitors")
    /** Handler: display all active competitive monitors. */
    .action(async () => {
      const { listMonitors } = await import("@innovator/core");
      const monitors = listMonitors();
      if (monitors.length === 0) {
        context.output.log(
          chalk.dim("No monitors configured. Use `innovator monitor create` to add one.")
        );
        return;
      }
      context.output.log(chalk.bold.blue("\n🔍 Competitive Monitors\n"));
      for (const m of monitors) {
        const status = m.enabled ? chalk.green("●") : chalk.red("●");
        context.output.log(`  ${status} ${chalk.bold(m.domain)} (${m.id})`);
        context.output.log(`    Competitors: ${m.competitors.join(", ") || "none"}`);
        context.output.log(
          `    Frequency: ${m.frequency} | Next run: ${m.nextRunAt?.split("T")[0] ?? "N/A"}\n`
        );
      }
    });

  monitorCmd
    .command("signals")
    .description("View detected competitive signals")
    .option("--domain <domain>", "Filter by domain")
    .option("--limit <n>", "Maximum signals to show", "20")
    /** Handler: view detected competitive signals with trend analysis. */
    .action(async (opts: { domain?: string; limit?: string }) => {
      const { getSignals, detectTrends, generateInvestigationSuggestions } =
        await import("@innovator/core");
      const limit = parseInt(opts.limit ?? "20", 10);
      const signals = getSignals({ domain: opts.domain, limit });

      if (signals.length === 0) {
        context.output.log(chalk.dim("No signals detected yet."));
        return;
      }

      context.output.log(chalk.bold.blue("\n📡 Competitive Signals\n"));
      for (const s of signals) {
        const relColor =
          s.relevanceScore >= 0.7
            ? chalk.green
            : s.relevanceScore >= 0.4
              ? chalk.yellow
              : chalk.dim;
        context.output.log(`  ${relColor("●")} ${chalk.bold(s.title)} [${s.signalType}]`);
        context.output.log(
          `    ${chalk.dim(s.description.slice(0, 100))}${s.description.length > 100 ? "..." : ""}`
        );
        context.output.log(
          `    Source: ${s.source} | Relevance: ${Math.round(s.relevanceScore * 100)}% | ${s.detectedAt.split("T")[0]}\n`
        );
      }

      const trends = detectTrends(opts.domain);
      if (trends.length > 0) {
        context.output.log(chalk.bold("  Trends:"));
        for (const t of trends) {
          const arrow = t.direction === "rising" ? "↑" : t.direction === "declining" ? "↓" : "→";
          context.output.log(`    ${arrow} ${t.trend}: ${t.signalCount} signals (${t.direction})`);
        }
      }

      const suggestions = generateInvestigationSuggestions(opts.domain);
      if (suggestions.length > 0) {
        context.output.log(chalk.bold("\n  💡 Suggested Investigations:"));
        for (const s of suggestions) {
          context.output.log(`    → ${s}`);
        }
      }
    });

  // ── provenance ──────────────────────────────────────────────────────
  // Shows provenance and citation chains for ideas, tracking the full
  // lineage from investigation through generation and refinement.
  program
    .command("provenance")
    .description("View provenance and citation chain for ideas")
    .argument("<session-id>", "Session ID to show provenance for")
    .option("--format <format>", "Output format: text, markdown, json-ld", "text")
    /** Handler: display provenance and citation chain for a session's ideas. */
    .action(async (sessionId: string, opts: { format?: string }) => {
      const {
        getSession,
        createProvenanceChain,
        provenanceToMarkdown,
        provenanceToJsonLd,
        formatProvenance,
        computeChainHash,
      } = await import("@innovator/core");

      const session = await getSession(sessionId);
      if (!session) {
        context.output.error(chalk.red(`Session not found: ${sessionId}`));
        return;
      }

      const chain = createProvenanceChain({
        sessionId,
        subject: session.subject ?? "Unknown",
        angleResults: session.angleResults ?? [],
        investigation: session.investigation,
        model: (session as unknown as { model?: string }).model,
      });

      if (opts.format === "json-ld") {
        context.output.log(JSON.stringify(provenanceToJsonLd(chain), null, 2));
      } else if (opts.format === "markdown") {
        context.output.log(provenanceToMarkdown(chain));
      } else {
        context.output.log(chalk.bold.blue(`\n🔗 Provenance Chain: ${sessionId}\n`));
        context.output.log(`  Subject: ${chain.subject}`);
        context.output.log(`  Records: ${chain.records.length}`);
        context.output.log(`  Integrity: ${chalk.dim(computeChainHash(chain))}\n`);
        context.output.log(formatProvenance(chain.records));
      }
    });
}
