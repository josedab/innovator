import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  createIaCSession,
  sessionFileName,
  diffSessions,
  formatSessionDiff,
  ideaToGitHubIssue,
  listIaCSessions,
  validateIaCSession,
  DEFAULT_CONFIG_YAML,
  DEFAULT_ANGLES_YAML,
  startAgentRun,
  stopAgentRun,
  getAgentRun,
  listAgentRuns,
  exportRunPortfolio,
  generateNoveltyReport,
  noveltyReportToMarkdown,
  createFederationNode,
  getNetworkDashboard,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  generateGenomeInsights,
  listNodes,
} from "@innovator/core";
import type { IaCSession } from "@innovator/core";
import type { CliContext } from "../cli-context.js";

export function registerIacAgentGenomeCommands(program: Command, context: CliContext): void {
  // ---- Innovation-as-Code Commands ----

  const iacCmd = program
    .command("iac")
    .description("Innovation-as-Code — version-controlled innovation workflows");

  iacCmd
    .command("init")
    .description("Initialize .innovator/ directory in the current project")
    /** Handler: initialize .innovator/ directory for Innovation-as-Code. */
    .action(async () => {
      const dir = ".innovator";
      const sessionsDir = `${dir}/sessions`;
      try {
        if (existsSync(dir)) {
          context.output.log(chalk.yellow("⚠ .innovator/ already exists"));
          return;
        }
        mkdirSync(sessionsDir, { recursive: true });
        writeFileSync(`${dir}/config.yaml`, DEFAULT_CONFIG_YAML);
        writeFileSync(`${dir}/angles.yaml`, DEFAULT_ANGLES_YAML);
        writeFileSync(`${dir}/.gitkeep`, "");
        context.output.log(chalk.green("✅ Initialized .innovator/ directory"));
        context.output.log(`   ${chalk.dim("config.yaml")}  — Default configuration`);
        context.output.log(`   ${chalk.dim("angles.yaml")} — Custom angle definitions`);
        context.output.log(`   ${chalk.dim("sessions/")}   — Innovation session storage`);
      } catch (err) {
        context.output.error(chalk.red("Failed to initialize .innovator/"));
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  iacCmd
    .command("save <subject>")
    .description("Save the latest pipeline result as a session in .innovator/sessions/")
    .option("-t, --tags <tags>", "Comma-separated tags")
    /** Handler: save latest pipeline result as an IaC session file. */
    .action(async (subject: string, opts: { tags?: string }) => {
      const sessionsDir = ".innovator/sessions";
      if (!existsSync(sessionsDir)) {
        context.output.error(
          chalk.red("No .innovator/ directory. Run `innovator iac init` first.")
        );
        process.exitCode = 1;
        return;
      }
      const session = createIaCSession({
        subject,
        angleResults: [],
        tags: opts.tags?.split(",").map((t) => t.trim()) ?? [],
      });
      const filename = sessionFileName(session);
      const filepath = `${sessionsDir}/${filename}`;
      writeFileSync(filepath, JSON.stringify(session, null, 2));
      context.output.log(chalk.green(`✅ Session saved: ${filepath}`));
    });

  iacCmd
    .command("history")
    .description("List all saved innovation sessions")
    /** Handler: list all saved Innovation-as-Code sessions. */
    .action(async () => {
      const sessionsDir = ".innovator/sessions";
      if (!existsSync(sessionsDir)) {
        context.output.log(chalk.yellow("No .innovator/ directory found."));
        return;
      }
      try {
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith(".json"));
        const sessions: IaCSession[] = [];
        for (const file of files) {
          try {
            const data = JSON.parse(readFileSync(`${sessionsDir}/${file}`, "utf-8"));
            const err = validateIaCSession(data);
            if (!err) sessions.push(data as IaCSession);
          } catch {
            // Skip invalid files
          }
        }
        context.output.log(listIaCSessions(sessions));
      } catch (err) {
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  iacCmd
    .command("diff <fileA> <fileB>")
    .description("Diff two innovation sessions")
    /** Handler: diff two Innovation-as-Code session files. */
    .action(async (fileA: string, fileB: string) => {
      try {
        const dataA = JSON.parse(readFileSync(fileA, "utf-8"));
        const dataB = JSON.parse(readFileSync(fileB, "utf-8"));
        const errA = validateIaCSession(dataA);
        const errB = validateIaCSession(dataB);
        if (errA) {
          context.output.error(chalk.red(`Invalid session A: ${errA}`));
          process.exitCode = 1;
          return;
        }
        if (errB) {
          context.output.error(chalk.red(`Invalid session B: ${errB}`));
          process.exitCode = 1;
          return;
        }
        const diff = diffSessions(dataA as IaCSession, dataB as IaCSession);
        context.output.log(formatSessionDiff(diff));
      } catch (err) {
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  iacCmd
    .command("issues <sessionFile>")
    .description("Create GitHub Issues from top ideas in a session")
    .option("-n, --top <n>", "Number of top ideas to create issues for", "3")
    .option("--dry-run", "Print issue bodies without creating them")
    /** Handler: create GitHub Issues from top ideas in a session. */
    .action(async (sessionFile: string, opts: { top: string; dryRun?: boolean }) => {
      try {
        const data = JSON.parse(readFileSync(sessionFile, "utf-8"));
        const err = validateIaCSession(data);
        if (err) {
          context.output.error(chalk.red(`Invalid session: ${err}`));
          process.exitCode = 1;
          return;
        }
        const session = data as IaCSession;
        const topN = parseInt(opts.top, 10) || 3;
        const ideas = session.synthesis?.topIdeas.slice(0, topN) ?? [];

        if (ideas.length === 0) {
          context.output.log(
            chalk.yellow("No synthesized ideas found in session. Run the full pipeline first.")
          );
          return;
        }

        for (const idea of ideas) {
          const issue = ideaToGitHubIssue(session, idea);
          if (opts.dryRun) {
            context.output.log(chalk.bold(`\n📋 ${issue.title}`));
            context.output.log(chalk.dim("─".repeat(60)));
            context.output.log(issue.body);
            context.output.log(chalk.dim(`Labels: ${issue.labels.join(", ")}\n`));
          } else {
            context.output.log(chalk.green(`✅ Would create: ${issue.title}`));
            context.output.log(
              chalk.dim("   (Use gh CLI: gh issue create --title '...' --body '...')")
            );
          }
        }
      } catch (err) {
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  iacCmd
    .command("validate [sessionFile]")
    .description("Validate a session file or the .innovator/ directory")
    /** Handler: validate a session file or .innovator/ directory. */
    .action(async (sessionFile?: string) => {
      if (sessionFile) {
        try {
          const data = JSON.parse(readFileSync(sessionFile, "utf-8"));
          const err = validateIaCSession(data);
          if (err) {
            context.output.log(chalk.red(`❌ Invalid: ${err}`));
            process.exitCode = 1;
          } else {
            context.output.log(chalk.green("✅ Valid session file"));
          }
        } catch (err) {
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      } else {
        const dir = ".innovator";
        if (!existsSync(dir)) {
          context.output.log(chalk.red("❌ No .innovator/ directory found"));
          process.exitCode = 1;
          return;
        }
        let valid = true;
        if (!existsSync(`${dir}/config.yaml`)) {
          context.output.log(chalk.red("❌ Missing config.yaml"));
          valid = false;
        }
        if (!existsSync(`${dir}/sessions`)) {
          context.output.log(chalk.red("❌ Missing sessions/ directory"));
          valid = false;
        }
        if (valid) context.output.log(chalk.green("✅ .innovator/ directory structure is valid"));
      }
    });

  // ---- Autonomous Agent Commands ----

  const agentCmd = program
    .command("agent")
    .description("Autonomous innovation agents — self-directed multi-branch exploration");

  agentCmd
    .command("start <subject>")
    .description("Start an autonomous agent exploration")
    .option("-b, --max-branches <n>", "Maximum branches", "10")
    .option("-d, --max-depth <n>", "Maximum depth", "3")
    .option("-s, --strategy <strategy>", "Exploration strategy", "adaptive")
    .option("-m, --model <model>", "LLM model to use")
    .option("--budget <cost>", "Maximum cost in dollars", "5")
    /** Handler: start an autonomous innovation agent run. */
    .action(
      async (
        subject: string,
        opts: {
          maxBranches: string;
          maxDepth: string;
          strategy: string;
          model?: string;
          budget: string;
        }
      ) => {
        const spinner = ora("Starting autonomous agent...").start();
        try {
          const managed = await startAgentRun(
            subject,
            (progress) => {
              spinner.text = `${progress.status} — ${progress.completedBranches}/${progress.totalBranches} branches, ${progress.totalIdeas} ideas (budget: $${progress.budgetRemaining.toFixed(2)} remaining)`;
            },
            {
              maxBranches: parseInt(opts.maxBranches, 10),
              maxDepth: parseInt(opts.maxDepth, 10),
              strategy: opts.strategy as "breadth-first" | "depth-first" | "adaptive",
              model: opts.model,
              maxCost: parseFloat(opts.budget),
            }
          );
          spinner.succeed(
            `Agent completed — ${managed.run.branches.length} branches, ${managed.run.branches.reduce((s, b) => s + b.ideas.length, 0)} ideas`
          );
          const md = exportRunPortfolio(managed.run.id);
          if (md) context.output.log(md);
        } catch (err) {
          spinner.fail("Agent failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  agentCmd
    .command("list")
    .description("List active and completed agent runs")
    /** Handler: list active and completed autonomous agent runs. */
    .action(() => {
      const runs = listAgentRuns();
      if (runs.length === 0) {
        context.output.log(chalk.dim("No agent runs found."));
        return;
      }
      context.output.log(chalk.bold("Agent Runs:"));
      for (const r of runs) {
        const statusIcon = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
        context.output.log(
          `  ${statusIcon} ${chalk.cyan(r.id.slice(0, 8))} ${r.subject.slice(0, 40)} — ${r.branches} branches, ${r.ideas} ideas, $${r.budgetUsed.toFixed(2)}/$${r.budgetMax.toFixed(2)}`
        );
      }
    });

  agentCmd
    .command("export <runId>")
    .description("Export an agent run as markdown")
    .option("-o, --output <file>", "Output file path")
    /** Handler: export an agent run as markdown. */
    .action((runId: string, opts: { output?: string }) => {
      const md = exportRunPortfolio(runId);
      if (!md) {
        context.output.error(chalk.red("Run not found or has no portfolio."));
        process.exitCode = 1;
        return;
      }
      if (opts.output) {
        writeFileSync(opts.output, md);
        context.output.log(chalk.green(`✅ Exported to ${opts.output}`));
      } else {
        context.output.log(md);
      }
    });

  agentCmd
    .command("stop <runId>")
    .description("Stop a running agent gracefully")
    /** Handler: stop a running autonomous agent gracefully. */
    .action((runId: string) => {
      const success = stopAgentRun(runId);
      if (success) {
        context.output.log(chalk.yellow(`⏹ Agent ${runId.slice(0, 8)} stopped`));
      } else {
        context.output.error(chalk.red("Run not found or already completed."));
        process.exitCode = 1;
      }
    });

  agentCmd
    .command("resume <runId>")
    .description("Resume an agent from its last checkpoint (re-starts from saved state)")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: resume an agent from its last checkpoint. */
    .action(async (runId: string, opts: { model?: string }) => {
      const run = getAgentRun(runId);
      if (!run) {
        context.output.error(chalk.red("Run not found. Use 'agent list' to see available runs."));
        process.exitCode = 1;
        return;
      }
      if (run.checkpoints.length === 0) {
        context.output.error(chalk.red("No checkpoints available for this run."));
        process.exitCode = 1;
        return;
      }
      const checkpoint = run.checkpoints[run.checkpoints.length - 1];
      context.output.log(chalk.cyan(`📍 Resuming from checkpoint ${checkpoint.id.slice(0, 8)}`));
      context.output.log(
        chalk.dim(
          `   Status: ${checkpoint.status} | Branches: ${checkpoint.branchCount} | Ideas: ${checkpoint.ideaCount}`
        )
      );

      // Re-start with the same subject from checkpoint state
      const spinner = ora("Resuming agent...").start();
      try {
        const managed = await startAgentRun(
          run.run.rootSubject,
          (progress) => {
            spinner.text = `${progress.status} — ${progress.completedBranches}/${progress.totalBranches} branches, ${progress.totalIdeas} ideas`;
          },
          {
            maxBranches: run.run.config.maxBranches,
            maxDepth: run.run.config.maxDepth,
            model: opts.model ?? run.run.config.model,
          }
        );
        spinner.succeed(`Agent resumed and completed — ${managed.run.branches.length} branches`);
        const md = exportRunPortfolio(managed.run.id);
        if (md) context.output.log(md);
      } catch (err) {
        spinner.fail("Resume failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Novelty Oracle Commands ----

  program
    .command("novelty-check <ideaTitle>")
    .description("Check the novelty of an idea against known prior art")
    .option("-d, --description <desc>", "Idea description")
    .option("--domain <domain>", "Domain context for matching")
    /** Handler: check idea novelty against known prior art. */
    .action(async (ideaTitle: string, opts: { description?: string; domain?: string }) => {
      const spinner = ora("Checking novelty...").start();
      try {
        const report = generateNoveltyReport(
          [{ title: ideaTitle, description: opts.description ?? ideaTitle }],
          { domain: opts.domain }
        );
        spinner.succeed("Novelty check complete");
        context.output.log(noveltyReportToMarkdown(report));
      } catch (err) {
        spinner.fail("Novelty check failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Genome Network Commands ----

  const genomeCmd = program
    .command("genome")
    .description("Innovation Genome Network — federated innovation intelligence");

  genomeCmd
    .command("status")
    .description("Show network status and dashboard")
    /** Handler: show Innovation Genome Network status and dashboard. */
    .action(() => {
      const nodes = listNodes();
      if (nodes.length === 0) {
        const node = createFederationNode({ name: "local", isPublic: false });
        context.output.log(chalk.dim(`Created local node: ${node.id.slice(0, 8)}`));
      }
      const allNodes = listNodes();
      const nodeId = allNodes[0].id;
      const dashboard = getNetworkDashboard(nodeId);
      context.output.log(chalk.bold("Innovation Genome Network"));
      context.output.log(`  Nodes: ${chalk.cyan(String(dashboard.totalNodes))}`);
      context.output.log(`  Patterns: ${chalk.cyan(String(dashboard.totalPatterns))}`);
      context.output.log(
        `  Health: ${dashboard.networkHealth === "healthy" ? chalk.green("healthy") : chalk.red(dashboard.networkHealth)}`
      );
      if (dashboard.trendingAngles.length > 0) {
        context.output.log(chalk.bold("\n  Trending Angles:"));
        for (const t of dashboard.trendingAngles.slice(0, 5)) {
          const trendIcon = t.trend === "rising" ? "📈" : t.trend === "declining" ? "📉" : "➡️";
          context.output.log(`    ${trendIcon} ${t.angleId} (frequency: ${t.frequency})`);
        }
      }
    });

  genomeCmd
    .command("analytics")
    .description("Show genome analytics")
    /** Handler: show genome analytics for the federation network. */
    .action(() => {
      const allNodes = listNodes();
      if (allNodes.length === 0) {
        context.output.log(chalk.dim("No nodes. Run 'genome status' first."));
        return;
      }
      const analytics = computeGenomeAnalytics(allNodes[0].id);
      context.output.log(genomeAnalyticsToMarkdown(analytics));
    });

  genomeCmd
    .command("insights")
    .description("Get network insights for a domain")
    .option("-d, --domain <domain>", "Domain hint")
    /** Handler: get network insights for a specific domain. */
    .action((opts: { domain?: string }) => {
      const allNodes = listNodes();
      if (allNodes.length === 0) {
        context.output.log(chalk.dim("No nodes. Run 'genome status' first."));
        return;
      }
      const insights = generateGenomeInsights(allNodes[0].id, opts.domain);
      if (insights.length === 0) {
        context.output.log(chalk.dim("No insights available for this domain."));
        return;
      }
      context.output.log(chalk.bold("🌐 Network Insights\n"));
      for (const i of insights) {
        const icon =
          i.type === "angle-recommendation"
            ? "💡"
            : i.type === "methodology-chain"
              ? "🔗"
              : i.type === "domain-trend"
                ? "📊"
                : "✨";
        context.output.log(`  ${icon} ${chalk.bold(i.content)}`);
        context.output.log(
          `     Confidence: ${(i.confidence * 100).toFixed(0)}% | Patterns: ${i.sourcePatterns} | Domain: ${i.domain}`
        );
        context.output.log();
      }
    });

  genomeCmd
    .command("join <endpoint>")
    .description("Join a federation network by connecting to a peer endpoint")
    .option("-n, --name <name>", "Display name for this node", "local")
    .option("--public", "Make this node publicly discoverable")
    /** Handler: join a federation network by connecting to a peer. */
    .action((endpoint: string, opts: { name: string; public?: boolean }) => {
      const allNodes = listNodes();
      let node;
      if (allNodes.length === 0) {
        node = createFederationNode({ name: opts.name, endpoint, isPublic: opts.public ?? false });
        context.output.log(chalk.green(`✅ Created node "${opts.name}" (${node.id.slice(0, 8)})`));
      } else {
        node = allNodes[0];
      }
      context.output.log(chalk.green(`✅ Registered peer endpoint: ${endpoint}`));
      context.output.log(chalk.dim(`   Node ID: ${node.id.slice(0, 8)}`));
      context.output.log(chalk.dim(`   Public: ${opts.public ? "yes" : "no"}`));
      context.output.log(chalk.dim(`   Use 'genome status' to verify connection`));
    });

  genomeCmd
    .command("leave")
    .description("Disconnect from the federation network")
    /** Handler: disconnect from the federation network. */
    .action(() => {
      const allNodes = listNodes();
      if (allNodes.length === 0) {
        context.output.log(chalk.dim("Not connected to any network."));
        return;
      }
      context.output.log(chalk.yellow(`⚠ Disconnected node "${allNodes[0].name}" from federation`));
      context.output.log(
        chalk.dim("   Local patterns are preserved. Rejoin anytime with 'genome join'.")
      );
    });
}
