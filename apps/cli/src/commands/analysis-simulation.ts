import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  runWargaming,
  wargamingToMarkdown,
  getRubric,
  listRubrics,
  generateCostReport,
  costReportToMarkdown,
  mapSupplyChain,
  supplyChainToMarkdown,
  analyzeTimings,
  timingToMarkdown,
  retrieveRelatedMemories,
  generateOrgDNA,
  orgDNAToMarkdown,
  getIdeaLineage,
  detectConvergence,
  generateNLExecutionPlan,
  executeWithStreaming,
  listMonitorSources,
  generateMonitorDigest,
  monitorDigestToMarkdown,
  getMonitorState,
  getRecentSignals,
  rankByImpact,
  getInnovationFunnel,
  generateImpactDashboard,
  dashboardToMarkdown,
  listCompetitors,
  runGapAnalysis,
  gapReportToMarkdown,
  generateRadarDashboard,
  radarDashboardToMarkdown,
  getPipelineRecommendation,
  generateStakeholderAssessment,
  assessmentToMarkdown,
  runMonteCarloComparison,
  twinMonteCarloToMarkdown,
} from "@innovator/core";
import type { CliContext } from "../cli-context.js";
import { createCommandHelpers } from "../command-helpers.js";

export function registerAnalysisSimulationCommands(program: Command, context: CliContext): void {
  const { validateSubjectWithLog, validateModelWithLog } = createCommandHelpers(context);

  // ---- Wargaming Command ----
  // Runs competitive wargaming simulation: models competitor responses,
  // market reactions, and strategic counter-moves for an innovation idea.
  program
    .command("wargame")
    .description("Run competitive wargaming simulation on an idea")
    .argument("<subject>", "Innovation subject")
    .requiredOption("--idea <title>", "Idea title to wargame")
    .requiredOption("--description <desc>", "Idea description")
    .option("-m, --model <model>", "LLM model to use")
    .option("--rounds <n>", "Number of wargaming rounds (1-5)", "3")
    .option("--markdown", "Output as Markdown")
    /** Handler: run adversarial wargaming simulation on an idea. */
    .action(
      async (
        subject: string,
        opts: {
          idea: string;
          description: string;
          model?: string;
          rounds?: string;
          markdown?: boolean;
        }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (opts.model && !validateModelWithLog(opts.model)) return;
        const spinner = ora("Running wargaming simulation...").start();
        try {
          const result = await runWargaming(opts.idea, opts.description, subject, {
            model: opts.model,
            rounds: parseInt(opts.rounds ?? "3", 10),
          });
          spinner.stop();
          if (opts.markdown) {
            context.output.log(wargamingToMarkdown(result));
          } else {
            context.output.log(chalk.bold.red(`\n🎯 Wargaming: ${result.ideaTitle}\n`));
            context.output.log(
              `  Resilience Score: ${chalk.bold(String(result.overallResilienceScore))}/100`
            );
            context.output.log(
              `  Competitors: ${result.competitors.map((c) => c.name).join(", ")}`
            );
            context.output.log(`  Rounds: ${result.rounds.length}`);
            context.output.log(`  Vulnerabilities: ${result.vulnerabilities.length}`);
            context.output.log(`  Counter-strategies: ${result.counterStrategies.length}\n`);
            context.output.log(chalk.dim(result.strategicBrief));
          }
        } catch (err) {
          spinner.fail("Wargaming failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- Rubric Commands ----
  // ---- rubric command ----
  // Manages custom scoring rubrics for evaluating innovation ideas
  // with user-defined criteria and weightings.
  const rubricCmd = program.command("rubric").description("Manage custom scoring rubrics");

  rubricCmd
    .command("list")
    .description("List available scoring rubrics")
    /** Handler: display all available scoring rubrics. */
    .action(() => {
      const rubrics = listRubrics();
      if (rubrics.length === 0) {
        context.output.log(chalk.dim("No rubrics found."));
        return;
      }
      context.output.log(chalk.bold("\n📋 Scoring Rubrics\n"));
      for (const r of rubrics) {
        context.output.log(`  ${chalk.cyan(r.id)} — ${r.name} (${r.dimensions.length} dimensions)`);
        context.output.log(`    ${chalk.dim(r.description)}`);
      }
    });

  rubricCmd
    .command("show <id>")
    .description("Show rubric details")
    /** Handler: display detailed criteria and weights for a specific rubric. */
    .action((id: string) => {
      const rubric = getRubric(id);
      if (!rubric) {
        context.output.error(chalk.red(`Rubric not found: ${id}`));
        process.exitCode = 1;
        return;
      }
      context.output.log(chalk.bold(`\n📋 ${rubric.name}\n`));
      context.output.log(`  ${rubric.description}\n`);
      for (const d of rubric.dimensions) {
        context.output.log(`  ${chalk.cyan(d.id)} — ${d.name} (weight: ${d.weight})`);
        context.output.log(`    ${chalk.dim(d.description)}`);
      }
    });

  // ---- Cost Report Command ----
  // Generates an LLM cost-performance report showing token usage,
  // cost breakdowns, and efficiency metrics across pipeline runs.
  program
    .command("cost-report")
    .description("Generate LLM cost-performance report")
    .option("--markdown", "Output as Markdown")
    /** Handler: generate and display LLM cost-performance report. */
    .action((opts: { markdown?: boolean }) => {
      const report = generateCostReport();
      if (opts.markdown) {
        context.output.log(costReportToMarkdown(report));
      } else {
        context.output.log(chalk.bold("\n💰 LLM Cost Report\n"));
        context.output.log(`  Total Cost: $${report.totalCostUsd.toFixed(4)}`);
        context.output.log(`  Total Tokens: ${report.totalTokens.toLocaleString()}`);
        context.output.log(`  Measurements: ${report.measurementCount}`);
        context.output.log(`  Estimated Savings: $${report.savingsEstimate.toFixed(4)}\n`);
        if (report.recommendations.length > 0) {
          context.output.log(chalk.bold("  Routing Recommendations:"));
          for (const r of report.recommendations) {
            context.output.log(
              `    ${r.stage}: ${chalk.cyan(r.recommendedModel)} (quality: ${r.expectedQuality.toFixed(2)})`
            );
          }
        }
      }
    });

  // ---- Supply Chain Command ----
  // Maps the innovation supply chain for an idea: identifies required
  // resources, dependencies, suppliers, and delivery milestones.
  program
    .command("supply-chain")
    .description("Map innovation supply chain for an idea")
    .argument("<subject>", "Innovation subject")
    .requiredOption("--idea <title>", "Idea title")
    .requiredOption("--description <desc>", "Idea description")
    .option("-m, --model <model>", "LLM model to use")
    .option("--markdown", "Output as Markdown")
    /** Handler: map innovation supply chain dependencies for an idea. */
    .action(
      async (
        subject: string,
        opts: { idea: string; description: string; model?: string; markdown?: boolean }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (opts.model && !validateModelWithLog(opts.model)) return;
        const spinner = ora("Mapping supply chain...").start();
        try {
          const result = await mapSupplyChain(opts.idea, opts.description, subject, opts.model);
          spinner.stop();
          if (opts.markdown) {
            context.output.log(supplyChainToMarkdown(result));
          } else {
            context.output.log(chalk.bold.blue(`\n🔗 Supply Chain: ${result.ideaTitle}\n`));
            context.output.log(`  Readiness: ${result.readinessScore}/100`);
            context.output.log(`  Total Cost: $${result.totalEstimatedCostUsd.toLocaleString()}`);
            context.output.log(
              `  Build: ${result.buildItems} | Buy: ${result.buyItems} | Partner: ${result.partnerItems}`
            );
            context.output.log(`  Gaps: ${result.gaps.length}\n`);
            context.output.log(chalk.dim(result.summary));
          }
        } catch (err) {
          spinner.fail("Supply chain mapping failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- Timing Command ----
  // Analyzes and displays timing metrics for innovation pipeline operations.
  program
    .command("timing")
    .description("Analyze optimal execution timing for ideas")
    .argument("<subject>", "Innovation subject")
    .option("-m, --model <model>", "LLM model to use")
    .option("--markdown", "Output as Markdown")
    /** Handler: analyze optimal execution timing for innovation ideas. */
    .action(async (subject: string, opts: { model?: string; markdown?: boolean }) => {
      if (!validateSubjectWithLog(subject)) return;
      if (opts.model && !validateModelWithLog(opts.model)) return;
      context.output.log(
        chalk.dim("Note: Provide ideas via --idea flags or pipe from auto command.")
      );
      context.output.log(
        chalk.dim(
          "Example: innovator timing 'AI in healthcare' --idea 'AI Diagnostics::AI-powered diagnostic tool'\n"
        )
      );
      const spinner = ora("Analyzing timing signals...").start();
      try {
        const result = await analyzeTimings(
          subject,
          [{ title: subject, description: subject }],
          opts.model
        );
        spinner.stop();
        if (opts.markdown) {
          context.output.log(timingToMarkdown(result));
        } else {
          context.output.log(chalk.bold(`\n⏰ Timing Analysis: ${result.subject}\n`));
          context.output.log(`  Market Maturity: ${result.marketMaturityStage}`);
          for (const idea of result.ideas) {
            const emoji =
              idea.classification === "right-time"
                ? "✅"
                : idea.classification === "peak-window"
                  ? "🔥"
                  : idea.classification === "too-early"
                    ? "🕐"
                    : "⚠️";
            context.output.log(
              `  ${emoji} ${idea.ideaTitle}: ${idea.classification} (urgency: ${idea.urgencyScore}/100)`
            );
          }
          context.output.log(`\n${chalk.dim(result.overallTimingAdvice)}`);
        }
      } catch (err) {
        spinner.fail("Timing analysis failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Idea Version Control Commands ----
  // ---- idea command ----
  // Idea version control (IdeaGit): track idea lineage, branch ideas,
  // and diff versions over time.
  const ideaCmd = program.command("idea").description("Idea version control (IdeaGit)");

  ideaCmd
    .command("log <ideaId>")
    .description("Show version history for an idea")
    .option("--branch <name>", "Filter by branch")
    /** Handler: show version history log for a tracked idea. */
    .action(async (ideaId: string, opts: { branch?: string }) => {
      const { getVersionLog } = await import("@innovator/core");
      const versions = getVersionLog(ideaId, opts.branch);
      if (versions.length === 0) {
        context.output.log(chalk.dim("No versions found for this idea."));
        return;
      }
      context.output.log(chalk.bold(`\n📜 Version Log: ${ideaId}\n`));
      for (const v of versions) {
        const date = new Date(v.createdAt).toISOString().slice(0, 16);
        context.output.log(
          `  ${chalk.yellow(v.id.slice(0, 8))} ${chalk.dim(date)} ${v.message ?? "(no message)"}`
        );
        context.output.log(
          `    ${chalk.dim(`branch: ${v.branchName}${v.author ? ` | author: ${v.author}` : ""}`)}`
        );
      }
    });

  ideaCmd
    .command("branch <versionId> <branchName>")
    .description("Create a branch from a version")
    /** Handler: create a named branch from an idea version. */
    .action(async (versionId: string, branchName: string) => {
      const { createBranch } = await import("@innovator/core");
      const branch = createBranch(versionId, branchName);
      if (!branch) {
        context.output.error(
          chalk.red("Failed to create branch. Version not found or branch already exists.")
        );
        process.exitCode = 1;
        return;
      }
      context.output.log(
        chalk.green(`Branch "${branchName}" created from version ${versionId.slice(0, 8)}`)
      );
    });

  ideaCmd
    .command("diff <fromId> <toId>")
    .description("Semantic diff between two versions")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: compute semantic diff between two idea versions. */
    .action(async (fromId: string, toId: string, opts: { model?: string }) => {
      if (opts.model && !validateModelWithLog(opts.model)) return;
      const { semanticDiff } = await import("@innovator/core");
      const spinner = ora("Computing semantic diff...").start();
      try {
        const diff = await semanticDiff(fromId, toId, opts.model);
        spinner.stop();
        context.output.log(
          chalk.bold(`\n📊 Diff: ${diff.fromVersion.slice(0, 8)} → ${diff.toVersion.slice(0, 8)}\n`)
        );
        context.output.log(`  Overall: ${chalk.bold(diff.overallSignificance)}`);
        context.output.log(`  ${diff.summary}\n`);
        for (const c of diff.changes) {
          const color =
            c.changeType === "added"
              ? chalk.green
              : c.changeType === "removed"
                ? chalk.red
                : chalk.yellow;
          context.output.log(`  ${color(`[${c.changeType}]`)} ${c.field} (${c.significance})`);
          if (c.before) context.output.log(`    ${chalk.dim(`- ${c.before}`)}`);
          if (c.after) context.output.log(`    ${chalk.dim(`+ ${c.after}`)}`);
        }
      } catch (err) {
        spinner.fail("Diff failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Inverse Innovation Decoder ----
  // Reverse-engineers a product description to extract the innovation
  // frameworks and creative strategies that likely produced it.
  program
    .command("decode <productDescription>")
    .description("Analyze a product and reverse-engineer its innovation recipe")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: reverse-engineer a product's innovation recipe. */
    .action(async (productDescription: string, opts: { model?: string }) => {
      if (opts.model && !validateModelWithLog(opts.model)) return;
      const { analyzeProduct, recipeToMarkdown: _recipeToMarkdown } =
        await import("@innovator/core");
      const spinner = ora("Analyzing product...").start();
      try {
        const recipe = await analyzeProduct(productDescription, { model: opts.model });
        spinner.stop();
        context.output.log(chalk.bold(`\n🔍 ${recipe.recipe.title}\n`));
        context.output.log(
          chalk.dim(
            `Disruption: ${recipe.productAnalysis.disruptionType} | Difficulty: ${recipe.recipe.estimatedDifficulty}`
          )
        );
        context.output.log(`\n${chalk.bold("Key Insight:")} ${recipe.recipe.keyInsight}\n`);
        context.output.log(chalk.bold(`Patterns (${recipe.patterns.length}):`));
        for (const p of recipe.patterns) {
          context.output.log(
            `  ${chalk.cyan(p.name)} (${p.angle}, ${(p.confidence * 100).toFixed(0)}%)`
          );
        }
        context.output.log(chalk.bold(`\nRecipe Steps (${recipe.recipe.steps.length}):`));
        for (const s of recipe.recipe.steps.slice(0, 5)) {
          context.output.log(
            `  ${chalk.yellow(`${s.order}.`)} ${s.technique}: ${s.prompt.slice(0, 80)}...`
          );
        }
        if (recipe.recipe.steps.length > 5)
          context.output.log(chalk.dim(`  ...and ${recipe.recipe.steps.length - 5} more steps`));
        context.output.log(
          chalk.bold(`\nSuggested Angles:`),
          recipe.recipe.suggestedAngles.join(", ")
        );
      } catch (err) {
        spinner.fail("Product analysis failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Diffusion Simulator ----
  // Simulates idea adoption and diffusion across user segments using
  // innovation diffusion theory (innovators → early adopters → majority).
  program
    .command("diffusion <ideaTitle>")
    .description("Simulate idea diffusion and adoption using Bass model")
    .argument("[description]", "Idea description")
    .option("-m, --model <model>", "LLM model to use")
    .option("--no-monte-carlo", "Skip Monte Carlo simulation")
    .option("--iterations <n>", "Monte Carlo iterations", "500")
    /** Handler: simulate idea diffusion and adoption using Bass model. */
    .action(
      async (
        ideaTitle: string,
        description: string | undefined,
        opts: { model?: string; monteCarlo?: boolean; iterations?: string }
      ) => {
        if (opts.model && !validateModelWithLog(opts.model)) return;
        const { simulateDiffusion, diffusionToMarkdown: _diffusionToMarkdown } =
          await import("@innovator/core");
        const spinner = ora("Simulating diffusion...").start();
        try {
          const result = await simulateDiffusion(
            {
              title: ideaTitle,
              description: description ?? ideaTitle,
              potentialImpact: "",
              implementationHint: "",
            },
            {
              model: opts.model,
              runMonteCarlo: opts.monteCarlo !== false,
              monteCarloIterations: parseInt(opts.iterations ?? "500"),
            }
          );
          spinner.stop();
          context.output.log(chalk.bold(`\n📈 Diffusion: ${result.ideaTitle}\n`));
          context.output.log(
            `  Peak adoption month: ${chalk.cyan(String(result.peakAdoptionMonth))}`
          );
          context.output.log(
            `  Time to majority: ${chalk.cyan(`${result.timeToMajority} months`)}`
          );
          context.output.log(`  Market size: ${chalk.cyan(result.parameters.m.toLocaleString())}`);
          if (result.monteCarlo) {
            context.output.log(
              `  Adoption probability: ${chalk.green(`${(result.monteCarlo.adoptionProbability * 100).toFixed(1)}%`)}`
            );
          }
          context.output.log(chalk.bold("\nStrategies:"));
          for (const s of result.strategies) {
            context.output.log(`  ${chalk.yellow(s.phase)}: ${s.recommendation.slice(0, 80)}`);
          }
        } catch (err) {
          spinner.fail("Diffusion simulation failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- Adaptive Scaling ----
  // Classifies subjects by innovation complexity tier to determine
  // optimal pipeline configuration and resource allocation.
  program
    .command("classify <subject>")
    .description("Classify subject complexity and generate adaptive execution plan")
    .option("--depth <depth>", "Preferred depth: overview, standard, deep, exhaustive")
    /** Handler: classify subject complexity and generate execution plan. */
    .action(async (subject: string, opts: { depth?: string }) => {
      const { classifyComplexityHeuristic, generateExecutionPlan } =
        await import("@innovator/core");
      const spinner = ora("Classifying complexity...").start();
      try {
        const complexity = classifyComplexityHeuristic(subject);
        const plan = generateExecutionPlan(subject, complexity, {
          level: "intermediate",
          domains: [],
          preferredDepth:
            (opts.depth as "overview" | "standard" | "deep" | "exhaustive") ?? "standard",
          sessionCount: 0,
        });
        spinner.stop();
        context.output.log(chalk.bold(`\n⚡ Adaptive Plan for: "${subject}"\n`));
        context.output.log(
          `  Complexity: ${chalk.cyan(complexity.level)} (score: ${complexity.score.toFixed(2)})`
        );
        context.output.log(`  Recommended depth: ${chalk.cyan(plan.recommendedDepth)}`);
        context.output.log(
          `  Angles: ${chalk.cyan(String(plan.angleCount))} (${plan.recommendedAngles.join(", ")})`
        );
        context.output.log(`  Model: ${chalk.cyan(plan.modelSelection.generation)}`);
        context.output.log(
          `  Est. cost savings: ${chalk.green(`${plan.costSavingsPercent.toFixed(0)}%`)}`
        );
        context.output.log(`  Est. time: ${chalk.cyan(`${plan.estimatedTimeSeconds}s`)}`);
        if (plan.adjustments.length > 0) {
          context.output.log(chalk.bold("\nAdjustments:"));
          for (const a of plan.adjustments) {
            context.output.log(
              `  ${a.parameter}: ${chalk.dim(a.original)} → ${chalk.green(a.adjusted)} (${a.reason})`
            );
          }
        }
      } catch (err) {
        spinner.fail("Classification failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Market Test ----
  // Simulates market testing for an idea: generates test hypotheses,
  // success metrics, and go/no-go recommendations.
  program
    .command("market-test <ideaTitle>")
    .description("Run synthetic market test with AI consumer personas")
    .argument("[description]", "Idea description")
    .option("-m, --model <model>", "LLM model to use")
    .option("--personas <n>", "Number of personas", "1000")
    .option("--price <usd>", "Base price in USD")
    /** Handler: run synthetic market test with AI consumer personas. */
    .action(
      async (
        ideaTitle: string,
        description: string | undefined,
        opts: { model?: string; personas?: string; price?: string }
      ) => {
        if (opts.model && !validateModelWithLog(opts.model)) return;
        const { runMarketTest } = await import("@innovator/core");
        const spinner = ora(`Testing with ${opts.personas ?? "1000"} personas...`).start();
        try {
          const result = await runMarketTest(
            {
              title: ideaTitle,
              description: description ?? ideaTitle,
              potentialImpact: "",
              implementationHint: "",
            },
            {
              model: opts.model,
              personaCount: parseInt(opts.personas ?? "1000"),
              basePrice: opts.price ? parseFloat(opts.price) : undefined,
            }
          );
          spinner.stop();
          context.output.log(chalk.bold(`\n🏪 Market Test: ${result.ideaTitle}\n`));
          context.output.log(`  Personas: ${chalk.cyan(result.totalPersonas.toLocaleString())}`);
          context.output.log(
            `  Adoption: ${chalk.cyan(`${(result.overallAdoptionRate * 100).toFixed(1)}%`)}`
          );
          context.output.log(`  Viability: ${chalk.bold(result.marketViability)}`);
          context.output.log(`  Optimal price: ${chalk.green(`$${result.optimalPriceUsd}`)}`);
          context.output.log(chalk.bold("\nTop Segments:"));
          for (const s of result.segmentAnalysis
            .sort((a, b) => b.adoptionRate - a.adoptionRate)
            .slice(0, 5)) {
            context.output.log(
              `  ${chalk.cyan(s.segment)}: ${(s.adoptionRate * 100).toFixed(1)}% adoption, $${s.avgWillingnessToPayUsd} WTP`
            );
          }
        } catch (err) {
          spinner.fail("Market test failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- Flow State ----
  // Checks innovation pipeline health and bottleneck status to ensure
  // smooth progression through investigation and generation stages.
  program
    .command("flow-check")
    .description("Check cognitive flow state for current session")
    .option("--duration <min>", "Session duration in minutes", "30")
    .option("--ideas <n>", "Ideas generated so far", "10")
    .option("--stall <min>", "Minutes since last idea", "2")
    /** Handler: check cognitive flow state for current innovation session. */
    .action(async (opts: { duration?: string; ideas?: string; stall?: string }) => {
      const { assessFlowState, selectIntervention } = await import("@innovator/core");
      const indicators = {
        sessionDurationMinutes: parseInt(opts.duration ?? "30"),
        ideasGenerated: parseInt(opts.ideas ?? "10"),
        anglesExplored: 4,
        timeSinceLastIdeaMinutes: parseInt(opts.stall ?? "2"),
        ideaQualityTrend: "stable" as const,
        repetitionRate: 0.1,
        avgIdeaLengthTrend: "stable" as const,
        userInteractionFrequency: "normal" as const,
      };
      const flowState = assessFlowState(indicators);
      const intervention = selectIntervention(flowState);

      context.output.log(chalk.bold(`\n🧠 Flow State: ${flowState.state}\n`));
      context.output.log(
        `  Cognitive load: ${chalk.cyan(`${(flowState.cognitiveLoad * 100).toFixed(0)}%`)}`
      );
      context.output.log(
        `  Creative energy: ${chalk.cyan(`${(flowState.creativeEnergy * 100).toFixed(0)}%`)}`
      );
      context.output.log(`  Focus: ${chalk.cyan(`${(flowState.focusLevel * 100).toFixed(0)}%`)}`);
      context.output.log(`  ${chalk.dim(flowState.recommendation)}`);
      context.output.log(chalk.bold(`\n💡 Suggested: ${intervention.title}`));
      context.output.log(`  ${intervention.description}`);
    });

  // ---- Regulatory Simulator ----
  // Simulates regulatory assessment of an idea across multiple jurisdictions
  // and compliance frameworks (GDPR, FDA, SEC, etc.).
  program
    .command("regulatory <ideaTitle>")
    .description("Simulate regulatory compliance across jurisdictions")
    .argument("[description]", "Idea description")
    .option("-m, --model <model>", "LLM model to use")
    .option("--jurisdictions <list>", "Comma-separated jurisdictions")
    /** Handler: simulate regulatory compliance across jurisdictions. */
    .action(
      async (
        ideaTitle: string,
        description: string | undefined,
        opts: { model?: string; jurisdictions?: string }
      ) => {
        if (opts.model && !validateModelWithLog(opts.model)) return;
        const { simulateRegulatory } = await import("@innovator/core");
        const spinner = ora("Simulating regulatory compliance...").start();
        try {
          const jurisdictions = opts.jurisdictions?.split(",").map((j) => j.trim());
          const result = await simulateRegulatory(
            {
              title: ideaTitle,
              description: description ?? ideaTitle,
              potentialImpact: "",
              implementationHint: "",
            },
            { model: opts.model, jurisdictions }
          );
          spinner.stop();
          context.output.log(chalk.bold(`\n⚖️  Regulatory Simulation: ${result.ideaTitle}\n`));
          const statusColor = { green: chalk.green, yellow: chalk.yellow, red: chalk.red };
          for (const j of result.jurisdictions) {
            const color = statusColor[j.overallStatus];
            context.output.log(
              `  ${color(`[${j.overallStatus.toUpperCase()}]`)} ${j.jurisdiction} — ${(j.overallScore * 100).toFixed(0)}% (${j.recommendation})`
            );
          }
          if (result.lowestRiskJurisdictions.length > 0) {
            context.output.log(
              chalk.bold(`\n  Lowest risk:`),
              chalk.green(result.lowestRiskJurisdictions.join(", "))
            );
          }
          if (result.highestRiskJurisdictions.length > 0) {
            context.output.log(
              chalk.bold(`  Highest risk:`),
              chalk.red(result.highestRiskJurisdictions.join(", "))
            );
          }
        } catch (err) {
          spinner.fail("Regulatory simulation failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
      }
    );

  // ---- Innovation Monitor Commands ----

  const innovMonitorCmd = program
    .command("innov-monitor")
    .description("Innovation monitor — continuous domain monitoring and digest generation");

  innovMonitorCmd
    .command("status")
    .description("Show monitor status")
    /** Handler: show current innovation monitor status. */
    .action(async () => {
      const state = getMonitorState();
      context.output.log(chalk.bold("Monitor Status:"), chalk.cyan(state.status));
      context.output.log(chalk.dim(`  Last poll: ${state.lastPollAt ?? "never"}`));
      context.output.log(
        chalk.dim(`  Signals: ${state.signalCount} | Digests: ${state.digestCount}`)
      );
    });

  innovMonitorCmd
    .command("sources")
    .description("List configured monitor sources")
    /** Handler: list configured innovation monitor sources. */
    .action(async () => {
      const sources = listMonitorSources();
      if (sources.length === 0) {
        context.output.log(
          chalk.yellow("No sources configured. Use 'monitor add-source' to add one.")
        );
        return;
      }
      for (const s of sources) {
        context.output.log(
          chalk.cyan(`  [${s.type}]`),
          chalk.bold(s.name),
          s.enabled ? chalk.green("✓") : chalk.red("✗")
        );
      }
    });

  innovMonitorCmd
    .command("digest")
    .description("Generate an innovation digest from recent signals")
    .option("-p, --period <period>", "Digest period (daily/weekly)", "daily")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: generate an innovation digest from recent signals. */
    .action(async (opts: { period: string; model?: string }) => {
      const spinner = ora("Generating innovation digest...").start();
      try {
        const digest = await generateMonitorDigest(opts.period as "daily" | "weekly", opts.model);
        spinner.succeed("Digest generated");
        context.output.log(monitorDigestToMarkdown(digest));
      } catch (err) {
        spinner.fail("Digest generation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  innovMonitorCmd
    .command("signals")
    .description("Show recent opportunity signals")
    .option("-l, --limit <n>", "Max signals", "10")
    /** Handler: show recent opportunity signals from the monitor. */
    .action(async (opts: { limit: string }) => {
      const signals = getRecentSignals({ limit: parseInt(opts.limit, 10) });
      if (signals.length === 0) {
        context.output.log(chalk.yellow("No signals detected yet."));
        return;
      }
      for (const s of signals) {
        const urgencyColor =
          s.urgency === "critical" ? chalk.red : s.urgency === "high" ? chalk.yellow : chalk.dim;
        context.output.log(urgencyColor(`  [${s.urgency}]`), chalk.bold(s.title));
        context.output.log(chalk.dim(`    ${s.description.slice(0, 120)}...`));
      }
    });

  // ---- NL Innovation API Commands ----
  // Natural-language innovation commands: parse prompts into execution plans,
  // search innovation memory, generate org DNA, and track idea lineage.

  program
    .command("nl-innovate <prompt>")
    .description("Run innovation pipeline from a natural language prompt")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: run innovation pipeline from a natural language prompt. */
    .action(async (prompt: string, opts: { model?: string }) => {
      const spinner = ora("Generating execution plan...").start();
      try {
        const result = await generateNLExecutionPlan(prompt, opts.model);
        const plan = result.plan;
        spinner.succeed(`Plan generated: ${plan.steps.length} steps`);
        for (const step of plan.steps) {
          context.output.log(chalk.cyan(`  [${step.type}]`), step.description);
        }

        const execSpinner = ora("Executing plan...").start();
        await executeWithStreaming(
          plan,
          (event) => {
            if (event.type === "step_started") {
              execSpinner.text = `Step: ${event.description}`;
            } else if (event.type === "step_completed") {
              execSpinner.succeed(`Step ${event.stepId} complete`);
              execSpinner.start("Next step...");
            } else if (event.type === "execution_completed") {
              execSpinner.succeed("All steps completed");
              context.output.log(chalk.green("\n✓ Innovation pipeline finished"));
            }
          },
          { model: opts.model }
        );
      } catch (err) {
        spinner.fail("NL innovation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Memory Graph Commands ----

  const memoryCmd = program
    .command("memory")
    .description("Innovation memory graph — cross-session semantic memory");

  memoryCmd
    .command("search <query>")
    .description("Search the memory graph for related past ideas")
    .option("-t, --threshold <n>", "Similarity threshold (0-1)", "0.3")
    .option("-l, --limit <n>", "Max results", "10")
    /** Handler: search the memory graph for related past ideas. */
    .action(async (query: string, opts: { threshold: string; limit: string }) => {
      const spinner = ora("Searching memory graph...").start();
      try {
        const { nodes, scores } = retrieveRelatedMemories(query, {
          threshold: parseFloat(opts.threshold),
          limit: parseInt(opts.limit, 10),
        });
        spinner.succeed(`Found ${nodes.length} related memories`);
        for (const node of nodes) {
          const score = scores.get(node.id) ?? 0;
          context.output.log(chalk.cyan(`  [${score.toFixed(2)}]`), chalk.bold(node.title));
          context.output.log(chalk.dim(`    ${node.content.slice(0, 120)}...`));
        }
      } catch (err) {
        spinner.fail("Memory search failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  memoryCmd
    .command("org-dna")
    .description("Generate organizational innovation DNA report")
    /** Handler: generate organizational innovation DNA report. */
    .action(async () => {
      const spinner = ora("Generating org DNA report...").start();
      try {
        const report = generateOrgDNA();
        spinner.succeed("Org DNA report generated");
        context.output.log(orgDNAToMarkdown(report));
      } catch (err) {
        spinner.fail("Org DNA generation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  memoryCmd
    .command("lineage <ideaId>")
    .description("Trace the lineage of an idea through sessions")
    /** Handler: trace the lineage of an idea through sessions. */
    .action(async (ideaId: string) => {
      const spinner = ora("Tracing idea lineage...").start();
      try {
        const lineage = getIdeaLineage(ideaId);
        spinner.succeed(`Lineage traced for: ${lineage.ideaId}`);
        context.output.log(chalk.bold(`  Ancestors: ${lineage.ancestors.length}`));
        context.output.log(chalk.bold(`  Descendants: ${lineage.descendants.length}`));
      } catch (err) {
        spinner.fail("Lineage tracing failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  memoryCmd
    .command("convergence")
    .description("Detect convergent thinking across sessions")
    /** Handler: detect convergent thinking across innovation sessions. */
    .action(async () => {
      const spinner = ora("Detecting convergence patterns...").start();
      try {
        const patterns = detectConvergence();
        spinner.succeed(`Found ${patterns.length} convergence patterns`);
        for (const p of patterns) {
          context.output.log(
            chalk.cyan(`  [${p.similarityScore.toFixed(2)}]`),
            chalk.bold(p.description)
          );
          context.output.log(chalk.dim(`    Sessions: ${p.sessionIds.join(", ")}`));
        }
      } catch (err) {
        spinner.fail("Convergence detection failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Impact Tracker Commands ----

  const impactCmd = program
    .command("impact")
    .description("Innovation impact tracker — connect ideas to real-world outcomes");

  impactCmd
    .command("funnel")
    .description("Show innovation funnel metrics")
    /** Handler: show innovation funnel metrics. */
    .action(async () => {
      const funnel = getInnovationFunnel();
      context.output.log(chalk.bold("Innovation Funnel:"));
      context.output.log(chalk.dim(`  Total ideas: ${funnel.totalIdeas}`));
      context.output.log(chalk.dim(`  In progress: ${funnel.inProgress}`));
      context.output.log(chalk.green(`  Shipped: ${funnel.shipped}`));
      context.output.log(chalk.red(`  Abandoned: ${funnel.abandoned}`));
      context.output.log(
        chalk.cyan(`  Conversion rate: ${(funnel.conversionRate * 100).toFixed(1)}%`)
      );
    });

  impactCmd
    .command("rank")
    .description("Rank ideas by impact score")
    /** Handler: rank tracked ideas by impact score. */
    .action(async () => {
      const ranked = rankByImpact();
      if (ranked.length === 0) {
        context.output.log(chalk.yellow("No tracked ideas yet."));
        return;
      }
      for (const item of ranked.slice(0, 10)) {
        context.output.log(chalk.cyan(`  [${item.compositeScore}]`), chalk.bold(item.ideaId));
      }
    });

  impactCmd
    .command("dashboard")
    .description("Generate full impact dashboard")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: generate full impact dashboard with insights. */
    .action(async (opts: { model?: string }) => {
      const spinner = ora("Generating impact dashboard...").start();
      try {
        const dashboard = await generateImpactDashboard(opts.model);
        spinner.succeed("Dashboard generated");
        context.output.log(dashboardToMarkdown(dashboard));
      } catch (err) {
        spinner.fail("Dashboard generation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Competitive Radar Commands ----

  const compRadarCmd = program.command("comp-radar").description("Competitive intelligence radar");

  compRadarCmd
    .command("competitors")
    .description("List registered competitors")
    /** Handler: list registered competitors. */
    .action(async () => {
      const competitors = listCompetitors();
      if (competitors.length === 0) {
        context.output.log(chalk.yellow("No competitors registered."));
        return;
      }
      for (const c of competitors) {
        const threatColor =
          c.threatLevel === "critical"
            ? chalk.red
            : c.threatLevel === "high"
              ? chalk.yellow
              : chalk.dim;
        context.output.log(threatColor(`  [${c.threatLevel}]`), chalk.bold(c.name));
      }
    });

  compRadarCmd
    .command("gap-analysis <competitorId>")
    .description("Run gap analysis against a competitor")
    .option("-c, --capabilities <caps>", "Our capabilities (comma-separated)")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: run gap analysis against a specific competitor. */
    .action(async (competitorId: string, opts: { capabilities?: string; model?: string }) => {
      const spinner = ora("Running gap analysis...").start();
      try {
        const caps = opts.capabilities?.split(",").map((c) => c.trim()) ?? [];
        const report = await runGapAnalysis(competitorId, caps, opts.model);
        spinner.succeed("Gap analysis complete");
        context.output.log(gapReportToMarkdown(report));
      } catch (err) {
        spinner.fail("Gap analysis failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  compRadarCmd
    .command("dashboard")
    .description("Generate competitive radar dashboard")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: generate competitive radar dashboard. */
    .action(async (opts: { model?: string }) => {
      const spinner = ora("Generating radar dashboard...").start();
      try {
        const dashboard = await generateRadarDashboard({ model: opts.model });
        spinner.succeed("Radar dashboard generated");
        context.output.log(radarDashboardToMarkdown(dashboard));
      } catch (err) {
        spinner.fail("Radar dashboard generation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Adaptive Methodology Commands ----
  // Provides data-driven pipeline recommendations: suggests optimal angles,
  // depth, and configuration based on subject analysis and past results.

  program
    .command("recommend <subject>")
    .description("Get adaptive pipeline recommendation for a subject")
    .option("-d, --domain <domain>", "Innovation domain")
    .option("-t, --team <teamId>", "Team ID")
    /** Handler: get adaptive pipeline recommendation for a subject. */
    .action(async (subject: string, opts: { domain?: string; team?: string }) => {
      const spinner = ora("Generating recommendation...").start();
      try {
        const recommendation = getPipelineRecommendation(subject, {
          domain: opts.domain,
          teamId: opts.team,
        });
        spinner.succeed("Recommendation generated");
        context.output.log(chalk.bold("\nRecommended Pipeline:"));
        context.output.log(chalk.cyan(`  Angles: ${recommendation.recommendedAngles.join(", ")}`));
        context.output.log(chalk.cyan(`  Depth: ${recommendation.suggestedDepth}`));
        context.output.log(
          chalk.cyan(`  Quality estimate: ${(recommendation.estimatedQuality * 100).toFixed(0)}%`)
        );
        context.output.log(chalk.dim(`\n  ${recommendation.explanation}`));
      } catch (err) {
        spinner.fail("Recommendation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  // ---- Persona Evaluation Commands ----
  // Evaluates ideas through multiple stakeholder personas (CTO, end-user,
  // investor, regulator) with independent scoring and conflict analysis.

  program
    .command("persona-eval <ideaTitle>")
    .description("Evaluate an idea through multiple stakeholder personas")
    .option(
      "-p, --personas <ids>",
      "Persona IDs (comma-separated)",
      "cto,end-user,investor,regulator"
    )
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: evaluate an idea from multiple stakeholder personas. */
    .action(async (ideaTitle: string, opts: { personas: string; model?: string }) => {
      const spinner = ora("Running persona evaluation...").start();
      try {
        const personaIds = opts.personas.split(",").map((p) => p.trim());
        const assessment = await generateStakeholderAssessment(ideaTitle, personaIds, {
          model: opts.model,
        });
        spinner.succeed("Assessment complete");
        context.output.log(assessmentToMarkdown(assessment));
      } catch (err) {
        spinner.fail("Persona evaluation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
}

export function registerMonteCarloSimulationCommand(program: Command, context: CliContext): void {
  program
    .command("simulate")
    .description("Run Monte Carlo simulation comparing innovation strategies")
    .option("-i, --iterations <n>", "Number of iterations", "1000")
    .option("-w, --weeks <n>", "Time horizon in weeks", "52")
    .option("--seed <n>", "Random seed for reproducibility")
    /** Handler: run Monte Carlo simulation comparing innovation strategies. */
    .action(async (opts: { iterations: string; weeks: string; seed?: string }) => {
      const spinner = ora("Running Monte Carlo simulation...").start();
      try {
        // Use a minimal example ecosystem and strategies for CLI demo
        const snapshot = {
          id: "cli-demo",
          organizationName: "CLI Demo",
          capturedAt: new Date().toISOString(),
          team: [
            {
              id: "t1",
              name: "Engineer",
              role: "Dev",
              capacity: 0.8,
              strengths: ["code"],
              activeProjects: 2,
            },
            {
              id: "t2",
              name: "Designer",
              role: "Design",
              capacity: 0.7,
              strengths: ["ux"],
              activeProjects: 1,
            },
          ],
          pipeline: [
            {
              id: "p1",
              title: "Feature A",
              stage: "validation" as const,
              score: 70,
              assignedTeam: ["t1"],
              estimatedEffortWeeks: 4,
              budgetAllocated: 10000,
              budgetSpent: 3000,
            },
          ],
          marketContext: {
            industry: "SaaS",
            competitors: [
              { name: "Competitor", threat: "medium" as const, recentMoves: ["launched v2"] },
            ],
            trends: ["AI", "sustainability"],
            regulatoryFactors: [],
          },
          budget: { totalBudget: 100000, allocated: 30000, remaining: 70000, currency: "USD" },
          angleEffectiveness: [
            {
              angleId: "scamper",
              successRate: 0.7,
              avgIdeaQuality: 72,
              usageCount: 10,
              bestForStages: ["discovery"],
            },
          ],
        };

        const strategies = [
          {
            id: "conservative",
            name: "Conservative",
            description: "Focus on proven approaches",
            timeHorizonWeeks: parseInt(opts.weeks, 10),
          },
          {
            id: "aggressive",
            name: "Aggressive",
            description: "Push hard on new initiatives",
            timeHorizonWeeks: parseInt(opts.weeks, 10),
            newInitiatives: ["New product line", "AI integration"],
          },
          {
            id: "balanced",
            name: "Balanced",
            description: "Mix of proven and experimental",
            timeHorizonWeeks: parseInt(opts.weeks, 10),
            newInitiatives: ["AI feature"],
          },
        ];

        const comparison = runMonteCarloComparison(snapshot, strategies, {
          iterations: parseInt(opts.iterations, 10),
          timeHorizonWeeks: parseInt(opts.weeks, 10),
          randomSeed: opts.seed ? parseInt(opts.seed, 10) : undefined,
        });

        spinner.succeed(`Simulation complete (${opts.iterations} iterations)`);
        context.output.log(twinMonteCarloToMarkdown(comparison));
      } catch (err) {
        spinner.fail("Simulation failed");
        context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
}
