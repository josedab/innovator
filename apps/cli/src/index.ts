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
  validateIdeas,
  transformForAudience,
  OUTPUT_MODES,
  runChain,
  getChainById,
  listChains,
  DEFAULT_CHAINS,
  submitFeedback,
  computeAngleScores,
  getFeedbackSummary,
  detectLanguage,
  localizePrompt,
  listLanguages,
  SupportedLanguageSchema,
  detectOllama,
  getOfflineStatus,
  RECOMMENDED_MODELS,
  DEPTH_CONFIGS,
  getDepthConfig,
  suggestDepth,
  DepthSchema,
  parsePipelineRequest,
  resolveAngles,
  runInnovationDiff,
  evaluateConstraints,
  flattenIdeas,
  parseConstraintString,
  findSerendipitousConnections,
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
  createRubric,
  getRubric,
  listRubrics,
  scoreWithRubric,
  generateCostReport,
  costReportToMarkdown,
  recordActivity,
  analyzeTeamDNA,
  teamDNAToMarkdown,
  mapSupplyChain,
  supplyChainToMarkdown,
  optimizePortfolio,
  portfolioOptimizationToMarkdown,
  analyzeTimings,
  timingToMarkdown,
} from "@innovator/core";
import type { AngleId, CustomAngle, ExportData, IdeaScore, InnovatorConfig, ValidationCheck, OutputMode, Depth, AngleChain, Constraint } from "@innovator/core";
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
  .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
  .option("--lang <language>", "Output language: en, es, ja, de, pt")
  .option("--score", "Score and rank ideas after generation")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .action(async (subject: string, opts: { model?: string; depth?: string; lang?: string; score?: boolean; file?: string; url?: string }) => {
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
      console.log(chalk.dim(`💡 Suggested depth for this subject: ${suggestedDepth} (use --depth ${suggestedDepth})`));
    }
    console.log(chalk.dim(`📐 Depth: ${depthConfig.label} — ${depthConfig.description}`));
    console.log(chalk.dim(`⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`));

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
  .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
  .option("--lang <language>", "Output language: en, es, ja, de, pt")
  .option("--score", "Score and rank ideas after generation")
  .option("--validate", "Validate ideas against patent, market, and feasibility checks")
  .option("--audience <mode>", "Generate audience-adapted output (executive, technical, pitch, research)")
  .option("--file <path>", "Use a file or directory as context input")
  .option("--url <url>", "Use a URL as context input")
  .option("--constraint <expr...>", "Apply constraints (e.g., 'budget<50K', 'timeline<3months')")
  .option("--min-confidence <score>", "Minimum investigation confidence score (0-100) before generating ideas")
  .option("--playbook [format]", "Generate an Innovation Playbook (markdown or html)")
  .option("--debate", "Run structured debate on top ideas after synthesis")
  .option("--debate-rounds <n>", "Number of debate rounds (1-5)", "2")
  .option("--decision-packet", "Generate an executive decision packet from results")
  .option("--stress-test", "Run stress test scenarios on top ideas")
  .option("--stakeholders", "Run stakeholder simulation on top ideas")
  .action(async (subject: string, opts: { model?: string; depth?: string; lang?: string; score?: boolean; validate?: boolean; audience?: string; file?: string; url?: string; constraint?: string[]; minConfidence?: string; playbook?: string | boolean; debate?: boolean; debateRounds?: string; decisionPacket?: boolean; stressTest?: boolean; stakeholders?: boolean }) => {
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
      console.log(chalk.dim(`🌐 Language: ${detectedLang}${!opts.lang ? " (auto-detected)" : ""}`));
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
    console.log(chalk.dim(`⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`));

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

      // Check investigation confidence if --min-confidence flag is set
      if (opts.minConfidence && result.investigation) {
        const minConf = parseInt(opts.minConfidence, 10);
        if (isNaN(minConf) || minConf < 0 || minConf > 100) {
          console.error(chalk.red("Invalid --min-confidence value. Use 0-100."));
        } else {
          const confSpinner = ora("📊 Scoring investigation quality...").start();
          try {
            const confidence = await scoreInvestigationQuality(subject, result.investigation, opts.model);
            const passes = meetsConfidenceThreshold(confidence, minConf);
            if (passes) {
              confSpinner.succeed(`Investigation confidence: ${confidence.overallScore}/100 ✓\n`);
            } else {
              confSpinner.warn(`Investigation confidence: ${confidence.overallScore}/100 (below ${minConf} threshold)\n`);
            }

            for (const dim of confidence.dimensions) {
              const color = dim.score >= 70 ? chalk.green : dim.score >= 50 ? chalk.yellow : chalk.red;
              console.log(`  ${color(`${dim.score}`)} ${dim.name}: ${stripAnsi(dim.explanation)}`);
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
            const feasibility = vr.checks.find((c: ValidationCheck) => c.category === "feasibility");
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
          console.error(chalk.red(`Unknown audience mode: ${opts.audience}. Valid: ${OUTPUT_MODES.join(", ")}`));
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
            console.log(`  ${passIcon} ${chalk.bold(stripAnsi(evaluation.ideaTitle))} — score: ${evaluation.score}/100`);
            for (const cr of evaluation.constraintResults) {
              const crIcon = cr.satisfied ? chalk.green("  ✓") : chalk.red("  ✗");
              console.log(`    ${crIcon} ${stripAnsi(cr.dimension)}: ${stripAnsi(cr.explanation)}`);
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
        const debateRounds = Math.min(5, Math.max(1, parseInt(opts.debateRounds ?? "2", 10) || 2));
        const topIdeas = result.synthesis.topIdeas.slice(0, 3);
        const debateSpinner = ora(`🗣️  Debating top ${topIdeas.length} ideas (${debateRounds} rounds)...`).start();
        try {
          for (const topIdea of topIdeas) {
            debateSpinner.text = `🗣️  Debating: ${stripAnsi(topIdea.title)}...`;
            const debateResult = await runDebate(
              { title: topIdea.title, description: topIdea.description, potentialImpact: topIdea.potentialImpact, implementationHint: "" },
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
              { title: topIdea.title, description: topIdea.description, potentialImpact: topIdea.potentialImpact, implementationHint: "" },
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
        const format = typeof opts.playbook === "string" && opts.playbook === "html" ? "html" as const : "markdown" as const;
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

          const filename = `playbook-${subject.slice(0, 30).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.${format === "html" ? "html" : "md"}`;
          const fs = await import("node:fs");
          fs.writeFileSync(filename, playbook.content, "utf-8");
          console.log(chalk.green(`  📄 Saved to ${filename}`));
          console.log(chalk.dim(`  ${playbook.content.length} characters, ${playbook.sections.roadmap.length} phases, ${playbook.sections.risks.length} risks\n`));
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
          const filename = `decision-packet-${subject.slice(0, 30).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
          const fs = await import("node:fs");
          fs.writeFileSync(filename, md, "utf-8");
          console.log(chalk.green(`  📄 Saved to ${filename}`));
          console.log(chalk.dim(`  ${packet.options.length} options, ${packet.risks.length} risks, ${packet.resourceAsk.length} resources\n`));
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
        const stakeholderSpinner = ora(`👥 Simulating stakeholder reactions for ${topIdeas.length} ideas...`).start();
        try {
          const ideas = topIdeas.map((ti) => ({
            title: ti.title,
            description: ti.description,
            potentialImpact: ti.potentialImpact,
            implementationHint: "",
          }));
          const simulations = await simulateStakeholdersBatch(ideas, undefined, opts.model, controller.signal);
          stakeholderSpinner.succeed("Stakeholder simulation complete!\n");

          const matrices = computeReadinessScores(simulations);

          console.log(chalk.bold.blue("👥 STAKEHOLDER SIMULATION\n"));
          for (const sim of simulations) {
            console.log(chalk.bold(`  ${stripAnsi(sim.ideaTitle)}`));
            console.log(chalk.dim("  " + "Persona".padEnd(25) + "Enthusiasm".padEnd(14) + "Likely Action"));
            console.log(chalk.dim("  " + "─".repeat(65)));
            for (const r of sim.reactions) {
              const color = r.enthusiasm >= 7 ? chalk.green : r.enthusiasm >= 4 ? chalk.yellow : chalk.red;
              console.log(`  ${stripAnsi(r.personaName).padEnd(25)}${color(String(r.enthusiasm) + "/10").padEnd(14)}${stripAnsi(r.likelyAction)}`);
            }
            console.log(chalk.dim(`  Consensus: ${sim.consensusScore}/10 | Most enthusiastic: ${sim.mostEnthusiastic} | Most concerned: ${sim.mostConcerned}\n`));
          }

          console.log(chalk.bold.blue("📊 READINESS SCORES\n"));
          console.log(chalk.dim("  " + "Idea".padEnd(40) + "Readiness".padEnd(12) + "Alignment".padEnd(12) + "Support/Oppose/Neutral"));
          console.log(chalk.dim("  " + "─".repeat(85)));
          for (const m of matrices) {
            const readColor = m.readinessScore >= 70 ? chalk.green : m.readinessScore >= 40 ? chalk.yellow : chalk.red;
            const title = stripAnsi(m.ideaTitle).slice(0, 38).padEnd(40);
            console.log(`  ${title}${readColor(`${m.readinessScore}%`).padEnd(12)}${String(Math.round(m.alignmentScore * 100) + "%").padEnd(12)}${m.supportCount}/${m.oppositionCount}/${m.neutralCount}`);
          }
          console.log();
        } catch (err) {
          stakeholderSpinner.fail("Stakeholder simulation failed");
          if (verbose) {
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          }
        }
      }
    } catch (err) {
    } finally {
      commandCleanup = null;
      await stopCopilotClient();
    }
  });

// ---- evolve command ----
program
  .command("evolve")
  .description("Evolve ideas through genetic-algorithm-inspired mutation and crossover")
  .argument("<subject>", "The subject to evolve ideas for")
  .option("-m, --model <model>", "LLM model to use")
  .option("--generations <n>", "Number of evolution generations (1-10)", "3")
  .option("--population <n>", "Population size per generation", "6")
  .action(async (subject: string, opts: { model?: string; generations?: string; population?: string }) => {
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
      const angleResult = await generateForAngle(subject, investigation, "first-principles", opts.model, controller.signal);
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
  });

// ---- diff command ----
program
  .command("diff")
  .description("Compare two snapshots of a subject and generate an innovation diff")
  .argument("<subjectA>", "First snapshot (e.g., 'remote work in 2020')")
  .argument("<subjectB>", "Second snapshot (e.g., 'remote work in 2026')")
  .option("-m, --model <model>", "LLM model to use")
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
        const sig = item.significance === "high" ? chalk.red("●") : item.significance === "medium" ? chalk.yellow("●") : chalk.dim("●");
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
program
  .command("run")
  .description("Run a pipeline described in natural language")
  .argument("<description>", "Plain English description of what pipeline to run")
  .option("-m, --model <model>", "LLM model to use")
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
const chainCmd = program
  .command("chain")
  .description("Run pre-defined angle chains for composed innovation");

chainCmd
  .command("list")
  .description("List available angle chains")
  .action(() => {
    console.log(chalk.bold("\n🔗 Available Angle Chains\n"));
    for (const chain of listChains()) {
      console.log(`  ${chalk.bold.cyan(chain.id)} — ${chain.name}`);
      console.log(`  ${chalk.dim(chain.description)}`);
      console.log(
        `  Steps: ${chain.steps.map((s) => s.angleId).join(" → ")}\n`
      );
    }
  });

chainCmd
  .command("run")
  .description("Run an angle chain")
  .argument("<chainId>", "Chain ID to run (e.g., deep-disruption)")
  .argument("<subject>", "The subject to innovate on")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (chainId: string, subject: string, opts: { model?: string }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (!validateModelWithLog(opts.model)) return;

    const chain = getChainById(chainId);
    if (!chain) {
      console.error(chalk.red(`Unknown chain: ${chainId}`));
      console.log(chalk.dim(`Available chains: ${listChains().map((c) => c.id).join(", ")}`));
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
const feedbackCmd = program
  .command("feedback")
  .description("View and manage idea quality feedback");

feedbackCmd
  .command("summary")
  .description("Show per-angle quality scores from collected feedback")
  .action(() => {
    const summary = getFeedbackSummary();
    if (summary.totalFeedback === 0) {
      console.log(chalk.dim("No feedback collected yet. Use --rate with auto/innovate to rate ideas."));
      return;
    }
    console.log(chalk.bold(`\n📊 Feedback Summary (${summary.totalFeedback} ratings)\n`));
    for (const score of summary.angleScores) {
      const bar = score.qualityScore >= 0.7 ? chalk.green("■") : score.qualityScore >= 0.4 ? chalk.yellow("■") : chalk.red("■");
      const trendIcon = score.recentTrend === "improving" ? "📈" : score.recentTrend === "declining" ? "📉" : "➡️";
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
  .action((angleId: string, rating: string, opts: { idea: string; comment?: string; session?: string }) => {
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

configCmd
  .command("setup-offline")
  .description("Configure Ollama for offline / local-first innovation")
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
      console.log(`  ${indicator} ${chalk.bold(rec.id.padEnd(20))} [${rec.useCase}] ${rec.description}`);
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

// ---- connections command ----
program
  .command("connections")
  .description("Find serendipitous connections across past investigations")
  .option("--min-similarity <threshold>", "Minimum similarity threshold (0-1)", "0.3")
  .option("--max <count>", "Maximum connections to show", "10")
  .option("-m, --model <model>", "LLM model to use for explanations")
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
      const result = await findSerendipitousConnections(minSim, maxConn, opts.model);
      spinner.succeed(`Found ${result.connections.length} connection(s) across ${result.totalSessionsAnalyzed} sessions\n`);

      if (result.connections.length === 0) {
        console.log(chalk.dim("No serendipitous connections found. Run more investigations to build your knowledge base."));
        return;
      }

      for (const conn of result.connections) {
        console.log(chalk.bold.magenta(`\n🔗 ${stripAnsi(conn.subjectA)} ↔ ${stripAnsi(conn.subjectB)}`));
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
program
  .command("migrate")
  .description("Migrate file-based data (~/.innovator/) into a SQLite database")
  .option("--db <path>", "SQLite database file path", "~/.innovator/innovator.db")
  .action(async (opts: { db: string }) => {
    const { createSQLiteStorage, migrateFileDataToStorage } = await import(
      "@innovator/core"
    );
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
const marketplace = program
  .command("marketplace")
  .description("Plugin marketplace commands");

marketplace
  .command("search [query]")
  .description("Search the plugin marketplace")
  .option("--category <category>", "Filter by category")
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
  .action(async (opts: { name: string; description: string; category: string; source: string; version: string; author: string }) => {
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
  });

// ── radar ────────────────────────────────────────────────────────────
const radar = program
  .command("radar")
  .description("Innovation Radar — watch subjects for landscape changes");

radar
  .command("watch <subject>")
  .description("Add a subject to the innovation radar")
  .option("--frequency <freq>", "Check frequency: daily, weekly, monthly", "weekly")
  .option("--webhook <url>", "Webhook URL for alerts")
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
  .action(async () => {
    const { listWatches } = await import("@innovator/core");
    const watches = listWatches();
    if (watches.length === 0) {
      console.log(chalk.yellow("No watches configured."));
      return;
    }
    for (const w of watches) {
      const status = w.enabled ? chalk.green("●") : chalk.red("●");
      console.log(`  ${status} ${chalk.bold(w.subject)} — ${w.frequency} | Next: ${w.nextRunAt.split("T")[0]}`);
    }
  });

// ── scaffold ─────────────────────────────────────────────────────────
program
  .command("scaffold")
  .description("Generate implementation scaffolding from an idea")
  .requiredOption("--title <title>", "Idea title")
  .requiredOption("--description <desc>", "Idea description")
  .option("--impact <impact>", "Potential impact", "High impact innovation")
  .option("--stack <stack>", "Tech stack: typescript, python, go, rust", "typescript")
  .option("--name <name>", "Project name")
  .action(async (opts: { title: string; description: string; impact: string; stack: string; name?: string }) => {
    const { generateScaffold, scaffoldToMarkdown } = await import("@innovator/core");
    const scaffold = generateScaffold({
      idea: { title: opts.title, description: opts.description, potentialImpact: opts.impact, implementationHint: "" },
      stack: opts.stack as "typescript" | "python" | "go" | "rust",
      projectName: opts.name,
    });
    console.log(scaffoldToMarkdown(scaffold));
  });

// ── telemetry ────────────────────────────────────────────────────────
program
  .command("telemetry")
  .description("View innovation pipeline telemetry and metrics")
  .action(async () => {
    const { buildTelemetryDashboard, getSpans, getQualityTrends } = await import("@innovator/core");
    const dashboard = buildTelemetryDashboard();

    console.log(chalk.bold.blue("\n📊 INNOVATION TELEMETRY\n"));
    console.log(`  Pipelines run: ${dashboard.totalPipelines}`);
    console.log(`  Total spans:   ${dashboard.totalSpans}`);
    console.log(`  Quality trend: ${dashboard.qualityTrend.trend}\n`);

    if (Object.keys(dashboard.stageMetrics).length > 0) {
      console.log(chalk.bold("  Stage Metrics:"));
      console.log(chalk.dim("  " + "Stage".padEnd(20) + "Count".padEnd(8) + "Avg Duration".padEnd(15) + "Tokens".padEnd(10) + "Cost".padEnd(10) + "Success"));
      console.log(chalk.dim("  " + "─".repeat(75)));
      for (const [stage, m] of Object.entries(dashboard.stageMetrics)) {
        console.log(`  ${stage.padEnd(20)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${String(m.totalTokens).padEnd(10)}$${m.totalCostUsd.toFixed(4).padEnd(9)}${(m.successRate * 100).toFixed(0)}%`);
      }
      console.log();
    }

    if (Object.keys(dashboard.angleMetrics).length > 0) {
      console.log(chalk.bold("  Angle Performance:"));
      console.log(chalk.dim("  " + "Angle".padEnd(25) + "Count".padEnd(8) + "Avg Duration".padEnd(15) + "Avg Ideas"));
      console.log(chalk.dim("  " + "─".repeat(55)));
      for (const [angle, m] of Object.entries(dashboard.angleMetrics)) {
        console.log(`  ${angle.padEnd(25)}${String(m.count).padEnd(8)}${(m.avgDurationMs + "ms").padEnd(15)}${m.avgIdeaCount}`);
      }
      console.log();
    }

    if (dashboard.recentSpans.length > 0) {
      console.log(chalk.bold("  Recent Spans (last 10):"));
      for (const span of dashboard.recentSpans.slice(-10)) {
        const statusIcon = span.status === "ok" ? chalk.green("✓") : span.status === "error" ? chalk.red("✗") : chalk.yellow("⋯");
        const dur = span.durationMs ? `${span.durationMs}ms` : "in progress";
        console.log(`  ${statusIcon} ${span.operationName.padEnd(30)} ${dur}`);
      }
    }

    if (dashboard.totalPipelines === 0 && dashboard.totalSpans === 0) {
      console.log(chalk.dim("  No telemetry data yet. Run some pipelines first.\n"));
    }
  });

// ── context (RAG) ───────────────────────────────────────────────────
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
  .action(async (opts: { type: string; name: string; repo?: string; path?: string; url?: string; space?: string; token?: string }) => {
    const { registerConnector, ConnectorTypeSchema } = await import("@innovator/core");
    const typeParse = ConnectorTypeSchema.safeParse(opts.type);
    if (!typeParse.success) {
      console.error(chalk.red(`Invalid connector type: ${opts.type}. Use: github, confluence, notion, local-file`));
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
      config,
    });
    console.log(chalk.green(`✓ Registered connector: ${opts.name} (${id})`));
  });

contextCmd
  .command("list")
  .description("List registered knowledge source connectors")
  .action(async () => {
    const { listConnectors } = await import("@innovator/core");
    const connectors = listConnectors();
    if (connectors.length === 0) {
      console.log(chalk.dim("No connectors registered. Use `innovator context add` to add one."));
      return;
    }
    console.log(chalk.bold.blue("\n📚 Knowledge Source Connectors\n"));
    for (const c of connectors) {
      const statusIcon = c.status.status === "connected" ? chalk.green("●") : c.status.status === "error" ? chalk.red("●") : chalk.yellow("●");
      console.log(`  ${statusIcon} ${chalk.bold(c.name)} (${c.type}) — ${c.status.documentsIndexed} docs indexed`);
      if (c.status.lastError) console.log(chalk.red(`    Error: ${c.status.lastError}`));
    }
    console.log();
  });

contextCmd
  .command("sync <id>")
  .description("Sync a connector to fetch latest documents")
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
const webhooksCmd = program
  .command("webhooks")
  .description("Manage webhook registrations for innovation events");

webhooksCmd
  .command("templates")
  .description("List available webhook templates")
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
const monitorCmd = program
  .command("monitor")
  .description("Competitive intelligence monitoring");

monitorCmd
  .command("create")
  .description("Create a competitive monitor")
  .requiredOption("--domain <domain>", "Domain to monitor (e.g., 'AI code generation')")
  .option("--competitors <list>", "Comma-separated competitor names")
  .option("--keywords <list>", "Comma-separated keywords")
  .option("--frequency <freq>", "Monitoring frequency: hourly, daily, weekly", "daily")
  .action(async (opts: { domain: string; competitors?: string; keywords?: string; frequency?: string }) => {
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
  });

monitorCmd
  .command("list")
  .description("List active monitors")
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
      console.log(`    Frequency: ${m.frequency} | Next run: ${m.nextRunAt?.split("T")[0] ?? "N/A"}\n`);
    }
  });

monitorCmd
  .command("signals")
  .description("View detected competitive signals")
  .option("--domain <domain>", "Filter by domain")
  .option("--limit <n>", "Maximum signals to show", "20")
  .action(async (opts: { domain?: string; limit?: string }) => {
    const { getSignals, detectTrends, generateInvestigationSuggestions } = await import("@innovator/core");
    const limit = parseInt(opts.limit ?? "20", 10);
    const signals = getSignals({ domain: opts.domain, limit });

    if (signals.length === 0) {
      console.log(chalk.dim("No signals detected yet."));
      return;
    }

    console.log(chalk.bold.blue("\n📡 Competitive Signals\n"));
    for (const s of signals) {
      const relColor = s.relevanceScore >= 0.7 ? chalk.green : s.relevanceScore >= 0.4 ? chalk.yellow : chalk.dim;
      console.log(`  ${relColor("●")} ${chalk.bold(s.title)} [${s.signalType}]`);
      console.log(`    ${chalk.dim(s.description.slice(0, 100))}${s.description.length > 100 ? "..." : ""}`);
      console.log(`    Source: ${s.source} | Relevance: ${Math.round(s.relevanceScore * 100)}% | ${s.detectedAt.split("T")[0]}\n`);
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
program
  .command("provenance")
  .description("View provenance and citation chain for ideas")
  .argument("<session-id>", "Session ID to show provenance for")
  .option("--format <format>", "Output format: text, markdown, json-ld", "text")
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
      model: session.model,
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
program
  .command("wargame")
  .description("Run competitive wargaming simulation on an idea")
  .argument("<subject>", "Innovation subject")
  .requiredOption("--idea <title>", "Idea title to wargame")
  .requiredOption("--description <desc>", "Idea description")
  .option("-m, --model <model>", "LLM model to use")
  .option("--rounds <n>", "Number of wargaming rounds (1-5)", "3")
  .option("--markdown", "Output as Markdown")
  .action(async (subject: string, opts: { idea: string; description: string; model?: string; rounds?: string; markdown?: boolean }) => {
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
        console.log(`  Resilience Score: ${chalk.bold(String(result.overallResilienceScore))}/100`);
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
  });

// ---- Rubric Commands ----
const rubricCmd = program.command("rubric").description("Manage custom scoring rubrics");

rubricCmd
  .command("list")
  .description("List available scoring rubrics")
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
program
  .command("cost-report")
  .description("Generate LLM cost-performance report")
  .option("--markdown", "Output as Markdown")
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
          console.log(`    ${r.stage}: ${chalk.cyan(r.recommendedModel)} (quality: ${r.expectedQuality.toFixed(2)})`);
        }
      }
    }
  });

// ---- Supply Chain Command ----
program
  .command("supply-chain")
  .description("Map innovation supply chain for an idea")
  .argument("<subject>", "Innovation subject")
  .requiredOption("--idea <title>", "Idea title")
  .requiredOption("--description <desc>", "Idea description")
  .option("-m, --model <model>", "LLM model to use")
  .option("--markdown", "Output as Markdown")
  .action(async (subject: string, opts: { idea: string; description: string; model?: string; markdown?: boolean }) => {
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
        console.log(`  Build: ${result.buildItems} | Buy: ${result.buyItems} | Partner: ${result.partnerItems}`);
        console.log(`  Gaps: ${result.gaps.length}\n`);
        console.log(chalk.dim(result.summary));
      }
    } catch (err) {
      spinner.fail("Supply chain mapping failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

// ---- Timing Command ----
program
  .command("timing")
  .description("Analyze optimal execution timing for ideas")
  .argument("<subject>", "Innovation subject")
  .option("-m, --model <model>", "LLM model to use")
  .option("--markdown", "Output as Markdown")
  .action(async (subject: string, opts: { model?: string; markdown?: boolean }) => {
    if (!validateSubjectWithLog(subject)) return;
    if (opts.model && !validateModelWithLog(opts.model)) return;
    console.log(chalk.dim("Note: Provide ideas via --idea flags or pipe from auto command."));
    console.log(chalk.dim("Example: innovator timing 'AI in healthcare' --idea 'AI Diagnostics::AI-powered diagnostic tool'\n"));
    const spinner = ora("Analyzing timing signals...").start();
    try {
      const result = await analyzeTimings(subject, [{ title: subject, description: subject }], opts.model);
      spinner.stop();
      if (opts.markdown) {
        console.log(timingToMarkdown(result));
      } else {
        console.log(chalk.bold(`\n⏰ Timing Analysis: ${result.subject}\n`));
        console.log(`  Market Maturity: ${result.marketMaturityStage}`);
        for (const idea of result.ideas) {
          const emoji = idea.classification === "right-time" ? "✅" : idea.classification === "peak-window" ? "🔥" : idea.classification === "too-early" ? "🕐" : "⚠️";
          console.log(`  ${emoji} ${idea.ideaTitle}: ${idea.classification} (urgency: ${idea.urgencyScore}/100)`);
        }
        console.log(`\n${chalk.dim(result.overallTimingAdvice)}`);
      }
    } catch (err) {
      spinner.fail("Timing analysis failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });

program.parse();
