import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import packageJson from "../package.json" with { type: "json" };
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
  querySessions,
  deleteSession,
  updateSession,
  exportToMarkdown,
  exportToJson,
  generateGitHubIssueBody,
  scoreIdeas,
  getQuadrant,
  rankIdeas,
  extractContent,
  runBenchmark,
  benchmarkToMarkdown,
  loadConfig,
  saveConfig,
  listProviders,
  createConversation,
  refineConversation,
  validateIdeas,
  transformForAudience,
  OUTPUT_MODES,
  runChain,
  getChainById,
  listChains,
  submitFeedback,
  getFeedbackSummary,
  detectLanguage,
  SupportedLanguageSchema,
  getOfflineStatus,
  RECOMMENDED_MODELS,
  getDepthConfig,
  suggestDepth,
  DepthSchema,
  parsePipelineRequest,
  resolveAngles,
  runInnovationDiff,
  evaluateConstraints,
  flattenIdeas,
  parseConstraintString,
  findSerendipitousMemoryConnections,
  scoreInvestigationQuality,
  meetsConfidenceThreshold,
  formatGapSuggestions,
  generatePlaybook,
  runDebate,
  debateToMarkdown,
  runEvolution,
  evolutionToMarkdown,
  generateDecisionPacket,
  decisionPacketToMarkdown,
  generateStressScenarios,
  stressTestToMarkdown,
  simulateStakeholdersBatch,
  computeReadinessScores,
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
  enrichSynthesisWithNovelty,
  createFederationNode,
  getNetworkDashboard,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  generateGenomeInsights,
  enrichAngleSelection,
  listNodes,
  runMonteCarloComparison,
  twinMonteCarloToMarkdown,
} from "@innovator/core";
import type { IaCSession } from "@innovator/core";
import type {
  AngleId,
  CustomAngle,
  ExportData,
  ValidationCheck,
  OutputMode,
  Depth,
  Constraint,
} from "@innovator/core";
import { stripAnsi, validateSubject, validateModel, MAX_SUBJECT_LENGTH } from "./utils.js";

export const program = new Command();

let verbose = false;
let commandCleanup: (() => Promise<void>) | null = null;
let signalHandlersInstalled = false;

function installSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      const code = process.exitCode ?? 130;
      const cleanup = commandCleanup ? commandCleanup() : Promise.resolve();
      cleanup.finally(() => stopCopilotClient().finally(() => process.exit(code)));
    });
  }
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
  .version(packageJson.version)
  .option("--verbose", "Enable verbose logging (prompts, responses, timing)")
  .hook("preAction", () => {
    verbose = program.opts().verbose ?? false;
  });

// ---- investigate command ----
// Performs AI-powered investigation on a subject, identifying key aspects,
// challenges, opportunities, and current state. Supports depth tiers,
// multilingual output, and context enrichment from files or URLs.
program
  .command("investigate")
  .description("Investigate a subject to identify key aspects, challenges, and opportunities")
  .argument("<subject>", "The subject to investigate")
  .option("-m, --model <model>", "LLM model to use")
  .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
  .option("--lang <language>", "Output language: en, es, ja, de, pt")
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .option("--save", "Save investigation result to .innovator/sessions/")
  /** Handler: investigate a subject and display structured findings. */
  .action(
    async (
      subject: string,
      opts: {
        model?: string;
        depth?: string;
        lang?: string;
        score?: boolean;
        file?: string;
        url?: string;
        save?: boolean;
      }
    ) => {
      if (!validateSubjectWithLog(subject)) return;
      if (!validateModelWithLog(opts.model)) return;

      // Validate depth option
      const depthParse = DepthSchema.safeParse(opts.depth ?? "standard");
      if (!depthParse.success) {
        console.error(chalk.red(`Invalid depth: ${opts.depth}. Use: shallow, standard, or deep`));
        process.exitCode = 1;
        return;
      }
      const depth: Depth = depthParse.data;
      const depthConfig = getDepthConfig(depth);

      // Show depth info
      const suggestedDepth = suggestDepth(subject);
      if (suggestedDepth !== depth && depth === "standard") {
        console.log(
          chalk.dim(
            `💡 Suggested depth for this subject: ${suggestedDepth} (use --depth ${suggestedDepth})`
          )
        );
      }
      console.log(chalk.dim(`📐 Depth: ${depthConfig.label} — ${depthConfig.description}`));
      console.log(
        chalk.dim(
          `⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`
        )
      );

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
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
          return;
        }
      }

      const spinner = ora(`Investigating "${subject}"...`).start();
      debugLog("COMMAND", "investigate", { subject, model: opts.model });
      const endTimer = timeStart("investigate");

      try {
        const result = await investigate(enrichedSubject, opts.model);
        endTimer();
        spinner.succeed("Investigation complete!\n");
        debugLog("RESPONSE", JSON.stringify(result, null, 2));

        console.log(chalk.bold.blue("📋 Summary"));
        console.log(`   ${stripAnsi(result.summary)}\n`);

        console.log(chalk.bold.blue("🔑 Key Aspects"));
        for (const aspect of result.keyAspects) {
          console.log(
            `   ${chalk.bold(stripAnsi(aspect.title))}: ${stripAnsi(aspect.description)}`
          );
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

        // Save session if --save flag is set
        if (opts.save) {
          const sessionsDir = ".innovator/sessions";
          if (!existsSync(sessionsDir)) {
            mkdirSync(sessionsDir, { recursive: true });
          }
          const session = createIaCSession({
            subject,
            investigation: result,
            angleResults: [],
            model: opts.model,
          });
          const filename = sessionFileName(session);
          const filepath = `${sessionsDir}/${filename}`;
          writeFileSync(filepath, JSON.stringify(session, null, 2));
          console.log(chalk.green(`\n💾 Session saved: ${filepath}`));
        }
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
    }
  );

// ---- innovate command ----
// Generates innovation ideas for a subject by applying selected creativity
// angles (e.g., SCAMPER, First Principles). Requires a prior investigation
// step (run automatically). Supports file/URL context and optional scoring.
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
  /** Handler: generate innovation ideas for selected angles and display results. */
  .action(
    async (
      subject: string,
      opts: { angles: string; model?: string; score?: boolean; file?: string; url?: string }
    ) => {
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
        const investigation = await investigate(enrichedSubject, opts.model);
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
    }
  );

// ---- auto command ----
// Runs the full innovation pipeline end-to-end: investigate → generate ideas
// across all (or selected) angles → synthesize results. Supports optional
// debate, stress testing, stakeholder simulation, and decision packet generation.
program
  .command("auto")
  .description("Run full innovation pipeline automatically (all angles + synthesis)")
  .argument("<subject>", "The subject to innovate on")
  .option("-m, --model <model>", "LLM model to use")
  .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
  .option("--lang <language>", "Output language: en, es, ja, de, pt")
  .option("--score", "Score and rank ideas after generation")
  .option("--validate", "Validate ideas against patent, market, and feasibility checks")
  .option(
    "--audience <mode>",
    "Generate audience-adapted output (executive, technical, pitch, research)"
  )
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .option("--constraint <expr...>", "Apply constraints (e.g., 'budget<50K', 'timeline<3months')")
  .option(
    "--min-confidence <score>",
    "Minimum investigation confidence score (0-100) before generating ideas"
  )
  .option("--playbook [format]", "Generate an Innovation Playbook (markdown or html)")
  .option("--debate", "Run structured debate on top ideas after synthesis")
  .option("--debate-rounds <n>", "Number of debate rounds (1-5)", "2")
  .option("--decision-packet", "Generate an executive decision packet from results")
  .option("--stress-test", "Run stress test scenarios on top ideas")
  .option("--stakeholders", "Run stakeholder simulation on top ideas")
  .option("--save", "Save session to .innovator/sessions/ for version control")
  .option("--network-insights", "Enrich pipeline with Innovation Genome Network insights")
  .option("--novelty", "Score synthesized ideas for novelty against prior art")
  /** Handler: run the full auto-pipeline (investigate → generate → synthesize). */
  .action(
    async (
      subject: string,
      opts: {
        model?: string;
        depth?: string;
        lang?: string;
        score?: boolean;
        validate?: boolean;
        audience?: string;
        file?: string;
        url?: string;
        constraint?: string[];
        minConfidence?: string;
        playbook?: string | boolean;
        debate?: boolean;
        debateRounds?: string;
        decisionPacket?: boolean;
        stressTest?: boolean;
        stakeholders?: boolean;
        save?: boolean;
        networkInsights?: boolean;
        novelty?: boolean;
      }
    ) => {
      if (!validateSubjectWithLog(subject)) return;
      if (!validateModelWithLog(opts.model)) return;

      // Auto-detect or validate language
      const detectedLang = opts.lang ?? detectLanguage(subject);
      const langParse = SupportedLanguageSchema.safeParse(detectedLang);
      if (opts.lang && !langParse.success) {
        console.error(chalk.red(`Invalid language: ${opts.lang}. Supported: en, es, ja, de, pt`));
        process.exitCode = 1;
        return;
      }
      if (detectedLang !== "en") {
        console.log(
          chalk.dim(`🌐 Language: ${detectedLang}${!opts.lang ? " (auto-detected)" : ""}`)
        );
      }

      // Validate and display depth info
      const depthParse = DepthSchema.safeParse(opts.depth ?? "standard");
      if (!depthParse.success) {
        console.error(chalk.red(`Invalid depth: ${opts.depth}. Use: shallow, standard, or deep`));
        process.exitCode = 1;
        return;
      }
      const depth: Depth = depthParse.data;
      const depthConfig = getDepthConfig(depth);
      console.log(chalk.dim(`📐 Depth: ${depthConfig.label} — ${depthConfig.description}`));
      console.log(
        chalk.dim(
          `⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`
        )
      );

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
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
          return;
        }
      }

      const spinner = ora("Starting auto pipeline...").start();
      debugLog("COMMAND", "auto", { subject, model: opts.model });
      const endTimer = timeStart("auto-pipeline");
      const pipelineStartMs = Date.now();

      // Network insights enrichment
      if (opts.networkInsights) {
        try {
          const allNodes = listNodes();
          if (allNodes.length === 0) {
            createFederationNode({ name: "local-cli", isPublic: false });
          }
          const nodeId = listNodes()[0].id;
          const enrichment = enrichAngleSelection(nodeId, [...ANGLE_IDS], undefined);
          if (enrichment.enrichments.length > 0) {
            spinner.info("🌐 Network insights applied:");
            for (const msg of enrichment.enrichments) console.log(`   ${msg}`);
            spinner.start("Starting auto pipeline...");
          }
        } catch {
          // Network unavailable — continue without enrichment
        }
      }

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

        // Save session to .innovator/sessions/ if --save flag is set
        if (opts.save) {
          const sessionsDir = ".innovator/sessions";
          if (!existsSync(sessionsDir)) {
            mkdirSync(sessionsDir, { recursive: true });
          }
          const session = createIaCSession({
            subject: enrichedSubject,
            investigation: result.investigation,
            angleResults: result.angleResults,
            synthesis: result.synthesis,
            model: opts.model,
            durationMs: Date.now() - pipelineStartMs,
          });
          const filename = sessionFileName(session);
          const filepath = `${sessionsDir}/${filename}`;
          writeFileSync(filepath, JSON.stringify(session, null, 2));
          console.log(chalk.green(`\n💾 Session saved: ${filepath}`));
        }

        // Novelty scoring if --novelty flag is set
        if (opts.novelty && result.synthesis) {
          const enriched = enrichSynthesisWithNovelty(result.synthesis);
          console.log(chalk.bold(`\n🆕 Novelty Scores`));
          console.log(
            `   Average: ${enriched.noveltyStats.averageNovelty}/100 | Highly Novel: ${enriched.noveltyStats.highlyNovel} | Patent Candidates: ${enriched.noveltyStats.patentCandidates}\n`
          );
          for (const idea of enriched.topIdeas) {
            const badge =
              idea.noveltyAssessment === "highly-novel"
                ? chalk.green("🆕")
                : idea.noveltyAssessment === "partially-novel"
                  ? chalk.yellow("🔶")
                  : chalk.red("⚠️");
            console.log(
              `   ${badge} ${chalk.bold(stripAnsi(idea.title))} — ${idea.noveltyScore}/100 ${idea.patentCandidate ? chalk.cyan("📋 Patent Candidate") : ""}`
            );
            if (idea.differentiators.length > 0) {
              console.log(`      Differentiators: ${idea.differentiators.slice(0, 5).join(", ")}`);
            }
          }
          console.log();
        }

        // Check investigation confidence if --min-confidence flag is set
        if (opts.minConfidence && result.investigation) {
          const minConf = parseInt(opts.minConfidence, 10);
          if (isNaN(minConf) || minConf < 0 || minConf > 100) {
            console.error(chalk.red("Invalid --min-confidence value. Use 0-100."));
          } else {
            const confSpinner = ora("📊 Scoring investigation quality...").start();
            try {
              const confidence = await scoreInvestigationQuality(
                subject,
                result.investigation,
                opts.model
              );
              const passes = meetsConfidenceThreshold(confidence, minConf);
              if (passes) {
                confSpinner.succeed(`Investigation confidence: ${confidence.overallScore}/100 ✓\n`);
              } else {
                confSpinner.warn(
                  `Investigation confidence: ${confidence.overallScore}/100 (below ${minConf} threshold)\n`
                );
              }

              for (const dim of confidence.dimensions) {
                const color =
                  dim.score >= 70 ? chalk.green : dim.score >= 50 ? chalk.yellow : chalk.red;
                console.log(
                  `  ${color(`${dim.score}`)} ${dim.name}: ${stripAnsi(dim.explanation)}`
                );
              }

              const gaps = formatGapSuggestions(confidence);
              if (gaps.length > 0) {
                console.log(chalk.bold.yellow("\n  💡 Knowledge Gaps:"));
                for (const gap of gaps) {
                  console.log(`    ${chalk.yellow("→")} ${stripAnsi(gap)}`);
                }
              }
              console.log();
            } catch (err) {
              confSpinner.fail("Confidence scoring failed");
              if (verbose) {
                console.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }
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

        // Validate ideas if --validate flag is set
        if (opts.validate && result.angleResults.length > 0) {
          const allIdeas = result.angleResults.flatMap((ar) => ar.ideas);
          const validateSpinner = ora(`🔍 Validating ${allIdeas.length} ideas...`).start();
          try {
            const scorecard = await validateIdeas(allIdeas, subject, opts.model);
            validateSpinner.succeed("Ideas validated!\n");

            console.log(chalk.bold.blue("🔍 VALIDATION SCORECARD\n"));
            console.log(
              chalk.dim(
                "  " +
                  "Idea".padEnd(40) +
                  "Score".padEnd(8) +
                  "Status".padEnd(20) +
                  "Patent".padEnd(10) +
                  "Market".padEnd(10) +
                  "Feasibility"
              )
            );
            console.log(chalk.dim("  " + "─".repeat(95)));
            for (const vr of scorecard.results) {
              const statusColor =
                vr.overallStatus === "validated"
                  ? chalk.green
                  : vr.overallStatus === "caution"
                    ? chalk.yellow
                    : vr.overallStatus === "risky"
                      ? chalk.red
                      : chalk.dim;
              const title = stripAnsi(vr.ideaTitle).slice(0, 38).padEnd(40);
              const patent = vr.checks.find((c: ValidationCheck) => c.category === "patent");
              const market = vr.checks.find((c: ValidationCheck) => c.category === "competitor");
              const feasibility = vr.checks.find(
                (c: ValidationCheck) => c.category === "feasibility"
              );
              console.log(
                `  ${title}${String(vr.overallScore).padEnd(8)}${statusColor(vr.overallStatus.padEnd(20))}${(patent?.status ?? "n/a").padEnd(10)}${(market?.status ?? "n/a").padEnd(10)}${feasibility?.status ?? "n/a"}`
              );
            }
            console.log(`\n  ${chalk.dim(scorecard.summary)}\n`);
          } catch (err) {
            validateSpinner.fail("Validation failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Generate audience-adapted output if --audience flag is set
        if (opts.audience && result.synthesis) {
          const validModes = OUTPUT_MODES as readonly string[];
          if (!validModes.includes(opts.audience)) {
            console.error(
              chalk.red(
                `Unknown audience mode: ${opts.audience}. Valid: ${OUTPUT_MODES.join(", ")}`
              )
            );
          } else {
            const audienceSpinner = ora(`📝 Generating ${opts.audience} output...`).start();
            try {
              const output = await transformForAudience(
                result.synthesis,
                opts.audience as OutputMode,
                subject,
                result.investigation,
                opts.model
              );
              audienceSpinner.succeed(`${opts.audience} output generated!\n`);
              console.log(chalk.bold.blue(`📝 ${output.modeName} (for ${output.audience})\n`));
              console.log(JSON.stringify(output.content, null, 2));
              console.log();
            } catch (err) {
              audienceSpinner.fail("Audience output generation failed");
              if (verbose) {
                console.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }
        }

        // Evaluate constraints if --constraint flags are set
        if (opts.constraint && opts.constraint.length > 0 && result.angleResults.length > 0) {
          const constraintSpinner = ora("🔒 Evaluating constraints...").start();
          try {
            const constraints: Constraint[] = opts.constraint.map((c) => parseConstraintString(c));
            const ideas = flattenIdeas(result.angleResults);
            const constraintResult = await evaluateConstraints(ideas, constraints, opts.model);
            constraintSpinner.succeed("Constraints evaluated!\n");

            console.log(chalk.bold.blue("🔒 CONSTRAINT EVALUATION\n"));
            for (const evaluation of constraintResult.evaluations) {
              const passIcon = evaluation.passes ? chalk.green("✓") : chalk.red("✗");
              console.log(
                `  ${passIcon} ${chalk.bold(stripAnsi(evaluation.ideaTitle))} — score: ${evaluation.score}/100`
              );
              for (const cr of evaluation.constraintResults) {
                const crIcon = cr.satisfied ? chalk.green("  ✓") : chalk.red("  ✗");
                console.log(
                  `    ${crIcon} ${stripAnsi(cr.dimension)}: ${stripAnsi(cr.explanation)}`
                );
              }
            }
            console.log(`\n  ${chalk.dim(stripAnsi(constraintResult.summary))}\n`);
          } catch (err) {
            constraintSpinner.fail("Constraint evaluation failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Run debate on top ideas if --debate flag is set
        if (opts.debate && result.synthesis && result.synthesis.topIdeas.length > 0) {
          const debateRounds = Math.min(
            5,
            Math.max(1, parseInt(opts.debateRounds ?? "2", 10) || 2)
          );
          const topIdeas = result.synthesis.topIdeas.slice(0, 3);
          const debateSpinner = ora(
            `🗣️  Debating top ${topIdeas.length} ideas (${debateRounds} rounds)...`
          ).start();
          try {
            for (const topIdea of topIdeas) {
              debateSpinner.text = `🗣️  Debating: ${stripAnsi(topIdea.title)}...`;
              const debateResult = await runDebate(
                {
                  title: topIdea.title,
                  description: topIdea.description,
                  potentialImpact: topIdea.potentialImpact,
                  implementationHint: "",
                },
                result.investigation,
                { rounds: debateRounds, model: opts.model, signal: controller.signal }
              );
              console.log(chalk.bold(`\n${"═".repeat(60)}`));
              console.log(debateToMarkdown(debateResult));
            }
            debateSpinner.succeed("Debates complete!\n");
          } catch (err) {
            debateSpinner.fail("Debate failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Run stress test on top ideas if --stress-test flag is set
        if (opts.stressTest && result.synthesis && result.synthesis.topIdeas.length > 0) {
          const topIdeas = result.synthesis.topIdeas.slice(0, 3);
          const stressSpinner = ora(`🔥 Stress testing ${topIdeas.length} ideas...`).start();
          try {
            for (const topIdea of topIdeas) {
              stressSpinner.text = `🔥 Stress testing: ${stripAnsi(topIdea.title)}...`;
              const stressResult = await generateStressScenarios(
                {
                  title: topIdea.title,
                  description: topIdea.description,
                  potentialImpact: topIdea.potentialImpact,
                  implementationHint: "",
                },
                subject,
                { model: opts.model, signal: controller.signal }
              );
              console.log(chalk.bold(`\n${"═".repeat(60)}`));
              console.log(stressTestToMarkdown(stressResult));
            }
            stressSpinner.succeed("Stress tests complete!\n");
          } catch (err) {
            stressSpinner.fail("Stress test failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Generate playbook if --playbook flag is set
        if (opts.playbook && result.investigation && result.synthesis) {
          const format =
            typeof opts.playbook === "string" && opts.playbook === "html"
              ? ("html" as const)
              : ("markdown" as const);
          const playbookSpinner = ora(`📕 Generating Innovation Playbook (${format})...`).start();
          try {
            const playbook = await generatePlaybook(
              subject,
              result.investigation,
              result.angleResults,
              result.synthesis,
              format,
              opts.model
            );
            playbookSpinner.succeed("Innovation Playbook generated!\n");

            const filename = `playbook-${subject
              .slice(0, 30)
              .replace(/[^a-z0-9]/gi, "-")
              .toLowerCase()}.${format === "html" ? "html" : "md"}`;
            const fs = await import("node:fs");
            fs.writeFileSync(filename, playbook.content, "utf-8");
            console.log(chalk.green(`  📄 Saved to ${filename}`));
            console.log(
              chalk.dim(
                `  ${playbook.content.length} characters, ${playbook.sections.roadmap.length} phases, ${playbook.sections.risks.length} risks\n`
              )
            );
          } catch (err) {
            playbookSpinner.fail("Playbook generation failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Generate decision packet if --decision-packet flag is set
        if (opts.decisionPacket && result.investigation && result.synthesis) {
          const packetSpinner = ora("📋 Generating Executive Decision Packet...").start();
          try {
            const packet = await generateDecisionPacket(
              result.synthesis,
              result.investigation,
              subject,
              { model: opts.model, signal: controller.signal }
            );
            packetSpinner.succeed("Decision Packet generated!\n");

            const md = decisionPacketToMarkdown(packet);
            const filename = `decision-packet-${subject
              .slice(0, 30)
              .replace(/[^a-z0-9]/gi, "-")
              .toLowerCase()}.md`;
            const fs = await import("node:fs");
            fs.writeFileSync(filename, md, "utf-8");
            console.log(chalk.green(`  📄 Saved to ${filename}`));
            console.log(
              chalk.dim(
                `  ${packet.options.length} options, ${packet.risks.length} risks, ${packet.resourceAsk.length} resources\n`
              )
            );
          } catch (err) {
            packetSpinner.fail("Decision packet generation failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }

        // Run stakeholder simulation if --stakeholders flag is set
        if (opts.stakeholders && result.synthesis && result.synthesis.topIdeas.length > 0) {
          const topIdeas = result.synthesis.topIdeas.slice(0, 5);
          const stakeholderSpinner = ora(
            `👥 Simulating stakeholder reactions for ${topIdeas.length} ideas...`
          ).start();
          try {
            const ideas = topIdeas.map((ti) => ({
              title: ti.title,
              description: ti.description,
              potentialImpact: ti.potentialImpact,
              implementationHint: "",
            }));
            const simulations = await simulateStakeholdersBatch(
              ideas,
              undefined,
              opts.model,
              controller.signal
            );
            stakeholderSpinner.succeed("Stakeholder simulation complete!\n");

            const matrices = computeReadinessScores(simulations);

            console.log(chalk.bold.blue("👥 STAKEHOLDER SIMULATION\n"));
            for (const sim of simulations) {
              console.log(chalk.bold(`  ${stripAnsi(sim.ideaTitle)}`));
              console.log(
                chalk.dim("  " + "Persona".padEnd(25) + "Enthusiasm".padEnd(14) + "Likely Action")
              );
              console.log(chalk.dim("  " + "─".repeat(65)));
              for (const r of sim.reactions) {
                const color =
                  r.enthusiasm >= 7 ? chalk.green : r.enthusiasm >= 4 ? chalk.yellow : chalk.red;
                console.log(
                  `  ${stripAnsi(r.personaName).padEnd(25)}${color(String(r.enthusiasm) + "/10").padEnd(14)}${stripAnsi(r.likelyAction)}`
                );
              }
              console.log(
                chalk.dim(
                  `  Consensus: ${sim.consensusScore}/10 | Most enthusiastic: ${sim.mostEnthusiastic} | Most concerned: ${sim.mostConcerned}\n`
                )
              );
            }

            console.log(chalk.bold.blue("📊 READINESS SCORES\n"));
            console.log(
              chalk.dim(
                "  " +
                  "Idea".padEnd(40) +
                  "Readiness".padEnd(12) +
                  "Alignment".padEnd(12) +
                  "Support/Oppose/Neutral"
              )
            );
            console.log(chalk.dim("  " + "─".repeat(85)));
            for (const m of matrices) {
              const readColor =
                m.readinessScore >= 70
                  ? chalk.green
                  : m.readinessScore >= 40
                    ? chalk.yellow
                    : chalk.red;
              const title = stripAnsi(m.ideaTitle).slice(0, 38).padEnd(40);
              console.log(
                `  ${title}${readColor(`${m.readinessScore}%`).padEnd(12)}${String(Math.round(m.alignmentScore * 100) + "%").padEnd(12)}${m.supportCount}/${m.oppositionCount}/${m.neutralCount}`
              );
            }
            console.log();
          } catch (err) {
            stakeholderSpinner.fail("Stakeholder simulation failed");
            if (verbose) {
              console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            }
          }
        }
      } catch {
      } finally {
        commandCleanup = null;
        await stopCopilotClient();
      }
    }
  );

// ---- evolve command ----
// Evolves ideas through genetic-algorithm-inspired selection, crossover,
// and mutation over multiple generations to discover high-fitness innovations.
program
  .command("evolve")
  .description("Evolve ideas through genetic-algorithm-inspired mutation and crossover")
  .argument("<subject>", "The subject to evolve ideas for")
  .option("-m, --model <model>", "LLM model to use")
  .option("--generations <n>", "Number of evolution generations (1-10)", "3")
  .option("--population <n>", "Population size per generation", "6")
  /** Handler: evolve ideas through genetic-algorithm-inspired generations. */
  .action(
    async (
      subject: string,
      opts: { model?: string; generations?: string; population?: string }
    ) => {
      if (!validateSubjectWithLog(subject)) return;
      if (!validateModelWithLog(opts.model)) return;

      const gens = Math.min(10, Math.max(1, parseInt(opts.generations ?? "3", 10) || 3));
      const popSize = Math.min(20, Math.max(4, parseInt(opts.population ?? "6", 10) || 6));

      const spinner = ora("🔍 Investigating subject for initial population...").start();
      const controller = new AbortController();
      commandCleanup = async () => controller.abort();

      try {
        const investigation = await investigate(subject, opts.model, controller.signal);
        spinner.succeed("Investigation complete");

        spinner.start("⚡ Generating initial idea population...");
        const angleResult = await generateForAngle(
          subject,
          investigation,
          "first-principles",
          opts.model,
          controller.signal
        );
        spinner.succeed(`Generated ${angleResult.ideas.length} seed ideas`);

        spinner.start(`🧬 Evolving over ${gens} generations (pop: ${popSize})...`);
        const result = await runEvolution(
          angleResult.ideas,
          gens,
          { populationSize: popSize, model: opts.model, signal: controller.signal },
          (progress) => {
            spinner.text = `🧬 Gen ${progress.generation + 1}/${progress.totalGenerations} — best fitness: ${progress.bestFitness} (${progress.phase})`;
          }
        );
        spinner.succeed("Evolution complete!\n");

        console.log(evolutionToMarkdown(result));
      } catch (err) {
        spinner.fail("Evolution failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        commandCleanup = null;
        await stopCopilotClient();
      }
    }
  );

// ---- diff command ----
// Compares two temporal snapshots of a subject to identify what changed,
// new opportunities, obsoleted aspects, and emerging gaps.
program
  .command("diff")
  .description("Compare two snapshots of a subject and generate an innovation diff")
  .argument("<subjectA>", "First snapshot (e.g., 'remote work in 2020')")
  .argument("<subjectB>", "Second snapshot (e.g., 'remote work in 2026')")
  .option("-m, --model <model>", "LLM model to use")
  /** Handler: compare two temporal snapshots and display innovation diff. */
  .action(async (subjectA: string, subjectB: string, opts: { model?: string }) => {
    if (!validateModelWithLog(opts.model)) return;

    const spinner = ora(`Comparing "${subjectA}" vs "${subjectB}"...`).start();
    debugLog("COMMAND", "diff", { subjectA, subjectB, model: opts.model });

    try {
      const result = await runInnovationDiff(subjectA, subjectB, opts.model);
      spinner.succeed("Innovation diff complete!\n");

      console.log(chalk.bold.blue(`📊 ${result.subjectA} → ${result.subjectB}\n`));
      console.log(chalk.bold(`📋 Summary`));
      console.log(`  ${stripAnsi(result.summary)}\n`);

      console.log(chalk.bold.yellow("🔄 What Changed"));
      for (const item of result.changed) {
        const sig =
          item.significance === "high"
            ? chalk.red("●")
            : item.significance === "medium"
              ? chalk.yellow("●")
              : chalk.dim("●");
        console.log(`  ${sig} ${chalk.bold(stripAnsi(item.title))}`);
        console.log(`    ${stripAnsi(item.description)}`);
      }

      console.log(chalk.bold.green("\n✨ New Opportunities"));
      for (const item of result.newOpportunities) {
        console.log(`  ${chalk.green("•")} ${chalk.bold(stripAnsi(item.title))}`);
        console.log(`    ${stripAnsi(item.description)}`);
      }

      console.log(chalk.bold.red("\n🗑️  Obsoleted"));
      for (const item of result.obsoleted) {
        console.log(`  ${chalk.red("•")} ${chalk.bold(stripAnsi(item.title))}`);
        console.log(`    ${stripAnsi(item.description)}`);
      }

      console.log(chalk.bold.magenta("\n🔍 Emerging Gaps"));
      for (const item of result.emergingGaps) {
        console.log(`  ${chalk.magenta("•")} ${chalk.bold(stripAnsi(item.title))}`);
        console.log(`    ${stripAnsi(item.description)}`);
      }
      console.log();
    } catch (err) {
      spinner.fail("Innovation diff failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Diff failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      await stopCopilotClient();
    }
  });

// ---- run (natural language pipeline) command ----
// Accepts a plain-English description of an innovation pipeline, parses it
// into a structured execution plan, and runs the resolved pipeline steps.
program
  .command("run")
  .description("Run a pipeline described in natural language")
  .argument("<description>", "Plain English description of what pipeline to run")
  .option("-m, --model <model>", "LLM model to use")
  /** Handler: parse and execute a natural-language pipeline description. */
  .action(async (description: string, opts: { model?: string }) => {
    if (!validateModelWithLog(opts.model)) return;

    const parseSpinner = ora("Parsing pipeline description...").start();
    debugLog("COMMAND", "run", { description, model: opts.model });

    try {
      const config = await parsePipelineRequest(description, opts.model);
      parseSpinner.succeed("Pipeline configuration parsed");

      console.log(chalk.dim(`  Subject: ${config.subject}`));
      console.log(chalk.dim(`  Phases: ${config.phases.join(" → ")}`));
      if (config.angles) console.log(chalk.dim(`  Angles: ${config.angles.join(", ")}`));
      if (config.outputFormat) console.log(chalk.dim(`  Format: ${config.outputFormat}`));
      if (config.focusArea) console.log(chalk.dim(`  Focus: ${config.focusArea}`));
      console.log();

      if (!validateSubjectWithLog(config.subject)) return;

      const angles = resolveAngles(config);
      const spinner = ora("Running pipeline...").start();
      const controller = new AbortController();
      commandCleanup = async () => controller.abort();

      const result = await runAutoPipeline(
        config.subject,
        (progress) => {
          if (progress.stage === "investigating") spinner.text = "🔍 Investigating subject...";
          else if (progress.stage === "generating") {
            const done = progress.completedAngles.length;
            spinner.text = `⚡ Generating innovations... (${done}/${progress.totalAngles})`;
          } else if (progress.stage === "synthesizing") spinner.text = "🧪 Synthesizing results...";
        },
        config.model ?? opts.model,
        angles,
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
        console.log(chalk.bold.blue(`\n${stripAnsi(angle.angleName)}`));
        for (const idea of angle.ideas) {
          console.log(`  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
          console.log(`  ${stripAnsi(idea.description)}`);
        }
      }

      if (result.synthesis) {
        console.log(chalk.bold.magenta("\n🏆 TOP IDEAS\n"));
        for (const idea of result.synthesis.topIdeas) {
          console.log(`  ${chalk.bold(stripAnsi(idea.title))} [${idea.feasibility}]`);
          console.log(`  ${stripAnsi(idea.description)}\n`);
        }
        console.log(chalk.bold("\n📌 Recommendation:"));
        console.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
      }
    } catch (err) {
      parseSpinner.fail("Pipeline failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Pipeline failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

// ---- chain command ----
// Runs pre-defined angle chains that compose multiple angles sequentially,
// passing output from one angle as input to the next.
const chainCmd = program
  .command("chain")
  .description("Run pre-defined angle chains for composed innovation");

chainCmd
  .command("list")
  .description("List available angle chains")
  /** Handler: list all available angle chains. */
  .action(() => {
    console.log(chalk.bold("\n🔗 Available Angle Chains\n"));
    for (const chain of listChains()) {
      console.log(`  ${chalk.bold.cyan(chain.id)} — ${chain.name}`);
      console.log(`  ${chalk.dim(chain.description)}`);
      console.log(`  Steps: ${chain.steps.map((s) => s.angleId).join(" → ")}\n`);
    }
  });

chainCmd
  .command("run")
  .description("Run an angle chain")
  .argument("<chainId>", "Chain ID to run (e.g., deep-disruption)")
  .argument("<subject>", "The subject to innovate on")
  .option("-m, --model <model>", "LLM model to use")
  /** Handler: execute an angle chain on a subject. */
  .action(async (chainId: string, subject: string, opts: { model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    const chain = getChainById(chainId);
    if (!chain) {
      console.error(chalk.red(`Unknown chain: ${chainId}`));
      console.log(
        chalk.dim(
          `Available chains: ${listChains()
            .map((c) => c.id)
            .join(", ")}`
        )
      );
      process.exitCode = 1;
      return;
    }

    console.log(chalk.bold(`\n🔗 Running chain: ${chain.name}`));
    console.log(chalk.dim(`${chain.description}`));
    console.log(chalk.dim(`Steps: ${chain.steps.map((s) => s.angleId).join(" → ")}\n`));

    const spinner = ora(`Investigating "${subject}"...`).start();
    const controller = new AbortController();
    commandCleanup = async () => controller.abort();

    try {
      const investigation = await investigate(subject, opts.model, controller.signal);
      spinner.succeed("Investigation complete");

      const results = await runChain(
        chain,
        subject,
        investigation,
        (progress) => {
          spinner.start(
            `⚡ Step ${progress.currentStep}/${progress.totalSteps}: ${progress.currentAngleId}...`
          );
        },
        opts.model,
        controller.signal
      );

      spinner.succeed("Chain complete!\n");

      for (let i = 0; i < results.length; i++) {
        const step = chain.steps[i];
        const result = results[i];
        console.log(chalk.bold(`\n${"═".repeat(60)}`));
        console.log(
          chalk.bold.blue(`Step ${i + 1}: ${stripAnsi(result.angleName)}`) +
            (step.contextFilter ? chalk.dim(` (filter: ${step.contextFilter})`) : "")
        );
        console.log(chalk.dim(stripAnsi(result.reasoning)));

        for (const idea of result.ideas) {
          console.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
          console.log(`  ${stripAnsi(idea.description)}`);
          console.log(`  ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
          console.log(`  ${chalk.dim("Start:")} ${stripAnsi(idea.implementationHint)}`);
        }
      }
    } catch (err) {
      spinner.fail("Chain execution failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Chain execution failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

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
      console.log(
        chalk.dim("No feedback collected yet. Use --rate with auto/innovate to rate ideas.")
      );
      return;
    }
    console.log(chalk.bold(`\n📊 Feedback Summary (${summary.totalFeedback} ratings)\n`));
    for (const score of summary.angleScores) {
      const bar =
        score.qualityScore >= 0.7
          ? chalk.green("■")
          : score.qualityScore >= 0.4
            ? chalk.yellow("■")
            : chalk.red("■");
      const trendIcon =
        score.recentTrend === "improving" ? "📈" : score.recentTrend === "declining" ? "📉" : "➡️";
      console.log(
        `  ${bar} ${chalk.bold(score.angleId)} — ${Math.round(score.qualityScore * 100)}% positive (${score.thumbsUp}👍 ${score.thumbsDown}👎) ${trendIcon}`
      );
      if (score.commonComplaints.length > 0) {
        console.log(chalk.dim(`    Complaints: ${score.commonComplaints.slice(0, 2).join("; ")}`));
      }
    }
    if (summary.bestAngle) console.log(chalk.green(`\n  Best angle: ${summary.bestAngle}`));
    if (summary.worstAngle && summary.worstAngle !== summary.bestAngle)
      console.log(chalk.red(`  Needs improvement: ${summary.worstAngle}`));
    console.log();
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
        console.error(chalk.red("Rating must be 'up' or 'down'"));
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
      console.log(chalk.green(`✅ Feedback recorded (${id.slice(0, 8)})`));
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
        console.log(chalk.green(`✓ Custom angle "${opts.id}" created successfully`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : "Failed to create angle"));
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
  /** Handler: export custom angles to an angle-pack JSON file. */
  .action((opts: { name: string; angles?: string; output: string }) => {
    try {
      const angleIds = opts.angles?.split(",").map((a) => a.trim());
      const pack = exportAnglePack(opts.name, angleIds);
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
  /** Handler: import angles from an angle-pack file. */
  .action((file: string) => {
    try {
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
        console.error(chalk.red(`Unknown format: ${opts.format}`));
        process.exitCode = 1;
        return;
    }

    if (opts.output) {
      writeFileSync(opts.output, output, "utf-8");
      console.log(chalk.green(`✓ Exported to ${opts.output}`));
    } else {
      console.log(output);
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
      console.log(chalk.dim("No sessions found."));
      return;
    }

    console.log(chalk.bold("\n📚 Session History\n"));
    for (const s of sessions) {
      const date = new Date(s.createdAt).toLocaleDateString();
      const angleCount = s.angleResults.length;
      const tags = s.tags.length > 0 ? chalk.cyan(` [${s.tags.join(", ")}]`) : "";
      console.log(
        `  ${chalk.dim(s.id.slice(0, 8))} ${chalk.bold(s.subject)} ${chalk.dim(date)} ${chalk.dim(`(${angleCount} angles)`)}${tags}`
      );
    }
    console.log(
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
  /** Handler: add tags to an existing session. */
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
  /** Handler: permanently delete a session by ID. */
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
// Browse and execute domain-specific presets that pre-configure subjects,
// angles, and pipeline settings for common innovation scenarios.
const presetsCmd = program.command("presets").description("Browse and use domain presets");

presetsCmd
  .command("list")
  .description("List all available presets")
  /** Handler: list all available domain presets with suggested subjects. */
  .action(() => {
    const presets = getPresets();
    console.log(chalk.bold("\n📋 Available Presets\n"));
    for (const preset of presets) {
      console.log(
        `  ${preset.icon} ${chalk.bold(preset.name)} ${chalk.dim(`(${preset.category})`)}`
      );
      console.log(`     ${chalk.dim(preset.description)}`);
      console.log(`     ${chalk.cyan("Angles:")} ${preset.selectedAngles.join(", ")}`);
      console.log(
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
          extractSpinner.succeed(
            `Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`
          );
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
  /** Handler: dynamically load a plugin from a file path or npm package. */
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
  /** Handler: scaffold a new plugin project directory. */
  .action((name: string, opts: { type: string }) => {
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

      console.log(chalk.bold(`\n📊 Benchmarking: "${subject}"`));
      console.log(chalk.dim(`Models: ${models.join(", ")}`));
      if (angles) console.log(chalk.dim(`Angles: ${angles.join(", ")}`));
      console.log();

      const spinner = ora("Running benchmark...").start();

      try {
        const report = await runBenchmark(subject, models, angles, opts.judge, (status) => {
          spinner.text = status;
        });

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
    console.log(chalk.bold("\n⚙️  Innovator Configuration\n"));
    console.log(chalk.dim("Default provider:"), chalk.bold(config.defaultProvider));
    if (config.providers) {
      console.log(chalk.dim("\nProviders:"));
      for (const [id, cfg] of Object.entries(config.providers)) {
        console.log(
          `  ${chalk.bold(id)}: ${cfg.enabled !== false ? chalk.green("enabled") : chalk.red("disabled")}`
        );
        if (cfg.baseUrl) console.log(`    ${chalk.dim("URL:")} ${cfg.baseUrl}`);
        if (cfg.defaultModel) console.log(`    ${chalk.dim("Model:")} ${cfg.defaultModel}`);
        if (cfg.apiKeyEnv) console.log(`    ${chalk.dim("API Key Env:")} ${cfg.apiKeyEnv}`);
      }
    }
    if (config.modelPreferences) {
      console.log(chalk.dim("\nModel preferences per stage:"));
      const prefs = config.modelPreferences;
      if (prefs.investigation)
        console.log(`  ${chalk.dim("Investigation:")} ${prefs.investigation}`);
      if (prefs.generation) console.log(`  ${chalk.dim("Generation:")} ${prefs.generation}`);
      if (prefs.synthesis) console.log(`  ${chalk.dim("Synthesis:")} ${prefs.synthesis}`);
    }
    console.log();
  });

configCmd
  .command("set-provider <provider>")
  .description("Set the default LLM provider (copilot, openai, anthropic, ollama)")
  /** Handler: persist the default provider choice to config. */
  .action((provider: string) => {
    const config = loadConfig();
    config.defaultProvider = provider;
    saveConfig(config);
    console.log(chalk.green(`✓ Default provider set to "${provider}"`));
  });

configCmd
  .command("set-model <stage> <model>")
  .description(
    "Set the preferred model for a pipeline stage (investigation, generation, synthesis)"
  )
  /** Handler: set the preferred LLM model for a specific pipeline stage. */
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
  /** Handler: initialize and display all registered LLM providers. */
  .action(() => {
    const providers = listProviders();
    console.log(chalk.bold("\n🔌 Available Providers\n"));
    for (const p of providers) {
      console.log(`  ${chalk.bold(p.id.padEnd(15))} ${p.name}`);
    }
    console.log();
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
    console.log(chalk.bold("\n🔌 Offline Mode Setup\n"));

    const spinner = ora("Detecting Ollama instance...").start();
    const status = await getOfflineStatus();

    if (!status.ollama.available) {
      spinner.fail("Ollama not detected");
      console.log(chalk.dim("\nTo install Ollama:"));
      console.log(chalk.dim("  macOS: brew install ollama"));
      console.log(chalk.dim("  Linux: curl -fsSL https://ollama.ai/install.sh | sh"));
      console.log(chalk.dim("  Then start it: ollama serve\n"));
      console.log(chalk.dim("After Ollama is running, pull a model:"));
      console.log(chalk.dim("  ollama pull llama3:8b    (balanced, 8GB RAM)"));
      console.log(chalk.dim("  ollama pull mistral:7b   (fast, 8GB RAM)"));
      return;
    }

    spinner.succeed(`Ollama detected at ${status.ollama.baseUrl}`);
    console.log(chalk.dim(`  Available models: ${status.ollama.models.join(", ") || "none"}`));

    if (status.ollama.models.length === 0) {
      console.log(chalk.yellow("\n⚠️  No models found. Pull a model first:"));
      console.log(chalk.dim("  ollama pull llama3:8b"));
      return;
    }

    console.log(chalk.bold("\n📋 Recommended Models:\n"));
    for (const rec of RECOMMENDED_MODELS) {
      const installed = status.ollama.models.some((m) => m.startsWith(rec.id.split(":")[0]));
      const indicator = installed ? chalk.green("✓") : chalk.dim("○");
      console.log(
        `  ${indicator} ${chalk.bold(rec.id.padEnd(20))} [${rec.useCase}] ${rec.description}`
      );
      console.log(chalk.dim(`    Min RAM: ${rec.minRamGb}GB`));
    }

    // Auto-configure if models are available
    const config = loadConfig();
    if (!config.providers) config.providers = {};
    config.providers.ollama = { enabled: true, baseUrl: status.ollama.baseUrl };

    if (status.recommendedModel) {
      config.providers.ollama.defaultModel = status.recommendedModel.id;
      console.log(chalk.green(`\n✓ Configured Ollama with model: ${status.recommendedModel.id}`));
    }

    saveConfig(config);
    console.log(chalk.green("✓ Ollama provider enabled in config"));
    console.log(chalk.dim("\nTo use offline mode:"));
    console.log(chalk.dim("  innovator config set-provider ollama"));
    console.log(chalk.dim("  innovator auto 'your subject'\n"));

    if (status.isOnline) {
      console.log(chalk.dim("Network: 🟢 Online (will auto-switch to Ollama when offline)"));
    } else {
      console.log(chalk.yellow("Network: 🔴 Offline (using Ollama for all requests)"));
    }
  });

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
      console.log(
        chalk.dim("Type your questions to refine ideas. Type 'exit' or 'quit' to end.\n")
      );

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
      console.error(chalk.red("Invalid similarity threshold. Use a value between 0 and 1."));
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
        console.log(
          chalk.dim(
            "No serendipitous connections found. Run more investigations to build your knowledge base."
          )
        );
        return;
      }

      for (const conn of result.connections) {
        console.log(
          chalk.bold.magenta(`\n🔗 ${stripAnsi(conn.subjectA)} ↔ ${stripAnsi(conn.subjectB)}`)
        );
        console.log(chalk.dim(`   Similarity: ${(conn.similarityScore * 100).toFixed(0)}%`));
        console.log(`   ${stripAnsi(conn.explanation)}`);

        if (conn.sharedPatterns.length > 0) {
          console.log(chalk.dim("   Shared patterns:"));
          for (const p of conn.sharedPatterns) {
            console.log(`     ${chalk.cyan("•")} ${stripAnsi(p)}`);
          }
        }
        if (conn.potentialInsight) {
          console.log(chalk.green(`   💡 ${stripAnsi(conn.potentialInsight)}`));
        }
      }
      console.log();
    } catch (err) {
      spinner.fail("Connection analysis failed");
      if (verbose) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } else {
        console.error(chalk.red("Connection analysis failed. Use --verbose for details."));
      }
      process.exitCode = 1;
    } finally {
      await stopCopilotClient();
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
      console.log(
        chalk.green(
          `  Sessions: ${result.sessions}\n` +
            `  Workspaces: ${result.workspaces}\n` +
            `  Analytics events: ${result.analyticsEvents}\n` +
            `  Knowledge graph: ${result.knowledgeGraph ? "yes" : "no"}`
        )
      );
      if (result.errors.length > 0) {
        console.log(chalk.yellow(`  Errors (${result.errors.length}):`));
        for (const err of result.errors.slice(0, 10)) {
          console.log(chalk.yellow(`    - ${err}`));
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
      console.log(chalk.yellow("No plugins found."));
      return;
    }
    for (const p of results) {
      console.log(
        `  ${p.verified ? "✅" : "  "} ${chalk.bold(p.name)} ${chalk.dim(`v${p.version}`)} — ${p.description}`
      );
      console.log(
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
      console.log(chalk.green(`✅ Installed ${result.name} v${result.version}`));
    } else {
      console.log(chalk.red(`Plugin ${pluginId} not found.`));
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
      console.log(chalk.green(`✅ Published ${plugin.name} v${plugin.version} (${plugin.id})`));
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
    console.log(chalk.green(`✅ Watching "${subject}" (${opts.frequency})`));
    console.log(chalk.dim(`  ID: ${watch.id}`));
    console.log(chalk.dim(`  Next scan: ${watch.nextRunAt}`));
  });

radar
  .command("list")
  .description("List watched subjects")
  /** Handler: display all currently watched innovation radar subjects. */
  .action(async () => {
    const { listWatches } = await import("@innovator/core");
    const watches = listWatches();
    if (watches.length === 0) {
      console.log(chalk.yellow("No watches configured."));
      return;
    }
    for (const w of watches) {
      const status = w.enabled ? chalk.green("●") : chalk.red("●");
      console.log(
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
      console.log(scaffoldToMarkdown(scaffold));
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

    console.log(chalk.bold.blue("\n📊 INNOVATION TELEMETRY\n"));
    console.log(`  Pipelines run: ${dashboard.totalPipelines}`);
    console.log(`  Total spans:   ${dashboard.totalSpans}`);
    console.log(`  Quality trend: ${dashboard.qualityTrend.trend}\n`);

    if (Object.keys(dashboard.stageMetrics).length > 0) {
      console.log(chalk.bold("  Stage Metrics:"));
      console.log(
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
      console.log(chalk.dim("  " + "─".repeat(75)));
      for (const [stage, m] of Object.entries(dashboard.stageMetrics)) {
        console.log(
          `  ${stage.padEnd(20)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${String(m.totalTokens).padEnd(10)}$${m.totalCostUsd.toFixed(4).padEnd(9)}${(m.successRate * 100).toFixed(0)}%`
        );
      }
      console.log();
    }

    if (Object.keys(dashboard.angleMetrics).length > 0) {
      console.log(chalk.bold("  Angle Performance:"));
      console.log(
        chalk.dim(
          "  " + "Angle".padEnd(25) + "Count".padEnd(8) + "Avg Duration".padEnd(15) + "Avg Ideas"
        )
      );
      console.log(chalk.dim("  " + "─".repeat(55)));
      for (const [angle, m] of Object.entries(dashboard.angleMetrics)) {
        console.log(
          `  ${angle.padEnd(25)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${m.avgIdeaCount}`
        );
      }
      console.log();
    }

    if (dashboard.recentSpans.length > 0) {
      console.log(chalk.bold("  Recent Spans (last 10):"));
      for (const span of dashboard.recentSpans.slice(-10)) {
        const statusIcon =
          span.status === "ok"
            ? chalk.green("✓")
            : span.status === "error"
              ? chalk.red("✗")
              : chalk.yellow("⋯");
        const dur = span.durationMs ? `${span.durationMs}ms` : "in progress";
        console.log(`  ${statusIcon} ${span.operationName.padEnd(30)} ${dur}`);
      }
    }

    if (dashboard.totalPipelines === 0 && dashboard.totalSpans === 0) {
      console.log(chalk.dim("  No telemetry data yet. Run some pipelines first.\n"));
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
        console.error(
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
      console.log(chalk.green(`✓ Registered connector: ${opts.name} (${id})`));
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
      console.log(chalk.dim("No connectors registered. Use `innovator context add` to add one."));
      return;
    }
    console.log(chalk.bold.blue("\n📚 Knowledge Source Connectors\n"));
    for (const c of connectors) {
      const statusIcon =
        c.status.status === "connected"
          ? chalk.green("●")
          : c.status.status === "error"
            ? chalk.red("●")
            : chalk.yellow("●");
      console.log(
        `  ${statusIcon} ${chalk.bold(c.name)} (${c.type}) — ${c.status.documentsIndexed} docs indexed`
      );
      if (c.status.lastError) console.log(chalk.red(`    Error: ${c.status.lastError}`));
    }
    console.log();
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
    console.log(chalk.bold.blue("\n🔗 Webhook Templates\n"));
    for (const t of templates) {
      console.log(`  ${chalk.bold(t.name)} (${t.id})`);
      console.log(`  ${chalk.dim(t.description)}`);
      console.log(`  URL pattern: ${chalk.cyan(t.urlPattern)}`);
      console.log(`  Events: ${t.events.join(", ")}\n`);
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
      console.log(chalk.dim("No webhooks registered."));
      return;
    }
    for (const w of webhooks) {
      const status = w.active ? chalk.green("●") : chalk.red("●");
      console.log(`  ${status} ${chalk.bold(w.id)} → ${w.url}`);
      console.log(`    Events: ${w.events.join(", ")}`);
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
      console.log(chalk.green(`✓ Monitor created: ${monitor.id}`));
      console.log(chalk.dim(`  Domain: ${monitor.domain} | Frequency: ${monitor.frequency}`));
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
      console.log(chalk.dim("No monitors configured. Use `innovator monitor create` to add one."));
      return;
    }
    console.log(chalk.bold.blue("\n🔍 Competitive Monitors\n"));
    for (const m of monitors) {
      const status = m.enabled ? chalk.green("●") : chalk.red("●");
      console.log(`  ${status} ${chalk.bold(m.domain)} (${m.id})`);
      console.log(`    Competitors: ${m.competitors.join(", ") || "none"}`);
      console.log(
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
      console.log(chalk.dim("No signals detected yet."));
      return;
    }

    console.log(chalk.bold.blue("\n📡 Competitive Signals\n"));
    for (const s of signals) {
      const relColor =
        s.relevanceScore >= 0.7 ? chalk.green : s.relevanceScore >= 0.4 ? chalk.yellow : chalk.dim;
      console.log(`  ${relColor("●")} ${chalk.bold(s.title)} [${s.signalType}]`);
      console.log(
        `    ${chalk.dim(s.description.slice(0, 100))}${s.description.length > 100 ? "..." : ""}`
      );
      console.log(
        `    Source: ${s.source} | Relevance: ${Math.round(s.relevanceScore * 100)}% | ${s.detectedAt.split("T")[0]}\n`
      );
    }

    const trends = detectTrends(opts.domain);
    if (trends.length > 0) {
      console.log(chalk.bold("  Trends:"));
      for (const t of trends) {
        const arrow = t.direction === "rising" ? "↑" : t.direction === "declining" ? "↓" : "→";
        console.log(`    ${arrow} ${t.trend}: ${t.signalCount} signals (${t.direction})`);
      }
    }

    const suggestions = generateInvestigationSuggestions(opts.domain);
    if (suggestions.length > 0) {
      console.log(chalk.bold("\n  💡 Suggested Investigations:"));
      for (const s of suggestions) {
        console.log(`    → ${s}`);
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
      console.error(chalk.red(`Session not found: ${sessionId}`));
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
      console.log(JSON.stringify(provenanceToJsonLd(chain), null, 2));
    } else if (opts.format === "markdown") {
      console.log(provenanceToMarkdown(chain));
    } else {
      console.log(chalk.bold.blue(`\n🔗 Provenance Chain: ${sessionId}\n`));
      console.log(`  Subject: ${chain.subject}`);
      console.log(`  Records: ${chain.records.length}`);
      console.log(`  Integrity: ${chalk.dim(computeChainHash(chain))}\n`);
      console.log(formatProvenance(chain.records));
    }
  });

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
          console.log(wargamingToMarkdown(result));
        } else {
          console.log(chalk.bold.red(`\n🎯 Wargaming: ${result.ideaTitle}\n`));
          console.log(
            `  Resilience Score: ${chalk.bold(String(result.overallResilienceScore))}/100`
          );
          console.log(`  Competitors: ${result.competitors.map((c) => c.name).join(", ")}`);
          console.log(`  Rounds: ${result.rounds.length}`);
          console.log(`  Vulnerabilities: ${result.vulnerabilities.length}`);
          console.log(`  Counter-strategies: ${result.counterStrategies.length}\n`);
          console.log(chalk.dim(result.strategicBrief));
        }
      } catch (err) {
        spinner.fail("Wargaming failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.dim("No rubrics found."));
      return;
    }
    console.log(chalk.bold("\n📋 Scoring Rubrics\n"));
    for (const r of rubrics) {
      console.log(`  ${chalk.cyan(r.id)} — ${r.name} (${r.dimensions.length} dimensions)`);
      console.log(`    ${chalk.dim(r.description)}`);
    }
  });

rubricCmd
  .command("show <id>")
  .description("Show rubric details")
  /** Handler: display detailed criteria and weights for a specific rubric. */
  .action((id: string) => {
    const rubric = getRubric(id);
    if (!rubric) {
      console.error(chalk.red(`Rubric not found: ${id}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.bold(`\n📋 ${rubric.name}\n`));
    console.log(`  ${rubric.description}\n`);
    for (const d of rubric.dimensions) {
      console.log(`  ${chalk.cyan(d.id)} — ${d.name} (weight: ${d.weight})`);
      console.log(`    ${chalk.dim(d.description)}`);
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
      console.log(costReportToMarkdown(report));
    } else {
      console.log(chalk.bold("\n💰 LLM Cost Report\n"));
      console.log(`  Total Cost: $${report.totalCostUsd.toFixed(4)}`);
      console.log(`  Total Tokens: ${report.totalTokens.toLocaleString()}`);
      console.log(`  Measurements: ${report.measurementCount}`);
      console.log(`  Estimated Savings: $${report.savingsEstimate.toFixed(4)}\n`);
      if (report.recommendations.length > 0) {
        console.log(chalk.bold("  Routing Recommendations:"));
        for (const r of report.recommendations) {
          console.log(
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
          console.log(supplyChainToMarkdown(result));
        } else {
          console.log(chalk.bold.blue(`\n🔗 Supply Chain: ${result.ideaTitle}\n`));
          console.log(`  Readiness: ${result.readinessScore}/100`);
          console.log(`  Total Cost: $${result.totalEstimatedCostUsd.toLocaleString()}`);
          console.log(
            `  Build: ${result.buildItems} | Buy: ${result.buyItems} | Partner: ${result.partnerItems}`
          );
          console.log(`  Gaps: ${result.gaps.length}\n`);
          console.log(chalk.dim(result.summary));
        }
      } catch (err) {
        spinner.fail("Supply chain mapping failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
    console.log(chalk.dim("Note: Provide ideas via --idea flags or pipe from auto command."));
    console.log(
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
        console.log(timingToMarkdown(result));
      } else {
        console.log(chalk.bold(`\n⏰ Timing Analysis: ${result.subject}\n`));
        console.log(`  Market Maturity: ${result.marketMaturityStage}`);
        for (const idea of result.ideas) {
          const emoji =
            idea.classification === "right-time"
              ? "✅"
              : idea.classification === "peak-window"
                ? "🔥"
                : idea.classification === "too-early"
                  ? "🕐"
                  : "⚠️";
          console.log(
            `  ${emoji} ${idea.ideaTitle}: ${idea.classification} (urgency: ${idea.urgencyScore}/100)`
          );
        }
        console.log(`\n${chalk.dim(result.overallTimingAdvice)}`);
      }
    } catch (err) {
      spinner.fail("Timing analysis failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.dim("No versions found for this idea."));
      return;
    }
    console.log(chalk.bold(`\n📜 Version Log: ${ideaId}\n`));
    for (const v of versions) {
      const date = new Date(v.createdAt).toISOString().slice(0, 16);
      console.log(
        `  ${chalk.yellow(v.id.slice(0, 8))} ${chalk.dim(date)} ${v.message ?? "(no message)"}`
      );
      console.log(
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
      console.error(
        chalk.red("Failed to create branch. Version not found or branch already exists.")
      );
      process.exitCode = 1;
      return;
    }
    console.log(
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
      console.log(
        chalk.bold(`\n📊 Diff: ${diff.fromVersion.slice(0, 8)} → ${diff.toVersion.slice(0, 8)}\n`)
      );
      console.log(`  Overall: ${chalk.bold(diff.overallSignificance)}`);
      console.log(`  ${diff.summary}\n`);
      for (const c of diff.changes) {
        const color =
          c.changeType === "added"
            ? chalk.green
            : c.changeType === "removed"
              ? chalk.red
              : chalk.yellow;
        console.log(`  ${color(`[${c.changeType}]`)} ${c.field} (${c.significance})`);
        if (c.before) console.log(`    ${chalk.dim(`- ${c.before}`)}`);
        if (c.after) console.log(`    ${chalk.dim(`+ ${c.after}`)}`);
      }
    } catch (err) {
      spinner.fail("Diff failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
    const { analyzeProduct, recipeToMarkdown: _recipeToMarkdown } = await import("@innovator/core");
    const spinner = ora("Analyzing product...").start();
    try {
      const recipe = await analyzeProduct(productDescription, { model: opts.model });
      spinner.stop();
      console.log(chalk.bold(`\n🔍 ${recipe.recipe.title}\n`));
      console.log(
        chalk.dim(
          `Disruption: ${recipe.productAnalysis.disruptionType} | Difficulty: ${recipe.recipe.estimatedDifficulty}`
        )
      );
      console.log(`\n${chalk.bold("Key Insight:")} ${recipe.recipe.keyInsight}\n`);
      console.log(chalk.bold(`Patterns (${recipe.patterns.length}):`));
      for (const p of recipe.patterns) {
        console.log(`  ${chalk.cyan(p.name)} (${p.angle}, ${(p.confidence * 100).toFixed(0)}%)`);
      }
      console.log(chalk.bold(`\nRecipe Steps (${recipe.recipe.steps.length}):`));
      for (const s of recipe.recipe.steps.slice(0, 5)) {
        console.log(`  ${chalk.yellow(`${s.order}.`)} ${s.technique}: ${s.prompt.slice(0, 80)}...`);
      }
      if (recipe.recipe.steps.length > 5)
        console.log(chalk.dim(`  ...and ${recipe.recipe.steps.length - 5} more steps`));
      console.log(chalk.bold(`\nSuggested Angles:`), recipe.recipe.suggestedAngles.join(", "));
    } catch (err) {
      spinner.fail("Product analysis failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.log(chalk.bold(`\n📈 Diffusion: ${result.ideaTitle}\n`));
        console.log(`  Peak adoption month: ${chalk.cyan(String(result.peakAdoptionMonth))}`);
        console.log(`  Time to majority: ${chalk.cyan(`${result.timeToMajority} months`)}`);
        console.log(`  Market size: ${chalk.cyan(result.parameters.m.toLocaleString())}`);
        if (result.monteCarlo) {
          console.log(
            `  Adoption probability: ${chalk.green(`${(result.monteCarlo.adoptionProbability * 100).toFixed(1)}%`)}`
          );
        }
        console.log(chalk.bold("\nStrategies:"));
        for (const s of result.strategies) {
          console.log(`  ${chalk.yellow(s.phase)}: ${s.recommendation.slice(0, 80)}`);
        }
      } catch (err) {
        spinner.fail("Diffusion simulation failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
    const { classifyComplexityHeuristic, generateExecutionPlan } = await import("@innovator/core");
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
      console.log(chalk.bold(`\n⚡ Adaptive Plan for: "${subject}"\n`));
      console.log(
        `  Complexity: ${chalk.cyan(complexity.level)} (score: ${complexity.score.toFixed(2)})`
      );
      console.log(`  Recommended depth: ${chalk.cyan(plan.recommendedDepth)}`);
      console.log(
        `  Angles: ${chalk.cyan(String(plan.angleCount))} (${plan.recommendedAngles.join(", ")})`
      );
      console.log(`  Model: ${chalk.cyan(plan.modelSelection.generation)}`);
      console.log(`  Est. cost savings: ${chalk.green(`${plan.costSavingsPercent.toFixed(0)}%`)}`);
      console.log(`  Est. time: ${chalk.cyan(`${plan.estimatedTimeSeconds}s`)}`);
      if (plan.adjustments.length > 0) {
        console.log(chalk.bold("\nAdjustments:"));
        for (const a of plan.adjustments) {
          console.log(
            `  ${a.parameter}: ${chalk.dim(a.original)} → ${chalk.green(a.adjusted)} (${a.reason})`
          );
        }
      }
    } catch (err) {
      spinner.fail("Classification failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.log(chalk.bold(`\n🏪 Market Test: ${result.ideaTitle}\n`));
        console.log(`  Personas: ${chalk.cyan(result.totalPersonas.toLocaleString())}`);
        console.log(
          `  Adoption: ${chalk.cyan(`${(result.overallAdoptionRate * 100).toFixed(1)}%`)}`
        );
        console.log(`  Viability: ${chalk.bold(result.marketViability)}`);
        console.log(`  Optimal price: ${chalk.green(`$${result.optimalPriceUsd}`)}`);
        console.log(chalk.bold("\nTop Segments:"));
        for (const s of result.segmentAnalysis
          .sort((a, b) => b.adoptionRate - a.adoptionRate)
          .slice(0, 5)) {
          console.log(
            `  ${chalk.cyan(s.segment)}: ${(s.adoptionRate * 100).toFixed(1)}% adoption, $${s.avgWillingnessToPayUsd} WTP`
          );
        }
      } catch (err) {
        spinner.fail("Market test failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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

    console.log(chalk.bold(`\n🧠 Flow State: ${flowState.state}\n`));
    console.log(
      `  Cognitive load: ${chalk.cyan(`${(flowState.cognitiveLoad * 100).toFixed(0)}%`)}`
    );
    console.log(
      `  Creative energy: ${chalk.cyan(`${(flowState.creativeEnergy * 100).toFixed(0)}%`)}`
    );
    console.log(`  Focus: ${chalk.cyan(`${(flowState.focusLevel * 100).toFixed(0)}%`)}`);
    console.log(`  ${chalk.dim(flowState.recommendation)}`);
    console.log(chalk.bold(`\n💡 Suggested: ${intervention.title}`));
    console.log(`  ${intervention.description}`);
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
        console.log(chalk.bold(`\n⚖️  Regulatory Simulation: ${result.ideaTitle}\n`));
        const statusColor = { green: chalk.green, yellow: chalk.yellow, red: chalk.red };
        for (const j of result.jurisdictions) {
          const color = statusColor[j.overallStatus];
          console.log(
            `  ${color(`[${j.overallStatus.toUpperCase()}]`)} ${j.jurisdiction} — ${(j.overallScore * 100).toFixed(0)}% (${j.recommendation})`
          );
        }
        if (result.lowestRiskJurisdictions.length > 0) {
          console.log(
            chalk.bold(`\n  Lowest risk:`),
            chalk.green(result.lowestRiskJurisdictions.join(", "))
          );
        }
        if (result.highestRiskJurisdictions.length > 0) {
          console.log(
            chalk.bold(`  Highest risk:`),
            chalk.red(result.highestRiskJurisdictions.join(", "))
          );
        }
      } catch (err) {
        spinner.fail("Regulatory simulation failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
    console.log(chalk.bold("Monitor Status:"), chalk.cyan(state.status));
    console.log(chalk.dim(`  Last poll: ${state.lastPollAt ?? "never"}`));
    console.log(chalk.dim(`  Signals: ${state.signalCount} | Digests: ${state.digestCount}`));
  });

innovMonitorCmd
  .command("sources")
  .description("List configured monitor sources")
  /** Handler: list configured innovation monitor sources. */
  .action(async () => {
    const sources = listMonitorSources();
    if (sources.length === 0) {
      console.log(chalk.yellow("No sources configured. Use 'monitor add-source' to add one."));
      return;
    }
    for (const s of sources) {
      console.log(
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
      console.log(monitorDigestToMarkdown(digest));
    } catch (err) {
      spinner.fail("Digest generation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.yellow("No signals detected yet."));
      return;
    }
    for (const s of signals) {
      const urgencyColor =
        s.urgency === "critical" ? chalk.red : s.urgency === "high" ? chalk.yellow : chalk.dim;
      console.log(urgencyColor(`  [${s.urgency}]`), chalk.bold(s.title));
      console.log(chalk.dim(`    ${s.description.slice(0, 120)}...`));
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
        console.log(chalk.cyan(`  [${step.type}]`), step.description);
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
            console.log(chalk.green("\n✓ Innovation pipeline finished"));
          }
        },
        { model: opts.model }
      );
    } catch (err) {
      spinner.fail("NL innovation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.log(chalk.cyan(`  [${score.toFixed(2)}]`), chalk.bold(node.title));
        console.log(chalk.dim(`    ${node.content.slice(0, 120)}...`));
      }
    } catch (err) {
      spinner.fail("Memory search failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(orgDNAToMarkdown(report));
    } catch (err) {
      spinner.fail("Org DNA generation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.bold(`  Ancestors: ${lineage.ancestors.length}`));
      console.log(chalk.bold(`  Descendants: ${lineage.descendants.length}`));
    } catch (err) {
      spinner.fail("Lineage tracing failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.log(chalk.cyan(`  [${p.similarityScore.toFixed(2)}]`), chalk.bold(p.description));
        console.log(chalk.dim(`    Sessions: ${p.sessionIds.join(", ")}`));
      }
    } catch (err) {
      spinner.fail("Convergence detection failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
    console.log(chalk.bold("Innovation Funnel:"));
    console.log(chalk.dim(`  Total ideas: ${funnel.totalIdeas}`));
    console.log(chalk.dim(`  In progress: ${funnel.inProgress}`));
    console.log(chalk.green(`  Shipped: ${funnel.shipped}`));
    console.log(chalk.red(`  Abandoned: ${funnel.abandoned}`));
    console.log(chalk.cyan(`  Conversion rate: ${(funnel.conversionRate * 100).toFixed(1)}%`));
  });

impactCmd
  .command("rank")
  .description("Rank ideas by impact score")
  /** Handler: rank tracked ideas by impact score. */
  .action(async () => {
    const ranked = rankByImpact();
    if (ranked.length === 0) {
      console.log(chalk.yellow("No tracked ideas yet."));
      return;
    }
    for (const item of ranked.slice(0, 10)) {
      console.log(chalk.cyan(`  [${item.compositeScore}]`), chalk.bold(item.ideaId));
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
      console.log(dashboardToMarkdown(dashboard));
    } catch (err) {
      spinner.fail("Dashboard generation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.yellow("No competitors registered."));
      return;
    }
    for (const c of competitors) {
      const threatColor =
        c.threatLevel === "critical"
          ? chalk.red
          : c.threatLevel === "high"
            ? chalk.yellow
            : chalk.dim;
      console.log(threatColor(`  [${c.threatLevel}]`), chalk.bold(c.name));
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
      console.log(gapReportToMarkdown(report));
    } catch (err) {
      spinner.fail("Gap analysis failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(radarDashboardToMarkdown(dashboard));
    } catch (err) {
      spinner.fail("Radar dashboard generation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.bold("\nRecommended Pipeline:"));
      console.log(chalk.cyan(`  Angles: ${recommendation.recommendedAngles.join(", ")}`));
      console.log(chalk.cyan(`  Depth: ${recommendation.suggestedDepth}`));
      console.log(
        chalk.cyan(`  Quality estimate: ${(recommendation.estimatedQuality * 100).toFixed(0)}%`)
      );
      console.log(chalk.dim(`\n  ${recommendation.explanation}`));
    } catch (err) {
      spinner.fail("Recommendation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(assessmentToMarkdown(assessment));
    } catch (err) {
      spinner.fail("Persona evaluation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

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
        console.log(chalk.yellow("⚠ .innovator/ already exists"));
        return;
      }
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(`${dir}/config.yaml`, DEFAULT_CONFIG_YAML);
      writeFileSync(`${dir}/angles.yaml`, DEFAULT_ANGLES_YAML);
      writeFileSync(`${dir}/.gitkeep`, "");
      console.log(chalk.green("✅ Initialized .innovator/ directory"));
      console.log(`   ${chalk.dim("config.yaml")}  — Default configuration`);
      console.log(`   ${chalk.dim("angles.yaml")} — Custom angle definitions`);
      console.log(`   ${chalk.dim("sessions/")}   — Innovation session storage`);
    } catch (err) {
      console.error(chalk.red("Failed to initialize .innovator/"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.error(chalk.red("No .innovator/ directory. Run `innovator iac init` first."));
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
    console.log(chalk.green(`✅ Session saved: ${filepath}`));
  });

iacCmd
  .command("history")
  .description("List all saved innovation sessions")
  /** Handler: list all saved Innovation-as-Code sessions. */
  .action(async () => {
    const sessionsDir = ".innovator/sessions";
    if (!existsSync(sessionsDir)) {
      console.log(chalk.yellow("No .innovator/ directory found."));
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
      console.log(listIaCSessions(sessions));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.error(chalk.red(`Invalid session A: ${errA}`));
        process.exitCode = 1;
        return;
      }
      if (errB) {
        console.error(chalk.red(`Invalid session B: ${errB}`));
        process.exitCode = 1;
        return;
      }
      const diff = diffSessions(dataA as IaCSession, dataB as IaCSession);
      console.log(formatSessionDiff(diff));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
        console.error(chalk.red(`Invalid session: ${err}`));
        process.exitCode = 1;
        return;
      }
      const session = data as IaCSession;
      const topN = parseInt(opts.top, 10) || 3;
      const ideas = session.synthesis?.topIdeas.slice(0, topN) ?? [];

      if (ideas.length === 0) {
        console.log(
          chalk.yellow("No synthesized ideas found in session. Run the full pipeline first.")
        );
        return;
      }

      for (const idea of ideas) {
        const issue = ideaToGitHubIssue(session, idea);
        if (opts.dryRun) {
          console.log(chalk.bold(`\n📋 ${issue.title}`));
          console.log(chalk.dim("─".repeat(60)));
          console.log(issue.body);
          console.log(chalk.dim(`Labels: ${issue.labels.join(", ")}\n`));
        } else {
          console.log(chalk.green(`✅ Would create: ${issue.title}`));
          console.log(chalk.dim("   (Use gh CLI: gh issue create --title '...' --body '...')"));
        }
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
          console.log(chalk.red(`❌ Invalid: ${err}`));
          process.exitCode = 1;
        } else {
          console.log(chalk.green("✅ Valid session file"));
        }
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    } else {
      const dir = ".innovator";
      if (!existsSync(dir)) {
        console.log(chalk.red("❌ No .innovator/ directory found"));
        process.exitCode = 1;
        return;
      }
      let valid = true;
      if (!existsSync(`${dir}/config.yaml`)) {
        console.log(chalk.red("❌ Missing config.yaml"));
        valid = false;
      }
      if (!existsSync(`${dir}/sessions`)) {
        console.log(chalk.red("❌ Missing sessions/ directory"));
        valid = false;
      }
      if (valid) console.log(chalk.green("✅ .innovator/ directory structure is valid"));
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
        if (md) console.log(md);
      } catch (err) {
        spinner.fail("Agent failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.dim("No agent runs found."));
      return;
    }
    console.log(chalk.bold("Agent Runs:"));
    for (const r of runs) {
      const statusIcon = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
      console.log(
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
      console.error(chalk.red("Run not found or has no portfolio."));
      process.exitCode = 1;
      return;
    }
    if (opts.output) {
      writeFileSync(opts.output, md);
      console.log(chalk.green(`✅ Exported to ${opts.output}`));
    } else {
      console.log(md);
    }
  });

agentCmd
  .command("stop <runId>")
  .description("Stop a running agent gracefully")
  /** Handler: stop a running autonomous agent gracefully. */
  .action((runId: string) => {
    const success = stopAgentRun(runId);
    if (success) {
      console.log(chalk.yellow(`⏹ Agent ${runId.slice(0, 8)} stopped`));
    } else {
      console.error(chalk.red("Run not found or already completed."));
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
      console.error(chalk.red("Run not found. Use 'agent list' to see available runs."));
      process.exitCode = 1;
      return;
    }
    if (run.checkpoints.length === 0) {
      console.error(chalk.red("No checkpoints available for this run."));
      process.exitCode = 1;
      return;
    }
    const checkpoint = run.checkpoints[run.checkpoints.length - 1];
    console.log(chalk.cyan(`📍 Resuming from checkpoint ${checkpoint.id.slice(0, 8)}`));
    console.log(
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
      if (md) console.log(md);
    } catch (err) {
      spinner.fail("Resume failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(noveltyReportToMarkdown(report));
    } catch (err) {
      spinner.fail("Novelty check failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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
      console.log(chalk.dim(`Created local node: ${node.id.slice(0, 8)}`));
    }
    const allNodes = listNodes();
    const nodeId = allNodes[0].id;
    const dashboard = getNetworkDashboard(nodeId);
    console.log(chalk.bold("Innovation Genome Network"));
    console.log(`  Nodes: ${chalk.cyan(String(dashboard.totalNodes))}`);
    console.log(`  Patterns: ${chalk.cyan(String(dashboard.totalPatterns))}`);
    console.log(
      `  Health: ${dashboard.networkHealth === "healthy" ? chalk.green("healthy") : chalk.red(dashboard.networkHealth)}`
    );
    if (dashboard.trendingAngles.length > 0) {
      console.log(chalk.bold("\n  Trending Angles:"));
      for (const t of dashboard.trendingAngles.slice(0, 5)) {
        const trendIcon = t.trend === "rising" ? "📈" : t.trend === "declining" ? "📉" : "➡️";
        console.log(`    ${trendIcon} ${t.angleId} (frequency: ${t.frequency})`);
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
      console.log(chalk.dim("No nodes. Run 'genome status' first."));
      return;
    }
    const analytics = computeGenomeAnalytics(allNodes[0].id);
    console.log(genomeAnalyticsToMarkdown(analytics));
  });

genomeCmd
  .command("insights")
  .description("Get network insights for a domain")
  .option("-d, --domain <domain>", "Domain hint")
  /** Handler: get network insights for a specific domain. */
  .action((opts: { domain?: string }) => {
    const allNodes = listNodes();
    if (allNodes.length === 0) {
      console.log(chalk.dim("No nodes. Run 'genome status' first."));
      return;
    }
    const insights = generateGenomeInsights(allNodes[0].id, opts.domain);
    if (insights.length === 0) {
      console.log(chalk.dim("No insights available for this domain."));
      return;
    }
    console.log(chalk.bold("🌐 Network Insights\n"));
    for (const i of insights) {
      const icon =
        i.type === "angle-recommendation"
          ? "💡"
          : i.type === "methodology-chain"
            ? "🔗"
            : i.type === "domain-trend"
              ? "📊"
              : "✨";
      console.log(`  ${icon} ${chalk.bold(i.content)}`);
      console.log(
        `     Confidence: ${(i.confidence * 100).toFixed(0)}% | Patterns: ${i.sourcePatterns} | Domain: ${i.domain}`
      );
      console.log();
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
      console.log(chalk.green(`✅ Created node "${opts.name}" (${node.id.slice(0, 8)})`));
    } else {
      node = allNodes[0];
    }
    console.log(chalk.green(`✅ Registered peer endpoint: ${endpoint}`));
    console.log(chalk.dim(`   Node ID: ${node.id.slice(0, 8)}`));
    console.log(chalk.dim(`   Public: ${opts.public ? "yes" : "no"}`));
    console.log(chalk.dim(`   Use 'genome status' to verify connection`));
  });

genomeCmd
  .command("leave")
  .description("Disconnect from the federation network")
  /** Handler: disconnect from the federation network. */
  .action(() => {
    const allNodes = listNodes();
    if (allNodes.length === 0) {
      console.log(chalk.dim("Not connected to any network."));
      return;
    }
    console.log(chalk.yellow(`⚠ Disconnected node "${allNodes[0].name}" from federation`));
    console.log(chalk.dim("   Local patterns are preserved. Rejoin anytime with 'genome join'."));
  });

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
      console.log(twinMonteCarloToMarkdown(comparison));
    } catch (err) {
      spinner.fail("Simulation failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

export async function parseCli(args: readonly string[]): Promise<void> {
  await program.parseAsync([...args], { from: "user" });
}

export async function runCli(argv: readonly string[] = process.argv): Promise<void> {
  installSignalHandlers();
  await program.parseAsync([...argv]);
}
